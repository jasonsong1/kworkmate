import React from 'react';
import { X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DAYS, TIME_OPTIONS, clearDayWindow, dayWindow, setDayWindow } from '@/lib/bh';
import { cn } from '@/lib/utils';

function TimeSelect({ value, placeholder, disabled, onChange }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-8 w-[104px] text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {TIME_OPTIONS.map((time) => (
          <SelectItem key={time} value={time}>
            {time}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function AvailabilityMatrix({ value, onChange, disabled }) {
  const matrix = value || {};

  return (
    <div className="divide-y rounded-lg border">
      {DAYS.map((day) => {
        const win = dayWindow(matrix, day.key);
        return (
          <div key={day.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className={cn('w-24 text-sm', win ? 'font-medium' : 'text-muted-foreground')}>{day.label}</span>
            <TimeSelect
              value={win ? win.from : ''}
              placeholder="From"
              disabled={disabled}
              onChange={(v) => onChange(setDayWindow(matrix, day.key, { from: v }))}
            />
            <span className="text-xs text-muted-foreground">to</span>
            <TimeSelect
              value={win ? win.to : ''}
              placeholder="To"
              disabled={disabled}
              onChange={(v) => onChange(setDayWindow(matrix, day.key, { to: v }))}
            />
            {win ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(clearDayWindow(matrix, day.key))}
                className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
                aria-label={`Clear ${day.label}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="ml-auto text-xs text-muted-foreground">Not available</span>
            )}
          </div>
        );
      })}
    </div>
  );
}