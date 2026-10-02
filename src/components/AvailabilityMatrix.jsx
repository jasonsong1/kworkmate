import React from 'react';
import { DAYS, SHIFT_BLOCKS, toggleAvailability } from '@/lib/bh';
import { cn } from '@/lib/utils';

export default function AvailabilityMatrix({ value, onChange, disabled }) {
  const matrix = value || {};

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-24" />
            {DAYS.map((day) => (
              <th key={day.key} className="px-1 py-2 text-center text-xs font-medium text-muted-foreground">
                {day.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SHIFT_BLOCKS.map((block) => (
            <tr key={block.key}>
              <td className="py-1 pr-2 text-xs text-muted-foreground">{block.label}</td>
              {DAYS.map((day) => {
                const active = Array.isArray(matrix[day.key]) && matrix[day.key].includes(block.key);
                return (
                  <td key={`${day.key}-${block.key}`} className="p-0.5">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => !disabled && onChange(toggleAvailability(matrix, day.key, block.key))}
                      className={cn(
                        'h-9 w-full rounded-md border text-xs transition-colors',
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background text-muted-foreground hover:bg-muted',
                        disabled && 'opacity-60'
                      )}
                      aria-label={`${day.label} ${block.label}`}
                    >
                      {active ? '✓' : ''}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}