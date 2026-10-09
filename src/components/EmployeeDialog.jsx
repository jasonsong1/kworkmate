import React, { useEffect, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
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
import { usePermissions } from '@/lib/permissions';
import { base44 } from '@/api/base44Client';

const empty = {
  full_name: '',
  user_email: '',
  position: '',
  secondary_position: '',
  extra_positions: [],
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
  const { canEdit } = usePermissions();
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canAssignRole = myRole === 'company_admin';
  // Completion is only reachable once the employee has actually submitted their onboarding.
  const onboardingSubmitted = Boolean(employee && employee.onboarding_submitted_at);
  // The position on the record is the employer's own list from company settings — the same list
  // the roster plans with. Whoever the employer gave the staff list to may set it, while the role
  // key behind a position is still only handed out by a company admin. A position already stored
  // stays listed even when it is no longer in the company's list, so nothing is lost on a save.
  const canEditEmployees = canEdit('employees') || canAssignRole;
  const positionLabels = (company && company.custom_roles || []).map((item) => item.label);
  const positionOptions =
  form.position && !positionLabels.includes(form.position) ? [...positionLabels, form.position] : positionLabels;
  const hasPositions = positionLabels.length > 0;
  const pickPosition = (label) => {
    const match = (company && company.custom_roles || []).find((item) => item.label === label);
    setForm((prev) => ({ ...prev, position: label, ...(match && canAssignRole ? { app_role: match.key } : {}) }));
  };

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
        extra_positions: Array.isArray(employee.extra_positions) ? employee.extra_positions : [],
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

  // A person can cover several positions: one main, one secondary and then as many more as the
  // employer needs, up to ten in all.
  const MAX_POSITIONS = 10;
  const maxExtra = MAX_POSITIONS - 2;
  const addPosition = () =>
    setForm((prev) => (prev.extra_positions.length >= maxExtra ? prev : { ...prev, extra_positions: [...prev.extra_positions, ''] }));
  const setExtraPosition = (index, value) =>
    setForm((prev) => ({
      ...prev,
      extra_positions: prev.extra_positions.map((item, at) => (at === index ? value : item))
    }));
  const removePosition = (index) =>
    setForm((prev) => ({ ...prev, extra_positions: prev.extra_positions.filter((item, at) => at !== index) }));

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
          user_email: form.user_email.trim().toLowerCase(),
          position: form.position || (employee && employee.position) || '',
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
              onChange={(e) => set('user_email', e.target.value)}
              placeholder="staff@email.com" />
            <p className="mt-1 text-xs text-muted-foreground">{t('employees.emailHint')}</p>
            
          </div>
          <div>
            <Label>{t('common.position')}</Label>
            <Select value={form.position || ''} onValueChange={pickPosition} disabled={!canEditEmployees}>
              <SelectTrigger>
                <SelectValue placeholder={t('role.select')} />
              </SelectTrigger>
              <SelectContent>
                {positionOptions.map((label) =>
                <SelectItem key={label} value={label}>
                    {label}
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
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <Label>{t('employees.secondaryPosition')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPosition}
                disabled={!canEditEmployees || form.extra_positions.length >= maxExtra}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> {t('employees.addPosition')}
              </Button>
            </div>
            <Select value={form.secondary_position || ''} onValueChange={(v) => set('secondary_position', v)} disabled={!canEditEmployees}>
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

            {form.extra_positions.length > 0 &&
            <div className="mt-2 space-y-2">
                {form.extra_positions.map((label, index) =>
              <div key={index} className="flex items-center gap-2">
                    <Select value={label || ''} onValueChange={(v) => setExtraPosition(index, v)} disabled={!canEditEmployees}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('role.select')} />
                      </SelectTrigger>
                      <SelectContent>
                        {positionLabels.map((option) =>
                    <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                    )}
                        {label && !positionLabels.includes(label) && <SelectItem value={label}>{label}</SelectItem>}
                      </SelectContent>
                    </Select>
                    <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removePosition(index)}
                  disabled={!canEditEmployees}
                  aria-label="Remove position">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
              )}
                <p className="text-xs text-muted-foreground">{t('employees.positionsHint')}</p>
              </div>
            }
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