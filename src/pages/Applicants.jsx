import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, MailWarning, Sparkles, UserCheck, UserPlus, UserX } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ApplicantCard from '@/components/ApplicantCard';
import ApplicantDetailDialog from '@/components/ApplicantDetailDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

const INTERVIEW_STATUSES = ['mini_interview', 'final_interview', 'interview_scheduled', 'hired'];

export default function Applicants() {
  const { t } = useI18n();
  const { company, activeBranch } = useWorkspace();
  const { toast } = useToast();

  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState('');
  const [job, setJob] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [counts, setCounts] = useState({ total: 0, interview: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [detail, setDetail] = useState(null);

  const topN = (company && company.ai_top_n) || 10;

  const loadJobs = useCallback(async () => {
    if (!activeBranch) return;
    const page = await base44.entities.Job.filter({ branch_id: activeBranch.id }, { sort: '-created_date', limit: 100 });
    const list = page.items || [];
    setJobs(list);
    setJobId((prev) => (prev && list.some((j) => j.id === prev) ? prev : list[0] ? list[0].id : ''));
  }, [activeBranch]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const loadApplicants = useCallback(async () => {
    if (!jobId) {
      setApplicants([]);
      setJob(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [currentJob, list, total, interviewCount] = await Promise.all([
      base44.entities.Job.get(jobId).catch(() => null),
      base44.entities.Applicant
        .filter({ job_id: jobId }, { sort: '-ai_score', limit: 200 })
        .then((page) => page.items || []),
      base44.entities.Applicant.count({ job_id: jobId }).catch(() => 0),
      base44.entities.Applicant.count({ job_id: jobId, status: { $in: INTERVIEW_STATUSES } }).catch(() => 0)
    ]);
    setJob(currentJob);
    setApplicants(list);
    setCounts({ total, interview: interviewCount });
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    loadApplicants();
  }, [loadApplicants]);

  const viewResume = async (applicant) => {
    if (!applicant.resume_file_uri) {
      toast({ title: 'No resume attached', variant: 'destructive' });
      return;
    }
    const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({
      file_uri: applicant.resume_file_uri
    });
    window.open(signed_url, '_blank', 'noopener');
  };

  const act = async (applicant, action) => {
    setBusyId(applicant.id);
    try {
      if (action === 'mini') {
        await base44.entities.Applicant.update(applicant.id, { status: 'mini_interview' });
        toast({ title: `${applicant.full_name} → mini interview` });
      } else if (action === 'invite') {
        const response = await base44.functions.invoke('notifyApplicant', {
          applicant_id: applicant.id,
          type: 'interview_invite',
          origin: window.location.origin
        });
        if (response.data?.error) throw new Error(response.data.error);
        toast({ title: `Interview invitation sent to ${applicant.full_name}` });
      } else if (action === 'hire') {
        const response = await base44.functions.invoke('hireApplicant', {
          applicant_id: applicant.id,
          origin: window.location.origin
        });
        if (response.data?.error) throw new Error(response.data.error);
        toast({ title: `Hired · employee no. ${response.data.employee.employee_number}` });
      } else if (action === 'reject') {
        const response = await base44.functions.invoke('notifyApplicant', {
          applicant_id: applicant.id,
          type: 'rejection',
          origin: window.location.origin
        });
        if (response.data?.error) throw new Error(response.data.error);
        toast({ title: `Rejection email sent to ${applicant.full_name}` });
      }
      await loadApplicants();
    } catch (error) {
      toast({ title: error.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const shiftWindow = async (delta) => {
    if (!job) return;
    const next = Math.max(1, (job.top_n_cycle || 1) + delta);
    await base44.entities.Job.update(job.id, { top_n_cycle: next });
    setJob({ ...job, top_n_cycle: next });
  };

  const rejectUnselected = async () => {
    if (!job) return;
    const response = await base44.functions.invoke('analyzeApplicants', {
      job_id: job.id,
      action: 'send_rejections'
    });
    if (response.data?.error) {
      toast({ title: response.data.error, variant: 'destructive' });
      return;
    }
    toast({ title: `${response.data.sent || 0} rejection email(s) sent` });
    await loadApplicants();
  };

  const ranked = applicants.filter((a) => typeof a.ai_score === 'number');
  const cycle = (job && job.top_n_cycle) || 1;
  const windowStart = (cycle - 1) * topN;
  const shortlist = ranked.slice(windowStart, windowStart + topN);
  const interviewList = applicants.filter((a) => INTERVIEW_STATUSES.includes(a.status));
  const maxCycle = Math.max(1, Math.ceil(ranked.length / topN));

  const actionButtons = (applicant) => (
    <>
      {job && job.mini_interview_enabled !== false && applicant.status === 'top10' && (
        <Button size="sm" variant="secondary" disabled={busyId === applicant.id} onClick={() => act(applicant, 'mini')}>
          <UserPlus className="mr-1.5 h-3.5 w-3.5" /> {t('applicants.miniInterview')}
        </Button>
      )}
      {['top10', 'mini_interview', 'final_interview'].includes(applicant.status) && (
        <Button size="sm" disabled={busyId === applicant.id} onClick={() => act(applicant, 'invite')}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" /> {t('applicants.invite')}
        </Button>
      )}
      {['final_interview', 'interview_scheduled'].includes(applicant.status) && (
        <Button size="sm" variant="default" disabled={busyId === applicant.id} onClick={() => act(applicant, 'hire')}>
          <UserCheck className="mr-1.5 h-3.5 w-3.5" /> {t('applicants.hire')}
        </Button>
      )}
      {applicant.status !== 'rejected' && applicant.status !== 'hired' && (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={busyId === applicant.id}
          onClick={() => act(applicant, 'reject')}
        >
          <UserX className="mr-1.5 h-3.5 w-3.5" /> {t('applicants.reject')}
        </Button>
      )}
    </>
  );

  return (
    <div>
      <PageHeader
        title={t('applicants.title')}
        subtitle={activeBranch ? activeBranch.name : t('applicants.title')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={jobId} onValueChange={setJobId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder={t('jobs.title')} />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {job && (
              <Button variant="outline" onClick={rejectUnselected}>
                <MailWarning className="mr-2 h-4 w-4" /> {t('applicants.rejectAll')}
              </Button>
            )}
          </div>
        }
      />

      {!jobId ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">{t('common.none')}</CardContent>
        </Card>
      ) : loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          {t('common.loading')}
        </p>
      ) : (
        <Tabs defaultValue="shortlist">
          <TabsList>
            <TabsTrigger value="shortlist">
              {t('applicants.tabTop')} ({shortlist.length})
            </TabsTrigger>
            <TabsTrigger value="interview">
              {t('applicants.tabInterview')} ({counts.interview})
            </TabsTrigger>
            <TabsTrigger value="all">
              {t('applicants.tabAll')} ({counts.total})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="shortlist" className="mt-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                Showing candidates {ranked.length === 0 ? 0 : windowStart + 1}–
                {Math.min(windowStart + topN, ranked.length)} of {ranked.length} scored
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={cycle <= 1} onClick={() => shiftWindow(-1)}>
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Previous 10
                </Button>
                <Button size="sm" disabled={cycle >= maxCycle} onClick={() => shiftWindow(1)}>
                  {t('applicants.next10')} <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {shortlist.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center text-sm text-muted-foreground">
                  {t('applicants.empty')}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {shortlist.map((applicant) => (
                  <ApplicantCard
                    key={applicant.id}
                    applicant={applicant}
                    actions={actionButtons(applicant)}
                    onOpen={() => setDetail(applicant)}
                    onViewResume={() => viewResume(applicant)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="interview" className="mt-6">
            {interviewList.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center text-sm text-muted-foreground">
                  {t('applicants.empty')}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {interviewList.map((applicant) => (
                  <ApplicantCard
                    key={applicant.id}
                    applicant={applicant}
                    actions={actionButtons(applicant)}
                    onOpen={() => setDetail(applicant)}
                    onViewResume={() => viewResume(applicant)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all" className="mt-6">
            {applicants.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center text-sm text-muted-foreground">
                  {t('applicants.empty')}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {applicants.map((applicant) => (
                  <ApplicantCard
                    key={applicant.id}
                    applicant={applicant}
                    actions={actionButtons(applicant)}
                    onOpen={() => setDetail(applicant)}
                    onViewResume={() => viewResume(applicant)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <ApplicantDetailDialog
        applicant={detail}
        open={Boolean(detail)}
        onOpenChange={(v) => !v && setDetail(null)}
      />
    </div>
  );
}