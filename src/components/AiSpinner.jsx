import React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// Work an AI run does is slower than a page load, so it gets its own sign rather than the plain
// spinner: a ring that keeps turning around a spark, with the whole mark breathing.
export default function AiSpinner({ className }) {
  return (
    <span className={cn('relative inline-flex h-4 w-4 shrink-0 items-center justify-center', className)}>
      <span className="absolute inset-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      <span className="absolute inset-[3px] animate-pulse rounded-full bg-primary/15" />
      <Sparkles className="relative h-2.5 w-2.5 text-primary" />
    </span>
  );
}