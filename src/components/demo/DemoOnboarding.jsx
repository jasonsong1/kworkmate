import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check, Clock } from 'lucide-react';
import StatusPill from '@/components/demo/StatusPill';

const STATUS_TONE = { pending: 'warn', in_progress: 'primary', completed: 'success' };

export default function DemoOnboarding({ s }) {
  const c = s.c;
  const statusLabel = {
    pending: c.ob.statusPending,
    in_progress: c.ob.statusProgress,
    completed: c.ob.statusDone,
  };

  if (s.onboardings.length === 0) {
    return <p className="text-sm text-muted-foreground">{c.ob.empty}</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">{c.ob.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{c.ob.subtitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">{c.ob.hint}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {s.onboardings.map((o) => (
          <Card key={o.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{o.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {o.position} · {o.branch}
                  </p>
                </div>
                <StatusPill tone={STATUS_TONE[o.status]}>{statusLabel[o.status]}</StatusPill>
              </div>

              <p className="mt-5 text-xs font-semibold tracking-tight text-muted-foreground">
                {c.ob.docs}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {o.docs.map((doc) => (
                  <span
                    key={doc.key}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs"
                  >
                    {doc.state === 'submitted' ? (
                      <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className="truncate">{c.ob.docsList[doc.key]}</span>
                  </span>
                ))}
              </div>

              <p className="mt-5 text-xs font-semibold tracking-tight text-muted-foreground">
                {c.ob.questions}
              </p>
              <div className="mt-2 space-y-1.5">
                {c.ob.questionsList.map((question, i) => (
                  <div key={question} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{question}</span>
                    <span className={o.answers[i] ? 'text-right font-medium' : 'text-right text-muted-foreground'}>
                      {o.answers[i] || c.ob.waiting}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3">
                <p className="text-xs font-semibold tracking-tight text-muted-foreground">{c.ob.signature}</p>
                {o.submittedAt ? (
                  <>
                    <p className="mt-1 font-display text-lg italic">{o.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.ob.submittedAt} {o.submittedAt}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">{c.ob.notSubmitted}</p>
                )}
              </div>

              {o.status !== 'completed' && (
                <Button size="sm" className="mt-4 w-full" onClick={() => s.submitOnboarding(o.id)}>
                  {c.ob.submit}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}