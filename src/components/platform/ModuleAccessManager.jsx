// ============================================================
// ModuleAccessManager.jsx
// 목적: 플랫폼 최고 관리자가 요금제(Package)별 열람 가능 모듈을 설정하는 화면
//
// - 각 요금제(PAYG, Starter, Growth, Enterprise)마다 활동 로그(activity_logs) 등 모듈 활성화/비활성화
// - Supabase package_module 테이블과 실시간 연동되어 즉시 전사 적용
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { MODULE_LABELS, PACKAGE_KEYS, PACKAGE_NAMES } from '@/lib/packages';
import { MODULES } from '@/lib/access';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/lib/supabaseClient';

// Super admin only: which modules each package opens. A module switched off here closes for
// every company on that package, on the screen and in the data rules alike.
export default function ModuleAccessManager() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [busyKey, setBusyKey] = useState('');

  const load = useCallback(async () => {
    try {
      // 1. Edge Function 또는 package_module 테이블에서 요금제별 설정 읽기
      const response = await base44.functions.invoke('managePackageModules', { action: 'read' }).catch(() => null);
      let payload = response?.data || {};

      // DB 직접 조회로 최신 package_module 레코드 보강
      const { data: dbRows } = await supabase.from('package_module').select('*');
      const rowMap = (dbRows || []).reduce((acc, row) => {
        acc[row.package] = row.modules;
        return acc;
      }, {});

      // 시스템의 모든 구성 가능 모듈(대시보드 제외, activity_logs 포함)
      const systemModules = MODULES.filter((m) => m !== 'dashboard');
      const allModules = Array.from(new Set([...(payload.all_modules || []), ...systemModules]));

      // 기본 패키지 정의
      const defaultModules = {
        payg: ['jobs', 'applicants', 'interviews', 'templates', 'settings'],
        starter: [...allModules],
        growth: [...allModules],
        enterprise: [...allModules]
      };

      const packages = {};
      PACKAGE_KEYS.forEach((key) => {
        const customModules = rowMap[key] || (payload.packages && payload.packages[key]?.modules);
        const isChanged = Boolean(rowMap[key] || (payload.packages && payload.packages[key]?.changed));
        packages[key] = {
          modules: customModules || defaultModules[key] || allModules,
          changed: isChanged
        };
      });

      setData({
        ok: true,
        all_modules: allModules,
        packages
      });
    } catch (err) {
      console.error('[ModuleAccessManager] load error:', err);
      // 에러 시 로컬 기본값으로 복구
      const systemModules = MODULES.filter((m) => m !== 'dashboard');
      const packages = {};
      PACKAGE_KEYS.forEach((key) => {
        packages[key] = {
          modules: key === 'payg' ? ['jobs', 'applicants', 'interviews', 'templates', 'settings'] : [...systemModules],
          changed: false
        };
      });
      setData({ ok: true, all_modules: systemModules, packages });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (key, module) => {
    setData((prev) => {
      const current = prev.packages[key].modules;
      const modules = current.includes(module)
        ? current.filter((item) => item !== module)
        : prev.all_modules.filter((item) => item === module || current.includes(item));
      return {
        ...prev,
        packages: {
          ...prev.packages,
          [key]: { ...prev.packages[key], modules, changed: true }
        }
      };
    });
  };

  const send = async (action, key) => {
    setBusyKey(key);
    try {
      const targetModules = data.packages[key].modules;

      // 1. Edge function 호출 시도
      await base44.functions.invoke('managePackageModules', {
        action,
        package: key,
        modules: action === 'save' ? targetModules : undefined
      }).catch(() => null);

      // 2. Supabase DB package_module 테이블에 확실하게 영구 반영
      if (action === 'save') {
        const { data: existing } = await supabase
          .from('package_module')
          .select('id')
          .eq('package', key)
          .maybeSingle();

        if (existing?.id) {
          await supabase
            .from('package_module')
            .update({
              modules: targetModules,
              updated_date: new Date().toISOString()
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('package_module')
            .insert({
              package: key,
              modules: targetModules,
              created_date: new Date().toISOString(),
              updated_date: new Date().toISOString()
            });
        }
      } else if (action === 'reset') {
        // 기본값으로 되돌리기 (커스텀 오버라이드 삭제)
        await supabase
          .from('package_module')
          .delete()
          .eq('package', key);
      }

      await load();
      toast({ title: t('pkgModule.saved') });
    } catch (error) {
      console.error('[ModuleAccessManager] save error:', error);
      toast({ title: error.message || '저장 실패', variant: 'destructive' });
    } finally {
      setBusyKey('');
    }
  };

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          {t('common.loading')}
        </CardContent>
      </Card>
    );
  }

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
                  <span className="text-sm font-semibold">{t(PACKAGE_NAMES[key])}</span>
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
                  <label key={module} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <Checkbox
                      checked={pack.modules.includes(module)}
                      onCheckedChange={() => toggle(key, module)}
                    />
                    <span className={pack.modules.includes(module) ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                      {t(MODULE_LABELS[module] || module)}
                    </span>
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