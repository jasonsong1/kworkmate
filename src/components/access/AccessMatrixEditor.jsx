import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import {
  MODULES,
  isConfigurable,
  isScoped,
  levelLabelKey,
  moduleLabelKey,
  moduleLevelOptions,
  normalizeCell,
  scopeLabelKey,
  scopeOptions
} from '@/lib/access';

// One card per position: only the modules the position's preset opens for it appear, and
// inside that ceiling the employer sets the level (read / update / write) and, where rows are
// involved, the data range. Anything wider than the ceiling is never offered.
export default function AccessMatrixEditor({
  value,
  onChange,
  roles,
  roleLabels,
  ceilings = {},
  modules = MODULES,
  allowInherit = false,
  disabled = false
}) {
  const { t } = useI18n();
  const matrix = value || {};

  const setCell = (role, module, next) => {
    const roleSet = { ...(matrix[role] || {}) };
    if (next === null) delete roleSet[module];
    else roleSet[module] = next;
    onChange({ ...matrix, [role]: roleSet });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('perm.dashboardNote')}</p>
      {roles.map((role) => {
        const ceiling = ceilings[role] || {};
        const rows = modules.filter(
          (module) => isConfigurable(module) && ceiling[module] && ceiling[module].level !== 'none'
        );
        return (
          <div key={role} className="overflow-hidden rounded-xl border">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
              <p className="text-sm font-medium">{roleLabels && roleLabels[role] ? roleLabels[role] : t(`perm.role.${role}`)}</p>
              <p className="text-[11px] text-muted-foreground">{t('perm.ceilingHint')}</p>
            </div>

            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('perm.noModules')}</p>
            ) : (
              <div className="divide-y">
                {rows.map((module) => {
                  const cap = ceiling[module];
                  const stored = matrix[role] ? matrix[role][module] : undefined;
                  const inherited = allowInherit && stored === undefined;
                  const cell = normalizeCell(stored);
                  const level = inherited ? 'inherit' : cell.level;
                  const scope =
                    cell.scope || cap.scope || 'branch';

                  return (
                    <div key={module} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                      <span className="min-w-[8rem] flex-1 text-sm">{t(moduleLabelKey(module))}</span>
                      <Select
                        value={level}
                        onValueChange={(next) => {
                          if (next === 'inherit') setCell(role, module, null);
                          else setCell(role, module, { level: next, scope });
                        }}
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-8 w-32 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allowInherit && <SelectItem value="inherit">{t('perm.inherit')}</SelectItem>}
                          {moduleLevelOptions(module, cap.level).map((option) => (
                            <SelectItem key={option} value={option}>
                              {t(levelLabelKey(option))}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {isScoped(module) && !inherited && level !== 'none' && (
                        <Select
                          value={scope}
                          onValueChange={(next) => setCell(role, module, { level, scope: next })}
                          disabled={disabled}
                        >
                          <SelectTrigger className="h-8 w-36 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {scopeOptions(cap.scope || 'company').map((option) => (
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
            )}
          </div>
        );
      })}
    </div>
  );
}