import React from 'react';
import { AVAILABILITY_TIMES, DAYS, normalizeAvailability, setDayAvailability, timeToMinutes } from '@/lib/bh';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// A sentinel for the picker: an empty value is not a selectable choice, so clearing a day goes
// through this one, which is turned back into a blank day.
const NOT_AVAILABLE = 'none';

export default function AvailabilityMatrix({ value, onChange, disabled }) {
  const matrix = normalizeAvailability(value);
  const update = (dayKey, patch) => onChange(setDayAvailability(matrix, dayKey, patch));

  return (
    <div className="space-y-2">
      <div className="divide-y rounded-lg border">
        {DAYS.map((day) => {
          const entry = matrix[day.key];
          // A finish time can only be picked after the start time, so an invalid range is impossible.
          const start = timeToMinutes(entry.from);
          const finishTimes =
            start === null ? AVAILABILITY_TIMES : AVAILABILITY_TIMES.filter((time) => timeToMinutes(time) > start);
          return (
            <div key={day.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-24 text-sm font-medium">{day.label}</span>
              <Select
                value={entry.from || undefined}
                disabled={disabled}
                onValueChange={(v) =>
                  v === NOT_AVAILABLE ?
                  update(day.key, { from: '', to: '' }) :
                  update(day.key, { from: v, to: timeToMinutes(entry.to) > timeToMinutes(v) ? entry.to : '' })
                }
              >
                <SelectTrigger className="h-9 w-[118px] text-sm">
                  <SelectValue placeholder="Not available" />
                </SelectTrigger>
                <SelectContent>
                  {/* The way back to a day off, after a time has been picked. */}
                  <SelectItem value={NOT_AVAILABLE}>Not available</SelectItem>
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
        Pick a start and finish time for every day you can work, and choose Not available to clear a day again.
      </p>
    </div>
  );
}