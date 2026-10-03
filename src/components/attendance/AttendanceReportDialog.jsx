import React, { useState } from 'react';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/lib/i18n';
import { addDaysIso, todayIso } from '@/lib/bh';
import { downloadCsv, downloadPdf, reportRows, REPORT_HEADERS } from '@/lib/attendanceReport';
import { base44 } from '@/api/base44Client';

// The report is a list of every punch in the range, so it is read page by page instead of
// only using whatever the screen happens to show.
async function fetchRange(branchId, from, to) {
  const query = {
    branch_id: branchId,
    clock_in_at: { $gte: `${from}T00:00:00.000Z`, $lte: `${to}T23:59:59.999Z` }
  };
  let cursor;
  let all = [];
  for (let page = 0; page < 40; page += 1) {
    const result = await base44.entities.TimeEntry.filter(query, {
      sort: '-clock_in_at',
      limit: 500,
      cursor
    });
    all = all.concat(result.items || []);
    if (!result.has_more || !result.next_cursor) break;
    cursor = result.next_cursor;
  }
  return all;
}

export default function AttendanceReportDialog({ open, onOpenChange, branch }) {
  const { t } = useI18n();
  const [from, setFrom] = useState(addDaysIso(todayIso(), -6));
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const run = async () => {
    if (!branch || !from || !to) return;
    setLoading(true);
    const entries = await fetchRange(branch.id, from, to);
    setRows(entries);
    setReady(true);
    setLoading(false);
  };

  const name = `${branch ? branch.code || branch.name : 'store'}_attendance_${from}_${to}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('attendance.reportTitle')}</DialogTitle>
          <DialogDescription>{branch ? branch.name : ''}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>{t('attendance.reportRange')}</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              <span className="text-muted-foreground">→</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
          </div>
          <Button onClick={run} disabled={loading || !branch}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('common.preview')}
          </Button>
          {ready ? (
            <>
              <Button variant="outline" onClick={() => downloadCsv(rows, `${name}.csv`)} disabled={rows.length === 0}>
                <FileSpreadsheet className="mr-2 h-4 w-4" /> {t('attendance.exportCsv')}
              </Button>
              <Button
                variant="outline"
                onClick={() => downloadPdf(rows, { branchName: branch.name, from, to, filename: `${name}.pdf` })}
                disabled={rows.length === 0}
              >
                <Download className="mr-2 h-4 w-4" /> {t('attendance.exportPdf')}
              </Button>
            </>
          ) : null}
        </div>

        {ready ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('attendance.reportRows').replace('{count}', String(rows.length))}
            </p>
            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('attendance.reportEmpty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {REPORT_HEADERS.map((label) => (
                        <TableHead key={label}>{label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 100).map((row) => (
                      <TableRow key={row.id}>
                        {reportRows([row])[0].map((value, index) => (
                          <TableCell key={index} className="whitespace-nowrap text-sm">
                            {value || '—'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}