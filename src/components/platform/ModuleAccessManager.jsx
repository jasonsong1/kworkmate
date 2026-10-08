import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { MODULE_LABELS, PACKAGE_KEYS, PACKAGE_NAMES } from '@/lib/packages';
import { base44 } from '@/api/base44Client';

// Super admin only: which modules each package opens. A module switched off here closes for
// every company on that package, on the screen and in the data rules alike.
export default function ModuleAccessManager() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [busyKey, setBusyKey] = useState('');

  const load = useCallback(async () => {
    const response = await base44.functions.invoke('managePackageModules', { action: 'read' });
    const payload = response.data || {};
    if (payload.error) throw new Error(payload.error);
    setData(payload);
  }, []);

  useEffect(() => {
    load().catch(() => setData(null));
  }, [load]);

  const toggle = (key, module) => {
    setData((prev) => {
      const current = prev.packages[key].modules;
      const modules = current.includes(module)
        ? current.filter((item) => item !== module)
        : prev.all_modules.filter((item) => item === module || current.includes(item));
      return { ...prev, packages: { ...prev.packages, [key]: { ...prev.packages[key], modules } } };
    });
  };

  const send = async (action, key) => {
    setBusyKey(key);
    try {
      const response = await base44.functions.invoke('managePackageModules', {
        action,
        package: key,
        modules: action === 'save' ? data.packages[key].modules : undefined
      });
      if (response.data?.error) throw new Error(response.data.error);
      await load();
      toast({ title: t('pkgModule.saved') });
    } catch (error) {
      toast({ title: error.message, variant: 'destructive' });
    } finally {
      setBusyKey('');
    }
  };

  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('pkgModule.title')}</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">{t('pkgModule.subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {PACKAGE_KEYS.map((key) => {
          const pack = data.packages[key];
          if (!pack) return null;
          return (
            <div key={key} className="space-y-3 rounded-lg border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t(PACKAGE_NAMES[key])}</span>
                  {pack.changed && <Badge variant="secondary">{t('pkgModule.changed')}</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  {pack.changed && (
                    <Button variant="ghost" size="sm" onClick={() => send('reset', key)} disabled={busyKey === key}>
                      <RotateCcw className="mr-2 h-3.5 w-3.5" /> {t('pkgModule.reset')}
                    </Button>
                  )}
                  <Button size="sm" onClick={() => send('save', key)} disabled={busyKey === key}>
                    {busyKey === key && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    {t('common.save')}
                  </Button>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.all_modules.map((module) => (
                  <label key={module} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={pack.modules.includes(module)}
                      onCheckedChange={() => toggle(key, module)}
                    />
                    {t(MODULE_LABELS[module] || module)}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}