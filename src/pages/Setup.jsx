import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Loader2, MapPin } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

export default function Setup() {
  const { t } = useI18n();
  const { reload } = useWorkspace();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    company_name: '',
    abn: '',
    contact_email: '',
    contact_phone: '',
    fund_name: '',
    fund_abn: '',
    fund_usi: '',
    fund_phone: '',
    branch_name: '',
    branch_code: '',
    address: '',
    suburb: '',
    state: '',
    postcode: '',
    trading_hours: '',
    gps_lat: '',
    gps_lng: '',
    gps_radius_m: 100
  });

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const useMyLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        set('gps_lat', pos.coords.latitude.toFixed(6));
        set('gps_lng', pos.coords.longitude.toFixed(6));
      },
      () => toast({ title: t('clock.denied'), variant: 'destructive' })
    );
  };

  const submit = async () => {
    if (!form.company_name.trim() || !form.branch_name.trim()) {
      setError('Company name and first branch name are required.');
      return;
    }
    setSaving(true);
    setError('');
    const response = await base44.functions.invoke('setupCompany', {
      company: {
        name: form.company_name,
        abn: form.abn,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        default_super_fund_name: form.fund_name,
        default_super_fund_abn: form.fund_abn,
        default_super_fund_usi: form.fund_usi,
        default_super_fund_phone: form.fund_phone
      },
      branch: {
        name: form.branch_name,
        code: form.branch_code,
        address: form.address,
        suburb: form.suburb,
        state: form.state,
        postcode: form.postcode,
        trading_hours: form.trading_hours,
        gps_lat: form.gps_lat,
        gps_lng: form.gps_lng,
        gps_radius_m: form.gps_radius_m
      }
    });
    setSaving(false);
    if (response.data?.error) {
      setError(response.data.error);
      return;
    }
    await reload();
    navigate('/', { replace: true });
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <PageHeader title={t('setup.title')} subtitle={t('setup.subtitle')} />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" /> {t('common.company')}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Company name *</Label>
              <Input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} placeholder="KFC Australia" />
            </div>
            <div>
              <Label>ABN</Label>
              <Input value={form.abn} onChange={(e) => set('abn', e.target.value)} />
            </div>
            <div>
              <Label>Contact phone</Label>
              <Input value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Contact email</Label>
              <Input value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} placeholder="hr@company.com.au" />
            </div>
            <div>
              <Label>{t('settings.fundName')}</Label>
              <Input value={form.fund_name} onChange={(e) => set('fund_name', e.target.value)} placeholder="AustralianSuper" />
            </div>
            <div>
              <Label>{t('settings.usi')}</Label>
              <Input value={form.fund_usi} onChange={(e) => set('fund_usi', e.target.value)} />
            </div>
            <div>
              <Label>{t('settings.abn')}</Label>
              <Input value={form.fund_abn} onChange={(e) => set('fund_abn', e.target.value)} />
            </div>
            <div>
              <Label>Fund phone</Label>
              <Input value={form.fund_phone} onChange={(e) => set('fund_phone', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" /> First branch
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Branch name *</Label>
              <Input value={form.branch_name} onChange={(e) => set('branch_name', e.target.value)} placeholder="KFC Mascot" />
            </div>
            <div>
              <Label>Branch code</Label>
              <Input value={form.branch_code} onChange={(e) => set('branch_code', e.target.value)} placeholder="MAS" />
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
                <Input value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="NSW" />
              </div>
              <div>
                <Label>Postcode</Label>
                <Input value={form.postcode} onChange={(e) => set('postcode', e.target.value)} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>{t('property.hours')}</Label>
              <Input value={form.trading_hours} onChange={(e) => set('trading_hours', e.target.value)} placeholder="Mon–Sun 10:00–22:00" />
            </div>
            <div>
              <Label>GPS latitude</Label>
              <Input value={form.gps_lat} onChange={(e) => set('gps_lat', e.target.value)} />
            </div>
            <div>
              <Label>GPS longitude</Label>
              <Input value={form.gps_lng} onChange={(e) => set('gps_lng', e.target.value)} />
            </div>
            <div>
              <Label>{t('property.radius')}</Label>
              <Input type="number" value={form.gps_radius_m} onChange={(e) => set('gps_radius_m', e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={useMyLocation} className="w-full">
                <MapPin className="mr-2 h-4 w-4" /> {t('property.useLocation')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={submit} disabled={saving} className="w-full sm:w-auto">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('common.create')}
        </Button>
      </div>
    </div>
  );
}