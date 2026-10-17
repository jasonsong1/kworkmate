// ============================================================
// XeroSyncDialog.jsx
// 목적: 타임시트(출퇴근 기록) 화면에서 승인된 근무 시간과 승인된 휴가(Leave) 요약을
//       한눈에 확인하고 Xero 급여(Payroll)로 즉시 전송하는 모달 컴포넌트입니다.
// ============================================================

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ExternalLink,
  Loader2,
  Send,
  AlertCircle,
  CalendarDays,
  Clock
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
  const { lang } = useI18n();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [approvedLeaves, setApprovedLeaves] = useState([]);

  const isConnected = Boolean(company && company.xero_connected);

  // 현재 필터된 승인된(approved) 출퇴근 기록만 집계
  const approvedRows = (rows || []).filter((r) => r.approval_status === 'approved');
  const totalMinutes = approvedRows.reduce((sum, r) => sum + (Number(r.minutes) || 0), 0);
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  const uniqueStaff = new Set(approvedRows.map((r) => r.employee_email).filter(Boolean)).size;

  // 모달이 열릴 때 해당 기간(fromDate ~ toDate)의 승인된 휴가(LeaveRequest) 목록을 비동기 조회합니다.
  useEffect(() => {
    if (!open || !company) {
      setApprovedLeaves([]);
      return;
    }

    let isMounted = true;
    setLeaveLoading(true);

    const query = {
      company_id: company.id,
      status: 'approved',
      start_date: { $lte: toDate },
      end_date: { $gte: fromDate }
    };
    if (activeBranch && activeBranch.id) {
      query.branch_id = activeBranch.id;
    }

    base44.entities.LeaveRequest.filter(query, { limit: 100 })
      .then((res) => {
        if (!isMounted) return;
        const items = Array.isArray(res) ? res : (res && (res.items || res.rows)) || [];
        setApprovedLeaves(items);
      })
      .catch((err) => {
        console.warn('[XeroSyncDialog] Failed to load leave requests:', err);
        if (isMounted) setApprovedLeaves([]);
      })
      .finally(() => {
        if (isMounted) setLeaveLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, company, activeBranch, fromDate, toDate]);

  // 승인된 휴가 통계 계산
  const totalLeaveHours = Math.round(
    approvedLeaves.reduce((sum, lr) => sum + (Number(lr.hours) || 0), 0) * 10
  ) / 10;
  const uniqueLeaveStaff = new Set(approvedLeaves.map((lr) => lr.employee_email).filter(Boolean)).size;

  // [Xero로 전송] 클릭 시 타임시트 + 휴가 신청서 통합 전송
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
        title: lang === 'ko' ? 'Xero 타임시트 및 휴가 전송 성공!' : 'Timesheets & Leaves Sent Successfully!',
        description: data.message || (lang === 'ko'
          ? `${uniqueStaff}명의 타임시트 (${totalHours}시간) 및 ${approvedLeaves.length}건의 휴가가 Xero로 전송되었습니다.`
          : `${uniqueStaff} staff timesheets and ${approvedLeaves.length} leave requests synced to Xero.`)
      });

      onOpenChange(false);
      onSynced && onSynced();
    } catch (err) {
      toast({
        title: (err && err.message) || (lang === 'ko' ? 'Xero 전송 실패' : 'Failed to sync with Xero'),
        variant: 'destructive'
      });
    } finally {
      setSyncing(false);
    }
  };

  const hasDataToSend = approvedRows.length > 0 || approvedLeaves.length > 0;

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
                {lang === 'ko' ? 'Xero로 타임시트 및 휴가 전송' : 'Send Timesheets & Leaves to Xero'}
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {lang === 'ko'
                  ? '승인된 출퇴근 근무 시간과 승인된 휴가를 Xero 급여 계정으로 자동 전송합니다.'
                  : 'Approved employee timesheets and approved leaves will be automatically pushed to Xero.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Xero 미연동 상태일 때만 안내 경고 배너 표시 */}
        {!isConnected && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertCircle className="h-4 w-4" />
              <span>{lang === 'ko' ? 'Xero 연동 필요' : 'Xero Connection Required'}</span>
            </div>
            <p className="text-[11px] leading-relaxed opacity-90">
              {lang === 'ko'
                ? '먼저 [회사 설정 > Xero 연동]에서 Xero 계정을 연동해 주세요.'
                : 'Please connect your Xero account in Company Settings first.'}
            </p>
            <Link to="/settings" className="inline-block mt-1">
              <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-amber-900 border-amber-300 gap-1">
                <span>{lang === 'ko' ? '회사 설정 바로가기' : 'Go to Settings'}</span>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        )}

        {/* 전송 대상 요약 정보 박스 (출퇴근 근무시간 + 승인 휴가) */}
        <div className="py-1 space-y-3 text-xs">
          <div className="rounded-xl bg-muted/40 border p-3.5 space-y-2.5">
            <div className="flex justify-between items-center text-muted-foreground">
              <span>{lang === 'ko' ? '전송 지점' : 'Branch'}:</span>
              <span className="font-semibold text-foreground">{activeBranch?.name}</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span>{lang === 'ko' ? '대상 기간' : 'Target Period'}:</span>
              <span className="font-semibold text-foreground tabular-nums">
                {fromDate} → {toDate}
              </span>
            </div>

            {/* 1. 승인된 출퇴근 근무 시간 섹션 */}
            <div className="border-t pt-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1 font-medium text-foreground">
                  <Clock className="h-3 w-3 text-blue-500" />
                  {lang === 'ko' ? '승인 근무 시간' : 'Approved Working Time'}:
                </span>
                <span className="font-bold text-[#13b5ea] text-xs">
                  {uniqueStaff}{lang === 'ko' ? '명' : ' staff'} (총 {totalHours}{lang === 'ko' ? '시간' : ' hrs'})
                </span>
              </div>
            </div>

            {/* 2. 승인된 휴가(Leave) 섹션 */}
            <div className="border-t pt-2 space-y-1.5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1 font-medium text-foreground">
                  <CalendarDays className="h-3 w-3 text-emerald-500" />
                  {lang === 'ko' ? '승인 휴가 내역' : 'Approved Leave'}:
                </span>
                {leaveLoading ? (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {lang === 'ko' ? '휴가 확인 중...' : 'Checking leaves...'}
                  </span>
                ) : approvedLeaves.length > 0 ? (
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                    {uniqueLeaveStaff}{lang === 'ko' ? '명' : ' staff'} / {approvedLeaves.length}{lang === 'ko' ? '건' : ' cases'} (총 {totalLeaveHours}{lang === 'ko' ? '시간' : ' hrs'})
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    {lang === 'ko' ? '해당 기간 승인 휴가 없음' : 'No approved leaves'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
            {lang === 'ko'
              ? '※ 매니저가 승인한 출퇴근 타임시트와 휴가 신청서가 Xero 급여(Payroll AU)로 한 번에 연동됩니다.'
              : '※ Approved timesheets and approved leave applications will be synced to Xero Payroll AU together.'}
          </p>
        </div>

        {/* 하단 푸터 버튼: [취소] 및 바로 전송하는 [Xero로 전송] */}
        <DialogFooter className="sm:justify-between gap-2 mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={syncing}
          >
            {lang === 'ko' ? '취소' : 'Cancel'}
          </Button>

          <Button
            type="button"
            size="sm"
            className="bg-[#13b5ea] hover:bg-[#0fa0cf] text-white font-semibold gap-1.5 shadow-sm"
            onClick={handleSync}
            disabled={!isConnected || syncing || !hasDataToSend}
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {syncing
              ? (lang === 'ko' ? 'Xero로 전송 중...' : 'Sending to Xero...')
              : (lang === 'ko' ? 'Xero로 전송' : 'Send to Xero')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
