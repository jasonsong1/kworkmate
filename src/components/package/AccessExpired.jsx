import React from 'react';
import { Lock } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { packageName } from '@/lib/packages';

export default function AccessExpired() {
  const { t } = useI18n();
  const { pkg, company } = useWorkspace();

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <h2 className="mt-5 text-lg font-semibold">{t('pkg.expiredTitle')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('pkg.expiredBody')}</p>
      {company ? <p className="mt-1 text-sm font-medium">{company.name}</p> : null}
      <p className="mt-4 text-xs text-muted-foreground">
        {packageName(pkg, t)} · {t('pkg.startDate')} {pkg?.start_date || '—'} · {t('pkg.expiresAt')}{' '}
        {pkg?.expires_at || '—'}
      </p>
      <p className="mt-6 text-xs text-muted-foreground">{t('pkg.expiredHint')}</p>
    </div>
  );
}