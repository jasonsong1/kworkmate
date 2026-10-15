import React, { useEffect, useState } from 'react';
import { Loader2, Plus, X, Copy, Send, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { EMPLOYMENT_TYPES, EMPLOYMENT_LABEL_KEYS, VISA_TYPES, VISA_LABEL_KEYS } from '@/lib/bh';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { usePermissions } from '@/lib/permissions';
import { base44 } from '@/api/base44Client';
import { logActivity } from '@/lib/activityLogger';

// 직원의 기본 빈 양식 데이터
const empty = {
  full_name: '',
  user_email: '',
  position: '',
  secondary_position: '',
  extra_positions: [],
  visa_type: '',
  app_role: 'staff',
  hourly_rate: '',
  employment_type: 'casual',
  start_date: '',
  phone: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  language: 'ko',
  pin: '',
  onboarding_status: 'pending',
  send_invite: false,
  send_onboarding_email: true
};

export default function EmployeeDialog({ open, onOpenChange, branch, employee, onSaved }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { company, role: myRole } = useWorkspace();
  const { canEdit } = usePermissions();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // 온보딩 링크 복사 및 개별 발송 로딩 상태
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [currentOnboardingToken, setCurrentOnboardingToken] = useState('');

  const canAssignRole = myRole === 'company_admin';
  // 온보딩 서류를 실제로 제출했는지 여부
  const onboardingSubmitted = Boolean(employee && employee.onboarding_submitted_at);
  const canEditEmployees = canEdit('employees') || canAssignRole;
  
  const positionLabels = (company && company.custom_roles || []).map((item) => item.label);
  const positionOptions =
    form.position && !positionLabels.includes(form.position) ? [...positionLabels, form.position] : positionLabels;
  const hasPositions = positionLabels.length > 0;

  const pickPosition = (label) => {
    const match = (company && company.custom_roles || []).find((item) => item.label === label);
    setForm((prev) => ({ ...prev, position: label, ...(match && canAssignRole ? { app_role: match.key } : {}) }));
  };

  useEffect(() => {
    if (!open) return;
    setError('');
    setCopied(false);
    if (employee) {
      setCurrentOnboardingToken(employee.onboarding_token || '');
      setForm({
        ...empty,
        full_name: employee.full_name || '',
        user_email: employee.user_email || '',
        position: employee.position || '',
        secondary_position: employee.secondary_position || '',
        extra_positions: Array.isArray(employee.extra_positions) ? employee.extra_positions : [],
        visa_type: employee.visa_type || '',
        app_role: employee.app_role || 'staff',
        hourly_rate: employee.hourly_rate ?? '',
        employment_type: employee.employment_type || 'casual',
        start_date: employee.start_date || '',
        phone: employee.phone || '',
        emergency_contact_name: employee.emergency_contact_name || '',
        emergency_contact_phone: employee.emergency_contact_phone || '',
        language: employee.language === 'en' ? 'en' : 'ko',
        onboarding_status: employee.onboarding_status || 'pending',
        send_invite: false,
        send_onboarding_email: false
      });
    } else {
      setCurrentOnboardingToken('');
      setForm(empty);
    }
  }, [open, employee]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // 직무 추가 및 관리 로직
  const MAX_POSITIONS = 10;
  const maxExtra = MAX_POSITIONS - 2;
  const addPosition = () =>
    setForm((prev) => (prev.extra_positions.length >= maxExtra ? prev : { ...prev, extra_positions: [...prev.extra_positions, ''] }));
  const setExtraPosition = (index, value) =>
    setForm((prev) => ({
      ...prev,
      extra_positions: prev.extra_positions.map((item, at) => (at === index ? value : item))
    }));
  const removePosition = (index) =>
    setForm((prev) => ({ ...prev, extra_positions: prev.extra_positions.filter((item, at) => at !== index) }));

  const accessNote = (data) => {
    if (data.email_error) return data.email_error;
    if (data.invited) return t('employees.accessInvited');
    if (data.existing) return data.password_email_sent ? t('employees.accessRestored') : t('employees.accessKnown');
    return t('employees.accessGranted');
  };

  // 온보딩 링크 클립보드 복사 함수
  const copyOnboardingLink = async () => {
    let token = currentOnboardingToken || (employee && employee.onboarding_token);
    let link = token ? `${window.location.origin}/onboarding/${token}` : '';

    if (!link && employee) {
      setCopying(true);
      try {
        const res = await base44.functions.invoke('manageEmployee', {
          action: 'send_onboarding_email',
          employee_id: employee.id,
          origin: window.location.origin,
          send_onboarding_email: false
        });
        if (res.data?.onboarding_link) {
          link = res.data.onboarding_link;
          if (res.data.onboarding_token) {
            setCurrentOnboardingToken(res.data.onboarding_token);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setCopying(false);
      }
    }

    if (link) {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast({
        title: '온보딩 링크 복사 완료',
        description: '클립보드에 복사되었습니다. 카카오톡이나 문자로 전송하세요.'
      });
    } else {
      toast({
        variant: 'destructive',
        title: '온보딩 링크 생성 실패',
        description: '직원 정보가 먼저 저장되어 있어야 링크를 생성할 수 있습니다.'
      });
    }
  };

  // 모달 안에서 온보딩 이메일 지금 즉시 발송
  const sendOnboardingEmailNow = async () => {
    if (!employee) {
      toast({
        variant: 'destructive',
        title: '저장 필요',
        description: '신규 직원은 먼저 저장 후 온보딩 메일을 발송할 수 있습니다.'
      });
      return;
    }
    setSendingEmail(true);
    try {
      const res = await base44.functions.invoke('manageEmployee', {
        action: 'send_onboarding_email',
        employee_id: employee.id,
        origin: window.location.origin,
        send_onboarding_email: true
      });
      const data = res.data || {};
      if (data.onboarding_token) {
        setCurrentOnboardingToken(data.onboarding_token);
      }
      if (data.email_sent) {
        toast({
          title: '온보딩 링크 발송 완료',
          description: `${form.user_email || employee.user_email} (으)로 온보딩 안내 메일이 발송되었습니다.`
        });
      } else if (data.email_error) {
        toast({
          variant: 'destructive',
          title: '이메일 발송 실패',
          description: data.email_error
        });
      } else {
        toast({ title: '온보딩 이메일 발송 요청을 처리했습니다.' });
      }
    } catch (e) {
      toast({
        variant: 'destructive',
        title: '오류 발생',
        description: '온보딩 메일 발송 중 문제가 발생했습니다.'
      });
    } finally {
      setSendingEmail(false);
    }
  };

  // 프로필 저장 제출
  const submit = async () => {
    if (!branch) return;
    if (!form.full_name.trim() || !form.user_email.trim()) {
      setError(t('employees.nameEmailRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await base44.functions.invoke('manageEmployee', {
        action: employee ? 'update' : 'create',
        branch_id: branch.id,
        origin: window.location.origin,
        employee: {
          ...form,
          user_email: form.user_email.trim().toLowerCase(),
          position: form.position || (employee && employee.position) || '',
          ...(employee ? { id: employee.id } : {})
        }
      });
      if (response.data?.error) {
        setError(response.data.error);
        return;
      }
      const saved = response.data || {};
      const savedId = employee ? employee.id : saved.employee && saved.employee.id;
      toast({
        title: employee ? t('employees.updated') : `${t('employees.added')} · ${saved.employee_number}`
      });

      // 직원 정보 추가/수정 디테일 감사 로그 기록
      logActivity({
        module: 'employees',
        action: employee ? 'update' : 'create',
        summary: employee
          ? `${form.full_name} 직원의 프로필 정보 수정 (직책: ${form.position || '미지정'}, 시급: $${form.hourly_rate || 0})`
          : `신규 직원 ${form.full_name} (${form.user_email}) 등록`,
        details: {
          before: employee ? {
            position: employee.position,
            hourly_rate: employee.hourly_rate,
            employment_type: employee.employment_type,
            visa_type: employee.visa_type,
            app_role: employee.app_role,
            phone: employee.phone
          } : null,
          after: {
            full_name: form.full_name,
            user_email: form.user_email,
            position: form.position,
            hourly_rate: form.hourly_rate,
            employment_type: form.employment_type,
            visa_type: form.visa_type,
            app_role: form.app_role,
            phone: form.phone
          }
        },
        targetId: savedId,
        targetName: form.full_name,
        branchId: branch?.id
      });

      onOpenChange(false);
      onSaved && onSaved();

      // 신규 등록 시에만 초대 및 온보딩 이메일 자동 발송 옵션 전달
      if (savedId && !employee) {
        base44.functions.
        invoke('manageEmployee', {
          action: 'grant_access',
          employee_id: savedId,
          origin: window.location.origin,
          send_invite: form.send_invite,
          send_onboarding_email: form.send_onboarding_email
        }).
        then((result) => {
          const access = result.data || {};
          if (access.error) {
            toast({ variant: 'destructive', title: access.error });
            return;
          }
          toast({ title: accessNote(access) });
        }).
        catch(() => {});
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden w-full break-words">
        <DialogHeader>
          <DialogTitle>{employee ? t('common.edit') : t('employees.add')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{t('common.name')} *</Label>
            <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
          </div>
          <div>
            <Label>{t('common.email')} *</Label>
            <Input
              value={form.user_email}
              onChange={(e) => set('user_email', e.target.value)}
              placeholder="staff@email.com" />
            <p className="mt-1 text-xs text-muted-foreground">{t('employees.emailHint')}</p>
          </div>
          <div>
            <Label>{t('common.position')}</Label>
            <Select value={form.position || ''} onValueChange={pickPosition} disabled={!canEditEmployees}>
              <SelectTrigger>
                <SelectValue placeholder={t('role.select')} />
              </SelectTrigger>
              <SelectContent>
                {positionOptions.map((label) =>
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {!hasPositions &&
              <p className="mt-1 text-xs text-muted-foreground">{t('employees.noCustomRoles')}</p>
            }
          </div>
          <div>
            <Label>{t('employees.secondaryPosition')}</Label>
            <Select
              value={form.secondary_position || ''}
              onValueChange={(v) => set('secondary_position', v)}
              disabled={!canEditEmployees}>
              <SelectTrigger>
                <SelectValue placeholder={t('employees.none')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('employees.none')}</SelectItem>
                {positionOptions.map((label) =>
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('employees.extraPositions')}</Label>
              {canEditEmployees && form.extra_positions.length < maxExtra &&
                <Button type="button" variant="outline" size="sm" onClick={addPosition}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {t('employees.addPosition')}
                </Button>
              }
            </div>
            {form.extra_positions.map((value, idx) =>
              <div key={idx} className="flex items-center gap-2">
                <Select
                  value={value || ''}
                  onValueChange={(v) => setExtraPosition(idx, v)}
                  disabled={!canEditEmployees}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={t('role.select')} />
                  </SelectTrigger>
                  <SelectContent>
                    {positionOptions.map((label) =>
                      <SelectItem key={label} value={label}>
                        {label}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {canEditEmployees &&
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePosition(idx)}>
                    <X className="h-4 w-4" />
                  </Button>
                }
              </div>
            )}
          </div>

          <div>
            <Label>{t('employees.visa')}</Label>
            <Select value={form.visa_type || ''} onValueChange={(v) => set('visa_type', v)}>
              <SelectTrigger>
                <SelectValue placeholder={t('common.select')} />
              </SelectTrigger>
              <SelectContent>
                {VISA_TYPES.map((v) =>
                  <SelectItem key={v.value} value={v.value}>
                    {t(VISA_LABEL_KEYS[v.value] || v.value)}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t('employees.employmentType')}</Label>
            <Select value={form.employment_type} onValueChange={(v) => set('employment_type', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((e) =>
                  <SelectItem key={e.value} value={e.value}>
                    {t(EMPLOYMENT_LABEL_KEYS[e.value] || e.value)}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('employees.startDate')}</Label>
            <Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </div>
          <div>
            <Label>{t('common.phone')}</Label>
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div>
            <Label>{t('employees.emergencyContact')}</Label>
            <Input
              value={form.emergency_contact_name}
              onChange={(e) => set('emergency_contact_name', e.target.value)} />
          </div>
          <div>
            <Label>{t('employees.emergencyPhone')}</Label>
            <Input
              value={form.emergency_contact_phone}
              onChange={(e) => set('emergency_contact_phone', e.target.value)} />
          </div>
          <div>
            <Label>{t('employees.uiLanguage')}</Label>
            <Select value={form.language} onValueChange={(v) => set('language', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ko">{t('employees.languageKo')}</SelectItem>
                <SelectItem value="en">{t('employees.languageEn')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">{t('employees.uiLanguageHint')}</p>
          </div>
          <div>
            <Label>{t('employees.pin')}</Label>
            <Input
              value={form.pin}
              inputMode="numeric"
              autoComplete="off"
              onChange={(e) => set('pin', e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={employee && employee.pin_hash ? t('employees.pinSet') : t('employees.pinNew')} />
            <p className="mt-1 text-xs text-muted-foreground">{t('employees.pinHint')}</p>
          </div>

          {/* 신규 등록 시 온보딩 안내 메일 발송 옵션 */}
          {!employee && (
            <div className="flex items-center justify-between rounded-lg border px-4 py-3 sm:col-span-2">
              <span className="text-sm">{t('employees.sendOnboarding')}</span>
              <Switch
                checked={form.send_onboarding_email}
                onCheckedChange={(v) => set('send_onboarding_email', v)} />
            </div>
          )}

          {/* 기존 직원 수정 시 온보딩 제어 카드 (다크/라이트 테마 일체화) */}
          {employee && (
            <div className="sm:col-span-2 space-y-3 rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-sm text-foreground">온보딩</h4>
                  {!onboardingSubmitted && (
                    <p className="text-xs text-muted-foreground mt-0.5">{t('employees.statusLocked')}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-xs h-8"
                    disabled={copying}
                    onClick={copyOnboardingLink}>
                    {copied ? (
                      <>
                        <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                        복사됨!
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        {copying ? '생성 중...' : '온보딩 링크 복사'}
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8"
                    disabled={sendingEmail}
                    onClick={sendOnboardingEmailNow}>
                    {sendingEmail ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        발송 중...
                      </>
                    ) : (
                      <>
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                        지금 이메일 발송
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-2 border-t border-border/50">
                <span className="text-sm text-foreground">{t('employees.onboarding')}</span>
                <Select
                  value={form.onboarding_status}
                  onValueChange={(v) => set('onboarding_status', v)}>
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t('employees.statusPending')}</SelectItem>
                    <SelectItem value="in_progress">{t('employees.statusInProgress')}</SelectItem>
                    <SelectItem
                      value="completed"
                      disabled={!onboardingSubmitted && form.onboarding_status !== 'completed'}>
                      {t('employees.statusCompleted')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
