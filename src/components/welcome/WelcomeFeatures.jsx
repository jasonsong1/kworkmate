import React from 'react';
import { Briefcase, Gauge, CalendarClock, ClipboardCheck } from 'lucide-react';

const ICONS = [Briefcase, Gauge, CalendarClock, ClipboardCheck];

export default function WelcomeFeatures({ c }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-14">
      <h2 className="font-heading text-2xl font-semibold tracking-tight">{c.welcome.featuresTitle}</h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {c.welcome.features.map((f, i) => {
          const Icon = ICONS[i];
          return (
            <div key={f.t} className="rounded-2xl border border-border bg-card p-5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="mt-4 font-heading text-sm font-semibold tracking-tight">{f.t}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.b}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}