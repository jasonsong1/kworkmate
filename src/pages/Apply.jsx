import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, MapPin } from 'lucide-react';
import ResumeUpload from '@/components/apply/ResumeUpload';
import AvailabilityMatrix from '@/components/AvailabilityMatrix';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { NOTICE_PERIODS, VISA_TYPES, defaultRequiredQuestions, emptyAvailability, isDigits, money } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

const initialForm = {
  full_name: '',
  email: '',
  phone: '',
  visa_type: '',
  visa_expiry: '',
  notice_period: '',
  available_immediately: true,
  emergency_contact_name: '',
  emergency_contact_phone: ''
};

export default function Apply() {
  const { jobId } = useParams();
  const [state, setState] = useState('loading');
  const [data, setData] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [availability, setAvailability] = useState(emptyAvailability());
  const [resume, setResume] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    const load = async () => {
      const response = await base44.functions.invoke('getPublicJob', { job_id: jobId });
      const payload = response.data || {};
      if (!payload.job) {
        setState('missing');
        return;
      }
      setData(payload);
      setState(payload.job.status === 'open' ? 'form' : 'closed');
    };
    load();
  }, [jobId]);

  const enabled = useMemo(() => {
    const list = (data && data.job && data.job.required_questions) || defaultRequiredQuestions();
    return list
      .filter((q) => q.enabled !== false)
      .map((q) => (q.key === 'available_immediately' ? 'notice_period' : q.key));
  }, [data]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const customQuestions = (data && data.job && data.job.custom_questions) || [];

  const completeness = useMemo(() => {
    const checks = [
      form.full_name.trim().length > 1,
      /\S+@\S+\.\S+/.test(form.email),
      isDigits(form.phone, 10),
      Boolean(form.visa_type),
      Boolean(form.visa_expiry),
      enabled.includes('notice_period') ? Boolean(form.notice_period) : true,
      enabled.includes('availability') ? Object.values(availability).some((d) => d.length > 0) : true,
      enabled.includes('emergency_contact')
        ? Boolean(form.emergency_contact_name && isDigits(form.emergency_contact_phone, 10))
        : true,
      enabled.includes('resume') ? Boolean(resume && resume.file_uri) : true,
      customQuestions.every((q) => !q.required || String(answers[q.id] || '').trim().length > 0)
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  }, [form, availability, resume, enabled, answers, customQuestions]);

  const canSubmit = completeness === 100 && !submitting;

  const submit = async () => {
    setSubmitting(true);
    setSubmitError('');
    const response = await base44.functions.invoke('submitApplication', {
      job_id: jobId,
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      visa_type: form.visa_type,
      visa_expiry: form.visa_expiry,
      availability,
      notice_period: form.notice_period,
      available_immediately: form.notice_period === 'immediately',
      emergency_contact_name: form.emergency_contact_name,
      emergency_contact_phone: form.emergency_contact_phone,
      answers: customQuestions.map((q) => ({ question: q.label, answer: answers[q.id] || '' })),
      resume_file_uri: resume ? resume.file_uri : '',
      resume_filename: resume ? resume.filename : '',
      resume_size: resume ? resume.size : 0
    });
    setSubmitting(false);
    const result = response.data || {};
    if (result.closed) {
      setState('closed');
      return;
    }
    if (result.duplicate) {
      setState('duplicate');
      return;
    }
    if (result.error) {
      setSubmitError(result.error);
      return;
    }
    setState('done');
  };

  const brand = (data && data.job && data.job.brand_color) || '#4338ca';

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === 'missing' || state === 'closed' || state === 'duplicate') {
    const copy = {
      missing: ['Job not found', 'This link is no longer valid. Please ask the store for a new link.'],
      closed: ['Applications closed', 'This job ad has been closed by the store. Thanks for your interest!'],
      duplicate: [
        'We already have your application',
        'You have already applied for this role. Our team will contact you if you are shortlisted.'
      ]
    }[state];
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-4 h-8 w-8 text-slate-400" />
          <h1 className="text-lg font-semibold">{copy[0]}</h1>
          <p className="mt-2 text-sm text-slate-500">{copy[1]}</p>
        </div>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-emerald-500" />
          <h1 className="text-lg font-semibold">Application received!</h1>
          <p className="mt-2 text-sm text-slate-500">
            Thanks {form.full_name.split(' ')[0]} — we have your application for {data.job.title}. A confirmation email is
            on its way. If you are shortlisted you will receive an interview booking link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="px-4 pb-8 pt-8 text-white" style={{ backgroundColor: brand }}>
        <div className="mx-auto max-w-xl">
          <p className="text-xs uppercase tracking-widest opacity-80">
            {data.company ? data.company.name : ''} {data.branch ? `· ${data.branch.name}` : ''}
          </p>
          <h1 className="mt-2 text-2xl font-bold">{data.job.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm opacity-90">
            <span>{data.job.position || 'Team member'}</span>
            {data.job.hourly_rate ? <span>{money(data.job.hourly_rate)}/hr</span> : null}
            {data.branch && (data.branch.suburb || data.branch.address) ? (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {data.branch.suburb || data.branch.address}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-xl px-4 py-3">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>About 1 minute</span>
            <span>{completeness}% complete</span>
          </div>
          <Progress value={completeness} className="h-1.5" />
        </div>
      </div>

      <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Badge style={{ backgroundColor: brand }} className="text-white hover:opacity-90">
              1
            </Badge>
            <h2 className="text-sm font-semibold">About you</h2>
          </div>
          <div className="space-y-4">
            <div>
              <Label>Full name *</Label>
              <Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div>
              <Label>Mobile number *</Label>
              <Input inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              {form.phone.length > 0 && !isDigits(form.phone, 10) && (
                <p className="mt-1 text-xs text-destructive">Enter a 10-digit mobile number</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Badge style={{ backgroundColor: brand }} className="text-white hover:opacity-90">
              2
            </Badge>
            <h2 className="text-sm font-semibold">Work rights & availability</h2>
          </div>
          <div className="space-y-4">
            <div>
              <Label>Visa type *</Label>
              <Select value={form.visa_type} onValueChange={(v) => set('visa_type', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your visa" />
                </SelectTrigger>
                <SelectContent>
                  {VISA_TYPES.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Visa expiry date *</Label>
              <Input type="date" value={form.visa_expiry} onChange={(e) => set('visa_expiry', e.target.value)} />
            </div>
            {enabled.includes('notice_period') && (
              <div>
                <Label>Notice period *</Label>
                <Select value={form.notice_period} onValueChange={(v) => set('notice_period', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="When can you start?" />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTICE_PERIODS.map((n) => (
                      <SelectItem key={n.value} value={n.value}>
                        {n.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="mb-2 block">Which shifts can you work each week? *</Label>
              <AvailabilityMatrix value={availability} onChange={setAvailability} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Badge style={{ backgroundColor: brand }} className="text-white hover:opacity-90">
              3
            </Badge>
            <h2 className="text-sm font-semibold">Resume & final details</h2>
          </div>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Resume *</Label>
              <ResumeUpload value={resume} onChange={setResume} />
            </div>
            {enabled.includes('emergency_contact') && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Emergency contact *</Label>
                  <Input
                    value={form.emergency_contact_name}
                    onChange={(e) => set('emergency_contact_name', e.target.value)}
                  />
                </div>
                <div>
                  <Label>Emergency phone *</Label>
                  <Input
                    value={form.emergency_contact_phone}
                    onChange={(e) => set('emergency_contact_phone', e.target.value)}
                  />
                  {form.emergency_contact_phone.length > 0 && !isDigits(form.emergency_contact_phone, 10) && (
                    <p className="mt-1 text-xs text-destructive">Enter a 10-digit phone number</p>
                  )}
                </div>
              </div>
            )}
            {customQuestions.map((question) => (
              <div key={question.id}>
                <Label>
                  {question.label} {question.required ? '*' : ''}
                </Label>
                {question.type === 'yesno' ? (
                  <Select
                    value={answers[question.id] || ''}
                    onValueChange={(v) => setAnswers((prev) => ({ ...prev, [question.id]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Textarea
                    rows={2}
                    value={answers[question.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
        </section>

        {submitError && (
          <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {submitError}
          </p>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          <Button className="w-full" size="lg" disabled={!canSubmit} onClick={submit}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit application
          </Button>
          <p className="mt-1.5 text-center text-[11px] text-slate-400">
            Resume required · visa expiry required · PDF/DOC up to 10MB
          </p>
        </div>
      </div>
    </div>
  );
}