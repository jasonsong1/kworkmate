import React, { useEffect, useRef, useState } from 'react';
import { Download, FileDown, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { downloadPdfFromCanvas, downloadPng, renderPoster } from '@/lib/poster';
import { base44 } from '@/api/base44Client';

export default function PosterStudio({ job, branch, company, applyUrl, onJobChange }) {
  const { toast } = useToast();
  const canvasRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(job.poster_note || '');

  const address = [branch?.address, branch?.suburb, branch?.state, branch?.postcode].filter(Boolean).join(', ');

  useEffect(() => {
    let active = true;
    const draw = async () => {
      if (!canvasRef.current) return;
      await renderPoster(canvasRef.current, {
        title: job.title,
        storeName: branch ? branch.name : '',
        rate: job.hourly_rate ? `$${Number(job.hourly_rate).toFixed(2)}/hr` : '',
        address,
        applyUrl,
        brandColor: job.brand_color || branch?.brand_color || company?.brand_color,
        logoUrl: job.logo_url || branch?.logo_url,
        note
      });
      if (!active) return;
    };
    draw();
    return () => {
      active = false;
    };
  }, [job.title, job.hourly_rate, job.brand_color, job.logo_url, branch, company, applyUrl, address, note]);

  const uploadLogo = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    setBusy(true);
    const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
    await base44.entities.Job.update(job.id, { logo_url: file_url });
    setBusy(false);
    onJobChange && onJobChange({ ...job, logo_url: file_url });
    toast({ title: 'Logo updated' });
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
          <CardTitle className="text-base">Poster preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-xl border bg-muted/30 p-3">
            <canvas ref={canvasRef} className="w-full rounded-lg bg-white shadow-sm" />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Design</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Store logo</Label>
              <div className="mt-2 flex items-center gap-2">
                <Button variant="outline" className="relative" disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  Upload
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
                    onClick={async () => {
                      await base44.entities.Job.update(job.id, { logo_url: '' });
                      onJobChange && onJobChange({ ...job, logo_url: '' });
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label>Note line</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => base44.entities.Job.update(job.id, { poster_note: note })}
                placeholder="Free staff meals · Flexible shifts"
              />
            </div>
            <div>
              <Label>Poster colour</Label>
              <Input
                type="color"
                value={job.brand_color || branch?.brand_color || '#4338ca'}
                onChange={(e) => onJobChange && onJobChange({ ...job, brand_color: e.target.value })}
                onBlur={(e) => base44.entities.Job.update(job.id, { brand_color: e.target.value })}
                className="h-10 w-full p-1"
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-2">
          <Button onClick={() => download('png')} disabled={busy}>
            <Download className="mr-2 h-4 w-4" /> Download PNG
          </Button>
          <Button variant="outline" onClick={() => download('pdf')} disabled={busy}>
            <FileDown className="mr-2 h-4 w-4" /> Download PDF
          </Button>
        </div>
      </div>
    </div>
  );
}