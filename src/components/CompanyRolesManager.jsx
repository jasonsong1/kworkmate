import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';

const FIXED_ROLES = ['company_admin', 'branch_manager', 'staff'];

export default function CompanyRolesManager({ value, onChange, disabled }) {
  const { t } = useI18n();
  const [label, setLabel] = useState('');
  const roles = value || [];

  const addRole = () => {
    const name = label.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const key =
      slug && !FIXED_ROLES.includes(slug) && !roles.some((role) => role.key === slug)
        ? slug
        : `role_${Date.now().toString(36)}`;
    onChange([...roles, { key, label: name }]);
    setLabel('');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {FIXED_ROLES.map((key) => (
          <span key={key} className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium">
            {t(`perm.role.${key}`)}
          </span>
        ))}
        {roles.map((role) => (
          <span
            key={role.key}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-0.5 text-xs font-medium"
          >
            {role.label}
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(roles.filter((item) => item.key !== role.key))}
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>

      {!disabled && (
        <div className="flex flex-wrap gap-2">
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
            className="max-w-xs"
          />
          <Button type="button" variant="outline" onClick={addRole} disabled={!label.trim()}>
            <Plus className="mr-2 h-4 w-4" /> {t('role.add')}
          </Button>
        </div>
      )}
    </div>
  );
}