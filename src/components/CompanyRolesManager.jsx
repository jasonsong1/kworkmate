import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { grantedModules, levelLabelKey, moduleLabelKey } from '@/lib/access';

const FIXED_ROLES = ['company_admin', 'branch_manager'];

// The employer's own job titles. Every title is linked to one platform position preset — that
// link is the ceiling its permissions are later narrowed inside — and the link can be looked
// at and changed at any time.
export default function CompanyRolesManager({ value, onChange, presets = [], disabled }) {
  const { t, lang } = useI18n();
  const [label, setLabel] = useState('');
  const [presetKey, setPresetKey] = useState('');
  const [selected, setSelected] = useState('');
  const roles = value || [];

  const presetName = (key) => {
    const preset = presets.find((item) => item.key === key);
    if (!preset) return key;
    return (lang === 'ko' ? preset.label_ko || preset.label_en : preset.label_en || preset.label_ko) || key;
  };

  const addRole = () => {
    const name = label.trim();
    if (!name || !presetKey) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const key =
      slug && !FIXED_ROLES.includes(slug) && !roles.some((role) => role.key === slug)
        ? slug
        : `role_${Date.now().toString(36)}`;
    onChange([...roles, { key, label: name, preset_key: presetKey }]);
    setLabel('');
    setPresetKey('');
    setSelected(key);
  };

  const linkPreset = (roleKey, nextPreset) => {
    onChange(roles.map((role) => (role.key === roleKey ? { ...role, preset_key: nextPreset } : role)));
  };

  const active = roles.find((role) => role.key === selected) || null;
  const activePreset = active ? presets.find((preset) => preset.key === active.preset_key) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {roles.map((role) => (
          <button
            key={role.key}
            type="button"
            onClick={() => setSelected(selected === role.key ? '' : role.key)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
              selected === role.key
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-primary/40 bg-primary/5 hover:bg-primary/10'
            }`}
          >
            {role.label}
            <span className="text-[10px] font-normal text-muted-foreground">
              · {presetName(role.preset_key) || t('role.noPreset')}
            </span>
            {!disabled && (
              <span
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(roles.filter((item) => item.key !== role.key));
                }}
                onKeyDown={() => {}}
                className="ml-0.5 text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </button>
        ))}
        {roles.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('role.noneHint')}</p>
        )}
      </div>

      {active && (
        <div className="rounded-xl border bg-muted/30 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{active.label}</p>
              <p className="text-xs text-muted-foreground">
                {t('role.linkedPreset')}: <span className="text-foreground">{presetName(active.preset_key)}</span>
              </p>
            </div>
            {!disabled && (
              <div className="w-full sm:w-56">
                <Label className="mb-1 block text-xs">{t('role.changePreset')}</Label>
                <Select value={active.preset_key || ''} onValueChange={(next) => linkPreset(active.key, next)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={t('role.pickPreset')} />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((preset) => (
                      <SelectItem key={preset.key} value={preset.key}>
                        {presetName(preset.key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {activePreset && grantedModules(activePreset.access).length > 0 ? (
              grantedModules(activePreset.access).map((module) => (
                <Badge key={module} variant="secondary" className="font-normal">
                  {t(moduleLabelKey(module))} · {t(levelLabelKey(activePreset.access[module].level))}
                </Badge>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">{t('perm.noModules')}</p>
            )}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">{t('role.linkedHint')}</p>
        </div>
      )}

      {!disabled && (
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="mb-1 block text-xs">{t('role.name')}</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addRole();
                }
              }}
              placeholder={t('role.newPlaceholder')}
              className="w-52"
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">{t('role.preset')}</Label>
            <Select value={presetKey} onValueChange={setPresetKey}>
              <SelectTrigger className="h-9 w-52 text-sm">
                <SelectValue placeholder={t('role.pickPreset')} />
              </SelectTrigger>
              <SelectContent>
                {presets.map((preset) => (
                  <SelectItem key={preset.key} value={preset.key}>
                    {presetName(preset.key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" onClick={addRole} disabled={!label.trim() || !presetKey}>
            <Plus className="mr-2 h-4 w-4" /> {t('role.add')}
          </Button>
          <p className="w-full text-[11px] text-muted-foreground">{t('role.presetHint')}</p>
        </div>
      )}
    </div>
  );
}