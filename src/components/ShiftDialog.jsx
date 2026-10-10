import React, { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

// One shift: added for a day that has none, or opened from the roster to change its hours or take
// it off the week. A shift that has already gone to staff carries the change to that person by
// email, because what they were told no longer matches the roster.
export default function ShiftDialog({
  open,
  onOpenChange,
  branch,
  employees,
  defaultDate,
  defaultEmployee,
  shift,
  onSaved
}) {
  const { t } = useI18n();
  const { company } = useWorkspace();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const editing = Boolean(shift);
  // Job titles always come from the company's own list, so the roster uses the same names everywhere.
  const roles = ((company && company.custom_roles) || []).map((role) => role.label).filter(Boolean);
  const held = [defaultEmployee && defaultEmployee.position, shift && shift.position].filter(
    (label) => label && !roles.includes(label)
  );
  const positions = [...new Set([...roles, ...held])];
  const person = editing
    ? { user_email: shift.employee_email, full_name: shift.employee_name || shift.employee_email }
    : defaultEmployee;
  const [form, setForm] = useState({
    employee_email: '',
    date: '',
    start_time: '09:00',
    end_time: '17:00',
    position: '',
    break_min: 30,
    notes: ''
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      employee_email: person ? person.user_email : '',
      date: (shift && shift.date) || defaultDate || '',
      start_time: (shift && shift.start_time) || '09:00',
      end_time: (shift && shift.end_time) || '17:00',
      position: (shift && shift.position) || (person && person.position) || roles[0] || '',
      break_min: shift ? Number(shift.break_min) || 0 : 30,
      notes: (shift && shift.notes) || ''
    });
  }, [open, defaultDate, defaultEmployee, shift]);

  // The person on a sent shift is told the new hours; a draft or a saved one stays quiet.
  const tellThem = async (change, details) => {
    if (!editing || shift.status !== 'published') return;
    await base44.functions
      .invoke('notifyShiftChange', {
        branch_id: branch.id,
        employee_email: details.email,
        change,
        published: true,
        date: details.date,
        start_time: details.start_time,
        end_time: details.end_time,
        position: details.position
      })
      .catch(() => null);
  };

  const submit = async () => {
    if (!branch || !form.employee_email || !form.date) {
      toast({ title: 'Choose a staff member and a date', variant: 'destructive' });
      return;
    }
    const toMinutes = (value) => {
      const [hour, minute] = String(value || '').split(':').map(Number);
      return (hour || 0) * 60 + (minute || 0);
    };
    const start = toMinutes(form.start_time);
    const end = toMinutes(form.end_time);
    if (end <= start) {
      toast({ title: 'End time must be after the start time', variant: 'destructive' });
      return;
    }
    const sameDayPage = await base44.entities.Shift
      .filter({ branch_id: branch.id, employee_email: form.employee_email, date: form.date })
      .catch(() => null);
    const sameDay = ((sameDayPage && sameDayPage.items) || sameDayPage || []).filter(
      (row) => !editing || row.id !== shift.id
    );
    const clash = sameDay.some((row) => start < toMinutes(row.end_time) && toMinutes(row.start_time) < end);
    if (clash) {
      toast({ title: 'This staff member already has an overlapping shift', variant: 'destructive' });
      return;
    }
    // Approved leave takes the day out of the roster, so a shift cannot be placed on it.
    const approvedLeave = await base44.entities.LeaveRequest
      .filter({
        employee_email: form.employee_email,
        status: 'approved',
        start_date: { $lte: form.date },
        end_date: { $gte: form.date }
      })
      .catch(() => []);
    if ((approvedLeave || []).length > 0) {
      toast({ title: t('roster.onLeaveBlocked'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    if (editing) {
      await base44.entities.Shift.update(shift.id, {
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        position: form.position,
        break_min: Number(form.break_min) || 0,
        notes: form.notes
      });
      await tellThem('updated', {
        email: shift.employee_email,
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        position: form.position
      });
      toast({ title: t('roster.shiftUpdated') });
    } else {
      const employee = employees.find((e) => e.user_email === form.employee_email);
      await base44.entities.Shift.create({
        company_id: branch.company_id,
        branch_id: branch.id,
        employee_email: form.employee_email,
        employee_name: employee ? employee.full_name : form.employee_email,
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        position: form.position,
        break_min: Number(form.break_min) || 0,
        notes: form.notes,
        status: 'draft'
      });
      toast({ title: t('roster.shiftAdded') });
    }
    setSaving(false);
    onOpenChange(false);
    // The day and the position the shift was placed in, so the roster can take that day's open
    // seat off the screen.
    onSaved && onSaved({ date: form.date, position: form.position });
  };

  const cancelShift = async () => {
    setSaving(true);
    await base44.entities.Shift.delete(shift.id);
    await tellThem('cancelled', {
      email: shift.employee_email,
      date: shift.date,
      start_time: shift.start_time,
      end_time: shift.end_time,
      position: shift.position
    });
    setSaving(false);
    toast({ title: t('roster.shiftCancelled') });
    onOpenChange(false);
    onSaved && onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? t('roster.editShiftTitle') : t('roster.addShiftTitle')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {person ? (
            <div className="sm:col-span-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="font-medium">{person.full_name}</span>
              {person.position ? <span className="text-muted-foreground"> · {person.position}</span> : null}
            </div>
          ) : (
            <div className="sm:col-span-2">
              <Label>Staff member</Label>
              <Select value={form.employee_email} onValueChange={(v) => setForm({ ...form, employee_email: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.user_email}>
                      {e.full_name} {e.position ? `· ${e.position}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <Label>{t('common.position')}</Label>
            <Select
              value={form.position}
              onValueChange={(v) => setForm({ ...form, position: v })}
              disabled={positions.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('role.select')} />
              </SelectTrigger>
              <SelectContent>
                {positions.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {positions.length === 0 && <p className="mt-1 text-xs text-muted-foreground">{t('roster.noPositions')}</p>}
          </div>
          <div>
            <Label>Start</Label>
            <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </div>
          <div>
            <Label>End</Label>
            <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
          <div>
            <Label>Break (min)</Label>
            <Input
              type="number"
              value={form.break_min}
              onChange={(e) => setForm({ ...form, break_min: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          {editing && shift.status === 'published' ? (
            <p className="sm:col-span-2 text-xs text-muted-foreground">{t('roster.sentChangeHint')}</p>
          ) : null}
        </div>
        <DialogFooter className="sm:justify-between">
          {editing ? (
            <Button variant="destructive" onClick={cancelShift} disabled={saving}>
              <Trash2 className="mr-2 h-4 w-4" /> {t('roster.cancelShift')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? t('roster.saveShift') : t('roster.addShiftAction')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}