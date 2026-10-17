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
  ShieldCheck,
  Trash2,
  UploadCloud,
  HelpCircle
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
import { DEFAULT_DOC_TYPES, checklistFor, answerRows } from '@/lib/onboardingDocs';
import { kwSessionAction } from '@/lib/kwAuthClient';
import { base44 } from '@/api/base44Client';
import SecureVerificationDialog from '@/components/auth/SecureVerificationDialog';
import { cn } from '@/lib/utils';

/**
 * 온보딩 질문 중 기본 폼(주소, 생일, TFN, Super, 은행 계좌)과 겹치는지 검사하는 함수
 * 사용자 지침: 겹치는 항목(주소, 생일, TFN, Super, account detail)은 없애고 안 겹치는 질문만 유지합니다.
 */
function isOverlappingQuestion(questionId, questionLabel) {
  const id = String(questionId || '').toLowerCase();
  const label = String(questionLabel || '').toLowerCase();

  // 1. 주소 관련 항목 (Address, Suburb, State, Postcode)
  if (id.includes('address') || id.includes('suburb') || id.includes('state') || id.includes('postcode')) return true;
  if (label.includes('address') || label.includes('주소') || label.includes('suburb') || label.includes('postcode')) return true;

  // 2. 생년월일 관련 항목 (DOB, Birth)
  if (id.includes('dob') || id.includes('birth')) return true;
  if (label.includes('birth') || label.includes('생년월일') || label.includes('생일')) return true;

  // 3. 세금 번호 (TFN) 관련 항목
  if (id.includes('tfn') || id.includes('tax_file')) return true;
  if (label.includes('tfn') || label.includes('세금 번호') || label.includes('tax file number')) return true;

  // 4. 연금 (Superannuation) 관련 항목
  if (id.includes('super')) return true;
  if (label.includes('super') || label.includes('연금')) return true;

  // 5. 은행 계좌 정보 (Account Details, BSB, Account Number, Account Name)
  if (id.includes('bank') || id.includes('account') || id.includes('bsb')) return true;
  if (label.includes('bank') || label.includes('계좌') || label.includes('bsb') || label.includes('account')) return true;

  return false;
}

/**
 * 사원의 온보딩 답변 목록에서 생년월일(DOB) 값을 안전하게 추출하는 함수
 * 사용자 지침: "생일은 온보딩 정보에 있는거 가져다 써 밑에있는거"
 */
function extractDobFromOnboardingAnswers(answers) {
  if (!Array.isArray(answers)) return '';
  const found = answers.find((item) => {
    if (!item) return false;
    const id = String(item.id || '').toLowerCase();
    const label = String(item.label || '').toLowerCase();
    return (
      id === 'default_dob' ||
      id.includes('dob') ||
      id.includes('birth') ||
      label.includes('생년월일') ||
      label.includes('birth') ||
      label.includes('dob')
    );
  });
  if (found && String(found.answer || '').trim()) {
    return String(found.answer).trim();
  }
  return '';
}

/**
 * StaffOnboardingCard 컴포넌트
 * 내 공간 화면에서 온보딩 서류와 온보딩 개인정보 및 계좌·세금 정보를 일원화하여 제공합니다.
 * 
 * 주요 개선 사항:
 * 1. 은행 계좌 정보(BSB, 계좌번호, 예금주명) 및 연금, TFN 등 금융 정보는 기본적으로 강력 암호화 마스킹 처리(••••••••••••).
 *    - 본인 인증(비밀번호 또는 생체인증)을 통과해야만 실제 번호가 보이고 수정할 수 있도록 이중 보안 적용.
 * 2. 겹치는 온보딩 항목(주소, 생일, TFN, Super, account detail) 중복을 완전히 제거.
 *    - 생일은 온보딩 정보 답변에서 추출한 값을 최우선으로 연동하여 폼에 자동 입력.
 * 3. 안 겹치는 온보딩 질문(비자, 세법상 거주여부, 맞춤 질문 등)은 개인정보 카드 내부 하단 섹션으로 깔끔하게 통합.
 * 4. 하단의 중복된 별도 OnboardingDetails 카드는 제거하여 단일 화면으로 최적화.
 */
export default function StaffOnboardingCard({ onProfileUpdated }) {
  const { t, lang } = useI18n();
  const { me, company, employeeProfile } = useWorkspace();
  const { toast } = useToast();

  // 통합 카드 펼침/접힘 상태 관리 (기본값 펼침)
  const [isOpen, setIsOpen] = useState(() => {
    try {
      const stored = sessionStorage.getItem('kw_onboarding_open');
      if (stored !== null) return stored === 'true';
      return true;
    } catch (_) {
      return true;
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
  const [authTarget, setAuthTarget] = useState(null); // { type: 'doc', file } 또는 { type: 'field', fieldKey }
  const [unlockedFields, setUnlockedFields] = useState(new Set()); // 본인 인증 통과하여 열람 해제된 필드 목록

  // 현재 활성 사원 프로필
  const profile = record || employeeProfile || (me ? {
    id: me.id,
    user_email: me.email,
    full_name: me.full_name || me.email,
    docs: [],
    onboarding_status: 'pending'
  } : null);

  // 폼 필드 동기화 (생일은 온보딩 정보 답변을 최우선으로 연동)
  const syncForm = useCallback((row) => {
    if (!row) return;

    // 온보딩 답변(onboarding_answers)에서 생년월일 우선 탐색, 없으면 row.date_of_birth
    const dobFromAnswers = extractDobFromOnboardingAnswers(row.onboarding_answers);
    const finalDob = dobFromAnswers || row.date_of_birth || '';

    setForm({
      address: row.address || '',
      date_of_birth: finalDob,
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

  /**
   * [보안 강화 원칙]
   * 은행 계좌 정보(bank), 세금 번호(tax), 연금 번호(super)는 금융 및 개인식별 정보이므로
   * 회사 설정과 무관하게 기본적으로 항상 암호화 보안 잠금(true) 처리합니다.
   */
  const secureFields = {
    bank: true,  // 급여 입금 계좌 정보(BSB, 계좌번호, 예금주명) 기본 암호화 잠금
    tax: true,   // TFN 세금 번호 기본 암호화 잠금
    super: true, // 연금 정보 기본 암호화 잠금
    address: Boolean(company?.onboarding_secure_fields?.address),
    date_of_birth: Boolean(company?.onboarding_secure_fields?.date_of_birth),
    emergency_contact: Boolean(company?.onboarding_secure_fields?.emergency_contact),
    ...(company?.onboarding_secure_fields || {})
  };

  // 각 필드의 본인 인증 완료 여부
  const isBankUnlocked = unlockedFields.has('bank');
  const isTaxUnlocked = !secureFields.tax || unlockedFields.has('tax');
  const isSuperUnlocked = !secureFields.super || unlockedFields.has('super');
  const isAddressUnlocked = !secureFields.address || unlockedFields.has('address');
  const isDobUnlocked = !secureFields.date_of_birth || unlockedFields.has('date_of_birth');
  const isEmergencyUnlocked = !secureFields.emergency_contact || unlockedFields.has('emergency_contact');

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

  // 파일 업로드 수행
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

  // 서류 열기 클릭 시 보안 처리
  const handleOpenDocClick = (item) => {
    if (!item.file) return;
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

  // 보안 필드 열람 인증 요청
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

  /**
   * 온보딩 정보 중 겹치지 않는 순수 질문 항목 추출
   * (주소, 생일, TFN, Super, 은행 계좌는 위 폼과 겹치므로 제거하고 남은 질문들만 표시)
   */
  const nonOverlappingQuestions = answerRows(profile, company, t).filter(
    (row) => !isOverlappingQuestion(row.id, row.label)
  );

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

      {/* 펼쳐졌을 때 온보딩 서류 목록과 온보딩 상세 정보가 함께 표시됩니다 */}
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
              {t('ob.documentsToSubmit') || '온보딩 서류 제출 목록'}
            </h3>

            <div className="divide-y rounded-xl border">
              {items.map((item) => {
                const displayName = lang === 'en'
                  ? (item.label_en || item.label || item.title || item.key)
                  : (item.label || item.title || item.key);
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
                            title={lang === 'en' ? 'Encrypted document (Requires verification to view)' : '암호화 보안 서류 (열람 시 본인 인증 필요)'}
                          >
                            <Lock className="h-3 w-3" />
                            {t('ob.secureDoc') || '보안'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 break-all">
                        <span>{item.required ? (t('common.required') || '필수') : (t('common.optional') || '선택')}</span>
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
                              <span>{t('common.open') || '열기'}</span>
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
                                t('ob.reupload') || '다시 올리기'
                              )}
                            </Button>

                            {/* 서류 삭제 버튼 */}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busyUri === item.file.file_uri}
                              onClick={() => removeDoc(item.file)}
                              className="h-8 px-2 text-destructive hover:text-destructive"
                              title={t('common.delete') || '삭제'}
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
                            <span>{t('common.upload') || '파일 선택'}</span>
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-primary font-medium">
                        {t('ob.providedBelow') || '아래 정보 입력에서 확인됩니다'}
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

          {/* 3. 온보딩 개인정보 및 계좌·세금 상세 입력 폼 (단일 통합 섹션) */}
          <div className="space-y-4 rounded-xl border p-4 bg-card">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {t('ob.personalTaxBank') || '온보딩 개인정보 및 계좌·세금 정보'}
              </h3>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                {t('ob.encryptedProtected') || '금융·개인정보 암호화 보호 적용'}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* 주소 필드 */}
              <div className="sm:col-span-2 space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <Label>{t('ob.address') || '주소'}</Label>
                  {secureFields.address && !isAddressUnlocked && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-amber-500 gap-1 px-2 hover:bg-amber-500/10"
                      onClick={() => requestUnlockField('address')}
                    >
                      <Lock className="h-3 w-3" />
                      <span>{t('security.unlock') || '본인 인증 후 열람'}</span>
                    </Button>
                  )}
                </div>
                <div className={cn(secureFields.address && !isAddressUnlocked && 'filter blur-sm select-none pointer-events-none')}>
                  <Input
                    value={isAddressUnlocked ? form.address : (form.address ? '••••••••••••••••••••' : '')}
                    readOnly={!isAddressUnlocked}
                    onChange={(e) => set('address', e.target.value)}
                    placeholder={t('ob.addressPlaceholder') || '실제 거주 주소를 입력하세요'}
                  />
                </div>
              </div>

              {/* 생년월일 필드 (온보딩 답변 정보 우선 자동 연동) */}
              <div className="space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <Label>{t('ob.dob') || '생년월일'}</Label>
                  {secureFields.date_of_birth && !isDobUnlocked && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-amber-500 gap-1 px-2 hover:bg-amber-500/10"
                      onClick={() => requestUnlockField('date_of_birth')}
                    >
                      <Lock className="h-3 w-3" />
                      <span>{t('ob.verifyToView') || '인증 후 열람'}</span>
                    </Button>
                  )}
                </div>
                <div className={cn(secureFields.date_of_birth && !isDobUnlocked && 'filter blur-sm select-none pointer-events-none')}>
                  <Input
                    type={isDobUnlocked ? 'date' : 'password'}
                    value={isDobUnlocked ? form.date_of_birth : (form.date_of_birth ? '••••••••' : '')}
                    readOnly={!isDobUnlocked}
                    onChange={(e) => set('date_of_birth', e.target.value)}
                  />
                </div>
              </div>

              {/* 비상연락처 이름 */}
              <div className="space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <Label>{t('ob.emergencyName') || '비상연락처 이름'}</Label>
                  {secureFields.emergency_contact && !isEmergencyUnlocked && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-amber-500 gap-1 px-2 hover:bg-amber-500/10"
                      onClick={() => requestUnlockField('emergency_contact')}
                    >
                      <Lock className="h-3 w-3" />
                      <span>{t('ob.verifyToView') || '인증 후 열람'}</span>
                    </Button>
                  )}
                </div>
                <div className={cn(secureFields.emergency_contact && !isEmergencyUnlocked && 'filter blur-sm select-none pointer-events-none')}>
                  <Input
                    value={isEmergencyUnlocked ? form.emergency_contact_name : (form.emergency_contact_name ? '••••••••' : '')}
                    readOnly={!isEmergencyUnlocked}
                    onChange={(e) => set('emergency_contact_name', e.target.value)}
                    placeholder="예: 홍길동 (부모)"
                  />
                </div>
              </div>

              {/* 비상연락처 전화 */}
              <div className="space-y-1.5">
                <Label>{t('ob.emergencyPhone') || '비상연락처 전화'}</Label>
                <div className={cn(secureFields.emergency_contact && !isEmergencyUnlocked && 'filter blur-sm select-none pointer-events-none')}>
                  <Input
                    value={isEmergencyUnlocked ? form.emergency_contact_phone : (form.emergency_contact_phone ? '••••••••' : '')}
                    readOnly={!isEmergencyUnlocked}
                    onChange={(e) => set('emergency_contact_phone', e.target.value)}
                    placeholder="0400 000 000"
                  />
                </div>
              </div>

              {/* 세금 번호 (TFN) - 금융/세무 정보 기본 암호화 잠금 */}
              <div className="space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Label>{t('ob.tfn') || '세금 번호 (TFN)'}</Label>
                    <Lock className="h-3 w-3 text-amber-500" title="암호화 보안 처리됨" />
                  </div>
                  {!isTaxUnlocked && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-amber-500 gap-1 px-2 hover:bg-amber-500/10"
                      onClick={() => requestUnlockField('tax')}
                    >
                      <Lock className="h-3 w-3" />
                      <span>{t('security.unlock') || '인증 후 열람'}</span>
                    </Button>
                  )}
                </div>
                <div className={cn(!isTaxUnlocked && 'filter blur-sm select-none pointer-events-none')}>
                  <Input
                    value={isTaxUnlocked ? form.tfn_number : (form.tfn_number ? '•••••••••' : '')}
                    readOnly={!isTaxUnlocked}
                    disabled={form.tfn_pending}
                    onChange={(e) => set('tfn_number', e.target.value)}
                    placeholder={t('ob.tfnPlaceholder') || 'TFN 9자리'}
                  />
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={form.tfn_pending}
                      disabled={!isTaxUnlocked}
                      onCheckedChange={(val) => set('tfn_pending', val)}
                    />
                    <span>{t('ob.tfnPending') || 'TFN 발급 신청 중 (28일 유예)'}</span>
                  </div>
                </div>
              </div>

              {/* 연금(Super) 운용사 선택 */}
              <div className="space-y-1.5 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Label>{t('ob.superChoice') || '연금(Super) 운용사 선택'}</Label>
                    <Lock className="h-3 w-3 text-amber-500" title="암호화 보안 처리됨" />
                  </div>
                  {!isSuperUnlocked && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-amber-500 gap-1 px-2 hover:bg-amber-500/10"
                      onClick={() => requestUnlockField('super')}
                    >
                      <Lock className="h-3 w-3" />
                      <span>인증 후 열람</span>
                    </Button>
                  )}
                </div>
                <div className={cn(!isSuperUnlocked && 'filter blur-sm select-none pointer-events-none')}>
                  <Select
                    value={form.super_choice}
                    disabled={!isSuperUnlocked}
                    onValueChange={(val) => set('super_choice', val)}
                  >
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
                      value={isSuperUnlocked ? form.super_fund_name : (form.super_fund_name ? '••••••••••••' : '')}
                      readOnly={!isSuperUnlocked}
                      onChange={(e) => set('super_fund_name', e.target.value)}
                      placeholder="예: AustralianSuper"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('ob.superUsi') || '고유 식별번호 (USI / ABN)'}</Label>
                    <Input
                      value={isSuperUnlocked ? form.super_usi : (form.super_usi ? '••••••••••••' : '')}
                      readOnly={!isSuperUnlocked}
                      onChange={(e) => set('super_usi', e.target.value)}
                      placeholder="USI 또는 ABN"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2 relative">
                    <div className="flex items-center justify-between">
                      <Label>{t('ob.superMember') || '연금 회원번호 (Member Number)'}</Label>
                      {!isSuperUnlocked && (
                        <span className="text-[11px] text-amber-500 font-medium flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          암호화 보안 잠금
                        </span>
                      )}
                    </div>
                    <Input
                      value={isSuperUnlocked ? form.super_member_number : (form.super_member_number ? '••••••••••••' : '')}
                      readOnly={!isSuperUnlocked}
                      onChange={(e) => set('super_member_number', e.target.value)}
                      placeholder="Member Number"
                    />
                  </div>
                </>
              )}

              {/* 급여 입금 계좌 정보 (BSB, 계좌번호, 예금주) - 기본적으로 항상 강력 암호화 잠금 */}
              <div className="sm:col-span-2 border-t pt-4 mt-2 space-y-3 relative">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">{t('ob.bankAccountDetails') || '급여 입금 계좌 정보'}</Label>
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500 border border-amber-500/20">
                      <Lock className="h-3 w-3" />
                      {t('ob.defaultEncrypted') || '기본 암호화 보안 적용'}
                    </span>
                  </div>

                  {!isBankUnlocked ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 gap-1.5 font-medium"
                      onClick={() => requestUnlockField('bank')}
                    >
                      <Lock className="h-3.5 w-3.5" />
                      <span>{t('security.unlock') || '본인 인증 후 열람/수정'}</span>
                    </Button>
                  ) : (
                    <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium text-[11px] gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {lang === 'en' ? 'Verified (Unlocked)' : '인증 완료 (열람 및 수정 가능)'}
                    </Badge>
                  )}
                </div>

                {!isBankUnlocked && (
                  <p className="text-xs text-muted-foreground">
                    {t('ob.bankSecurityNotice') || '계좌 정보는 금융 보안 정책에 따라 암호화되어 마스킹 처리됩니다. 확인 및 수정하려면 본인 인증을 진행하세요.'}
                  </p>
                )}

                <div className={cn(
                  'grid gap-3 sm:grid-cols-3 transition-all',
                  !isBankUnlocked && 'opacity-70 select-none'
                )}>
                  <div>
                    <Label className="text-xs">{t('ob.bankBsb') || 'BSB (은행 지점코드 6자리)'}</Label>
                    <Input
                      value={isBankUnlocked ? form.bank_bsb : (form.bank_bsb ? '••••••••' : '')}
                      readOnly={!isBankUnlocked}
                      onChange={(e) => set('bank_bsb', e.target.value)}
                      placeholder="000-000"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t('ob.bankAccount') || '계좌번호 (Account Number)'}</Label>
                    <Input
                      value={isBankUnlocked ? form.bank_account_number : (form.bank_account_number ? '••••••••••••' : '')}
                      readOnly={!isBankUnlocked}
                      onChange={(e) => set('bank_account_number', e.target.value)}
                      placeholder="Account Number"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t('ob.bankHolder') || '예금주명 (Account Name)'}</Label>
                    <Input
                      value={isBankUnlocked ? form.bank_account_name : (form.bank_account_name ? '••••••••••••' : '')}
                      readOnly={!isBankUnlocked}
                      onChange={(e) => set('bank_account_name', e.target.value)}
                      placeholder="Account Holder"
                    />
                  </div>
                </div>
              </div>

              {/* 4. 중복되지 않는 온보딩 확인 정보 섹션 (온보딩 질문 중 안 겹치는 항목들을 폼 내부로 통합) */}
              {nonOverlappingQuestions.length > 0 && (
                <div className="sm:col-span-2 border-t pt-4 mt-2 space-y-3">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-primary" />
                    <Label className="text-sm font-semibold">{t('ob.additionalDetails') || '추가 온보딩 확인 정보'}</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('ob.additionalDetailsHint') || '입사 시 제출한 맞춤 설문 및 세부 온보딩 확인 내역입니다.'}
                  </p>

                  <div className="divide-y rounded-lg border bg-muted/20">
                    {nonOverlappingQuestions.map((row) => {
                      const isSecure = Boolean(row.secure);
                      const isUnlocked = unlockedFields.has(row.id);

                      return (
                        <div key={row.id} className="p-3">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              {isSecure && <Lock className="h-3.5 w-3.5 text-amber-500" title={lang === 'en' ? 'Encrypted Question' : '암호화 보안 처리된 질문'} />}
                              <p className="text-xs font-medium text-muted-foreground">{row.label}</p>
                            </div>
                            {isSecure && !isUnlocked && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => requestUnlockField(row.id)}
                                className="h-6 px-2 text-[11px] gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
                              >
                                <Lock className="h-3 w-3" />
                                <span>{t('ob.verifyToView') || '인증 후 열람'}</span>
                              </Button>
                            )}
                          </div>

                          {/* 답변 표시 */}
                          {isSecure && !isUnlocked ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm tracking-widest text-muted-foreground">••••••••••••</span>
                              <span className="text-[11px] text-amber-600/90 font-medium">
                                {lang === 'en' ? '(Encrypted & Protected)' : '(암호화 보안 처리됨)'}
                              </span>
                            </div>
                          ) : (
                            <p className="text-sm font-medium">{row.answer || t('ob.notProvided') || '미제출'}</p>
                          )}

                          {/* 후속 질문 상세 답변 */}
                          {row.details && row.details.length > 0 && (!isSecure || isUnlocked) && (
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                              {row.details.map(([field, value]) => (
                                <span key={field} className="text-xs text-muted-foreground">
                                  {field}: <span className="text-foreground font-medium">{value}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 온보딩 정보 저장 버튼 */}
            <div className="flex justify-end pt-3">
              <Button type="button" onClick={save} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{t('ob.saveDetails') || '온보딩 정보 저장하기'}</span>
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