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
import { downloadCsv, downloadPdf, estimatedPay, reportRows, REPORT_HEADERS } from '@/lib/attendanceReport';
import { regionalMap, stateFromBranch, stateLabel } from '@/lib/holidays';
import { payMultipliers, payPenalties } from '@/components/company/PayMultipliersCard';
import { useWorkspace } from '@/lib/WorkspaceContext';
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

// The hourly rate each punch is paid at comes from the employee profile.
async function fetchRates(branchId) {
  const page = await base44.entities.EmployeeProfile.filter(
    { branch_id: branchId },
    { limit: 500, fields: ['user_email', 'hourly_rate', 'penalty_rates_enabled'] }
  );
  const rates = {};
  const penaltiesEnabled = {};
  (page.items || []).forEach((profile) => {
    if (profile.user_email) {
      const email = profile.user_email.toLowerCase();
      rates[email] = profile.hourly_rate;
      penaltiesEnabled[email] = Boolean(profile.penalty_rates_enabled);
    }
  });
  return { rates, penaltiesEnabled };
}

// The dates imported from the official state schedule count as holidays once applied.
async function fetchRegional(companyId, state) {
  if (!companyId || !state) return [];
  const page = await base44.entities.RegionalHoliday.filter(
    { company_id: companyId, state, status: 'applied' },
    { limit: 300 }
  );
  return page.items || [];
}

export default function AttendanceReportDialog({ open, onOpenChange, branch }) {
  const { t, lang } = useI18n();
  const { company } = useWorkspace();
  const [from, setFrom] = useState(addDaysIso(todayIso(), -6));
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState([]);
  const [rates, setRates] = useState({});
  const [penaltiesEnabled, setPenaltiesEnabled] = useState({});
  const [regional, setRegional] = useState({});
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const state = stateFromBranch(branch);
  // The branch's own penalties, where the store set them, stand in for the company's.
  const branchPenalties = payPenalties({ penalties: (branch && branch.pay_penalties) || [] });
  const options = {
    state,
    multipliers: payMultipliers(company ? company.pay_multipliers : null),
    penalties: branchPenalties.length > 0 ? branchPenalties : payPenalties(company ? company.pay_multipliers : null),
    overridesByEmail: {},
    rates,
    penaltiesEnabled,
    regional
  };

  const run = async () => {
    if (!branch || !from || !to) return;
    setLoading(true);
    const [entries, empData, imported] = await Promise.all([
      fetchRange(branch.id, from, to),
      fetchRates(branch.id),
      fetchRegional(company ? company.id : '', state)
    ]);
    setRates(empData.rates || {});
    setPenaltiesEnabled(empData.penaltiesEnabled || {});
    setRegional(regionalMap(imported, company ? company.holiday_exclusions : []));
    setRows(entries);
    setReady(true);
    setLoading(false);
  };

  const name = `${branch ? branch.code || branch.name : 'store'}_attendance_${from}_${to}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
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
              <Button
                variant="outline"
                onClick={() => downloadCsv(rows, `${name}.csv`, options)}
                disabled={rows.length === 0}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" /> {t('attendance.exportCsv')}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  downloadPdf(rows, {
                    branchName: branch.name,
                    from,
                    to,
                    filename: `${name}.pdf`,
                    ...options
                  })
                }
                disabled={rows.length === 0}
              >
                <Download className="mr-2 h-4 w-4" /> {t('attendance.exportPdf')}
              </Button>
            </>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          {state
            ? t('attendance.reportState').replace('{state}', stateLabel(state, lang))
            : t('attendance.reportNoState')}
        </p>

        {ready ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('attendance.reportRows').replace('{count}', String(rows.length))} ·{' '}
              {t('attendance.reportTotal').replace('{amount}', `$${estimatedPay(rows, options).toFixed(2)}`)}
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
                        {reportRows([row], options)[0].map((value, index) => (
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