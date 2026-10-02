import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, MapPin } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import PermissionMatrixEditor from '@/components/PermissionMatrixEditor';
import TradingHoursEditor, { hasOverlappingTradingHours } from '@/components/TradingHoursEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { employeeNumberPreview } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

export default function PropertySetup() {
  const { t } = useI18n();
  const { branches, activeBranch, patchBranch, company } = useWorkspace();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const branchId = params.get('branch') || (activeBranch && activeBranch.id);
  const branch = branches.find((b) => b.id === branchId) || activeBranch;

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

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
      trading_hours: branch.trading_hours || '',
      employee_prefix: branch.employee_prefix || '',
      employee_number_padding: branch.employee_number_padding || 3,
      employee_next_number: branch.employee_next_number || 1,
      gps_lat: branch.gps_lat ?? '',
      gps_lng: branch.gps_lng ?? '',
      gps_radius_m: branch.gps_radius_m || 100,
      role_permissions: branch.role_permissions || {}
    });
  }, [branch]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const useMyLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        set('gps_lat', Number(pos.coords.latitude.toFixed(6)));
        set('gps_lng', Number(pos.coords.longitude.toFixed(6)));
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
      navigate('/branches');
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

  const customRoles = (company && company.custom_roles) || [];
  const branchMatrixRoles = customRoles.map((role) => role.key);
  const branchRoleLabels = Object.fromEntries(customRoles.map((role) => [role.key, role.label]));

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
              <Label>Branch name</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <Label>Code</Label>
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
              <Label>Suburb</Label>
              <Input value={form.suburb} onChange={(e) => set('suburb', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>State</Label>
                <Input value={form.state} onChange={(e) => set('state', e.target.value)} />
              </div>
              <div>
                <Label>Postcode</Label>
                <Input value={form.postcode} onChange={(e) => set('postcode', e.target.value)} />
              </div>
            </div>
            <div className="sm:col-span-2">
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
              <CardTitle className="text-base">{t('property.geo')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Latitude</Label>
                <Input value={form.gps_lat} onChange={(e) => set('gps_lat', e.target.value)} />
              </div>
              <div>
                <Label>Longitude</Label>
                <Input value={form.gps_lng} onChange={(e) => set('gps_lng', e.target.value)} />
              </div>
              <div>
                <Label>{t('property.radius')}</Label>
                <Input
                  type="number"
                  value={form.gps_radius_m}
                  onChange={(e) => set('gps_radius_m', e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" className="w-full" onClick={useMyLocation}>
                  <MapPin className="mr-2 h-4 w-4" /> {t('property.useLocation')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
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
                <PermissionMatrixEditor
                  value={form.role_permissions}
                  onChange={(next) => set('role_permissions', next)}
                  base={company && company.role_permissions}
                  roles={branchMatrixRoles}
                  roleLabels={branchRoleLabels}
                  allowInherit
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Button className="mt-6" onClick={save} disabled={saving}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t('common.save')}
      </Button>
    </div>
  );
}