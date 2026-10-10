import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n';

// The penalties a store names itself: a name, the multiplier it pays and the clock time it starts
// at. One editor stands behind both lists — the company's own and a branch's — so the two can
// never drift apart.
export default function PayPenaltiesEditor({ value, onChange, disabled }) {
  const { t } = useI18n();
  const penalties = Array.isArray(value) ? value : [];

  const setPenalty = (index, key, next) =>
    onChange(penalties.map((row, i) => (i === index ? { ...row, [key]: next } : row)));
  const addPenalty = () => onChange([...penalties, { name: '', multiplier: 1.25, from_time: '22:00' }]);
  const removePenalty = (index) => onChange(penalties.filter((row, i) => i !== index));

  return (
    <div className="space-y-3">
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
  );
}