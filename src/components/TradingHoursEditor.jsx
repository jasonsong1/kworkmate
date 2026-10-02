import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';

const DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DAY_ALIASES = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun'
};

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, '0');
  const minute = index % 2 === 0 ? '00' : '30';
  return `${hour}:${minute}`;
});

function normalizeDay(value) {
  const raw = String(value || '').trim();
  return DAY_ALIASES[raw] || raw;
}

function rowKey(row) {
  return `${row.days} ${row.open}-${row.close}`;
}

export function parseTradingHours(value) {
  return String(value || '')
    .split('·')
    .map((part) => part.trim())
    .map((part) => {
      const match = part.match(/^(.+?)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
      return match ? { days: normalizeDay(match[1]), open: match[2], close: match[3] } : null;
    })
    .filter(Boolean);
}

export function serializeTradingHours(rows) {
  return rows.map((row) => rowKey(row)).join(' · ');
}

export function duplicateTradingHours(value) {
  const rows = parseTradingHours(value);
  const seen = new Set();
  return rows.some((row) => {
    const key = rowKey(row);
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

export default function TradingHoursEditor({ value, onChange }) {
  const { t } = useI18n();
  const parsed = parseTradingHours(value);
  const rows = parsed.length > 0 ? parsed : [{ days: 'Mon', open: '09:00', close: '22:00' }];

  const seen = new Set();
  const duplicated = new Set();
  rows.forEach((row) => {
    const key = rowKey(row);
    if (seen.has(key)) duplicated.add(key);
    seen.add(key);
  });

  const commit = (next) => onChange(serializeTradingHours(next));

  const update = (index, patch) => {
    commit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    const used = new Set(rows.map((row) => row.days));
    const free = DAY_OPTIONS.find((day) => !used.has(day)) || 'Mon';
    commit([...rows, { days: free, open: '09:00', close: '17:00' }]);
  };

  const removeRow = (index) => commit(rows.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        const dup = duplicated.has(rowKey(row));
        return (
          <div key={index} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Select value={row.days} onValueChange={(v) => update(index, { days: v })}>
              <SelectTrigger className={dup ? 'border-destructive' : ''}>
                <SelectValue placeholder={t('property.day')} />
              </SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map((day) => (
                  <SelectItem key={day} value={day}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={row.open} onValueChange={(v) => update(index, { open: v })}>
              <SelectTrigger className={dup ? 'border-destructive' : ''}>
                <SelectValue placeholder={t('property.open')} />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={row.close} onValueChange={(v) => update(index, { close: v })}>
              <SelectTrigger className={dup ? 'border-destructive' : ''}>
                <SelectValue placeholder={t('property.close')} />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map((time) => (
                  <SelectItem key={time} value={time}>
                    {time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeRow(index)}
              disabled={rows.length === 1}
              title={t('property.removeHours')}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        );
      })}

      {duplicated.size > 0 && <p className="text-xs text-destructive">{t('property.dupHours')}</p>}

      <Button variant="outline" size="sm" onClick={addRow}>
        <Plus className="mr-1 h-3.5 w-3.5" /> {t('property.addHours')}
      </Button>
    </div>
  );
}