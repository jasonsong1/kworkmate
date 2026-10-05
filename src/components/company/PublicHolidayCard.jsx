import React from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { holidayLabel, stateFromBranch, stateLabel, upcomingHolidays } from '@/lib/holidays';
import { todayIso } from '@/lib/bh';

function formatDay(dateIso, lang) {
  return new Date(`${dateIso}T00:00:00Z`).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-AU', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    timeZone: 'UTC'
  });
}

// Holidays are read from each branch address, so the admin can check which state
// calendar a store is paid by before the payroll export uses it.
export default function PublicHolidayCard({ multiplier }) {
  const { t, lang } = useI18n();
  const { branches } = useWorkspace();
  const today = todayIso();

  const groups = [];
  const missing = [];
  (branches || []).forEach((branch) => {
    const state = stateFromBranch(branch);
    const name = branch.name || branch.code || '';
    if (!state) {
      missing.push(name);
      return;
    }
    const group = groups.find((item) => item.state === state);
    if (group) group.branches.push(name);
    else groups.push({ state, branches: [name] });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('settings.holidayTitle')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('settings.holidayHint')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map((group) => (
          <div key={group.state} className="rounded-lg border px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{stateLabel(group.state, lang)}</span>
              <span className="text-xs text-muted-foreground">{group.branches.join(' · ')}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t('settings.holidayNext')}</p>
            <div className="mt-1 space-y-1">
              {upcomingHolidays(group.state, today, 4).map((holiday) => (
                <div key={`${group.state}-${holiday.date}`} className="flex items-center justify-between gap-4 text-sm">
                  <span>{holidayLabel(holiday.key, lang)}</span>
                  <span className="text-muted-foreground">{formatDay(holiday.date, lang)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {missing.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {t('settings.holidayNoAddress')} <span className="font-medium">{missing.join(' · ')}</span>
          </p>
        ) : null}

        {groups.length === 0 && missing.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('settings.holidayNoAddress')}</p>
        ) : null}

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          {t('settings.holidayRate')} ×{multiplier}
        </p>
      </CardContent>
    </Card>
  );
}