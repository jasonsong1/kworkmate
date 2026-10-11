import React from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-600',
};

export default function StatusPill({ tone = 'neutral', children }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
        TONES[tone] || TONES.neutral
      )}
    >
      {children}
    </span>
  );
}