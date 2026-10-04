import React from 'react';
import { Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { MODULE_LABELS, packageName } from '@/lib/packages';

export default function ModuleLocked({ module }) {
  const { t } = useI18n();
  const { pkg } = useWorkspace();

  return (
    <Card>
      <CardContent className="p-10 text-center">
        <Lock className="mx-auto h-5 w-5 text-muted-foreground" />
        <p className="mt-3 font-semibold">{t('pkg.notIncludedTitle')}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('pkg.notIncludedBody')}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          {t('pkg.module')}: {t(MODULE_LABELS[module] || '')} · {t('pkg.current')}: {packageName(pkg, t)}
        </p>
      </CardContent>
    </Card>
  );
}