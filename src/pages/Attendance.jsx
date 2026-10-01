import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MapPin, XCircle } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { formatDateTime, todayIso } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

export default function Attendance() {
  const { t } = useI18n();
  const { activeBranch } = useWorkspace();
  const [date, setDate] = useState(todayIso());
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState({ count: 0, minutes: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeBranch) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const from = `${date}T00:00:00.000Z`;
    const to = `${date}T23:59:59.999Z`;
    const [list, aggregated] = await Promise.all([
      base44.entities.TimeEntry.filter(
        { branch_id: activeBranch.id, clock_in_at: { $gte: from, $lte: to } },
        { sort: '-clock_in_at', limit: 200 }
      ),
      base44.entities.TimeEntry
        .aggregate({ query: { branch_id: activeBranch.id, clock_in_at: { $gte: from, $lte: to } }, sum: 'minutes' })
        .catch(() => ({ rows: [] }))
    ]);
    setRows(list);
    const first = (aggregated.rows || [])[0] || {};
    setTotal({ count: first.count || 0, minutes: first.sum_minutes || 0 });
    setLoading(false);
  }, [activeBranch, date]);

  useEffect(() => {
    load();
  }, [load]);

  const hours = Math.floor(total.minutes / 60);
  const minutes = total.minutes % 60;

  return (
    <div>
      <PageHeader
        title={t('attendance.title')}
        subtitle={activeBranch ? activeBranch.name : t('attendance.subtitle')}
        actions={<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">Records</p>
            <p className="text-2xl font-semibold">{total.count}</p>
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
            <p className="text-xs text-muted-foreground">Geofence radius</p>
            <p className="text-2xl font-semibold">{activeBranch ? activeBranch.gps_radius_m : '—'}m</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              {t('common.loading')}
            </p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('common.none')}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.employee')}</TableHead>
                    <TableHead>{t('attendance.clockIn')}</TableHead>
                    <TableHead>{t('attendance.clockOut')}</TableHead>
                    <TableHead>{t('attendance.duration')}</TableHead>
                    <TableHead>{t('attendance.geo')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-medium">{row.employee_name}</p>
                        <p className="text-xs text-muted-foreground">{row.employee_email}</p>
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
                          {row.geo_verified ? (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                              <CheckCircle2 className="mr-1 h-3 w-3" /> {t('attendance.verified')}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <XCircle className="mr-1 h-3 w-3" /> {t('attendance.outside')}
                            </Badge>
                          )}
                          {typeof row.clock_in_distance_m === 'number' && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {row.clock_in_distance_m}m
                            </span>
                          )}
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
    </div>
  );
}