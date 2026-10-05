import React from 'react';
import { Loader2, Smartphone, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { formatDateTime } from '@/lib/bh';

// The phones this person has alerts turned on for, so a lost or replaced one can be removed.
export default function WebPushDeviceList({ devices, currentEndpoint, busyId, onRemove }) {
  const { t } = useI18n();

  if (devices.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('push.noDevices')}</p>;
  }

  return (
    <ul className="divide-y rounded-lg border">
      {devices.map((device) => (
        <li key={device.id} className="flex items-center gap-3 px-3 py-2.5">
          <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {device.device_label || device.platform || t('push.device')}
              {device.endpoint && device.endpoint === currentEndpoint ? (
                <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {t('push.thisDevice')}
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {device.last_success_at
                ? `${t('push.lastSent')} · ${formatDateTime(device.last_success_at)}`
                : t('push.notSentYet')}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            disabled={busyId === device.id}
            onClick={() => onRemove(device)}
          >
            {busyId === device.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {t('push.remove')}
              </>
            )}
          </Button>
        </li>
      ))}
    </ul>
  );
}