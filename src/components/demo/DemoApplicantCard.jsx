import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Mic, Video, CalendarPlus, UserCheck, UserX } from 'lucide-react';
import StatusPill from '@/components/demo/StatusPill';
import ActionChip from '@/components/demo/ActionChip';

const STAGE_TONE = {
  submitted: 'neutral',
  mini: 'primary',
  video: 'primary',
  interview: 'warn',
  hired: 'success',
  rejected: 'danger',
};

export default function DemoApplicantCard({ a, c, onStage, onHire }) {
  const closed = a.stage === 'hired' || a.stage === 'rejected';

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{a.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {a.email} · {a.phone}
            </p>
          </div>
          <StatusPill tone={a.analyzed ? STAGE_TONE[a.stage] || 'neutral' : 'neutral'}>
            {a.analyzed ? c.stage[a.stage] : c.cand.pending}
          </StatusPill>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{c.cand.fitRate}</span>
          {a.analyzed ? (
            <>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${a.score}%` }} />
              </div>
              <span className="text-sm font-semibold tabular-nums">{a.score}</span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">{c.cand.pending}</span>
          )}
        </div>

        {a.summary && <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a.summary}</p>}

        {a.skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {a.skills.map((s) => (
              <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {s}
              </span>
            ))}
          </div>
        )}

        {a.flags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {a.flags.map((s) => (
              <span key={s} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                {c.cand.flags}: {s}
              </span>
            ))}
          </div>
        )}

        {!closed && (
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-3">
            <ActionChip icon={Mic} label={c.cand.mini} active={a.stage === 'mini'} onClick={() => onStage(a.id, 'mini')} />
            <ActionChip icon={Video} label={c.cand.video} active={a.stage === 'video'} onClick={() => onStage(a.id, 'video')} />
            <ActionChip
              icon={CalendarPlus}
              label={c.cand.invite}
              active={a.stage === 'interview'}
              onClick={() => onStage(a.id, 'interview')}
            />
            <ActionChip icon={UserCheck} label={c.cand.hire} onClick={() => onHire(a)} />
            <ActionChip icon={UserX} label={c.cand.reject} danger onClick={() => onStage(a.id, 'rejected')} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}