import React from 'react';
import { Check } from 'lucide-react';
import { DAYS, SHIFT_BLOCKS } from '@/lib/bh';
import { cn } from '@/lib/utils';

export default function AvailabilityTable({ matrix }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-muted/60 text-muted-foreground">
            <th className="w-24 px-2.5 py-1.5 text-left font-medium">Day</th>
            {SHIFT_BLOCKS.map((block) => (
              <th key={block.key} className="px-2 py-1.5 text-center font-medium">
                {block.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((day) => {
            const list = matrix && Array.isArray(matrix[day.key]) ? matrix[day.key] : [];
            return (
              <tr key={day.key} className="border-t">
                <td className={cn('px-2.5 py-1.5 font-medium', list.length === 0 && 'text-muted-foreground')}>
                  {day.label}
                </td>
                {SHIFT_BLOCKS.map((block) => (
                  <td key={block.key} className="px-1 py-1">
                    {list.includes(block.key) ? (
                      <span className="flex items-center justify-center gap-1 rounded bg-emerald-100 py-1 font-medium text-emerald-700">
                        <Check className="h-3 w-3" /> Yes
                      </span>
                    ) : (
                      <span className="block py-1 text-center text-muted-foreground/50">—</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}