import React, { useRef, useState } from 'react';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { formatBytes } from '@/lib/bh';
import { saveCompanySettings } from '@/lib/companySettings';
import { base44 } from '@/api/base44Client';

// The documents every new hire receives: uploaded once here, then attached to the
// onboarding email when someone is hired.
export default function OnboardingDocsCard() {
  const { t } = useI18n();
  const { company, role, presetKey, isManager, levelOf, reload } = useWorkspace();
  const { toast } = useToast();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const docs = (company && company.onboarding_docs) || [];
  // The store's manager keeps these documents too, not only the company admin.
  const canEdit =
    role === 'company_admin' ||
    isManager ||
    ['manager', 'supervisor_manager'].includes(presetKey) ||
    ['update', 'write'].includes(levelOf('settings'));

  const save = async (next) => {
    await saveCompanySettings(company.id, { onboarding_docs: next });
    await reload();
  };

  const upload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0 || !company) return;
    setBusy(true);
    const added = [];
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      added.push({
        name: file.name,
        file_url,
        size: file.size,
        uploaded_at: new Date().toISOString()
      });
    }
    try {
      await save([...docs, ...added]);
      toast({ title: t('settings.docUploaded') });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.saveFailed') });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (doc) => {
    setBusy(true);
    try {
      await save(docs.filter((item) => item.file_url !== doc.file_url));
      toast({ title: t('settings.docDeleted') });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.saveFailed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('settings.onboardingDocs')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('settings.onboardingDocsHint')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={upload}
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.csv,.xlsx,.txt,.md"
        />
        <button
          type="button"
          disabled={busy || !canEdit}
          onClick={() => inputRef.current && inputRef.current.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {t('common.upload')}
        </button>

        {docs.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t('settings.docsEmpty')}</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {docs.map((doc) => (
              <li key={doc.file_url} className="flex items-center gap-3 px-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(doc.size)}
                    {doc.uploaded_at ? ` · ${doc.uploaded_at.slice(0, 10)}` : ''}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={busy}
                    title={t('common.delete')}
                    onClick={() => remove(doc)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">{t('settings.docsNote')}</p>
      </CardContent>
    </Card>
  );
}