import React, { useCallback, useEffect, useState } from 'react';
import { FileText, KeyRound, Pencil, Plus, Power, Search, Send, Trash2, Copy, Check, Link } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import EmployeeDialog from '@/components/EmployeeDialog';
import EmployeeDocumentsDialog from '@/components/EmployeeDocumentsDialog';
import EmployeeLoginDialog from '@/components/EmployeeLoginDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { usePermissions } from '@/lib/permissions';
import { money, visaLabel } from '@/lib/bh';
import { checklistFor } from '@/lib/onboardingDocs';
import { base44 } from '@/api/base44Client';
import { logActivity } from '@/lib/activityLogger';

export default function Employees() {
  const { t, lang } = useI18n();
  const { activeBranch, company, me, scopeOf } = useWorkspace();
  const { canEdit } = usePermissions();
  // A position with "own records only" reaches its own profile and nothing else.
  const selfOnly = scopeOf('employees') === 'self';
  const canManage = canEdit('employees');
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [docsFor, setDocsFor] = useState(null);
  const [loginFor, setLoginFor] = useState(null);

  // 온보딩 링크 복사 및 즉시 발송 상태 관리
  const [copyingId, setCopyingId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [sendingId, setSendingId] = useState(null);

  const load = useCallback(async () => {
    if (!activeBranch) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const query = { branch_id: activeBranch.id };
    if (selfOnly) query.user_email = (me && me.email) || '__none__';
    const term = search.trim();
    if (term) {
      query.$or = [
        { full_name: { $regex: term, $options: 'i' } },
        { employee_number: { $regex: term, $options: 'i' } }
      ];
    }
    const page = await base44.entities.EmployeeProfile.filter(query, { sort: '-created_date', limit: 100 });
    // 슈퍼어드민(sym910403@gmail.com)은 플랫폼 총괄 관리자이므로 각 지점의 직원 목록에서 완전히 제외합니다.
    const allItems = page.items || [];
    const staffOnly = allItems.filter((item) => {
      const email = String(item.user_email || '').trim().toLowerCase();
      return email !== 'sym910403@gmail.com' && item.app_role !== 'super_admin';
    });
    setRows(staffOnly);
    setLoading(false);
  }, [activeBranch, search, selfOnly, me]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setDialogOpen(true);
  };

  const toggleActive = async (row) => {
    const nextStatus = row.status === 'inactive' ? 'active' : 'inactive';
    await base44.entities.EmployeeProfile.update(row.id, {
      status: nextStatus
    });
    toast({ title: t('common.save') });

    // 직원 활성/비활성 상태 변경 로그 기록
    logActivity({
      module: 'employees',
      action: 'update',
      summary: `${row.full_name} 직원의 상태 변경 (${row.status || 'active'} -> ${nextStatus})`,
      details: {
        before: { status: row.status || 'active' },
        after: { status: nextStatus }
      },
      targetId: row.id,
      targetName: row.full_name,
      branchId: activeBranch?.id
    });

    load();
  };

  // Deleting the profile is also what takes the app away from that account, so the server
  // closes the employee record and the account access together.
  const removeEmployee = async (row) => {
    if (!window.confirm(t('employees.deleteConfirm'))) return;
    const response = await base44.functions.invoke('manageEmployee', { action: 'delete', employee_id: row.id });
    const data = response.data || {};
    if (data.error) {
      toast({ title: data.error, variant: 'destructive' });
      return;
    }
    toast({
      title: t('employees.deleted'),
      description: data.kept ? t('employees.accessKept') : t('employees.accessBlocked')
    });

    // 직원 삭제 로그 기록
    logActivity({
      module: 'employees',
      action: 'delete',
      summary: `${row.full_name} (${row.user_email}) 직원 삭제 처리`,
      details: {
        before: {
          full_name: row.full_name,
          user_email: row.user_email,
          position: row.position,
          hourly_rate: row.hourly_rate
        }
      },
      targetId: row.id,
      targetName: row.full_name,
      branchId: activeBranch?.id
    });

    load();
  };

  // 테이블에서 원클릭으로 온보딩 링크 복사
  const copyRowOnboardingLink = async (row) => {
    let token = row.onboarding_token;
    let link = token ? `${window.location.origin}/onboarding/${token}` : '';
    if (!link) {
      setCopyingId(row.id);
      try {
        const res = await base44.functions.invoke('manageEmployee', {
          action: 'send_onboarding_email',
          employee_id: row.id,
          origin: window.location.origin,
          send_onboarding_email: false
        });
        if (res.data?.onboarding_link) {
          link = res.data.onboarding_link;
          if (res.data.onboarding_token) {
            row.onboarding_token = res.data.onboarding_token;
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setCopyingId(null);
      }
    }
    if (link) {
      await navigator.clipboard.writeText(link);
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 2500);
      toast({
        title: '온보딩 링크 복사 완료',
        description: `${row.full_name} 님의 온보딩 링크가 클립보드에 복사되었습니다.`
      });
    } else {
      toast({ variant: 'destructive', title: '온보딩 링크 생성 실패' });
    }
  };

  // 테이블에서 원클릭으로 온보딩 안내 이메일 재발송
  const sendRowOnboardingEmail = async (row) => {
    setSendingId(row.id);
    try {
      const res = await base44.functions.invoke('manageEmployee', {
        action: 'send_onboarding_email',
        employee_id: row.id,
        origin: window.location.origin,
        send_onboarding_email: true
      });
      const data = res.data || {};
      if (data.email_sent) {
        toast({
          title: '온보딩 링크 발송 완료',
          description: `${row.user_email} (으)로 온보딩 안내 메일이 발송되었습니다.`
        });
        load();
      } else if (data.email_error) {
        toast({
          variant: 'destructive',
          title: '이메일 발송 실패',
          description: data.email_error
        });
      } else {
        toast({ title: '온보딩 메일 발송 처리 완료' });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: '온보딩 메일 발송 오류가 발생했습니다.' });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('employees.title')}
        subtitle={activeBranch ? activeBranch.name : t('employees.subtitle')}
        actions={
          <Button onClick={openCreate} disabled={!activeBranch || !canManage}>
            <Plus className="mr-2 h-4 w-4" /> {t('employees.add')}
          </Button>
        } />

      <Card>
        <CardContent className="p-4">
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.search')}
              className="pl-9" />
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('common.none')}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.name')}</TableHead>
                    <TableHead>{t('employees.number')}</TableHead>
                    <TableHead>{t('common.position')}</TableHead>
                    <TableHead>{t('employees.onboarding')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={
                        row.status === 'inactive'
                          ? 'bg-destructive/5 text-destructive hover:bg-destructive/5'
                          : ''
                      }>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{row.full_name}</p>
                          {row.status === 'inactive' && (
                            <Badge variant="secondary">{t('employees.inactive')}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{row.user_email}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.employee_number || '—'}</TableCell>
                      <TableCell>
                        <span>{row.position || '—'}</span>
                        {row.secondary_position ? (
                          <span className="ml-1 text-xs text-muted-foreground">+ {row.secondary_position}</span>
                        ) : null}
                      </TableCell>
                      
                      <TableCell>
                        {row.onboarding_status === 'completed' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                            {t('employees.completed')}
                          </Badge>
                        ) : row.onboarding_status === 'in_progress' ? (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                            {t('employees.statusInProgress')}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{t('employees.pending')}</Badge>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('ob.docsProgress')
                            .replace('{done}', String(checklistFor(row, company, lang).requiredDone))
                            .replace('{total}', String(checklistFor(row, company, lang).requiredTotal))}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(row)} disabled={!canManage} title={t('common.edit')}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDocsFor(row)}
                            title={t('employees.vault')}>
                            <FileText className="h-3.5 w-3.5" />
                            <span className="ml-1 text-xs">{(row.docs || []).length}</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={row.password_set ? t('employees.passwordOn') : t('employees.loginAccess')}
                            onClick={() => setLoginFor(row)}
                            disabled={!canManage}
                            className={row.password_set ? 'text-emerald-600' : ''}>
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                          
                          {/* 온보딩 미완료인 경우: 원클릭 링크 복사 및 이메일 재발송 버튼 */}
                          {row.onboarding_status !== 'completed' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="온보딩 링크 복사 (카카오톡/문자용)"
                                disabled={copyingId === row.id}
                                onClick={() => copyRowOnboardingLink(row)}>
                                {copiedId === row.id ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5 text-blue-600" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="온보딩 안내 이메일 지금 발송"
                                disabled={sendingId === row.id}
                                onClick={() => sendRowOnboardingEmail(row)}>
                                <Send className={`h-3.5 w-3.5 ${sendingId === row.id ? 'animate-pulse text-amber-500' : 'text-blue-600'}`} />
                              </Button>
                            </>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            title={row.status === 'inactive' ? t('employees.activate') : t('employees.deactivate')}
                            disabled={!canManage}
                            onClick={() => toggleActive(row)}>
                            <Power className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={t('employees.delete')}
                            disabled={!canManage}
                            onClick={() => removeEmployee(row)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EmployeeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        branch={activeBranch}
        employee={editing}
        onSaved={load} />
      
      <EmployeeDocumentsDialog
        open={Boolean(docsFor)}
        onOpenChange={(v) => !v && setDocsFor(null)}
        employee={docsFor} />

      <EmployeeLoginDialog
        open={Boolean(loginFor)}
        onOpenChange={(v) => !v && setLoginFor(null)}
        employee={loginFor}
        onSaved={load} />
      
    </div>
  );
}
