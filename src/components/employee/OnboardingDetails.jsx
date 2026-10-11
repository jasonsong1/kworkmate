import React from 'react';
import { useI18n } from '@/lib/i18n';
import { answerRows, fieldRows } from '@/lib/onboardingDocs';

// What a hire handed in, read from the employer's own onboarding questions and the answers given
// on the onboarding form: the bank, tax and super details they typed in appear here. A question the
// employer keeps out of the vault is not shown. A company that asks no questions of its own falls
// back to the details kept on the record itself.
export default function OnboardingDetails({ profile, company }) {
  const { t } = useI18n();
  if (!profile) return null;

  const rows = answerRows(profile, company, t);
  const fields = rows.length === 0 ? fieldRows(profile, t) : [];
  if (rows.length === 0 && fields.length === 0) return null;

  return (
    <div className="w-full rounded-lg border">
      <p className="border-b px-4 py-2.5 text-sm font-semibold">{t('ob.profileTitle')}</p>
      {rows.length > 0 ? (
        <div className="divide-y">
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
        <div className="grid gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
          {fields.map(([label, value], index) => (
            <div key={`${label}-${index}`}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm">{String(value || '').trim() ? value : t('ob.notProvided')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}