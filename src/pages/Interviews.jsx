import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Loader2, Plus, XCircle } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { todayIso } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

function slotTimes(from, to, step) {
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const start = fh * 60 + fm;
  const end = th * 60 + tm;
  const out = [];
  for (let t = start; t + step <= end; t += step) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return out;
}

export default function Interviews() {
  const { t } = useI18n();
  const { activeBranch } = useWorkspace();
  const { toast } = useToast();

  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState('');
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: todayIso(), from: '14:00', to: '17:00', step: 20 });

  const loadJobs = useCallback(async () => {
    if (!activeBranch) return;
    const page = await base44.entities.Job.filter({ branch_id: activeBranch.id }, { sort: '-created_date', limit: 100 });
    const list = page.items || [];
    setJobs(list);
    setJobId((prev) => (prev && list.some((j) => j.id === prev) ? prev : list[0] ? list[0].id : ''));
  }, [activeBranch]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const loadSlots = useCallback(async () => {
    if (!jobId) {
      setSlots([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const page = await base44.entities.InterviewSlot.filter({ job_id: jobId }, { sort: 'date', limit: 200 });
    setSlots(page.items || []);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const generate = async () => {
    if (!jobId || !activeBranch) return;
    const times = slotTimes(form.from, form.to, Number(form.step) || 20);
    if (times.length === 0) {
      toast({ title: 'End time must be after start time', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const existing = slots.filter((s) => s.date === form.date).map((s) => s.start_time);
    const rows = times
      .filter((start) => !existing.includes(start))
      .map((start) => ({
        company_id: activeBranch.company_id,
        branch_id: activeBranch.id,
        job_id: jobId,
        date: form.date,
        start_time: start,
        duration_min: Number(form.step) || 20,
        status: 'open'
      }));
    if (rows.length > 0) await base44.entities.InterviewSlot.bulkCreate(rows);
    setSaving(false);
    toast({ title: `${rows.length} interview slot(s) opened` });
    await loadSlots();
  };

  const cancelSlot = async (slot) => {
    await base44.entities.InterviewSlot.update(slot.id, { status: 'cancelled' });
    if (slot.booked_by_applicant_id) {
      // The applicant hears about it directly: the cancellation email carries a fresh booking link.
      const response = await base44.functions.invoke('notifyApplicant', {
        applicant_id: slot.booked_by_applicant_id,
        type: 'interview_cancelled',
        slot_date: slot.date,
        slot_time: slot.start_time,
        origin: window.location.origin
      });
      if (response.data?.error) {
        toast({ title: response.data.error, variant: 'destructive' });
        await loadSlots();
        return;
      }
    }
    toast({ title: 'Slot cancelled — the applicant has been emailed to rebook' });
    await loadSlots();
  };

  const grouped = slots.reduce((acc, slot) => {
    acc[slot.date] = acc[slot.date] || [];
    acc[slot.date].push(slot);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title={t('interviews.title')}
        subtitle={activeBranch ? activeBranch.name : t('interviews.subtitle')}
        actions={
          <Select value={jobId} onValueChange={setJobId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder={t('jobs.title')} />
            </SelectTrigger>
            <SelectContent>
              {jobs.map((j) => (
                <SelectItem key={j.id} value={j.id}>
                  {j.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" /> {t('interviews.open')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{t('common.date')}</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('interviews.from')}</Label>
                <Input type="time" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
              </div>
              <div>
                <Label>{t('interviews.to')}</Label>
                <Input type="time" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>{t('interviews.slotLength')}</Label>
              <Input
                type="number"
                value={form.step}
                onChange={(e) => setForm({ ...form, step: e.target.value })}
              />
            </div>
            <Button className="w-full" onClick={generate} disabled={saving || !jobId}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {t('interviews.generate')}
            </Button>
            <p className="text-xs text-muted-foreground">
              Applicants booking the same time are resolved first-come-first-served — only one booking is accepted per slot.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              {t('common.loading')}
            </p>
          ) : Object.keys(grouped).length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                {t('common.none')}
              </CardContent>
            </Card>
          ) : (
            Object.keys(grouped)
              .sort()
              .map((date) => (
                <Card key={date}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">{date}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {grouped[date]
                      .sort((a, b) => (a.start_time > b.start_time ? 1 : -1))
                      .map((slot) => (
                        <div
                          key={slot.id}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                            slot.status === 'booked'
                              ? 'border-emerald-200 bg-emerald-50'
                              : slot.status === 'cancelled'
                              ? 'border-slate-200 bg-slate-50 text-muted-foreground'
                              : 'bg-card'
                          }`}
                        >
                          <span className="font-medium">{slot.start_time}</span>
                          {slot.status === 'booked' ? (
                            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                              {slot.booked_by_name}
                            </Badge>
                          ) : slot.status === 'cancelled' ? (
                            <Badge variant="secondary">{t('interviews.cancelled')}</Badge>
                          ) : (
                            <Badge variant="outline">{t('interviews.slots')}</Badge>
                          )}
                          {slot.status !== 'cancelled' && (
                            <button onClick={() => cancelSlot(slot)} title={t('interviews.cancel')}>
                              <XCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                            </button>
                          )}
                        </div>
                      ))}
                  </CardContent>
                </Card>
              ))
          )}
        </div>
      </div>
    </div>
  );
}