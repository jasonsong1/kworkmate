import React, { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut, MapPin, ScanLine } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import QrScannerDialog from '@/components/attendance/QrScannerDialog';
import { parseKioskLink } from '@/lib/kioskLink';
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
  const [scanOpen, setScanOpen] = useState(false);
  // 출근 / 퇴근 only says which punch is about to be recorded. Nothing is recorded until the
  // person presses the record button and scans the store's code.
  const [mode, setMode] = useState('in');

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

  // While a shift is open the sensible next punch is the way out, and after it is closed the way
  // back in — the person can still change the choice before scanning.
  useEffect(() => {
    setMode(entry ? 'out' : 'in');
  }, [entry]);

  const currentPosition = () =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error(t('clock.denied')));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => reject(new Error(t('clock.denied'))),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });

  const locate = async () => {
    setGeoError('');
    try {
      setCoords(await currentPosition());
    } catch (error) {
      setGeoError(error.message);
    }
  };

  useEffect(() => {
    locate();
  }, []);

  const punch = async (action, branchId, point) => {
    if (!branchId || !point) return;
    setBusy(true);
    const response = await base44.functions.invoke('attendancePunch', {
      branch_id: branchId,
      action,
      lat: point.lat,
      lng: point.lng
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

  // The store screen shows a QR code for the branch and today: scanning it records the punch the
  // person chose at that store at this moment.
  const recordByScan = async (text) => {
    const link = parseKioskLink(text);
    if (!link) {
      toast({ title: t('clock.scanInvalid'), variant: 'destructive' });
      return;
    }
    if (link.date !== todayIso()) {
      toast({ title: t('clock.scanExpired'), variant: 'destructive' });
      return;
    }
    const point = await currentPosition().catch(() => coords);
    if (!point) {
      toast({ title: t('clock.denied'), variant: 'destructive' });
      return;
    }
    setCoords(point);
    setScanOpen(false);
    await punch(mode, link.branchId, point);
  };

  const modeButton = (value, label, Icon) => (
    <Button
      variant={mode === value ? 'default' : 'outline'}
      aria-pressed={mode === value}
      onClick={() => setMode(value)}
      disabled={busy}
    >
      <Icon className="mr-2 h-4 w-4" /> {label}
    </Button>
  );

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
              <Badge variant="secondary">{t('clock.notClockedIn')}</Badge>
            )}
          </div>

          {/* Choosing one of these does not record anything: it tells the record button which
              punch the scan is for. */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t('clock.pickPunch')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {modeButton('in', t('attendance.clockIn'), LogIn)}
              {modeButton('out', t('attendance.clockOut'), LogOut)}
            </div>
          </div>

          <Button className="w-full" size="lg" variant="secondary" onClick={() => setScanOpen(true)} disabled={busy}>
            <ScanLine className="mr-2 h-4 w-4" /> {t('clock.record')}
          </Button>

          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={locate}>
              <MapPin className="mr-2 h-3.5 w-3.5" /> {t('clock.checking')}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{t('clock.hint')}</p>
        </CardContent>
      </Card>

      <QrScannerDialog open={scanOpen} onOpenChange={setScanOpen} onScan={recordByScan} />
    </div>
  );
}