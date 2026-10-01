import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Briefcase, CalendarDays, Layers, Users } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { APPLICANT_STATUS, formatDateTime, todayIso } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

function Kpi({ icon: Icon, label, value }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useI18n();
  const { company, role, activeBranch, branches } = useWorkspace();
  const [kpi, setKpi] = useState({ jobs: 0, applicants: 0, staff: 0, shifts: 0, onboarding: 0 });
  const [recent, setRecent] = useState([]);
  const [delayed, setDelayed] = useState([]);
  const [byBranch, setByBranch] = useState([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = role === 'company_admin';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!company) {
        setLoading(false);
        return;
      }
      const scope = isAdmin ? { company_id: company.id } : { branch_id: activeBranch ? activeBranch.id : '__none__' };
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      const [jobs, applicants, staff, shifts, onboarding, recentList, delayedList] = await Promise.all([
        base44.entities.Job.count({ ...scope, status: 'open' }).catch(() => 0),
        base44.entities.Applicant.count(scope).catch(() => 0),
        base44.entities.EmployeeProfile.count({ ...scope, status: 'active' }).catch(() => 0),
        base44.entities.Shift.count({ ...scope, date: todayIso() }).catch(() => 0),
        base44.entities.EmployeeProfile.count({ ...scope, onboarding_status: { $ne: 'completed' } }).catch(() => 0),
        base44.entities.Applicant.filter(scope, { sort: '-created_date', limit: 5 }).catch(() => []),
        base44.entities.Applicant
          .filter({ ...scope, status: 'final_interview', invited_at: { $lt: twoDaysAgo } })
          .catch(() => [])
      ]);

      if (cancelled) return;
      setKpi({ jobs, applicants, staff, shifts, onboarding });
      setRecent(recentList);
      setDelayed(delayedList.filter((a) => !a.interview_confirmed_at));

      if (isAdmin) {
        const [appsByBranch, staffByBranch] = await Promise.all([
          base44.entities.Applicant.aggregate({ query: { company_id: company.id }, groupBy: 'branch_id' }).catch(() => ({ rows: [] })),
          base44.entities.EmployeeProfile.aggregate({ query: { company_id: company.id }, groupBy: 'branch_id' }).catch(() => ({ rows: [] }))
        ]);
        if (cancelled) return;
        const appMap = {};
        (appsByBranch.rows || []).forEach((r) => {
          appMap[r.branch_id] = r.count;
        });
        const staffMap = {};
        (staffByBranch.rows || []).forEach((r) => {
          staffMap[r.branch_id] = r.count;
        });
        setByBranch(branches.map((b) => ({ ...b, applicants: appMap[b.id] || 0, staff: staffMap[b.id] || 0 })));
      }

      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [company, isAdmin, activeBranch, branches]);

  return (
    <div>
      <PageHeader
        title={t('dashboard.title')}
        subtitle={isAdmin ? t('dashboard.subtitle') : activeBranch ? activeBranch.name : t('dashboard.subtitle')}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Briefcase} label={t('dashboard.openJobs')} value={loading ? '—' : kpi.jobs} />
        <Kpi icon={Users} label={t('dashboard.applicants')} value={loading ? '—' : kpi.applicants} />
        <Kpi icon={Layers} label={t('dashboard.staff')} value={loading ? '—' : kpi.staff} />
        <Kpi icon={CalendarDays} label={t('dashboard.shiftsToday')} value={loading ? '—' : kpi.shifts} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.recent')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('common.none')}</p>
            ) : (
              recent.map((applicant) => {
                const meta = APPLICANT_STATUS[applicant.status] || APPLICANT_STATUS.submitted;
                return (
                  <div key={applicant.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{applicant.full_name}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(applicant.created_date)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {typeof applicant.ai_score === 'number' && (
                        <Badge variant="outline">AI {applicant.ai_score}</Badge>
                      )}
                      <Badge className={meta.tone}>{meta.label}</Badge>
                    </div>
                  </div>
                );
              })
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to="/applicants">{t('applicants.title')}</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> {t('dashboard.delayed')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {delayed.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('common.none')}</p>
            ) : (
              delayed.map((applicant) => (
                <div key={applicant.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{applicant.full_name}</p>
                    <p className="text-xs text-muted-foreground">Invited {formatDateTime(applicant.invited_at)}</p>
                  </div>
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">No response</Badge>
                </div>
              ))
            )}
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {t('dashboard.onboardingPending')}: <span className="font-semibold">{kpi.onboarding}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin && byBranch.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.byBranch')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {byBranch.map((branch) => (
              <div
                key={branch.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{branch.name}</p>
                  <p className="text-xs text-muted-foreground">{branch.code}</p>
                </div>
                <div className="flex gap-6 text-sm">
                  <span>
                    <span className="text-muted-foreground">{t('dashboard.applicants')} </span>
                    {branch.applicants}
                  </span>
                  <span>
                    <span className="text-muted-foreground">{t('dashboard.staff')} </span>
                    {branch.staff}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}