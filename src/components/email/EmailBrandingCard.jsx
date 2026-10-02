import React from 'react';
import { Image as ImageIcon, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Image } from '@/components/ui/image';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n';

export default function EmailBrandingCard({ branding, onChange, onLogoFile, uploading, disabled }) {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('email.branding')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <Label>{t('email.logo')}</Label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="flex h-14 w-36 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
              {branding.logo ? (
                <Image src={branding.logo} alt="Company logo" fittingType="fit" className="h-full w-full" />
              ) : (
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <Button variant="outline" className="relative" disabled={uploading || disabled}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {t('email.upload')}
              <input
                type="file"
                accept="image/*"
                disabled={uploading || disabled}
                onChange={(e) => {
                  const file = e.target.files && e.target.files[0];
                  if (file) onLogoFile(file);
                  e.target.value = '';
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </Button>
            {branding.logo && (
              <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange({ logo: '' })}>
                {t('email.remove')}
              </Button>
            )}
          </div>
        </div>

        <div>
          <Label>{t('email.color')}</Label>
          <div className="mt-2 flex items-center gap-3">
            <Input
              type="color"
              value={branding.color || '#4338ca'}
              disabled={disabled}
              onChange={(e) => onChange({ color: e.target.value })}
              className="h-10 w-16 p-1"
            />
            {branding.color ? (
              <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onChange({ color: '' })}>
                {t('email.useJobColor')}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">{t('email.colorHint')}</span>
            )}
          </div>
        </div>

        <div>
          <Label>{t('email.footer')}</Label>
          <Input
            className="mt-2"
            value={branding.footer}
            disabled={disabled}
            onChange={(e) => onChange({ footer: e.target.value })}
            placeholder="Your company · 123 Example Street"
          />
          <p className="mt-1 text-xs text-muted-foreground">{t('email.footerHint')}</p>
        </div>
      </CardContent>
    </Card>
  );
}