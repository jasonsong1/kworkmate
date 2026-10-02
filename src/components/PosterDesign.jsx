import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Image } from '@/components/ui/image';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

export default function PosterDesign() {
  const { t } = useI18n();
  const { company, role, patchCompany } = useWorkspace();
  const { toast } = useToast();
  const [logo, setLogo] = useState('');
  const [color, setColor] = useState('#4338ca');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!company) return;
    setLogo(company.logo_url || '');
    setColor(company.brand_color || '#4338ca');
  }, [company]);

  const canEdit = role === 'company_admin';

  const uploadLogo = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
      setLogo(file_url);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!company) return;
    setSaving(true);
    try {
      const data = { logo_url: logo, brand_color: color };
      await base44.entities.Company.update(company.id, data);
      patchCompany(data);
      toast({ title: t('templates.posterSaved') });
    } finally {
      setSaving(false);
    }
  };

  if (!company) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('templates.poster')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label>{t('templates.posterLogo')}</Label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="flex h-14 w-36 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
                {logo ? (
                  <Image src={logo} alt="Company logo" fittingType="fit" className="h-full w-full" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <Button variant="outline" className="relative" disabled={uploading || !canEdit}>
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {t('email.upload')}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading || !canEdit}
                  onChange={(e) => {
                    const file = e.target.files && e.target.files[0];
                    if (file) uploadLogo(file);
                    e.target.value = '';
                  }}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </Button>
              {logo && (
                <Button variant="ghost" size="sm" disabled={!canEdit} onClick={() => setLogo('')}>
                  {t('email.remove')}
                </Button>
              )}
            </div>
          </div>

          <div>
            <Label>{t('templates.posterColor')}</Label>
            <Input
              type="color"
              value={color}
              disabled={!canEdit}
              onChange={(e) => setColor(e.target.value)}
              className="mt-2 h-10 w-16 p-1"
            />
          </div>

          <p className="text-xs text-muted-foreground">{t('templates.posterHint')}</p>

          <Button onClick={save} disabled={saving || !canEdit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('templates.posterPreview')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border">
            <div className="flex items-center gap-3 px-5 py-4 text-white" style={{ backgroundColor: color }}>
              {logo ? (
                <div className="h-10 w-24">
                  <Image src={logo} alt="" fittingType="fit" className="h-full w-full" />
                </div>
              ) : (
                <p className="text-lg font-bold">{company.name}</p>
              )}
              <div className="ml-auto text-right">
                <p className="text-sm font-semibold">{t('templates.sampleTitle')}</p>
                <p className="text-xs opacity-80">{t('templates.sampleBranch')}</p>
              </div>
            </div>
            <div className="space-y-2 bg-white px-5 py-5">
              <p className="text-xs text-muted-foreground">Casual · $28.00/hr</p>
              <div className="h-2 w-3/4 rounded bg-muted" />
              <div className="h-2 w-2/3 rounded bg-muted" />
              <div className="h-2 w-1/3 rounded bg-muted" />
              <span
                className="mt-3 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                Apply now
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}