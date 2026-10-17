import React, { useState } from 'react';
import { Lock, PenTool, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import EmployerSignatureDialog from '@/components/company/EmployerSignatureDialog';

// 개인정보 수집 표준 항목 키
const PERSONAL_FIELDS = [
  { key: 'address', label: '주소', label_en: 'Address' },
  { key: 'date_of_birth', label: '생년월일', label_en: 'Date of birth' },
  { key: 'emergency_contact', label: '비상연락처', label_en: 'Emergency contact' },
  { key: 'tax', label: '세금 (TFN)', label_en: 'Tax (TFN)' },
  { key: 'super', label: '연금 (Super)', label_en: 'Superannuation' },
  { key: 'bank', label: '은행 계좌', label_en: 'Bank account' }
];

// 기본 서류 라벨을 언어(lang)에 맞게 반환하는 헬퍼 함수
function getDisplayDocLabel(type, lang) {
  if (!type) return '';
  if (lang === 'en') {
    if (type.label_en) return type.label_en;
    if (type.key === 'id') return 'Photo ID (passport or licence)';
    if (type.key === 'right_to_work') return 'Right to work evidence';
    if (type.key === 'personal') return 'Address, date of birth & emergency contact';
    if (type.key === 'tfn') return 'TFN declaration form (NAT 3092)';
    if (type.key === 'bank') return 'Bank account details';
    if (type.key === 'contract') return 'Signed employment contract';
    return type.label || '';
  }
  if (type.label) return type.label;
  if (type.key === 'id') return '신분증 (ID)';
  if (type.key === 'right_to_work') return 'Right to Work 증빙';
  if (type.key === 'personal') return '주소·생년월일·비상연락처';
  if (type.key === 'tfn') return 'TFN Declaration (ATO NAT 3092)';
  if (type.key === 'bank') return '은행 계좌 정보';
  if (type.key === 'contract') return '서명된 Employment Contract';
  return type.label_en || '';
}

/**
 * OnboardingSetupCard 컴포넌트
 * 회사 설정 > 온보딩 탭의 서류 설정 및 개인정보 수집/암호화 설정 카드입니다.
 * - 온보딩 제출 서류 리스트 추가/삭제/필수 여부 설정
 * - 각 서류별 "암호화 보안 (비밀번호/얼굴인식 본인확인)" 토글 제공
 * - TFN 서류의 경우 고용주 공식 e-Signature(사인 넣기) 등록 버튼 제공
 * - 수집할 개인정보 항목별 활성화 및 암호화 보안 토글 제공
 */
export default function OnboardingSetupCard({
  types = [],
  onChange,
  fieldVisibility = {},
  onFieldVisibilityChange,
  secureFields = {},
  onSecureFieldsChange,
  employerSignature = '',
  onEmployerSignatureChange,
  canEdit = false
}) {
  const { t, lang } = useI18n();
  const [sigDialogOpen, setSigDialogOpen] = useState(false);

  const setType = (index, patch) =>
    onChange(types.map((item, at) => (at === index ? { ...item, ...patch } : item)));

  const addType = () =>
    onChange([
      ...types,
      {
        key: `doc_${Math.random().toString(36).slice(2, 8)}`,
        label: '',
        label_en: '',
        kind: 'file',
        required: true,
        secure: false
      }
    ]);

  const removeType = (index) => onChange(types.filter((_, at) => at !== index));

  const toggleFieldVisibility = (fieldKey, value) => {
    if (onFieldVisibilityChange) {
      onFieldVisibilityChange({ ...fieldVisibility, [fieldKey]: value });
    }
  };

  const toggleFieldSecure = (fieldKey, value) => {
    if (onSecureFieldsChange) {
      onSecureFieldsChange({ ...secureFields, [fieldKey]: value });
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. 온보딩 서류 설정 카드 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">{t('ob.setupTitle') || '온보딩 서류 설정'}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('ob.setupHint') || '채용된 직원이 제출해야 할 서류와 온보딩에서 받을 개인정보 항목을 정합니다.'}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="block text-sm font-medium">{t('ob.docTypes') || '제출 서류'}</Label>
            <p className="mb-3 mt-1 text-xs text-muted-foreground">
              {t('ob.docTypesHint') || '직원이 본인 계정에서 서류를 올릴 때 이 중 하나를 고릅니다.'}
            </p>
          </div>

          {types.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('ob.docTypesEmpty') || '등록된 서류가 없습니다.'}</p>
          )}

          <div className="space-y-2.5">
            {types.map((type, index) => (
              <div
                key={type.key}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-xl border p-3 transition-colors',
                  type.secure ? 'border-amber-500/30 bg-amber-500/5' : 'bg-card'
                )}
              >
                {/* 서류 이름 입력 필드 */}
                <Input
                  value={getDisplayDocLabel(type, lang)}
                  disabled={!canEdit}
                  placeholder={t('ob.docTypeLabel') || '서류 이름'}
                  className="min-w-[12rem] flex-1 text-sm"
                  onChange={(event) => {
                    const val = event.target.value;
                    if (lang === 'en') {
                      setType(index, { label_en: val, label: type.label || val });
                    } else {
                      setType(index, { label: val });
                    }
                  }}
                />

                {/* 정보 입력 확인 배지 */}
                {type.kind === 'info' && (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {t('ob.docTypeInfo') || '정보 입력으로 확인'}
                  </span>
                )}

                {/* 암호화 보안 토글 스위치 (로그인 비번/생체인증 필요) */}
                <div
                  className="flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  title={lang === 'en' ? 'When enabled, staff must authenticate via password or biometrics to view this document.' : '켜면 직원이 내 공간에서 서류를 열람할 때 로그인 비밀번호 또는 얼굴인식(생체인증)을 통과해야 합니다.'}
                >
                  <Lock className={cn('h-3.5 w-3.5', type.secure ? 'text-amber-500' : 'text-muted-foreground')} />
                  <span>{t('ob.encryptionBadge') || '암호화 보안'}</span>
                  <Switch
                    checked={Boolean(type.secure)}
                    disabled={!canEdit}
                    onCheckedChange={(value) => setType(index, { secure: value })}
                  />
                </div>

                {/* TFN Declaration Form의 경우: 고용주 공식 전자서명 등록 버튼 */}
                {type.key === 'tfn' && (
                  <Button
                    type="button"
                    size="sm"
                    variant={employerSignature ? 'outline' : 'secondary'}
                    disabled={!canEdit}
                    className={cn(
                      'h-7 text-xs gap-1.5 font-medium transition-colors',
                      employerSignature
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20'
                        : 'text-slate-700 hover:text-primary'
                    )}
                    onClick={() => setSigDialogOpen(true)}
                    title={lang === 'en' ? 'Register employer signature to be automatically printed on Section B of ATO tax forms.' : '호주 국세청(ATO) 세무 서식 Section B에 자동 인쇄될 고용주 서명을 등록합니다.'}
                  >
                    <PenTool className="h-3.5 w-3.5" />
                    {employerSignature
                      ? (t('ob.signatureSavedEdit') || '서명 등록됨 (수정)')
                      : (t('ob.addSignature') || '사인 넣기')}
                  </Button>
                )}

                {/* 필수 여부 토글 */}
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Switch
                    checked={type.required !== false}
                    disabled={!canEdit}
                    onCheckedChange={(value) => setType(index, { required: value })}
                  />
                  <span>{t('ob.required') || '필수'}</span>
                </div>

                {/* 삭제 버튼 */}
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={!canEdit}
                  title={t('common.delete') || '삭제'}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeType(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" className="mt-2" disabled={!canEdit} onClick={addType}>
            <Plus className="mr-2 h-4 w-4" /> {t('ob.docTypeAdd') || '서류 추가'}
          </Button>
        </CardContent>
      </Card>

      {/* 2. 수집할 개인정보 항목 카드 (스크린샷 3번 UI 일치) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            {t('ob.fieldVisibility') || '수집할 개인정보 항목'}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('ob.fieldVisibilityHint') || '끄면 직원 입력 화면과 모든 프로필에서 해당 항목이 사라집니다.'}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {PERSONAL_FIELDS.map((f) => {
              const isCollected = fieldVisibility[f.key] !== false;
              const isSecure = Boolean(secureFields[f.key]);

              return (
                <div
                  key={f.key}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors',
                    isSecure ? 'border-amber-500/30 bg-amber-500/5' : 'bg-card'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {lang === 'en' ? f.label_en : f.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isSecure ? (t('ob.passwordBioProtected') || '🔒 비밀번호/생체인증 보호됨') : (t('ob.standardAccess') || '일반 열람')}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* 암호화 보안 스위치 */}
                    <div
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                      title={lang === 'en' ? 'When enabled, this field is masked in staff My Space and requires authentication to view.' : '켜면 직원의 내 공간에서 해당 정보가 블러 처리되며, 비밀번호/얼굴인식 후 확인할 수 있습니다.'}
                    >
                      <Lock className={cn('h-3.5 w-3.5', isSecure ? 'text-amber-500' : 'text-muted-foreground')} />
                      <span className="hidden sm:inline">{t('ob.encrypt') || '암호화'}</span>
                      <Switch
                        checked={isSecure}
                        disabled={!canEdit || !isCollected}
                        onCheckedChange={(val) => toggleFieldSecure(f.key, val)}
                      />
                    </div>

                    {/* 수집 활성화 스위치 */}
                    <div className="flex items-center gap-1.5 border-l pl-3 text-xs font-medium">
                      <span>{t('ob.collect') || '수집'}</span>
                      <Switch
                        checked={isCollected}
                        disabled={!canEdit}
                        onCheckedChange={(val) => toggleFieldVisibility(f.key, val)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 고용주 공식 전자서명 등록 다이얼로그 */}
      <EmployerSignatureDialog
        open={sigDialogOpen}
        onOpenChange={setSigDialogOpen}
        initialSignature={employerSignature}
        onSave={(sigDataUrl) => {
          if (onEmployerSignatureChange) {
            onEmployerSignatureChange(sigDataUrl);
          }
        }}
      />
    </div>
  );
}