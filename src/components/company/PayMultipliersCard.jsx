import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const pick = (key) =>
    saved[key] === undefined || saved[key] === '' ? DEFAULT_PAY_MULTIPLIERS[key] : saved[key];
  return {
    weekday: pick('weekday'),
    saturday: pick('saturday'),
    sunday: pick('sunday'),
    public_holiday: pick('public_holiday')
  };
}

// The penalties the store names itself. Each one carries the clock time it starts at, so a shift
// that begins at or after that time — or one that runs past midnight — earns it.
export function payPenalties(value) {
  const saved = value && Array.isArray(value.penalties) ? value.penalties : [];
  return saved
    .filter((row) => row && String(row.name || '').trim())
    .map((row) => ({
      name: String(row.name).trim(),
      multiplier: Number(row.multiplier) || 1,
      from_time: /^\d{1,2}:\d{2}$/.test(String(row.from_time || '')) ? String(row.from_time) : '22:00'
    }));
}

// The multiplier setting whole, the way it is stored: the day rates plus the named penalties.
export function paySettings(value) {
  const rates = payMultipliers(value);
  return {
    ...Object.fromEntries(Object.entries(rates).map(([key, rate]) => [key, Number(rate) || 1])),
    penalties: payPenalties(value)
  };
}

// The multipliers a payslip applies on top of the hourly rate. Nothing is calculated here:
// the numbers are stored so the payroll export can work out what each person earned.
export default function PayMultipliersCard({ value, onChange, disabled }) {
  const { t } = useI18n();
  const rates = payMultipliers(value);
  const penalties = value && Array.isArray(value.penalties) ? value.penalties : [];

  const emit = (nextRates, nextPenalties) => onChange({ ...nextRates, penalties: nextPenalties });

  const set = (key, next) => emit({ ...rates, [key]: next }, penalties);
  const setPenalty = (index, key, next) =>
    emit(
      rates,
      penalties.map((row, i) => (i === index ? { ...row, [key]: next } : row))
    );
  const addPenalty = () =>
    emit(rates, [...penalties, { name: '', multiplier: 1.25, from_time: '22:00' }]);
  const removePenalty = (index) => emit(rates, penalties.filter((row, i) => i !== index));

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

        {/* The penalties the store wants under its own names, added here rather than fixed. */}
        <div className="mt-6 space-y-3 border-t pt-5">
          <div>
            <Label>{t('settings.payPenaltiesTitle')}</Label>
            <p className="mt-1 text-xs text-muted-foreground">{t('settings.payPenaltiesHint')}</p>
          </div>

          {penalties.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('settings.payPenaltiesEmpty')}</p>
          ) : null}

          {penalties.map((row, index) => (
            <div key={index} className="grid items-end gap-3 sm:grid-cols-[1fr_7rem_8rem_auto]">
              <div>
                <Label className="text-xs">{t('settings.payPenaltyName')}</Label>
                <Input
                  value={row.name || ''}
                  placeholder={t('settings.payPenaltyNamePlaceholder')}
                  disabled={disabled}
                  onChange={(e) => setPenalty(index, 'name', e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">{t('settings.payPenaltyRate')}</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">×</span>
                  <Input
                    type="number"
                    min="1"
                    step="0.05"
                    value={row.multiplier ?? ''}
                    disabled={disabled}
                    onChange={(e) => setPenalty(index, 'multiplier', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">{t('settings.payPenaltyFrom')}</Label>
                <Input
                  type="time"
                  value={row.from_time || '22:00'}
                  disabled={disabled}
                  onChange={(e) => setPenalty(index, 'from_time', e.target.value)}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removePenalty(index)}
                disabled={disabled}
                aria-label={t('common.delete')}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addPenalty} disabled={disabled}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> {t('settings.payPenaltyAdd')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}