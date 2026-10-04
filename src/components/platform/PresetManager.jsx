import React, { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PresetEditorDialog from '@/components/platform/PresetEditorDialog';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { grantedModules } from '@/lib/access';

const BLANK = { key: '', label_en: '', label_ko: '', order: 10, access: {} };

// Super admin only: the platform's own position presets — the second layer every company's
// roles are linked to.
export default function PresetManager() {
  const { t, lang } = useI18n();
  const { presets, reloadPackage } = useWorkspace();
  const [editing, setEditing] = useState(null);
  const nameOf = (preset) => (lang === 'ko' ? preset.label_ko || preset.label_en : preset.label_en || preset.label_ko);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{t('preset.title')}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{t('preset.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing(BLANK)}>
          <Plus className="mr-2 h-4 w-4" /> {t('preset.add')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {presets.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {t('common.none')}
          </p>
        ) : (
          presets.map((preset) => (
            <div
              key={preset.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{nameOf(preset)}</p>
                <p className="text-[11px] text-muted-foreground">{preset.key}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary">
                  {t('preset.moduleCount').replace('{count}', String(grantedModules(preset.access).length))}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => setEditing(preset)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> {t('common.edit')}
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      <PresetEditorDialog
        open={Boolean(editing)}
        preset={editing}
        onClose={() => setEditing(null)}
        onSaved={reloadPackage}
      />
    </Card>
  );
}