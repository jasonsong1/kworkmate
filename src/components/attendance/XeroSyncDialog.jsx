// ============================================================
// XeroSyncDialog.jsx
// 목적: 타임시트(출퇴근 기록) 화면에서 승인된 근무 시간을 Xero 급여(Payroll)로
//       안전하게 전송하기 전 요약 정보를 확인하고, 2차 전송 확인 절차를 거치는 모달 컴포넌트입니다.
// ============================================================

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Send,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Building2
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';

export default function XeroSyncDialog({
  open,
  onOpenChange,
  company,
  activeBranch,
  fromDate,
  toDate,
  rows = [],
  onSynced
}) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  // 전송 전 "정말 보내시겠습니까?" 2차 확인 단계 여부 상태
  const [isConfirming, setIsConfirming] = useState(false);

  // 모달이 열리거나 닫힐 때 확인 단계를 1단계(요약 확인)로 초기화합니다.
  useEffect(() => {
    if (!open) {
      setIsConfirming(false);
    }
  }, [open]);

  const isConnected = Boolean(company && company.xero_connected);
  const tenantName = company?.xero_tenant_name || 'My Xero Organisation';

  // 현재 필터된 승인된(approved) 항목만 집계
  const approvedRows = (rows || []).filter((r) => r.approval_status === 'approved');
  const totalMinutes = approvedRows.reduce((sum, r) => sum + (Number(r.minutes) || 0), 0);
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  const uniqueStaff = new Set(approvedRows.map((r) => r.employee_email).filter(Boolean)).size;

  // 실제 Xero API 동기화 실행 함수 (2차 확인 단계에서 [네, 전송합니다] 클릭 시 실행)
  const handleSync = async () => {
    if (!activeBranch || !company) return;
    setSyncing(true);
    try {
      const res = await base44.functions.invoke('syncXeroTimesheets', {
        branch_id: activeBranch.id,
        start_date: fromDate,
        end_date: toDate
      });

      const data = res.data || {};
      if (data.error) {
        toast({ title: data.error, variant: 'destructive' });
        return;
      }

      toast({
        title: t('xero.syncSuccessTitle') || (lang === 'ko' ? 'Xero 타임시트 전송 성공!' : 'Timesheets Sent!'),
        description: data.message || `${uniqueStaff}${t('xero.personUnit') || '명'} (${totalHours}${t('xero.hoursUnit') || '시간'})`
      });

      onOpenChange(false);
      onSynced && onSynced();
    } catch (err) {
      toast({
        title: (err && err.message) || t('xero.syncErrorTitle') || (lang === 'ko' ? 'Xero 전송 실패' : 'Failed to sync with Xero'),
        variant: 'destructive'
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!syncing) {
        onOpenChange(val);
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#13b5ea]/10 text-[#13b5ea] font-black text-sm">
              xero
            </div>
            <div>
              <DialogTitle className="text-base">
                {isConfirming
                  ? (lang === 'ko' ? 'Xero 타임시트 전송 최종 확인' : 'Confirm Xero Timesheet Sync')
                  : t('xero.syncModalTitle')}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {isConfirming
                  ? (lang === 'ko'
                      ? '전송 전 대상 지점 및 승인 시간을 마지막으로 확인해 주세요.'
                      : 'Please review the sync details before pushing to Xero.')
                  : t('xero.syncModalDesc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* 2단계: "진짜 보내시겠습니까?" 확인 페이지 화면 */}
        {isConfirming ? (
          <div className="py-2 space-y-3.5 text-xs">
            <div className="rounded-xl border border-amber-500/30 bg-amber-50/70 p-3.5 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span>{lang === 'ko' ? '정말 Xero로 타임시트를 전송하시겠습니까?' : 'Are you sure you want to send to Xero?'}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {lang === 'ko'
                  ? '확인을 누르시면 아래 요약된 출퇴근 기록이 점주님의 Xero 조직(급여 관리)으로 즉시 반영됩니다.'
                  : 'Once confirmed, approved timesheet records will be uploaded directly to your Xero organization.'}
              </p>
            </div>

            {/* 최종 확인용 전송 상세 데이터 박스 */}
            <div className="rounded-xl bg-muted/40 border p-3.5 space-y-2.5">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{lang === 'ko' ? '연동 조직' : 'Xero Organisation'}:</span>
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-emerald-600" />
                  {tenantName}
                </span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{t('xero.branch') || (lang === 'ko' ? '전송 지점' : 'Branch')}:</span>
                <span className="font-semibold text-foreground">{activeBranch?.name}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{t('xero.targetPeriod') || (lang === 'ko' ? '대상 기간' : 'Period')}:</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {fromDate} → {toDate}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center text-muted-foreground">
                <span>{t('xero.approvedStaffCount') || (lang === 'ko' ? '전송 인원' : 'Staff Count')}:</span>
                <span className="font-bold text-foreground">
                  {uniqueStaff}{t('xero.personUnit') || (lang === 'ko' ? '명' : ' staff')}
                </span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{t('xero.totalApprovedHours') || (lang === 'ko' ? '총 근무 시간' : 'Total Hours')}:</span>
                <span className="font-bold text-[#13b5ea] text-sm">
                  {totalHours}{t('xero.hoursUnit') || (lang === 'ko' ? '시간' : ' hrs')}
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* 1단계: 기존 요약 정보 및 연동 상태 확인 화면 */
          <div className="py-2 space-y-4 text-xs">
            {/* 1. Xero 연결 상태 */}
            {isConnected ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 p-3 dark:bg-emerald-950/20 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>{t('xero.orgConnected') || (lang === 'ko' ? 'Xero 조직 연결됨' : 'Xero Organisation Connected')}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{tenantName}</div>
                </div>
                <Badge className="bg-emerald-600 text-white text-[10px]">{t('xero.active') || (lang === 'ko' ? '정상' : 'Active')}</Badge>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200 space-y-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertCircle className="h-4 w-4" />
                  <span>{t('xero.needConnect') || (lang === 'ko' ? 'Xero 연동 필요' : 'Xero Connection Required')}</span>
                </div>
                <p className="text-[11px] leading-relaxed opacity-90">
                  {t('xero.needConnectDesc') || (lang === 'ko' ? '먼저 [회사 설정 > Xero 연동]에서 Xero 계정을 연동해 주세요.' : 'Please connect your Xero account in Company Settings first.')}
                </p>
                <Link to="/settings" className="inline-block mt-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-amber-900 border-amber-300 gap-1">
                    <span>{t('xero.goToSettings') || (lang === 'ko' ? '회사 설정 바로가기' : 'Go to Settings')}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            )}

            {/* 2. 전송 대상 요약 정보 카드 */}
            <div className="rounded-xl bg-muted/40 border p-3.5 space-y-2">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{t('xero.branch') || (lang === 'ko' ? '지점' : 'Branch')}:</span>
                <span className="font-semibold text-foreground">{activeBranch?.name}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{t('xero.targetPeriod') || (lang === 'ko' ? '대상 기간' : 'Target Period')}:</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {fromDate} → {toDate}
                </span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground border-t pt-2">
                <span>{t('xero.approvedStaffCount') || (lang === 'ko' ? '승인 직원 수' : 'Approved Staff')}:</span>
                <span className="font-bold text-foreground">
                  {uniqueStaff}{t('xero.personUnit') || (lang === 'ko' ? '명' : ' staff')}
                </span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{t('xero.totalApprovedHours') || (lang === 'ko' ? '총 승인 근무 시간' : 'Total Approved Hours')}:</span>
                <span className="font-bold text-primary text-sm">
                  {totalHours}{t('xero.hoursUnit') || (lang === 'ko' ? '시간' : ' hrs')}
                </span>
              </div>
            </div>

            <p
              className="text-[11px] text-muted-foreground leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: t('xero.approvedNotice') || (lang === 'ko'
                  ? '※ <strong>승인(Approved)</strong> 상태의 출퇴근 기록만 Xero로 전송됩니다.'
                  : '※ Only <strong>Approved</strong> timesheets will be synced to Xero.')
              }}
            />
          </div>
        )}

        {/* 하단 버튼 액션 영역 */}
        <DialogFooter className="sm:justify-between gap-2">
          {isConfirming ? (
            <>
              {/* 2단계: 뒤로가기 버튼 */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsConfirming(false)}
                disabled={syncing}
                className="gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t('xero.backBtn') || (lang === 'ko' ? '이전 단계' : 'Back')}
              </Button>
              {/* 2단계: 진짜 보내시겠습니까? 최종 확인 및 전송 실행 버튼 */}
              <Button
                type="button"
                size="sm"
                className="bg-[#13b5ea] hover:bg-[#0fa0cf] text-white font-semibold gap-1.5 shadow-sm"
                onClick={handleSync}
                disabled={syncing}
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {syncing
                  ? (lang === 'ko' ? 'Xero로 전송 중...' : 'Sending to Xero...')
                  : (t('xero.confirmBtn') || (lang === 'ko' ? '네, 전송합니다' : 'Yes, Send Now'))}
              </Button>
            </>
          ) : (
            <>
              {/* 1단계: 취소 닫기 버튼 */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                {t('common.cancel') || (lang === 'ko' ? '취소' : 'Cancel')}
              </Button>
              {/* 1단계: 'Xero로 전송' 클릭 시 확인 단계로 진입 */}
              <Button
                type="button"
                size="sm"
                className="bg-[#13b5ea] hover:bg-[#0fa0cf] text-white font-semibold gap-1.5 shadow-sm"
                onClick={() => setIsConfirming(true)}
                disabled={!isConnected || approvedRows.length === 0}
              >
                <Send className="h-3.5 w-3.5" />
                {t('xero.syncBtn') || (lang === 'ko' ? 'Xero로 전송' : 'Send to Xero')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
