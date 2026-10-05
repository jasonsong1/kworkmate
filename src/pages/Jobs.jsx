import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, Copy, Loader2, Plus } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { EMPLOYMENT_TYPES, defaultRequiredQuestions, money } from '@/lib/bh';
import { canCreateJob } from '@/lib/packages';
import { base44 } from '@/api/base44Client';

const statusTone = {
  open: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  draft: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
  closed: 'bg-slate-200 text-slate-500 hover:bg-slate-200'
};

export default function Jobs() {
  const { t } = useI18n();
  const { company, activeBranch, pkg, reloadPackage } = useWorkspace();
  const canCreate = canCreateJob(pkg);
  const { toast } = useToast();
  const navigate = useNavigate();
  const roleOptions = (company && company.custom_roles) || [];
  const [jobs, setJobs] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', position: '', employment_type: 'casual', hourly_rate: '' });

  const load = useCallback(async () => {
    if (!activeBranch) {
      setJobs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [list, grouped] = await Promise.all([
      base44.entities.Job
        .filter({ branch_id: activeBranch.id }, { sort: '-created_date', limit: 100 })
        .then((page) => page.items || []),
      base44.entities.Applicant.aggregate({ query: { branch_id: activeBranch.id }, groupBy: 'job_id' }).catch(() => ({ rows: [] }))
    ]);
    setJobs(list);
    const map = {};
    (grouped.rows || []).forEach((row) => {
      map[row.job_id] = row.count;
    });
    setCounts(map);
    // Open ads and the package limit move together, so refresh both together.
    await reloadPackage();
    setLoading(false);
  }, [activeBranch]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!form.title.trim() || !activeBranch) return;
    setSaving(true);
    const job = await base44.entities.Job.create({
      company_id: activeBranch.company_id,
      branch_id: activeBranch.id,
      title: form.title,
      position: form.position,
      employment_type: form.employment_type,
      hourly_rate: Number(form.hourly_rate) || 0,
      description: '',
      status: 'draft',
      required_questions: defaultRequiredQuestions(),
      custom_questions: [],
      screening_min_score: 60,
      auto_reject_email: company ? company.auto_reject_email !== false : true,
      mini_interview_enabled: company ? company.mini_interview_enabled !== false : true,
      video_interview_enabled: company ? company.video_interview_enabled !== false : false,
      contact_email: company ? company.contact_email : '',
      brand_color: activeBranch.brand_color || '#4338ca',
      logo_url: activeBranch.logo_url || '',
      top_n_cycle: 1
    });
    setSaving(false);
    setOpen(false);
    setForm({ title: '', position: '', employment_type: 'casual', hourly_rate: '' });
    toast({ title: 'Job ad created' });
    await load();
    navigate(`/jobs/${job.id}`);
  };

  return (
    <div>
      <PageHeader
        title={t('jobs.title')}
        subtitle={activeBranch ? activeBranch.name : t('jobs.subtitle')}
        actions={
          <Button onClick={() => setOpen(true)} disabled={!activeBranch || !canCreate}>
            <Plus className="mr-2 h-4 w-4" /> {t('jobs.add')}
          </Button>
        }
      />

      {!canCreate && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-sm">
            <p className="font-semibold">{t('pkg.limitTitle')}</p>
            <p className="mt-1 text-muted-foreground">
              {pkg && pkg.job_lock ? t('pkg.jobLockHint') : t('pkg.limitBody')}
            </p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          {t('common.loading')}
        </p>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">{t('common.none')}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((job) => (
            <Card key={job.id} className="transition-shadow hover:shadow-md">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{job.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.position || '—'} · {job.employment_type || 'casual'}
                    </p>
                  </div>
                  <Badge className={statusTone[job.status] || statusTone.draft}>
                    {t(`jobs.${job.status}`)}
                  </Badge>
                </div>

                <div className="mt-4 flex items-center gap-4 text-sm">
                  <span className="font-medium">{job.hourly_rate ? money(job.hourly_rate) : '—'}</span>
                  <span className="text-muted-foreground">
                    {counts[job.id] || 0} {t('dashboard.applicants')}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" asChild>
                    <Link to={`/jobs/${job.id}`}>
                      <Briefcase className="mr-1.5 h-3.5 w-3.5" /> {t('jobs.build')}
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/apply/${job.id}`);
                      toast({ title: t('common.copied') });
                    }}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> URL
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('jobs.add')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Job title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Crew Member — Mascot"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>{t('common.position')}</Label>
                <Select
                  value={form.position}
                  onValueChange={(v) => setForm({ ...form, position: v })}
                  disabled={roleOptions.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('role.select')} />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option.key} value={option.label}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {roleOptions.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">{t('role.noneHint')}</p>
                )}
              </div>
              <div>
                <Label>{t('common.rate')} (AUD)</Label>
                <Input
                  type="number"
                  value={form.hourly_rate}
                  onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                  placeholder="31.50"
                />
              </div>
            </div>
            <div>
              <Label>Employment type</Label>
              <Select value={form.employment_type} onValueChange={(v) => setForm({ ...form, employment_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_TYPES.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={create} disabled={saving || !form.title.trim()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}