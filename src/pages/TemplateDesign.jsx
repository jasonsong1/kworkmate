import React from 'react';
import PageHeader from '@/components/PageHeader';
import EmailTemplates from '@/pages/EmailTemplates';
import PosterDesign from '@/components/PosterDesign';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/lib/i18n';

export default function TemplateDesign() {
  const { t } = useI18n();

  return (
    <div>
      <PageHeader title={t('templates.title')} subtitle={t('templates.subtitle')} />

      <Tabs defaultValue="email">
        <TabsList>
          <TabsTrigger value="email">{t('templates.email')}</TabsTrigger>
          <TabsTrigger value="poster">{t('templates.poster')}</TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="mt-6">
          <EmailTemplates embedded />
        </TabsContent>

        <TabsContent value="poster" className="mt-6">
          <PosterDesign />
        </TabsContent>
      </Tabs>
    </div>
  );
}