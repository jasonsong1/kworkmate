import React from 'react';
import { DAYS, SHIFT_BLOCKS } from '@/lib/bh';

export default function AvailabilityChart({ matrix }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-[68px_repeat(3,1fr)] bg-muted/50 text-[11px] font-medium text-muted-foreground">
        <div className="px-3 py-2" />
        {SHIFT_BLOCKS.map((block) => (
          <div key={block.key} className="px-3 py-2 text-center">
            {block.label}
          </div>
        ))}
      </div>
      {DAYS.map((day) => {
        const list = (matrix && matrix[day.key]) || [];
        return (
          <div key={day.key} className="grid grid-cols-[68px_repeat(3,1fr)] border-t">
            <div className="px-3 py-2 text-xs font-medium">{day.short}</div>
            {SHIFT_BLOCKS.map((block) => (
              <div key={block.key} className="px-3 py-2">
                <div
                  className={`h-5 rounded ${
                    list.includes(block.key) ? 'bg-primary' : 'bg-muted'
                  }`}
                  title={list.includes(block.key) ? `${day.short} ${block.label}: available` : `${day.short} ${block.label}: unavailable`}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}