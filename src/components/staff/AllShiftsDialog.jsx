import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';
import { addDaysIso, todayIso } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

// Every shift the store has sent out, so anyone can see who they are working with.
export default function AllShiftsDialog({ open, onOpenChange, branch }) {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !branch) return undefined;
    let cancelled = false;
    setLoading(true);
    const today = todayIso();
    base44.entities.Shift
      .filter(
        { branch_id: branch.id, status: 'published', date: { $gte: today, $lte: addDaysIso(today, 20) } },
        { sort: 'date', limit: 300 }
      )
      .then((page) => {
        if (!cancelled) setRows(page.items || []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, branch]);

  const days = [...new Set(rows.map((row) => row.date))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('staff.allShiftsTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t('staff.allShiftsHint')}</p>

        {loading ? (
          <p className="py-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </p>
        ) : days.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('staff.noShifts')}</p>
        ) : (
          <div className="space-y-4">
            {days.map((date) => (
              <div key={date} className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{date}</p>
                {rows.
                filter((row) => row.date === date).
                map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.employee_name}</p>
                      {row.position ? <p className="text-xs text-muted-foreground">{row.position}</p> : null}
                    </div>
                    <span className="font-mono text-sm">
                      {row.start_time}–{row.end_time}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}