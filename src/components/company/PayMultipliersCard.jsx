import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';

export const DEFAULT_PAY_MULTIPLIERS = {
  weekday: 1,
  saturday: 1.25,
  sunday: 1.5,
  public_holiday: 2
};

export function payMultipliers(value) {
  const saved = value || {};
  return {
    weekday: saved.weekday === undefined || saved.weekday === '' ? DEFAULT_PAY_MULTIPLIERS.weekday : saved.weekday,
    saturday: saved.saturday === undefined || saved.saturday === '' ? DEFAULT_PAY_MULTIPLIERS.saturday : saved.saturday,
    sunday: saved.sunday === undefined || saved.sunday === '' ? DEFAULT_PAY_MULTIPLIERS.sunday : saved.sunday,
    public_holiday:
      saved.public_holiday === undefined || saved.public_holiday === ''
        ? DEFAULT_PAY_MULTIPLIERS.public_holiday
        : saved.public_holiday
  };
}

// The multipliers a payslip applies on top of the hourly rate. Nothing is calculated here:
// the numbers are stored so the payroll export can work out what each person earned.
export default function PayMultipliersCard({ value, onChange, disabled }) {
  const { t } = useI18n();
  const rates = payMultipliers(value);

  const set = (key, next) => onChange({ ...rates, [key]: next });

  const FIELDS = [
    { key: 'weekday', label: t('settings.payWeekday') },
    { key: 'saturday', label: t('settings.paySaturday') },
    { key: 'sunday', label: t('settings.paySunday') },
    { key: 'public_holiday', label: t('settings.payHoliday') }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('settings.payTitle')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('settings.payHint')}</p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FIELDS.map((field) => (
            <div key={field.key}>
              <Label>{field.label}</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">×</span>
                <Input
                  type="number"
                  min="1"
                  step="0.05"
                  value={rates[field.key]}
                  disabled={disabled}
                  onChange={(e) => set(field.key, e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{t('settings.payDayHint')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('settings.payExample')}</p>
      </CardContent>
    </Card>
  );
}