import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  FileText,
  FolderOpen,
  Lock,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  UploadCloud
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { DEFAULT_DOC_TYPES, checklistFor } from '@/lib/onboardingDocs';
import { kwSessionAction } from '@/lib/kwAuthClient';
import { base44 } from '@/api/base44Client';
import SecureVerificationDialog from '@/components/auth/SecureVerificationDialog';
import { cn } from '@/lib/utils';

/**
 * StaffOnboardingCard 컴포넌트
 * 내 공간 화면에서 온보딩 서류와 온보딩 개인정보를 하나의 통합 섹션에서 제공합니다.
 * 1. [숨기기 / 펼치기] 단일 토글로 서류 목록과 상세 정보가 함께 열리고 닫힙니다.
 * 2. 회사 설정(온보딩 서류 설정)에 정의된 제출 서류 기준(신분증, Right to Work 증빙, 계약서 등)으로 표시됩니다.
 * 3. 각 서류의 [파일 선택/업로드], [열기], [다시 올리기], [삭제] 기능 제공.
 * 4. 보안 설정된 서류나 질문 항목은 본인 인증(비밀번호 또는 모바일 얼굴/지문인식)을 통과해야 열람/블러 해제됩니다.
 */
export default function StaffOnboardingCard({ onProfileUpdated }) {
  const { t, lang } = useI18n();
  const { me, company, employeeProfile } = useWorkspace();
  const { toast } = useToast();

  // 통합 카드 펼침/접힘 상태 (sessionStorage로 기억하여 새로고침/재렌더링 시에도 유지)
  const [isOpen, setIsOpen] = useState(() => {
    try {
      return sessionStorage.getItem('kw_onboarding_open') === 'true';
    } catch (_) {
      return false;
    }
  });

  const toggleOpen = () => {
    setIsOpen((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem('kw_onboarding_open', String(next));
      } catch (_) {}
      return next;
    });
  };

  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState('');
  const [busyUri, setBusyUri] = useState('');
  const fileRef = useRef(null);
  const pickKey = useRef('');

  // 보안 인증(비밀번호/생체인증) 관련 상태
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authTarget, setAuthTarget] = useState(null); // { type: 'doc', file } or { type: 'field', fieldKey }
  const [unlockedFields, setUnlockedFields] = useState(new Set()); // 인증 통과하여 블러 해제된 필드 목록

  // 현재 활성 사원 프로필
  const profile = record || employeeProfile || (me ? {
    id: me.id,
    user_email: me.email,
    full_name: me.full_name || me.email,
    docs: [],
    onboarding_status: 'pending'
  } : null);

  // 폼 필드 동기화
  const syncForm = useCallback((row) => {
    if (!row) return;
    setForm({
      address: row.address || '',
      date_of_birth: row.date_of_birth || '',
      emergency_contact_name: row.emergency_contact_name || '',
      emergency_contact_phone: row.emergency_contact_phone || '',
      tfn_number: row.tfn_number || '',
      tfn_pending: row.tfn_pending === true,
      super_choice: row.super_choice === 'custom_fund' ? 'custom_fund' : 'default_fund',
      super_fund_name: row.super_fund_name || '',
      super_usi: row.super_usi || '',
      super_member_number: row.super_member_number || '',
      bank_bsb: row.bank_bsb || '',
      bank_account_number: row.bank_account_number || '',
      bank_account_name: row.bank_account_name || ''
    });
  }, []);

  // 서버에서 최신 온보딩 데이터 가져오기
  const fetchFreshProfile = useCallback(async () => {
    try {
      const res = await kwSessionAction({ action: 'me' });
      if (res && res.profile) {
        setRecord(res.profile);
        syncForm(res.profile);
      }
    } catch (_) {}
  }, [syncForm]);

  useEffect(() => {
    fetchFreshProfile();
  }, [fetchFreshProfile]);

  useEffect(() => {
    const base = employeeProfile || me;
    if (base && !form) {
      syncForm(base);
    }
  }, [employeeProfile, me, form, syncForm]);

  if (!profile || !form) return null;

  // 회사 설정에 등록된 서류 목록을 바탕으로 체크리스트 생성
  const rawChecklist = checklistFor(profile, company, lang);
  const items = (rawChecklist && rawChecklist.items && rawChecklist.items.length > 0)
    ? rawChecklist.items
    : DEFAULT_DOC_TYPES.map((d) => {
        const file = (profile.docs || []).find((doc) => doc && doc.doc_type === d.key);
        return {
          key: d.key,
          label: lang === 'en' ? (d.label_en || d.label) : (d.label || d.label_en),
          kind: d.kind || 'file',
          required: d.required !== false,
          secure: Boolean(d.secure),
          done: Boolean(file),
          file: file || null
        };
      });

  const requiredItems = items.filter((item) => item.required);
  const doneItems = requiredItems.filter((item) => item.done);
  const requiredTotal = requiredItems.length || 7;
  const requiredDone = doneItems.length;
  const isComplete = requiredDone >= requiredTotal;
  const percent = requiredTotal === 0 ? 100 : Math.round((requiredDone / requiredTotal) * 100);

  // 회사에 설정된 개인정보 암호화 보안 필드 목록
  const secureFields = (company && company.onboarding_secure_fields) || {};

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // 온보딩 개인정보 저장 처리
  const save = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setSaving(true);
    try {
      const saved = await kwSessionAction({
        action: 'save_onboarding',
        data: {
          address: form.address,
          date_of_birth: form.date_of_birth,
          emergency_contact_name: form.emergency_contact_name,
          emergency_contact_phone: form.emergency_contact_phone,
          tfn_number: form.tfn_number,
          tfn_pending: form.tfn_pending,
          super_choice: form.super_choice,
          super_fund_name: form.super_choice === 'custom_fund' ? form.super_fund_name : '',
          super_usi: form.super_choice === 'custom_fund' ? form.super_usi : '',
          super_member_number: form.super_member_number,
          bank_bsb: form.bank_bsb,
          bank_account_number: form.bank_account_number,
          bank_account_name: form.bank_account_name
        }
      });
      if (saved && saved.profile) {
        setRecord(saved.profile);
        syncForm(saved.profile);
        if (onProfileUpdated) onProfileUpdated(saved.profile);
      }
      toast({ title: t('ob.saved') || '온보딩 정보가 저장되었습니다.' });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.saveFailed') || '저장에 실패했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  // 파일 선택 창 열기
  const chooseFile = (key) => {
    pickKey.current = key;
    if (fileRef.current) {
      fileRef.current.value = '';
      fileRef.current.click();
    }
  };

  // 파일 업로드 수행 (화면 깜빡임이나 리프레시 없이 부드럽게 저장)
  const upload = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const key = pickKey.current;
    if (!key) return;

    setUploadingKey(key);
    try {
      // 1. 비공개 버킷에 안전 업로드
      const uploadRes = await base44.integrations.Core.UploadPrivateFile({ file });
      if (!uploadRes || !uploadRes.file_uri) throw new Error('파일 업로드 경로를 생성하지 못했습니다.');

      // 2. 사원 온보딩 서류 레코드에 추가
      const saved = await kwSessionAction({
        action: 'add_document',
        doc_type: key,
        file_uri: uploadRes.file_uri,
        name: file.name
      });

      if (saved && saved.profile) {
        setRecord(saved.profile);
        syncForm(saved.profile);
        if (onProfileUpdated) onProfileUpdated(saved.profile);
      }
      toast({ title: t('ob.uploaded') || '서류가 성공적으로 업로드되었습니다.' });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.uploadFailed') || '업로드 실패' });
    } finally {
      setUploadingKey('');
    }
  };

  // 실제 비공개 파일 열기 (서명 URL 발급 및 탭 오픈)
  const executeOpenDoc = async (file) => {
    if (!file || !file.file_uri) return;
    setBusyUri(file.file_uri);
    try {
      let signedUrl = '';
      try {
        const res = await kwSessionAction({ action: 'sign_document', file_uri: file.file_uri });
        if (res && res.signed_url) signedUrl = res.signed_url;
      } catch (_) {}

      if (!signedUrl) {
        const clientRes = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: file.file_uri }).catch(() => null);
        if (clientRes && clientRes.signed_url) signedUrl = clientRes.signed_url;
      }

      if (signedUrl) {
        window.open(signedUrl, '_blank', 'noopener');
      } else {
        throw new Error('파일 열람 링크를 생성할 수 없습니다.');
      }
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.uploadFailed') || '파일 열기 실패' });
    } finally {
      setBusyUri('');
    }
  };

  // 서류 열기 클릭 시: 보안 서류인 경우 인증 다이얼로그 호출
  const handleOpenDocClick = (item) => {
    if (!item.file) return;

    // 암호화 보안이 걸려있는 서류인 경우
    if (item.secure) {
      setAuthTarget({ type: 'doc', file: item.file });
      setAuthDialogOpen(true);
    } else {
      executeOpenDoc(item.file);
    }
  };

  // 보안 인증 성공 시 콜백
  const handleAuthSuccess = () => {
    if (!authTarget) return;

    if (authTarget.type === 'doc' && authTarget.file) {
      executeOpenDoc(authTarget.file);
    } else if (authTarget.type === 'field' && authTarget.fieldKey) {
      setUnlockedFields((prev) => new Set([...prev, authTarget.fieldKey]));
    }
    setAuthTarget(null);
  };

  // 보안 필드 블러 해제 인증 요청
  const requestUnlockField = (fieldKey) => {
    setAuthTarget({ type: 'field', fieldKey });
    setAuthDialogOpen(true);
  };

  // 업로드된 서류 삭제
  const removeDoc = async (file) => {
    if (!file || !file.file_uri) return;
    setBusyUri(file.file_uri);
    try {
      const saved = await kwSessionAction({ action: 'delete_document', file_uri: file.file_uri });
      if (saved && saved.profile) {
        setRecord(saved.profile);
        syncForm(saved.profile);
        if (onProfileUpdated) onProfileUpdated(saved.profile);
      }
      toast({ title: t('ob.removed') || '서류가 삭제되었습니다.' });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.uploadFailed') || '삭제 실패' });
    } finally {
      setBusyUri('');
    }
  };

  return (
    <Card>
      {/* 1. 통합 카드 헤더 */}
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            {t('ob.title') || '온보딩 정보 및 서류'}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('ob.hint') || '고용주가 요청한 서류를 제출하고, 본인 정보를 최신으로 유지하세요.'}
          </p>
        </div>

        {/* 단일 숨기기 / 펼치기 토글 버튼 */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleOpen}
          className="h-8 gap-1.5 px-3 text-xs font-medium"
          title={isOpen ? '숨기기' : '펼치기'}
        >
          <span>{isOpen ? '숨기기' : '펼치기'}</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CardHeader>

      {/* 펼쳐졌을 때 온보딩 서류 목록과 온보딩 상세 정보가 함께 보입니다 */}
      {isOpen && (
        <CardContent className="space-y-6 animate-in fade-in-50 duration-200">
          {/* 제출 현황 프로그레스 바 */}
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">
                {requiredTotal}건 중 {requiredDone}건 제출 완료
              </span>
              {isComplete ? (
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-medium">
                  {t('ob.completed') || '제출 완료'}
                </Badge>
              ) : (
                <Badge variant="secondary" className="font-medium">
                  {t('employees.pending') || '제출 대기'}
                </Badge>
              )}
            </div>
            <Progress value={percent} className="mt-2.5 h-2" />
          </div>

          {/* 2. 온보딩 서류 제출 목록 */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <UploadCloud className="h-4 w-4 text-primary" />
              온보딩 서류 제출 목록
            </h3>

            <div className="divide-y rounded-xl border">
              {items.map((item) => {
                const displayName = item.label || item.title || item.key;
                const isDoc = item.kind !== 'info';

                return (
                  <div
                    key={item.key}
                    className="flex flex-wrap items-center gap-3 p-3.5 hover:bg-muted/30 transition-colors"
                  >
                    {item.done ? (
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    ) : (
                      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground break-words">{displayName}</p>
                        {item.secure && (
                          <span
                            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-500"
                            title="암호화 보안 서류 (열람 시 본인 인증 필요)"
                          >
                            <Lock className="h-3 w-3" />
                            보안
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 break-all">
                        <span>{item.required ? '필수' : '선택'}</span>
                        {item.file && item.file.name && (
                          <span className="text-slate-600 dark:text-slate-300 font-mono text-[11px] block sm:inline sm:before:content-['·_파일명:_']">
                            {item.file.name}
                          </span>
                        )}
                      </p>
                    </div>

                    {isDoc ? (
                      <div className="flex items-center gap-1.5">
                        {item.file ? (
                          <>
                            {/* 파일 열기 버튼 */}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busyUri === item.file.file_uri}
                              onClick={() => handleOpenDocClick(item)}
                              className="h-8 text-xs gap-1"
                            >
                              {busyUri === item.file.file_uri ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : item.secure ? (
                                <Lock className="h-3.5 w-3.5 text-amber-500" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                              <span>열기</span>
                            </Button>

                            {/* 다시 올리기 버튼 */}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={Boolean(uploadingKey)}
                              onClick={() => chooseFile(item.key)}
                              className="h-8 text-xs"
                            >
                              {uploadingKey === item.key ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                '다시 올리기'
                              )}
                            </Button>

                            {/* 서류 삭제 버튼 */}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busyUri === item.file.file_uri}
                              onClick={() => removeDoc(item.file)}
                              className="h-8 px-2 text-destructive hover:text-destructive"
                              title="삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          /* 파일 선택 (업로드) 버튼 */
                          <Button
                            variant="default"
                            size="sm"
                            disabled={Boolean(uploadingKey)}
                            onClick={() => chooseFile(item.key)}
                            className="h-8 text-xs font-medium gap-1"
                          >
                            {uploadingKey === item.key ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UploadCloud className="h-3.5 w-3.5" />
                            )}
                            <span>파일 선택</span>
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-primary font-medium">
                        아래 정보 입력에서 확인됩니다
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 파일 업로드 숨김 인풋 */}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              className="hidden"
              onChange={upload}
            />
          </div>

          {/* 3. 온보딩 개인정보 및 계좌·세금 상세 입력 폼 */}
          <div className="space-y-4 rounded-xl border p-4 bg-card">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              온보딩 개인정보 및 계좌·세금 정보
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* 주소 필드 */}
              <div className="sm:col-span-2 space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <Label>{t('ob.address') || '주소'}</Label>
                  {secureFields.address && !unlockedFields.has('address') && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-amber-500 gap-1 px-2"
                      onClick={() => requestUnlockField('address')}
                    >
                      <Lock className="h-3 w-3" />
                      <span>{t('security.unlock') || '본인 인증 후 열람'}</span>
                    </Button>
                  )}
                </div>
                <div className={cn(secureFields.address && !unlockedFields.has('address') && 'filter blur-sm select-none pointer-events-none')}>
                  <Input
                    value={form.address}
                    onChange={(e) => set('address', e.target.value)}
                    placeholder={t('ob.addressPlaceholder') || '실제 거주 주소를 입력하세요'}
                  />
                </div>
              </div>

              {/* 생년월일 필드 */}
              <div className="space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <Label>{t('ob.dob') || '생년월일'}</Label>
                  {secureFields.date_of_birth && !unlockedFields.has('date_of_birth') && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-amber-500 gap-1 px-2"
                      onClick={() => requestUnlockField('date_of_birth')}
                    >
                      <Lock className="h-3 w-3" />
                      <span>인증 후 열람</span>
                    </Button>
                  )}
                </div>
                <div className={cn(secureFields.date_of_birth && !unlockedFields.has('date_of_birth') && 'filter blur-sm select-none pointer-events-none')}>
                  <Input
                    type="date"
                    value={form.date_of_birth}
                    onChange={(e) => set('date_of_birth', e.target.value)}
                  />
                </div>
              </div>

              {/* 비상연락처 이름 */}
              <div className="space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <Label>{t('ob.emergencyName') || '비상연락처 이름'}</Label>
                  {secureFields.emergency_contact && !unlockedFields.has('emergency_contact') && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-amber-500 gap-1 px-2"
                      onClick={() => requestUnlockField('emergency_contact')}
                    >
                      <Lock className="h-3 w-3" />
                      <span>인증 후 열람</span>
                    </Button>
                  )}
                </div>
                <div className={cn(secureFields.emergency_contact && !unlockedFields.has('emergency_contact') && 'filter blur-sm select-none pointer-events-none')}>
                  <Input
                    value={form.emergency_contact_name}
                    onChange={(e) => set('emergency_contact_name', e.target.value)}
                    placeholder="예: 홍길동 (부모)"
                  />
                </div>
              </div>

              {/* 비상연락처 전화 */}
              <div className="space-y-1.5">
                <Label>{t('ob.emergencyPhone') || '비상연락처 전화'}</Label>
                <div className={cn(secureFields.emergency_contact && !unlockedFields.has('emergency_contact') && 'filter blur-sm select-none pointer-events-none')}>
                  <Input
                    value={form.emergency_contact_phone}
                    onChange={(e) => set('emergency_contact_phone', e.target.value)}
                    placeholder="0400 000 000"
                  />
                </div>
              </div>

              {/* 세금 번호 (TFN) */}
              <div className="space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <Label>{t('ob.tfn') || '세금 번호 (TFN)'}</Label>
                  {secureFields.tax && !unlockedFields.has('tax') && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-amber-500 gap-1 px-2"
                      onClick={() => requestUnlockField('tax')}
                    >
                      <Lock className="h-3 w-3" />
                      <span>인증 후 열람</span>
                    </Button>
                  )}
                </div>
                <div className={cn(secureFields.tax && !unlockedFields.has('tax') && 'filter blur-sm select-none pointer-events-none')}>
                  <Input
                    value={form.tfn_number}
                    disabled={form.tfn_pending}
                    onChange={(e) => set('tfn_number', e.target.value)}
                    placeholder={t('ob.tfnPlaceholder') || 'TFN 9자리'}
                  />
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={form.tfn_pending}
                      onCheckedChange={(val) => set('tfn_pending', val)}
                    />
                    <span>{t('ob.tfnPending') || 'TFN 발급 신청 중 (28일 유예)'}</span>
                  </div>
                </div>
              </div>

              {/* 연금(Super) 선택 */}
              <div className="space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <Label>{t('ob.superChoice') || '연금(Super) 운용사 선택'}</Label>
                  {secureFields.super && !unlockedFields.has('super') && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-amber-500 gap-1 px-2"
                      onClick={() => requestUnlockField('super')}
                    >
                      <Lock className="h-3 w-3" />
                      <span>인증 후 열람</span>
                    </Button>
                  )}
                </div>
                <div className={cn(secureFields.super && !unlockedFields.has('super') && 'filter blur-sm select-none pointer-events-none')}>
                  <Select value={form.super_choice} onValueChange={(val) => set('super_choice', val)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default_fund">
                        {company?.default_super_fund_name
                          ? `${company.default_super_fund_name} (회사 기본 연금)`
                          : '회사 기본 지정 연금'}
                      </SelectItem>
                      <SelectItem value="custom_fund">본인 지정 연금 계좌 사용</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 본인 지정 연금 정보 (custom_fund일 때) */}
              {form.super_choice === 'custom_fund' && (
                <>
                  <div className="space-y-1.5">
                    <Label>{t('ob.superFund') || '연금 회사명'}</Label>
                    <Input
                      value={form.super_fund_name}
                      onChange={(e) => set('super_fund_name', e.target.value)}
                      placeholder="예: AustralianSuper"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('ob.superUsi') || '고유 식별번호 (USI / ABN)'}</Label>
                    <Input
                      value={form.super_usi}
                      onChange={(e) => set('super_usi', e.target.value)}
                      placeholder="USI 또는 ABN"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>{t('ob.superMember') || '연금 회원번호'}</Label>
                    <Input
                      value={form.super_member_number}
                      onChange={(e) => set('super_member_number', e.target.value)}
                      placeholder="Member Number"
                    />
                  </div>
                </>
              )}

              {/* 은행 계좌 정보 (BSB, 계좌번호, 예금주) */}
              <div className="sm:col-span-2 border-t pt-3 mt-1 space-y-3 relative">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">급여 입금 계좌 정보</Label>
                  {secureFields.bank && !unlockedFields.has('bank') && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-amber-500 gap-1 px-2"
                      onClick={() => requestUnlockField('bank')}
                    >
                      <Lock className="h-3 w-3" />
                      <span>{t('security.unlock') || '본인 인증 후 열람'}</span>
                    </Button>
                  )}
                </div>

                <div className={cn(
                  'grid gap-3 sm:grid-cols-3',
                  secureFields.bank && !unlockedFields.has('bank') && 'filter blur-sm select-none pointer-events-none'
                )}>
                  <div>
                    <Label className="text-xs">{t('ob.bankBsb') || 'BSB (6자리)'}</Label>
                    <Input
                      value={form.bank_bsb}
                      onChange={(e) => set('bank_bsb', e.target.value)}
                      placeholder="000-000"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t('ob.bankAccount') || '계좌번호'}</Label>
                    <Input
                      value={form.bank_account_number}
                      onChange={(e) => set('bank_account_number', e.target.value)}
                      placeholder="Account Number"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t('ob.bankHolder') || '예금주명'}</Label>
                    <Input
                      value={form.bank_account_name}
                      onChange={(e) => set('bank_account_name', e.target.value)}
                      placeholder="Account Holder"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 저장 버튼 */}
            <div className="flex justify-end pt-3">
              <Button type="button" onClick={save} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>온보딩 정보 저장하기</span>
              </Button>
            </div>
          </div>
        </CardContent>
      )}

      {/* 보안 인증 (비밀번호 / 생체인증 Face ID) 다이얼로그 */}
      <SecureVerificationDialog
        open={authDialogOpen}
        onOpenChange={setAuthDialogOpen}
        onSuccess={handleAuthSuccess}
      />
    </Card>
  );
}