import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import EmailBrandingCard from '@/components/email/EmailBrandingCard';
import EmailPreview from '@/components/email/EmailPreview';
import EmailStageEditor from '@/components/email/EmailStageEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { EMAIL_STAGES, diffTemplates, getStage, mergeTemplates, renderEmailPreview } from '@/lib/emailStages';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';

export default function EmailTemplates() {
  const { t } = useI18n();
  const { company, isManager, levelOf, feature, patchCompany } = useWorkspace();
  const { toast } = useToast();
  const [branding, setBranding] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [stageKey, setStageKey] = useState(EMAIL_STAGES[0].key);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!company) return;
    setBranding({
      logo: company.logo_url || '',
      color: company.email_brand_color || '',
      footer: company.email_footer || ''
    });
    setTemplates(mergeTemplates(company.email_templates));
  }, [company]);

  // The branding and the stage copy are the company's own design: a manager keeps them, and so
  // does any position the employer granted the template area to.
  const canEdit = isManager || ['update', 'write'].includes(levelOf('templates'));
  // A stage that belongs to a kind of interview the package does not include is not offered.
  const STAGE_FEATURE = { mini: 'mini_interview', video: 'video_interview' };
  const stageList = EMAIL_STAGES.filter((item) => !STAGE_FEATURE[item.key] || feature(STAGE_FEATURE[item.key]));
  const activeKey = stageList.some((item) => item.key === stageKey) ? stageKey : stageList[0].key;
  const patchBranding = (patch) => setBranding((prev) => ({ ...prev, ...patch }));
  const patchStage = (patch) =>
    setTemplates((prev) => ({ ...prev, [activeKey]: { ...prev[activeKey], ...patch } }));

  const uploadLogo = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      patchBranding({ logo: file_url });
    } finally {
      setUploading(false);
    }
  };

  const resetStage = () => {
    const stage = getStage(activeKey);
    patchStage({ subject: stage.subject, heading: stage.heading, body: stage.body, cta: stage.cta });
  };

  const save = async () => {
    setSaving(true);
    try {
      const data = {
        logo_url: branding.logo,
        email_brand_color: branding.color,
        email_footer: branding.footer,
        email_templates: diffTemplates(templates)
      };
      await base44.entities.Company.update(company.id, data);
      patchCompany(data);
      toast({ title: t('email.saved') });
    } finally {
      setSaving(false);
    }
  };

  if (!branding || !templates) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  const stage = getStage(activeKey);
  const preview = renderEmailPreview({
    stageKey: activeKey,
    values: templates[activeKey],
    branding,
    companyName: company ? company.name : ''
  });

  return (
    <div>
      <PageHeader
        title={t('email.title')}
        subtitle={t('email.subtitle')}
        actions={
          <Button onClick={save} disabled={saving || !canEdit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <EmailBrandingCard
            branding={branding}
            onChange={patchBranding}
            onLogoFile={uploadLogo}
            uploading={uploading}
            disabled={!canEdit}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('email.stages')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {stageList.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setStageKey(item.key)}
                    className={cn(
                      'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                      item.key === activeKey
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {t(`email.stage.${item.key}`)}
                  </button>
                ))}
              </div>

              <EmailStageEditor
                key={activeKey}
                stage={stage}
                values={templates[activeKey]}
                onChange={patchStage}
                onReset={resetStage}
                disabled={!canEdit}
              />
            </CardContent>
          </Card>
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <EmailPreview subject={preview.subject} html={preview.html} />
        </div>
      </div>
    </div>
  );
}