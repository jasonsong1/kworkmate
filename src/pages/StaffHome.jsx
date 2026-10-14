import React, { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FolderOpen,
  KeyRound,
  Loader2,
  QrCode,
  UserCircle2,
  Users } from
'lucide-react';
import PageHeader from '@/components/PageHeader';
import AvailabilityMatrix from '@/components/AvailabilityMatrix';
import CalendarSubscribeCard from '@/components/CalendarSubscribeCard';
import ClockScanButton from '@/components/attendance/ClockScanButton';
import EmployeeDocumentsDialog from '@/components/EmployeeDocumentsDialog';
import StaffOnboardingCard from '@/components/staff/StaffOnboardingCard';
import OnboardingDetails from '@/components/employee/OnboardingDetails';
import SelfPasswordDialog from '@/components/staff/SelfPasswordDialog';
import AllShiftsDialog from '@/components/staff/AllShiftsDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import {
  WEEKS_AHEAD,
  addDaysIso,
  emptyAvailability,
  hoursValue,
  money,
  shiftHours,
  startOfWeekIso,
  todayIso,
  weeksBetweenCount } from
'@/lib/bh';
import { kioskUrl, todayFor } from '@/lib/kioskLink';
import { base44 } from '@/api/base44Client';

export default function StaffHome() {
  const { t } = useI18n();
  const { me, employeeProfile, company, activeBranch, hasModule, presetKey } = useWorkspace();
  const { toast } = useToast();
  // This week is the first week there is: the roster runs four weeks ahead and never backwards.
  const thisWeek = startOfWeekIso(todayIso());
  const [shifts, setShifts] = useState([]);
  const [shiftWeek, setShiftWeek] = useState(thisWeek);
  const [availWeek, setAvailWeek] = useState(thisWeek);
  const [availability, setAvailability] = useState(emptyAvailability());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [allShiftsOpen, setAllShiftsOpen] = useState(false);
  // The pay rate is hidden until the person asks to see it.
  const [showRate, setShowRate] = useState(false);
  // The floor position holds no store code of its own; a supervisor or a manager does.
  const isFloorStaff = presetKey === 'floor_staff';
  // A package that does not include attendance has nothing to clock with.
  const attendance = hasModule('attendance');
  // Shifts and the calendar feed both come out of the roster: a package without one carries
  // neither of them, so nothing is shown and nothing is fetched.
  const roster = hasModule('roster');

  const canGoBack = (week) => weeksBetweenCount(week, thisWeek) > 0;
  const canGoForward = (week) => weeksBetweenCount(week, thisWeek) < WEEKS_AHEAD - 1;

  // The person's own roster for the week on screen. Only what the store has sent out is shown, so
  // a draft nobody has been told about never appears here.
  const loadShifts = useCallback(async () => {
    if (!me || !roster) {
      setShifts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const rows = await base44.entities.Shift.
    filter(
      {
        employee_email: me.email,
        status: 'published',
        date: { $gte: shiftWeek, $lte: addDaysIso(shiftWeek, 6) }
      },
      { sort: 'date', limit: 100 }
    ).
    then((page) => page.items || []).
    catch(() => []);
    setShifts(rows);
    setLoading(false);
  }, [me, roster, shiftWeek]);

  // The hours they set for the week on screen. Filled in from the submission made for that week,
  // and from their latest one when this week has not been filled in yet.
  const loadAvailability = useCallback(async () => {
    if (!me) return;
    const rows = await base44.entities.AvailabilitySubmission.
    filter({ employee_email: me.email }, { sort: '-created_date', limit: 30 }).
    then((page) => page.items || []).
    catch(() => []);
    const forWeek = rows.find(
      (row) => startOfWeekIso(String(row.week_start || row.created_date || '').slice(0, 10)) === availWeek
    );
    const source = forWeek || rows[0] || null;
    setAvailability(source && source.availability ? source.availability : emptyAvailability());
  }, [me, availWeek]);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const submitAvailability = async () => {
    if (!me) return;
    setSaving(true);
    await base44.entities.AvailabilitySubmission.create({
      company_id: me.company_id,
      branch_id: (employeeProfile && employeeProfile.branch_id) || me.branch_id,
      employee_email: me.email,
      employee_name: me.full_name || me.email,
      // The week the hours are for, so the roster built for that week reads exactly these hours.
      week_start: availWeek,
      availability
    });
    setSaving(false);
    toast({ title: t('staff.availabilitySaved') });
  };

  // The store keeps this screen open on a device; the phone camera reads the code from it. The
  // day on the code is the store's own day, so it is right either side of midnight.
  const openQr = () => {
    if (activeBranch) window.open(kioskUrl(activeBranch.id, todayFor(activeBranch)), '_blank', 'noopener');
  };

  const weekHours = shifts.reduce((sum, shift) => sum + shiftHours(shift), 0);

  return (
    <div>
      <PageHeader
        title={t('staff.title')}
        subtitle={activeBranch ? activeBranch.name : me ? me.email : ''}
        actions={
        <>
            {/* The store's own code is shown on the store's device, so a floor position does not
                carry that button. A package without attendance carries neither it nor the scan. */}
            {attendance && !isFloorStaff &&
          <Button variant="outline" onClick={openQr} disabled={!activeBranch}>
                <QrCode className="mr-2 h-4 w-4" /> {t('staff.qrButton')}
              </Button>
          }
            {attendance && <ClockScanButton onRecorded={loadShifts} />}
            {/* Attendance and leave sit in the left navigation, so no button repeats them here.
                Their own sign-in password, though, has nowhere else to be reset. */}
            {employeeProfile &&
          <Button variant="outline" onClick={() => setResetOpen(true)}>
                <KeyRound className="mr-2 h-4 w-4" /> {t('staff.resetPassword')}
              </Button>
          }
            {/* The documents their employer keeps on their own staff record. */}
            {employeeProfile &&
          <Button variant="outline" onClick={() => setDocsOpen(true)}>
                <FolderOpen className="mr-2 h-4 w-4" /> {t('employees.vault')}
              </Button>
          }
          </>
        } />


      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. 좌측 카드: 내 프로필 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCircle2 className="h-4 w-4" /> {t('staff.profile')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {employeeProfile ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('common.name')}</p>
                    <p className="text-sm font-medium">{employeeProfile.full_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('employees.number')}</p>
                    <p className="font-mono text-sm">{employeeProfile.employee_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('common.position')}</p>
                    <p className="text-sm">{employeeProfile.position || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('common.rate')}</p>
                    <div className="flex items-center gap-2">
                      <p className={`text-sm ${showRate ? '' : 'blur-sm select-none'}`}>
                        {employeeProfile.hourly_rate ? money(employeeProfile.hourly_rate) : '—'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowRate((value) => !value)}
                        title={showRate ? t('staff.hideRate') : t('staff.showRate')}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showRate ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('employees.onboarding')}</p>
                  {employeeProfile.onboarding_status === 'completed' ? (
                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                      {t('employees.completed')}
                    </Badge>
                  ) : (
                    <div className="mt-1">
                      <Badge variant="secondary">{t('employees.pending')}</Badge>
                    </div>
                  )}
                </div>
              </>
            ) : me ? (
              /* 슈퍼어드민이나 관리자 등 별도 직원 레코드가 없는 계정을 위한 프로필 정보 */
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">{t('common.name')}</p>
                  <p className="text-sm font-medium">{me.full_name || me.email}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('common.email') || '이메일'}</p>
                  <p className="font-mono text-sm">{me.email}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('common.position')}</p>
                  <p className="text-sm">
                    {me.role === 'admin'
                      ? t('platform.superAdmin') || '슈퍼어드민'
                      : me.app_role === 'company_admin'
                      ? '회사 관리자'
                      : me.app_role || '관리자'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">{t('common.none')}</p>
            )}
          </CardContent>
        </Card>

        {/* 2. 우측 카드: 내 시프트 (내 프로필 바로 옆에 나란히 배치) */}
        {roster && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4" /> {t('staff.shifts')}
              </CardTitle>
              {/* 매장 전체 시프트 확인 버튼 */}
              <Button variant="outline" size="sm" onClick={() => setAllShiftsOpen(true)} disabled={!activeBranch}>
                <Users className="mr-2 h-4 w-4" /> {t('staff.allShifts')}
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-1 rounded-lg border px-2 py-1">
                <Button
                  variant="ghost"
                  size="icon"
                  title={t('staff.weekPrev')}
                  disabled={!canGoBack(shiftWeek)}
                  onClick={() => setShiftWeek(addDaysIso(shiftWeek, -7))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-sm font-medium">
                  {shiftWeek} → {addDaysIso(shiftWeek, 6)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  title={t('staff.weekNext')}
                  disabled={!canGoForward(shiftWeek)}
                  onClick={() => setShiftWeek(addDaysIso(shiftWeek, 7))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {loading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </p>
              ) : shifts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('staff.noShifts')}</p>
              ) : (
                shifts.map((shift) => (
                  <div key={shift.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{shift.date}</p>
                      <p className="text-xs text-muted-foreground">{shift.position || ''}</p>
                    </div>
                    <span className="font-mono text-sm">
                      {shift.start_time}–{shift.end_time}
                    </span>
                  </div>
                ))
              )}

              {/* 주간 총 근무 시간 요약 */}
              <div className="flex items-center justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">{t('staff.totalHours')}</span>
                <span className="font-mono font-medium">{hoursValue(weekHours)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 3. 하단 카드: 온보딩 서류 및 정보 (접기/펼치기 숨김 토글이 적용된 통합 카드) */}
        {(employeeProfile || me) && (
          <div className="lg:col-span-2">
            <StaffOnboardingCard />
          </div>
        )}

        {/* Availability is what a roster is built from, so a package without a roster keeps
            none of it. */}
        {roster &&
        <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">{t('staff.availability')}</CardTitle>
              <div className="flex items-center gap-1 rounded-lg border px-2 py-1">
                <Button
                variant="ghost"
                size="icon"
                title={t('staff.weekPrev')}
                disabled={!canGoBack(availWeek)}
                onClick={() => setAvailWeek(addDaysIso(availWeek, -7))}>

                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-2 text-sm font-medium">
                  {availWeek} → {addDaysIso(availWeek, 6)}
                </span>
                <Button
                variant="ghost"
                size="icon"
                title={t('staff.weekNext')}
                disabled={!canGoForward(availWeek)}
                onClick={() => setAvailWeek(addDaysIso(availWeek, 7))}>

                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">{t('staff.availabilityHint')}</p>
              <AvailabilityMatrix value={availability} onChange={setAvailability} />
              <Button onClick={submitAvailability} disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('staff.submitAvailability')}
              </Button>
            </CardContent>
          </Card>}

        {roster &&
        <div className="lg:col-span-2">
            <CalendarSubscribeCard />
          </div>}
      </div>

      <AllShiftsDialog open={allShiftsOpen} onOpenChange={setAllShiftsOpen} branch={activeBranch} />
      <EmployeeDocumentsDialog open={docsOpen} onOpenChange={setDocsOpen} employee={employeeProfile} />
      <SelfPasswordDialog open={resetOpen} onOpenChange={setResetOpen} profile={employeeProfile} />
    </div>);

}