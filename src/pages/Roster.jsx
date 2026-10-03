import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ShiftDialog from '@/components/ShiftDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { addDaysIso, startOfWeekIso, todayIso, weekDates } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

export default function Roster() {
  const { t } = useI18n();
  const { activeBranch } = useWorkspace();
  const { toast } = useToast();

  const [weekStart, setWeekStart] = useState(startOfWeekIso(todayIso()));
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState('');
  const [dialogEmployee, setDialogEmployee] = useState(null);
  const [sending, setSending] = useState(false);

  const weekEnd = addDaysIso(weekStart, 6);
  const days = weekDates(weekStart);

  const load = useCallback(async () => {
    if (!activeBranch) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [staff, list] = await Promise.all([
    base44.entities.EmployeeProfile.
    filter({ branch_id: activeBranch.id, status: 'active' }, { limit: 200 }).
    then((page) => page.items || []),
    base44.entities.Shift.
    filter({ branch_id: activeBranch.id, date: { $gte: weekStart, $lte: weekEnd } }, { sort: 'date', limit: 500 }).
    then((page) => page.items || [])]
    );
    setEmployees(staff);
    setShifts(list);
    setLoading(false);
  }, [activeBranch, weekStart, weekEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const saveWeek = async () => {
    await base44.entities.Shift.updateMany(
      { branch_id: activeBranch.id, date: { $gte: weekStart, $lte: weekEnd }, status: 'draft' },
      { $set: { status: 'saved' } }
    );
    toast({ title: t('roster.saved') });
    await load();
  };

  const sendWeek = async () => {
    setSending(true);
    const response = await base44.functions.invoke('sendRoster', {
      branch_id: activeBranch.id,
      week_start: weekStart
    });
    setSending(false);
    if (response.data?.error) {
      toast({ title: response.data.error, variant: 'destructive' });
      return;
    }
    toast({ title: `${t('roster.sent')} · ${response.data.sent || 0}` });
    await load();
  };

  const removeShift = async (shift) => {
    await base44.entities.Shift.delete(shift.id);
    await load();
  };

  const shiftsFor = (email, date) => shifts.filter((s) => s.employee_email === email && s.date === date);
  const publishedCount = shifts.filter((s) => s.status === 'published').length;

  return (
    <div>
      <PageHeader
        title={t('roster.title')}
        subtitle={activeBranch ? activeBranch.name : t('roster.subtitle')}
        actions={
        <>
            <div className="flex items-center gap-1 rounded-lg border px-2 py-1">
              <Button variant="ghost" size="icon" onClick={() => setWeekStart(addDaysIso(weekStart, -7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-sm font-medium">
                {weekStart} → {weekEnd}
              </span>
              <Button variant="ghost" size="icon" onClick={() => setWeekStart(addDaysIso(weekStart, 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button
            variant="outline"
            onClick={() => {
              setDialogDate(todayIso());
              setDialogEmployee(null);
              setDialogOpen(true);
            }}
            disabled={!activeBranch || employees.length === 0} className="hidden">
            
              <Plus className="mr-2 h-4 w-4" /> {t('roster.addShift')}
            </Button>
            <Button variant="outline" onClick={saveWeek} disabled={!activeBranch || shifts.length === 0}>
              {t('roster.save')}
            </Button>
            <Button onClick={sendWeek} disabled={!activeBranch || shifts.length === 0 || sending}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {t('roster.send')}
            </Button>
          </>
        } />
      

      <Card>
        <CardContent className="p-4">
          {loading ?
          <p className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              {t('common.loading')}
            </p> :
          employees.length === 0 ?
          <p className="py-10 text-center text-sm text-muted-foreground">{t('common.none')}</p> :

          <>
              <p className="mb-4 text-xs text-muted-foreground">
                {publishedCount} of {shifts.length} shifts published for this week
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 w-44 bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                        {t('common.employee')}
                      </th>
                      {days.map((day) =>
                    <th key={day.date} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                          <div>{day.short}</div>
                          <div className="font-normal text-[11px]">{day.date.slice(5)}</div>
                        </th>
                    )}
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((employee) =>
                  <tr key={employee.id} className="align-top">
                        <td className="sticky left-0 z-10 border-t bg-card px-3 py-3">
                          <p className="text-sm font-medium">{employee.full_name}</p>
                          <p className="text-xs text-muted-foreground">{employee.position || '—'}</p>
                        </td>
                        {days.map((day) =>
                    <td key={`${employee.id}-${day.date}`} className="border-t p-1">
                            <div className="space-y-1">
                              {shiftsFor(employee.user_email, day.date).map((shift) =>
                        <div
                          key={shift.id}
                          className={`group rounded-lg border px-2 py-1.5 text-xs ${
                          shift.status === 'published' ?
                          'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100' :
                          shift.status === 'saved' ?
                          'border-sky-200 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100' :
                          'bg-muted/40'}`
                          }>
                          
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-medium">
                                      {shift.start_time}–{shift.end_time}
                                    </span>
                                    <button
                              onClick={() => removeShift(shift)}
                              className="opacity-0 transition-opacity group-hover:opacity-100">
                              
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </button>
                                  </div>
                                  {shift.notes ?
                          <p className="truncate text-[11px] text-muted-foreground">{shift.notes}</p> :
                          null}
                                </div>
                        )}
                              <button
                          onClick={() => {
                            setDialogDate(day.date);
                            setDialogEmployee(employee);
                            setDialogOpen(true);
                          }}
                          className="w-full rounded-lg border border-dashed px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">
                          
                                +
                              </button>
                            </div>
                          </td>
                    )}
                      </tr>
                  )}
                  </tbody>
                </table>
              </div>
            </>
          }
        </CardContent>
      </Card>

      <ShiftDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        branch={activeBranch}
        employees={employees}
        defaultDate={dialogDate}
        defaultEmployee={dialogEmployee}
        onSaved={load} />
      
    </div>);

}