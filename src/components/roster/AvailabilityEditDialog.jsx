import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { AVAILABILITY_TIMES, DAYS, normalizeAvailability, setDayAvailability } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

const NONE = 'none';

// A manager can fix what someone submitted — people often only mention a change in person.
export default function AvailabilityEditDialog({ open, onOpenChange, employee, submission, branch, weekStart, onSaved }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [matrix, setMatrix] = useState(normalizeAvailability(null));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMatrix(normalizeAvailability(submission ? submission.availability : null));
  }, [open, submission]);

  const update = (dayKey, patch) => setMatrix((prev) => setDayAvailability(prev, dayKey, patch));

  const save = async () => {
    if (!employee || !branch) return;
    setSaving(true);
    const response = await base44.functions.invoke('saveAvailabilityEdit', {
      submission_id: submission ? submission.id : '',
      branch_id: branch.id,
      employee_email: employee.user_email,
      employee_name: employee.full_name,
      week_start: weekStart,
      availability: matrix
    });
    setSaving(false);
    if (response.data?.error) {
      toast({ title: response.data.error, variant: 'destructive' });
      return;
    }
    onOpenChange(false);
    toast({ title: t('roster.availabilitySaved') });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('roster.availabilityEditTitle')}</DialogTitle>
          <DialogDescription>
            {employee ? employee.full_name : ''} · {t('roster.availabilityEditHint')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {DAYS.map((day) => {
            const entry = matrix[day.key] || { from: '', to: '' };
            const on = Boolean(entry.from && entry.to);
            return (
              <div key={day.key} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
                <span className="w-20 text-sm font-medium">{day.short}</span>
                <Switch
                  checked={on}
                  onCheckedChange={(value) =>
                    update(day.key, value ? { from: entry.from || '09:00', to: entry.to || '17:00' } : { from: '', to: '' })
                  }
                />
                {on ? (
                  <div className="flex items-center gap-2">
                    <Select value={entry.from} onValueChange={(value) => update(day.key, { from: value })}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABILITY_TIMES.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">→</span>
                    <Select value={entry.to} onValueChange={(value) => update(day.key, { to: value })}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABILITY_TIMES.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">{t('roster.noSubmission')}</span>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}