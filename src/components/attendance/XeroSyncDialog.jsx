import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, Loader2, Send, AlertCircle, Building2 } from 'lucide-react';
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
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  const isConnected = Boolean(company && company.xero_connected);
  const tenantName = company?.xero_tenant_name || 'My Xero Organisation';

  // 현재 필터된 승인된(approved) 항목만 집계
  const approvedRows = (rows || []).filter((r) => r.approval_status === 'approved');
  const totalMinutes = approvedRows.reduce((sum, r) => sum + (Number(r.minutes) || 0), 0);
  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  const uniqueStaff = new Set(approvedRows.map((r) => r.employee_email).filter(Boolean)).size;

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
        title: 'Xero 타임시트 전송 성공!',
        description: data.message || `${uniqueStaff}명의 총 ${totalHours}시간이 Xero로 전송되었습니다.`
      });

      onOpenChange(false);
      onSynced && onSynced();
    } catch (err) {
      toast({
        title: (err && err.message) || 'Xero 타임시트 전송 중 오류가 발생했습니다.',
        variant: 'destructive'
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#13b5ea]/10 text-[#13b5ea] font-black text-sm">
              xero
            </div>
            <div>
              <DialogTitle className="text-base">Xero로 타임시트 직접 전송</DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                승인된 출퇴근 기록을 점주님의 Xero 계정으로 자동 전송합니다.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-2 space-y-4 text-xs">
          {/* 1. Xero 연결 상태 */}
          {isConnected ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 p-3 dark:bg-emerald-950/20 flex items-center justify-between">
              <div>
                <div className="font-semibold text-emerald-900 dark:text-emerald-100 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Xero 조직 연결됨</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{tenantName}</div>
              </div>
              <Badge className="bg-emerald-600 text-white text-[10px]">Active</Badge>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200 space-y-2">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="h-4 w-4" />
                <span>Xero 계정 연동 필요</span>
              </div>
              <p className="text-[11px] leading-relaxed opacity-90">
                타임시트를 Xero로 자동 전송하려면 먼저 [회사 설정]에서 점주님의 Xero 계정을 연동해 주세요.
              </p>
              <Link to="/settings" className="inline-block mt-1">
                <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-amber-900 border-amber-300 gap-1">
                  <span>회사 설정에서 Xero 연동하기</span>
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          )}

          {/* 2. 전송 대상 요약 정보 카드 */}
          <div className="rounded-xl bg-muted/40 border p-3.5 space-y-2">
            <div className="flex justify-between items-center text-muted-foreground">
              <span>지점:</span>
              <span className="font-semibold text-foreground">{activeBranch?.name}</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span>전송 대상 기간:</span>
              <span className="font-semibold text-foreground tabular-nums">
                {fromDate} → {toDate}
              </span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground border-t pt-2">
              <span>승인된 출퇴근 인원:</span>
              <span className="font-bold text-foreground">{uniqueStaff}명</span>
            </div>
            <div className="flex justify-between items-center text-muted-foreground">
              <span>총 승인 근무 시간:</span>
              <span className="font-bold text-primary text-sm">{totalHours}시간</span>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            * <strong>승인(Approved) 상태</strong>의 출퇴근 기록만 Xero로 전송됩니다. 아직 대기(Pending) 중인 기록은 타임시트에서 먼저 승인해 주세요.
          </p>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-[#13b5ea] hover:bg-[#0fa0cf] text-white font-semibold gap-1.5 shadow-sm"
            onClick={handleSync}
            disabled={!isConnected || syncing || approvedRows.length === 0}
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Xero로 전송 시작
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
