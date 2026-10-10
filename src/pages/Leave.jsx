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

// Leave, from both sides: a person sees what they have and asks for more, a manager sees who
// is waiting, what everyone holds, and the settings behind it.
export default function Leave() {
  const { t, lang } = useI18n();
  const { activeBranch, isManager, isPlatformAdmin, company } = useWorkspace();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // A manager opens this screen to answer what is waiting, so the requests show first.
  const [tab, setTab] = useState('approvals');
  const [requestOpen, setRequestOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The platform owner moves a store onto KWorkMate with the leave balances it already has.
  const [adminOpen, setAdminOpen] = useState(false);

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
  // What the company offers right now, and everything it has ever set up: a leave switched
  // off stays in the settings list so it can simply be switched back on.
  const types = (data && data.types) || [];
  const allTypes = (data && data.all_types) || types;
  // The hours at which a leave is called out in red: the manager sets, per leave type, the
  // balance worth a look. It follows what the person holds, never the length of a request.
  const flagHours = types.reduce((map, type) => {
    const hours = Number(type.flag_hours) || 0;
    if (hours > 0) map[type.key] = hours;
    return map;
  }, {});
  const flaggedHours = (email, typeKey) => {
    const limit = flagHours[typeKey];
    if (!limit) return 0;
    const row = balances.find(
      (balance) => balance.employee_email === email && balance.leave_type_key === typeKey
    );
    return row && Number(row.available_hours) >= limit ? limit : 0;
  };

  const teamRows = Array.from(
    balances.reduce((map, row) => {
      const current = map.get(row.employee_email) || { email: row.employee_email, name: row.employee_name, cells: {} };
      current.cells[row.leave_type_key] = row.available_hours;
      map.set(row.employee_email, current);
      return map;
    }, new Map()).values()
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
            {data && data.can_configure ? (
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
                                {row.name}
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