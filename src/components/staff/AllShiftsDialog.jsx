import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import RosterGrid from '@/components/roster/RosterGrid';
import { useI18n } from '@/lib/i18n';
import { WEEKS_AHEAD, addDaysIso, startOfWeekIso, todayIso, weekDates, weeksBetweenCount } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

// The whole store's week, laid out exactly the way the roster page lays it out — without the hours
// the team submitted — so anyone can see who they are working with. Only the weeks that have gone
// out to staff are here: a draft nobody has been sent yet stays with the manager.
export default function AllShiftsDialog({ open, onOpenChange, branch }) {
  const { t } = useI18n();
  const thisWeek = startOfWeekIso(todayIso());
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Opening the window always starts on this week, never on the week that was last looked at.
  useEffect(() => {
    if (open) setWeekStart(thisWeek);
  }, [open, thisWeek]);

  useEffect(() => {
    if (!open || !branch) return undefined;
    let cancelled = false;
    setLoading(true);
    Promise.all([
    base44.entities.EmployeeProfile.
    filter({ branch_id: branch.id, status: 'active' }, { limit: 200 }).
    then((page) => page.items || []).
    catch(() => []),
    base44.entities.Shift.
    filter(
      {
        branch_id: branch.id,
        status: 'published',
        date: { $gte: weekStart, $lte: addDaysIso(weekStart, 6) }
      },
      { sort: 'date', limit: 500 }
    ).
    then((page) => page.items || []).
    catch(() => [])]
    ).
    then(([staff, rows]) => {
      if (cancelled) return;
      setEmployees(staff);
      setShifts(rows);
    }).
    finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, branch, weekStart]);

  const days = weekDates(weekStart);
  const canGoBack = weeksBetweenCount(weekStart, thisWeek) > 0;
  const canGoForward = weeksBetweenCount(weekStart, thisWeek) < WEEKS_AHEAD - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-[95vw] overflow-y-auto xl:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{t('staff.allShiftsTitle')}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t('staff.allShiftsHint')}</p>

        <div className="flex items-center gap-1 rounded-lg border px-2 py-1">
          <Button
            variant="ghost"
            size="icon"
            title={t('staff.weekPrev')}
            disabled={!canGoBack}
            onClick={() => setWeekStart(addDaysIso(weekStart, -7))}>

            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-sm font-medium">
            {weekStart} → {addDaysIso(weekStart, 6)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            title={t('staff.weekNext')}
            disabled={!canGoForward}
            onClick={() => setWeekStart(addDaysIso(weekStart, 7))}>

            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {loading ?
        <p className="py-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </p> :
        employees.length === 0 || shifts.length === 0 ?
        <p className="py-8 text-center text-sm text-muted-foreground">{t('staff.noShifts')}</p> :

        <RosterGrid days={days} employees={employees} shifts={shifts} canManage={false} />
        }
      </DialogContent>
    </Dialog>);

}