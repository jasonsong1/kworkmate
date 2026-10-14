import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { answerRows, fieldRows } from '@/lib/onboardingDocs';
import { Button } from '@/components/ui/button';

/**
 * OnboardingDetails 컴포넌트
 * 직원이 입사 시 제출한 온보딩 정보(계좌, 세금, 연금 등)를 표시하는 컴포넌트입니다.
 * - 사용자의 요청에 따라 접기/펼치기(숨김 토글) 버튼이 제공됩니다.
 */
export default function OnboardingDetails({ profile, company }) {
  const { t } = useI18n();
  // 정보 숨김/표시 토글 상태 (기본값: false 접힘 상태, 클릭 시 펼쳐짐)
  const [isOpen, setIsOpen] = useState(false);

  if (!profile) return null;

  const rows = answerRows(profile, company, t);
  const fields = rows.length === 0 ? fieldRows(profile, t) : [];
  if (rows.length === 0 && fields.length === 0) return null;

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
          <span>{isOpen ? '숨기기' : '펼치기'}</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </div>

      {/* 펼쳐졌을 때만 온보딩 상세 내용을 보여줍니다. */}
      {isOpen && (
        <>
          {rows.length > 0 ? (
            <div className="divide-y animate-in fade-in-50 duration-200">
              {rows.map((row) => (
                <div key={row.id} className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">{row.label}</p>
                  <p className="text-sm">{row.answer || t('ob.notProvided')}</p>
                  {row.details.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                      {row.details.map(([field, value]) => (
                        <span key={field} className="text-xs text-muted-foreground">
                          {field}: <span className="text-foreground">{value}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
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
    </div>
  );
}