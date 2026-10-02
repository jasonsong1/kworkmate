import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import CompanyAdminsCard from '@/components/CompanyAdminsCard';
import CompanyRolesManager from '@/components/CompanyRolesManager';
import PermissionMatrixEditor from '@/components/PermissionMatrixEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import CompanyPicker from '@/components/platform/CompanyPicker';
import { base44 } from '@/api/base44Client';

export default function CompanySettings() {
  const { t } = useI18n();
  const { company, reload, role, isPlatformAdmin } = useWorkspace();
  const { toast } = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!company) return;
    setForm({
      name: company.name || '',
      abn: company.abn || '',
      contact_email: company.contact_email || '',
      contact_phone: company.contact_phone || '',
      default_super_fund_name: company.default_super_fund_name || '',
      default_super_fund_abn: company.default_super_fund_abn || '',
      default_super_fund_usi: company.default_super_fund_usi || '',
      default_super_fund_phone: company.default_super_fund_phone || '',
      ai_top_n: company.ai_top_n || 10,
      auto_reject_email: company.auto_reject_email !== false,
      mini_interview_enabled: company.mini_interview_enabled !== false,
      video_interview_enabled: company.video_interview_enabled === true,
      screening_criteria: company.screening_criteria || '',
      role_permissions: company.role_permissions || {},
      custom_roles: company.custom_roles || []
    });
  }, [company]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // Removing a role also drops the permissions that were granted to it.
  const setCustomRoles = (next) => {
    const kept = new Set((next || []).map((role) => role.key));
    const removed = (form.custom_roles || []).filter((role) => !kept.has(role.key)).map((role) => role.key);
    setForm((prev) => {
      const permissions = { ...(prev.role_permissions || {}) };
      removed.forEach((key) => {
        delete permissions[key];
      });
      return { ...prev, custom_roles: next, role_permissions: permissions };
    });
  };

  const save = async () => {
    if (!company || !form) return;
    setSaving(true);
    await base44.entities.Company.update(company.id, {
      ...form,
      ai_top_n: Number(form.ai_top_n) || 10
    });
    await reload();
    setSaving(false);
    toast({ title: t('settings.saved') });
  };

  // A super admin who has not entered a company yet picks one here instead of waiting on
  // settings that belong to no company.
  if (isPlatformAdmin && !company) {
    return (
      <div>
        <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
        <CompanyPicker />
      </div>
    );
  }

  if (!form) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;

  const customRoles = form.custom_roles || [];
  // Only the roles the company itself defined get a permission column.
  const matrixRoles = customRoles.map((role) => role.key);
  const roleLabels = Object.fromEntries(customRoles.map((role) => [role.key, role.label]));

  return (
    <div>
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
        actions={
          <Button onClick={save} disabled={saving || role !== 'company_admin'}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('common.company')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t('common.name')}</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <Label>{t('settings.abn')}</Label>
              <Input value={form.abn} onChange={(e) => set('abn', e.target.value)} />
            </div>
            <div>
              <Label>{t('common.phone')}</Label>
              <Input value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t('common.email')}</Label>
              <Input value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('settings.super')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>{t('settings.fundName')}</Label>
              <Input value={form.default_super_fund_name} onChange={(e) => set('default_super_fund_name', e.target.value)} />
            </div>
            <div>
              <Label>{t('settings.usi')}</Label>
              <Input value={form.default_super_fund_usi} onChange={(e) => set('default_super_fund_usi', e.target.value)} />
            </div>
            <div>
              <Label>{t('settings.abn')}</Label>
              <Input value={form.default_super_fund_abn} onChange={(e) => set('default_super_fund_abn', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t('common.phone')}</Label>
              <Input value={form.default_super_fund_phone} onChange={(e) => set('default_super_fund_phone', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('settings.screening')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-3">
            <div>
              <Label>{t('settings.topN')}</Label>
              <Input type="number" value={form.ai_top_n} onChange={(e) => set('ai_top_n', e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <span className="text-sm">{t('settings.autoReject')}</span>
              <Switch checked={form.auto_reject_email} onCheckedChange={(v) => set('auto_reject_email', v)} />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <span className="text-sm">{t('interview.mini')}</span>
              <Switch checked={form.mini_interview_enabled} onCheckedChange={(v) => set('mini_interview_enabled', v)} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 sm:col-span-3">
              <div>
                <p className="text-sm">{t('settings.videoInterview')}</p>
                <p className="text-xs text-muted-foreground">{t('settings.videoInterviewHint')}</p>
              </div>
              <Switch
                checked={form.video_interview_enabled}
                onCheckedChange={(v) => set('video_interview_enabled', v)}
              />
            </div>
            <div className="sm:col-span-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Label>{t('settings.screeningFocus')}</Label>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/interview-settings">{t('settings.interviewSetup')}</Link>
                </Button>
              </div>
              <Textarea
                rows={4}
                value={form.screening_criteria}
                onChange={(e) => set('screening_criteria', e.target.value)}
                placeholder="예: 바리스타 경력 2년 이상, 주말 야간 근무 가능, 장기 근무 의향"
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('settings.screeningFocusHint')}</p>
            </div>
          </CardContent>
        </Card>

        <CompanyAdminsCard />

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('perm.companyTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="mb-1 block">{t('role.title')}</Label>
              <p className="mb-3 text-xs text-muted-foreground">{t('role.hint')}</p>
              <CompanyRolesManager
                value={form.custom_roles}
                onChange={setCustomRoles}
                disabled={role !== 'company_admin'}
              />
            </div>
            <div>
              <p className="mb-3 text-xs text-muted-foreground">{t('perm.companyHint')}</p>
              {matrixRoles.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  {t('perm.noRoles')}
                </p>
              ) : (
                <PermissionMatrixEditor
                  value={form.role_permissions}
                  onChange={(next) => set('role_permissions', next)}
                  roles={matrixRoles}
                  roleLabels={roleLabels}
                  disabled={role !== 'company_admin'}
                />
              )}
              <p className="mt-3 text-xs text-muted-foreground">{t('perm.locked')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}