import React from 'react';
import { DAYS, dayWindow, weeklyHours, windowHours } from '@/lib/bh';
import { cn } from '@/lib/utils';

export default function AvailabilityTable({ matrix }) {
  const total = weeklyHours(matrix);

  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-muted/60 text-muted-foreground">
            <th className="px-2.5 py-1.5 text-left font-medium">Day</th>
            <th className="px-2 py-1.5 text-left font-medium">From</th>
            <th className="px-2 py-1.5 text-left font-medium">To</th>
            <th className="px-2.5 py-1.5 text-right font-medium">Hours</th>
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day) => {
            const win = dayWindow(matrix, day.key);
            return (
              <tr key={day.key} className="border-t">
                <td className={cn('px-2.5 py-1.5 font-medium', !win && 'text-muted-foreground')}>{day.label}</td>
                {win ? (
                  <>
                    <td className="px-2 py-1.5 font-mono">{win.from}</td>
                    <td className="px-2 py-1.5 font-mono">{win.to}</td>
                    <td className="px-2.5 py-1.5 text-right text-muted-foreground">{windowHours(win)}</td>
                  </>
                ) : (
                  <td colSpan={3} className="px-2 py-1.5 text-center text-muted-foreground/70">
                    Not available
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="border-t bg-muted/30 px-2.5 py-1.5 text-right text-xs text-muted-foreground">
        {DAYS.filter((d) => dayWindow(matrix, d.key)).length}/7 days · {Math.round(total * 10) / 10} h per week
      </div>
    </div>
  );
}