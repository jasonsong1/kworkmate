import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Clock, FileText, Loader2, Trash2 } from 'lucide-react';
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
import { checklistFor } from '@/lib/onboardingDocs';
import { kwSessionAction } from '@/lib/kwAuthClient';
import { base44 } from '@/api/base44Client';

/**
 * StaffOnboardingCard 컴포넌트
 * 직원의 온보딩 세부 정보 입력 및 서류(신분증, 세금 신고서 등) 파일 업로드/열기/삭제 카드입니다.
 * - 온보딩 서류 및 폼 접기/펼치기(숨김 토글) 기능 제공
 * - 파일 열기 시 서명 URL(Signed URL)을 통해 비공개 파일 안전 열람
 * - 다른 페이지 이동 후 복귀 시에도 최신 파일 목록이 유지되도록 자동 동기화 지원
 */
export default function StaffOnboardingCard() {
  const { t, lang } = useI18n();
  const { company, employeeProfile, reload } = useWorkspace();
  const { toast } = useToast();

  // 온보딩 서류 및 폼 접기/펼치기 숨김 토글 상태 (기본값: false 접힘)
  const [isOpen, setIsOpen] = useState(false);
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState('');
  const [busyUri, setBusyUri] = useState('');
  const fileRef = useRef(null);
  const pickKey = useRef('');

  // 현재 활성 프로필: 서버에서 갓 불러온 record 우선, 없을 경우 컨텍스트의 employeeProfile 사용
  const profile = record || employeeProfile;

  // 프로필 데이터로 폼 상태를 초기화/동기화하는 함수
  const syncFormFromProfile = useCallback((row) => {
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

  // 서버에서 최신 온보딩 서류 및 프로필 데이터를 직접 가져오는 함수
  // (다른 페이지를 갔다 와도 방금 올린 파일이 사라지지 않고 유지되도록 보장합니다)
  const fetchFreshProfile = useCallback(async () => {
    try {
      const res = await kwSessionAction({ action: 'me' });
      if (res && res.profile) {
        setRecord(res.profile);
        syncFormFromProfile(res.profile);
      }
    } catch (_) {}
  }, [syncFormFromProfile]);

  // 컴포넌트 마운트 시 최신 프로필 1회 로드
  useEffect(() => {
    fetchFreshProfile();
  }, [fetchFreshProfile]);

  // 컨텍스트의 employeeProfile이 변경되었을 때 폼 동기화
  useEffect(() => {
    if (employeeProfile && !record) {
      syncFormFromProfile(employeeProfile);
    }
  }, [employeeProfile, record, syncFormFromProfile]);

  if (!profile || !form) return null;

  const visible = { address: true, date_of_birth: true, emergency_contact: true, tax: true, super: true, bank: true };
  const checklist = checklistFor(profile, company, lang);
  const percent = checklist.requiredTotal === 0 ? 100 : (checklist.requiredDone / checklist.requiredTotal) * 100;
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const detailsForSave = () => {
    const data = {};
    if (visible.address) data.address = form.address;
    if (visible.date_of_birth) data.date_of_birth = form.date_of_birth;
    if (visible.emergency_contact) {
      data.emergency_contact_name = form.emergency_contact_name;
      data.emergency_contact_phone = form.emergency_contact_phone;
    }
    if (visible.tax) {
      data.tfn_number = form.tfn_number;
      data.tfn_pending = form.tfn_pending;
    }
    if (visible.super) {
      data.super_choice = form.super_choice;
      data.super_fund_name = form.super_choice === 'custom_fund' ? form.super_fund_name : '';
      data.super_usi = form.super_choice === 'custom_fund' ? form.super_usi : '';
      data.super_member_number = form.super_member_number;
    }
    if (visible.bank) {
      data.bank_bsb = form.bank_bsb;
      data.bank_account_number = form.bank_account_number;
      data.bank_account_name = form.bank_account_name;
    }
    return data;
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await kwSessionAction({ action: 'save_onboarding', data: detailsForSave() });
      if (saved && saved.profile) {
        setRecord(saved.profile);
        syncFormFromProfile(saved.profile);
      }
      if (reload) reload();
      toast({ title: t('ob.saved') });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const chooseFile = (key) => {
    pickKey.current = key;
    if (fileRef.current) {
      fileRef.current.value = '';
      fileRef.current.click();
    }
  };

  const upload = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const key = pickKey.current;
    setUploadingKey(key);
    try {
      // 1. Storage private 버킷에 업로드
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      // 2. 사원 레코드 docs 목록에 파일 등록
      const saved = await kwSessionAction({
        action: 'add_document',
        file_uri,
        name: file.name,
        doc_type: key
      });
      if (saved && saved.profile) {
        setRecord(saved.profile);
        syncFormFromProfile(saved.profile);
      }
      if (reload) reload();
      toast({ title: t('ob.uploaded') });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.uploadFailed') });
    } finally {
      setUploadingKey('');
    }
  };

  // 비공개 파일 안전 열기 (서버 kwSession sign_document 및 클라이언트 CreateFileSignedUrl 이중 지원)
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
      toast({ variant: 'destructive', title: error.message || t('ob.uploadFailed') });
    } finally {
      setBusyUri('');
    }
  };

  const removeDoc = async (file) => {
    if (!file || !file.file_uri) return;
    setBusyUri(file.file_uri);
    try {
      const saved = await kwSessionAction({ action: 'delete_document', file_uri: file.file_uri });
      if (saved && saved.profile) {
        setRecord(saved.profile);
        syncFormFromProfile(saved.profile);
      }
      if (reload) reload();
      toast({ title: t('ob.removed') });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.uploadFailed') });
    } finally {
      setBusyUri('');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            {t('ob.title')}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{t('ob.hint')}</p>
        </div>
        {/* 온보딩 서류 및 폼 숨김/펼치기 토글 버튼 */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen((prev) => !prev)}
          className="h-8 gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          title={isOpen ? '서류 숨기기' : '서류 보기'}
        >
          <span>{isOpen ? '숨기기' : '펼치기'}</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CardHeader>

      {isOpen && (
        <CardContent className="space-y-5 animate-in fade-in-50 duration-200">
          <div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {t('ob.progress')
                  .replace('{done}', String(checklist.requiredDone))
                  .replace('{total}', String(checklist.requiredTotal))}
              </span>
              {checklist.complete && (
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{t('ob.completed')}</Badge>
              )}
            </div>
            <Progress value={percent} className="mt-2 h-1.5" />
          </div>

          <div className="divide-y rounded-xl border">
            {checklist.items.map((item) => (
              <div key={item.key} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                {item.done ? (
                  <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.required ? t('ob.required') : t('ob.optional')}
                    {item.file && ` · ${item.file.name}`}
                  </p>
                </div>
                {item.isDocument ? (
                  <div className="flex items-center gap-1">
                    {item.file ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyUri === item.file.file_uri}
                          onClick={() => openDoc(item.file)}
                        >
                          {busyUri === item.file.file_uri ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            t('ob.open')
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={Boolean(uploadingKey)}
                          onClick={() => chooseFile(item.key)}
                        >
                          {uploadingKey === item.key ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            t('ob.replace')
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyUri === item.file.file_uri}
                          onClick={() => removeDoc(item.file)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={Boolean(uploadingKey)}
                        onClick={() => chooseFile(item.key)}
                      >
                        {uploadingKey === item.key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          t('ob.chooseFile')
                        )}
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">{t('ob.detailsHint')}</span>
                )}
              </div>
            ))}
          </div>

          <input ref={fileRef} type="file" className="hidden" onChange={upload} />

          <div className="space-y-4 rounded-xl border p-4">
            <h3 className="text-sm font-semibold">{t('ob.personalDetails')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {visible.address && (
                <div className="sm:col-span-2">
                  <Label>{t('ob.address')}</Label>
                  <Input value={form.address} onChange={(event) => set('address', event.target.value)} />
                </div>
              )}
              {visible.date_of_birth && (
                <div>
                  <Label>{t('ob.dob')}</Label>
                  <Input
                    type="date"
                    value={form.date_of_birth}
                    onChange={(event) => set('date_of_birth', event.target.value)}
                  />
                </div>
              )}
              {visible.emergency_contact && (
                <>
                  <div>
                    <Label>{t('ob.emergencyName')}</Label>
                    <Input
                      value={form.emergency_contact_name}
                      onChange={(event) => set('emergency_contact_name', event.target.value)}
                    />
                  </div>
                  <div>
                    <Label>{t('ob.emergencyPhone')}</Label>
                    <Input
                      value={form.emergency_contact_phone}
                      onChange={(event) => set('emergency_contact_phone', event.target.value)}
                    />
                  </div>
                </>
              )}
              {visible.tax && (
                <>
                  <div>
                    <Label>{t('ob.tfn')}</Label>
                    <Input
                      value={form.tfn_number}
                      disabled={form.tfn_pending}
                      onChange={(event) => set('tfn_number', event.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch
                      checked={form.tfn_pending}
                      onCheckedChange={(checked) => set('tfn_pending', checked)}
                    />
                    <Label className="text-xs">{t('ob.tfnPending')}</Label>
                  </div>
                </>
              )}
              {visible.super && (
                <>
                  <div className="sm:col-span-2">
                    <Label>{t('ob.superChoice')}</Label>
                    <Select value={form.super_choice} onValueChange={(value) => set('super_choice', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default_fund">{t('ob.superDefault')}</SelectItem>
                        <SelectItem value="custom_fund">{t('ob.superCustom')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.super_choice === 'custom_fund' && (
                    <>
                      <div>
                        <Label>{t('ob.superFund')}</Label>
                        <Input
                          value={form.super_fund_name}
                          onChange={(event) => set('super_fund_name', event.target.value)}
                        />
                      </div>
                      <div>
                        <Label>{t('ob.superUsi')}</Label>
                        <Input
                          value={form.super_usi}
                          onChange={(event) => set('super_usi', event.target.value)}
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <Label>{t('ob.superMember')}</Label>
                    <Input
                      value={form.super_member_number}
                      onChange={(event) => set('super_member_number', event.target.value)}
                    />
                  </div>
                </>
              )}
              {visible.bank && (
                <>
                  <div>
                    <Label>{t('ob.bankBsb')}</Label>
                    <Input value={form.bank_bsb} onChange={(event) => set('bank_bsb', event.target.value)} />
                  </div>
                  <div>
                    <Label>{t('ob.bankAccount')}</Label>
                    <Input
                      value={form.bank_account_number}
                      onChange={(event) => set('bank_account_number', event.target.value)}
                    />
                  </div>
                  <div>
                    <Label>{t('ob.bankHolder')}</Label>
                    <Input
                      value={form.bank_account_name}
                      onChange={(event) => set('bank_account_name', event.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}