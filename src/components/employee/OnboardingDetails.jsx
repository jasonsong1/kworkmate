import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Lock, Eye, EyeOff } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { answerRows, fieldRows } from '@/lib/onboardingDocs';
import { Button } from '@/components/ui/button';
import SecureVerificationDialog from '@/components/auth/SecureVerificationDialog';
import { cn } from '@/lib/utils';

/**
 * OnboardingDetails 컴포넌트
 * 직원이 입사 시 제출한 온보딩 정보(질문 답변, 계좌, 세금, 연금 등)를 표시하는 컴포넌트입니다.
 * - 사용자의 요청에 따라 접기/펼치기(숨김 토글) 버튼이 제공됩니다.
 * - 질문 생성 시 '암호화 보안(secure)'으로 지정된 질문은 기본적으로 마스킹 처리되며,
 *   비밀번호 인증(SecureVerificationDialog)을 완료해야만 안전하게 열람할 수 있습니다.
 */
export default function OnboardingDetails({ profile, company }) {
  const { t, lang } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [unlockedRows, setUnlockedRows] = useState(new Set());
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [targetRowId, setTargetRowId] = useState(null);

  if (!profile) return null;

  const rows = answerRows(profile, company, t);
  const fields = rows.length === 0 ? fieldRows(profile, t) : [];
  if (rows.length === 0 && fields.length === 0) return null;

  // 암호화된 필드 열람 인증 요청
  const handleUnlockClick = (rowId) => {
    setTargetRowId(rowId);
    setAuthDialogOpen(true);
  };

  // 본인 확인 인증 성공 시 해당 필드 잠금 해제
  const handleAuthSuccess = () => {
    if (targetRowId) {
      setUnlockedRows((prev) => new Set([...prev, targetRowId]));
      setTargetRowId(null);
    }
  };

  return (
    <div className="w-full rounded-lg border bg-card">
      {/* 헤더 영역: 온보딩 정보 제목과 접기/펼치기 토글 버튼 */}
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-semibold">{t('ob.profileTitle') || '온보딩 정보'}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen((prev) => !prev)}
          className="h-8 gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          title={isOpen ? '정보 숨기기' : '정보 보기'}
        >
          <span>{isOpen ? (lang === 'ko' ? '숨기기' : 'Collapse') : (lang === 'ko' ? '펼치기' : 'Expand')}</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {/* 펼쳐졌을 때 온보딩 상세 내용을 보여줍니다. */}
      {isOpen && (
        <>
          {rows.length > 0 ? (
            <div className="divide-y animate-in fade-in-50 duration-200">
              {rows.map((row) => {
                const isSecure = Boolean(row.secure);
                const isUnlocked = unlockedRows.has(row.id);

                return (
                  <div key={row.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        {isSecure && <Lock className="h-3.5 w-3.5 text-amber-500" title="암호화 보안 처리된 질문" />}
                        <p className="text-xs font-medium text-muted-foreground">{row.label}</p>
                      </div>
                      {isSecure && !isUnlocked && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnlockClick(row.id)}
                          className="h-6 px-2 text-[11px] gap-1 border-amber-500/40 text-amber-700 bg-amber-500/10 hover:bg-amber-500/20"
                        >
                          <Lock className="h-3 w-3" />
                          <span>{lang === 'ko' ? '인증 후 열람' : 'Verify to view'}</span>
                        </Button>
                      )}
                    </div>

                    {/* 답변 영역: 암호화되어 있고 미인증 상태인 경우 마스킹 처리 */}
                    {isSecure && !isUnlocked ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm tracking-widest text-muted-foreground">••••••••••••</span>
                        <span className="text-[11px] text-amber-600/90 font-medium">
                          ({lang === 'ko' ? '암호화 보안 처리됨' : 'Encrypted securely'})
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm font-medium">{row.answer || t('ob.notProvided')}</p>
                    )}

                    {/* 후속 질문 상세 답변 */}
                    {row.details.length > 0 && (!isSecure || isUnlocked) && (
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                        {row.details.map(([field, value]) => (
                          <span key={field} className="text-xs text-muted-foreground">
                            {field}: <span className="text-foreground">{value}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2 animate-in fade-in-50 duration-200">
              {fields.map(([label, value], index) => (
                <div key={`${label}-${index}`}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm">{String(value || '').trim() ? value : t('ob.notProvided')}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 보안 인증 비밀번호 확인 다이얼로그 */}
      <SecureVerificationDialog
        open={authDialogOpen}
        onOpenChange={setAuthDialogOpen}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}