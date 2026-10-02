import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ColorField from '@/components/design/ColorField';
import JobDesignPreview from '@/components/design/JobDesignPreview';
import LogoField from '@/components/design/LogoField';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

export default function JobDesign() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { company, role, reload } = useWorkspace();
  const [design, setDesign] = useState({ logo_url: '', brand_color: '#4338ca' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!company) return;
    const saved = company.job_design || {};
    setDesign({ logo_url: saved.logo_url || '', brand_color: saved.brand_color || '#4338ca' });
  }, [company]);

  const uploadLogo = async ({ file }) => {
    const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
    return { file_url };
  };

  const save = async () => {
    if (!company) return;
    setSaving(true);
    await base44.entities.Company.update(company.id, { job_design: design });
    await reload();
    setSaving(false);
    toast({ title: t('jobdesign.saved') });
  };

  return (
    <div>
      <PageHeader
        title={t('jobdesign.title')}
        subtitle={t('jobdesign.subtitle')}
        actions={
          <Button onClick={save} disabled={saving || role !== 'company_admin'}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <Card>
          <CardContent className="space-y-6 pt-6">
            <LogoField
              value={design.logo_url}
              onChange={(url) => setDesign((prev) => ({ ...prev, logo_url: url }))}
              uploaded={uploadLogo}
              onUploadedChange={(url) => setDesign((prev) => ({ ...prev, logo_url: url }))}
            />
            <ColorField
              value={design.brand_color}
              onChange={(color) => setDesign((prev) => ({ ...prev, brand_color: color }))}
            />
          </CardContent>
        </Card>

        <div className="space-y-3">
          <p className="text-sm font-semibold">{t('jobdesign.preview')}</p>
          <JobDesignPreview design={design} companyName={company ? company.name : ''} />
          <p className="text-xs text-muted-foreground">{t('jobdesign.previewHint')}</p>
        </div>
      </div>
    </div>
  );
}