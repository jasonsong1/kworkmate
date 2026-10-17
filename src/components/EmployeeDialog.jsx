import React, { useEffect, useState } from 'react';
import { Loader2, Plus, X, Copy, Send, Check, Lock, Unlock, ShieldAlert, DollarSign, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useI18n, formatRoleLabel } from '@/lib/i18n';
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
  penalty_rates_enabled: false,
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
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const { company, role: myRole, me, isPlatformAdmin, presetKey, employeeProfile } = useWorkspace();
  const { canEdit } = usePermissions();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  // 온보딩 링크 복사 및 개별 발송 로딩 상태
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [currentOnboardingToken, setCurrentOnboardingToken] = useState('');

  // 시급(Hourly Rate) 비밀번호 보호 및 잠금 해제 상태 관리
  const [rateUnlocked, setRateUnlocked] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [verifying, setVerifying] = useState(false);

  // 시급 조회 권한: 슈퍼바이저 제외, manager, pro director, 오너, 플랫폼 관리자만 허용
  const isSupervisor = String(presetKey || '').toLowerCase().includes('supervisor');
  const canViewHourlyRate =
    (isPlatformAdmin ||
      ['manager', 'pro_director', 'director'].includes(String(presetKey || '').toLowerCase()) ||
      ['오너', 'owner', '대표', 'director'].includes(String(employeeProfile?.employment_type || '').toLowerCase()) ||
      ['manager', 'pro_director', 'admin'].includes(String(me?.app_role || '').toLowerCase()) ||
      ['manager', 'pro_director', 'admin'].includes(String(myRole || '').toLowerCase())) &&
    !isSupervisor;

  const canAssignRole = myRole === 'company_admin';
  // 온보딩 서류를 실제로 제출했는지 여부
  const onboardingSubmitted = Boolean(employee && employee.onboarding_submitted_at);
  const canEditEmployees = canEdit('employees') || canAssignRole;
  
  const positionLabels = (company && company.custom_roles || []).map((item) => item.label);
  const positionOptions =
  Array.from(new Set([...positionLabels, form.position, form.secondary_position, ...(form.extra_positions || [])])).
  filter(Boolean);

  const maxExtra = (company && company.custom_roles || []).length;

  useEffect(() => {
    if (!open) return;
    setError('');
    setCopied(false);
    setRateUnlocked(false);
    setAuthModalOpen(false);
    setAuthPassword('');
    setAuthError('');

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
        penalty_rates_enabled: Boolean(employee.penalty_rates_enabled),
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

  // 보조 포지션 관리
  const setExtraPosition = (idx, val) => {
    const next = [...form.extra_positions];
    next[idx] = val;
    set('extra_positions', next.filter(Boolean));
  };
  const addPosition = () => {
    if (form.extra_positions.length < maxExtra) {
      set('extra_positions', [...form.extra_positions, '']);
    }
  };
  const removePosition = (idx) => {
    set('extra_positions', form.extra_positions.filter((_, i) => i !== idx));
  };

  // 온보딩 초대 링크 생성
  const buildOnboardingUrl = (token) => {
    if (!token) return '';
    return `${window.location.origin}/onboarding?token=${encodeURIComponent(token)}`;
  };

  // 온보딩 링크 복사 핸들러
  const handleCopyOnboardingLink = async () => {
    const token = currentOnboardingToken || (employee && employee.onboarding_token);
    if (!token) {
      toast({
        variant: 'destructive',
        title: '링크 복사 실패',
        description: '유효한 온보딩 토큰이 없습니다. 직원을 먼저 저장해주세요.'
      });
      return;
    }

    const url = buildOnboardingUrl(token);
    setCopying(true);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      toast({
        title: '링크 복사 완료',
        description: '온보딩 서류 작성 링크가 클립보드에 복사되었습니다.'
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: '복사 오류',
        description: '클립보드 접근 권한이 없습니다.'
      });
    } finally {
      setCopying(false);
    }
  };

  // 온보딩 이메일 개별 발송 핸들러
  const handleSendOnboardingEmail = async () => {
    if (!employee || !employee.id) {
      toast({
        variant: 'destructive',
        title: '발송 불가',
        description: '저장된 직원만 온보딩 이메일을 발송할 수 있습니다.'
      });
      return;
    }

    setSendingEmail(true);
    try {
      const res = await base44.functions.invoke('manageEmployee', {
        action: 'send_onboarding_email',
        employee_id: employee.id,
        origin: window.location.origin
      });

      const data = res.data || {};
      if (data.error) {
        toast({
          variant: 'destructive',
          title: '발송 실패',
          description: data.error
        });
      } else if (data.ok) {
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

  // 시급 잠금 해제를 위한 관리자 비밀번호 검증
  const handleVerifyPassword = async (e) => {
    e?.preventDefault();
    if (!authPassword.trim()) {
      setAuthError('비밀번호를 입력해주세요.');
      return;
    }
    setVerifying(true);
    setAuthError('');
    try {
      const myEmail = me?.email || me?.user_email || '';
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/kwLogin`, {
        method: 'POST',
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          identifier: myEmail,
          password: authPassword
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || '비밀번호가 일치하지 않습니다.');
      }
      setRateUnlocked(true);
      setAuthModalOpen(false);
      setAuthPassword('');
      toast({ title: '시급 정보가 안전하게 잠금 해제되었습니다.' });
    } catch (err) {
      setAuthError(err.message || '인증에 실패했습니다. 비밀번호를 다시 확인해주세요.');
    } finally {
      setVerifying(false);
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
            penalty_rates_enabled: employee.penalty_rates_enabled,
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
            penalty_rates_enabled: form.penalty_rates_enabled,
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
          if (access.invited) {
            toast({ title: t('employees.inviteSent') });
          }
        });
      }
    } catch (e) {
      setError(e.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{employee ? (t('employees.edit') || '프로필 수정') : (t('employees.add') || '직원 추가')}</DialogTitle>
          </DialogHeader>

          {error &&
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          }

          {/* 기존 직원 수정 모달 상단: 온보딩 서류 작성 링크 복사 및 메일 재발송 영역 */}
          {employee && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    📄 {t('employees.onboardingPaperworkLink') || '온보딩 서류 작성 링크'}
                    {onboardingSubmitted && (
                      <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {t('ob.completed') || '제출 완료'}
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {lang === 'en'
                      ? 'Share the onboarding paperwork link directly with the employee or send it via email.'
                      : '직원에게 온보딩 작성 링크를 직접 전달하거나 이메일로 다시 발송할 수 있습니다.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyOnboardingLink}
                  disabled={copying}
                  className="flex-1 bg-background"
                >
                  {copied ? (
                    <>
                      <Check className="mr-1.5 h-4 w-4 text-emerald-600" />
                      {t('common.copied') || '링크 복사됨'}
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-4 w-4 text-muted-foreground" />
                      {t('employees.copyOnboardingLink') || '온보딩 링크 복사'}
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleSendOnboardingEmail}
                  disabled={sendingEmail}
                  className="flex-1"
                >
                  {sendingEmail ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 h-4 w-4" />
                  )}
                  {t('employees.sendOnboardingEmail') || '온보딩 이메일 발송'}
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>{t('common.name')} *</Label>
              <Input
                value={form.full_name}
                onChange={(e) => set('full_name', e.target.value)}
                placeholder="홍길동"
                disabled={!canEditEmployees} />
            </div>

            <div>
              <Label>{t('common.email')} *</Label>
              <Input
                type="email"
                value={form.user_email}
                onChange={(e) => set('user_email', e.target.value)}
                placeholder="user@example.com"
                disabled={!canEditEmployees} />
            </div>

            <div>
              <Label>{t('employees.primaryPosition')}</Label>
              <Select
                value={form.position}
                onValueChange={(v) => set('position', v)}
                disabled={!canEditEmployees}>
                <SelectTrigger>
                  <SelectValue placeholder={t('role.select')} />
                </SelectTrigger>
                <SelectContent>
                  {positionOptions.map((label) =>
                    <SelectItem key={label} value={label}>
                      {formatRoleLabel(label, lang)}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('employees.secondaryPosition')}</Label>
              <Select
                value={form.secondary_position || 'none'}
                onValueChange={(v) => set('secondary_position', v === 'none' ? '' : v)}
                disabled={!canEditEmployees}>
                <SelectTrigger>
                  <SelectValue placeholder={t('employees.none')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('employees.none')}</SelectItem>
                  {positionOptions.map((label) =>
                    <SelectItem key={label} value={label}>
                      {formatRoleLabel(label, lang)}
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
                          {formatRoleLabel(label, lang)}
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

            {/* 시급 (Hourly Rate) 비밀번호 보안 잠금 필드 */}
            {canViewHourlyRate && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Label>{t('employees.fields.rate') || '시급'}</Label>
                    <div className="flex items-center gap-1.5 border-l pl-2.5 border-muted">
                      <Label htmlFor="penalty-toggle" className="text-xs font-normal text-muted-foreground cursor-pointer">
                        {t('employees.applyPenalty') || '패널티 적용'}
                      </Label>
                      <Switch
                        id="penalty-toggle"
                        checked={form.penalty_rates_enabled}
                        onCheckedChange={(checked) => set('penalty_rates_enabled', checked)}
                        disabled={!canEditEmployees}
                        className="scale-75 origin-left"
                      />
                    </div>
                  </div>
                  {rateUnlocked ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Unlock className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> {t('employees.unlocked') || '잠금 해제됨'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3" /> {t('employees.locked') || '보안 잠금'}
                    </span>
                  )}
                </div>

                {rateUnlocked ? (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                      $
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.hourly_rate}
                      onChange={(e) => set('hourly_rate', e.target.value)}
                      placeholder="0.00"
                      className="pl-7 pr-12 text-sm"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      /hr
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      value="••••••••"
                      disabled
                      className="flex-1 bg-muted/40 font-mono text-xs cursor-not-allowed select-none"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAuthModalOpen(true)}
                      className="shrink-0 gap-1.5"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      {t('employees.verifyUnlock') || '확인'}
                    </Button>
                  </div>
                )}
              </div>
            )}

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
                onChange={(e) => set('pin', e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="4~6자리"
                maxLength={6} />

              <p className="mt-1 text-xs text-muted-foreground">
                {employee ? t('employees.pinHintEdit') : t('employees.pinHintNew')}
              </p>
            </div>

            <div>
              <Label>{t('employees.onboardingStatus') || '온보딩 상태'}</Label>
              <Select
                value={form.onboarding_status}
                onValueChange={(v) => set('onboarding_status', v)}
                disabled={!canEditEmployees}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t('employees.statusPending')}</SelectItem>
                  <SelectItem value="in_progress">{t('employees.statusInProgress')}</SelectItem>
                  <SelectItem value="completed">{t('employees.statusCompleted')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!employee &&
              <div className="sm:col-span-2 space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{t('employees.sendInvite')}</Label>
                    <p className="text-xs text-muted-foreground">{t('employees.sendInviteHint')}</p>
                  </div>
                  <Switch
                    checked={form.send_invite}
                    onCheckedChange={(checked) => set('send_invite', checked)} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="flex items-center gap-1.5">
                      ✉️ 온보딩 이메일 자동 발송
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      직원 등록 즉시 신규 온보딩 서류 작성 링크를 이메일로 전송합니다.
                    </p>
                  </div>
                  <Switch
                    checked={form.send_onboarding_email}
                    onCheckedChange={(checked) => set('send_onboarding_email', checked)} />
                </div>
              </div>
            }
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={saving || !canEditEmployees}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {employee ? t('common.save') : t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 시급 확인을 위한 관리자 비밀번호 2차 인증 팝업 */}
      <Dialog open={authModalOpen} onOpenChange={setAuthModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              {lang === 'en' ? 'Verify Hourly Rate Access' : '시급 정보 조회 및 수정 인증'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleVerifyPassword} className="space-y-3 pt-1">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {lang === 'en'
                ? `Hourly rates and salary details are strictly protected. Please enter the password for your logged in account (${me?.email || 'admin'}) to verify identity.`
                : `직원의 시급 및 급여 정보는 최고 수준의 보안이 적용됩니다. 본인 확인을 위해 현재 로그인된 계정 (${me?.email || '관리자 계정'})의 비밀번호를 입력해주세요.`}
            </p>

            {authError && (
              <div className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
                {authError}
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">{lang === 'en' ? 'Account Password' : '계정 비밀번호'}</Label>
              <Input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder={lang === 'en' ? 'Enter your password' : '비밀번호를 입력하세요'}
                autoFocus
                className="text-sm"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setAuthModalOpen(false);
                  setAuthPassword('');
                  setAuthError('');
                }}
                disabled={verifying}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={verifying || !authPassword.trim()}>
                {verifying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {lang === 'en' ? 'Verify & Unlock' : '확인 및 잠금 해제'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
