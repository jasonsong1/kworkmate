import React, { useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import LeaveTypeCard from '@/components/leave/LeaveTypeCard';
import { base44 } from '@/api/base44Client';

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
}

// The leave menu for the company: which leave it offers and how each one is earned, granted
// and expired. Saving it never touches the balances the team already holds.
export default function LeaveTypeSettingsDialog({ open, onOpenChange, companyId, types, onSaved }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [list, setList] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setList((types || []).map((type) => ({ ...type })));
  }, [open, types]);

  const addType = () =>
    setList((prev) => [
      ...prev,
      {
        key: '',
        name: '',
        name_ko: '',
        emoji: '🗓️',
        paid: true,
        accrual_method: 'none',
        accrual_rate: 0,
        employment_types: [],
        grant_enabled: false,
        grant_hours: 0,
        grant_period: 'yearly',
        grant_anchor: 'calendar_year',
        grant_employment_types: [],
        expiry_enabled: false,
        expiry_months: 12,
        requires_certificate: false,
        custom: true,
        active: true
      }
    ]);

  const save = async () => {
    const prepared = list.map((type) => ({ ...type, key: type.key || slug(type.name_ko || type.name) }));
    if (prepared.some((type) => !type.key || !type.name)) {
      toast({ title: t('leave.needName'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    const response = await base44.functions.invoke('saveLeaveTypes', { company_id: companyId, types: prepared });
    setSaving(false);
    if (response.data && response.data.error) {
      toast({ title: t('leave.saveFailed'), variant: 'destructive' });
      return;
    }
    toast({ title: t('leave.saved') });
    onOpenChange(false);
    onSaved && onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('leave.settings')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('leave.settingsHint')}</p>

        <div className="space-y-4">
          {list.map((type, index) => (
            <LeaveTypeCard
              key={`${type.key || 'new'}-${index}`}
              type={type}
              onChange={(next) => setList((prev) => prev.map((item, i) => (i === index ? next : item)))}
              onRemove={() => setList((prev) => prev.filter((_, i) => i !== index))}
            />
          ))}
          <Button variant="outline" onClick={addType}>
            <Plus className="mr-2 h-4 w-4" /> {t('leave.addType')}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={saving || list.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}