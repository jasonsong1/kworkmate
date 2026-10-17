import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Check, Loader2, MapPin, MapPinOff, Search } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AccessMatrixEditor from '@/components/access/AccessMatrixEditor';
import { MODULES, clampRoleMatrix, levelRank, normalizeCell, scopeRank } from '@/lib/access';
import TradingHoursEditor, { hasOverlappingTradingHours } from '@/components/TradingHoursEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useI18n, formatRoleLabel } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { employeeNumberPreview } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

export default function PropertySetup() {
  const { t, lang } = useI18n();
  const { branches, activeBranch, patchBranch, company, pkg, presets, role, presetKey } = useWorkspace();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const branchId = params.get('branch') || (activeBranch && activeBranch.id);
  const branch = branches.find((b) => b.id === branchId) || activeBranch;

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [geoAddress, setGeoAddress] = useState('');
  const [searchingGeo, setSearchingGeo] = useState(false);

  useEffect(() => {
    if (!branch) return;
    setForm({
      name: branch.name || '',
      code: branch.code || '',
      address: branch.address || '',
      suburb: branch.suburb || '',
      state: branch.state || '',
      postcode: branch.postcode || '',
      phone: branch.phone || '',
      contact_name: branch.contact_name || '',
      contact_email: branch.contact_email || '',
      contact_phone: branch.contact_phone || branch.phone || '',
      trading_hours: branch.trading_hours || '',
      employee_prefix: branch.employee_prefix || '',
      employee_number_padding: branch.employee_number_padding || 3,
      employee_next_number: branch.employee_next_number || 1,
      gps_lat: branch.gps_lat ?? '',
      gps_lng: branch.gps_lng ?? '',
      gps_radius_m: branch.gps_radius_m || 100,
      // A grant saved before an area stopped offering create-and-delete is pulled back to what
      // the table now offers. The map is read role by role, so a saved answer survives a reload.
      role_permissions: clampRoleMatrix(branch.role_permissions || {})
    });

    const defaultAddr = [branch.address, branch.suburb, branch.state, branch.postcode].filter(Boolean).join(', ');
    setGeoAddress(defaultAddr);
  }, [branch]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // 주소 텍스트 기반 위도/경도 Geocoding 자동 검색
  const searchCoordsByAddress = async (targetAddr) => {
    const query = String(targetAddr !== undefined ? targetAddr : geoAddress || '').trim();
    if (!query) {
      toast({ title: '검색할 주소를 입력해주세요.', variant: 'destructive' });
      return;
    }
    setSearchingGeo(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
        headers: { 'Accept-Language': 'en' }
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lat = Number(parseFloat(data[0].lat).toFixed(6));
        const lng = Number(parseFloat(data[0].lon).toFixed(6));
        set('gps_lat', lat);
        set('gps_lng', lng);
        toast({ title: '출퇴근 인증 위치 좌표가 성공적으로 설정되었습니다.' });
      } else {
        toast({ title: '해당 주소의 위치 좌표를 찾을 수 없습니다. 도로명과 도시명을 자세히 입력해주세요.', variant: 'destructive' });
      }
    } catch {
      toast({ title: '주소 위치 조회 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setSearchingGeo(false);
    }
  };

  // 상단 매장 주소 적용 버튼
  const useStoreAddress = () => {
    const storeAddr = [form?.address, form?.suburb, form?.state, form?.postcode].filter(Boolean).join(', ');
    if (!storeAddr) {
      toast({ title: '상단 매장 정보에 주소를 먼저 입력해주세요.', variant: 'destructive' });
      return;
    }
    setGeoAddress(storeAddr);
    searchCoordsByAddress(storeAddr);
  };

  const useMyLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        set('gps_lat', Number(pos.coords.latitude.toFixed(6)));
        set('gps_lng', Number(pos.coords.longitude.toFixed(6)));
        toast({ title: '현재 위치로 출퇴근 인증 좌표가 설정되었습니다.' });
      },
      () => toast({ title: t('clock.denied'), variant: 'destructive' })
    );
  };

  const save = async () => {
    if (!branch || !form || savingRef.current) return;
    if (hasOverlappingTradingHours(form.trading_hours)) {
      toast({ title: t('property.overlapHours'), variant: 'destructive' });
      return;
    }
    savingRef.current = true;
    setSaving(true);
    const payload = {
      ...form,
      employee_number_padding: Number(form.employee_number_padding) || 3,
      employee_next_number: Number(form.employee_next_number) || 1,
      gps_lat: Number(form.gps_lat) || 0,
      gps_lng: Number(form.gps_lng) || 0,
      gps_radius_m: Number(form.gps_radius_m) || 100
    };

    try {
      try {
        await base44.entities.Branch.update(branch.id, payload);
      } catch (err) {
        // A short burst can trip the per-app request limit; pause briefly and try once more.
        if (err?.response?.status !== 429) throw err;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await base44.entities.Branch.update(branch.id, payload);
      }
      // Keep the shared branch list in step so re-opening settings shows what was just saved.
      patchBranch(branch.id, payload);
      toast({ title: t('property.saved') });
    } catch {
      toast({ title: t('property.saveFailed'), variant: 'destructive' });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (!branch || !form) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  // Branch-level permissions are set from the top: the company admin, or the position the
  // platform presets as the one that runs the company's stores.
  const canConfigureBranchAccess = role === 'company_admin' || presetKey === 'pro_director';
  const customRoles = (company && company.custom_roles) || [];
  const branchMatrixRoles = customRoles.map((role) => role.key);
  // The platform position preset a company role sits under is shown next to it, so the ceiling
  // the table applies is never a mystery.
  const branchRoleLabels = Object.fromEntries(
    customRoles.map((role) => {
      const preset = presets.find((item) => item.key === role.preset_key);
      const translatedRoleLabel = formatRoleLabel(role.label, lang);
      const presetLabel = preset ? (lang === 'en' ? (preset.label_en || formatRoleLabel(preset.label, 'en') || preset.key) : (preset.label || preset.key)) : '';
      return [role.key, presetLabel ? `${translatedRoleLabel} · ${presetLabel}` : translatedRoleLabel];
    })
  );
  // A branch moves inside what the company (and the package, and the position preset) already
  // allows, so only those modules appear and every row stops at that ceiling.
  const branchPackageModules = MODULES.filter(
    (module) => !pkg || !pkg.package || (pkg.modules || []).includes(module)
  );
  const branchCeilings = Object.fromEntries(
    customRoles.map((role) => {
      const preset = presets.find((item) => item.key === role.preset_key);
      const presetAccess = (preset && preset.access) || {};
      const companyGrant = (company && company.role_permissions && company.role_permissions[role.key]) || {};
      const merged = {};
      MODULES.forEach((module) => {
        const cap = presetAccess[module];
        if (!cap) return;
        const capScope = cap.scope || 'branch';
        const saved = companyGrant[module];
        // The company has no answer of its own for this area, so the position's preset is what
        // the branch starts on and moves from.
        if (!saved) {
          merged[module] = { level: cap.level, scope: capScope };
          return;
        }
        const cell = normalizeCell(saved);
        // The company already closed this module for the position: the branch cannot reopen it.
        if (cell.level === 'none') return;
        merged[module] = {
          level: levelRank(cell.level) <= levelRank(cap.level) ? cell.level : cap.level,
          scope: !cell.scope || scopeRank(cell.scope) <= scopeRank(capScope) ? cell.scope || capScope : capScope
        };
      });
      return [role.key, merged];
    })
  );

  return (
    <div>
      <PageHeader title={t('property.title')} subtitle={branch.name} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('property.info')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t('branches.branchName') || '매장명'}</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <Label>{t('branches.code') || '지점 코드'}</Label>
              <Input value={form.code} onChange={(e) => set('code', e.target.value)} />
            </div>
            <div>
              <Label>{t('common.phone')}</Label>
              <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t('common.address')}</Label>
              <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div>
              <Label>{t('branches.suburb') || 'Suburb'}</Label>
              <Input value={form.suburb} onChange={(e) => set('suburb', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('branches.state') || 'State'}</Label>
                <Input value={form.state} onChange={(e) => set('state', e.target.value)} />
              </div>
              <div>
                <Label>{t('branches.postcode') || 'Postcode'}</Label>
                <Input value={form.postcode} onChange={(e) => set('postcode', e.target.value)} />
              </div>
            </div>
            <div className="sm:col-span-2 pt-2 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                {t('branches.contactHeader') || '고용주 / 세무 서류 담당자 정보 (ATO Section B 연동)'}
              </p>
            </div>
            <div>
              <Label>{t('branches.contactName') || '담당자 이름'}</Label>
              <Input
                value={form.contact_name || ''}
                onChange={(e) => set('contact_name', e.target.value)}
                placeholder="예: PAYROLL MANAGER"
              />
            </div>
            <div>
              <Label>{t('branches.contactEmail') || '고용주 공식 이메일'}</Label>
              <Input
                type="email"
                value={form.contact_email || ''}
                onChange={(e) => set('contact_email', e.target.value)}
                placeholder="예: payroll@company.com"
              />
            </div>
            <div>
              <Label>{t('branches.contactPhone') || '담당자 직통 전화번호'}</Label>
              <Input
                value={form.contact_phone || ''}
                onChange={(e) => set('contact_phone', e.target.value)}
                placeholder="예: 0412 345 678"
              />
            </div>
            <div className="sm:col-span-2 pt-2 border-t border-slate-100">
              <Label>{t('property.hours')}</Label>
              <TradingHoursEditor value={form.trading_hours} onChange={(next) => set('trading_hours', next)} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('property.numberFormat')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Label>{t('property.prefix')}</Label>
                <Input value={form.employee_prefix} onChange={(e) => set('employee_prefix', e.target.value)} placeholder="KFC-MAS-" />
              </div>
              <div>
                <Label>{t('property.padding')}</Label>
                <Input
                  type="number"
                  value={form.employee_number_padding}
                  onChange={(e) => set('employee_number_padding', e.target.value)}
                />
              </div>
              <div>
                <Label>{t('property.nextNumber')}</Label>
                <Input
                  type="number"
                  value={form.employee_next_number}
                  onChange={(e) => set('employee_next_number', e.target.value)}
                />
              </div>
              <div className="sm:col-span-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                {t('property.preview')}:{' '}
                <span className="font-mono font-semibold">
                  {employeeNumberPreview(form.employee_prefix, form.employee_number_padding, form.employee_next_number)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('branches.geoTitle') || '출퇴근 위치 인증 반경 설정'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('branches.geoHint') || '직원이 매장 근처에서만 출퇴근을 기록할 수 있도록 매장 위치와 인증 반경을 설정합니다. 주소를 입력하시면 위도·경도 좌표가 자동으로 계산됩니다.'}
              </p>

              {/* 주소 검색 입력창 */}
              <div className="space-y-1.5">
                <Label className="text-xs">{t('branches.geoAddressLabel') || '인증 기준 매장 주소'}</Label>
                <div className="flex gap-2">
                  <Input
                    value={geoAddress}
                    onChange={(e) => setGeoAddress(e.target.value)}
                    placeholder="예: 123 George St, Sydney NSW 2000"
                    className="flex-1 text-sm"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => searchCoordsByAddress(geoAddress)}
                    disabled={searchingGeo}
                    className="gap-1 whitespace-nowrap text-xs"
                  >
                    {searchingGeo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    <span>{t('branches.geoSearchBtn') || '주소로 좌표 찾기'}</span>
                  </Button>
                </div>
              </div>

              {/* 빠른 설정 버튼들 (매장 주소 적용, 현재 위치 사용) */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={useStoreAddress}
                  disabled={searchingGeo}
                  className="gap-1.5 text-xs h-9"
                  title="상단 매장 정보에 입력된 주소를 사용하여 좌표를 자동 설정합니다"
                >
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  <span>{t('branches.geoUseStoreBtn') || '매장 주소 적용'}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={useMyLocation}
                  className="gap-1.5 text-xs h-9"
                  title="현재 있는 위치의 GPS 좌표로 바로 설정합니다"
                >
                  <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{t('property.useLocation') || '현재 위치 사용'}</span>
                </Button>
              </div>

              {/* 좌표 설정 상태 안내 뱃지 */}
              <div className="rounded-lg border px-3 py-2 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t('branches.geoStatus') || '위치 인증 상태:'}</span>
                {form.gps_lat && form.gps_lng ? (
                  <span className="font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> {t('branches.geoConfigured') || '인증 좌표 설정 완료'}
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <MapPinOff className="h-3.5 w-3.5" /> {t('branches.geoNotConfigured') || '좌표 미설정 (주소 검색 필요)'}
                  </span>
                )}
              </div>

              {/* 인증 반경 (미터) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('property.radius') || '허용 반경 (미터)'}</Label>
                  <span className="text-xs text-muted-foreground font-mono">{form.gps_radius_m || 100}m</span>
                </div>
                <Input
                  type="number"
                  min={10}
                  max={5000}
                  value={form.gps_radius_m ?? ''}
                  onChange={(e) => set('gps_radius_m', e.target.value)}
                  placeholder="100"
                />
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Every position's permissions are the ones its platform preset grants, and this branch
          moves them from there — up or down inside that range. Full width so every job title
          fits on one screen. */}
      {canConfigureBranchAccess && (
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{t('perm.branchTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-xs text-muted-foreground">{t('perm.branchHint')}</p>
          {branchMatrixRoles.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              {t('perm.noRoles')}
            </p>
          ) : (
            <AccessMatrixEditor
              value={form.role_permissions}
              onChange={(next) => set('role_permissions', next)}
              roles={branchMatrixRoles}
              roleLabels={branchRoleLabels}
              ceilings={branchCeilings}
              modules={branchPackageModules}
              presetBaseline
            />
          )}
        </CardContent>
      </Card>
      )}

      <Button className="mt-6" onClick={save} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t('common.save')}
      </Button>
    </div>
  );
}