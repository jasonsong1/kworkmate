import React from 'react';
import { useI18n } from '@/lib/i18n';
import { fieldVisibilityOf } from '@/lib/onboardingDocs';

// The personal details a hire handed in, shown only where the employer still asks for them.
export default function OnboardingDetails({ profile, company }) {
  const { t } = useI18n();
  const visible = fieldVisibilityOf(company);
  const rows = [];
  if (visible.address) rows.push([t('ob.field.address'), profile.address]);
  if (visible.date_of_birth) rows.push([t('ob.field.date_of_birth'), profile.date_of_birth]);
  if (visible.emergency_contact) {
    rows.push([t('ob.emergencyName'), profile.emergency_contact_name]);
    rows.push([t('ob.emergencyPhone'), profile.emergency_contact_phone]);
  }
  if (visible.tax) {
    rows.push([
      t('ob.tfn'),
      profile.tfn_pending ? t('ob.tfnPending') : profile.tfn_number
    ]);
  }
  if (visible.super) {
    rows.push([
      t('ob.superChoice'),
      profile.super_choice === 'custom_fund'
        ? t('ob.superCustom')
        : profile.super_choice
          ? t('ob.superDefault')
          : ''
    ]);
    if (profile.super_fund_name) rows.push([t('ob.superFund'), profile.super_fund_name]);
    if (profile.super_usi) rows.push([t('ob.superUsi'), profile.super_usi]);
    if (profile.super_member_number) rows.push([t('ob.superMember'), profile.super_member_number]);
  }
  if (visible.bank) {
    rows.push([t('ob.bankBsb'), profile.bank_bsb]);
    rows.push([t('ob.bankAccount'), profile.bank_account_number]);
    rows.push([t('ob.bankHolder'), profile.bank_account_name]);
  }
  if (!profile || rows.length === 0) return null;

  return (
    <div className="rounded-lg border">
      <p className="border-b px-4 py-2.5 text-sm font-semibold">{t('ob.profileTitle')}</p>
      <div className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
        {rows.map(([label, value], index) => (
          <div key={`${label}-${index}`}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-sm">{String(value || '').trim() ? value : t('ob.notProvided')}</p>
          </div>
        ))}
      </div>
    </div>
  );
}