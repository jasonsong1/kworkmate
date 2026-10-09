import React, { useEffect, useState } from 'react';
import { Loader2, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { HOURS_PER_DAY, daysBetween, hoursLabel, typeName } from '@/lib/leave';

import { todayIso } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

// Asking for leave. The hours leave the available balance the moment it is sent, so the same
// hours cannot be booked twice while a manager decides.
export default function LeaveRequestDialog({ open, onOpenChange, types, onSubmitted }) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const [form, setForm] = useState({ key: '', start_date: todayIso(), end_date: todayIso(), hours: '', reason: '' });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const type = (types || []).find((item) => item.key === form.key) || null;
  const days = daysBetween(form.start_date, form.end_date);

  useEffect(() => {
    if (!open) return;
    setForm({ key: (types[0] && types[0].key) || '', start_date: todayIso(), end_date: todayIso(), hours: '', reason: '' });
    setFile(null);
  }, [open, types]);

  const hours = Number(form.hours) > 0 ? Number(form.hours) : Math.round(days * HOURS_PER_DAY * 100) / 100;

  // A refused request comes back either as an answer or as a failed call, so the reason is dug out
  // of wherever the server put it before it is turned into a sentence.
  const payloadOf = (error) => {
    const direct = (error && error.response && error.response.data) || (error && error.data);
    if (direct && typeof direct === 'object') return direct;
    const match = /\{[\s\S]*\}/.exec(String((error && error.message) || ''));
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return {};
      }
    }
    return {};
  };

  // What the person is told when the request is refused: the real reason, with the hours left when
  // the answer carries them, never a bare "could not be sent".
  const refused = (data) => {
    const code = String((data && data.error) || '');
    const left = Number(data && data.available);
    if (code === 'insufficient' || code === 'insufficient_balance') {
      if (Number.isFinite(left)) return t('leave.insufficientLeft').replace('{hours}', hoursLabel(left));
      return t('leave.insufficient');
    }
    if (code === 'not_eligible') return t('leave.notEligible');
    if (code === 'invalid_hours' || code === 'invalid_dates') return t('leave.invalidRequest');
    if (code === 'unknown_type') return t('leave.unknownType');
    if (code === 'no_profile') return t('leave.noProfile');
    // A sentence the server wrote itself is shown as it stands; a bare code is not.
    if (code.includes(' ')) return code;
    return t('leave.requestFailed');
  };

  const submit = async () => {
    if (!type) return;
    setSaving(true);
    let uploaded = null;
    if (file) {
      const result = await base44.integrations.Core.UploadPrivateFile({ file }).catch(() => null);
      uploaded = result && result.file_uri ? result : null;
    }
    try {
      const response = await base44.functions.invoke('submitLeaveRequest', {
        leave_type_key: type.key,
        start_date: form.start_date,
        end_date: form.end_date,
        hours,
        reason: form.reason,
        certificate_file_uri: uploaded ? uploaded.file_uri : '',
        certificate_filename: uploaded ? file.name : ''
      });
      const data = (response && response.data) || {};
      if (data.error) {
        toast({ title: refused(data), variant: 'destructive' });
        return;
      }
      toast({ title: t('leave.submitted') });
      onOpenChange(false);
      onSubmitted && onSubmitted();
    } catch (error) {
      // A refused request (not enough hours left) comes back as a failed call, so the reason is read
      // from the answer and shown: the button never stays spinning on an error.
      toast({ title: refused(payloadOf(error)), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('leave.requestTitle')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>{t('leave.type')}</Label>
            <Select value={form.key} onValueChange={(value) => setForm({ ...form, key: value })}>
              <SelectTrigger>
                <SelectValue placeholder={t('common.select')} />
              </SelectTrigger>
              <SelectContent>
                {(types || []).map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.emoji ? `${item.emoji} ` : ''}
                    {typeName(item, lang)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('leave.from')}</Label>
            <Input
              type="date"
              value={form.start_date}
              onChange={(event) => {
                const start = event.target.value;
                setForm((prev) => ({ ...prev, start_date: start, end_date: prev.end_date < start ? start : prev.end_date }));
              }}
            />
          </div>
          <div>
            <Label>{t('leave.to')}</Label>
            <Input
              type="date"
              value={form.end_date}
              min={form.start_date}
              onChange={(event) => setForm({ ...form, end_date: event.target.value })}
            />
          </div>
          <div>
            <Label>{t('leave.hours')}</Label>
            <Input
              type="number"
              min="0"
              step="0.5"
              placeholder={String(hours)}
              value={form.hours}
              onChange={(event) => setForm({ ...form, hours: event.target.value })}
            />
          </div>
          <div className="flex items-end">
            <p className="text-xs text-muted-foreground">
              {t('leave.daysCount').replace('{days}', String(days)).replace('{hours}', hoursLabel(hours))}
            </p>
          </div>
          <div className="sm:col-span-2">
            <Label>{t('leave.reason')}</Label>
            <Textarea
              rows={2}
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
              placeholder={t('common.optional')}
            />
          </div>
          {type && type.requires_certificate ? (
            <div className="sm:col-span-2 rounded-lg border border-dashed px-3 py-3">
              <Label className="flex items-center gap-2">
                <Paperclip className="h-3.5 w-3.5" /> {t('leave.certificate')}
              </Label>
              <p className="mt-1 text-[11px] text-muted-foreground">{t('leave.certificateHint')}</p>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(event) => setFile((event.target.files || [])[0] || null)}
                className="mt-2 block w-full text-xs"
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={saving || !type}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('leave.request')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}