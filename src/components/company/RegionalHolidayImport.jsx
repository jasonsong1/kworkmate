import React, { useState } from 'react';
import { Check, Download, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { holidayKeyFor } from '@/lib/holidays';
import { useWorkspace } from '@/lib/WorkspaceContext';
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
  const { me } = useWorkspace();
  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1];
  const [year, setYear] = useState(String(thisYear));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [unavailable, setUnavailable] = useState([]);

  const drafts = (records || []).filter((record) => record.status !== 'applied');
  const applied = (records || []).filter((record) => record.status === 'applied');
  const nameOf = (record) => (lang === 'ko' ? record.name_ko || record.name : record.name);

  // The official dates arrive ready to review and are saved as drafts, so a re-import only
  // adds what is not on the list yet.
  const run = async () => {
    setBusy(true);
    setMessage('');
    setUnavailable([]);
    try {
      const response = await base44.functions.invoke('importRegionalHolidays', {
        company_id: companyId,
        state,
        year: Number(year),
        region: (suburbs || []).filter(Boolean).slice(0, 3).join(', ')
      });
      const data = response.data || {};
      const known = new Set((records || []).map((record) => String(record.date).slice(0, 10)));
      // Dates the state calendar already works out itself are left out, so only the extra
      // official dates end up on the list.
      const fresh = (data.holidays || []).filter((item) => {
        const day = String(item.date).slice(0, 10);
        return !known.has(day) && !holidayKeyFor(day, state);
      });

      if (fresh.length > 0) {
        const stamp = new Date().toISOString();
        await base44.entities.RegionalHoliday.bulkCreate(
          fresh.map((item) => ({
            ...item,
            company_id: companyId,
            state,
            year: Number(data.year) || Number(year),
            status: 'draft',
            imported_by_email: me ? me.email || '' : '',
            imported_at: stamp
          }))
        );
      }

      setUnavailable(data.unavailable || []);
      setMessage(
        fresh.length > 0
          ? t('settings.holidayImported').replace('{count}', String(fresh.length))
          : (data.holidays || []).length > 0
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
      {unavailable.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('settings.holidayUnavailable')}{' '}
          {unavailable.map((item) => (item.region ? `${item.region}: ${item.reason}` : item.reason)).join(' · ')}
        </p>
      ) : null}

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