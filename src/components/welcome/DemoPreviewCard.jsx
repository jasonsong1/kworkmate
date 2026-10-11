import React from 'react';
import { DEMO_APPLICANTS } from '@/lib/demoData';
import StatusPill from '@/components/demo/StatusPill';

const STAGE_TONE = {
  submitted: 'neutral',
  mini: 'primary',
  video: 'primary',
  interview: 'warn',
  hired: 'success',
  rejected: 'danger',
};

// A still picture of the screening screen, built from the same sample applicants the demo uses.
export default function DemoPreviewCard({ c }) {
  const rows = DEMO_APPLICANTS.filter((a) => a.job_id === 'job-barista' && a.analyzed).slice(0, 4);

  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-xl shadow-primary/5 sm:p-5">
      <div className="flex items-center justify-between gap-3 px-1 pb-3">
        <div>
          <p className="font-heading text-sm font-semibold tracking-tight">{c.welcome.previewTitle}</p>
          <p className="text-xs text-muted-foreground">{c.welcome.previewHint}</p>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          Barista
        </span>
      </div>
      <div className="space-y-2">
        {rows.map((a) => (
          <div key={a.id} className="rounded-2xl border border-border/70 bg-background/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{a.name}</p>
              <StatusPill tone={STAGE_TONE[a.stage] || 'neutral'}>{c.stage[a.stage]}</StatusPill>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${a.score}%` }} />
              </div>
              <span className="text-sm font-semibold tabular-nums">{a.score}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}