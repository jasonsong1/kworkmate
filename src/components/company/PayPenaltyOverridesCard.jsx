import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { payMultipliers } from '@/components/company/PayMultipliersCard';
import { base44 } from '@/api/base44Client';

const FIELDS = [
  { key: 'weekday', label: 'settings.payWeekday' },
  { key: 'saturday', label: 'settings.paySaturday' },
  { key: 'sunday', label: 'settings.paySunday' },
  { key: 'public_holiday', label: 'settings.payHoliday' },
  { key: 'overnight', label: 'settings.payOvernight' }
];

// A person the store pays differently gets a row of their own: these rates stand in for the
// company's rates for that employee only, everywhere the penalties are applied.
export default function PayPenaltyOverridesCard({ value, onChange, baseRates, disabled }) {
  const { t } = useI18n();
  const { company } = useWorkspace();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const overrides = Array.isArray(value) ? value : [];
  const taken = overrides.map((row) => row.email);

  useEffect(() => {
    if (!company) return undefined;
    let cancelled = false;
    setLoading(true);
    base44.entities.EmployeeProfile
      .filter(
        { company_id: company.id, status: 'active' },
        { sort: 'full_name', limit: 500, fields: ['user_email', 'full_name'] }
      )
      .then((page) => {
        if (!cancelled) setStaff(page.items || []);
      })
      .catch(() => {
        if (!cancelled) setStaff([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [company]);

  const add = () => {
    const person = staff.find((row) => row.user_email && !taken.includes(row.user_email));
    if (!person) return;
    onChange([
      ...overrides,
      { email: person.user_email, name: person.full_name || '', rates: payMultipliers(baseRates) }
    ]);
  };

  const remove = (email) => onChange(overrides.filter((row) => row.email !== email));

  const pickPerson = (from, to) => {
    const person = staff.find((row) => row.user_email === to);
    onChange(
      overrides.map((row) =>
        row.email === from ? { ...row, email: to, name: (person && person.full_name) || '' } : row
      )
    );
  };

  const setRate = (email, key, next) =>
    onChange(
      overrides.map((row) =>
        row.email === email ? { ...row, rates: { ...(row.rates || {}), [key]: next } } : row
      )
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('settings.payOverridesTitle')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('settings.payOverridesHint')}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </p>
        ) : (
          <>
            {overrides.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('settings.payOverridesEmpty')}</p>
            ) : null}

            {overrides.map((row) => {
              const rates = row.rates || {};
              return (
                <div key={row.email} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Select value={row.email} onValueChange={(next) => pickPerson(row.email, next)} disabled={disabled}>
                      <SelectTrigger className="w-full sm:w-64">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {staff
                          .filter((person) => person.user_email === row.email || !taken.includes(person.user_email))
                          .map((person) => (
                            <SelectItem key={person.id} value={person.user_email}>
                              {person.full_name || person.user_email}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="sm" onClick={() => remove(row.email)} disabled={disabled}>
                      <Trash2 className="mr-1.5 h-3.5 w-3.5 text-destructive" /> {t('common.delete')}
                    </Button>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {FIELDS.map((field) => (
                      <div key={field.key}>
                        <Label className="text-xs">{t(field.label)}</Label>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">×</span>
                          <Input
                            type="number"
                            min="1"
                            step="0.05"
                            value={rates[field.key] ?? ''}
                            disabled={disabled}
                            onChange={(event) => setRate(row.email, field.key, event.target.value)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <Button
              variant="outline"
              size="sm"
              onClick={add}
              disabled={disabled || staff.length === 0 || overrides.length >= staff.length}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> {t('settings.payOverridesAdd')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}