import React from 'react';
import { Check, Clock, FileText, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { checklistFor } from '@/lib/onboardingDocs';

// What a hire has handed in and what is still missing, read from the employer's own list and the
// employee's record.
export default function OnboardingStatusList({ profile, company, onOpen, loadingUri }) {
  const { t, lang } = useI18n();
  const checklist = checklistFor(profile, company, lang);

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
        <p className="text-sm font-semibold">{t('ob.title')}</p>
        <span className="text-xs text-muted-foreground">
          {t('ob.progress').replace('{done}', String(checklist.requiredDone)).replace('{total}', String(checklist.requiredTotal))}
        </span>
      </div>
      <div className="divide-y">
        {checklist.items.map((item) => (
          <div key={item.key} className="flex items-center gap-3 px-4 py-2.5">
            {item.done ? (
              <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{item.label}</p>
              <p className="truncate text-xs text-muted-foreground">
                {item.required ? t('ob.required') : t('ob.optional')}
                {item.file && item.file.name ? ` · ${item.file.name}` : ''}
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
      </div>
    </div>
  );
}