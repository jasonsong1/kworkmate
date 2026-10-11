import React from 'react';

export default function WelcomeSteps({ c }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-6">
      <h2 className="font-heading text-2xl font-semibold tracking-tight">{c.welcome.stepsTitle}</h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {c.welcome.steps.map((s, i) => (
          <div key={s.t} className="border-t-2 border-primary/30 pt-5">
            <span className="font-heading text-xs font-semibold tracking-widest text-primary">
              {String(i + 1).padStart(2, '0')}
            </span>
            <p className="mt-2 font-heading text-base font-semibold tracking-tight">{s.t}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.b}</p>
          </div>
        ))}
      </div>
    </section>
  );
}