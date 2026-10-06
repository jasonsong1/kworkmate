import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, CalendarPlus, Loader2, QrCode, UserCircle2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AvailabilityMatrix from '@/components/AvailabilityMatrix';
import CalendarSubscribeCard from '@/components/CalendarSubscribeCard';
import ClockScanButton from '@/components/attendance/ClockScanButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { emptyAvailability, money, todayIso } from '@/lib/bh';
import { kioskUrl } from '@/lib/kioskLink';
import { base44 } from '@/api/base44Client';

export default function StaffHome() {
  const { t } = useI18n();
  const { me, employeeProfile, activeBranch } = useWorkspace();
  const { toast } = useToast();
  const [shifts, setShifts] = useState([]);
  const [availability, setAvailability] = useState(emptyAvailability());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    const [shiftList, submissions] = await Promise.all([
      base44.entities.Shift
        .filter({ employee_email: me.email, status: 'published', date: { $gte: todayIso() } }, { sort: 'date', limit: 30 })
        .then((page) => page.items || [])
        .catch(() => []),
      base44.entities.AvailabilitySubmission
        .filter({ employee_email: me.email }, { sort: '-created_date', limit: 1 })
        .then((page) => page.items || [])
        .catch(() => [])
    ]);
    setShifts(shiftList);
    if (submissions.length > 0 && submissions[0].availability) setAvailability(submissions[0].availability);
    setLoading(false);
  }, [me]);

  useEffect(() => {
    load();
  }, [load]);

  const submitAvailability = async () => {
    if (!me) return;
    setSaving(true);
    await base44.entities.AvailabilitySubmission.create({
      company_id: me.company_id,
      branch_id: (employeeProfile && employeeProfile.branch_id) || me.branch_id,
      employee_email: me.email,
      employee_name: me.full_name || me.email,
      week_start: todayIso(),
      availability
    });
    setSaving(false);
    toast({ title: t('staff.availabilitySaved') });
  };

  // The store keeps this screen open on a device; the phone camera reads the code from it.
  const openQr = () => {
    if (activeBranch) window.open(kioskUrl(activeBranch.id, todayIso()), '_blank', 'noopener');
  };

  return (
    <div>
      <PageHeader
        title={t('staff.title')}
        subtitle={activeBranch ? activeBranch.name : me ? me.email : ''}
        actions={
          <>
            <Button variant="outline" onClick={openQr} disabled={!activeBranch}>
              <QrCode className="mr-2 h-4 w-4" /> {t('staff.qrButton')}
            </Button>
            <ClockScanButton onRecorded={load} />
            <Button variant="outline" asChild>
              <Link to="/leave">
                <CalendarPlus className="mr-2 h-4 w-4" /> {t('leave.title')}
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
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
                    <p className="text-sm">{employeeProfile.hourly_rate ? money(employeeProfile.hourly_rate) : '—'}</p>
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
            ) : (
              <p className="py-4 text-sm text-muted-foreground">{t('common.none')}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" /> {t('staff.shifts')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
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
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('staff.availability')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <AvailabilityMatrix value={availability} onChange={setAvailability} />
            <Button onClick={submitAvailability} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('staff.submitAvailability')}
            </Button>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <CalendarSubscribeCard />
        </div>
      </div>
    </div>
  );
}