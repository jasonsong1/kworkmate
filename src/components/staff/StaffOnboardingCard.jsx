import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  FolderOpen,
  Loader2,
  Trash2,
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

/**
 * StaffOnboardingCard 컴포넌트
 * 온보딩 정보와 온보딩 서류를 하나의 통합 섹션에서 제공하는 컴포넌트입니다.
 * - [숨기기 / 펼치기] 토글 버튼으로 함께 여닫히도록 구성
 * - 표준 온보딩 서류 7개 목록 및 [파일 선택/업로드] 버튼 제공
 * - 업로드 완료 시 [열기], [다시 올리기], [삭제] 버튼 제공
 * - 페이지를 다녀와도 파일 목록 및 입력 정보가 그대로 유지되도록 상태 동기화
 */
export default function StaffOnboardingCard() {
  const { t, lang } = useI18n();
  const { me, company, employeeProfile, reload } = useWorkspace();
  const { toast } = useToast();

  // 온보딩 서류 및 정보 통합 숨김/펼치기 토글 상태 (기본값: false 접힘)
  const [isOpen, setIsOpen] = useState(false);
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState('');
  const [busyUri, setBusyUri] = useState('');
  const fileRef = useRef(null);
  const pickKey = useRef('');

  // 현재 활성 프로필 (서버 최신 record 우선 -> employeeProfile -> me 기본 객체 폴백)
  const profile = record || employeeProfile || (me ? {
    id: me.id,
    user_email: me.email,
    full_name: me.full_name || me.email,
    docs: [],
    onboarding_status: 'pending'
  } : null);

  // 폼 필드 동기화 함수
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

  // 서버에서 최신 온보딩 데이터(업로드된 서류 목록 docs 포함)를 다시 가져오는 함수
  const fetchFreshProfile = useCallback(async () => {
    try {
      const res = await kwSessionAction({ action: 'me' });
      if (res && res.profile) {
        setRecord(res.profile);
        syncForm(res.profile);
      }
    } catch (_) {}
  }, [syncForm]);

  // 컴포넌트 마운트 시 최신 데이터 로드
  useEffect(() => {
    fetchFreshProfile();
  }, [fetchFreshProfile]);

  // employeeProfile 또는 me 변경 시 기본 폼 세팅
  useEffect(() => {
    const base = employeeProfile || me;
    if (base && !form) {
      syncForm(base);
    }
  }, [employeeProfile, me, form, syncForm]);

  if (!profile || !form) return null;

  // 체크리스트 생성 및 표준 7개 서류 보장
  const rawChecklist = checklistFor(profile, company, lang);
  const items = (rawChecklist && rawChecklist.items && rawChecklist.items.length > 0)
    ? rawChecklist.items
    : DEFAULT_DOC_TYPES.map((d) => {
        const file = (profile.docs || []).find((doc) => doc && doc.doc_type === d.key);
        return {
          key: d.key,
          title: lang === 'en' ? d.label_en : d.label,
          required: d.required !== false,
          isDocument: d.kind !== 'info',
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

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // 온보딩 개인정보 저장 처리
  const save = async () => {
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
      }
      if (reload) reload();
      toast({ title: t('ob.saved') || '온보딩 정보가 저장되었습니다.' });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.saveFailed') || '저장에 실패했습니다.' });
    } finally {
      setSaving(false);
    }
  };

  // 파일 선택 다이얼로그 호출
  const chooseFile = (key) => {
    pickKey.current = key;
    if (fileRef.current) {
      fileRef.current.value = '';
      fileRef.current.click();
    }
  };

  // 파일 실제 업로드 및 사원 레코드 등록
  const upload = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const key = pickKey.current;
    setUploadingKey(key);
    try {
      // 1. Storage 비공개 버킷에 업로드
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      // 2. 서버 kwSession에 서류 등록
      const saved = await kwSessionAction({
        action: 'add_document',
        file_uri,
        name: file.name,
        doc_type: key
      });
      if (saved && saved.profile) {
        setRecord(saved.profile);
        syncForm(saved.profile);
      }
      if (reload) reload();
      toast({ title: t('ob.uploaded') || '파일이 업로드되었습니다.' });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.uploadFailed') || '업로드 실패' });
    } finally {
      setUploadingKey('');
    }
  };

  // 비공개 파일 안전 열기 (서버 및 클라이언트 서명 URL 이중 지원)
  const openDoc = async (file) => {
    if (!file || !file.file_uri) return;
    setBusyUri(file.file_uri);
    try {
      let signedUrl = '';

      // 1차 시도: 서버 함수 kwSession sign_document
      try {
        const res = await kwSessionAction({ action: 'sign_document', file_uri: file.file_uri });
        if (res && res.signed_url) signedUrl = res.signed_url;
      } catch (_) {}

      // 2차 시도: 클라이언트 base44.integrations.Core.CreateFileSignedUrl
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

  // 업로드된 서류 삭제
  const removeDoc = async (file) => {
    if (!file || !file.file_uri) return;
    setBusyUri(file.file_uri);
    try {
      const saved = await kwSessionAction({ action: 'delete_document', file_uri: file.file_uri });
      if (saved && saved.profile) {
        setRecord(saved.profile);
        syncForm(saved.profile);
      }
      if (reload) reload();
      toast({ title: t('ob.removed') || '서류가 삭제되었습니다.' });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.uploadFailed') || '삭제 실패' });
    } finally {
      setBusyUri('');
    }
  };

  return (
    <Card>
      {/* 온보딩 정보 및 서류 통합 헤더 */}
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
        {/* 단일 숨김 / 펼치기 토글 버튼 */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsOpen((prev) => !prev)}
          className="h-8 gap-1.5 px-3 text-xs font-medium"
          title={isOpen ? '접기' : '펼치기'}
        >
          <span>{isOpen ? '숨기기' : '펼치기'}</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CardHeader>

      {/* 펼쳐졌을 때 온보딩 서류 목록과 온보딩 상세 정보가 함께 보입니다 */}
      {isOpen && (
        <CardContent className="space-y-6 animate-in fade-in-50 duration-200">
          {/* 1. 제출 현황 프로그레스 바 */}
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-foreground">
                {requiredTotal}건 중 {requiredDone}건 제출 완료
              </span>
              {isComplete ? (
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                  {t('ob.completed') || '제출 완료'}
                </Badge>
              ) : (
                <Badge variant="secondary">
                  {t('employees.pending') || '제출 대기'}
                </Badge>
              )}
            </div>
            <Progress value={percent} className="mt-2.5 h-2" />
          </div>

          {/* 2. 온보딩 서류 목록 (체크리스트 & 파일 업로드/열기) */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <UploadCloud className="h-4 w-4 text-muted-foreground" />
              온보딩 서류 제출 목록
            </h3>
            <div className="divide-y rounded-xl border">
              {items.map((item) => (
                <div key={item.key} className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted/30 transition-colors">
                  {item.done ? (
                    <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  ) : (
                    <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.required ? '필수' : '선택'}
                      {item.file && ` · ${item.file.name}`}
                    </p>
                  </div>
                  {item.isDocument ? (
                    <div className="flex items-center gap-1.5">
                      {item.file ? (
                        <>
                          {/* 파일 열기 버튼 */}
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyUri === item.file.file_uri}
                            onClick={() => openDoc(item.file)}
                            className="h-8 text-xs"
                          >
                            {busyUri === item.file.file_uri ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              '열기'
                            )}
                          </Button>
                          {/* 파일 다시 올리기 버튼 */}
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
                        /* 새 파일 업로드 버튼 */
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
                            <>
                              <UploadCloud className="h-3.5 w-3.5" />
                              파일 선택
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">아래 정보 입력에서 확인됩니다</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 숨김 파일 인풋 */}
          <input ref={fileRef} type="file" className="hidden" onChange={upload} />

          {/* 3. 온보딩 상세 정보 입력 폼 */}
          <div className="space-y-4 rounded-xl border p-4 bg-card">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              {t('ob.personalDetails') || '온보딩 개인정보 및 계좌·세금 정보'}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>{t('ob.address') || '거주 주소'}</Label>
                <Input value={form.address} onChange={(event) => set('address', event.target.value)} placeholder="주소를 입력하세요" />
              </div>

              <div>
                <Label>{t('ob.dob') || '생년월일'}</Label>
                <Input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(event) => set('date_of_birth', event.target.value)}
                />
              </div>

              <div>
                <Label>{t('ob.emergencyName') || '비상연락처 이름'}</Label>
                <Input
                  value={form.emergency_contact_name}
                  onChange={(event) => set('emergency_contact_name', event.target.value)}
                  placeholder="예: 홍길동 (부모)"
                />
              </div>

              <div>
                <Label>{t('ob.emergencyPhone') || '비상연락처 전화번호'}</Label>
                <Input
                  value={form.emergency_contact_phone}
                  onChange={(event) => set('emergency_contact_phone', event.target.value)}
                  placeholder="0400 000 000"
                />
              </div>

              <div>
                <Label>{t('ob.tfn') || 'TFN (세금 번호)'}</Label>
                <Input
                  value={form.tfn_number}
                  disabled={form.tfn_pending}
                  onChange={(event) => set('tfn_number', event.target.value)}
                  placeholder="TFN 9자리"
                />
              </div>

              <div className="flex items-center gap-2 pt-6">
                <Switch
                  checked={form.tfn_pending}
                  onCheckedChange={(checked) => set('tfn_pending', checked)}
                />
                <Label className="text-xs cursor-pointer">{t('ob.tfnPending') || 'TFN 발급 신청 중 (추후 제출)'}</Label>
              </div>

              <div className="sm:col-span-2">
                <Label>{t('ob.superChoice') || '연금(Superannuation) 선택'}</Label>
                <Select value={form.super_choice} onValueChange={(value) => set('super_choice', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default_fund">{t('ob.superDefault') || '회사 기본 연금 펀드'}</SelectItem>
                    <SelectItem value="custom_fund">{t('ob.superCustom') || '본인 소유 연금 펀드 직접 지정'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.super_choice === 'custom_fund' && (
                <>
                  <div>
                    <Label>{t('ob.superFund') || '연금 펀드 이름'}</Label>
                    <Input
                      value={form.super_fund_name}
                      onChange={(event) => set('super_fund_name', event.target.value)}
                      placeholder="예: AustralianSuper"
                    />
                  </div>
                  <div>
                    <Label>{t('ob.superUsi') || 'USI 번호'}</Label>
                    <Input
                      value={form.super_usi}
                      onChange={(event) => set('super_usi', event.target.value)}
                      placeholder="USI"
                    />
                  </div>
                </>
              )}

              <div>
                <Label>{t('ob.superMember') || '연금 회원 번호'}</Label>
                <Input
                  value={form.super_member_number}
                  onChange={(event) => set('super_member_number', event.target.value)}
                  placeholder="Member Number"
                />
              </div>

              <div>
                <Label>{t('ob.bankBsb') || '은행 BSB (6자리)'}</Label>
                <Input value={form.bank_bsb} onChange={(event) => set('bank_bsb', event.target.value)} placeholder="000-000" />
              </div>

              <div>
                <Label>{t('ob.bankAccount') || '은행 계좌번호'}</Label>
                <Input
                  value={form.bank_account_number}
                  onChange={(event) => set('bank_account_number', event.target.value)}
                  placeholder="Account Number"
                />
              </div>

              <div>
                <Label>{t('ob.bankHolder') || '예금주명'}</Label>
                <Input
                  value={form.bank_account_name}
                  onChange={(event) => set('bank_account_name', event.target.value)}
                  placeholder="Account Name"
                />
              </div>
            </div>

            <Button onClick={save} disabled={saving} className="mt-2">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.save') || '온보딩 정보 저장하기'}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}