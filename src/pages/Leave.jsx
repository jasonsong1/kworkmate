import React, { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, Flag, Loader2, Settings2, Wallet } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import LeaveBalanceCard from '@/components/leave/LeaveBalanceCard';
import LeaveRequestDialog from '@/components/leave/LeaveRequestDialog';
import LeaveRequestsTable from '@/components/leave/LeaveRequestsTable';
import LeaveTypeSettingsDialog from '@/components/leave/LeaveTypeSettingsDialog';
import LeaveBalancesAdminDialog from '@/components/leave/LeaveBalancesAdminDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { hoursLabel, joinTypes, typeName } from '@/lib/leave';
import { base44 } from '@/api/base44Client';

// 휴가 관리 페이지 컴포넌트:
// 일반 직원은 본인의 휴가 잔액 확인 및 신청을 진행하고,
// 관리자(슈퍼어드민/회사관리자/지점매니저)는 대기 중인 승인 요청과 지점 소속 직원들의 휴가 잔액 목록을 조회하고 관리합니다.
export default function Leave() {
  const { t, lang } = useI18n();
  const { activeBranch, isManager, isPlatformAdmin, company, presetKey, employeeProfile } = useWorkspace();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // 관리자는 결재 대기 요청을 먼저 확인할 수 있도록 'approvals' 탭을 기본값으로 엽니다.
  const [tab, setTab] = useState('approvals');
  const [requestOpen, setRequestOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 플랫폼 관리자(슈퍼어드민)가 직원의 기존 누적 휴가 잔액을 일괄 설정할 수 있는 다이얼로그
  const [adminOpen, setAdminOpen] = useState(false);

  // 휴가 설정 권한: 슈퍼바이저(Supervisor floor 등)를 엄격히 제외하고, 매니저(manager), pro director, 플랫폼 관리자만 접근 가능
  const isSupervisor = String(presetKey || '').toLowerCase().includes('supervisor');
  const isManagerOrDirector =
    isPlatformAdmin ||
    ['manager', 'pro_director', 'director'].includes(String(presetKey || '').toLowerCase()) ||
    ['오너', 'owner', '대표', 'director'].includes(String(employeeProfile?.employment_type || '').toLowerCase());
  const canConfigureLeave = Boolean(data && data.can_configure) && isManagerOrDirector && !isSupervisor;

  const load = useCallback(async () => {
    if (!activeBranch) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const response = await base44.functions
      .invoke('leaveSummary', { branch_id: activeBranch.id, team: isManager })
      .catch(() => null);
    setData((response && response.data && !response.data.error && response.data) || null);
    setLoading(false);
  }, [activeBranch, isManager]);

  useEffect(() => {
    load();
  }, [load]);

  const balances = joinTypes(data && data.balances, data && data.types);
  const requests = (data && data.requests) || [];
  const pending = requests.filter((item) => item.status === 'pending');
  // 회사가 현재 활성화한 휴가 종류 및 설정된 전체 휴가 종류
  const types = (data && data.types) || [];
  const allTypes = (data && data.all_types) || types;

  // 관리자가 지정한 초과 경고 기준 시간(flag_hours)을 초과한 잔액이 있는지 확인
  const flagHours = types.reduce((map, type) => {
    const hours = Number(type.flag_hours) || 0;
    if (hours > 0) map[type.key] = hours;
    return map;
  }, {});

  const flaggedHours = (email, typeKey) => {
    const limit = flagHours[typeKey];
    if (!limit) return 0;
    const row = balances.find(
      (balance) =>
        String(balance.employee_email || '').toLowerCase() === String(email || '').toLowerCase() &&
        balance.leave_type_key === typeKey
    );
    return row && Number(row.available_hours) >= limit ? limit : 0;
  };

  // [직원별 잔액 목록 생성]:
  // 1. 슈퍼어드민(sym910403@gmail.com)은 지점 일반 직원이 아니므로 목록에서 완전히 제외합니다.
  // 2. data.staff(지점 소속 6명의 직원 목록)를 기준으로 행을 생성하여 잔액 생성 전인 직원도 누락 없이 표시합니다.
  const staffList = (data && data.staff) || [];
  const filteredStaff = staffList.filter(
    (person) =>
      String(person.email || '').toLowerCase() !== 'sym910403@gmail.com' &&
      person.app_role !== 'super_admin'
  );

  const teamRows =
    filteredStaff.length > 0
      ? filteredStaff.map((person) => {
          const cells = {};
          types.forEach((type) => {
            const row = balances.find(
              (b) =>
                String(b.employee_email || '').toLowerCase() === String(person.email || '').toLowerCase() &&
                b.leave_type_key === type.key
            );
            if (row) {
              cells[type.key] = row.available_hours;
            }
          });
          return {
            email: person.email,
            name: person.name,
            employee_number: person.employee_number,
            cells
          };
        })
      : Array.from(
          balances
            .filter(
              (row) =>
                String(row.employee_email || '').toLowerCase() !== 'sym910403@gmail.com'
            )
            .reduce((map, row) => {
              const current = map.get(row.employee_email) || {
                email: row.employee_email,
                name: row.employee_name,
                cells: {}
              };
              current.cells[row.leave_type_key] = row.available_hours;
              map.set(row.employee_email, current);
              return map;
            }, new Map())
            .values()
        );

  return (
    <div>
      <PageHeader
        title={t('leave.title')}
        subtitle={activeBranch ? activeBranch.name : t('leave.subtitle')}
        actions={
          <>
            {isPlatformAdmin ? (
              <Button variant="outline" onClick={() => setAdminOpen(true)} disabled={!company}>
                <Wallet className="mr-2 h-4 w-4" /> {t('leave.adminBalances')}
              </Button>
            ) : null}
            {canConfigureLeave ? (
              <Button variant="outline" onClick={() => setSettingsOpen(true)} disabled={allTypes.length === 0}>
                <Settings2 className="mr-2 h-4 w-4" /> {t('leave.settings')}
              </Button>
            ) : null}
            <Button onClick={() => setRequestOpen(true)} disabled={!activeBranch || types.length === 0}>
              <CalendarPlus className="mr-2 h-4 w-4" /> {t('leave.request')}
            </Button>
          </>
        }
      />

      {loading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          {t('common.loading')}
        </p>
      ) : (
        <div className="space-y-6">
          {isManager ? (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="approvals">
                  {t('leave.approvals')}
                  {pending.length > 0 ? (
                    <Badge className="ml-2 bg-amber-100 text-amber-800 hover:bg-amber-100">{pending.length}</Badge>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="balances">{t('leave.teamBalances')}</TabsTrigger>
              </TabsList>

              <TabsContent value="approvals" className="mt-4">
                <Card>
                  <CardContent className="p-4">
                    <LeaveRequestsTable
                      requests={requests}
                      canManage
                      showEmployee
                      flagBalance={flaggedHours}
                      onDecided={load}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="balances" className="mt-4">
                <Card>
                  <CardContent className="overflow-x-auto p-4">
                    {teamRows.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">{t('leave.balanceEmpty')}</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('common.employee')}</TableHead>
                            {types.map((type) => (
                              <TableHead key={type.key} className="text-right">
                                {typeName(type, lang)}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {teamRows.map((row) => (
                            <TableRow key={row.email}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <span>{row.name}</span>
                                  {row.employee_number ? (
                                    <Badge variant="outline" className="text-[11px] font-normal">
                                      {row.employee_number}
                                    </Badge>
                                  ) : null}
                                </div>
                                <span className="block text-xs font-normal text-muted-foreground">{row.email}</span>
                              </TableCell>
                              {types.map((type) => {
                                const limit = flaggedHours(row.email, type.key);
                                return (
                                  <TableCell key={type.key} className="text-right text-sm">
                                    {type.key in row.cells ? (
                                      limit ? (
                                        <span
                                          className="inline-flex items-center gap-1 font-medium text-destructive"
                                          title={t('leave.flagged').replace('{hours}', String(limit))}
                                        >
                                          <Flag className="h-3.5 w-3.5" />
                                          {hoursLabel(row.cells[type.key])}
                                        </span>
                                      ) : (
                                        hoursLabel(row.cells[type.key])
                                      )
                                    ) : (
                                      '—'
                                    )}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {balances.map((balance) => (
                  <LeaveBalanceCard key={balance.id || balance.leave_type_key} balance={balance} />
                ))}
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('leave.myRequests')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <LeaveRequestsTable requests={requests} canManage={false} showEmployee={false} onDecided={load} />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      <LeaveRequestDialog open={requestOpen} onOpenChange={setRequestOpen} types={types} onSubmitted={load} />
      <LeaveTypeSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        companyId={data && data.company_id}
        types={allTypes}
        onSaved={load}
      />
      {isPlatformAdmin ? (
        <LeaveBalancesAdminDialog
          open={adminOpen}
          onOpenChange={setAdminOpen}
          companyId={company ? company.id : ''}
          companyName={company ? company.name : ''}
          onSaved={load}
        />
      ) : null}
    </div>
  );
}