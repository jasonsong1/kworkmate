import React, { useState } from 'react';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

const EMPTY = { date: '', name: '', region: '', note: '', scope: 'regional' };

function formatDay(dateIso, lang) {
  return new Date(`${dateIso}T00:00:00Z`).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

// The dates a state publishes on its own each year are entered by hand and kept as drafts:
// they only earn the holiday rate once the employer applies them.
export default function RegionalHolidayEditor({ state, companyId, defaultRegion, records, onChanged }) {
  const { t, lang } = useI18n();
  const { me } = useWorkspace();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const drafts = (records || []).filter((record) => record.status !== 'applied');
  const applied = (records || []).filter((record) => record.status === 'applied');
  const rows = [...drafts, ...applied].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const nameOf = (record) => (lang === 'ko' ? record.name_ko || record.name : record.name);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const add = async () => {
    if (!form.date || !form.name.trim()) {
      setMessage(t('settings.holidayAddMissing'));
      return;
    }
    setBusy(true);
    try {
      await base44.entities.RegionalHoliday.create({
        company_id: companyId,
        state,
        year: Number(form.date.slice(0, 4)),
        date: form.date,
        name: form.name.trim(),
        region: form.region.trim() || defaultRegion || '',
        note: form.note.trim(),
        scope: form.scope,
        status: 'draft',
        imported_by_email: me ? me.email || '' : '',
        imported_at: new Date().toISOString()
      });
      setForm(EMPTY);
      setMessage(t('settings.holidayAdded'));
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const applyAll = async () => {
    setBusy(true);
    await base44.entities.RegionalHoliday.updateMany(
      { company_id: companyId, state, status: 'draft' },
      { $set: { status: 'applied', applied_at: new Date().toISOString() } }
    );
    await onChanged();
    setBusy(false);
  };

  const applyOne = async (record) => {
    setBusy(true);
    await base44.entities.RegionalHoliday.update(record.id, {
      status: 'applied',
      applied_at: new Date().toISOString()
    });
    await onChanged();
    setBusy(false);
  };

  const remove = async (record) => {
    setBusy(true);
    await base44.entities.RegionalHoliday.delete(record.id);
    await onChanged();
    setBusy(false);
  };

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <p className="text-xs text-muted-foreground">{t('settings.holidayAddHint')}</p>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">{t('settings.holidayDate')}</Label>
          <Input
            type="date"
            className="mt-1 h-8 w-40"
            value={form.date}
            onChange={(event) => set('date', event.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">{t('settings.holidayName')}</Label>
          <Input
            className="mt-1 h-8 w-56"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">{t('settings.holidayRegion')}</Label>
          <Input
            className="mt-1 h-8 w-40"
            placeholder={defaultRegion || ''}
            value={form.region}
            onChange={(event) => set('region', event.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">{t('settings.holidayScope')}</Label>
          <Select value={form.scope} onValueChange={(value) => set('scope', value)}>
            <SelectTrigger className="mt-1 h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="statewide">{t('settings.holidayScopeStatewide')}</SelectItem>
              <SelectItem value="regional">{t('settings.holidayScopeRegional')}</SelectItem>
              <SelectItem value="one_off">{t('settings.holidayScopeOneOff')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t('settings.holidayNote')}</Label>
          <Input
            className="mt-1 h-8 w-56"
            value={form.note}
            onChange={(event) => set('note', event.target.value)}
          />
        </div>
        <Button size="sm" onClick={add} disabled={busy || !companyId}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          {t('settings.holidayAdd')}
        </Button>
        {drafts.length > 1 ? (
          <Button size="sm" variant="secondary" onClick={applyAll} disabled={busy}>
            <Check className="mr-2 h-4 w-4" /> {t('settings.holidayApplyAll')}
          </Button>
        ) : null}
      </div>

      {message ? <p className="text-xs text-primary">{message}</p> : null}

      {rows.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {drafts.length > 0 ? t('settings.holidayReview') : t('settings.holidayAppliedList')}
          </p>
          {rows.map((record) => (
            <div key={record.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-28 shrink-0 text-muted-foreground">{formatDay(record.date, lang)}</span>
              <span className="font-medium">{nameOf(record)}</span>
              {record.note ? <span className="text-xs text-muted-foreground">{record.note}</span> : null}
              {record.region && record.region !== 'statewide' ? (
                <span className="text-xs text-muted-foreground">{record.region}</span>
              ) : null}
              <span className="ml-auto flex items-center gap-1">
                {record.status === 'applied' ? (
                  <span className="rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                    {t('settings.holidayApplied')}
                  </span>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => applyOne(record)} disabled={busy}>
                    <Check className="mr-1 h-3.5 w-3.5" /> {t('settings.holidayApply')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => remove(record)} disabled={busy}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}