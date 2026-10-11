import React from 'react';
import { useI18n } from '@/lib/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import StatusPill from '@/components/demo/StatusPill';

export default function DemoInterviews({ s }) {
  const { t } = useI18n();
  const c = s.c;
  const dayName = (index) => t(`day.${(index + 1) % 7}`);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">{c.iv.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{c.iv.subtitle}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {s.slots.map((slot) => {
          const date = s.week[slot.day].date;
          return (
            <Card key={slot.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {dayName(slot.day)} {date.getMonth() + 1}/{date.getDate()}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {slot.start}–{slot.end}
                    </p>
                  </div>
                  <StatusPill tone={slot.applicant ? 'primary' : 'neutral'}>
                    {slot.applicant ? c.iv.booked : c.iv.open}
                  </StatusPill>
                </div>
                <p className="mt-3 text-sm">
                  {slot.applicant ? (
                    <span className="font-medium">{slot.applicant}</span>
                  ) : (
                    <span className="text-muted-foreground">{c.iv.free}</span>
                  )}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {slot.place}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}