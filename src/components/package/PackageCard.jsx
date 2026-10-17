import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw, CalendarPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import ModuleInfoTip from '@/components/package/ModuleInfoTip';
import { PACKAGE_KEYS, PACKAGE_NAMES } from '@/lib/packages';
import { base44 } from '@/api/base44Client';

/**
 * 패키지 정보 요약 카드 (Stat)
 * 각 항목의 라벨, 값, 보조 설명(hint) 및 액션 버튼(action)을 깔끔하게 렌더링합니다.
 */
function Stat({ label, value, hint, action }) {
  return (
    <div className="rounded-lg border px-4 py-3 flex flex-col justify-between">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm font-semibold">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {action ? <div className="mt-2 pt-2 border-t border-border/50">{action}</div> : null}
    </div>
  );
}

export default function PackageCard() {
  const { t } = useI18n();
  const { pkg, isPlatformAdmin, reloadPackage } = useWorkspace();
  const { toast } = useToast();
  const [form, setForm] = useState({ package: '', start_date: '' });
  const [limits, setLimits] = useState({ job_limit_override: '', employee_limit_override: '' });
  const [saving, setSaving] = useState(false);
  const [limitsSaving, setLimitsSaving] = useState(false);

  // 현재 패키지 정보 동기화
  useEffect(() => {
    if (!pkg) return;
    setForm({ package: pkg.package || '', start_date: pkg.start_date || pkg.today || '' });
    setLimits({
      job_limit_override:
        pkg.job_limit_override === null || pkg.job_limit_override === undefined ? '' : String(pkg.job_limit_override),
      employee_limit_override:
        pkg.employee_limit_override === null || pkg.employee_limit_override === undefined
          ? ''
          : String(pkg.employee_limit_override)
    });
  }, [pkg]);

  if (!pkg) return null;

  const assigned = Boolean(pkg.package);
  const locked = Boolean(pkg.job_lock);
  const expired = Boolean(pkg.expired);

  /**
   * 패키지 상태 관리 핸들러
   * action 종류:
   * - 'set': 요금제 및 시작일 직접 저장
   * - 'reactivate': 만료된 계정 재활성화
   * - 'extend_month': 액세스 종료일 한 달(30일) 자동 연장
   */
  const send = async (action) => {
    setSaving(true);
    try {
      const response = await base44.functions.invoke('managePackage', {
        action,
        company_id: pkg.company_id,
        package: form.package,
        start_date: form.start_date
      });
      if (response.data?.error) throw new Error(response.data.error);
      await reloadPackage();
      
      if (action === 'extend_month') {
        toast({
          title: '액세스 기간 30일 연장 완료',
          description: `종료일이 ${response.data?.expires_at || '30일 뒤'}까지 성공적으로 늘어났습니다.`
        });
      } else {
        toast({ title: t('pkg.saved') });
      }
    } catch (error) {
      toast({ title: error.message || t('pkg.failed'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // 공고 및 직원 수 제한 저장 (0은 무제한, 빈칸은 기본값)
  const saveLimits = async () => {
    setLimitsSaving(true);
    try {
      const response = await base44.functions.invoke('manageCompanyLimits', {
        company_id: pkg.company_id,
        job_limit_override: limits.job_limit_override,
        employee_limit_override: limits.employee_limit_override
      });
      if (response.data?.error) throw new Error(response.data.error);
      await reloadPackage();
      toast({ title: t('pkg.limitsSaved') });
    } catch (error) {
      toast({ title: error.message || t('pkg.failed'), variant: 'destructive' });
    } finally {
      setLimitsSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {t('pkg.title')}
          <Badge variant={expired ? 'destructive' : locked ? 'secondary' : 'outline'}>
            {!assigned
              ? t('pkg.notAssigned')
              : expired
              ? t('pkg.expired')
              : locked
              ? t('pkg.jobLock')
              : t('pkg.active')}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t('pkg.subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 상단 패키지 정보 요약 그리드 */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Stat
            label={
              <span className="inline-flex items-center gap-1.5">
                {t('pkg.current')}
                <ModuleInfoTip modules={pkg.modules} />
              </span>
            }
            value={assigned ? t(PACKAGE_NAMES[pkg.package]) : t('pkg.notAssigned')}
          />
          <Stat label={t('pkg.startDate')} value={pkg.start_date || '—'} />
          <Stat
            label={t('pkg.expiresAt')}
            value={pkg.expires_at || '—'}
            hint={pkg.days_left === null || pkg.days_left === undefined ? '' : `${t('pkg.daysLeft')} ${pkg.days_left}`}
            action={
              isPlatformAdmin ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/10"
                  onClick={() => send('extend_month')}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarPlus className="h-3 w-3" />}
                  한 달 늘리기 (+30일)
                </Button>
              ) : null
            }
          />
        </div>

        {/* 슈퍼어드민 전용 패키지 관리 및 기간 연장 영역 */}
        {isPlatformAdmin ? (
          <div className="space-y-3 rounded-lg border px-4 py-4 bg-muted/10">
            <p className="text-xs text-muted-foreground">{t('pkg.assign')}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>{t('pkg.package')}</Label>
                <Select value={form.package} onValueChange={(v) => setForm({ ...form, package: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('pkg.notAssigned')} />
                  </SelectTrigger>
                  <SelectContent>
                    {PACKAGE_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {t(PACKAGE_NAMES[key])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('pkg.startDate')}</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Button onClick={() => send('set')} disabled={saving || !form.package || !form.start_date}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t('pkg.save')}
                </Button>
                {(expired || locked) && (
                  <Button variant="outline" onClick={() => send('reactivate')} disabled={saving || !form.start_date}>
                    <RefreshCw className="mr-2 h-4 w-4" /> {t('pkg.reactivate')}
                  </Button>
                )}
                {/* 원클릭 한 달 늘리기 버튼 */}
                <Button
                  variant="secondary"
                  onClick={() => send('extend_month')}
                  disabled={saving}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800"
                >
                  <CalendarPlus className="mr-1.5 h-4 w-4" />
                  한 달 늘리기 (+30일)
                </Button>
              </div>
            </div>
            {pkg.reactivated_at ? (
              <p className="text-xs text-muted-foreground">
                {t('pkg.reactivatedAt')}: {String(pkg.reactivated_at).slice(0, 10)}
              </p>
            ) : null}

            {/* 공고 및 직원 한도 설정 */}
            <div className="space-y-3 border-t pt-3">
              <p className="text-xs text-muted-foreground">{t('pkg.limitsHint')}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>{t('pkg.jobLimit')}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={limits.job_limit_override}
                    onChange={(e) => setLimits({ ...limits, job_limit_override: e.target.value })}
                    placeholder={
                      pkg.package_job_limit === null || pkg.package_job_limit === undefined
                        ? t('pkg.unlimited')
                        : String(pkg.package_job_limit)
                    }
                  />
                </div>
                <div>
                  <Label>{t('pkg.employeeLimit')}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={limits.employee_limit_override}
                    onChange={(e) => setLimits({ ...limits, employee_limit_override: e.target.value })}
                    placeholder={
                      pkg.package_employee_limit === null || pkg.package_employee_limit === undefined
                        ? t('pkg.unlimited')
                        : String(pkg.package_employee_limit)
                    }
                  />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={saveLimits} disabled={limitsSaving}>
                    {limitsSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t('pkg.saveLimits')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="rounded-lg border px-4 py-3 text-xs text-muted-foreground">
            {assigned ? t('pkg.readOnly') : t('pkg.notAssignedHint')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}