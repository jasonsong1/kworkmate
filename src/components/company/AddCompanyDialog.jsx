import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

export default function AddCompanyDialog({ open, onOpenChange }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { refreshWorkspace } = useWorkspace();
  const [name, setName] = useState('');
  const [abn, setAbn] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setAbn('');
      setError('');
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      setError(t('company.nameRequired'));
      return;
    }
    setSaving(true);
    setError('');
    const response = await base44.functions.invoke('createCompany', { name, abn });
    if (response.data?.error) {
      setSaving(false);
      setError(response.data.error);
      return;
    }
    await refreshWorkspace();
    setSaving(false);
    onOpenChange(false);
    toast({ title: t('company.created') });
    navigate('/branches');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('company.new')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t('company.nameLabel')} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="KFC" />
          </div>
          <div>
            <Label>{t('company.abn')}</Label>
            <Input value={abn} onChange={(e) => setAbn(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">{t('company.createHint')}</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('company.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}