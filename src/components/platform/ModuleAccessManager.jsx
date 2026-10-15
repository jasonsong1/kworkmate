// ============================================================
// ModuleAccessManager.jsx
// 목적: 플랫폼 최고 관리자가 요금제(Package)별 열람 가능 모듈을 설정하는 화면
//
// - 각 요금제(PAYG, Starter, Growth, Enterprise)마다 활동 로그(activity_logs) 등 모듈 활성화/비활성화
// - Supabase package_module 테이블과 직접 연동되어 즉시 영구 저장 및 전사 반영
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

export default function ModuleAccessManager() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [busyKey, setBusyKey] = useState('');

  // 요금제별 모듈 설정 데이터 로딩
  const load = useCallback(async () => {
    try {
      // 1. Supabase package_module 테이블 직접 조회 (가장 정확한 최신 데이터)
      const { data: dbRows, error: dbErr } = await supabase.from('package_module').select('*');
      if (dbErr) {
        console.warn('[ModuleAccessManager] DB fetch warning:', dbErr.message);
      }

      const rowMap = (dbRows || []).reduce((acc, row) => {
        if (row && row.package) {
          acc[row.package] = Array.isArray(row.modules) ? row.modules : [];
        }
        return acc;
      }, {});

      // 2. 시스템의 모든 구성 가능 모듈 (dashboard 제외, activity_logs 포함)
      const systemModules = MODULES.filter((m) => m !== 'dashboard');
      const allModules = Array.from(new Set(systemModules));

      // 기본 패키지 정의
      const defaultModules = {
        payg: ['jobs', 'applicants', 'interviews', 'templates', 'settings'],
        starter: [...allModules],
        growth: [...allModules],
        enterprise: [...allModules],
      };

      const packages = {};
      PACKAGE_KEYS.forEach((key) => {
        const hasCustom = rowMap[key] !== undefined;
        const currentModules = hasCustom ? rowMap[key] : (defaultModules[key] || allModules);

        packages[key] = {
          modules: currentModules,
          changed: hasCustom,
        };
      });

      setData({
        ok: true,
        all_modules: allModules,
        packages,
      });
    } catch (err) {
      console.error('[ModuleAccessManager] load error:', err);
      // 장애 시 기본 모듈 목록으로 폴백
      const systemModules = MODULES.filter((m) => m !== 'dashboard');
      const packages = {};
      PACKAGE_KEYS.forEach((key) => {
        packages[key] = {
          modules: key === 'payg' ? ['jobs', 'applicants', 'interviews', 'templates', 'settings'] : [...systemModules],
          changed: false,
        };
      });
      setData({ ok: true, all_modules: systemModules, packages });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 체크박스 토글 핸들러
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
          [key]: { ...prev.packages[key], modules, changed: true },
        },
      };
    });
  };

  // 저장 및 리셋 핸들러
  const send = async (action, key) => {
    setBusyKey(key);
    try {
      const targetModules = data.packages[key].modules;

      if (action === 'save') {
        // DB package_module 테이블에 직접 저장 (1순위 영구 보장)
        const { data: existing } = await supabase
          .from('package_module')
          .select('id')
          .eq('package', key)
          .maybeSingle();

        if (existing?.id) {
          const { error: updErr } = await supabase
            .from('package_module')
            .update({
              modules: targetModules,
              updated_date: new Date().toISOString(),
            })
            .eq('id', existing.id);
          if (updErr) throw updErr;
        } else {
          const newId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          const { error: insErr } = await supabase
            .from('package_module')
            .insert({
              id: newId,
              package: key,
              modules: targetModules,
              created_date: new Date().toISOString(),
              updated_date: new Date().toISOString(),
            });
          if (insErr) throw insErr;
        }
      } else if (action === 'reset') {
        // 기본값으로 되돌리기 (package_module 테이블에서 해당 요금제 행 삭제)
        const { error: delErr } = await supabase
          .from('package_module')
          .delete()
          .eq('package', key);
        if (delErr) throw delErr;
      }

      // 최신 상태 재로딩 (Supabase DB 직접 조회)
      await load();
      toast({ title: t('pkgModule.saved') });
    } catch (error) {
      console.error('[ModuleAccessManager] save error:', error);
      toast({
        title: error.message || '저장 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => send('reset', key)}
                      disabled={busyKey === key}
                    >
                      <RotateCcw className="mr-2 h-3.5 w-3.5" /> {t('pkgModule.reset')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => send('save', key)}
                    disabled={busyKey === key}
                  >
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