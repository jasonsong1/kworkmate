import React, { useMemo, useState } from 'react';
import { Calendar, Check, Filter, Flag, Paperclip, RotateCcw, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { STATUS_KEYS, STATUS_TONES, formatLeaveTypeName, hoursLabel, rangeLabel } from '@/lib/leave';
import { base44 } from '@/api/base44Client';
import { logActivity } from '@/lib/activityLogger';

/**
 * 휴가 신청 내역 및 결재 관리 테이블 컴포넌트
 *
 * 지원 기능:
 * 1. 직원이름 / 직원코드 검색 필터 (매니저 모드 시)
 * 2. 휴가 종류별 필터 (연차, 병가, 경조, 무급 등)
 * 3. 신청 기간(Date Range) 필터 (시작일 ~ 종료일 기간 중첩 조회)
 * 4. 결재 상태 필터 (승인 대기, 승인됨, 거절됨, 취소됨)
 * 5. 필터 초기화 및 실시간 필터링 결과 건수 표시
 * 6. 매니저 승인/거절/취소 및 첨부 진단서/증빙서류 확인 기능
 */
export default function LeaveRequestsTable({ requests, canManage, showEmployee, flagBalance, onDecided }) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // ==========================================
  // 1. 필터 상태 관리 (State)
  // ==========================================
  // 직원이름 또는 직원코드 검색어
  const [searchQuery, setSearchQuery] = useState('');
  // 휴가 종류 선택 ('all' 또는 개별 leave_type_key)
  const [typeFilter, setTypeFilter] = useState('all');
  // 처리 상태 선택 ('all', 'pending', 'approved', 'rejected', 'cancelled')
  const [statusFilter, setStatusFilter] = useState('all');
  // 기간 필터 (시작일, 종료일)
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 필터가 하나라도 적용되어 있는지 여부
  const isFilterActive = Boolean(
    searchQuery.trim() ||
    typeFilter !== 'all' ||
    statusFilter !== 'all' ||
    startDate ||
    endDate
  );

  // 필터 전체 초기화 함수
  const resetFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
  };

  // ==========================================
  // 2. 동적 휴가 종류 목록 추출 (Unique Leave Types)
  // ==========================================
  const availableLeaveTypes = useMemo(() => {
    if (!requests || requests.length === 0) return [];
    const typeMap = new Map();
    requests.forEach((req) => {
      const key = req.leave_type_key || 'other';
      if (!typeMap.has(key)) {
        typeMap.set(key, {
          key,
          name: formatLeaveTypeName(req, lang)
        });
      }
    });
    return Array.from(typeMap.values());
  }, [requests, lang]);

  // ==========================================
  // 3. 다중 조건 필터링 알고리즘
  // ==========================================
  const filteredRequests = useMemo(() => {
    if (!requests) return [];

    return requests.filter((req) => {
      // (1) 직원이름 / 직원코드 / 이메일 검색어 필터
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const empName = String(req.employee_name || '').toLowerCase();
        const empCode = String(req.employee_number || '').toLowerCase();
        const empEmail = String(req.employee_email || '').toLowerCase();
        const matchesEmployee =
          empName.includes(query) ||
          empCode.includes(query) ||
          empEmail.includes(query);

        if (!matchesEmployee) return false;
      }

      // (2) 휴가 종류 필터
      if (typeFilter !== 'all') {
        const reqType = req.leave_type_key || '';
        if (reqType !== typeFilter) return false;
      }

      // (3) 상태 필터 (pending, approved, rejected, cancelled)
      if (statusFilter !== 'all') {
        if (req.status !== statusFilter) return false;
      }

      // (4) 기간(Date Range) 필터 (기간 중첩 검사)
      // 선택한 startDate 이전 종료되거나, endDate 이후 시작하는 휴가는 제외
      if (startDate && req.end_date && req.end_date < startDate) {
        return false;
      }
      if (endDate && req.start_date && req.start_date > endDate) {
        return false;
      }

      return true;
    });
  }, [requests, searchQuery, typeFilter, statusFilter, startDate, endDate]);

  // ==========================================
  // 4. 결재 처리 함수 (승인, 거절, 취소)
  // ==========================================
  const decide = async (request, decision, text) => {
    setBusy(true);
    const response = await base44.functions.invoke('decideLeaveRequest', {
      request_id: request.id,
      decision,
      reason: text || ''
    });
    setBusy(false);
    if (response.data && response.data.error) {
      toast({ title: t('leave.decisionFailed'), variant: 'destructive' });
      return;
    }
    toast({ title: t('leave.decided') });

    // 휴가 결재 상세 감사 로그 기록
    logActivity({
      module: 'leave',
      action: decision === 'approved' ? 'approve' : 'reject',
      summary: `${request.employee_name || request.employee_email} 직원의 휴가 신청 ${decision === 'approved' ? '승인' : '거절'} (${request.start_date} ~ ${request.end_date}, ${request.hours}시간)`,
      details: {
        before: { status: request.status },
        after: { status: decision, reason: text || '' },
        leave_type: request.leave_type_key,
        hours: request.hours,
        start_date: request.start_date,
        end_date: request.end_date,
        reason: text || ''
      },
      targetId: request.id,
      targetName: request.employee_name || request.employee_email,
      branchId: request.branch_id
    });

    setDialog(null);
    setReason('');
    onDecided && onDecided();
  };

  // 잔액 초과 경고 표시 여부 계산
  const flagged = (request) =>
    flagBalance ? Number(flagBalance(request.employee_email, request.leave_type_key)) || 0 : 0;

  // 첨부된 진단서 또는 증빙서류 열람
  const openCertificate = async (request) => {
    const signed = await base44.integrations.Core.CreateFileSignedUrl({
      file_uri: request.certificate_file_uri,
      expires_in: 300
    }).catch(() => null);
    if (signed && signed.signed_url) window.open(signed.signed_url, '_blank', 'noopener');
  };

  // 원본 신청 목록 자체가 없는 경우
  if (!requests || requests.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t('leave.noRequests')}</p>;
  }

  return (
    <div className="space-y-4">
      {/* ==========================================
          5. 필터 툴바 영역 (직원명/코드, 휴가종류, 기간, 상태)
          ========================================== */}
      <div className="rounded-lg border bg-muted/20 p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 items-end">
          {/* (1) 직원이름 / 직원코드 검색 인풋 */}
          <div className={`${showEmployee ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
            <Label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              {showEmployee ? '직원명 또는 직원코드' : '검색'}
            </Label>
            <div className="relative">
              <Input
                placeholder={showEmployee ? '직원명, 코드, 이메일 검색...' : '검색어 입력...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pr-8 text-sm"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          {/* (2) 휴가 종류 드롭다운 셀렉트 */}
          <div className="lg:col-span-2">
            <Label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              휴가 종류
            </Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="전체 휴가" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 휴가</SelectItem>
                {availableLeaveTypes.map((tItem) => (
                  <SelectItem key={tItem.key} value={tItem.key}>
                    {tItem.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* (3) 결재 상태 드롭다운 셀렉트 */}
          <div className="lg:col-span-2">
            <Label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              처리 상태
            </Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="전체 상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="pending">승인 대기</SelectItem>
                <SelectItem value="approved">승인됨</SelectItem>
                <SelectItem value="rejected">거절됨</SelectItem>
                <SelectItem value="cancelled">취소됨</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* (4) 기간(Date Range) 필터 (시작일 ~ 종료일) */}
          <div className="lg:col-span-4">
            <Label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              신청 기간 (Date Range)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 text-xs sm:text-sm"
                title="조회 시작일"
              />
              <span className="text-muted-foreground text-xs font-medium">~</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 text-xs sm:text-sm"
                title="조회 종료일"
              />
            </div>
          </div>

          {/* (5) 초기화 버튼 */}
          <div className="lg:col-span-1 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetFilters}
              disabled={!isFilterActive}
              className="h-9 w-full gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              title="필터 초기화"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              초기화
            </Button>
          </div>
        </div>

        {/* 필터 활성화 요약 뱃지 및 결과 건수 알림 */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>
              총 <strong className="text-foreground">{requests.length}</strong>건 중{' '}
              <strong className="text-primary">{filteredRequests.length}</strong>건 표시
            </span>
            {isFilterActive && (
              <Badge variant="secondary" className="text-[11px] font-normal">
                필터 적용 중
              </Badge>
            )}
          </div>
          {isFilterActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] text-muted-foreground underline-offset-4 hover:underline"
            >
              전체 조건 해제
            </button>
          )}
        </div>
      </div>

      {/* ==========================================
          6. 휴가 신청 목록 테이블 영역
          ========================================== */}
      {filteredRequests.length === 0 ? (
        <div className="rounded-md border border-dashed py-12 text-center">
          <p className="text-sm font-medium text-foreground">조건에 맞는 휴가 신청 내역이 없습니다.</p>
          <p className="mt-1 text-xs text-muted-foreground">검색어나 선택한 필터 조건을 다시 확인해 주세요.</p>
          {isFilterActive && (
            <Button variant="outline" size="sm" onClick={resetFilters} className="mt-3 text-xs">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              필터 초기화
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {showEmployee ? <TableHead>{t('common.employee')}</TableHead> : null}
                <TableHead>{t('leave.type')}</TableHead>
                <TableHead>{t('leave.dates')}</TableHead>
                <TableHead>{t('leave.hours')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.map((request) => (
                <TableRow key={request.id}>
                  {showEmployee ? (
                    <TableCell>
                      <p className="font-medium">{request.employee_name}</p>
                      <p className="text-xs text-muted-foreground">{request.employee_number || request.employee_email}</p>
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <p className="text-sm font-medium">{formatLeaveTypeName(request, lang)}</p>
                    {request.reason ? <p className="text-xs text-muted-foreground">{request.reason}</p> : null}
                  </TableCell>
                  <TableCell className="text-sm">{rangeLabel(request)}</TableCell>
                  <TableCell className="text-sm">
                    {flagged(request) ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 font-medium text-destructive"
                        title={t('leave.flagged').replace('{hours}', String(flagged(request)))}
                      >
                        <Flag className="h-3.5 w-3.5" />
                        {hoursLabel(request.hours)}
                      </span>
                    ) : (
                      hoursLabel(request.hours)
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_TONES[request.status]}>{t(STATUS_KEYS[request.status] || 'leave.statusPending')}</Badge>
                    {request.status === 'rejected' && request.decision_reason ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">{request.decision_reason}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {request.certificate_file_uri ? (
                        <Button variant="ghost" size="icon" title={t('leave.certificate')} onClick={() => openCertificate(request)}>
                          <Paperclip className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {canManage && request.status === 'pending' ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t('leave.approve')}
                            onClick={() => decide(request, 'approve', '')}
                            disabled={busy}
                          >
                            <Check className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={t('leave.reject')}
                            onClick={() => setDialog(request)}
                            disabled={busy}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      ) : null}
                      {canManage && request.status === 'approved' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => decide(request, 'cancel', t('leave.cancelledByManager'))}
                          disabled={busy}
                        >
                          {t('leave.cancel')}
                        </Button>
                      ) : null}
                      {/* 신청자 본인은 미결재 상태 또는 승인된 상태에서 휴가 취소 요청 가능 */}
                      {!canManage && !showEmployee && ['pending', 'approved'].includes(request.status) ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => decide(request, 'cancel', t('leave.cancelledByEmployee'))}
                          disabled={busy}
                        >
                          {t('leave.cancel')}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 거절 사유 입력 팝업 다이얼로그 */}
      <Dialog open={Boolean(dialog)} onOpenChange={(next) => !next && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('leave.rejectTitle')}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>{t('leave.decisionReason')}</Label>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('common.optional')} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => decide(dialog, 'reject', reason)} disabled={busy}>
              {t('leave.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}