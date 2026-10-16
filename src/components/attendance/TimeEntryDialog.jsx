import React, { useEffect, useState } from 'react';
import { Clock, Loader2, User, Calendar, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';
import { todayIso } from '@/lib/bh';
import { logActivity } from '@/lib/activityLogger';

/**
 * ISO 문자열 또는 Date 객체를 YYYY-MM-DD 및 HH:mm 로 분리
 */
function splitDateTime(isoStr) {
  if (!isoStr) return { date: todayIso(), time: '09:00' };
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return { date: todayIso(), time: '09:00' };
    const pad = (n) => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return { date, time };
  } catch {
    return { date: todayIso(), time: '09:00' };
  }
}

/**
 * 날짜와 시간을 합쳐서 ISO 문자열로 변환
 */
function combineDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    const d = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return d.toISOString();
  } catch {
    return null;
  }
}

export default function TimeEntryDialog({
  open,
  onOpenChange,
  entry = null, // null이면 신규 추가, 객체면 수정 모드
  employees = [],
  branch = null,
  onSaved
}) {
  const { t } = useI18n();
  const { toast } = useToast();

  const isEdit = Boolean(entry && entry.id);

  // 폼 상태
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [clockInDate, setClockInDate] = useState(todayIso());
  const [clockInTime, setClockInTime] = useState('09:00');
  const [hasClockOut, setHasClockOut] = useState(true);
  const [clockOutDate, setClockOutDate] = useState(todayIso());
  const [clockOutTime, setClockOutTime] = useState('17:00');
  const [approvalStatus, setApprovalStatus] = useState('approved');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 다이얼로그 열릴 때 초기값 동기화
  useEffect(() => {
    if (!open) return;
    setError('');

    if (entry) {
      setEmployeeEmail(entry.employee_email || '');
      const inParts = splitDateTime(entry.clock_in_at);
      setClockInDate(inParts.date);
      setClockInTime(inParts.time);

      if (entry.clock_out_at) {
        setHasClockOut(true);
        const outParts = splitDateTime(entry.clock_out_at);
        setClockOutDate(outParts.date);
        setClockOutTime(outParts.time);
      } else {
        setHasClockOut(false);
        setClockOutDate(inParts.date);
        setClockOutTime('17:00');
      }

      setApprovalStatus(entry.approval_status || 'approved');
      setNote(entry.rejection_reason || '');
    } else {
      // 신규 추가 기본값
      setEmployeeEmail(employees[0]?.user_email || '');
      setClockInDate(todayIso());
      setClockInTime('09:00');
      setHasClockOut(true);
      setClockOutDate(todayIso());
      setClockOutTime('17:00');
      setApprovalStatus('approved');
      setNote('');
    }
  }, [open, entry, employees]);

  // 실시간 근무 시간(분) 계산
  const inIso = combineDateTime(clockInDate, clockInTime);
  const outIso = hasClockOut ? combineDateTime(clockOutDate, clockOutTime) : null;
  let calcMinutes = 0;
  if (inIso && outIso) {
    const diffMs = new Date(outIso).getTime() - new Date(inIso).getTime();
    calcMinutes = Math.max(0, Math.round(diffMs / 60000));
  }
  const calcHours = Math.floor(calcMinutes / 60);
  const calcMins = calcMinutes % 60;

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');

    if (!branch || !branch.id) {
      setError('지점 정보가 올바르지 않습니다.');
      return;
    }

    if (!employeeEmail) {
      setError('직원을 선택해 주세요.');
      return;
    }

    const clockInAt = combineDateTime(clockInDate, clockInTime);
    if (!clockInAt) {
      setError('출근 시간을 올바르게 입력해 주세요.');
      return;
    }

    let clockOutAt = null;
    let minutes = 0;
    if (hasClockOut) {
      clockOutAt = combineDateTime(clockOutDate, clockOutTime);
      if (!clockOutAt) {
        setError('퇴근 시간을 올바르게 입력해 주세요.');
        return;
      }
      if (new Date(clockOutAt).getTime() <= new Date(clockInAt).getTime()) {
        setError('퇴근 시간은 출근 시간보다 늦어야 합니다.');
        return;
      }
      minutes = Math.max(0, Math.round((new Date(clockOutAt).getTime() - new Date(clockInAt).getTime()) / 60000));
    }

    // 직원 이름 및 사번 찾기
    const targetEmployee = employees.find((emp) => emp.user_email === employeeEmail);
    const employeeName = targetEmployee?.full_name || entry?.employee_name || employeeEmail;
    const employeeNumber = targetEmployee?.employee_number || entry?.employee_number || '';

    setSaving(true);
    try {
      if (isEdit) {
        // [수정 모드]
        await base44.entities.TimeEntry.update(entry.id, {
          employee_email: employeeEmail,
          employee_name: employeeName,
          employee_number: employeeNumber,
          clock_in_at: clockInAt,
          clock_out_at: clockOutAt,
          minutes,
          approval_status: approvalStatus,
          rejection_reason: approvalStatus === 'rejected' ? note : ''
        });
        toast({ title: '타임시트 기록이 성공적으로 수정되었습니다.' });

        // 디테일한 타임시트 수정 로그 기록
        logActivity({
          module: 'attendance',
          action: 'update',
          summary: `${employeeName} 직원의 출퇴근 타임시트 수정 (${clockInTime} ~ ${hasClockOut ? clockOutTime : '미퇴근'}, ${minutes}분)`,
          details: {
            before: {
              clock_in_at: entry.clock_in_at,
              clock_out_at: entry.clock_out_at,
              minutes: entry.minutes,
              approval_status: entry.approval_status,
            },
            after: {
              clock_in_at: clockInAt,
              clock_out_at: clockOutAt,
              minutes,
              approval_status: approvalStatus,
              rejection_reason: approvalStatus === 'rejected' ? note : ''
            },
            reason: note || ''
          },
          targetId: entry.id,
          targetName: employeeName,
          branchId: branch.id
        });
      } else {
        // [신규 추가 모드]
        const created = await base44.entities.TimeEntry.create({
          branch_id: branch.id,
          employee_email: employeeEmail,
          employee_name: employeeName,
          employee_number: employeeNumber,
          clock_in_at: clockInAt,
          clock_out_at: clockOutAt,
          minutes,
          source: 'manual',
          geo_verified: true,
          approval_status: approvalStatus,
          rejection_reason: approvalStatus === 'rejected' ? note : ''
        });
        toast({ title: '타임시트 기록이 새로 등록되었습니다.' });

        // 디테일한 타임시트 추가 로그 기록
        logActivity({
          module: 'attendance',
          action: 'create',
          summary: `${employeeName} 직원의 출퇴근 타임시트 수동 등록 (${clockInTime} ~ ${hasClockOut ? clockOutTime : '미퇴근'}, ${minutes}분)`,
          details: {
            after: {
              employee_email: employeeEmail,
              clock_in_at: clockInAt,
              clock_out_at: clockOutAt,
              minutes,
              source: 'manual',
              approval_status: approvalStatus
            },
            reason: note || ''
          },
          targetId: created?.id,
          targetName: employeeName,
          branchId: branch.id
        });
      }

      if (onSaved) onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error('[TimeEntryDialog] save error:', err);
      setError(err.message || '타임시트 기록 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Clock className="h-5 w-5 text-primary" />
            {isEdit ? '출퇴근 타임시트 수정' : '신규 출퇴근 타임시트 추가'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* 직원 선택 */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">직원 선택</Label>
            {isEdit ? (
              <Input
                value={`${entry.employee_name || ''} (${entry.employee_email})`}
                disabled
                className="bg-muted text-xs h-9"
              />
            ) : (
              <Select value={employeeEmail} onValueChange={setEmployeeEmail}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="직원을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.user_email} className="text-xs">
                      {emp.full_name} {emp.employee_number ? `(${emp.employee_number})` : ''} - {emp.user_email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* 출근 일시 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">출근 날짜</Label>
              <Input
                type="date"
                value={clockInDate}
                onChange={(e) => setClockInDate(e.target.value)}
                className="h-9 text-xs"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">출근 시간</Label>
              <Input
                type="time"
                value={clockInTime}
                onChange={(e) => setClockInTime(e.target.value)}
                className="h-9 text-xs"
                required
              />
            </div>
          </div>

          {/* 퇴근 일시 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">퇴근 일시</Label>
              <button
                type="button"
                onClick={() => setHasClockOut(!hasClockOut)}
                className="text-xs text-primary hover:underline"
              >
                {hasClockOut ? '퇴근 미등록으로 변경' : '퇴근 시간 입력'}
              </button>
            </div>

            {hasClockOut ? (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={clockOutDate}
                  onChange={(e) => setClockOutDate(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
                <Input
                  type="time"
                  value={clockOutTime}
                  onChange={(e) => setClockOutTime(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-2.5 text-center text-xs text-muted-foreground bg-muted/30">
                아직 퇴근하지 않은 근무 중 상태로 등록됩니다.
              </div>
            )}
          </div>

          {/* 실시간 근무 시간 표시 배지 */}
          {hasClockOut && calcMinutes > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs">
              <span className="text-muted-foreground">총 계산 근무시간</span>
              <span className="font-semibold text-primary">
                {calcHours > 0 ? `${calcHours}시간 ` : ''}{calcMins}분 ({calcMinutes}분)
              </span>
            </div>
          )}

          {/* 승인 상태 */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">승인 상태</Label>
            <Select value={approvalStatus} onValueChange={setApprovalStatus}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">승인 완료 (Approved)</SelectItem>
                <SelectItem value="pending">승인 대기 (Pending)</SelectItem>
                <SelectItem value="rejected">거절 (Rejected)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {approvalStatus === 'rejected' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">거절 사유</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="거절 사유를 입력하세요"
                className="h-9 text-xs"
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 p-2.5 rounded-lg">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {isEdit ? '수정 완료' : '등록'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
