import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Loader2, Plus, Send, Settings2, Sparkles, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AiSpinner from '@/components/AiSpinner';
import ShiftDialog from '@/components/ShiftDialog';
import RosterSettingsDialog from '@/components/RosterSettingsDialog';
import RosterScheduleCard from '@/components/RosterScheduleCard';
import RosterGrid from '@/components/roster/RosterGrid';
import RosterAutomationCard from '@/components/roster/RosterAutomationCard';
import AvailabilityBoard from '@/components/AvailabilityBoard';
import CalendarSubscribeDialog from '@/components/roster/CalendarSubscribeDialog';
import ClearRosterDialog from '@/components/roster/ClearRosterDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { usePermissions } from '@/lib/permissions';
import { addDaysIso, isBranchOpenOnDay, startOfWeekIso, todayIso, weekDates } from '@/lib/bh';
import { base44 } from '@/api/base44Client';
import { useRealtimeSync } from '@/lib/useRealtimeSync';

export default function Roster() {
  const { t } = useI18n();
  const { activeBranch, isManager, me, feature, patchBranch } = useWorkspace();
  const { canEdit } = usePermissions();
  // Building, saving and sending the roster needs update access; reading it does not.
  const canManageRoster = canEdit('roster');
  // Asking the team for their hours and letting the draft build itself are store settings, so
  // they belong to whoever runs the store.
  const canManageAutomation = canEdit('branches');
  const { toast } = useToast();

  const [tab, setTab] = useState('roster');
  const [weekStart, setWeekStart] = useState(startOfWeekIso(todayIso()));
  // Four weeks either side of this one, and no further: the roster stays inside the window the
  // store actually plans in.
  const firstWeek = addDaysIso(startOfWeekIso(todayIso()), -28);
  const lastWeek = addDaysIso(startOfWeekIso(todayIso()), 28);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [approvedLeave, setApprovedLeave] = useState([]);
  // Shifts the last build could not fill: they stay open on the screen instead of disappearing.
  const [unassigned, setUnassigned] = useState([]);
  // The first read of the store blanks the grid. Every later one — another week as much as a
  // refresh — keeps the grid on screen and only spins beside the dates.
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(true);
  // Each read takes a ticket and only the newest ticket may write, so flipping quickly through
  // the weeks can never leave an older week's shifts on the screen.
  const latestLoad = useRef(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState('');
  const [dialogEmployee, setDialogEmployee] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Emptying the week is a deliberate act, so it waits behind a confirmation.
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  // The shift opened for its hours to be changed or for it to be taken off the week.
  const [editingShift, setEditingShift] = useState(null);

  const weekEnd = addDaysIso(weekStart, 6);
  const days = useMemo(
    () =>
      weekDates(weekStart).map((d) => ({
        ...d,
        isOpen: isBranchOpenOnDay(activeBranch?.trading_hours, d.short)
      })),
    [weekStart, activeBranch?.trading_hours]
  );

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
      setFetching(false);
      return;
    }
    const ticket = latestLoad.current + 1;
    latestLoad.current = ticket;
    setFetching(true);
    try {
      const [staff, list, subs, leaveRows] = await Promise.all([
        // A manager plans with the crew list. The crew's own copy is built from the week's shifts.
        canManageRoster
          ? base44.entities.EmployeeProfile
              .filter({ branch_id: activeBranch.id, status: 'active' }, { limit: 200 })
              .then((page) => page.items || [])
          : Promise.resolve([]),
        // A manager reads the whole week, drafts included; the crew reads the week that was sent.
        base44.entities.Shift
          .filter(
            canManageRoster
              ? { branch_id: activeBranch.id, date: { $gte: weekStart, $lte: weekEnd } }
              : { branch_id: activeBranch.id, date: { $gte: weekStart, $lte: weekEnd }, status: 'published' },
            { sort: 'date', limit: 500 }
          )
          .then((page) => page.items || []),
        // The week on screen is the week whose availability is read, so the board follows the
        // roster as the manager moves from one week to the next.
        canManageRoster
          ? base44.entities.AvailabilitySubmission
              .filter(
                { branch_id: activeBranch.id, week_start: weekStart },
                { sort: '-created_date', limit: 500 }
              )
              .then((page) => page.items || [])
          : Promise.resolve([]),
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
      // Another week was asked for while this read was on its way: that answer is the one to show.
      if (ticket !== latestLoad.current) return;
      setEmployees(staff);
      setShifts(list);
      setSubmissions(subs);
      setApprovedLeave(leaveRows);
    } finally {
      // Whether the read arrived or failed, only the newest one may clear the week's spinner.
      if (ticket === latestLoad.current) {
        setLoading(false);
        setFetching(false);
      }
    }
  }, [activeBranch, weekStart, weekEnd, canManageRoster]);

  useEffect(() => {
    load();
  }, [load]);

  // 실시간 동기화: 시프트 변경/추가, 근무가능시간 제출, 휴가 승인 시 새로고침 없이 즉시 로스터 화면 갱신
  useRealtimeSync(['shift', 'availability_submission', 'leave_request'], load);

  const saveWeek = async () => {
    await base44.entities.Shift.updateMany(
      { branch_id: activeBranch.id, date: { $gte: weekStart, $lte: weekEnd }, status: 'draft' },
      { $set: { status: 'saved' } }
    );
    toast({ title: t('roster.saved') });
    await load();
  };

  // A saved week is locked so a stray drag cannot change it. Cancel puts it back into draft,
  // where it can be moved again.
  const cancelSave = async () => {
    if (!activeBranch) return;
    await base44.entities.Shift.updateMany(
      { branch_id: activeBranch.id, date: { $gte: weekStart, $lte: weekEnd }, status: 'saved' },
      { $set: { status: 'draft' } }
    );
    toast({ title: t('roster.cancelled') });
    await load();
  };

  // Clearing the week takes every shift off it, whatever state it is in, so the roster can be
  // built again from an empty screen.
  const clearRoster = async () => {
    if (!activeBranch) return;
    setClearing(true);
    try {
      await base44.entities.Shift.deleteMany({
        branch_id: activeBranch.id,
        date: { $gte: weekStart, $lte: weekEnd }
      });
      setUnassigned([]);
      toast({ title: t('roster.cleared') });
      setClearOpen(false);
      await load();
    } catch (error) {
      toast({ title: (error && error.message) || t('roster.clearFailed'), variant: 'destructive' });
    } finally {
      setClearing(false);
    }
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
      const rawUnassigned = data.unassigned || [];
      const validUnassigned = rawUnassigned.filter((item) => {
        const d = days.find((x) => x.date === item.date);
        return !d || d.isOpen;
      });
      setUnassigned(validUnassigned);
      const unfilled = validUnassigned.reduce((sum, item) => sum + (item.missing || 0), 0);
      toast({ title: t('roster.built').replace('{assigned}', data.assigned || 0).replace('{unfilled}', unfilled) });
      await load();
    } catch (error) {
      toast({ title: (error && error.message) || t('roster.buildFailed'), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  // A dragged shift is the same record moved, never a second one added: the shift keeps its id and
  // only its person and day change.
  // [낙관적 업데이트(Optimistic UI) 적용]: 서버 응답(2~3초)을 기다리지 않고 화면을 0.01초 만에 즉시 갱신
  const moveShift = async (email, date, id) => {
    const shift = shifts.find((s) => s.id === id);
    if (!shift || (shift.employee_email === email && shift.date === date)) return;
    if (onLeaveFor(email, date)) {
      toast({ title: t('roster.onLeaveBlocked'), variant: 'destructive' });
      return;
    }
    const target = employees.find((employee) => employee.user_email === email);
    const previous = shift.employee_email;
    const originalShifts = shifts;

    // 1. 화면 UI를 즉각 변경 (체감 로딩 0초)
    setShifts((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, employee_email: email, employee_name: target ? target.full_name : email, date }
          : s
      )
    );

    // 2. 백그라운드에서 서버 동기화 수행
    try {
      await base44.entities.Shift.update(shift.id, {
        employee_email: email,
        employee_name: target ? target.full_name : email,
        date
      });
      if (shift.status === 'published') {
        base44.functions
          .invoke('notifyShiftChange', {
            branch_id: activeBranch.id,
            employee_email: email,
            change: 'updated',
            published: true,
            date,
            start_time: shift.start_time,
            end_time: shift.end_time,
            position: shift.position
          })
          .catch(() => null);
        if (previous && previous !== email) {
          base44.functions
            .invoke('notifyShiftChange', {
              branch_id: activeBranch.id,
              employee_email: previous,
              change: 'cancelled',
              published: true,
              date: shift.date,
              start_time: shift.start_time,
              end_time: shift.end_time,
              position: shift.position
            })
            .catch(() => null);
        }
      }
    } catch (err) {
      // 통신 실패 시 원래 상태로 롤백
      setShifts(originalShifts);
      toast({ title: t('roster.moveFailed') || '시프트 이동에 실패했습니다.', variant: 'destructive' });
    }
  };

  // Carrying a name onto another line puts that person above the row it was dropped on, and the
  // order is kept with the branch so every manager opens the week the same way.
  const reorderEmployees = async (fromEmail, toEmail) => {
    if (!activeBranch || !canManageRoster || !fromEmail || fromEmail === toEmail) return;
    const emails = gridEmployees.map((employee) => employee.user_email);
    const from = emails.indexOf(fromEmail);
    const to = emails.indexOf(toEmail);
    if (from < 0 || to < 0) return;
    const next = [...emails];
    next.splice(to, 0, ...next.splice(from, 1));
    patchBranch(activeBranch.id, { roster_order: next });
    await base44.entities.Branch.update(activeBranch.id, { roster_order: next }).catch(() => null);
  };

  // Managers and the branch's own supervisors can correct what a person submitted. A position
  // that only reads the roster still sees the team's schedule but only its own availability.
  const inManagerEmails = Boolean(activeBranch && me && (activeBranch.manager_emails || []).includes(me.email));
  const canEditAvailability = canManageRoster && (isManager || inManagerEmails);
  const visibleSubmissions = canManageRoster
    ? submissions
    : submissions.filter((item) => item.employee_email === ((me && me.email) || ''));
  // Who gets a row. A manager reads the crew list; the crew's copy is built from the week's
  // shifts, exactly the way the All shifts view works, so every working employee has a row.
  const gridRows = canManageRoster
    ? employees
    : Array.from(
        shifts.reduce((map, shift) => {
          const email = shift.employee_email;
          if (!email) return map;
          const row = map.get(email) || {
            id: email,
            user_email: email,
            full_name: shift.employee_name || email,
            position: shift.position || ''
          };
          if (!row.position && shift.position) row.position = shift.position;
          map.set(email, row);
          return map;
        }, new Map()).values()
      ).sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));

  // The rows stand in the order the manager arranged them for this branch; anyone the manager has
  // not placed yet keeps their own place at the end of the list.
  const rosterRank = new Map(
    ((activeBranch && activeBranch.roster_order) || []).map((email, index) => [email, index])
  );
  const inRosterOrder = (list) =>
    list
      .map((employee, index) => ({ employee, index }))
      .sort((a, b) => {
        const rankA = rosterRank.has(a.employee.user_email) ? rosterRank.get(a.employee.user_email) : Infinity;
        const rankB = rosterRank.has(b.employee.user_email) ? rosterRank.get(b.employee.user_email) : Infinity;
        return rankA === rankB ? a.index - b.index : rankA - rankB;
      })
      .map((entry) => entry.employee);
  const gridEmployees = inRosterOrder(gridRows);

  const shiftsFor = (email, date) => shifts.filter((s) => s.employee_email === email && s.date === date);
  const publishedCount = shifts.filter((s) => s.status === 'published').length;
  const draftCount = shifts.filter((s) => s.status === 'draft').length;
  const savedCount = shifts.filter((s) => s.status === 'saved').length;
  // A shift the manager places by hand takes one of the seats the last build could not fill, so
  // the day's open-seat note comes down with it instead of staying on the screen.
  const relieveUnassigned = (date, position) => {
    if (!date) return;
    setUnassigned((prev) => {
      let left = 1;
      const next = [];
      for (const item of prev) {
        if (left > 0 && item.date === date && (!position || item.position === position)) {
          left -= 1;
          const missing = (Number(item.missing) || 0) - 1;
          if (missing > 0) next.push({ ...item, missing });
          continue;
        }
        next.push(item);
      }
      return next;
    });
  };

  // What the last build could not fill on one day, named by position, so the day itself says which
  // seat is open ("Manager unfilled 1") and the next build can be aimed at it.
  const unfilledByDay = (date) => {
    const dayObj = days.find((d) => d.date === date);
    if (dayObj && !dayObj.isOpen) return [];

    const totals = new Map();
    unassigned.
    filter((item) => item.date === date).
    forEach((item) => {
      const position = item.position || t('common.position');
      totals.set(position, (totals.get(position) || 0) + (Number(item.missing) || 0));
    });
    return [...totals].map(([position, missing]) => ({ position, missing }));
  };

  return (
    <div>
      <PageHeader
        title={t('roster.title')}
        subtitle={activeBranch ? activeBranch.name : t('roster.subtitle')}
        actions={
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center justify-between sm:justify-start gap-1 rounded-lg border px-2 py-1 bg-card/50">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setWeekStart(addDaysIso(weekStart, -7))}
                disabled={weekStart <= firstWeek}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-xs sm:text-sm font-medium tabular-nums">
                {weekStart} → {weekEnd}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setWeekStart(addDaysIso(weekStart, 7))}
                disabled={weekStart >= lastWeek}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" /> : null}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-0.5">
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} disabled={!activeBranch || !canManageRoster} className="h-8 text-xs">
                <Settings2 className="mr-1.5 h-3.5 w-3.5" /> {t('roster.settings')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={autoBuild}
                disabled={!activeBranch || generating || !canManageRoster || !feature('auto_roster')}
                className="h-8 text-xs"
              >
                {generating ? <AiSpinner className="mr-1.5" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                {generating ? t('roster.building') : t('roster.autoBuild')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCalendarOpen(true)} disabled={!activeBranch} className="h-8 text-xs">
                <CalendarPlus className="mr-1.5 h-3.5 w-3.5" /> {t('leave.calendar')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setClearOpen(true)}
                disabled={!activeBranch || shifts.length === 0 || !canManageRoster}
                className="h-8 text-xs"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t('roster.clear')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={saveWeek}
                disabled={!activeBranch || draftCount === 0 || !canManageRoster}
                className="h-8 text-xs"
              >
                {t('roster.save')}
              </Button>
              {savedCount > 0 && (
                <Button variant="outline" size="sm" onClick={cancelSave} disabled={!activeBranch || !canManageRoster} className="h-8 text-xs">
                  {t('roster.cancelSaved')}
                </Button>
              )}
              <Button size="sm" onClick={sendWeek} disabled={!activeBranch || shifts.length === 0 || sending || !canManageRoster} className="h-8 text-xs">
                {sending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                {t('roster.send')}
              </Button>
            </div>
          </div>
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
              ) : gridEmployees.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">{t('common.none')}</p>
              ) : (
                <>
                  <p className="mb-4 text-xs text-muted-foreground">
                    {t('roster.publishedCount').
                    replace('{published}', String(publishedCount)).
                    replace('{total}', String(shifts.length))}
                    {canManageRoster ? ` · ${t('roster.dragHint')}` : ''}
                  </p>
                  {/* The week being read stays on screen, held back a little, instead of being
                      replaced by a spinner every time the dates move. */}
                  <div className={fetching ? 'pointer-events-none opacity-60 transition-opacity' : undefined}>
                    <RosterGrid
                      days={days}
                      employees={gridEmployees}
                      shifts={shifts}
                      canManage={canManageRoster}
                      onShiftClick={(shift) => {
                        setEditingShift(shift);
                        setDialogOpen(true);
                      }}
                      onAddShift={(employee, date) => {
                        setDialogDate(date);
                        setDialogEmployee(employee);
                        setEditingShift(null);
                        setDialogOpen(true);
                      }}
                      onMoveShift={moveShift}
                      onReorder={reorderEmployees}
                      onLeaveFor={onLeaveFor}
                      missingFor={unfilledByDay} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* The submitted hours are the manager's working view of the week: the crew sees the
              roster itself and enters their own hours from their own space. */}
          {canManageRoster ? (
            <AvailabilityBoard
              employees={gridEmployees}
              submissions={visibleSubmissions}
              days={days}
              branch={activeBranch}
              weekStart={weekStart}
              canEdit={canEditAvailability}
              canReorder={canManageRoster}
              onReorder={reorderEmployees}
              onSaved={load}
            />
          ) : null}
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
        shift={editingShift}
        onLeaveFor={onLeaveFor}
        approvedLeave={approvedLeave}
        onSaved={({ date, position } = {}) => {
          relieveUnassigned(date, position);
          load();
        }}
      />
      <RosterSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        branch={activeBranch}
        onSaved={load}
      />

      <CalendarSubscribeDialog open={calendarOpen} onOpenChange={setCalendarOpen} />
      <ClearRosterDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        weekStart={weekStart}
        weekEnd={weekEnd}
        clearing={clearing}
        onConfirm={clearRoster}
      />
    </div>
  );
}