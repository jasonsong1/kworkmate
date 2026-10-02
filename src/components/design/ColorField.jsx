import React from 'react';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';

const PRESETS = ['#4338ca', '#dc2626', '#ea580c', '#16a34a', '#0891b2', '#1e293b'];

export default function ColorField({ value, onChange }) {
  const { t } = useI18n();
  const current = value || '#4338ca';

  return (
    <div>
      <p className="text-sm font-medium">{t('jobdesign.color')}</p>
      <p className="mb-3 text-xs text-muted-foreground">{t('jobdesign.colorHint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            style={{ backgroundColor: color }}
            className={`h-9 w-9 rounded-full border-2 transition-transform hover:scale-105 ${
              current.toLowerCase() === color ? 'border-foreground' : 'border-transparent'
            }`}
            aria-label={color}
          />
        ))}
        <Input
          value={current}
          onChange={(e) => onChange(e.target.value)}
          className="w-32 font-mono text-sm"
        />
      </div>
    </div>
  );
}