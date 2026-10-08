import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { DAYS } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

const DEFAULT_SHIFTS = [
  { key: 'open', label: 'Open', start_time: '08:00', end_time: '15:00' },
  { key: 'close', label: 'Close', start_time: '15:00', end_time: '22:00' }
];

const cellKey = (shiftKey, day, position) => `${shiftKey}::${day}::${position}`;
// Monday is day 0 in the saved requirements, which is where the day keys start.
const dayLabel = (dayIndex, t) => t(`day.${(dayIndex + 1) % 7}`);

// The store's shift patterns, how many people it needs for each position day by day, and the
// people the employer always wants on a given day. The auto-builder reads all of it.
export default function RosterSettingsDialog({ open, onOpenChange, branch, onSaved }) {
  const { t } = useI18n();
  const { company } = useWorkspace();
  const { toast } = useToast();
  const [settingId, setSettingId] = useState('');
  const [shifts, setShifts] = useState(DEFAULT_SHIFTS);
  const [counts, setCounts] = useState({});
  const [fixed, setFixed] = useState({});
  const [staff, setStaff] = useState([]);
  const [minRest, setMinRest] = useState(10);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const positions = ((company && company.custom_roles) || []).map((role) => role.label);

  useEffect(() => {
    if (!open || !branch) return;
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      const [page, staffPage] = await Promise.all([
        base44.entities.RosterSetting.filter({ branch_id: branch.id }, { limit: 1 }),
        base44.entities.EmployeeProfile
          .filter({ branch_id: branch.id, status: 'active' }, { sort: 'full_name', limit: 200 })
          .catch(() => ({ items: [] }))
      ]);
      if (cancelled) return;
      setStaff(staffPage.items || []);
      const found = (page.items || [])[0];
      if (found) {
        setSettingId(found.id);
        setShifts(Array.isArray(found.shifts) && found.shifts.length > 0 ? found.shifts : DEFAULT_SHIFTS);
        setMinRest(Number(found.min_rest_hours) >= 0 ? Number(found.min_rest_hours) : 10);
        const next = {};
        (found.requirements || []).forEach((req) => {
          next[cellKey(req.shift_key, req.day, req.position)] = req.count;
        });
        setCounts(next);
        const pinned = {};
        (found.fixed_staff || []).forEach((row) => {
          const day = Number(row.day);
          if (!Number.isInteger(day) || !row.email) return;
          pinned[day] = [...(pinned[day] || []), row.email];
        });
        setFixed(pinned);
      } else {
        setSettingId('');
        setShifts(DEFAULT_SHIFTS);
        setCounts({});
        setFixed({});
        setMinRest(10);
      }
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, branch]);

  const setShift = (index, patch) => setShifts((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const addShift = () =>
    setShifts((prev) => [...prev, { key: `s${Date.now()}`, label: '', start_time: '09:00', end_time: '17:00' }]);
  const removeShift = (index) => setShifts((prev) => prev.filter((_, i) => i !== index));
  const setCount = (shiftKey, day, position, value) =>
    setCounts((prev) => ({ ...prev, [cellKey(shiftKey, day, position)]: value }));

  const toggleFixed = (day, email) =>
    setFixed((prev) => {
      const chosen = prev[day] || [];
      const next = chosen.includes(email) ? chosen.filter((item) => item !== email) : [...chosen, email];
      return { ...prev, [day]: next };
    });

  const save = async () => {
    if (!branch) return;
    setSaving(true);
    const requirements = [];
    shifts.forEach((shift) => {
      for (let day = 0; day < 7; day += 1) {
        positions.forEach((position) => {
          const value = Number(counts[cellKey(shift.key, day, position)]) || 0;
          if (value > 0) requirements.push({ day, shift_key: shift.key, position, count: value });
        });
      }
    });
    const fixedStaff = [];
    Object.entries(fixed).forEach(([day, emails]) => {
      (emails || []).forEach((email) => {
        const person = staff.find((row) => row.user_email === email);
        fixedStaff.push({ day: Number(day), email, name: person ? person.full_name : '' });
      });
    });
    const payload = {
      company_id: branch.company_id,
      branch_id: branch.id,
      shifts,
      requirements,
      fixed_staff: fixedStaff,
      min_rest_hours: Number(minRest) || 0
    };
    if (settingId) await base44.entities.RosterSetting.update(settingId, payload);
    else await base44.entities.RosterSetting.create(payload);
    setSaving(false);
    toast({ title: t('roster.settingsSaved') });
    onOpenChange(false);
    onSaved && onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('roster.settings')}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            {t('common.loading')}
          </p>
        ) : (
          <div className="space-y-7">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('roster.shifts')}</Label>
                <Button size="sm" variant="outline" onClick={addShift}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> {t('roster.addShiftType')}
                </Button>
              </div>
              {shifts.map((shift, index) => (
                <div key={shift.key} className="grid items-end gap-3 sm:grid-cols-[1fr_130px_130px_auto]">
                  <div>
                    <Label className="mb-1 block text-xs">{t('roster.shiftName')}</Label>
                    <Input value={shift.label} onChange={(e) => setShift(index, { label: e.target.value })} />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">{t('roster.shiftStart')}</Label>
                    <Input
                      type="time"
                      value={shift.start_time}
                      onChange={(e) => setShift(index, { start_time: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs">{t('roster.shiftEnd')}</Label>
                    <Input
                      type="time"
                      value={shift.end_time}
                      onChange={(e) => setShift(index, { end_time: e.target.value })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeShift(index)}
                    disabled={shifts.length <= 1}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <div className="max-w-xs">
                <Label className="mb-1 block text-xs">{t('roster.minRest')}</Label>
                <Input type="number" min="0" value={minRest} onChange={(e) => setMinRest(e.target.value)} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label>{t('roster.headcount')}</Label>
              </div>
              {positions.length === 0 ? (
                <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  {t('role.noneHint')}
                </p>
              ) : (
                shifts.map((shift) => (
                  <div key={shift.key} className="overflow-x-auto">
                    <p className="mb-2 text-sm font-medium">{shift.label || shift.key}</p>
                    <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr>
                          <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">
                            {t('common.position')}
                          </th>
                          {DAYS.map((day, dayIndex) => (
                            <th
                              key={day.key}
                              className="px-1 py-1.5 text-center text-xs font-medium text-muted-foreground"
                            >
                              {dayLabel(dayIndex, t)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {positions.map((position) => (
                          <tr key={position}>
                            <td className="whitespace-nowrap border-t px-2 py-1.5 text-xs font-medium">{position}</td>
                            {DAYS.map((day, dayIndex) => (
                              <td key={day.key} className="border-t px-1 py-1">
                                <Input
                                  type="number"
                                  min="0"
                                  className="h-8 w-14 text-center"
                                  value={counts[cellKey(shift.key, dayIndex, position)] ?? ''}
                                  onChange={(e) => setCount(shift.key, dayIndex, position, e.target.value)}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>

            {/* The people who are always on a given day: the builder places them first and fills
                the rest of that day's headcount around them. */}
            <div className="space-y-3">
              <div>
                <Label>{t('roster.fixedTitle')}</Label>
                <p className="mt-1 text-xs text-muted-foreground">{t('roster.fixedHint')}</p>
              </div>
              {staff.length === 0 ? (
                <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  {t('common.none')}
                </p>
              ) : (
                DAYS.map((day, dayIndex) => (
                  <div key={day.key} className="rounded-xl border p-3">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">{dayLabel(dayIndex, t)}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {staff.map((person) => {
                        const on = (fixed[dayIndex] || []).includes(person.user_email);
                        return (
                          <button
                            key={person.id}
                            type="button"
                            onClick={() => toggleFixed(dayIndex, person.user_email)}
                            className={
                              on
                                ? 'rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary'
                                : 'rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted'
                            }
                          >
                            {person.full_name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={saving || loading || positions.length === 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}