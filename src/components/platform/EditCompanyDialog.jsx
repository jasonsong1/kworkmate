import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';

// The two details that identify a company everywhere — the name every screen shows and the ABN
// printed on its records. The platform owner corrects them here.
export default function EditCompanyDialog({ company, open, onOpenChange, onSaved }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [abn, setAbn] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !company) return;
    setName(company.name || '');
    setAbn(company.abn || '');
  }, [open, company]);

  const save = async () => {
    const nextName = name.trim();
    if (!nextName || !company) return;
    setSaving(true);
    try {
      const nextAbn = abn.trim();
      await base44.entities.Company.update(company.id, { name: nextName, abn: nextAbn });
      onSaved && onSaved({ ...company, name: nextName, abn: nextAbn });
      onOpenChange(false);
      toast({ title: t('company.edited') });
    } catch (error) {
      toast({ title: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('company.editCompany')}</DialogTitle>
          <DialogDescription>{t('company.editHint')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="platform-company-name">{t('company.fieldName')}</Label>
            <Input id="platform-company-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="platform-company-abn">{t('settings.abn')}</Label>
            <Input id="platform-company-abn" value={abn} onChange={(e) => setAbn(e.target.value)} placeholder="00 000 000 000" />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}