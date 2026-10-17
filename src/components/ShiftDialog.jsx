import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

// 하나의 시프트를 추가하거나 수정하는 다이얼로그 모달입니다.
// 매장의 시프트 설정(Open, Close 등)을 불러와 원클릭 퀵 버튼으로 시간을 자동 입력할 수 있습니다.
export default function ShiftDialog({
  open,
  onOpenChange,
  branch,
  employees,
  defaultDate,
  defaultEmployee,
  shift,
  onLeaveFor,
  getLeaveFor,
  approvedLeave,
  onSaved
}) {
  const { t } = useI18n();
  const { company } = useWorkspace();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const editing = Boolean(shift);

  // 회사의 등록된 직책 목록을 가져옵니다.
  const roles = ((company && company.custom_roles) || []).map((role) => role.label).filter(Boolean);
  const held = [defaultEmployee && defaultEmployee.position, shift && shift.position].filter(
    (label) => label && !roles.includes(label)
  );
  const positions = [...new Set([...roles, ...held])];
  const person = editing
    ? { user_email: shift.employee_email, full_name: shift.employee_name || shift.employee_email }
    : defaultEmployee;

  // 매장의 시프트 템플릿 목록 (예: Open, Close 등)
  const [shiftTemplates, setShiftTemplates] = useState([]);

  const [form, setForm] = useState({
    employee_email: '',
    date: '',
    start_time: '09:00',
    end_time: '17:00',
    position: '',
    break_min: 30,
    notes: ''
  });

  // 선택된 직원이 선택된 날짜에 승인된 휴가 정보(종일 휴가 vs 반차) 실시간 판별
  const leaveInfo = useMemo(() => {
    if (!form.employee_email || !form.date) return null;
    if (getLeaveFor) {
      return getLeaveFor(form.employee_email, form.date);
    }
    const found = (approvedLeave || []).find(
      (row) =>
        row.employee_email === form.employee_email &&
        form.date >= String(row.start_date || '').slice(0, 10) &&
        String(row.end_date || row.start_date || '').slice(0, 10) >= form.date
    );
    if (!found) return null;
    const isSingleDay =
      String(found.start_date || '').slice(0, 10) === String(found.end_date || found.start_date || '').slice(0, 10);
    const hours = Number(found.hours) || 0;
    const isPartial = isSingleDay && hours > 0 && hours < 7.6;
    return {
      leave: found,
      isFullDay: !isPartial,
      isPartial,
      hours: hours > 0 ? hours : 7.6,
      typeName: found.leave_type_name || ''
    };
  }, [form.employee_email, form.date, getLeaveFor, approvedLeave]);

  const isFullDayLeave = Boolean(leaveInfo && leaveInfo.isFullDay);
  const isPartialLeave = Boolean(leaveInfo && leaveInfo.isPartial);
  const leaveHours = leaveInfo ? leaveInfo.hours : 0;

  // 선택된 직원의 이름 찾기
  const targetPerson = (employees || []).find((e) => e.user_email === form.employee_email) || person;
  const targetPersonName = targetPerson ? targetPerson.full_name || targetPerson.user_email : '직원';

  // 다이얼로그가 열릴 때 폼 초기화 및 매장의 시프트 템플릿(RosterSetting) 로드
  useEffect(() => {
    if (!open) return;
    setForm({
      employee_email: person ? person.user_email : '',
      date: (shift && shift.date) || defaultDate || '',
      start_time: (shift && shift.start_time) || '09:00',
      end_time: (shift && shift.end_time) || '17:00',
      position: (shift && shift.position) || (person && person.position) || roles[0] || '',
      break_min: shift ? Number(shift.break_min) || 0 : 30,
      notes: (shift && shift.notes) || ''
    });

    // 매장 시프트 설정(Open, Close 등) 가져오기
    if (branch && branch.id) {
      base44.entities.RosterSetting.filter({ branch_id: branch.id }, { limit: 1 })
        .then((page) => {
          const found = (page && page.items ? page.items : [])[0];
          if (found && Array.isArray(found.shifts) && found.shifts.length > 0) {
            setShiftTemplates(found.shifts);
          } else {
            setShiftTemplates([]);
          }
        })
        .catch(() => setShiftTemplates([]));
    }
  }, [open, defaultDate, defaultEmployee, shift, branch]);

  // 시프트 템플릿 버튼을 눌렀을 때 시작/종료 시간을 즉시 자동 입력하는 핸들러
  const applyShiftTemplate = (tmpl) => {
    setForm((prev) => ({
      ...prev,
      start_time: tmpl.start_time || prev.start_time,
      end_time: tmpl.end_time || prev.end_time
    }));
  };

  // 이미 배정/발송된 시프트가 변경되면 직원에게 안내 알림 전송
  const tellThem = async (change, details) => {
    if (!editing || shift.status !== 'published') return;
    await base44.functions
      .invoke('notifyShiftChange', {
        branch_id: branch.id,
        employee_email: details.email,
        change,
        published: true,
        date: details.date,
        start_time: details.start_time,
        end_time: details.end_time,
        position: details.position
      })
      .catch(() => null);
  };

  const submit = async () => {
    if (!branch || !form.employee_email || !form.date) {
      toast({ title: '직원과 날짜를 선택해주세요', variant: 'destructive' });
      return;
    }
    // 선택된 날짜가 승인된 종일 휴가인 경우 즉시 배정 차단 (반차는 허용)
    if (isFullDayLeave) {
      toast({
        title: '배정 불가: 해당 직원은 종일 휴가 중입니다.',
        description: `${targetPersonName} 님은 ${form.date}에 종일 휴가로 등록되어 시프트를 배정할 수 없습니다.`,
        variant: 'destructive'
      });
      return;
    }
    const toMinutes = (value) => {
      const [hour, minute] = String(value || '').split(':').map(Number);
      return (hour || 0) * 60 + (minute || 0);
    };
    const start = toMinutes(form.start_time);
    const end = toMinutes(form.end_time);
    if (end <= start) {
      toast({ title: '종료 시간은 시작 시간보다 늦어야 합니다', variant: 'destructive' });
      return;
    }
    const sameDayPage = await base44.entities.Shift
      .filter({ branch_id: branch.id, employee_email: form.employee_email, date: form.date })
      .catch(() => null);
    const sameDay = ((sameDayPage && sameDayPage.items) || sameDayPage || []).filter(
      (row) => !editing || row.id !== shift.id
    );
    const clash = sameDay.some((row) => start < toMinutes(row.end_time) && toMinutes(row.start_time) < end);
    if (clash) {
      toast({ title: '해당 직원의 근무 시간이 겹치는 기존 시프트가 있습니다', variant: 'destructive' });
      return;
    }
    // 승인된 휴가가 있는 날 재확인 (종일 휴가만 차단, 반차는 허용)
    const dbLeaveRows = await base44.entities.LeaveRequest
      .filter({
        employee_email: form.employee_email,
        status: 'approved',
        start_date: { $lte: form.date },
        end_date: { $gte: form.date }
      })
      .catch(() => []);
    const hasFullDayDbLeave = (dbLeaveRows || []).some((row) => {
      const startDate = String(row.start_date || '').slice(0, 10);
      const endDate = String(row.end_date || row.start_date || '').slice(0, 10);
      const isSingleDay = startDate === endDate;
      const hours = Number(row.hours) || 0;
      const isPartial = isSingleDay && hours > 0 && hours < 7.6;
      return !isPartial;
    });
    if (hasFullDayDbLeave) {
      toast({ title: '해당 날짜에 승인된 종일 휴가가 있어 시프트를 배정할 수 없습니다.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await base44.entities.Shift.update(shift.id, {
          date: form.date,
          start_time: form.start_time,
          end_time: form.end_time,
          position: form.position,
          break_min: Number(form.break_min) || 0,
          notes: form.notes
        });
        await tellThem('updated', {
          email: shift.employee_email,
          date: form.date,
          start_time: form.start_time,
          end_time: form.end_time,
          position: form.position
        });
        toast({ title: t('roster.shiftUpdated') });
      } else {
        const employee = employees.find((e) => e.user_email === form.employee_email);
        await base44.entities.Shift.create({
          company_id: branch.company_id,
          branch_id: branch.id,
          employee_email: form.employee_email,
          employee_name: employee ? employee.full_name : form.employee_email,
          date: form.date,
          start_time: form.start_time,
          end_time: form.end_time,
          position: form.position,
          break_min: Number(form.break_min) || 0,
          status: 'draft',
          notes: form.notes
        });
        await tellThem('created', {
          email: form.employee_email,
          date: form.date,
          start_time: form.start_time,
          end_time: form.end_time,
          position: form.position
        });
        toast({ title: t('roster.shiftAdded') });
      }
      onOpenChange(false);
      onSaved && onSaved({ date: form.date, position: form.position });
    } finally {
      setSaving(false);
    }
  };

  const cancelShift = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await base44.entities.Shift.delete(shift.id);
      await tellThem('cancelled', {
        email: shift.employee_email,
        date: shift.date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        position: shift.position
      });
      toast({ title: t('roster.shiftCancelled') });
      onOpenChange(false);
      onSaved && onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? t('roster.editShiftTitle') : t('roster.addShiftTitle')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* 승인된 종일 휴가 경고 배너 (이모티콘 없음) */}
          {isFullDayLeave && (
            <div className="sm:col-span-2 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 shadow-sm dark:border-amber-700/50 dark:bg-amber-950/60 dark:text-amber-200">
              <div className="space-y-0.5">
                <p className="font-semibold text-amber-950 dark:text-amber-100">
                  승인된 휴가 (종일)
                </p>
                <p className="text-[11px] leading-relaxed opacity-90">
                  선택하신 직원({targetPersonName})은 <strong>{form.date}</strong>에 종일 휴가(Leave) 중입니다. 종일 휴가일에는 시프트를 배정할 수 없습니다.
                </p>
              </div>
            </div>
          )}

          {/* 승인된 반차/시간 휴가 안내 배너 (이모티콘 없음, 배정 허용) */}
          {isPartialLeave && (
            <div className="sm:col-span-2 flex items-start gap-2.5 rounded-xl border border-sky-300 bg-sky-50 p-3 text-xs text-sky-900 shadow-sm dark:border-sky-800/60 dark:bg-sky-950/50 dark:text-sky-200">
              <div className="space-y-0.5">
                <p className="font-semibold text-sky-950 dark:text-sky-100">
                  반차/시간 휴가 등록 안내 ({leaveHours}시간)
                </p>
                <p className="text-[11px] leading-relaxed opacity-90">
                  선택하신 직원({targetPersonName})은 <strong>{form.date}</strong>에 {leaveHours}시간 휴가가 승인되어 있습니다. 남은 시간에 시프트 배정이 가능합니다. (권장 남은 근무: 약 {Math.max(0, 7.6 - leaveHours).toFixed(1)}시간)
                </p>
              </div>
            </div>
          )}

          {person ? (
            <div className="sm:col-span-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="font-medium">{person.full_name}</span>
              {person.position ? <span className="text-muted-foreground"> · {person.position}</span> : null}
            </div>
          ) : (
            <div className="sm:col-span-2">
              <Label>직원 선택</Label>
              <Select value={form.employee_email} onValueChange={(v) => setForm({ ...form, employee_email: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="직원을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.user_email}>
                      {e.full_name} {e.position ? `· ${e.position}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>날짜</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <Label>{t('common.position')}</Label>
            <Select
              value={form.position}
              onValueChange={(v) => setForm({ ...form, position: v })}
              disabled={positions.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('role.select')} />
              </SelectTrigger>
              <SelectContent>
                {positions.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {positions.length === 0 && <p className="mt-1 text-xs text-muted-foreground">{t('roster.noPositions')}</p>}
          </div>

          {/* 시프트 프리셋 빠른 선택 버튼 옵션 */}
          {shiftTemplates.length > 0 && (
            <div className="sm:col-span-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>시프트 프리셋</Label>
                <span className="text-xs text-muted-foreground">버튼 클릭 시 시간 자동 입력</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {shiftTemplates.map((tmpl) => {
                  const isSelected = form.start_time === tmpl.start_time && form.end_time === tmpl.end_time;
                  return (
                    <Button
                      key={tmpl.key || tmpl.label}
                      type="button"
                      variant="outline"
                      onClick={() => applyShiftTemplate(tmpl)}
                      className={`h-9 px-3 text-xs font-medium justify-center gap-1.5 transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <span className="font-semibold">{tmpl.label || tmpl.key}</span>
                      <span className="text-[11px] opacity-75">
                        {tmpl.start_time}-{tmpl.end_time}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <Label>시작 시간 (Start)</Label>
            <Input
              type="time"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            />
          </div>
          <div>
            <Label>종료 시간 (End)</Label>
            <Input
              type="time"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            />
          </div>
          <div>
            <Label>휴게시간 (분)</Label>
            <Input
              type="number"
              value={form.break_min}
              onChange={(e) => setForm({ ...form, break_min: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>메모 (Notes)</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {editing && shift.status === 'published' ? (
            <p className="sm:col-span-2 text-xs text-muted-foreground">{t('roster.sentChangeHint')}</p>
          ) : null}
        </div>
        <DialogFooter className="sm:justify-between">
          {editing ? (
            <Button variant="destructive" onClick={cancelShift} disabled={saving}>
              <Trash2 className="mr-2 h-4 w-4" /> {t('roster.cancelShift')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={saving || isFullDayLeave}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? t('roster.saveShift') : t('roster.addShiftAction')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}