import React from 'react';
import { AVAILABILITY_TIMES, DAYS, normalizeAvailability, setDayAvailability, isDayAvailable } from '@/lib/bh';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AvailabilityMatrix({ value, onChange, disabled }) {
  const matrix = normalizeAvailability(value);
  const update = (dayKey, patch) => onChange(setDayAvailability(matrix, dayKey, patch));

  return (
    <div className="space-y-2">
      <div className="divide-y rounded-lg border">
        {DAYS.map((day) => {
          const entry = matrix[day.key];
          const wrongOrder = Boolean(entry.from && entry.to) && !isDayAvailable(entry);
          return (
            <div key={day.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-24 text-sm font-medium">{day.label}</span>
              <Select
                value={entry.from || undefined}
                disabled={disabled}
                onValueChange={(v) => update(day.key, { from: v })}
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
                disabled={disabled || !entry.from}
                onValueChange={(v) => update(day.key, { to: v })}
              >
                <SelectTrigger className="h-9 w-[118px] text-sm">
                  <SelectValue placeholder="Finish" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITY_TIMES.map((time) => (
                    <SelectItem key={time} value={time}>
                      {time}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {wrongOrder && <span className="text-xs text-destructive">Finish time must be later</span>}
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