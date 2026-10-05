import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import ColorField from '@/components/design/ColorField';
import QrCard from '@/components/attendance/QrCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

const DEFAULT_SIZE = 240;

// The clock-in QR a store shows: one heading, one line of guidance, a colour and a size.
export default function QrDesign() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { company, role, reload } = useWorkspace();
  const [design, setDesign] = useState({ title: '', note: '', brand_color: '', size: DEFAULT_SIZE });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!company) return;
    const saved = company.qr_design || {};
    setDesign({
      title: saved.title || '',
      note: saved.note || '',
      brand_color: saved.brand_color || company.brand_color || '#111111',
      size: Number(saved.size) || DEFAULT_SIZE
    });
  }, [company]);

  const save = async () => {
    if (!company) return;
    setSaving(true);
    await base44.entities.Company.update(company.id, {
      qr_design: { ...design, size: Number(design.size) || DEFAULT_SIZE }
    });
    await reload();
    setSaving(false);
    toast({ title: t('qrdesign.saved') });
  };

  const previewUrl = `${window.location.origin}/kiosk/preview`;

  return (
    <div>
      <PageHeader
        title={t('qrdesign.title')}
        subtitle={t('qrdesign.subtitle')}
        actions={
          <Button onClick={save} disabled={saving || role !== 'company_admin'}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        } />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('qrdesign.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label>{t('qrdesign.heading')}</Label>
              <Input
                value={design.title}
                onChange={(e) => setDesign((prev) => ({ ...prev, title: e.target.value }))}
                placeholder={t('attendance.qrTitle')} />
              <p className="mt-1 text-xs text-muted-foreground">{t('qrdesign.headingHint')}</p>
            </div>

            <div>
              <Label>{t('qrdesign.note')}</Label>
              <Textarea
                rows={3}
                value={design.note}
                onChange={(e) => setDesign((prev) => ({ ...prev, note: e.target.value }))}
                placeholder={t('attendance.qrHint')} />
            </div>

            <ColorField
              value={design.brand_color}
              onChange={(color) => setDesign((prev) => ({ ...prev, brand_color: color }))} />

            <div className="max-w-[200px]">
              <Label>{t('qrdesign.size')}</Label>
              <Input
                type="number"
                min="160"
                max="320"
                step="10"
                value={design.size}
                onChange={(e) => setDesign((prev) => ({ ...prev, size: e.target.value }))} />
              <p className="mt-1 text-xs text-muted-foreground">{t('qrdesign.sizeHint')}</p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <p className="text-sm font-semibold">{t('qrdesign.preview')}</p>
          <Card>
            <CardContent className="p-6">
              <QrCard
                url={previewUrl}
                design={design}
                fallbackTitle={t('attendance.qrTitle')}
                fallbackNote={t('attendance.qrHint')} />
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">{t('qrdesign.previewHint')}</p>
        </div>
      </div>
    </div>
  );
}