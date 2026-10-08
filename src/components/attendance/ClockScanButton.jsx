import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, Loader2, LogIn, LogOut, ScanLine } from 'lucide-react';
import QrScannerDialog from '@/components/attendance/QrScannerDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
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

// One button holds the whole attendance record: 출근 and 퇴근 choose which punch the scan is for,
// and 기록 opens the camera. Nothing is recorded until the store's own code is read.
export default function ClockScanButton({ onRecorded }) {
  const { t } = useI18n();
  const { me } = useWorkspace();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('in');

  // An open entry means this person is on shift, so the way out is the one they most likely need.
  useEffect(() => {
    if (!me) return;
    base44.entities.TimeEntry.
    filter({ employee_email: me.email, status: 'active' }, { limit: 1 }).
    then((page) => setMode((page.items || []).length > 0 ? 'out' : 'in')).
    catch(() => {});
  }, [me]);

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

    const response = await base44.functions.invoke('attendancePunch', {
      branch_id: link.branchId,
      action: mode,
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
    toast({ title: mode === 'in' ? t('clock.inDone') : t('clock.outDone') });
    if (onRecorded) onRecorded();
  };

  return (
    <div className="flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy || !me}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ScanLine className="mr-2 h-4 w-4" />
            )}
            {t('clock.records')}
            <span className="ml-1.5 text-muted-foreground">
              · {mode === 'in' ? t('attendance.clockIn') : t('attendance.clockOut')}
            </span>
            <ChevronDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>{t('clock.records')}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setMode('in')}>
            <LogIn className="mr-2 h-4 w-4" />
            {t('attendance.clockIn')}
            {mode === 'in' && <Check className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMode('out')}>
            <LogOut className="mr-2 h-4 w-4" />
            {t('attendance.clockOut')}
            {mode === 'out' && <Check className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            <ScanLine className="mr-2 h-4 w-4" />
            {t('clock.record')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <QrScannerDialog open={open} onOpenChange={setOpen} onScan={record} />
    </div>
  );
}