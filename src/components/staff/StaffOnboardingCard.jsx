import React, { useEffect, useRef, useState } from 'react';
import { Check, Clock, Loader2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { checklistFor, fieldVisibilityOf } from '@/lib/onboardingDocs';
import { kwSessionAction } from '@/lib/kwAuthClient';
import { base44 } from '@/api/base44Client';

// The employee's own side of onboarding: the details their employer asks for, and one file per
// document on the employer's list. They choose which document an upload is, so nothing has to be
// guessed from a file name.
export default function StaffOnboardingCard() {
  const { t, lang } = useI18n();
  const { company, employeeProfile } = useWorkspace();
  const { toast } = useToast();
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState('');
  const [busyUri, setBusyUri] = useState('');
  const fileRef = useRef(null);
  const pickKey = useRef('');

  const profile = record || employeeProfile;

  useEffect(() => {
    const row = employeeProfile;
    if (!row) return;
    setRecord(null);
    setForm({
      address: row.address || '',
      date_of_birth: row.date_of_birth || '',
      emergency_contact_name: row.emergency_contact_name || '',
      emergency_contact_phone: row.emergency_contact_phone || '',
      tfn_number: row.tfn_number || '',
      tfn_pending: row.tfn_pending === true,
      super_choice: row.super_choice === 'custom_fund' ? 'custom_fund' : 'default_fund',
      super_fund_name: row.super_fund_name || '',
      super_usi: row.super_usi || '',
      super_member_number: row.super_member_number || '',
      bank_bsb: row.bank_bsb || '',
      bank_account_number: row.bank_account_number || '',
      bank_account_name: row.bank_account_name || ''
    });
  }, [employeeProfile]);

  if (!profile || !form) return null;

  const visible = fieldVisibilityOf(company);
  const checklist = checklistFor(profile, company, lang);
  const percent = checklist.requiredTotal === 0 ? 100 : (checklist.requiredDone / checklist.requiredTotal) * 100;
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const detailsForSave = () => {
    const data = {};
    if (visible.address) data.address = form.address;
    if (visible.date_of_birth) data.date_of_birth = form.date_of_birth;
    if (visible.emergency_contact) {
      data.emergency_contact_name = form.emergency_contact_name;
      data.emergency_contact_phone = form.emergency_contact_phone;
    }
    if (visible.tax) {
      data.tfn_number = form.tfn_number;
      data.tfn_pending = form.tfn_pending;
    }
    if (visible.super) {
      data.super_choice = form.super_choice;
      data.super_fund_name = form.super_choice === 'custom_fund' ? form.super_fund_name : '';
      data.super_usi = form.super_choice === 'custom_fund' ? form.super_usi : '';
      data.super_member_number = form.super_member_number;
    }
    if (visible.bank) {
      data.bank_bsb = form.bank_bsb;
      data.bank_account_number = form.bank_account_number;
      data.bank_account_name = form.bank_account_name;
    }
    return data;
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await kwSessionAction({ action: 'save_onboarding', data: detailsForSave() });
      if (saved && saved.profile) setRecord(saved.profile);
      toast({ title: t('ob.saved') });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const chooseFile = (key) => {
    pickKey.current = key;
    if (fileRef.current) {
      fileRef.current.value = '';
      fileRef.current.click();
    }
  };

  const upload = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const key = pickKey.current;
    setUploadingKey(key);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const saved = await kwSessionAction({
        action: 'add_document',
        file_uri,
        name: file.name,
        doc_type: key
      });
      if (saved && saved.profile) setRecord(saved.profile);
      toast({ title: t('ob.uploaded') });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.uploadFailed') });
    } finally {
      setUploadingKey('');
    }
  };

  const openDoc = async (file) => {
    if (!file || !file.file_uri) return;
    setBusyUri(file.file_uri);
    try {
      const signed = await kwSessionAction({ action: 'sign_document', file_uri: file.file_uri });
      if (signed && signed.signed_url) window.open(signed.signed_url, '_blank', 'noopener');
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.uploadFailed') });
    } finally {
      setBusyUri('');
    }
  };

  const removeDoc = async (file) => {
    if (!file || !file.file_uri) return;
    setBusyUri(file.file_uri);
    try {
      const saved = await kwSessionAction({ action: 'delete_document', file_uri: file.file_uri });
      if (saved && saved.profile) setRecord(saved.profile);
      toast({ title: t('ob.removed') });
    } catch (error) {
      toast({ variant: 'destructive', title: error.message || t('ob.uploadFailed') });
    } finally {
      setBusyUri('');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('ob.title')}</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">{t('ob.hint')}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {t('ob.progress')
                .replace('{done}', String(checklist.requiredDone))
                .replace('{total}', String(checklist.requiredTotal))}
            </span>
            {checklist.complete && (
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{t('ob.completed')}</Badge>
            )}
          </div>
          <Progress value={percent} className="mt-2 h-1.5" />
        </div>

        <div className="divide-y rounded-xl border">
          {checklist.items.map((item) => (
            <div key={item.key} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              {item.done ? (
                <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.required ? t('ob.required') : t('ob.optional')}
                  {item.file && item.file.name ? ` · ${item.file.name}` : ''}
                </p>
              </div>
              {item.kind === 'info' ? (
                <span className="text-xs text-muted-foreground">{t('ob.infoNote')}</span>
              ) : uploadingKey === item.key ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
              ) : (
                <div className="flex items-center gap-1.5">
                  {item.file && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyUri === item.file.file_uri}
                      onClick={() => openDoc(item.file)}
                    >
                      {t('ob.open')}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => chooseFile(item.key)}>
                    {item.file ? t('ob.replace') : t('ob.upload')}
                  </Button>
                  {item.file && item.file.uploaded_by === 'self' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      title={t('common.delete')}
                      disabled={busyUri === item.file.file_uri}
                      onClick={() => removeDoc(item.file)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
          onChange={upload}
        />

        <div className="space-y-3 rounded-xl border p-4">
          <div>
            <p className="text-sm font-semibold">{t('ob.details')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('ob.detailsHint')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.address && (
              <div className="sm:col-span-2">
                <Label>{t('ob.field.address')}</Label>
                <Input value={form.address} onChange={(event) => set('address', event.target.value)} />
              </div>
            )}
            {visible.date_of_birth && (
              <div>
                <Label>{t('ob.field.date_of_birth')}</Label>
                <Input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(event) => set('date_of_birth', event.target.value)}
                />
              </div>
            )}
            {visible.emergency_contact && (
              <>
                <div>
                  <Label>{t('ob.emergencyName')}</Label>
                  <Input
                    value={form.emergency_contact_name}
                    onChange={(event) => set('emergency_contact_name', event.target.value)}
                  />
                </div>
                <div>
                  <Label>{t('ob.emergencyPhone')}</Label>
                  <Input
                    value={form.emergency_contact_phone}
                    onChange={(event) => set('emergency_contact_phone', event.target.value)}
                  />
                </div>
              </>
            )}
            {visible.tax && (
              <>
                <div>
                  <Label>{t('ob.tfn')}</Label>
                  <Input
                    value={form.tfn_number}
                    disabled={form.tfn_pending}
                    onChange={(event) => set('tfn_number', event.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 self-end rounded-xl border px-4 py-2.5">
                  <span className="text-sm">{t('ob.tfnPending')}</span>
                  <Switch checked={form.tfn_pending} onCheckedChange={(value) => set('tfn_pending', value)} />
                </div>
              </>
            )}
            {visible.super && (
              <div className="sm:col-span-2">
                <Label>{t('ob.superChoice')}</Label>
                <Select value={form.super_choice} onValueChange={(value) => set('super_choice', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default_fund">
                      {t('ob.superDefault')}
                      {company && company.default_super_fund_name ? ` · ${company.default_super_fund_name}` : ''}
                    </SelectItem>
                    <SelectItem value="custom_fund">{t('ob.superCustom')}</SelectItem>
                  </SelectContent>
                </Select>
                {form.super_choice === 'custom_fund' && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label>{t('ob.superFund')}</Label>
                      <Input value={form.super_fund_name} onChange={(event) => set('super_fund_name', event.target.value)} />
                    </div>
                    <div>
                      <Label>{t('ob.superUsi')}</Label>
                      <Input value={form.super_usi} onChange={(event) => set('super_usi', event.target.value)} />
                    </div>
                    <div>
                      <Label>{t('ob.superMember')}</Label>
                      <Input
                        value={form.super_member_number}
                        onChange={(event) => set('super_member_number', event.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            {visible.bank && (
              <>
                <div>
                  <Label>{t('ob.bankBsb')}</Label>
                  <Input value={form.bank_bsb} onChange={(event) => set('bank_bsb', event.target.value)} />
                </div>
                <div>
                  <Label>{t('ob.bankAccount')}</Label>
                  <Input
                    value={form.bank_account_number}
                    onChange={(event) => set('bank_account_number', event.target.value)}
                  />
                </div>
                <div>
                  <Label>{t('ob.bankHolder')}</Label>
                  <Input
                    value={form.bank_account_name}
                    onChange={(event) => set('bank_account_name', event.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}