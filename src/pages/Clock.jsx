import React, { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut, MapPin } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { formatDateTime, todayIso } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

export default function Clock() {
  const { t } = useI18n();
  const { me, activeBranch } = useWorkspace();
  const { toast } = useToast();
  const [coords, setCoords] = useState(null);
  const [geoError, setGeoError] = useState('');
  const [entry, setEntry] = useState(null);
  const [shift, setShift] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    const activePage = await base44.entities.TimeEntry
      .filter({ employee_email: me.email, status: 'active' }, { limit: 1 })
      .catch(() => ({ items: [] }));
    const active = activePage.items || [];
    setEntry(active[0] || null);
    if (activeBranch) {
      const shifts = await base44.entities.Shift
        .filter({ employee_email: me.email, date: todayIso(), branch_id: activeBranch.id })
        .catch(() => []);
      setShift(shifts[0] || null);
    }
  }, [me, activeBranch]);

  useEffect(() => {
    load();
  }, [load]);

  const locate = () => {
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError(t('clock.denied'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError(t('clock.denied')),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    locate();
  }, []);

  const punch = async (action) => {
    if (!activeBranch || !coords) return;
    setBusy(true);
    const response = await base44.functions.invoke('attendancePunch', {
      branch_id: activeBranch.id,
      action,
      lat: coords.lat,
      lng: coords.lng
    });
    setBusy(false);
    const data = response.data || {};
    if (data.outside_radius) {
      toast({ title: t('clock.outside'), description: `${data.distance}m / ${data.radius}m`, variant: 'destructive' });
      return;
    }
    if (data.error) {
      toast({ title: data.error, variant: 'destructive' });
      return;
    }
    toast({ title: action === 'in' ? t('clock.inDone') : t('clock.outDone') });
    await load();
  };

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={t('clock.title')} subtitle={activeBranch ? activeBranch.name : ''} />

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="rounded-xl bg-muted/50 p-4 text-sm">
            <p className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : geoError || t('clock.checking')}
            </p>
            {activeBranch && (
              <p className="mt-1 text-xs text-muted-foreground">
                Geofence: {activeBranch.gps_lat}, {activeBranch.gps_lng} · {activeBranch.gps_radius_m}m
              </p>
            )}
          </div>

          {shift && (
            <div className="rounded-xl border px-4 py-3">
              <p className="text-xs text-muted-foreground">{t('common.today')}</p>
              <p className="font-mono text-sm">
                {shift.start_time}–{shift.end_time} · {shift.position || ''}
              </p>
            </div>
          )}

          <div className="rounded-xl border px-4 py-3">
            <p className="text-xs text-muted-foreground">{t('common.status')}</p>
            {entry ? (
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                  {t('attendance.clockIn')} {formatDateTime(entry.clock_in_at)}
                </Badge>
              </div>
            ) : (
              <Badge variant="secondary">Not clocked in</Badge>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={() => punch('in')} disabled={busy || !coords || Boolean(entry)}>
              <LogIn className="mr-2 h-4 w-4" /> {t('attendance.clockIn')}
            </Button>
            <Button variant="outline" onClick={() => punch('out')} disabled={busy || !coords || !entry}>
              <LogOut className="mr-2 h-4 w-4" /> {t('attendance.clockOut')}
            </Button>
          </div>

          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={locate}>
              <MapPin className="mr-2 h-3.5 w-3.5" /> {t('clock.checking')}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{t('clock.hint')}</p>
        </CardContent>
      </Card>
    </div>
  );
}