import React, { useCallback, useEffect, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Loader2, Plus, Send, Settings2, Sparkles } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ShiftDialog from '@/components/ShiftDialog';
import RosterSettingsDialog from '@/components/RosterSettingsDialog';
import RosterScheduleCard from '@/components/RosterScheduleCard';
import RosterAutomationCard from '@/components/roster/RosterAutomationCard';
import AvailabilityBoard from '@/components/AvailabilityBoard';
import CalendarSubscribeDialog from '@/components/roster/CalendarSubscribeDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { usePermissions } from '@/lib/permissions';
import { addDaysIso, startOfWeekIso, todayIso, weekDates } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

export default function Roster() {
  const { t } = useI18n();
  const { activeBranch, isManager, me, feature } = useWorkspace();
  const { canEdit } = usePermissions();
  // Building, saving and sending the roster needs update access; reading it does not.
  const canManageRoster = canEdit('roster');
  // Asking the team for their hours and letting the draft build itself are store settings, so
  // they belong to whoever runs the store.
  const canManageAutomation = canEdit('branches');
  const { toast } = useToast();

  const [tab, setTab] = useState('roster');
  const [weekStart, setWeekStart] = useState(startOfWeekIso(todayIso()));
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [approvedLeave, setApprovedLeave] = useState([]);
  // Shifts the last build could not fill: they stay open on the screen instead of disappearing.
  const [unassigned, setUnassigned] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState('');
  const [dialogEmployee, setDialogEmployee] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  // The shift being dragged, so a manager can nudge a couple of placements by hand.
  const [dragId, setDragId] = useState('');

  const weekEnd = addDaysIso(weekStart, 6);
  const days = weekDates(weekStart);

  // A day with approved leave is out of bounds: it shows as On leave and takes no shift.
  const onLeaveFor = (email, date) =>
    approvedLeave.some(
      (row) =>
        row.employee_email === email &&
        date >= String(row.start_date || '').slice(0, 10) &&
        String(row.end_date || row.start_date || '').slice(0, 10) >= date
    );

  const load = useCallback(async () => {
    if (!activeBranch) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [staff, list, subs, leaveRows] = await Promise.all([
      base44.entities.EmployeeProfile
        .filter({ branch_id: activeBranch.id, status: 'active' }, { limit: 200 })
        .then((page) => page.items || []),
      base44.entities.Shift
        .filter({ branch_id: activeBranch.id, date: { $gte: weekStart, $lte: weekEnd } }, { sort: 'date', limit: 500 })
        .then((page) => page.items || []),
      base44.entities.AvailabilitySubmission
        .filter({ branch_id: activeBranch.id }, { sort: '-created_date', limit: 500 })
        .then((page) => page.items || []),
      // Approved leave blocks the day: it is shown as On leave and no shift can sit on it.
      base44.entities.LeaveRequest
        .filter(
          {
            branch_id: activeBranch.id,
            status: 'approved',
            start_date: { $lte: weekEnd },
            end_date: { $gte: weekStart }
          },
          { limit: 200 }
        )
        .then((page) => page.items || [])
        .catch(() => [])
    ]);
    setEmployees(staff);
    setShifts(list);
    setSubmissions(subs);
    setApprovedLeave(leaveRows);
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
    if (!activeBranch) return;
    setSending(true);
    try {
      const response = await base44.functions.invoke('sendRoster', {
        branch_id: activeBranch.id,
        week_start: weekStart
      });
      const data = response.data || {};
      if (data.error) {
        toast({ title: data.error, variant: 'destructive' });
        return;
      }
      // Sending the week to staff is what publishes it.
      await base44.entities.Shift.updateMany(
        { branch_id: activeBranch.id, date: { $gte: weekStart, $lte: weekEnd }, status: { $in: ['draft', 'saved'] } },
        { $set: { status: 'published' } }
      );
      toast({ title: `${t('roster.sent')} · ${data.sent || 0}` });
      await load();
    } catch (error) {
      const said =
        (error && error.response && error.response.data && error.response.data.error) ||
        (error && error.message) ||
        t('roster.sendFailed');
      toast({ title: said, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  // Builds a draft from the store's demand, the people who are pinned to a day, the submitted
  // availability and the work rules.
  const autoBuild = async () => {
    if (!activeBranch) return;
    setGenerating(true);
    // A refusal on the way — a failed request as much as an error in the answer — stops the
    // button turning instead of leaving the screen saying "building" for ever.
    try {
      const response = await base44.functions.invoke('generateRoster', {
        branch_id: activeBranch.id,
        week_start: weekStart
      });
      const data = response.data || {};
      if (data.error === 'no_settings') {
        toast({ title: t('roster.buildNoSettings'), variant: 'destructive' });
        return;
      }
      if (data.error) {
        toast({ title: data.error, variant: 'destructive' });
        return;
      }
      setUnassigned(data.unassigned || []);
      const unfilled = (data.unassigned || []).reduce((sum, item) => sum + (item.missing || 0), 0);
      toast({ title: t('roster.built').replace('{assigned}', data.assigned || 0).replace('{unfilled}', unfilled) });
      await load();
    } catch (error) {
      toast({ title: (error && error.message) || t('roster.buildFailed'), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const moveShift = async (email, date) => {
    const shift = shifts.find((s) => s.id === dragId);
    setDragId('');
    if (!shift || (shift.employee_email === email && shift.date === date)) return;
    if (onLeaveFor(email, date)) {
      toast({ title: t('roster.onLeaveBlocked'), variant: 'destructive' });
      return;
    }
    const target = employees.find((employee) => employee.user_email === email);
    await base44.entities.Shift.update(shift.id, {
      employee_email: email,
      employee_name: target ? target.full_name : email,
      date
    });
    // The person on the shift hears about it, and their subscribed calendar picks it up.
    await base44.functions
      .invoke('notifyShiftChange', {
        branch_id: activeBranch.id,
        employee_email: email,
        change: 'updated',
        published: shift.status === 'published',
        date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        position: shift.position
      })
      .catch(() => null);
    await load();
  };

  // Managers and the branch's own supervisors can correct what a person submitted. A position
  // that only reads the roster still sees the team's schedule but only its own availability.
  const inManagerEmails = Boolean(activeBranch && me && (activeBranch.manager_emails || []).includes(me.email));
  const canEditAvailability = canManageRoster && (isManager || inManagerEmails);
  const visibleSubmissions = canManageRoster
    ? submissions
    : submissions.filter((item) => item.employee_email === ((me && me.email) || ''));
  const boardEmployees = canManageRoster
    ? employees
    : employees.filter((employee) => employee.user_email === ((me && me.email) || ''));

  const shiftsFor = (email, date) => shifts.filter((s) => s.employee_email === email && s.date === date);
  const publishedCount = shifts.filter((s) => s.status === 'published').length;
  // What the last build could not fill on one day, so the day itself carries the warning.
  const missingOn = (date) =>
    unassigned.filter((item) => item.date === date).reduce((sum, item) => sum + (Number(item.missing) || 0), 0);

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
            <Button variant="outline" onClick={() => setSettingsOpen(true)} disabled={!activeBranch || !canManageRoster}>
              <Settings2 className="mr-2 h-4 w-4" /> {t('roster.settings')}
            </Button>
            <Button
              variant="outline"
              onClick={autoBuild}
              disabled={!activeBranch || generating || !canManageRoster || !feature('auto_roster')}
            >
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {generating ? t('roster.building') : t('roster.autoBuild')}
            </Button>
            {/* Anyone can keep their own shifts and approved leave in their phone calendar. */}
            <Button variant="outline" onClick={() => setCalendarOpen(true)} disabled={!activeBranch}>
              <CalendarPlus className="mr-2 h-4 w-4" /> {t('leave.calendar')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDialogDate(todayIso());
                setDialogEmployee(null);
                setDialogOpen(true);
              }}
              disabled={!activeBranch || employees.length === 0}
              className="hidden"
            >
              <Plus className="mr-2 h-4 w-4" /> {t('roster.addShift')}
            </Button>
            <Button variant="outline" onClick={saveWeek} disabled={!activeBranch || shifts.length === 0 || !canManageRoster}>
              {t('roster.save')}
            </Button>
            <Button onClick={sendWeek} disabled={!activeBranch || shifts.length === 0 || sending || !canManageRoster}>
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              {t('roster.send')}
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="mt-2">
        <TabsList>
          <TabsTrigger value="roster">{t('roster.tabRoster')}</TabsTrigger>
          {canManageAutomation && <TabsTrigger value="automation">{t('roster.tabAutomation')}</TabsTrigger>}
        </TabsList>

        <TabsContent value="roster" className="mt-4 space-y-6">
          <Card>
            <CardContent className="p-4">
              {loading ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                  {t('common.loading')}
                </p>
              ) : employees.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">{t('common.none')}</p>
              ) : (
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
                          {days.map((day) => (
                            <th key={day.date} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                              <div>{day.short}</div>
                              <div className="font-normal text-[11px]">{day.date.slice(5)}</div>
                              {missingOn(day.date) > 0 && (
                                <span className="mt-1 inline-block rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                                  {t('roster.unassigned')} {missingOn(day.date)}
                                </span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map((employee) => (
                          <tr key={employee.id} className="align-top">
                            <td className="sticky left-0 z-10 border-t bg-card px-3 py-3">
                              <p className="text-sm font-medium">{employee.full_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {employee.position || '—'}
                                {employee.secondary_position ? ` · ${employee.secondary_position}` : ''}
                              </p>
                            </td>
                            {days.map((day) => (
                              <td
                                key={`${employee.id}-${day.date}`}
                                className="border-t p-1"
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={() => canManageRoster && moveShift(employee.user_email, day.date)}
                              >
                                <div className="space-y-1">
                                  {onLeaveFor(employee.user_email, day.date) ? (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                                      {t('roster.onLeave')}
                                    </div>
                                  ) : null}
                                  {shiftsFor(employee.user_email, day.date).map((shift) => (
                                    <div
                                      key={shift.id}
                                      draggable={canManageRoster}
                                      onDragStart={() => setDragId(shift.id)}
                                      onDragEnd={() => setDragId('')}
                                      className={`group cursor-grab rounded-lg border px-2 py-1.5 text-xs ${
                                        shift.status === 'published'
                                          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100'
                                          : shift.status === 'saved'
                                            ? 'border-sky-200 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100'
                                            : 'bg-muted/40 dark:bg-muted/20'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="font-medium">
                                          {shift.start_time}–{shift.end_time}
                                        </span>
                                      </div>
                                      {shift.position ? (
                                        <p className="truncate text-[11px] text-muted-foreground">{shift.position}</p>
                                      ) : null}
                                    </div>
                                  ))}
                                  {canManageRoster && !onLeaveFor(employee.user_email, day.date) && (
                                  <button
                                    onClick={() => {
                                      setDialogDate(day.date);
                                      setDialogEmployee(employee);
                                      setDialogOpen(true);
                                    }}
                                    className="w-full rounded-lg border border-dashed px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                                  >
                                    +
                                  </button>
                                  )}
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <AvailabilityBoard
            employees={boardEmployees}
            submissions={visibleSubmissions}
            days={days}
            branch={activeBranch}
            weekStart={weekStart}
            canEdit={canEditAvailability}
            onSaved={load}
          />
        </TabsContent>

        {canManageAutomation && (
          <TabsContent value="automation" className="mt-4 space-y-4">
            <RosterScheduleCard branch={activeBranch} />
            <RosterAutomationCard branch={activeBranch} />
          </TabsContent>
        )}
      </Tabs>

      <ShiftDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        branch={activeBranch}
        employees={employees}
        defaultDate={dialogDate}
        defaultEmployee={dialogEmployee}
        onSaved={load}
      />
      <RosterSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        branch={activeBranch}
        onSaved={load}
      />

      <CalendarSubscribeDialog open={calendarOpen} onOpenChange={setCalendarOpen} />
    </div>
  );
}