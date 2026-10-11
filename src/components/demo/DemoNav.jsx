import React from 'react';
import { cn } from '@/lib/utils';
import { LayoutDashboard, Users, CalendarClock, CalendarDays, ClipboardCheck } from 'lucide-react';

export default function DemoNav({ c, value, onChange }) {
  const items = [
    { key: 'dashboard', label: c.nav.dashboard, icon: LayoutDashboard },
    { key: 'applicants', label: c.nav.applicants, icon: Users },
    { key: 'interviews', label: c.nav.interviews, icon: CalendarClock },
    { key: 'roster', label: c.nav.roster, icon: CalendarDays },
    { key: 'onboarding', label: c.nav.onboarding, icon: ClipboardCheck },
  ];

  return (
    <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = value === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(item.key)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}