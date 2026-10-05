import React, { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import QrCard from '@/components/attendance/QrCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { kioskUrl } from '@/lib/kioskLink';
import { todayIso } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

// Employee numbers carry letters as well as digits (ED-003, BOT-00007).
const normaliseNumber = (value) => value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
const normalisePin = (value) => value.replace(/\D/g, '').slice(0, 6);

const ERROR_KEYS = {
  invalid_link: 'attendance.errLink',
  expired_link: 'attendance.errExpired',
  branch_unavailable: 'attendance.errBranch',
  employee_not_found: 'attendance.errNotFound',
  employee_inactive: 'attendance.errInactive',
  pin_required: 'attendance.errPinRequired',
  pin_not_set: 'attendance.errPinNotSet',
  pin_wrong: 'attendance.errPinWrong',
  already_clocked_in: 'attendance.errAlreadyIn',
  not_clocked_in: 'attendance.errNotIn'
};

// Opened from Attendance: the store QR staff scan with their own phone comes first, and the
// keypad for anyone without a phone is the second tab. A punch made here is recorded as
// pending, exactly as it is at the store kiosk.
export default function ClockQrDialog({ open, onOpenChange, branch }) {
  const { t } = useI18n();
  const { company } = useWorkspace();
  const [mode, setMode] = useState('qr');
  const [number, setNumber] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  if (!branch) return null;

  const date = todayIso();
  const url = kioskUrl(branch.id, date);
  const design = (company && company.qr_design) || {};

  const changeNumber = (value) => {
    setDone('');
    setError('');
    setNumber(normaliseNumber(value));
  };

  const changePin = (value) => {
    setDone('');
    setError('');
    setPin(normalisePin(value));
  };

  const punch = async (action) => {
    if (!number) {
      setError(t('attendance.errNumberRequired'));
      return;
    }
    if (!pin) {
      setError(t('attendance.errPinRequired'));
      return;
    }
    setBusy(true);
    setError('');
    const response = await base44.functions.invoke('kioskPunch', {
      token: `${branch.id}~${date}`,
      action,
      employee_number: number,
      pin
    });
    setBusy(false);
    const data = response.data || {};
    if (data.error) {
      setError(t(ERROR_KEYS[data.error] || 'attendance.errLink'));
      return;
    }
    setDone(data.action === 'out' ? t('attendance.clockOutDone') : t('attendance.clockInDone'));
    setNumber('');
    setPin('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('attendance.qrButton')}</DialogTitle>
          <DialogDescription>
            {branch.name} · {date}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={setMode}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="qr">{t('attendance.qrStoreTab')}</TabsTrigger>
            <TabsTrigger value="number">{t('attendance.qrNumberTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="qr" className="space-y-4 pt-4">
            <QrCard
              url={url}
              design={design}
              fallbackTitle={t('attendance.qrTitle')}
              fallbackNote={t('attendance.qrHint')} />
            <button
              type="button"
              onClick={() => window.open(url, '_blank', 'noopener')}
              className="mx-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> {t('attendance.openKiosk')}
            </button>
          </TabsContent>

          <TabsContent value="number" className="space-y-3 pt-4">
            <p className="text-xs text-muted-foreground">{t('attendance.qrNumberHint')}</p>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t('attendance.numberLabel')}</p>
              <Input
                value={number}
                onChange={(event) => changeNumber(event.target.value)}
                placeholder="ED-003"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={busy}
                className="h-14 text-center font-mono text-xl font-bold tracking-widest"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{t('attendance.pinLabel')}</p>
              <Input
                value={pin}
                onChange={(event) => changePin(event.target.value)}
                placeholder="••••"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
                className="h-12 text-center font-mono text-lg tracking-[0.5em]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button disabled={busy} onClick={() => punch('in')}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} {t('attendance.clockIn')}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => punch('out')}>
                {t('attendance.clockOut')}
              </Button>
            </div>

            {done ? <p className="text-sm text-emerald-600 dark:text-emerald-400">{done}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}