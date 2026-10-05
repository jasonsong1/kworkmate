import React, { useState } from 'react';
import { Check, Download, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';

function formatDay(dateIso, lang) {
  return new Date(`${dateIso}T00:00:00Z`).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

// The dates a state publishes on its own each year are read from the official schedule and
// kept as drafts: they only earn the holiday rate once the employer applies them.
export default function RegionalHolidayImport({ state, companyId, suburbs, records, onChanged }) {
  const { t, lang } = useI18n();
  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1];
  const [year, setYear] = useState(String(thisYear));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const drafts = (records || []).filter((record) => record.status !== 'applied');
  const applied = (records || []).filter((record) => record.status === 'applied');
  const nameOf = (record) => (lang === 'ko' ? record.name_ko || record.name : record.name);

  const run = async () => {
    setBusy(true);
    setMessage('');
    try {
      const response = await base44.functions.invoke('importRegionalHolidays', {
        company_id: companyId,
        state,
        year: Number(year),
        region: (suburbs || []).filter(Boolean).slice(0, 3).join(', ')
      });
      const data = response.data || {};
      setMessage(
        data.imported > 0
          ? t('settings.holidayImported').replace('{count}', String(data.imported))
          : data.duplicates > 0
            ? t('settings.holidayUpToDate')
            : t('settings.holidayNoDates')
      );
      await onChanged();
    } catch (error) {
      setMessage(t('settings.holidayImportFailed'));
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

  const rows = [...drafts, ...applied];

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <p className="text-xs text-muted-foreground">{t('settings.holidayImportHint')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">{t('settings.holidayYear')}</Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="mt-1 h-8 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((item) => (
                <SelectItem key={item} value={String(item)}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={run} disabled={busy || !companyId}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {busy ? t('settings.holidayImporting') : t('settings.holidayImport')}
        </Button>
        {drafts.length > 1 ? (
          <Button size="sm" onClick={applyAll} disabled={busy}>
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
              {record.region && record.region !== 'statewide' ? (
                <span className="text-xs text-muted-foreground">{record.region}</span>
              ) : null}
              {record.source_url ? (
                <a
                  href={record.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t('settings.holidaySource')}
                </a>
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