import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import PackageCard from '@/components/package/PackageCard';
import OnboardingDocsCard from '@/components/company/OnboardingDocsCard';
import OnboardingQuestionsCard from '@/components/company/OnboardingQuestionsCard';
import OnboardingSetupCard from '@/components/company/OnboardingSetupCard';
import PayMultipliersCard, { payMultipliers, paySettings } from '@/components/company/PayMultipliersCard';
import PublicHolidayCard from '@/components/company/PublicHolidayCard';
import CompanyRolesManager from '@/components/CompanyRolesManager';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { videoInterviewAllowed } from '@/lib/packages';
import { clampAccess, grantedModules, levelRank, moduleLabelKey, normalizeCell, scopeRank } from '@/lib/access';
import { canSaveSettings, saveCompanySettings } from '@/lib/companySettings';
import { cleanDocTypes, docTypesOf } from '@/lib/onboardingDocs';
import { questionsFromDraft, toDraft } from '@/lib/onboardingQuestions';
import CompanyPicker from '@/components/platform/CompanyPicker';
import { base44 } from '@/api/base44Client';

// Some settings panels only make sense with the modules behind them: the permission table belongs
// to a staff list, penalty rates to a roster.
const PANEL_MODULES = {
  permissions: ['employees'],
  pay: ['roster']
};

export default function CompanySettings() {
  const { t } = useI18n();
  const { company, role, isPlatformAdmin, isCompanyAdmin, access, pkg, presets, feature, hasModule, levelOf, patchCompany } = useWorkspace();
  const videoAllowed = isPlatformAdmin || videoInterviewAllowed(pkg);
  const miniAllowed = isPlatformAdmin || feature('mini_interview');
  // 슈퍼어드민은 모든 설정을 무제한 저장 가능하며, 일반 사용자는 기존 권한 검사를 따릅니다.
  const canSave = isPlatformAdmin || canSaveSettings({ role, isCompanyAdmin, access, levelOf });
  const { toast } = useToast();
  const [tab, setTab] = useState('company');
  const [form, setForm] = useState(null);
  // The onboarding tab is part of this page's own Save: both of its lists are held here until Save
  // is pressed, so one button writes the whole screen.
  const [onboarding, setOnboarding] = useState(null);
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
      video_interview_enabled: company.video_interview_enabled !== false,
      screening_criteria: company.screening_criteria || '',
      pay_multipliers: paySettings(company.pay_multipliers),
      // A grant saved before an area stopped offering create-and-delete is pulled back to
      // what the table now offers, so the screen never shows a level it cannot explain.
      role_permissions: clampAccess(company.role_permissions || {}),
      custom_roles: company.custom_roles || []
    });
    setOnboarding({
      docTypes: docTypesOf(company).map((type) => ({
        key: type.key,
        label: type.label || type.label_en || '',
        label_en: type.label_en || '',
        kind: type.kind || 'file',
        required: type.required !== false,
        secure: Boolean(type.secure)
      })),
      questions: toDraft(company.onboarding_questions),
      fieldVisibility: company.onboarding_field_visibility || {},
      secureFields: company.onboarding_secure_fields || {},
      employerSignature: company.tfn_employer_signature || ''
    });
  }, [company]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // Anything wider than the linked preset allows is cut back to the ceiling.
  const clampToCeiling = (access, ceiling) => {
    const out = {};
    Object.entries(access || {}).forEach(([module, raw]) => {
      const cell = normalizeCell(raw);
      const cap = ceiling[module];
      if (!cap || !cell.level || cell.level === 'none') return;
      const level = levelRank(cell.level) <= levelRank(cap.level) ? cell.level : cap.level;
      const capScope = cap.scope || 'branch';
      const scope = !cell.scope || scopeRank(cell.scope) <= scopeRank(capScope) ? cell.scope || capScope : capScope;
      out[module] = { level, scope };
    });
    return out;
  };

  // Moving a role onto a narrower preset pulls its permissions back to the new ceiling and
  // says which ones moved.
  const setCustomRoles = (next) => {
    const relinked = (next || []).filter((role) => {
      const before = (form.custom_roles || []).find((item) => item.key === role.key);
      return before && before.preset_key !== role.preset_key;
    });
    const narrowed = [];
    setForm((prev) => {
      const permissions = { ...(prev.role_permissions || {}) };
      relinked.forEach((roleEntry) => {
        const preset = presets.find((item) => item.key === roleEntry.preset_key);
        const before = permissions[roleEntry.key] || {};
        permissions[roleEntry.key] = clampToCeiling(before, (preset && preset.access) || {});
        grantedModules(before).forEach((module) => {
          if (!permissions[roleEntry.key][module]) narrowed.push(t(moduleLabelKey(module)));
        });
      });
      return { ...prev, custom_roles: next, role_permissions: permissions };
    });
    if (narrowed.length > 0) {
      toast({ title: t('role.narrowed').replace('{list}', Array.from(new Set(narrowed)).join(', ')) });
    }
  };

  const save = async () => {
    if (!company || !form) return;
    setSaving(true);
    const payload = {
      ...form,
      ai_top_n: Number(form.ai_top_n) || 10,
      pay_multipliers: paySettings(form.pay_multipliers),
      // The onboarding paperwork is saved by this same button: the documents a new hire hands in,
      // and the questions the employee answers on their onboarding link.
      onboarding_doc_types: cleanDocTypes(onboarding.docTypes),
      onboarding_questions: questionsFromDraft(onboarding.questions),
      onboarding_field_visibility: onboarding.fieldVisibility || {},
      onboarding_secure_fields: onboarding.secureFields || {},
      tfn_employer_signature: onboarding.employerSignature || ''
    };
    try {
      // The server decides whether this person may save the company's settings, and it is the
      // server's answer that says the save happened.
      await saveCompanySettings(company.id, payload);
      // 고용주 공식 전자서명을 DB에 직접 확실하게 영구 저장
      if (onboarding.employerSignature) {
        await base44.entities.Company.update(company.id, {
          tfn_employer_signature: onboarding.employerSignature
        }).catch(() => null);
      }
      // Saving keeps the screen where it is: the workspace copy of the company is updated in
      // place instead of reloading the whole back office, so the open tab stays open.
      patchCompany(payload);
      toast({ title: t('settings.saved') });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('settings.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  // A super admin who has not entered a company yet picks one here instead of waiting on
  // settings that belong to no company.
  if (isPlatformAdmin && !company) {
    return (
      <div>
        <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
        <CompanyPicker />
      </div>);

  }

  if (!form || !onboarding) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;

  const CATEGORIES = [
    { key: 'company', label: t('settings.cat.company') },
    { key: 'docs', label: t('settings.cat.docs') },
    { key: 'screening', label: t('settings.cat.screening') },
    { key: 'permissions', label: t('settings.cat.permissions') },
    { key: 'pay', label: t('settings.cat.pay') }
  ].filter((category) => isPlatformAdmin || (PANEL_MODULES[category.key] || []).every((module) => hasModule(module)));
  // A panel this package does not carry is never the open one.
  const activeTab = CATEGORIES.some((category) => category.key === tab) ? tab : 'company';

  return (
    <div>
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
        actions={
        <Button onClick={save} disabled={saving || !canSave}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        } />

      <Tabs value={activeTab} onValueChange={setTab}>
        <div className="overflow-x-auto pb-1 mb-6">
          <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 justify-start">
            {CATEGORIES.map((category) => (
              <TabsTrigger key={category.key} value={category.key} className="text-xs sm:text-sm whitespace-nowrap">
                {category.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="company" className="space-y-6">
          <PackageCard />

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
        </TabsContent>

        <TabsContent value="docs" className="space-y-6">
          <OnboardingSetupCard
            types={onboarding.docTypes}
            onChange={(docTypes) => setOnboarding((prev) => ({ ...prev, docTypes }))}
            fieldVisibility={onboarding.fieldVisibility}
            onFieldVisibilityChange={(fieldVisibility) => setOnboarding((prev) => ({ ...prev, fieldVisibility }))}
            secureFields={onboarding.secureFields}
            onSecureFieldsChange={(secureFields) => setOnboarding((prev) => ({ ...prev, secureFields }))}
            employerSignature={onboarding.employerSignature}
            onEmployerSignatureChange={(employerSignature) =>
              setOnboarding((prev) => ({ ...prev, employerSignature }))
            }
            canEdit={canSave}
          />
          <OnboardingQuestionsCard
            questions={onboarding.questions}
            onChange={(questions) => setOnboarding((prev) => ({ ...prev, questions }))}
            canEdit={canSave}
          />
          <OnboardingDocsCard />
        </TabsContent>

        <TabsContent value="screening">
          <Card>
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
              {miniAllowed && (
              <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                <span className="text-sm">{t('interview.mini')}</span>
                <Switch checked={form.mini_interview_enabled} onCheckedChange={(v) => set('mini_interview_enabled', v)} />
              </div>)}
              {videoAllowed && (
              <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 sm:col-span-3">
                <div>
                  <p className="text-sm">{t('settings.videoInterview')}</p>
                  <p className="text-xs text-muted-foreground">{t('settings.videoInterviewHint')}</p>
                </div>
                <Switch
                  checked={form.video_interview_enabled}
                  onCheckedChange={(v) => set('video_interview_enabled', v)} />
                
              </div>)}
              <div className="sm:col-span-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Label>{t('settings.screeningFocus')}</Label>
                  {/* The interview questions sit in the interview settings module: a package
                      without it sets no questions here. */}
                  {hasModule('interview_settings') && (
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/interview-settings">{t('settings.interviewSetup')}</Link>
                    </Button>
                  )}
                </div>
                <Textarea
                  rows={4}
                  value={form.screening_criteria}
                  onChange={(e) => set('screening_criteria', e.target.value)}
                  placeholder="예: 바리스타 경력 2년 이상, 주말 야간 근무 가능, 장기 근무 의향" />
                
                <p className="mt-1 text-xs text-muted-foreground">{t('settings.screeningFocusHint')}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('perm.companyTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="mb-1 block">{t('role.title')}</Label>
                <p className="mb-3 text-xs text-muted-foreground">{t('role.hint')}</p>
                {/* Whoever the company lets save its settings also names its job titles. */}
                <CompanyRolesManager
                  value={form.custom_roles}
                  onChange={setCustomRoles}
                  presets={presets}
                  disabled={!canSave} />
                
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pay">
          <div className="space-y-4">
            <PayMultipliersCard
              value={form.pay_multipliers}
              onChange={(next) => set('pay_multipliers', next)}
              disabled={!canSave} />
            <PublicHolidayCard multiplier={payMultipliers(form.pay_multipliers).public_holiday} />
          </div>
        </TabsContent>
      </Tabs>
    </div>);

}