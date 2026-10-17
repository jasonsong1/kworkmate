// 면접 일정 및 슬롯을 관리하는 페이지입니다.
// 매니저 1명이 전체 인터뷰를 진행하므로 슬롯은 전체(지점 공용) 기준으로 생성되며,
// 특정 공고의 지원자가 예약하면 해당 슬롯이 마감되어 중복 예약이 방지됩니다.

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Filter, Info, Loader2, Plus, XCircle } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { todayIso } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

/**
 * 시작 시간부터 종료 시간까지 간격(step 분) 단위로 슬롯 시간 배열을 계산합니다.
 */
function slotTimes(from, to, step) {
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const start = fh * 60 + fm;
  const end = th * 60 + tm;
  const out = [];
  for (let t = start; t + step <= end; t += step) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return out;
}

export default function Interviews() {
  const { t } = useI18n();
  const { company, activeBranch, role, presetKey, isManager, levelOf, reload } = useWorkspace();
  const { toast } = useToast();

  const [jobs, setJobs] = useState([]);
  // 'all'이면 전체 공용 슬롯 관리 모드, 특정 ID면 해당 공고 필터(Read-only) 모드입니다.
  const [jobId, setJobId] = useState('all');
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [rescheduleDraft, setRescheduleDraft] = useState(null);
  const [form, setForm] = useState({ date: todayIso(), from: '14:00', to: '17:00', step: 20 });

  const canManage =
    role === 'company_admin' ||
    isManager ||
    ['manager', 'supervisor_manager'].includes(presetKey) ||
    ['update', 'write'].includes(levelOf('interviews'));
  const allowReschedule = Boolean(company && company.allow_interview_reschedule);
  const rescheduleValue = rescheduleDraft === null ? allowReschedule : rescheduleDraft;
  const rescheduleDirty = rescheduleDraft !== null && rescheduleDraft !== allowReschedule;

  useEffect(() => {
    setRescheduleDraft(null);
  }, [company]);

  const loadJobs = useCallback(async () => {
    if (!activeBranch) return;
    const page = await base44.entities.Job.filter({ branch_id: activeBranch.id }, { sort: '-created_date', limit: 100 });
    const list = page.items || [];
    setJobs(list);
    setJobId((prev) => (prev === 'all' || list.some((j) => j.id === prev) ? prev : 'all'));
  }, [activeBranch]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const loadSlots = useCallback(async () => {
    if (!activeBranch) {
      setSlots([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const page = await base44.entities.InterviewSlot.filter({ branch_id: activeBranch.id }, { sort: 'date', limit: 500 });
    setSlots(page.items || []);
    setLoading(false);
  }, [activeBranch]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  // 부킹된 슬롯의 공고명 또는 직무를 반환합니다.
  const jobLabel = (slot) => {
    if (!slot.job_id) return '';
    const job = jobs.find((item) => item.id === slot.job_id);
    return job ? job.position || job.title : '';
  };

  /**
   * 전체 기준으로 지점 공용 면접 슬롯을 생성합니다.
   * 공고별이 아닌 매니저 1명의 통합 슬롯이므로 중복 시간을 배제하고 1개씩만 생성합니다.
   */
  const generate = async () => {
    if (!activeBranch) return;
    const times = slotTimes(form.from, form.to, Number(form.step) || 20);
    if (times.length === 0) {
      toast({ title: '종료 시간은 시작 시간 이후여야 합니다.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    // 동일 날짜에 취소되지 않은 슬롯이 이미 있으면 중복 생성을 방지합니다.
    const existing = slots
      .filter((s) => s.date === form.date && s.status !== 'cancelled')
      .map((s) => s.start_time);

    const rows = times
      .filter((start) => !existing.includes(start))
      .map((start) => ({
        company_id: activeBranch.company_id,
        branch_id: activeBranch.id,
        job_id: null, // 전체 기준 공용 슬롯으로 생성
        date: form.date,
        start_time: start,
        duration_min: Number(form.step) || 20,
        status: 'open'
      }));

    if (rows.length > 0) {
      await base44.entities.InterviewSlot.bulkCreate(rows);
      toast({ title: `${rows.length}개의 통합 면접 슬롯이 생성되었습니다.` });
    } else {
      toast({ title: '선택하신 시간대에 이미 생성된 슬롯이 있습니다.', variant: 'default' });
    }
    setSaving(false);
    await loadSlots();
  };

  /**
   * 슬롯을 취소합니다. 이미 부킹한 지원자가 있다면 취소 메일 및 재예약 링크가 발송됩니다.
   */
  const cancelSlot = async (slot) => {
    await base44.entities.InterviewSlot.update(slot.id, { status: 'cancelled' });
    if (slot.booked_by_applicant_id) {
      const response = await base44.functions.invoke('notifyApplicant', {
        applicant_id: slot.booked_by_applicant_id,
        type: 'interview_cancelled',
        slot_date: slot.date,
        slot_time: slot.start_time,
        origin: window.location.origin
      });
      if (response.data?.error) {
        toast({ title: response.data.error, variant: 'destructive' });
        await loadSlots();
        return;
      }
    }
    toast({ title: '슬롯이 취소되었습니다. 예약자에게 재예약 안내 메일이 발송되었습니다.' });
    await loadSlots();
  };

  /**
   * 지원자의 일정 변경 허용 설정을 토글합니다.
   */
  const toggleReschedule = async (value) => {
    if (!company) return;
    setSavingToggle(true);
    await base44.entities.Company.update(company.id, { allow_interview_reschedule: value });
    await reload();
    setRescheduleDraft(null);
    setSavingToggle(false);
    toast({ title: value ? t('interviews.rescheduleOn') : t('interviews.rescheduleOff') });
  };

  /**
   * 취소된 슬롯을 다시 오픈 상태로 복구합니다.
   */
  const reopenSlot = async (slot) => {
    await base44.entities.InterviewSlot.update(slot.id, {
      status: 'open',
      booked_by_applicant_id: '',
      booked_by_name: '',
      booked_at: '',
      job_id: null
    });
    toast({ title: t('interviews.reopened') });
    await loadSlots();
  };

  // '전체'일 때는 모든 슬롯을 보여주고,
  // 공고별 필터일 때는 해당 공고로 부킹된 슬롯만 보여줍니다 (Read-only 모드).
  const visible =
    jobId === 'all'
      ? slots
      : slots.filter((slot) => slot.job_id === jobId);

  const grouped = visible.reduce((acc, slot) => {
    acc[slot.date] = acc[slot.date] || [];
    acc[slot.date].push(slot);
    return acc;
  }, {});

  const isFilterMode = jobId !== 'all';
  const selectedJob = jobs.find((j) => j.id === jobId);

  return (
    <div>
      <PageHeader title={t('interviews.title')} subtitle={activeBranch ? activeBranch.name : t('interviews.subtitle')} />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-6">
          {/* 공고 선택 필터 카드 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Filter className="h-4 w-4" /> {t('interviews.filterByJob')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>{t('interviews.job')}</Label>
                <Select value={jobId} onValueChange={setJobId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={t('jobs.title')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('interviews.allShared')}</SelectItem>
                    {jobs.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isFilterMode ? (
                <div className="rounded-md border border-sky-100 bg-sky-50/50 p-3 text-xs text-sky-800">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Info className="h-4 w-4 text-sky-600" />
                    <span>{t('interviews.filterModeTitle') || '공고별 조회 모드 (Read-only)'}</span>
                  </div>
                  <p className="mt-1 text-slate-600">
                    {t('interviews.filterModeNotice')?.replace('{title}', selectedJob ? selectedJob.title : '') ||
                      `현재 '${selectedJob ? selectedJob.title : ''}' 공고에 부킹된 지원자 현황만 읽기 전용으로 표시됩니다.`}
                  </p>
                  <p className="mt-1 text-slate-500">
                    {t('interviews.filterModeManageHint') ||
                      "새로운 면접 슬롯 생성 및 일정 관리는 상단 필터를 '전체'로 선택하시면 가능합니다."}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* 슬롯 생성 카드 (전체 기준일 때만 표시, 공고별 필터 시에는 숨김) */}
          {!isFilterMode ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4" /> {t('interviews.openShared')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>{t('common.date')}</Label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('interviews.from')}</Label>
                    <Input type="time" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
                  </div>
                  <div>
                    <Label>{t('interviews.to')}</Label>
                    <Input type="time" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>{t('interviews.slotLength')}</Label>
                  <Input
                    type="number"
                    value={form.step}
                    onChange={(e) => setForm({ ...form, step: e.target.value })}
                  />
                </div>
                <Button className="w-full" onClick={generate} disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  {t('interviews.createSharedSlots')}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t('interviews.sharedSlotNotice')}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {/* 일정 재조율 허용 토글 카드 */}
          <Card>
            <CardContent className="flex items-start justify-between gap-4 pt-6">
              <div>
                <p className="text-sm font-medium">{t('interviews.rescheduleToggle')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('interviews.rescheduleHint')}</p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={rescheduleValue}
                  disabled={!canManage || savingToggle}
                  onCheckedChange={(value) => setRescheduleDraft(value)}
                />
                {rescheduleDirty ? (
                  <Button size="sm" onClick={() => toggleReschedule(rescheduleValue)} disabled={savingToggle}>
                    {savingToggle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t('common.save')}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 오른쪽 슬롯 목록 영역 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              {isFilterMode
                ? t('interviews.jobBookings').replace('{title}', selectedJob?.title || '')
                : t('interviews.allSlotsBookings')}
            </h3>
            <span className="text-xs text-muted-foreground">
              {t('interviews.totalSlots').replace('{count}', String(visible.length))} {isFilterMode && t('interviews.jobFilteredNotice')}
            </span>
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              {t('common.loading')}
            </p>
          ) : Object.keys(grouped).length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                {isFilterMode ? t('interviews.noBookingsForJob') : t('interviews.noSlotsFound')}
              </CardContent>
            </Card>
          ) : (
            Object.keys(grouped)
              .sort()
              .map((date) => (
                <Card key={date}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{date}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {grouped[date]
                      .sort((a, b) => (a.start_time > b.start_time ? 1 : -1))
                      .map((slot) => (
                        <div
                          key={slot.id}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                            slot.status === 'booked'
                              ? 'border-emerald-200 bg-emerald-50'
                              : slot.status === 'cancelled'
                              ? 'border-slate-200 bg-slate-50 text-muted-foreground'
                              : 'bg-card'
                          }`}
                        >
                          <span className="font-medium">{slot.start_time}</span>
                          {slot.status !== 'booked' && jobLabel(slot) && (
                            <span className="text-xs text-muted-foreground">{jobLabel(slot)}</span>
                          )}
                          {slot.status === 'booked' ? (
                            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                              {jobLabel(slot) ? `${slot.booked_by_name} · ${jobLabel(slot)}` : slot.booked_by_name}
                            </Badge>
                          ) : slot.status === 'cancelled' ? (
                            !isFilterMode ? (
                              <button type="button" title={t('interviews.reopen')} onClick={() => reopenSlot(slot)}>
                                <Badge variant="secondary" className="cursor-pointer hover:bg-accent">
                                  {t('interviews.cancelled')}
                                </Badge>
                              </button>
                            ) : (
                              <Badge variant="secondary">{t('interviews.cancelled')}</Badge>
                            )
                          ) : (
                            <Badge variant="outline">{t('interviews.slots')}</Badge>
                          )}
                          {!isFilterMode && slot.status !== 'cancelled' && (
                            <button onClick={() => cancelSlot(slot)} title={t('interviews.cancel')}>
                              <XCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                            </button>
                          )}
                        </div>
                      ))}
                  </CardContent>
                </Card>
              ))
          )}
        </div>
      </div>
    </div>
  );
}