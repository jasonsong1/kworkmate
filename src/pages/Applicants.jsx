// ============================================================
// Applicants.jsx
// 목적: 고용주 및 관리자가 지점별 채용 공고에 접수된 지원자들을 확인하고,
//       비자 종류, 근무 가능 시작 시점(Notice Period), 요일별 근무 가능 여부(Availability 다중 선택)로
//       조건에 맞는 지원자를 빠르게 필터링 및 관리할 수 있는 화면입니다.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  MailWarning,
  RotateCcw,
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { featureAllowed, videoInterviewAllowed } from '@/lib/packages';
import {
  DAYS,
  NOTICE_PERIODS,
  VISA_TYPES,
  isDayAvailable,
  normalizeAvailability,
  visaKey
} from '@/lib/bh';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';
import { useRealtimeSync } from '@/lib/useRealtimeSync';

// 한 페이지당 표시할 지원자 수
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

  // ------------------------------------------------------------
  // 지원자 상세 필터 상태 관리 (비자, Notice Period, 요일별 Availability)
  // ------------------------------------------------------------
  const [visaFilter, setVisaFilter] = useState('all'); // 'all' 또는 특정 비자 코드
  const [noticeFilter, setNoticeFilter] = useState('all'); // 'all' 또는 notice_period 값
  const [selectedDays, setSelectedDays] = useState([]); // 선택된 요일 키 목록 (예: ['mon', 'tue'])
  const [dayMatchMode, setDayMatchMode] = useState('all'); // 기본값 'all': 선택한 모든 요일에 근무 가능한 지원자만 필터링 (AND 조건)

  // 지점의 공고 목록 로드
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

  // 선택된 공고의 지원자 목록 로드
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

  // 실시간 동기화: 새로운 지원자 접수 또는 상태 변경 시 새로고침 없이 즉시 목록 갱신
  useRealtimeSync('job_application', loadApplicants);

  // 탭, 공고, 필터 조건이 변경되면 1페이지로 자동 리셋
  useEffect(() => {
    setPage(1);
  }, [activeTab, jobId, visaFilter, noticeFilter, selectedDays, dayMatchMode]);

  // 요일 토글 함수 (다중 선택 지원)
  const toggleDay = (dayKey) => {
    setSelectedDays((prev) =>
      prev.includes(dayKey) ? prev.filter((k) => k !== dayKey) : [...prev, dayKey]
    );
  };

  // 모든 필터 초기화 함수
  const resetFilters = () => {
    setVisaFilter('all');
    setNoticeFilter('all');
    setSelectedDays([]);
    setDayMatchMode('all');
  };

  // 현재 필터 적용 여부 확인
  const isFiltered = visaFilter !== 'all' || noticeFilter !== 'all' || selectedDays.length > 0;

  // ------------------------------------------------------------
  // 지원자 필터링 로직 (비자, Notice period, 요일별 Availability)
  // ------------------------------------------------------------
  const filteredApplicants = applicants.filter((applicant) => {
    // 1. 비자 필터 검사
    if (visaFilter !== 'all') {
      const vk = visaKey(applicant.visa_type);
      if (vk !== visaFilter && applicant.visa_type !== visaFilter) {
        return false;
      }
    }

    // 2. Notice period (근무 시작 가능 시점) 필터 검사
    if (noticeFilter !== 'all') {
      if (noticeFilter === 'immediately') {
        const isImm = applicant.available_immediately || applicant.notice_period === 'immediately';
        if (!isImm) return false;
      } else {
        if (applicant.notice_period !== noticeFilter) return false;
      }
    }

    // 3. 요일별 Availability 필터 검사 (다중 요일 선택 대응)
    if (selectedDays.length > 0) {
      const avail = normalizeAvailability(applicant.availability);
      if (dayMatchMode === 'all') {
        // 선택된 모든 요일에 근무 시간이 지정되어 있어야 통과
        const allOk = selectedDays.every((dayKey) => isDayAvailable(avail[dayKey]));
        if (!allOk) return false;
      } else {
        // 선택된 요일 중 적어도 하루 이상 근무 가능하면 통과
        const anyOk = selectedDays.some((dayKey) => isDayAvailable(avail[dayKey]));
        if (!anyOk) return false;
      }
    }

    return true;
  });

  // 이력서 파일 열람 (비공개 버킷에서 서명된 일회용 URL 생성)
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

  // 각 단계별 액션 (미니면접, 비디오면접, 면접조율, 채용, 거절)
  const act = async (applicant, action) => {
    setBusyId(applicant.id);
    try {
      if (action === 'video') {
        const response = await base44.functions.invoke('sendVideoInterview', {
          applicant_id: applicant.id,
          origin: window.location.origin
        });
        if (response.data?.error) throw new Error(response.data.error);
        toast({ title: `${applicant.full_name} 지원자에게 화상 면접 요청 링크가 발송되었습니다.` });
      } else if (action === 'mini') {
        const response = await base44.functions.invoke('sendMiniInterview', {
          applicant_id: applicant.id,
          origin: window.location.origin
        });
        if (response.data?.error) throw new Error(response.data.error);
        toast({ title: `${applicant.full_name} 지원자에게 미니 면접 질문 링크가 발송되었습니다.` });
      } else if (action === 'invite') {
        const response = await base44.functions.invoke('notifyApplicant', {
          applicant_id: applicant.id,
          action: 'invite',
          origin: window.location.origin
        });
        if (response.data?.error) throw new Error(response.data.error);
        toast({ title: `${applicant.full_name} 지원자에게 면접 슬롯 예약 안내 메일이 발송되었습니다.` });
      } else if (action === 'hire') {
        const response = await base44.functions.invoke('hireApplicant', {
          applicant_id: applicant.id,
          origin: window.location.origin
        });
        if (response.data?.error) throw new Error(response.data.error);
        toast({ title: `${applicant.full_name} 지원자 채용 확정 및 온보딩 서약서 발송이 완료되었습니다.` });
      } else if (action === 'reject') {
        const response = await base44.functions.invoke('notifyApplicant', {
          applicant_id: applicant.id,
          action: 'reject',
          origin: window.location.origin
        });
        if (response.data?.error) throw new Error(response.data.error);
        if (response.data?.sent === false && response.data?.error) {
          toast({ title: `거절 처리 완료 (이메일 발송 실패: ${response.data.error})`, variant: 'destructive' });
        } else {
          toast({ title: `${applicant.full_name} 지원자 거절 및 불합격 안내 메일이 발송되었습니다.` });
        }
      }
      await loadApplicants();
    } catch (error) {
      toast({ title: error.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  // AI 이력서 심사 실행
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

  // 미선별자 일괄 거절 안내 발송
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

  // 탭별 목록 필터링 (필터 조건이 반영된 filteredApplicants 기반)
  const shortlist = filteredApplicants.filter((a) => SHORTLIST_STATUSES.includes(a.status));
  const interviewList = filteredApplicants.filter((a) => INTERVIEW_STATUSES.includes(a.status));

  // 현재 활성 탭에 따른 리스트 계산 및 페이지네이션
  const currentList =
    activeTab === 'shortlist' ? shortlist : activeTab === 'interview' ? interviewList : filteredApplicants;
  const totalPages = Math.max(1, Math.ceil(currentList.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedList = currentList.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // 카드 내 액션 버튼 모음
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
    <div className="space-y-4">
      {/* 반응형 페이지 헤더 */}
      <PageHeader
        title={t('applicants.title')}
        subtitle={activeBranch ? activeBranch.name : t('applicants.title')}
        actions={
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Select value={jobId} onValueChange={setJobId}>
              <SelectTrigger className="w-full sm:w-64">
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
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={runScreening} disabled={screening}>
                  {screening ? <AiSpinner className="mr-1.5" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                  {screening ? t('jobs.aiRunning') : t('applicants.addScreening')}
                </Button>
                <Button variant="outline" size="sm" onClick={rejectUnselected}>
                  <MailWarning className="mr-1.5 h-4 w-4" /> {t('applicants.rejectAll')}
                </Button>
              </div>
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
        <div className="space-y-4">
          {/* ============================================================ */}
          {/* 지원자 상세 필터 카드 (비자, Notice period, 요일별 Availability) */}
          {/* ============================================================ */}
          <Card className="border-slate-200/80 bg-card/60 shadow-sm backdrop-blur-sm">
            <CardContent className="p-3.5 sm:p-4 space-y-3">
              {/* 1행: 비자 선택, Notice Period 선택, 필터 초기화 버튼 */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Filter className="h-3.5 w-3.5 text-primary" />
                  <span>필터:</span>
                </div>

                {/* 비자 필터 드롭다운 */}
                <div className="w-full sm:w-auto flex-1 min-w-[140px] max-w-full sm:max-w-[200px]">
                  <Select value={visaFilter} onValueChange={setVisaFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="비자 종류" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 비자 (All Visas)</SelectItem>
                      {VISA_TYPES.map((v) => (
                        <SelectItem key={v.value} value={v.value}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Notice Period 필터 드롭다운 */}
                <div className="w-full sm:w-auto flex-1 min-w-[140px] max-w-full sm:max-w-[200px]">
                  <Select value={noticeFilter} onValueChange={setNoticeFilter}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="근무 시작 가능" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 시작 시점 (All Notice)</SelectItem>
                      {NOTICE_PERIODS.map((n) => (
                        <SelectItem key={n.value} value={n.value}>
                          {n.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 활성 필터 초기화 버튼 */}
                {isFiltered && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    초기화
                  </Button>
                )}

                {/* 필터링 결과 카운트 안내 */}
                {isFiltered && (
                  <span className="text-xs text-primary font-medium ml-auto">
                    {filteredApplicants.length}명 조회됨 (전체 {applicants.length}명)
                  </span>
                )}
              </div>

              {/* 2행: 요일별 Availability 필터 (다중 선택 칩 버튼) */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1 shrink-0">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                  근무 가능 요일:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {DAYS.map((d) => {
                    const isSelected = selectedDays.includes(d.key);
                    return (
                      <button
                        key={d.key}
                        type="button"
                        onClick={() => toggleDay(d.key)}
                        className={cn(
                          "h-7 px-2.5 text-xs font-medium transition-all rounded-md border flex items-center justify-center",
                          isSelected
                            ? "bg-primary border-primary text-primary-foreground shadow-sm font-semibold"
                            : "bg-background border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>

                {selectedDays.length > 1 && (
                  <div className="flex items-center gap-1 ml-auto text-[11px] text-muted-foreground">
                    <span>조건:</span>
                    <button
                      type="button"
                      onClick={() => setDayMatchMode(dayMatchMode === 'any' ? 'all' : 'any')}
                      className="text-primary underline font-medium hover:opacity-80"
                    >
                      {dayMatchMode === 'any' ? '선택 요일 중 하루 이상 가능' : '선택 요일 모두 가능 (AND)'}
                    </button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 탭 목록 (모바일 가로 스크롤 대응) */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="overflow-x-auto pb-1">
              <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 justify-start">
                <TabsTrigger value="shortlist" className="text-xs sm:text-sm">
                  {t('applicants.tabTop')} ({shortlist.length})
                </TabsTrigger>
                <TabsTrigger value="interview" className="text-xs sm:text-sm">
                  {t('applicants.tabInterview')} ({interviewList.length})
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs sm:text-sm">
                  {t('applicants.tabAll')} ({filteredApplicants.length})
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value={activeTab} className="mt-4">
              {currentList.length === 0 ? (
                <Card>
                  <CardContent className="p-10 text-center text-sm text-muted-foreground">
                    {isFiltered ? '설정하신 필터 조건에 부합하는 지원자가 없습니다.' : t('applicants.empty')}
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

                  {/* 10명 단위 페이지네이션 */}
                  {totalPages > 1 && (
                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                      <p className="text-xs text-muted-foreground">
                        총 {currentList.length}명 중 {(currentPage - 1) * PAGE_SIZE + 1}–
                        {Math.min(currentPage * PAGE_SIZE, currentList.length)}명 표시 (페이지 {currentPage} / {totalPages})
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          이전
                        </Button>
                        <div className="flex items-center gap-1 px-1">
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                            <Button
                              key={pageNum}
                              variant={pageNum === currentPage ? 'default' : 'ghost'}
                              size="sm"
                              className="h-8 w-8 p-0 text-xs"
                              onClick={() => setPage(pageNum)}
                            >
                              {pageNum}
                            </Button>
                          ))}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage >= totalPages}
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        >
                          다음
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {detailId && (
        <ApplicantDetailDialog
          applicantId={detailId}
          open={Boolean(detailId)}
          onClose={() => setDetailId('')}
          onUpdate={loadApplicants}
          job={job}
        />
      )}
    </div>
  );
}