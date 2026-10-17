import React, { useEffect, useRef, useState } from 'react';
import { Download, FileDown, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { downloadPdfFromCanvas, downloadPng, renderPoster } from '@/lib/poster';
import { useI18n } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';

export default function PosterStudio({ job, branch, company, applyUrl, onJobChange }) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const canvasRef = useRef(null);
  const [busy, setBusy] = useState(false);
  // Nothing in the studio is stored as it is typed or picked: the job ad's own Save writes the
  // colour, the note and the logo together with the rest of the ad.
  const patchJob = (changes) => onJobChange && onJobChange({ ...job, ...changes });

  const address = [branch?.address, branch?.suburb, branch?.state, branch?.postcode].filter(Boolean).join(', ');

  useEffect(() => {
    let active = true;
    const draw = async () => {
      if (!canvasRef.current) return;
      await renderPoster(canvasRef.current, {
        title: job.title || 'Team Member',
        companyName: company?.name || 'Our Company',
        branchName: branch?.name || '',
        address,
        note: job.poster_note || '',
        brandColor: job.brand_color || branch?.brand_color || '#4338ca',
        logoUrl: job.logo_url || branch?.logo_url || company?.logo_url || '',
        applyUrl: applyUrl || window.location.href
      });
    };
    draw();
    return () => {
      active = false;
    };
  }, [
    job.title,
    job.poster_note,
    job.brand_color,
    job.logo_url,
    branch?.name,
    branch?.brand_color,
    branch?.logo_url,
    company?.name,
    company?.logo_url,
    address,
    applyUrl
  ]);

  const uploadLogo = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBusy(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    patchJob({ logo_url: file_url });
    toast({ title: lang === 'en' ? 'Logo updated' : '로고가 등록되었습니다' });
  };

  const download = async (kind) => {
    if (!canvasRef.current) return;
    setBusy(true);
    try {
      if (kind === 'png') downloadPng(canvasRef.current, `${job.title}-poster.png`);
      else await downloadPdfFromCanvas(canvasRef.current, `${job.title}-poster.pdf`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('jobs.posterPreview') || '포스터 미리보기'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border bg-muted/30 p-3">
            <canvas ref={canvasRef} className="mx-auto block h-auto max-h-[58vh] w-auto max-w-full rounded-lg bg-white shadow-sm" />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('jobs.design') || '디자인 설정'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{t('jobs.storeLogo') || '매장 로고'}</Label>
              <div className="mt-2 flex items-center gap-2">
                <Button variant="outline" className="relative" disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {t('common.upload') || '업로드'}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={uploadLogo}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </Button>
                {job.logo_url && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => patchJob({ logo_url: '' })}
                  >
                    {t('common.delete') || '삭제'}
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label>{t('jobs.noteLine') || '강조 문구'}</Label>
              <Textarea
                rows={3}
                value={job.poster_note || ''}
                onChange={(e) => patchJob({ poster_note: e.target.value })}
                placeholder="Free staff meals · Flexible shifts"
              />
            </div>
            <div>
              <Label>{t('jobs.posterColor') || '포스터 색상'}</Label>
              <Input
                type="color"
                value={job.brand_color || branch?.brand_color || '#4338ca'}
                onChange={(e) => patchJob({ brand_color: e.target.value })}
                className="h-10 w-full p-1"
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-2">
          <Button onClick={() => download('png')} disabled={busy}>
            <Download className="mr-2 h-4 w-4" /> {t('jobs.downloadPng') || 'PNG 다운로드'}
          </Button>
          <Button variant="outline" onClick={() => download('pdf')} disabled={busy}>
            <FileDown className="mr-2 h-4 w-4" /> {t('jobs.downloadPdf') || 'PDF 다운로드'}
          </Button>
        </div>
      </div>
    </div>
  );
}