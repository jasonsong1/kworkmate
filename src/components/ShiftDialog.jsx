import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { POSITIONS } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

export default function ShiftDialog({ open, onOpenChange, branch, employees, defaultDate, defaultEmployee, onSaved }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    employee_email: '',
    date: defaultDate || '',
    start_time: '09:00',
    end_time: '17:00',
    position: 'Crew',
    break_min: 30,
    notes: ''
  });

  useEffect(() => {
    if (!open) return;
    setForm((prev) => ({
      ...prev,
      date: defaultDate || prev.date,
      employee_email: defaultEmployee ? defaultEmployee.user_email : '',
      position: defaultEmployee && defaultEmployee.position ? defaultEmployee.position : prev.position
    }));
  }, [open, defaultDate, defaultEmployee]);

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
    const sameDay = await base44.entities.Shift
      .filter({ branch_id: branch.id, employee_email: form.employee_email, date: form.date })
      .catch(() => []);
    const clash = (sameDay || []).some(
      (shift) => start < toMinutes(shift.end_time) && toMinutes(shift.start_time) < end
    );
    if (clash) {
      toast({ title: 'This staff member already has an overlapping shift', variant: 'destructive' });
      return;
    }
    setSaving(true);
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
    setSaving(false);
    onOpenChange(false);
    toast({ title: 'Shift added' });
    onSaved && onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add shift</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {defaultEmployee ? (
            <div className="sm:col-span-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="font-medium">{defaultEmployee.full_name}</span>
              {defaultEmployee.position ? (
                <span className="text-muted-foreground"> · {defaultEmployee.position}</span>
              ) : null}
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
            <Label>Position</Label>
            <Select value={form.position} onValueChange={(v) => setForm({ ...form, position: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POSITIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}