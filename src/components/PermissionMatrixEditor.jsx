import React from 'react';
import { EDITABLE_ROLES, PERMISSION_AREAS, PERMISSION_LEVELS } from '@/lib/permissions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';

export default function PermissionMatrixEditor({
  value,
  onChange,
  base,
  roles = EDITABLE_ROLES,
  allowInherit = false,
  disabled = false
}) {
  const { t } = useI18n();
  const matrix = value || {};

  const setCell = (role, area, level) => {
    const roleSet = { ...(matrix[role] || {}) };
    if (level === 'inherit') delete roleSet[area];
    else roleSet[area] = level;
    onChange({ ...matrix, [role]: roleSet });
  };

  const cellValue = (role, area) => matrix[role]?.[area] || (allowInherit ? 'inherit' : 'none');

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[540px] text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-2 pr-4 font-medium">{t('perm.area')}</th>
            {roles.map((role) => (
              <th key={role} className="py-2 pr-2 font-medium">
                {t(`perm.role.${role}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERMISSION_AREAS.map((area) => (
            <tr key={area.key} className="border-t">
              <td className="py-2 pr-4 font-medium">{t(`perm.area.${area.key}`)}</td>
              {roles.map((role) => (
                <td key={role} className="py-2 pr-2">
                  <Select
                    value={cellValue(role, area.key)}
                    onValueChange={(next) => setCell(role, area.key, next)}
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allowInherit && (
                        <SelectItem value="inherit">
                          {t('perm.inherit')} · {t(`perm.${(base && base[role] && base[role][area.key]) || 'none'}`)}
                        </SelectItem>
                      )}
                      {PERMISSION_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {t(`perm.${level}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}