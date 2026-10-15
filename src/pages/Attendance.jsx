import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileBarChart, Loader2, MapPin, QrCode, XCircle, Plus, Pencil, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ApprovalActions from '@/components/attendance/ApprovalActions';
import AttendanceReportDialog from '@/components/attendance/AttendanceReportDialog';
import TimeEntryDialog from '@/components/attendance/TimeEntryDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { usePermissions } from '@/lib/permissions';
import { todayIso } from '@/lib/bh';
import { dayRangeForState, formatTimeInZone, stateFromBranch } from '@/lib/holidays';
import { kioskUrl, todayFor } from '@/lib/kioskLink';
import { base44 } from '@/api/base44Client';

const ALL = 'all';

export default function Attendance() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { activeBranch, me, scopeOf, employeeProfile, presetKey } = useWorkspace();
  const { canEdit, isCompanyAdmin, isPlatformAdmin } = usePermissions();

  // 근태 관리 권한 (출퇴근 수정, 추가, 삭제 가능 여부)
  const canManageAttendance = canEdit('attendance') || presetKey === 'pro_director' || isCompanyAdmin || isPlatformAdmin;

  // "Own records only" is a data-range rule the person's position preset carries: a manager
  // sees the branch, a floor position sees nothing but itself.
  const selfOnly = scopeOf('attendance') === 'self';
  // Every punch is read on the clock of the store it belongs to, whatever zone the viewer is in.
  const branchState = stateFromBranch(activeBranch);
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(todayIso());
  const [employeeFilter, setEmployeeFilter] = useState(ALL);
  const [employees, setEmployees] = useState([]);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ count: 0, minutes: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);

  // 근태 추가 및 수정 다이얼로그 상태
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    setEmployeeFilter(ALL);
    if (!activeBranch || selfOnly) {
      setEmployees([]);
      return undefined;
    }
    let cancelled = false;
    base44.entities.EmployeeProfile.
    filter({ branch_id: activeBranch.id }, { sort: 'full_name', limit: 200 }).
    then((page) => {
      if (!cancelled) setEmployees((page.items || []).filter((person) => person.user_email));
    }).
    catch(() => {
      if (!cancelled) setEmployees([]);
    });
    return () => {
      cancelled = true;
    };
  }, [activeBranch]);

  const load = useCallback(async () => {
    if (!activeBranch) {
      setLoading(false);
      return;
    }
    setLoading(true);
    // The screen reads a range of days. Picking the two dates the wrong way round still shows the
    // days that were meant instead of an empty table.
    const [start, end] = fromDate <= toDate ? [fromDate, toDate] : [toDate, fromDate];
    const query = {
      branch_id: activeBranch.id,
      clock_in_at: {
        $gte: dayRangeForState(start, branchState).from,
        $lte: dayRangeForState(end, branchState).to
      }
    };
    if (selfOnly) query.employee_email = (me && me.email) || '__none__';
    else if (employeeFilter !== ALL) query.employee_email = employeeFilter;
    const [list, grouped] = await Promise.all([
    base44.entities.TimeEntry.filter(query, { sort: '-clock_in_at', limit: 200 }).then((page) => page.items || []),
    base44.entities.TimeEntry.
    aggregate({ query, groupBy: 'approval_status', sum: 'minutes' }).
    catch(() => ({ rows: [] }))]
    );
    setRows(list);
    const buckets = grouped.rows || [];
    setStats({
      count: buckets.reduce((sum, bucket) => sum + (bucket.count || 0), 0),
      // Only what a manager has accepted counts as worked time.
      minutes: buckets.
      filter((bucket) => bucket.approval_status !== 'pending' && bucket.approval_status !== 'rejected').
      reduce((sum, bucket) => sum + (bucket.sum_minutes || 0), 0),
      pending: (buckets.find((bucket) => bucket.approval_status === 'pending') || {}).count || 0
    });
    setLoading(false);
  }, [activeBranch, branchState, fromDate, toDate, employeeFilter, selfOnly, me]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (row, status, reason) => {
    await base44.entities.TimeEntry.update(row.id, {
      approval_status: status,
      approved_by_email: me ? me.email : '',
      approved_at: new Date().toISOString(),
      rejection_reason: status === 'rejected' ? reason || '' : ''
    });
    await load();
  };

  // 근태 기록 삭제 함수
  const handleDeleteEntry = async (row) => {
    const empName = row.employee_name || row.employee_email;
    if (!window.confirm(`${empName}의 출퇴근 근태기록을 정말 삭제하시겠습니까?`)) {
      return;
    }
    setDeletingId(row.id);
    try {
      await base44.entities.TimeEntry.delete(row.id);
      toast({ title: '근태기록이 성공적으로 삭제되었습니다.' });
      await load();
    } catch (err) {
      console.error('[Attendance] delete error:', err);
      toast({ variant: 'destructive', title: '삭제 실패: ' + (err.message || '') });
    } finally {
      setDeletingId(null);
    }
  };

  const hours = Math.floor(stats.minutes / 60);
  const minutes = stats.minutes % 60;

  // A day's pay is the hours on the record times the person's own hourly rate, so the wage is
  // there the moment they clock out. A record with no rate set — or one nobody has clocked out
  // of yet — simply shows nothing.
  const rateOf = (email) => {
    const person =
      employees.find((item) => item.user_email === email) ||
      (employeeProfile && employeeProfile.user_email === email ? employeeProfile : null);
    const rate = person ? Number(person.hourly_rate) : 0;
    return Number.isFinite(rate) && rate > 0 ? rate : 0;
  };
  const wageOf = (row) => {
    const rate = rateOf(row.employee_email);
    return row.minutes && rate ? (row.minutes / 60) * rate : 0;
  };
  const money = (value) => `$${value.toFixed(2)}`;
  // A turned-down punch is not paid, so it stays out of the total.
  const wageTotal = rows.reduce((sum, row) => (row.approval_status === 'rejected' ? sum : sum + wageOf(row)), 0);

  return (
    <div>
      <PageHeader
        title={t('attendance.title')}
        subtitle={activeBranch ? activeBranch.name : t('attendance.subtitle')}
        actions={
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="flex-1 sm:w-36 h-9 text-xs"
              />
              <span className="text-muted-foreground text-xs shrink-0">→</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="flex-1 sm:w-36 h-9 text-xs"
              />
            </div>
            {!selfOnly && (
              <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                <SelectTrigger className="w-full sm:w-44 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t('common.all')}</SelectItem>
                  {employees.map((person) => (
                    <SelectItem key={person.id} value={person.user_email}>
                      {person.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-2">
              {canManageAttendance && (
                <Button
                  size="sm"
                  className="flex-1 sm:flex-none h-9 text-xs gap-1.5 bg-primary text-primary-foreground font-semibold shadow-sm"
                  onClick={() => {
                    setSelectedEntry(null);
                    setEntryDialogOpen(true);
                  }}
                  disabled={!activeBranch}
                >
                  <Plus className="h-3.5 w-3.5" />
                  기록 추가
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none h-9 text-xs"
                onClick={() => window.open(kioskUrl(activeBranch.id, todayFor(activeBranch)), '_blank', 'noopener')}
                disabled={!activeBranch || !canEdit('attendance')}
              >
                <QrCode className="mr-1.5 h-3.5 w-3.5" /> {t('attendance.qrButton')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-none h-9 text-xs"
                onClick={() => setReportOpen(true)}
                disabled={!activeBranch}
              >
                <FileBarChart className="mr-1.5 h-3.5 w-3.5" /> {t('attendance.report')}
              </Button>
            </div>
          </div>
        } />
      

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Records</p>
            <p className="text-2xl font-semibold">{stats.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Total worked</p>
            <p className="text-2xl font-semibold">
              {hours}h {minutes}m
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('attendance.wage')}: {money(wageTotal)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">{t('attendance.pending')}</p>
            <p className="text-2xl font-semibold">{stats.pending}</p>
          </CardContent>
        </Card>
      </div>

      {stats.pending > 0 ?
      <p className="mb-4 text-xs text-muted-foreground">{t('attendance.pendingHint')}</p> :
      null}

      <Card>
        <CardContent className="p-4">
          {loading ?
          <p className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              {t('common.loading')}
            </p> :
          rows.length === 0 ?
          <p className="py-10 text-center text-sm text-muted-foreground">{t('common.none')}</p> :

          <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.employee')}</TableHead>
                    <TableHead>{t('attendance.source')}</TableHead>
                    <TableHead>{t('attendance.clockIn')}</TableHead>
                    <TableHead>{t('attendance.clockOut')}</TableHead>
                    <TableHead>{t('attendance.duration')}</TableHead>
                    <TableHead>{t('attendance.wage')}</TableHead>
                    <TableHead>{t('attendance.geo')}</TableHead>
                    <TableHead>{t('attendance.approval')}</TableHead>
                    {canManageAttendance && (
                      <TableHead className="text-right">관리</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) =>
                <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-medium">{row.employee_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.employee_number ? `${row.employee_number} · ` : ''}
                          {row.employee_email}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {row.source === 'manual' ? t('attendance.sourceManual') : t('attendance.sourceApp')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatTimeInZone(row.clock_in_at, branchState)}</TableCell>
                      <TableCell className="text-sm">
                        {/* Nobody has clocked out yet, so the column simply stays empty. */}
                        {row.clock_out_at ? formatTimeInZone(row.clock_out_at, branchState) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.minutes ? `${Math.floor(row.minutes / 60)}h ${row.minutes % 60}m` : '—'}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {wageOf(row) ? money(wageOf(row)) : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {row.geo_verified ?
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                              <CheckCircle2 className="mr-1 h-3 w-3" /> {t('attendance.verified')}
                            </Badge> :

                      <Badge variant="secondary">
                              <XCircle className="mr-1 h-3 w-3" /> {t('attendance.outside')}
                            </Badge>
                      }
                          {typeof row.clock_in_distance_m === 'number' &&
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {row.clock_in_distance_m}m
                            </span>
                      }
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {canEdit('attendance') ? (
                            <ApprovalActions row={row} onDecide={decide} />
                          ) : (
                            <Badge variant="secondary">
                              {row.approval_status === 'rejected'
                                ? t('attendance.rejected')
                                : row.approval_status === 'pending'
                                  ? t('attendance.pending')
                                  : t('attendance.approved')}
                            </Badge>
                          )}
                          {/* Why a record was turned down stays on the record, for the manager and
                              for the person whose punch it was. */}
                          {row.approval_status === 'rejected' && row.rejection_reason ? (
                            <p className="max-w-[16rem] text-xs text-destructive">{row.rejection_reason}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      {canManageAttendance && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title="수정"
                              onClick={() => {
                                setSelectedEntry(row);
                                setEntryDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              title="삭제"
                              onClick={() => handleDeleteEntry(row)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                )}
                </TableBody>
              </Table>
            </div>
          }
        </CardContent>
      </Card>

      <AttendanceReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        branch={activeBranch} />

      <TimeEntryDialog
        open={entryDialogOpen}
        onOpenChange={(open) => {
          setEntryDialogOpen(open);
          if (!open) setSelectedEntry(null);
        }}
        entry={selectedEntry}
        employees={employees}
        branch={activeBranch}
        onSaved={load}
      />
      
    </div>);

}