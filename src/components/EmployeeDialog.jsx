import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { EMPLOYMENT_TYPES, VISA_TYPES } from '@/lib/bh';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

const empty = {
  full_name: '',
  user_email: '',
  position: '',
  secondary_position: '',
  visa_type: '',
  app_role: 'staff',
  hourly_rate: '',
  employment_type: 'casual',
  start_date: '',
  phone: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  language: 'ko',
  pin: '',
  onboarding_status: 'pending',
  send_invite: true,
  send_onboarding_email: true
};

export default function EmployeeDialog({ open, onOpenChange, branch, employee, onSaved }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { company, role: myRole } = useWorkspace();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canAssignRole = myRole === 'company_admin';
  // Completion is only reachable once the employee has actually submitted their onboarding.
  const onboardingSubmitted = Boolean(employee && employee.onboarding_submitted_at);
  // Positions come from company settings. Company admins are appointed there too, and a
  // branch manager keeps the role they were assigned, so both stay listed when already held.
  const roleOptions = [
  ...(form.app_role === 'company_admin' ? [{ key: 'company_admin', label: t('perm.role.company_admin') }] : []),
  ...(form.app_role === 'branch_manager' ? [{ key: 'branch_manager', label: t('perm.role.branch_manager') }] : []),
  ...(company && company.custom_roles || []).map((item) => ({ key: item.key, label: item.label }))];

  const chosen = roleOptions.find((option) => option.key === form.app_role);
  const hasPositions = (company && company.custom_roles || []).length > 0;
  // The secondary position offers the same list as the position itself.
  const positionLabels = (company && company.custom_roles || []).map((item) => item.label);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (employee) {
      setForm({
        ...empty,
        full_name: employee.full_name || '',
        user_email: employee.user_email || '',
        position: employee.position || '',
        secondary_position: employee.secondary_position || '',
        visa_type: employee.visa_type || '',
        app_role: employee.app_role || 'staff',
        hourly_rate: employee.hourly_rate ?? '',
        employment_type: employee.employment_type || 'casual',
        start_date: employee.start_date || '',
        phone: employee.phone || '',
        emergency_contact_name: employee.emergency_contact_name || '',
        emergency_contact_phone: employee.emergency_contact_phone || '',
        language: employee.language === 'en' ? 'en' : 'ko',
        onboarding_status: employee.onboarding_status || 'pending',
        send_invite: false,
        send_onboarding_email: false
      });
    } else {
      setForm(empty);
    }
  }, [open, employee]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // What the employer is told about the account itself: a brand new address is invited, while
  // one the platform already knows simply has its way back in reopened.
  const accessNote = (data) => {
    if (data.email_error) return data.email_error;
    if (data.invited) return t('employees.accessInvited');
    if (data.existing) return data.password_email_sent ? t('employees.accessRestored') : t('employees.accessKnown');
    return t('employees.accessGranted');
  };

  const submit = async () => {
    if (!branch) return;
    if (!form.full_name.trim() || !form.user_email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await base44.functions.invoke('manageEmployee', {
        action: employee ? 'update' : 'create',
        branch_id: branch.id,
        origin: window.location.origin,
        employee: {
          ...form,
          position: chosen ? chosen.label : employee && employee.position || '',
          ...(employee ? { id: employee.id } : {})
        }
      });
      if (response.data?.error) {
        setError(response.data.error);
        return;
      }
      const saved = response.data || {};
      const savedId = employee ? employee.id : saved.employee && saved.employee.id;
      toast({
        title: employee ? t('employees.updated') : `${t('employees.added')} · ${saved.employee_number}`
      });
      onOpenChange(false);
      onSaved && onSaved();

      // The account is opened and its mail sent in a following call, so a slow invitation or
      // mail provider never keeps the form on screen.
      if (savedId) {
        base44.functions.
        invoke('manageEmployee', {
          action: 'grant_access',
          employee_id: savedId,
          origin: window.location.origin,
          send_invite: form.send_invite,
          send_onboarding_email: form.send_onboarding_email
        }).
        then((result) => {
          const access = result.data || {};
          if (access.error) {
            toast({ variant: 'destructive', title: access.error });
            return;
          }
          if (!employee) toast({ title: accessNote(access) });
        }).
        catch(() => {});
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{employee ? t('common.edit') : t('employees.add')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{t('common.name')} *</Label>
            <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
          </div>
          <div>
            <Label>{t('common.email')} *</Label>
            <Input
              value={form.user_email}
              disabled={Boolean(employee)}
              onChange={(e) => set('user_email', e.target.value)}
              placeholder="staff@email.com" />
            
          </div>
          <div>
            <Label>{t('common.position')}</Label>
            <Select
              value={chosen ? form.app_role : ''}
              onValueChange={(v) => set('app_role', v)}
              disabled={!canAssignRole}>
              
              <SelectTrigger>
                <SelectValue placeholder={t('role.select')} />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((option) =>
                <SelectItem key={option.key} value={option.key}>
                    {option.label}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {form.app_role === 'company_admin' ?
              t('role.adminHint') :
              hasPositions ?
              t('role.employeeHint') :
              t('role.noneHint')}
            </p>
          </div>
          <div>
            <Label>{t('employees.secondaryPosition')}</Label>
            <Select value={form.secondary_position || ''} onValueChange={(v) => set('secondary_position', v)}>
              <SelectTrigger>
                <SelectValue placeholder={t('role.select')} />
              </SelectTrigger>
              <SelectContent>
                {positionLabels.map((label) =>
                <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                )}
                {form.secondary_position && !positionLabels.includes(form.secondary_position) &&
                <SelectItem value={form.secondary_position}>{form.secondary_position}</SelectItem>
                }
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">{t('employees.secondaryPositionHint')}</p>
          </div>
          <div>
            <Label>{t('employees.visa')}</Label>
            <Select value={form.visa_type || ''} onValueChange={(v) => set('visa_type', v)}>
              <SelectTrigger>
                <SelectValue placeholder={t('common.select')} />
              </SelectTrigger>
              <SelectContent>
                {VISA_TYPES.map((v) =>
                <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          


          
          <div>
            <Label>Employment type</Label>
            <Select value={form.employment_type} onValueChange={(v) => set('employment_type', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((e) =>
                <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Start date</Label>
            <Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </div>
          <div>
            <Label>{t('common.phone')}</Label>
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div>
            <Label>Emergency contact</Label>
            <Input
              value={form.emergency_contact_name}
              onChange={(e) => set('emergency_contact_name', e.target.value)} />
            
          </div>
          <div>
            <Label>Emergency phone</Label>
            <Input
              value={form.emergency_contact_phone}
              onChange={(e) => set('emergency_contact_phone', e.target.value)} />
            
          </div>
          <div>
            <Label>{t('employees.uiLanguage')}</Label>
            <Select value={form.language} onValueChange={(v) => set('language', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ko">{t('employees.languageKo')}</SelectItem>
                <SelectItem value="en">{t('employees.languageEn')}</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">{t('employees.uiLanguageHint')}</p>
          </div>
          <div>
            <Label>{t('employees.pin')}</Label>
            <Input
              value={form.pin}
              inputMode="numeric"
              autoComplete="off"
              onChange={(e) => set('pin', e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={employee && employee.pin_hash ? t('employees.pinSet') : t('employees.pinNew')} />
            <p className="mt-1 text-xs text-muted-foreground">{t('employees.pinHint')}</p>
          </div>

          {!employee &&
          <>
              <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                <span className="text-sm">{t('employees.inviteHint')}</span>
                <Switch checked={form.send_invite} onCheckedChange={(v) => set('send_invite', v)} />
              </div>
              <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                <span className="text-sm">{t('employees.sendOnboarding')}</span>
                <Switch
                checked={form.send_onboarding_email}
                onCheckedChange={(v) => set('send_onboarding_email', v)} />
              
              </div>
            </>
          }

          {employee &&
          <div className="sm:col-span-2 space-y-3 rounded-lg border px-4 py-3">
              <div className="flex items-center justify-between gap-4">
              <span className="text-sm">{t('employees.sendOnboarding')}</span>
              <Switch
              checked={form.send_onboarding_email}
              onCheckedChange={(v) => set('send_onboarding_email', v)} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm">{t('employees.onboarding')}</span>
                <Select
                value={form.onboarding_status}
                onValueChange={(v) => set('onboarding_status', v)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t('employees.statusPending')}</SelectItem>
                    <SelectItem value="in_progress">{t('employees.statusInProgress')}</SelectItem>
                    <SelectItem
                    value="completed"
                    disabled={!onboardingSubmitted && form.onboarding_status !== 'completed'}>
                      {t('employees.statusCompleted')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!onboardingSubmitted &&
              <p className="text-xs text-muted-foreground">{t('employees.statusLocked')}</p>
              }
            </div>
          }
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);

}