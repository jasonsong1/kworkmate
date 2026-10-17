import { Link } from 'react-router-dom';
import { Receipt } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import CompanyManager from '@/components/platform/CompanyManager';
import PlatformAdminManager from '@/components/platform/PlatformAdminManager';
import PresetManager from '@/components/platform/PresetManager';
import ModuleAccessManager from '@/components/platform/ModuleAccessManager';
import TestingManager from '@/components/platform/TestingManager';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';

// Super admin only: company admins, branch managers and staff never see this screen
// or its menu entry.
export default function PlatformAdmin() {
  const { t } = useI18n();
  const { isPlatformAdmin, loading } = useWorkspace();

  if (loading) return null;

  if (!isPlatformAdmin) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">{t('perm.noAccess')}</CardContent>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('platform.title')}
        subtitle={t('platform.subtitle')}
        actions={
          <Link to="/invoices">
            <Button size="sm" variant="outline" className="gap-1.5 font-semibold shadow-xs">
              <Receipt className="h-4 w-4" />
              <span>{t('nav.invoices') || '인보이스 관리'}</span>
            </Button>
          </Link>
        }
      />
      <div className="space-y-6">
        <CompanyManager />
        <ModuleAccessManager />
        <PlatformAdminManager />
        <PresetManager />
        <TestingManager />
      </div>
    </div>
  );
}