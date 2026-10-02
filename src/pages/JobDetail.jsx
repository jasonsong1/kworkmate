import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Loader2, Sparkles } from 'lucide-react';
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
import { EMPLOYMENT_TYPES, POSITIONS } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

export default function JobDetail() {
  const { jobId } = useParams();
  const { t } = useI18n();
  const { branches, company } = useWorkspace();
  const { toast } = useToast();
  const [job, setJob] = useState(null);
  const [branch, setBranch] = useState(null);
  const [saving, setSaving] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);

  const load = useCallback(async () => {
    const found = await base44.entities.Job.get(jobId).catch(() => null);
    setJob(found);
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
    await base44.entities.Job.update(job.id, {
      title: job.title,
      position: job.position,
      employment_type: job.employment_type,
      hourly_rate: Number(job.hourly_rate) || 0,
      description: job.description || '',
      contact_email: job.contact_email || '',
      screening_min_score: Number(job.screening_min_score) || 60,
      auto_reject_email: job.auto_reject_email !== false,
      mini_interview_enabled: job.mini_interview_enabled !== false,
      screening_criteria: job.screening_criteria || '',
      required_questions: job.required_questions || [],
      custom_questions: job.custom_questions || [],
      brand_color: job.brand_color,
      poster_note: job.poster_note || ''
    });
    setSaving(false);
    toast({ title: 'Job ad saved' });
  };

  const toggleStatus = async () => {
    const next = job.status === 'open' ? 'closed' : 'open';
    await base44.entities.Job.update(job.id, { status: next });
    patch({ status: next });
  };

  const runAi = async () => {
    setAiRunning(true);
    const response = await base44.functions.invoke('analyzeApplicants', { job_id: job.id });
    setAiRunning(false);
    if (response.data?.error) {
      toast({ title: response.data.error, variant: 'destructive' });
      return;
    }
    toast({ title: `AI screened ${response.data.analysed || 0} resume(s)` });
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
            <Button variant="outline" onClick={runAi} disabled={aiRunning}>
              {aiRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {aiRunning ? t('jobs.aiRunning') : t('jobs.runAi')}
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
                      <SelectValue placeholder={t('common.select')} />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <div>
                  <Label>Notification email</Label>
                  <Input value={job.contact_email || ''} onChange={(e) => patch({ contact_email: e.target.value })} />
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
                  <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <span className="text-sm">Mini interview step</span>
                    <Switch
                      checked={job.mini_interview_enabled !== false}
                      onCheckedChange={(v) => patch({ mini_interview_enabled: v })}
                    />
                  </div>
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
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/interview-settings">{t('settings.interviewSetup')}</Link>
                      </Button>
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