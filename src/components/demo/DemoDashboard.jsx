import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Briefcase, Users, Gauge, CalendarDays } from 'lucide-react';

const STAGES = ['screening', 'submitted', 'mini', 'video', 'interview', 'hired', 'rejected'];

export default function DemoDashboard({ s }) {
  const c = s.c;
  const analyzed = s.applicants.filter((a) => a.analyzed);
  const average = analyzed.length
    ? Math.round(analyzed.reduce((sum, a) => sum + a.score, 0) / analyzed.length)
    : 0;
  const todayShifts = s.shifts.filter((sh) => sh.day === s.todayIndex);
  const openJobs = s.jobs.filter((j) => j.status === 'open').length;
  const counts = STAGES.map((key) => ({
    key,
    count: s.applicants.filter((a) =>
      key === 'screening' ? !a.analyzed : a.analyzed && a.stage === key
    ).length,
  }));

  const kpis = [
    { label: c.dash.openJobs, value: openJobs, icon: Briefcase },
    { label: c.dash.applicants, value: s.applicants.length, icon: Users },
    { label: c.dash.fitRate, value: average, icon: Gauge },
    { label: c.dash.todayShifts, value: todayShifts.length, icon: CalendarDays },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">{c.dash.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{c.dash.subtitle}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="mt-3 font-heading text-2xl font-semibold tabular-nums">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <p className="font-heading text-sm font-semibold tracking-tight">{c.dash.pipeline}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.dash.pipelineHint}</p>
            <div className="mt-4 space-y-3">
              {counts.map((stage) => (
                <div key={stage.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{c.stage[stage.key]}</span>
                    <span className="font-medium tabular-nums">{stage.count}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${s.applicants.length ? (stage.count / s.applicants.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="font-heading text-sm font-semibold tracking-tight">{c.dash.today}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.dash.todayHint}</p>
            {todayShifts.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">{c.dash.noToday}</p>
            ) : (
              <div className="mt-4 space-y-2">
                {todayShifts.map((shift) => (
                  <div
                    key={`${shift.employee}-${shift.start}`}
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium">{shift.employee}</p>
                      <p className="text-xs text-muted-foreground">{shift.position}</p>
                    </div>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {shift.start}–{shift.end}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}