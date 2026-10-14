import React from 'react';
import { ImageIcon, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

// 이미지를 원본 종횡비 유지하면서 최대 규격 내로 최적화 압축하는 헬퍼 함수
async function optimizeImageFile(file, maxWidth = 600, maxHeight = 300) {
  return new Promise((resolve) => {
    // SVG나 작은 파일은 그대로 반환
    if (file.type === 'image/svg+xml' || file.size < 50 * 1024) {
      return resolve(file);
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // 원본 비율 유지하면서 최대 크기 제한
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const optimizedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.png'), {
                  type: 'image/png',
                  lastModified: Date.now()
                });
                resolve(optimizedFile);
              } else {
                resolve(file);
              }
            },
            'image/png'
          );
        } else {
          resolve(file);
        }
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

export default function LogoField({ value, onChange, uploaded, onUploadedChange, label, hint }) {
  const { t } = useI18n();
  const [uploading, setUploading] = React.useState(false);

  const pick = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      // 이미지 사이즈 및 용량 최적화 (가로세로 비율 유지)
      const optimized = await optimizeImageFile(file);
      const { file_url } = await uploaded({ file: optimized });
      if (onUploadedChange) onUploadedChange(file_url);
      if (onChange) onChange(file_url);
    } catch (err) {
      console.error('Logo upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <p className="text-sm font-medium">{label || t('jobdesign.logo')}</p>
      <p className="mb-3 text-xs text-muted-foreground">{hint || t('jobdesign.logoHint')}</p>
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40 p-2">
          {value ? (
            <img
              src={value}
              alt="Logo"
              className="max-h-full max-w-full object-contain"
              style={{ objectFit: 'contain' }}
            />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="relative" disabled={uploading} asChild>
            <label className="cursor-pointer">
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {t('jobdesign.upload')}
              <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={uploading} />
            </label>
          </Button>
          {value ? (
            <Button
              variant="ghost"
              onClick={() => {
                if (onUploadedChange) onUploadedChange('');
                if (onChange) onChange('');
              }}
            >
              <X className="mr-1 h-4 w-4" /> {t('jobdesign.remove')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}