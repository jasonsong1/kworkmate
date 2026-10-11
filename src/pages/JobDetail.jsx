import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Loader2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import QuestionBuilder from '@/components/QuestionBuilder';
import PosterStudio from '@/components/PosterStudio';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { EMPLOYMENT_TYPES, visibleRequiredQuestions } from '@/lib/bh';
import { canCreateJob, featureAllowed, videoInterviewAllowed } from '@/lib/packages';
import { base44 } from '@/api/base44Client';

export default function JobDetail() {
  const { jobId } = useParams();
  const { t } = useI18n();
  const { activeBranch, branches, company, pkg, reloadPackage, hasModule } = useWorkspace();
  const { toast } = useToast();
  const videoAllowed = videoInterviewAllowed(pkg);
  // The step and the questions are their own parts of the package, so an ad on a package
  // without them never offers them.
  const miniAllowed = featureAllowed(pkg, 'mini_interview');
  const interviewQuestions = hasModule('interview_settings');
  const roleOptions = (company && company.custom_roles) || [];
  const [job, setJob] = useState(null);
  const [branch, setBranch] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const found = await base44.entities.Job.get(jobId).catch(() => null);
    // Older ads still list a question that is no longer asked; drop it on the way in.
    setJob(found ? { ...found, required_questions: visibleRequiredQuestions(found.required_questions) } : found);
    if (found && found.branch_id) {
      setBranch(branches.find((b) => b.id === found.branch_id) || null);
    }
  }, [jobId, branches]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = (changes) => setJob((prev) => ({ ...prev, ...changes }));

  const save = async () => {
    if (!job) return;
    setSaving(true);
    const openings = Math.max(1, Number(job.openings) || 1);
    // The store the header shows is the store the ad is filed under, so a save made while that
    // store is on screen lands there — never in the branch the account itself was set up in.
    const target = activeBranch || branch;
    try {
      await base44.entities.Job.update(job.id, {
        ...(target ? { branch_id: target.id } : {}),
        title: job.title,
        position: job.position,
        employment_type: job.employment_type,
        hourly_rate: Number(job.hourly_rate) || 0,
        openings,
        description: job.description || '',
        screening_min_score: Number(job.screening_min_score) || 60,
        auto_reject_email: job.auto_reject_email !== false,
        mini_interview_enabled: job.mini_interview_enabled !== false,
        video_interview_enabled: job.video_interview_enabled !== false,
        screening_criteria: job.screening_criteria || '',
        required_questions: visibleRequiredQuestions(job.required_questions),
        custom_questions: job.custom_questions || [],
        brand_color: job.brand_color,
        logo_url: job.logo_url || '',
        poster_note: job.poster_note || ''
      });
      // A closed ad that was closed by its own hiring opens again as soon as there is room for
      // another person.
      if (job.status === 'closed') {
        const hired = await base44.entities.Applicant.count({ job_id: job.id, status: 'hired' });
        if (hired < openings) {
          await base44.entities.Job.update(job.id, { status: 'open' });
          patch({ status: 'open' });
        }
      }
      // The ad is read back before anything is reported, so a save that did not land — a position
      // without write access, say — is never announced as one that did.
      const saved = await base44.entities.Job.get(job.id).catch(() => null);
      // A save is only reported once the ad has been read back in the store on screen: one that
      // came to rest in another branch is a save that did not happen where the manager was working.
      if (!saved || (target && saved.branch_id !== target.id)) throw new Error(t('jobs.saveFailed'));
      patch({ openings, branch_id: saved.branch_id });
      if (target) setBranch(target);
      toast({ title: 'Job ad saved' });
    } catch (error) {
      toast({ title: error.message || t('jobs.saveFailed'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    const next = job.status === 'open' ? 'closed' : 'open';
    // Opening an ad is what the package limits, so the answer comes from the server.
    if (next === 'open' && !canCreateJob(pkg)) {
      toast({
        title: t('pkg.limitTitle'),
        description: pkg && pkg.job_lock ? t('pkg.jobLockHint') : t('pkg.limitBody'),
        variant: 'destructive'
      });
      return;
    }
    await base44.entities.Job.update(job.id, { status: next });
    patch({ status: next });
    await reloadPackage();
  };

  if (!job) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        {t('common.loading')}
      </p>
    );
  }

  const applyUrl = `${window.location.origin}/apply/${job.id}`;

  return (
    <div>
      <PageHeader
        title={job.title}
        subtitle={branch ? branch.name : t('jobs.subtitle')}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/jobs">
                <ArrowLeft className="mr-2 h-4 w-4" /> {t('jobs.title')}
              </Link>
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </>
        }
      />

      <Tabs defaultValue="basics">
        <TabsList>
          <TabsTrigger value="basics">{t('jobs.build')}</TabsTrigger>
          <TabsTrigger value="questions">{t('jobs.questions')}</TabsTrigger>
          <TabsTrigger value="assets">{t('jobs.assets')}</TabsTrigger>
        </TabsList>

        <TabsContent value="basics" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Role</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Job title</Label>
                  <Input value={job.title || ''} onChange={(e) => patch({ title: e.target.value })} />
                </div>
                <div>
                  <Label>{t('common.position')}</Label>
                  <Select value={job.position || ''} onValueChange={(v) => patch({ position: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('role.select')} />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((option) => (
                        <SelectItem key={option.key} value={option.label}>
                          {option.label}
                        </SelectItem>
                      ))}
                      {job.position && !roleOptions.some((option) => option.label === job.position) && (
                        <SelectItem value={job.position}>{job.position}</SelectItem>
                      )}
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
                    value={job.hourly_rate ?? ''}
                    onChange={(e) => patch({ hourly_rate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t('jobs.openings')}</Label>
                  <Input
                    type="number"
                    min="1"
                    value={job.openings ?? 1}
                    onChange={(e) => patch({ openings: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t('jobs.openingsHint')}</p>
                </div>
                <div>
                  <Label>Employment type</Label>
                  <Select value={job.employment_type || 'casual'} onValueChange={(v) => patch({ employment_type: v })}>
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
                <div className="sm:col-span-2">
                  <Label>Description</Label>
                  <Textarea
                    rows={4}
                    value={job.description || ''}
                    onChange={(e) => patch({ description: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('common.status')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{job.status === 'open' ? t('jobs.open') : t(`jobs.${job.status}`)}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.status === 'open' ? 'Accepting applications' : 'Not accepting applications'}
                      </p>
                    </div>
                    <Switch checked={job.status === 'open'} onCheckedChange={toggleStatus} />
                  </div>
                  <div>
                    <Label>{t('jobs.applyLink')}</Label>
                    <div className="mt-1 flex gap-2">
                      <Input readOnly value={applyUrl} className="font-mono text-xs" />
                      <Button
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(applyUrl);
                          toast({ title: t('common.copied') });
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('settings.screening')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {miniAllowed && (
                    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                      <span className="text-sm">{t('settings.miniInterviewStep')}</span>
                      <Switch
                        checked={job.mini_interview_enabled !== false}
                        onCheckedChange={(v) => patch({ mini_interview_enabled: v })}
                      />
                    </div>
                  )}
                  {videoAllowed && (
                    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                      <span className="text-sm">{t('settings.videoInterviewStep')}</span>
                      <Switch
                        checked={job.video_interview_enabled !== false}
                        onCheckedChange={(v) => patch({ video_interview_enabled: v })}
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <span className="text-sm">{t('settings.autoReject')}</span>
                    <Switch
                      checked={job.auto_reject_email !== false}
                      onCheckedChange={(v) => patch({ auto_reject_email: v })}
                    />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <Label>{t('settings.screeningFocus')}</Label>
                      {interviewQuestions && (
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/interview-settings">{t('settings.interviewSetup')}</Link>
                        </Button>
                      )}
                    </div>
                    <Textarea
                      rows={4}
                      value={job.screening_criteria || (company ? company.screening_criteria || '' : '')}
                      onChange={(e) => patch({ screening_criteria: e.target.value })}
                      placeholder="예: 바리스타 경력 2년 이상, 주말 야간 근무 가능, 장기 근무 의향"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{t('settings.screeningFocusHint')}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="questions" className="mt-6">
          <Card>
            <CardContent className="p-5">
              <QuestionBuilder
                required={job.required_questions || []}
                custom={job.custom_questions || []}
                onChangeRequired={(list) => patch({ required_questions: list })}
                onChangeCustom={(list) => patch({ custom_questions: list })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets" className="mt-6">
          <PosterStudio
            job={job}
            branch={branch}
            company={company}
            applyUrl={applyUrl}
            onJobChange={(next) => patch({ ...next })}
          />
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{branch ? branch.name : '—'}</Badge>
        <span>
          {t('jobs.applyLink')}: /apply/{job.id}
        </span>
      </div>
    </div>
  );
}