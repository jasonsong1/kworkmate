import React from 'react';
import { AVAILABILITY_TIMES, DAYS, normalizeAvailability, setDayAvailability } from '@/lib/bh';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AvailabilityMatrix({ value, onChange, disabled }) {
  const matrix = normalizeAvailability(value);
  const update = (dayKey, patch) => onChange(setDayAvailability(matrix, dayKey, patch));

  return (
    <div className="space-y-2">
      <div className="divide-y rounded-lg border">
        {DAYS.map((day) => {
          const entry = matrix[day.key];
          // A finish time can only be picked after the start time, so an invalid range is impossible.
          const finishTimes = entry.from
            ? AVAILABILITY_TIMES.filter((time) => time > entry.from)
            : AVAILABILITY_TIMES;
          return (
            <div key={day.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-24 text-sm font-medium">{day.label}</span>
              <Select
                value={entry.from || undefined}
                disabled={disabled}
                onValueChange={(v) => update(day.key, { from: v, to: entry.to && entry.to > v ? entry.to : '' })}
              >
                <SelectTrigger className="h-9 w-[118px] text-sm">
                  <SelectValue placeholder="Not available" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITY_TIMES.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">to</span>
              <Select
                value={entry.to || undefined}
                disabled={disabled}
                onValueChange={(v) => update(day.key, { to: v })}
              >
                <SelectTrigger className="h-9 w-[118px] text-sm">
                  <SelectValue placeholder="Finish" />
                </SelectTrigger>
                <SelectContent>
                  {finishTimes.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {entry.to && !entry.from && <span className="text-xs text-destructive">Pick a start time too</span>}
              {entry.from && !entry.to && <span className="text-xs text-destructive">Add a finish time</span>}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Pick a start and finish time for every day you can work. Leave the day blank if you cannot work it.
      </p>
    </div>
  );
}