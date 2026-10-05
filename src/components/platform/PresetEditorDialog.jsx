import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';
import {
  CONFIGURABLE_MODULES,
  clampAccess,
  isScoped,
  levelLabelKey,
  moduleLabelKey,
  moduleLevelOptions,
  normalizeAccess,
  normalizeCell,
  scopeLabelKey,
  scopeOptions
} from '@/lib/access';

// A super admin edits the ceiling itself: what a position may see and how far inside the data
// it may go, before any employer narrows it. Editing a preset reaches every company whose
// roles are linked to it, so the impact is shown before saving.
export default function PresetEditorDialog({ open, preset, onClose, onSaved }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [form, setForm] = useState({ key: '', label: '', order: 10 });
  const [access, setAccess] = useState({});
  const [impact, setImpact] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !preset) return;
    setForm({
      key: preset.key || '',
      label: preset.label || preset.label_en || preset.label_ko || '',
      order: preset.order || 10
    });
    setAccess(clampAccess(normalizeAccess(preset.access || {})));
    setImpact(null);
    if (!preset.key) return;
    base44.functions
      .invoke('managePreset', { action: 'usage', key: preset.key })
      .then((response) => setImpact(response.data || null))
      .catch(() => setImpact(null));
  }, [open, preset]);

  if (!open || !preset) return null;

  const setCell = (module, next) => {
    const nextAccess = { ...access };
    if (next.level === 'none') delete nextAccess[module];
    else nextAccess[module] = next;
    setAccess(nextAccess);
  };

  const save = async () => {
    setSaving(true);
    const response = await base44.functions
      .invoke('managePreset', { action: 'save', ...form, access })
      .catch(() => null);
    setSaving(false);
    if (!response || !response.data || response.data.error) {
      toast({ title: (response && response.data && response.data.error) || t('preset.failed'), variant: 'destructive' });
      return;
    }
    toast({ title: t('preset.saved') });
    if (onSaved) await onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{preset.key ? t('preset.edit') : t('preset.new')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{t('preset.accessName')}</Label>
            <Input
              value={form.label}
              onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t('preset.key')}</Label>
            <Input
              value={form.key}
              disabled={Boolean(preset.key)}
              onChange={(e) => setForm((prev) => ({ ...prev, key: e.target.value }))}
            />
          </div>
        </div>

        {impact && impact.companies > 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            {t('preset.impact')
              .replace('{companies}', String(impact.companies))
              .replace('{roles}', String(impact.roles))}
          </p>
        )}

        <p className="text-xs text-muted-foreground">{t('perm.dashboardNote')}</p>

        <div className="max-h-[50vh] overflow-y-auto rounded-xl border">
          <div className="divide-y">
            {CONFIGURABLE_MODULES.map((module) => {
              const cell = normalizeCell(access[module]);
              const level = cell.level;
              const scope = cell.scope || 'branch';
              return (
                <div key={module} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="min-w-[8rem] flex-1 text-sm">{t(moduleLabelKey(module))}</span>
                  <Select
                    value={level || 'none'}
                    onValueChange={(next) =>
                      setCell(module, { level: next, scope })
                    }
                  >
                    <SelectTrigger className="h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {moduleLevelOptions(module, 'write').map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(levelLabelKey(option))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {isScoped(module) && level && level !== 'none' && (
                    <Select value={scope} onValueChange={(next) => setCell(module, { level, scope: next })}>
                      <SelectTrigger className="h-8 w-36 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {scopeOptions('company').map((option) => (
                          <SelectItem key={option} value={option}>
                            {t(scopeLabelKey(option))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={saving || !form.key.trim() || !form.label.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}