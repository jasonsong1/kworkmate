import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { DAYS, isBranchOpenOnDay } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

// 주당 근무 가능 일수 옵션
const DAYS_PER_WEEK_OPTIONS = [5, 6, 7];

// 하루 최대 시프트 수 기본값 및 옵션
const DEFAULT_SHIFTS_PER_DAY = 2;
const SHIFTS_PER_DAY_OPTIONS = [1, 2];

const DEFAULT_SHIFTS = [
  { key: 'open', label: 'Open', start_time: '08:00', end_time: '15:00' },
  { key: 'close', label: 'Close', start_time: '15:00', end_time: '22:00' }
];

const cellKey = (shiftKey, day, position) => `${shiftKey}::${day}::${position}`;
// 월요일이 0번 인덱스입니다.
const dayLabel = (dayIndex, t) => t(`day.${(dayIndex + 1) % 7}`);

// 매장의 시프트 패턴, 요일/직책별 필요 인원, 고정 근무자, 그리고 고용주 맞춤 AI 지침을 설정하는 대화상자입니다.
export default function RosterSettingsDialog({ open, onOpenChange, branch, onSaved }) {
  const { t } = useI18n();
  const { company } = useWorkspace();
  const { toast } = useToast();
  const [settingId, setSettingId] = useState('');
  const [shifts, setShifts] = useState(DEFAULT_SHIFTS);
  const [counts, setCounts] = useState({});
  const [fixed, setFixed] = useState({});
  const [staff, setStaff] = useState([]);
  const [minRest, setMinRest] = useState(10);
  const [maxDays, setMaxDays] = useState(5);
  const [dayOverrides, setDayOverrides] = useState({});
  const [maxShifts, setMaxShifts] = useState(DEFAULT_SHIFTS_PER_DAY);
  const [shiftOverrides, setShiftOverrides] = useState({});
  
  // 고용주 맞춤 AI 지침 상태 관리
  const [customInstructions, setCustomInstructions] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const positions = ((company && company.custom_roles) || []).map((role) => role.label);

  useEffect(() => {
    if (!open || !branch) return;
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      const [page, staffPage] = await Promise.all([
        base44.entities.RosterSetting.filter({ branch_id: branch.id }, { limit: 1 }),
        base44.entities.EmployeeProfile
          .filter({ branch_id: branch.id, status: 'active' }, { sort: 'full_name', limit: 200 })
          .catch(() => ({ items: [] }))
      ]);
      if (cancelled) return;
      setStaff(staffPage.items || []);
      const found = (page.items || [])[0];
      if (found) {
        setSettingId(found.id);
        setShifts(Array.isArray(found.shifts) && found.shifts.length > 0 ? found.shifts : DEFAULT_SHIFTS);
        setMinRest(Number(found.min_rest_hours) >= 0 ? Number(found.min_rest_hours) : 10);
        setMaxDays(Number(found.max_days_per_week) > 0 ? Number(found.max_days_per_week) : 5);
        
        // 고용주 맞춤 지침 불러오기
        setCustomInstructions(found.custom_instructions || '');

        const perPerson = {};
        (found.day_overrides || []).forEach((row) => {
          const days = Number(row && row.max_days);
          if (row && row.email && days > 0) perPerson[row.email] = days;
        });
        setDayOverrides(perPerson);
        setMaxShifts(
          Number(found.max_shifts_per_day) > 0 ? Number(found.max_shifts_per_day) : DEFAULT_SHIFTS_PER_DAY
        );
        const perPersonShifts = {};
        (found.shift_overrides || []).forEach((row) => {
          const count = Number(row && row.max_shifts);
          if (row && row.email && count > 0) perPersonShifts[row.email] = count;
        });
        setShiftOverrides(perPersonShifts);
        const next = {};
        (found.requirements || []).forEach((req) => {
          next[cellKey(req.shift_key, req.day, req.position)] = req.count;
        });
        setCounts(next);
        const pinned = {};
        (found.fixed_staff || []).forEach((row) => {
          const day = Number(row.day);
          if (!Number.isInteger(day) || !row.email) return;
          pinned[day] = [...(pinned[day] || []), row.email];
        });
        setFixed(pinned);
      } else {
        setSettingId('');
        setShifts(DEFAULT_SHIFTS);
        setMinRest(10);
        setMaxDays(5);
        setDayOverrides({});
        setMaxShifts(DEFAULT_SHIFTS_PER_DAY);
        setShiftOverrides({});
        setCounts({});
        setFixed({});
        setCustomInstructions('');
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, branch]);

  const setShift = (index, patch) => {
    setShifts((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addShift = () => {
    const key = `s${Date.now()}`;
    setShifts((prev) => [...prev, { key, label: '', start_time: '09:00', end_time: '17:00' }]);
  };

  const removeShift = (index) => {
    setShifts((prev) => prev.filter((_, i) => i !== index));
  };

  const setCount = (shiftKey, day, position, value) => {
    const parsed = value === '' ? '' : Math.max(0, parseInt(value, 10) || 0);
    setCounts((prev) => ({ ...prev, [cellKey(shiftKey, day, position)]: parsed }));
  };

  const toggleFixed = (day, email) => {
    setFixed((prev) => {
      const list = prev[day] || [];
      const on = list.includes(email);
      return {
        ...prev,
        [day]: on ? list.filter((e) => e !== email) : [...list, email]
      };
    });
  };

  const setDaysFor = (email, value) => {
    setDayOverrides((prev) => {
      const next = { ...prev };
      if (!value || value === 'default') delete next[email];
      else next[email] = Number(value);
      return next;
    });
  };

  const setShiftsFor = (email, value) => {
    setShiftOverrides((prev) => {
      const next = { ...prev };
      if (!value || value === 'default') delete next[email];
      else next[email] = Number(value);
      return next;
    });
  };

  const save = async () => {
    if (!branch) return;
    setSaving(true);
    const requirements = [];
    shifts.forEach((shift) => {
      for (let day = 0; day < 7; day += 1) {
        // 지점이 비즈니스를 안 하는 휴무일은 시프트 요구사항에서 제외합니다.
        if (!isBranchOpenOnDay(branch.trading_hours, day)) continue;
        positions.forEach((position) => {
          const value = Number(counts[cellKey(shift.key, day, position)]) || 0;
          if (value > 0) requirements.push({ day, shift_key: shift.key, position, count: value });
        });
      }
    });
    const fixedStaff = [];
    Object.entries(fixed).forEach(([day, emails]) => {
      (emails || []).forEach((email) => {
        const person = staff.find((row) => row.user_email === email);
        fixedStaff.push({ day: Number(day), email, name: person ? person.full_name : '' });
      });
    });
    const payload = {
      company_id: branch.company_id,
      branch_id: branch.id,
      shifts,
      requirements,
      fixed_staff: fixedStaff,
      min_rest_hours: Number(minRest) || 0,
      max_days_per_week: Number(maxDays) || 5,
      day_overrides: Object.entries(dayOverrides).map(([email, days]) => ({ email, max_days: Number(days) })),
      max_shifts_per_day: Number(maxShifts) || DEFAULT_SHIFTS_PER_DAY,
      shift_overrides: Object.entries(shiftOverrides).map(([email, count]) => ({
        email,
        max_shifts: Number(count)
      })),
      // 고용주 맞춤 AI 지침 저장
      custom_instructions: customInstructions.trim()
    };
    if (settingId) await base44.entities.RosterSetting.update(settingId, payload);
    else await base44.entities.RosterSetting.create(payload);
    setSaving(false);
    toast({ title: t('roster.settingsSaved') });
    onOpenChange(false);
    onSaved && onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('roster.settings')}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            {t('common.loading')}
          </p>
        ) : (
          <div className="space-y-7">
            {/* 1. 기본 시프트 타입 및 근무 간 최소 휴식 시간 설정 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('roster.shifts')}</Label>
                <Button size="sm" variant="outline" onClick={addShift}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> {t('roster.addShiftType')}
                </Button>
              </div>
              {shifts.map((shift, index) => (
                <div key={shift.key} className="grid items-end gap-3 sm:grid-cols-[1fr_130px_130px_auto]">
                  <div>
                    <Label className="mb-1 block text-xs">{t('roster.shiftName')}</Label>
                    <Input value={shift.label} onChange={(e) => setShift(index, { label: e.target.value })} />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">{t('roster.shiftStart')}</Label>
                    <Input
                      type="time"
                      value={shift.start_time}
                      onChange={(e) => setShift(index, { start_time: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">{t('roster.shiftEnd')}</Label>
                    <Input
                      type="time"
                      value={shift.end_time}
                      onChange={(e) => setShift(index, { end_time: e.target.value })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeShift(index)}
                    disabled={shifts.length <= 1}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <div className="max-w-xs">
                <Label className="mb-1 block text-xs">{t('roster.minRest')}</Label>
                <Input type="number" min="0" value={minRest} onChange={(e) => setMinRest(e.target.value)} />
              </div>
            </div>

            {/* 2. 주당 근무 일수 및 하루 시프트 제한 */}
            <div className="space-y-3">
              <div>
                <Label>{t('roster.maxDaysTitle')}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{t('roster.maxDaysHint')}</p>
              </div>
              <div className="grid max-w-xl gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 block text-xs">{t('roster.maxDaysDefault')}</Label>
                  <Select value={String(maxDays)} onValueChange={(value) => setMaxDays(Number(value))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_PER_WEEK_OPTIONS.map((days) => (
                        <SelectItem key={days} value={String(days)}>
                          {t('roster.daysOption').replace('{days}', String(days))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs">{t('roster.maxShiftsDefault')}</Label>
                  <Select value={String(maxShifts)} onValueChange={(value) => setMaxShifts(Number(value))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHIFTS_PER_DAY_OPTIONS.map((count) => (
                        <SelectItem key={count} value={String(count)}>
                          {t('roster.shiftsOption').replace('{count}', String(count))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {staff.length > 0 ? (
                <div className="pt-2">
                  <Label className="text-xs">{t('roster.individualRules')}</Label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {staff.map((person) => (
                      <div
                        key={person.id}
                        className="rounded-lg border bg-card/60 p-2.5 text-xs transition-colors hover:border-slate-300 dark:hover:border-slate-700"
                      >
                        <p className="font-medium truncate">{person.full_name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{person.position || '—'}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <Label className="mb-1 block text-[11px] text-muted-foreground">
                              {t('roster.daysPerPersonLabel')}
                            </Label>
                            <Select
                              value={String(dayOverrides[person.user_email] || 'default')}
                              onValueChange={(value) => setDaysFor(person.user_email, value)}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="default">{t('roster.daysDefaultOption')}</SelectItem>
                                {DAYS_PER_WEEK_OPTIONS.map((days) => (
                                  <SelectItem key={days} value={String(days)}>
                                    {t('roster.daysOption').replace('{days}', String(days))}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="mb-1 block text-[11px] text-muted-foreground">
                              {t('roster.shiftsPerPersonLabel')}
                            </Label>
                            <Select
                              value={String(shiftOverrides[person.user_email] || 'default')}
                              onValueChange={(value) => setShiftsFor(person.user_email, value)}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="default">
                                  {t('roster.shiftsDefaultOption').replace('{count}', String(maxShifts))}
                                </SelectItem>
                                {SHIFTS_PER_DAY_OPTIONS.map((count) => (
                                  <SelectItem key={count} value={String(count)}>
                                    {t('roster.shiftsOption').replace('{count}', String(count))}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* 3. 요일별 및 직책별 필요 인원 테이블 */}
            <div className="space-y-4">
              <div>
                <Label>{t('roster.headcount')}</Label>
              </div>
              {positions.length === 0 ? (
                <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  {t('role.noneHint')}
                </p>
              ) : (
                shifts.map((shift) => (
                  <div key={shift.key} className="overflow-x-auto">
                    <p className="mb-2 text-sm font-medium">{shift.label || shift.key}</p>
                    <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr>
                          <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">
                            {t('common.position')}
                          </th>
                          {DAYS.map((day, dayIndex) => {
                            const isOpen = isBranchOpenOnDay(branch?.trading_hours, dayIndex);
                            return (
                              <th
                                key={day.key}
                                className={`px-1 py-1.5 text-center text-xs font-medium transition-colors ${
                                  !isOpen ? 'bg-muted/30 text-muted-foreground/60 rounded-t' : 'text-muted-foreground'
                                }`}
                              >
                                <div>{dayLabel(dayIndex, t)}</div>
                                {!isOpen && (
                                  <span className="text-[10px] text-muted-foreground/60 font-normal block">
                                    (휴무)
                                  </span>
                                )}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map((position) => (
                          <tr key={position}>
                            <td className="whitespace-nowrap border-t px-2 py-1.5 text-xs font-medium">{position}</td>
                            {DAYS.map((day, dayIndex) => {
                              const isOpen = isBranchOpenOnDay(branch?.trading_hours, dayIndex);
                              return (
                                <td
                                  key={day.key}
                                  className={`border-t px-1 py-1 text-center transition-colors ${
                                    !isOpen ? 'bg-muted/15' : ''
                                  }`}
                                >
                                  {isOpen ? (
                                    <Input
                                      type="number"
                                      min="0"
                                      className="h-8 w-14 text-center"
                                      value={counts[cellKey(shift.key, dayIndex, position)] ?? ''}
                                      onChange={(e) => setCount(shift.key, dayIndex, position, e.target.value)}
                                    />
                                  ) : (
                                    <span className="text-xs text-muted-foreground/40 font-mono select-none">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>

            {/* 4. 요일별 고정 근무자 설정 */}
            <div className="space-y-3">
              <div>
                <Label>{t('roster.fixedTitle')}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{t('roster.fixedHint')}</p>
              </div>
              {staff.length === 0 ? (
                <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  {t('common.none')}
                </p>
              ) : (
                DAYS.map((day, dayIndex) => {
                  const isOpen = isBranchOpenOnDay(branch?.trading_hours, dayIndex);
                  return (
                    <div
                      key={day.key}
                      className={`rounded-xl border p-3 transition-colors ${
                        !isOpen ? 'bg-muted/20 opacity-75' : ''
                      }`}
                    >
                      <p className="mb-2 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <span>{dayLabel(dayIndex, t)}</span>
                        {!isOpen && (
                          <span className="text-[10px] text-muted-foreground/70 font-normal">
                            (휴무)
                          </span>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {staff.map((person) => {
                          const on = (fixed[dayIndex] || []).includes(person.user_email);
                          return (
                            <button
                              key={person.id}
                              type="button"
                              onClick={() => toggleFixed(dayIndex, person.user_email)}
                              className={
                                on
                                  ? 'rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary'
                                  : 'rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted'
                              }
                            >
                              {person.full_name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 5. 고용주 맞춤 AI 로스터 지침 (Custom AI Instructions) */}
            <div className="space-y-2 rounded-xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/50 via-card to-card p-4 dark:border-indigo-500/20 dark:from-indigo-950/20">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <Label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    고용주 맞춤 AI 로스터 지침
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                      Smart AI Prompt
                    </span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    기본 배정 알고리즘을 유지하면서, 고용주님이 원하는 특별 규칙이나 요청사항을 자유롭게 자연어로 입력하시면 AI가 로스터 생성 시 최우선 반영합니다.
                  </p>
                </div>
              </div>
              <Textarea
                rows={3}
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="예시:&#10;• sumin은 주 4일까지만 배정해줘&#10;• 금요일 오전에는 Tester를 우선 투입해줘&#10;• 오픈 시프트에는 경험이 많은 직원을 우선 배치해줘"
                className="mt-2 border-indigo-100 bg-card/80 text-sm focus-visible:ring-indigo-500/40 dark:border-indigo-950/40"
              />
              <p className="text-[11px] text-muted-foreground/80">
                💡 팁: 직원 이름, 특정 요일, 포지션 등에 대해 원하는 조건을 구체적으로 작성해주시면 더욱 똑똑하게 맞춰줍니다.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={saving || loading || positions.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}