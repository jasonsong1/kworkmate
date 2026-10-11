import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { ONBOARDING_FIELD_KEYS, docTypesOf, fieldVisibilityOf } from '@/lib/onboardingDocs';
import { saveCompanySettings } from '@/lib/companySettings';

// The employer's own answer to "what does a new hire hand in, and which details do we collect".
// A document type here is what an employee picks from when they file a document themselves.
export default function OnboardingSetupCard() {
  const { t } = useI18n();
  const { company, role, presetKey, isManager, levelOf, reload } = useWorkspace();
  const { toast } = useToast();
  const [types, setTypes] = useState([]);
  const [visible, setVisible] = useState({});
  const [saving, setSaving] = useState(false);

  const canEdit =
    role === 'company_admin' ||
    isManager ||
    ['manager', 'supervisor_manager'].includes(presetKey) ||
    ['update', 'write'].includes(levelOf('settings'));

  useEffect(() => {
    if (!company) return;
    setTypes(
      docTypesOf(company).map((type) => ({
        key: type.key,
        label: type.label || type.label_en || '',
        label_en: type.label_en || '',
        kind: type.kind || 'file',
        required: type.required !== false
      }))
    );
    setVisible(fieldVisibilityOf(company));
  }, [company]);

  const setType = (index, patch) =>
    setTypes((prev) => prev.map((item, at) => (at === index ? { ...item, ...patch } : item)));

  const addType = () =>
    setTypes((prev) => [
      ...prev,
      { key: `doc_${Math.random().toString(36).slice(2, 8)}`, label: '', label_en: '', kind: 'file', required: true }
    ]);

  const removeType = (index) => setTypes((prev) => prev.filter((_, at) => at !== index));

  const save = async () => {
    if (!company) return;
    const cleaned = types
      .filter((type) => String(type.label || '').trim())
      .map((type) => ({
        key: type.key,
        label: String(type.label).trim(),
        label_en: String(type.label_en || '').trim(),
        kind: type.kind === 'info' ? 'info' : 'file',
        required: type.required !== false
      }));
    setSaving(true);
    try {
      await saveCompanySettings(company.id, {
        onboarding_doc_types: cleaned,
        onboarding_field_visibility: visible
      });
      await reload();
      toast({ title: t('ob.setupSaved') });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{t('ob.setupTitle')}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t('ob.setupHint')}</p>
        </div>
        <Button onClick={save} disabled={!canEdit || saving}>
          {t('common.save')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
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
        </div>

        <div>
          <Label className="block">{t('ob.fieldVisibility')}</Label>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">{t('ob.fieldVisibilityHint')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ONBOARDING_FIELD_KEYS.map((key) => (
              <div key={key} className="flex items-center justify-between rounded-xl border px-4 py-3">
                <span className="text-sm">{t(`ob.field.${key}`)}</span>
                <Switch
                  checked={visible[key] !== false}
                  disabled={!canEdit}
                  onCheckedChange={(value) => setVisible((prev) => ({ ...prev, [key]: value }))}
                />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}