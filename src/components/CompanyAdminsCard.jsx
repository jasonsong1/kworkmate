import React, { useState } from 'react';
import { Loader2, Plus, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

export default function CompanyAdminsCard() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { company, role, patchCompany } = useWorkspace();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!company || role !== 'company_admin') return null;

  const admins = company.member_emails || [];
  const canEdit = admins.length > 1;

  const run = async (action, value) => {
    setBusy(true);
    setError('');
    const response = await base44.functions.invoke('manageCompanyAdmin', {
      action,
      email: value,
      company_id: company.id
    });
    setBusy(false);
    const data = response.data || {};
    if (data.error) {
      setError(data.error);
      return;
    }
    patchCompany({ member_emails: data.member_emails || [] });
    if (action === 'add') setEmail('');
    toast({ title: action === 'add' ? t('admins.added') : t('admins.removed') });
  };

  const add = () => {
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setError(t('admins.badEmail'));
      return;
    }
    if (admins.includes(value)) {
      setError(t('admins.already'));
      return;
    }
    run('add', value);
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">{t('admins.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t('admins.hint')}</p>

        <div className="flex flex-wrap gap-2">
          {admins.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-medium"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              {item}
              {canEdit && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run('remove', item)}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={t('admins.addPlaceholder')}
            className="max-w-xs"
          />
          <Button type="button" variant="outline" onClick={add} disabled={busy || !email.trim()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {t('admins.add')}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}