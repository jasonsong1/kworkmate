import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/i18n';

// The employer's own answer to "what does a new hire hand in". A document type here is what an
// employee picks from when they file a document themselves. The list is held by the settings page
// and saved with its own Save, so this card offers no button of its own.
export default function OnboardingSetupCard({ types = [], onChange, canEdit = false }) {
  const { t } = useI18n();

  const setType = (index, patch) =>
    onChange(types.map((item, at) => (at === index ? { ...item, ...patch } : item)));

  const addType = () =>
    onChange([
      ...types,
      { key: `doc_${Math.random().toString(36).slice(2, 8)}`, label: '', label_en: '', kind: 'file', required: true }
    ]);

  const removeType = (index) => onChange(types.filter((_, at) => at !== index));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('ob.setupTitle')}</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">{t('ob.setupHint')}</p>
      </CardHeader>
      <CardContent>
        <Label className="block">{t('ob.docTypes')}</Label>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">{t('ob.docTypesHint')}</p>
        {types.length === 0 && <p className="text-sm text-muted-foreground">{t('ob.docTypesEmpty')}</p>}
        <div className="space-y-2">
          {types.map((type, index) => (
            <div key={type.key} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
              <Input
                value={type.label}
                disabled={!canEdit}
                placeholder={t('ob.docTypeLabel')}
                className="min-w-[12rem] flex-1"
                onChange={(event) => setType(index, { label: event.target.value })}
              />
              {type.kind === 'info' && (
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  {t('ob.docTypeInfo')}
                </span>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Switch
                  checked={type.required}
                  disabled={!canEdit}
                  onCheckedChange={(value) => setType(index, { required: value })}
                />
                {t('ob.required')}
              </div>
              <Button
                size="icon"
                variant="ghost"
                disabled={!canEdit}
                title={t('common.delete')}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => removeType(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="mt-3" disabled={!canEdit} onClick={addType}>
          <Plus className="mr-2 h-4 w-4" /> {t('ob.docTypeAdd')}
        </Button>
      </CardContent>
    </Card>
  );
}