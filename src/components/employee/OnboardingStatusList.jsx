import React from 'react';
import { Check, Clock, FileCheck, FileText, Loader2, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { checklistFor } from '@/lib/onboardingDocs';

// What a hire has handed in and what is still missing, read from the employer's own list and the
// employee's record. Consolidates all onboarding files and any extra documents into a single view.
export default function OnboardingStatusList({ profile, company, onOpen, loadingUri, onRemove, canDelete = false }) {
  const { t, lang } = useI18n();
  const checklist = checklistFor(profile, company, lang);

  // 체크리스트에 이미 매핑된 파일의 file_uri 목록 수집
  const usedUris = new Set(
    (checklist.items || [])
      .map((item) => item.file && (item.file.file_uri || item.file.url))
      .filter(Boolean)
  );

  // 온보딩 기본 체크리스트에 포함되지 않는 순수 추가 제출 서류들 (resume 제외)
  const allDocs = Array.isArray(profile && profile.docs) ? profile.docs : [];
  const extraDocs = allDocs.filter((doc) => {
    if (!doc || !doc.file_uri) return false;
    const uri = doc.file_uri || doc.url;
    if (usedUris.has(uri)) return false;
    // 이력서 등 온보딩 외 파일 제외
    if (doc.type === 'resume') return false;
    return true;
  });

  return (
    <div className="w-full rounded-lg border">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <p className="text-sm font-semibold">{t('ob.title')}</p>
        <span className="text-xs text-muted-foreground">
          {t('ob.progress')
            .replace('{done}', String(checklist.requiredDone))
            .replace('{total}', String(checklist.requiredTotal))}
        </span>
      </div>

      <div className="divide-y">
        {/* 1. 회사 설정 및 기본 온보딩 체크리스트 서류들 */}
        {checklist.items.map((item) => (
          <div key={item.key} className="flex items-center gap-3 px-4 py-2.5">
            {item.done ? (
              <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium break-words">{item.label}</p>
              <p className="text-xs text-muted-foreground break-all">
                <span>{item.required ? t('ob.required') : t('ob.optional')}</span>
                {item.file && item.file.name ? (
                  <span className="text-slate-600 dark:text-slate-300 font-mono text-[11px] block sm:inline sm:before:content-['·_']">
                    {item.file.name}
                  </span>
                ) : ''}
              </p>
            </div>
            {item.done ? (
              <Badge className="shrink-0 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                {t('ob.submitted')}
              </Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0">
                {t('ob.waiting')}
              </Badge>
            )}
            {item.file && item.file.file_uri && (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={loadingUri === item.file.file_uri}
                onClick={() => onOpen(item.file)}
              >
                {loadingUri === item.file.file_uri ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    {t('ob.open')}
                  </>
                )}
              </Button>
            )}
          </div>
        ))}

        {/* 2. 체크리스트 외에 추가로 제출된 서류가 있다면 같은 테이블 아래에 단일 리스트로 표시 */}
        {extraDocs.map((doc, idx) => (
          <div key={`${doc.file_uri}-${idx}`} className="flex items-center gap-3 px-4 py-2.5 bg-slate-50/50">
            <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium break-words">{doc.name || 'Additional Document'}</p>
              <p className="text-xs text-muted-foreground">
                <span className="text-slate-500 font-medium">추가 제출 서류</span>
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {t('ob.submitted')}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={loadingUri === doc.file_uri}
              onClick={() => onOpen(doc)}
            >
              {loadingUri === doc.file_uri ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  {t('ob.open')}
                </>
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}