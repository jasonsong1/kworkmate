import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';

export default function EmailPreview({ subject, html }) {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('email.preview')}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          {t('email.previewSubject')}: <span className="font-medium text-foreground">{subject}</span>
        </p>
        <iframe
          title="Email preview"
          sandbox=""
          srcDoc={`<!doctype html><html><body style="margin:0">${html}</body></html>`}
          className="h-[600px] w-full rounded-lg border bg-white"
        />
      </CardContent>
    </Card>
  );
}