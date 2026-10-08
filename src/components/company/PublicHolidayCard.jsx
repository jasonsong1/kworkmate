import React, { useEffect, useState } from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { normalizeState, regionalMap, stateFromBranch, stateLabel, upcomingHolidays } from '@/lib/holidays';
import { todayIso } from '@/lib/bh';
import { base44 } from '@/api/base44Client';
import RegionalHolidayEditor from '@/components/company/RegionalHolidayEditor';

function formatDay(dateIso, lang) {
  return new Date(`${dateIso}T00:00:00Z`).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-AU', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    timeZone: 'UTC'
  });
}

// Holidays are read from each branch address, with the dates imported from the official
// state schedule on top, so the admin can check what each store is paid by.
export default function PublicHolidayCard({ multiplier }) {
  const { t, lang } = useI18n();
  const { company, branches } = useWorkspace();
  const [records, setRecords] = useState([]);
  const today = todayIso();
  const companyId = company ? company.id : '';

  const load = async () => {
    if (!companyId) return;
    const page = await base44.entities.RegionalHoliday.filter({ company_id: companyId }, { limit: 300 });
    setRecords(page.items || []);
  };

  useEffect(() => {
    load();
  }, [companyId]);

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
    if (group) group.branches.push(branch);
    else groups.push({ state, branches: [branch] });
  });

  const applied = regionalMap(records);

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
              <span className="text-xs text-muted-foreground">
                {group.branches.map((branch) => branch.name || branch.code || '').join(' · ')}
              </span>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">{t('settings.holidayNext')}</p>
            <div className="mt-1 space-y-1">
              {upcomingHolidays(group.state, today, 100, applied).map((holiday) => (
                <div
                  key={`${group.state}-${holiday.date}`}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span>{lang === 'ko' ? holiday.holiday.ko : holiday.holiday.en}</span>
                  <span className="text-muted-foreground">{formatDay(holiday.date, lang)}</span>
                </div>
              ))}
            </div>

            <RegionalHolidayEditor
              state={group.state}
              companyId={companyId}
              defaultRegion={group.branches.map((branch) => branch.suburb).filter(Boolean)[0] || ''}
              records={records.filter((record) => normalizeState(record.state) === group.state)}
              onChanged={load}
            />
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