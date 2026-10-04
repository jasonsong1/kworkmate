import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileBarChart, Keyboard, Loader2, MapPin, QrCode, XCircle } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ApprovalActions from '@/components/attendance/ApprovalActions';
import AttendanceReportDialog from '@/components/attendance/AttendanceReportDialog';
import KioskQrDialog from '@/components/attendance/KioskQrDialog';
import { kioskUrl } from '@/lib/kioskLink';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { formatDateTime, todayIso } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

const ALL = 'all';

export default function Attendance() {
  const { t } = useI18n();
  const { activeBranch, me } = useWorkspace();
  const [date, setDate] = useState(todayIso());
  const [employeeFilter, setEmployeeFilter] = useState(ALL);
  const [employees, setEmployees] = useState([]);
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({ count: 0, minutes: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  useEffect(() => {
    setEmployeeFilter(ALL);
    if (!activeBranch) {
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
    const from = `${date}T00:00:00.000Z`;
    const to = `${date}T23:59:59.999Z`;
    const query = { branch_id: activeBranch.id, clock_in_at: { $gte: from, $lte: to } };
    if (employeeFilter !== ALL) query.employee_email = employeeFilter;
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
  }, [activeBranch, date, employeeFilter]);

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

  // The number pad screen for the store tablet, opened in its own tab.
  const openKiosk = () => {
    if (!activeBranch) return;
    window.open(kioskUrl(activeBranch.id, date), '_blank', 'noopener');
  };

  const hours = Math.floor(stats.minutes / 60);
  const minutes = stats.minutes % 60;

  return (
    <div>
      <PageHeader
        title={t('attendance.title')}
        subtitle={activeBranch ? activeBranch.name : t('attendance.subtitle')}
        actions={
        <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('common.all')}</SelectItem>
                {employees.map((person) =>
              <SelectItem key={person.id} value={person.user_email}>
                    {person.full_name}
                  </SelectItem>
              )}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setQrOpen(true)} disabled={!activeBranch} className="hidden">
              <QrCode className="mr-2 h-4 w-4" /> {t('attendance.qr')}
            </Button>
            <Button variant="outline" onClick={openKiosk} disabled={!activeBranch}>
              <Keyboard className="mr-2 h-4 w-4" /> {t('attendance.manualEntry')}
            </Button>
            <Button variant="outline" onClick={() => setReportOpen(true)} disabled={!activeBranch}>
              <FileBarChart className="mr-2 h-4 w-4" /> {t('attendance.report')}
            </Button>
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
                    <TableHead>{t('attendance.geo')}</TableHead>
                    <TableHead>{t('attendance.approval')}</TableHead>
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
                      <TableCell className="text-sm">{formatDateTime(row.clock_in_at)}</TableCell>
                      <TableCell className="text-sm">
                        {row.clock_out_at ? formatDateTime(row.clock_out_at) : <Badge variant="secondary">Active</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.minutes ? `${Math.floor(row.minutes / 60)}h ${row.minutes % 60}m` : '—'}
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
                        <ApprovalActions row={row} onDecide={decide} />
                      </TableCell>
                    </TableRow>
                )}
                </TableBody>
              </Table>
            </div>
          }
        </CardContent>
      </Card>

      <KioskQrDialog open={qrOpen} onOpenChange={setQrOpen} branch={activeBranch} date={date} />

      <AttendanceReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        branch={activeBranch} />
      
    </div>);

}