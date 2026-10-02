import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Mail, Palette } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';

const OPTIONS = [
  { to: '/email-templates', title: 'templates.emailTitle', hint: 'templates.emailHint', icon: Mail },
  { to: '/job-design', title: 'templates.posterTitle', hint: 'templates.posterHint', icon: Palette }
];

export default function TemplateDesign() {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader title={t('templates.title')} subtitle={t('templates.subtitle')} />
      <div className="grid gap-5 sm:grid-cols-2">
        {OPTIONS.map((option) => (
          <Card
            key={option.to}
            className="cursor-pointer transition-colors hover:border-primary/50"
            onClick={() => navigate(option.to)}
          >
            <CardContent className="flex items-start gap-4 p-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <option.icon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold">{t(option.title)}</p>
                <p className="text-sm text-muted-foreground">{t(option.hint)}</p>
                <p className="flex items-center gap-1 pt-1 text-xs font-medium text-primary">
                  {t('templates.open')} <ArrowRight className="h-3 w-3" />
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}