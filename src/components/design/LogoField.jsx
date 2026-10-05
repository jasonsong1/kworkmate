import React from 'react';
import { ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

export default function LogoField({ value, onChange, uploaded, onUploadedChange, label, hint }) {
  const { t } = useI18n();
  const [uploading, setUploading] = React.useState(false);

  const pick = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    const { file_url } = await uploaded({ file });
    onUploadedChange(file_url);
    setUploading(false);
  };

  return (
    <div>
      <p className="text-sm font-medium">{label || t('jobdesign.logo')}</p>
      <p className="mb-3 text-xs text-muted-foreground">{hint || t('jobdesign.logoHint')}</p>
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
          {value ? (
            <Image src={value} alt="Logo" fittingType="fit" className="h-full w-full" />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="relative" disabled={uploading} asChild>
            <label>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {t('jobdesign.upload')}
              <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={uploading} />
            </label>
          </Button>
          {value ? (
            <Button variant="ghost" onClick={() => onUploadedChange('')}>
              <X className="mr-1 h-4 w-4" /> {t('jobdesign.remove')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}