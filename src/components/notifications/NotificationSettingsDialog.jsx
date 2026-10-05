import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, Check, Loader2, Share, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';
import { currentEndpoint, deviceLabel, disableWebPush, enableWebPush, pushEnvironment } from '@/lib/webPush';
import WebPushDeviceList from './WebPushDeviceList';

// Turning phone alerts on or off, on the phone the person is holding.
export default function NotificationSettingsDialog({ open, onOpenChange }) {
  const { t, lang } = useI18n();
  const [state, setState] = useState('ready');
  const [endpoint, setEndpoint] = useState('');
  const [devices, setDevices] = useState([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setState(pushEnvironment().state);
    setEndpoint(await currentEndpoint());
    const response = await base44.functions.invoke('webPush', { action: 'status' }).catch(() => null);
    setDevices((response && response.data && response.data.devices) || []);
  }, []);

  useEffect(() => {
    if (!open) return;
    setNote('');
    load();
  }, [open, load]);

  const enable = async () => {
    setBusy('enable');
    setNote('');
    try {
      await enableWebPush({ language: lang, label: deviceLabel() });
      setNote(t('push.enabled'));
      await load();
    } catch (error) {
      const reason = (error && error.message) || '';
      if (reason === 'denied') setNote(t('push.denied'));
      else if (reason === 'ios_install') setNote(t('push.iosNote'));
      else if (reason === 'unsupported') setNote(t('push.unsupported'));
      else if (reason === 'insecure') setNote(t('push.insecure'));
      else setNote(t('push.failed'));
      setState(pushEnvironment().state);
    } finally {
      setBusy('');
    }
  };

  const turnOff = async () => {
    setBusy('off');
    setNote('');
    await disableWebPush().catch(() => null);
    setNote(t('push.disabled'));
    await load();
    setBusy('');
  };

  const sendTest = async () => {
    setBusy('test');
    setNote('');
    const response = await base44.functions
      .invoke('webPush', { action: 'test', title: t('push.testTitle'), body: t('push.testBody') })
      .catch(() => null);
    const sent = response && response.data ? response.data.sent : 0;
    setNote(sent > 0 ? t('push.testSent') : t('push.testNone'));
    setBusy('');
  };

  const removeDevice = async (device) => {
    setBusy(device.id);
    if (device.endpoint && device.endpoint === endpoint) {
      await disableWebPush().catch(() => null);
    } else {
      await base44.functions.invoke('webPush', { action: 'remove', id: device.id }).catch(() => null);
    }
    await load();
    setBusy('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-primary" />
            {t('push.title')}
          </DialogTitle>
          <DialogDescription>{t('push.lead')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {state === 'ios_install' ? (
            <div className="space-y-1.5 rounded-lg border bg-muted/40 p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Share className="h-4 w-4" /> {t('push.iosTitle')}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">{t('push.iosStep1')}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{t('push.iosStep2')}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{t('push.iosStep3')}</p>
              <p className="pt-1 text-[11px] text-muted-foreground">{t('push.iosNote')}</p>
            </div>
          ) : null}

          {state === 'unsupported' || state === 'insecure' ? (
            <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              {state === 'insecure' ? t('push.insecure') : t('push.unsupported')}
            </div>
          ) : null}

          {state === 'ready' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 rounded-lg border p-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${endpoint ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                <p className="text-sm">{endpoint ? t('push.on') : t('push.off')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {endpoint ? (
                  <>
                    <Button onClick={sendTest} disabled={busy !== ''}>
                      {busy === 'test' ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {t('push.test')}
                    </Button>
                    <Button variant="outline" onClick={turnOff} disabled={busy !== ''}>
                      {busy === 'off' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {t('push.turnOff')}
                    </Button>
                  </>
                ) : (
                  <Button onClick={enable} disabled={busy !== ''}>
                    {busy === 'enable' ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <BellRing className="mr-2 h-4 w-4" />
                    )}
                    {busy === 'enable' ? t('push.enabling') : t('push.enable')}
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {note ? <p className="text-xs font-medium text-primary">{note}</p> : null}

          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Smartphone className="h-3.5 w-3.5" /> {t('push.devices')}
            </p>
            <WebPushDeviceList
              devices={devices}
              currentEndpoint={endpoint}
              busyId={busy}
              onRemove={removeDevice}
            />
          </div>

          <p className="text-[11px] leading-snug text-muted-foreground">{t('push.emailNote')}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}