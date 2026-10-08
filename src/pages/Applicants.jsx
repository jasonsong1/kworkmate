import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, MailWarning, Sparkles, UserCheck, UserPlus, UserX, Video } from 'lucide-react';
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
import { featureAllowed, videoInterviewAllowed } from '@/lib/packages';
import { base44 } from '@/api/base44Client';

// The final-interview tab lists the people the employer has actually invited on, so it opens
// with the invite button and nothing before it.
const INTERVIEW_STATUSES = ['final_interview', 'interview_scheduled', 'hired'];

// Anyone the screening has recommended — and anyone who has moved further along — is on the
// shortlist, so a second screening run adds to the list instead of replacing it.
const SHORTLIST_STATUSES = ['top10', 'mini_interview', 'final_interview', 'interview_scheduled', 'hired'];

export default function Applicants() {
  const { t } = useI18n();
  const { company, activeBranch, pkg } = useWorkspace();
  const videoAllowed = videoInterviewAllowed(pkg);
  const miniAllowed = featureAllowed(pkg, 'mini_interview');
  const { toast } = useToast();

  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState('');
  const [job, setJob] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [counts, setCounts] = useState({ total: 0, interview: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  // Held by id so the dialog always shows the freshest record, including email status.
  const [detailId, setDetailId] = useState('');
  const [screening, setScreening] = useState(false);

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
      if (action === 'video') {
        const response = await base44.functions.invoke('sendVideoInterview', {
          applicant_id: applicant.id,
          origin: window.location.origin
        });
        if (response.data?.error) throw new Error(response.data.error);
        toast({ title: `Video interview link sent to ${applicant.full_name}` });
      } else if (action === 'mini') {
        const response = await base44.functions.invoke('sendMiniInterview', {
          applicant_id: applicant.id,
          origin: window.location.origin
        });
        if (response.data?.error) throw new Error(response.data.error);
        toast({ title: `Voice interview link sent to ${applicant.full_name}` });
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

  // Scores every resume that has not been read yet, then adds one more batch to the shortlist.
  // The batch is the size set in company settings, and it never re-picks anyone already picked.
  const runScreening = async () => {
    if (!job) return;
    setScreening(true);
    try {
      let analysed = 0;
      for (let round = 0; round < 15; round += 1) {
        const response = await base44.functions.invoke('analyzeApplicants', { job_id: job.id });
        if (response.data?.error) throw new Error(response.data.error);
        analysed += response.data.analysed || 0;
        if (!response.data.pending_left) break;
      }
      const extended = await base44.functions.invoke('analyzeApplicants', {
        job_id: job.id,
        action: 'extend'
      });
      if (extended.data?.error) throw new Error(extended.data.error);
      toast({
        title: t('applicants.screened')
          .replace('{count}', String(analysed))
          .replace('{added}', String(extended.data.added || 0))
      });
      await loadApplicants();
    } catch (error) {
      toast({ title: error.message, variant: 'destructive' });
    } finally {
      setScreening(false);
    }
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

  const shortlist = applicants.filter((a) => SHORTLIST_STATUSES.includes(a.status));
  const interviewList = applicants.filter((a) => INTERVIEW_STATUSES.includes(a.status));

  const actionButtons = (applicant) => (
    <>
      {miniAllowed && job && job.mini_interview_enabled !== false && applicant.status === 'top10' && (
        <Button size="sm" variant="secondary" disabled={busyId === applicant.id} onClick={() => act(applicant, 'mini')}>
          {applicant.mini_interview_status === 'sent' ? (
            <Check className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          )}
          {applicant.mini_interview_status === 'sent' ? t('applicants.miniInterviewSent') : t('applicants.miniInterview')}
        </Button>
      )}
      {videoAllowed &&
        job &&
        job.video_interview_enabled !== false &&
        (!company || company.video_interview_enabled !== false) &&
        ['top10', 'mini_interview'].includes(applicant.status) &&
        applicant.video_interview_status !== 'completed' && (
          <Button size="sm" variant="secondary" disabled={busyId === applicant.id} onClick={() => act(applicant, 'video')}>
            {applicant.video_interview_status === 'sent' ? (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Video className="mr-1.5 h-3.5 w-3.5" />
            )}
            {applicant.video_interview_status === 'sent'
              ? t('applicants.videoInterviewSent')
              : t('applicants.videoInterview')}
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
              <>
                <Button variant="outline" onClick={runScreening} disabled={screening}>
                  {screening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {screening ? t('jobs.aiRunning') : t('applicants.addScreening')}
                </Button>
                <Button variant="outline" onClick={rejectUnselected}>
                  <MailWarning className="mr-2 h-4 w-4" /> {t('applicants.rejectAll')}
                </Button>
              </>
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
            <div className="mb-4 rounded-xl border bg-muted/30 px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {t('applicants.shortlistHint')
                  .replace('{count}', String(shortlist.length))
                  .replace('{size}', String(topN))}
              </p>
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
                    onOpen={() => setDetailId(applicant.id)}
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
                    onOpen={() => setDetailId(applicant.id)}
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
                    onOpen={() => setDetailId(applicant.id)}
                    onViewResume={() => viewResume(applicant)}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <ApplicantDetailDialog
        applicant={applicants.find((a) => a.id === detailId) || null}
        open={Boolean(detailId)}
        onOpenChange={(v) => !v && setDetailId('')}
        onResent={loadApplicants}
      />
    </div>
  );
}