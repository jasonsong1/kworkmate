import React, { useState } from 'react';
import { Loader2, ScanLine } from 'lucide-react';
import QrScannerDialog from '@/components/attendance/QrScannerDialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { parseKioskLink } from '@/lib/kioskLink';
import { todayIso } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

// The phone's own position, which the store's geofence is checked against.
function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('denied'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error('denied')),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// Opens the phone camera, reads the store's clock-in QR code and records the punch for the
// signed-in person at that store, at this moment.
export default function ClockScanButton({ onRecorded }) {
  const { t } = useI18n();
  const { me } = useWorkspace();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const record = async (text) => {
    const link = parseKioskLink(text);
    if (!link) {
      toast({ title: t('clock.scanInvalid'), variant: 'destructive' });
      return;
    }
    if (link.date !== todayIso()) {
      toast({ title: t('clock.scanExpired'), variant: 'destructive' });
      return;
    }
    setOpen(false);
    setBusy(true);

    const point = await currentPosition().catch(() => null);
    if (!point) {
      setBusy(false);
      toast({ title: t('clock.denied'), variant: 'destructive' });
      return;
    }

    // An entry that is still open means this person is on shift, so the scan closes it.
    const active = await base44.entities.TimeEntry
      .filter({ employee_email: me.email, status: 'active' }, { limit: 1 })
      .then((page) => page.items || [])
      .catch(() => []);
    const action = active.length > 0 ? 'out' : 'in';

    const response = await base44.functions.invoke('attendancePunch', {
      branch_id: link.branchId,
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
    if (onRecorded) onRecorded();
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={busy || !me}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ScanLine className="mr-2 h-4 w-4" />
        )}
        {t('clock.scanButton')}
      </Button>
      <QrScannerDialog open={open} onOpenChange={setOpen} onScan={record} />
    </>
  );
}