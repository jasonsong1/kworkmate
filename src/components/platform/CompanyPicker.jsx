import React from 'react';
import { Building2 } from 'lucide-react';
import CompanySwitcher from '@/components/company/CompanySwitcher';
import { useI18n } from '@/lib/i18n';

// Shown to a super admin who is not attached to a company yet, so they can enter one
// instead of being pushed through company setup.
export default function CompanyPicker() {
  const { t } = useI18n();

  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Building2 className="h-6 w-6" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight">{t('platform.pickCompany')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('platform.pickCompanyHint')}</p>
      <div className="mt-6 flex justify-center">
        <CompanySwitcher />
      </div>
    </div>
  );
}