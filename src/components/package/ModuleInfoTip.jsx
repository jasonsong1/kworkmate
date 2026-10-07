import React from 'react';
import { Check, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';
import { MODULE_LABELS } from '@/lib/packages';

// What the company's package actually includes: the modules the server resolved for it.
export default function ModuleInfoTip({ modules }) {
  const { t } = useI18n();
  const list = modules || [];

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t('pkg.modulesTip')}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="text-xs font-semibold">{t('pkg.modulesTip')}</p>
          <ul className="mt-1.5 space-y-1">
            {list.map((module) => (
              <li key={module} className="flex items-center gap-1.5 text-xs">
                <Check className="h-3 w-3 shrink-0" />
                {t(MODULE_LABELS[module] || module)}
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}