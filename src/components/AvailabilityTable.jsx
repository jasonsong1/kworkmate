import React from 'react';
import { DAYS, isDayAvailable, normalizeAvailability } from '@/lib/bh';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export default function AvailabilityTable({ matrix }) {
  const { t } = useI18n();
  const clean = normalizeAvailability(matrix);

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-muted/60 text-muted-foreground">
            <th className="w-24 px-2.5 py-1.5 text-left font-medium">{t('availability.day')}</th>
            <th className="px-2.5 py-1.5 text-left font-medium">{t('availability.hours')}</th>
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day) => {
            const entry = clean[day.key];
            const ok = isDayAvailable(entry);
            return (
              <tr key={day.key} className="border-t">
                <td className={cn('px-2.5 py-1.5 font-medium', !ok && 'text-muted-foreground')}>{day.label}</td>
                <td className={cn('px-2.5 py-1.5', ok ? 'font-medium tabular-nums' : 'text-muted-foreground/50')}>
                  {ok ? `${entry.from} – ${entry.to}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}