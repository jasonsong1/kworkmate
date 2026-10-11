import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ActionChip({ icon: Icon, label, onClick, active = false, danger = false }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn(
        'h-8 gap-1.5 px-2.5 text-xs font-medium',
        active && 'border-primary/40 bg-primary/10 text-primary',
        danger && 'text-destructive hover:text-destructive'
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </Button>
  );
}