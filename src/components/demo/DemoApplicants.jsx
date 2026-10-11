import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Gauge, Loader2 } from 'lucide-react';
import DemoApplicantCard from '@/components/demo/DemoApplicantCard';

export default function DemoApplicants({ s }) {
  const c = s.c;
  const shown = s.applicants.filter((a) => s.jobId === 'all' || a.job_id === s.jobId);

  const pill = (key, label) => (
    <button
      key={key}
      type="button"
      onClick={() => s.setJobId(key)}
      className={cn(
        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        s.jobId === key
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:bg-accent'
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold tracking-tight">{c.cand.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{c.cand.subtitle}</p>
        </div>
        <Button size="sm" onClick={s.runScreening} disabled={s.screening}>
          {s.screening ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Gauge className="h-4 w-4" aria-hidden="true" />
          )}
          {s.screening ? c.cand.running : c.cand.run}
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {pill('all', c.cand.all)}
        {s.jobs.map((job) => pill(job.id, `${job.title} · ${job.branch}`))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{c.cand.empty}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((a) => (
            <DemoApplicantCard key={a.id} a={a} c={c} onStage={s.setStage} onHire={s.hire} />
          ))}
        </div>
      )}
    </div>
  );
}