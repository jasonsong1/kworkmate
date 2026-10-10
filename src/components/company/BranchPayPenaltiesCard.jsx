import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import PayPenaltiesEditor from '@/components/company/PayPenaltiesEditor';

// The penalties one branch pays under its own names. A store manager sets these for the store they
// run, and the payroll report uses them in place of the company list.
export default function BranchPayPenaltiesCard({ value, onChange, disabled }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('property.payPenalties')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('property.payPenaltiesHint')}</p>
      </CardHeader>
      <CardContent>
        <PayPenaltiesEditor value={value} onChange={onChange} disabled={disabled} />
      </CardContent>
    </Card>
  );
}