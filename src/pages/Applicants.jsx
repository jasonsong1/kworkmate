import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MailWarning,
  Sparkles,
  UserCheck,
  UserPlus,
  UserX,
  Video
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AiSpinner from '@/components/AiSpinner';
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

const PAGE_SIZE = 10;
const INTERVIEW_STATUSES = ['final_interview', 'interview_scheduled', 'hired'];
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
  const [detailId, setDetailId] = useState('');
  const [screening, setScreening] = useState(false);
  const [activeTab, setActiveTab] = useState('shortlist');
  const [page, setPage] = useState(1);

  const loadJobs = useCallback(async () => {
    if (!activeBranch) return;
    const pageData = await base44.entities.Job.filter(
      { branch_id: activeBranch.id },
      { sort: '-created_date', limit: 100 }
    );
    const list = pageData.items || [];
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
      base44.entities.Applicant.filter({ job_id: jobId }, { sort: '-ai_score', limit: 300 }).then(
        (pageData) => pageData.items || []
      ),
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

  // 탭이나 공고가 바뀌면 페이지 번호를 1페이지로 리셋
  useEffect(() => {
    setPage(1);
  }, [activeTab, jobId]);

  const viewResume = async (applicant) => {
    if (!applicant.resume_file_uri) {
      toast({ title: '이력서 파일이 첨부되어 있지 않습니다.', variant: 'destructive' });
      return;
    }
    try {
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({
        file_uri: applicant.resume_file_uri
      });
      window.open(signed_url, '_blank', 'noopener');
    } catch (e) {
      toast({ title: '이력서를 열 수 없습니다.', variant: 'destructive' });
    }
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
        toast({ title: `화상 면접 안내 메일을 ${applicant.full_name}님께 전송했습니다.` });
      } else if (action === 'mini') {
        const response = await base44.functions.invoke('sendMiniInterview', {
          applicant_id: applicant.id,
          origin: window.location.origin
        });
        if (response.data?.error) throw new Error(response.data.error);
        toast({ title: `미니 음성면접 안내를 ${applicant.full_name}님께 전송했습니다.` });
      } else if (action === 'invite') {
        const response = await base44.functions.invoke('notifyApplicant', {
          applicant_id: applicant.id,
          type: 'interview_invite',
          origin: window.location.origin
        });
        if (response.data?.error) throw new Error(response.data.error);
        toast({ title: `최종 면접 초대 메일을 ${applicant.full_name}님께 전송했습니다.` });
      } else if (action === 'hire') {
        const response = await base44.functions.invoke('hireApplicant', {
          applicant_id: applicant.id,
          origin: window.location.origin
        });
        if (response.data?.error) throw new Error(response.data.error);
        toast({ title: `채용 완료 · 사원번호 ${response.data.employee?.employee_number || ''}` });
      } else if (action === 'reject') {
        const response = await base44.functions.invoke('notifyApplicant', {
          applicant_id: applicant.id,
          type: 'rejection',
          origin: window.location.origin
        });
        if (response.data?.error) throw new Error(response.data.error);
        toast({ title: `${applicant.full_name} 지원자 거절 처리가 완료되었습니다.` });
      }
      await loadApplicants();
    } catch (error) {
      toast({ title: error.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

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
    try {
      const response = await base44.functions.invoke('analyzeApplicants', {
        job_id: job.id,
        action: 'send_rejections'
      });
      if (response.data?.error) {
        toast({ title: response.data.error, variant: 'destructive' });
        return;
      }
      toast({ title: `${response.data.sent || 0}명의 미선별자 거절 메일 전송 및 상태 정리가 완료되었습니다.` });
      await loadApplicants();
    } catch (err) {
      toast({ title: err.message || '거절 처리 중 오류가 발생했습니다.', variant: 'destructive' });
    }
  };

  const shortlist = applicants.filter((a) => SHORTLIST_STATUSES.includes(a.status));
  const interviewList = applicants.filter((a) => INTERVIEW_STATUSES.includes(a.status));

  // 현재 활성 탭에 따른 리스트 계산
  const currentList =
    activeTab === 'shortlist' ? shortlist : activeTab === 'interview' ? interviewList : applicants;
  const totalPages = Math.max(1, Math.ceil(currentList.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedList = currentList.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const actionButtons = (applicant) => (
    <>
      {miniAllowed &&
        job &&
        job.mini_interview_enabled !== false &&
        !['rejected', 'hired'].includes(applicant.status) && (
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
        !['rejected', 'hired'].includes(applicant.status) &&
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
      {!['rejected', 'hired'].includes(applicant.status) && (
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
                  {screening ? <AiSpinner className="mr-2" /> : <Sparkles className="mr-2 h-4 w-4" />}
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
        <Tabs value={activeTab} onValueChange={setActiveTab}>
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

          <TabsContent value={activeTab} className="mt-6">
            {currentList.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center text-sm text-muted-foreground">
                  {t('applicants.empty')}
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="space-y-3">
                  {paginatedList.map((applicant) => (
                    <ApplicantCard
                      key={applicant.id}
                      applicant={applicant}
                      actions={actionButtons(applicant)}
                      onOpen={() => setDetailId(applicant.id)}
                      onViewResume={() => viewResume(applicant)}
                    />
                  ))}
                </div>

                {/* 10명 단위 페이지네이션 컨트롤러 */}
                {totalPages > 1 && (
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
                    <p className="text-xs text-muted-foreground">
                      전체 {currentList.length}명 중 {(currentPage - 1) * PAGE_SIZE + 1} ~{' '}
                      {Math.min(currentPage * PAGE_SIZE, currentList.length)}명 표시 (페이지 {currentPage} / {totalPages})
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="h-8 px-2.5 text-xs"
                      >
                        <ChevronLeft className="mr-1 h-3.5 w-3.5" /> 이전
                      </Button>

                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => {
                        if (totalPages > 7 && Math.abs(pNum - currentPage) > 2 && pNum !== 1 && pNum !== totalPages) {
                          if (pNum === 2 || pNum === totalPages - 1) {
                            return (
                              <span key={pNum} className="px-1 text-xs text-muted-foreground">
                                ...
                              </span>
                            );
                          }
                          return null;
                        }
                        return (
                          <Button
                            key={pNum}
                            variant={currentPage === pNum ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setPage(pNum)}
                            className="h-8 w-8 p-0 text-xs font-semibold"
                          >
                            {pNum}
                          </Button>
                        );
                      })}

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        className="h-8 px-2.5 text-xs"
                      >
                        다음 <ChevronRight className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
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