import React from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/i18n';
import { EMPLOYMENT_KEYS } from '@/lib/leave';

const EMPLOYMENTS = ['full_time', 'part_time', 'casual'];
const ANNUAL_RATE = '0.076923';
const PERSONAL_RATE = '0.038462';

// One leave type in the settings: what it is called, how it is earned, who it is for, and
// whether it is handed out in one go at the start of a period.
export default function LeaveTypeCard({ type, onChange, onRemove }) {
  const { t } = useI18n();
  const patch = (values) => onChange({ ...type, ...values });
  const toggleEmployment = (field, value) => {
    const list = Array.isArray(type[field]) ? type[field] : [];
    patch({ [field]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value] });
  };

  const chip = (active) =>
    `rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
      active ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
    }`;

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-16">
          <Label className="mb-1 block text-xs">{t('leave.emoji')}</Label>
          <Input value={type.emoji || ''} onChange={(event) => patch({ emoji: event.target.value })} className="text-center" />
        </div>
        <div className="min-w-40 flex-1">
          <Label className="mb-1 block text-xs">{t('leave.name')}</Label>
          <Input value={type.name || ''} onChange={(event) => patch({ name: event.target.value })} />
        </div>
        <div className="min-w-40 flex-1">
          <Label className="mb-1 block text-xs">{t('leave.nameKo')}</Label>
          <Input value={type.name_ko || ''} onChange={(event) => patch({ name_ko: event.target.value })} />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs">{t('leave.active')}</Label>
          <Switch checked={type.active !== false} onCheckedChange={(value) => patch({ active: value })} />
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-2">
          <Switch checked={type.paid !== false} onCheckedChange={(value) => patch({ paid: value })} />
          <Label className="text-xs">{t('leave.paid')}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={type.requires_certificate === true}
            onCheckedChange={(value) => patch({ requires_certificate: value })}
          />
          <Label className="text-xs">{t('leave.requiresCertificate')}</Label>
        </div>
        <div>
          <Label className="mb-1 block text-xs">{t('leave.accrual')}</Label>
          <Select
            value={type.accrual_method === 'ordinary_hours' ? 'ordinary_hours' : 'none'}
            onValueChange={(value) =>
              patch({ accrual_method: value, accrual_rate: value === 'none' ? 0 : Number(ANNUAL_RATE) })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ordinary_hours">{t('leave.accrualHours')}</SelectItem>
              <SelectItem value="none">{t('leave.accrualNone')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {type.accrual_method === 'ordinary_hours' ? (
          <div className="sm:col-span-2">
            <Label className="mb-1 block text-xs">{t('leave.accrualRate')}</Label>
            <Select value={String(type.accrual_rate)} onValueChange={(value) => patch({ accrual_rate: Number(value) })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANNUAL_RATE}>{t('leave.rateAnnual')}</SelectItem>
                <SelectItem value={PERSONAL_RATE}>{t('leave.ratePersonal')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {/* From this many hours held, this leave is flagged in red: it follows the balance. */}
        <div>
          <Label className="mb-1 block text-xs">{t('leave.flagHours')}</Label>
          <Input
            type="number"
            min="0"
            step="1"
            value={type.flag_hours ?? 0}
            onChange={(event) => patch({ flag_hours: Number(event.target.value) || 0 })}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">{t('leave.flagHoursHint')}</p>
        </div>
        <div className="sm:col-span-2">
          <Label className="mb-1 block text-xs">{t('leave.eligibleFor')}</Label>
          <div className="flex flex-wrap gap-1.5">
            {EMPLOYMENTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleEmployment('employment_types', value)}
                className={chip((type.employment_types || []).includes(value))}
              >
                {t(EMPLOYMENT_KEYS[value])}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-lg bg-muted/40 p-3">
        <div className="flex items-center gap-2">
          <Switch checked={type.grant_enabled === true} onCheckedChange={(value) => patch({ grant_enabled: value })} />
          <Label className="text-xs">{t('leave.allowance')}</Label>
        </div>
        {type.grant_enabled ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label className="mb-1 block text-xs">{t('leave.grantHours')}</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={type.grant_hours ?? ''}
                onChange={(event) => patch({ grant_hours: Number(event.target.value) || 0 })}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">{t('leave.grantPeriod')}</Label>
              <Select value={type.grant_period || 'yearly'} onValueChange={(value) => patch({ grant_period: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yearly">{t('leave.periodYearly')}</SelectItem>
                  <SelectItem value="monthly">{t('leave.periodMonthly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">{t('leave.grantAnchor')}</Label>
              <Select value={type.grant_anchor || 'calendar_year'} onValueChange={(value) => patch({ grant_anchor: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="calendar_year">{t('leave.anchorCalendar')}</SelectItem>
                  <SelectItem value="anniversary">{t('leave.anchorAnniversary')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-xs">{t('leave.eligibleFor')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {EMPLOYMENTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleEmployment('grant_employment_types', value)}
                    className={chip((type.grant_employment_types || []).includes(value))}
                  >
                    {t(EMPLOYMENT_KEYS[value])}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={type.expiry_enabled === true}
              onCheckedChange={(value) => patch({ expiry_enabled: value })}
            />
            <Label className="text-xs">{t('leave.expiry')}</Label>
          </div>
          {type.expiry_enabled ? (
            <div className="w-40">
              <Label className="mb-1 block text-xs">{t('leave.expiryMonths')}</Label>
              <Input
                type="number"
                min="1"
                max="24"
                value={type.expiry_months ?? 12}
                onChange={(event) => patch({ expiry_months: Number(event.target.value) || 12 })}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}