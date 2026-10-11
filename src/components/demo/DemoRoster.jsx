import React from 'react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Wand2, Save, Check } from 'lucide-react';

const minutes = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

export default function DemoRoster({ s }) {
  const { t } = useI18n();
  const c = s.c;
  const dayName = (index) => t(`day.${(index + 1) % 7}`);
  const totalHours = s.shifts.reduce((sum, sh) => sum + (minutes(sh.end) - minutes(sh.start)), 0) / 60;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-tight">{c.roster.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{c.roster.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={s.buildRoster} disabled={s.building}>
            {s.building ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="h-4 w-4" aria-hidden="true" />
            )}
            {s.building ? c.roster.building : c.roster.build}
          </Button>
          <Button size="sm" onClick={s.saveRoster} disabled={s.shifts.length === 0}>
            {s.savedWeek ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {s.savedWeek ? c.roster.saved : c.roster.save}
          </Button>
        </div>
      </div>

      {s.shifts.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {c.roster.total}: <span className="font-semibold text-foreground tabular-nums">{totalHours}</span>h
        </p>
      )}

      {s.shifts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">{c.roster.empty}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {s.week.map((day) => {
            const shifts = s.shifts.filter((sh) => sh.day === day.index);
            return (
              <div key={day.index} className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs font-semibold tracking-tight">{dayName(day.index)}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {day.date.getMonth() + 1}/{day.date.getDate()}
                </p>
                <div className="mt-2.5 space-y-2">
                  {shifts.map((shift) => (
                    <div
                      key={`${shift.employee}-${shift.start}`}
                      className="rounded-lg bg-muted/60 px-2.5 py-2"
                    >
                      <p className="text-xs font-medium tabular-nums">
                        {shift.start}–{shift.end}
                      </p>
                      <p className="mt-0.5 truncate text-xs">{shift.employee}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{shift.position}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}