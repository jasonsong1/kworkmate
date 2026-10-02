import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import ApplyHeader from '@/components/apply/ApplyHeader';
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
import {
  NOTICE_PERIODS,
  VISA_TYPES,
  defaultRequiredQuestions,
  emptyAvailability,
  hasAnyAvailability,
  isPhoneNumber,
  phoneDigits,
  todayIso
} from '@/lib/bh';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
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

  const emailValid = EMAIL_RE.test(form.email.trim());
  const visaExpiryValid = Boolean(form.visa_expiry) && form.visa_expiry >= todayIso();

  const progress = useMemo(() => {
    const checks = [
      { ok: form.full_name.trim().length > 1, label: 'Full name' },
      { ok: emailValid, label: 'Email address' },
      { ok: isPhoneNumber(form.phone), label: 'Mobile number (10 digits)' },
      { ok: Boolean(form.visa_type), label: 'Visa type' },
      { ok: visaExpiryValid, label: 'Visa expiry (today or later)' },
      { ok: !enabled.includes('notice_period') || Boolean(form.notice_period), label: 'Notice period' },
      {
        ok: !enabled.includes('availability') || hasAnyAvailability(availability),
        label: 'Availability — a start and finish time on at least one day'
      },
      {
        ok:
          !enabled.includes('emergency_contact') ||
          Boolean(form.emergency_contact_name && isPhoneNumber(form.emergency_contact_phone)),
        label: 'Emergency contact and phone'
      },
      { ok: !enabled.includes('resume') || Boolean(resume && resume.file_uri), label: 'Resume upload' },
      {
        ok: customQuestions.every((q) => !q.required || String(answers[q.id] || '').trim().length > 0),
        label: 'Required questions'
      }
    ];
    const done = checks.filter((check) => check.ok).length;
    return {
      percent: Math.round((done / checks.length) * 100),
      missing: checks.filter((check) => !check.ok).map((check) => check.label)
    };
  }, [form, availability, resume, enabled, answers, customQuestions, emailValid, visaExpiryValid]);

  const completeness = progress.percent;
  const canSubmit = completeness === 100 && !submitting;

  const submit = async () => {
    setSubmitting(true);
    setSubmitError('');
    const response = await base44.functions.invoke('submitApplication', {
      job_id: jobId,
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: phoneDigits(form.phone),
      visa_type: form.visa_type,
      visa_expiry: form.visa_expiry,
      availability,
      notice_period: form.notice_period,
      available_immediately: form.notice_period === 'immediately',
      emergency_contact_name: form.emergency_contact_name,
      emergency_contact_phone: phoneDigits(form.emergency_contact_phone),
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

  // Company job ad design is the default; a job's own colours still win when set.
  const design = (data && data.company && data.company.job_design) || {};
  const brand = design.brand_color || (data && data.job && data.job.brand_color) || '#4338ca';
  const logo = design.logo_url || (data && data.job && data.job.logo_url) || '';

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
      <ApplyHeader
        brand={brand}
        logo={logo}
        companyName={data.company ? data.company.name : ''}
        branch={data.branch}
        job={data.job}
      />

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
              {form.email.length > 0 && !emailValid && (
                <p className="mt-1 text-xs text-destructive">Enter a valid email address, for example name@example.com</p>
              )}
            </div>
            <div>
              <Label>Mobile number *</Label>
              <Input inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              {form.phone.length > 0 && !isPhoneNumber(form.phone) && (
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
              <Input
                type="date"
                min={todayIso()}
                value={form.visa_expiry}
                onChange={(e) => set('visa_expiry', e.target.value)}
              />
              {form.visa_expiry.length > 0 && !visaExpiryValid && (
                <p className="mt-1 text-xs text-destructive">Visa expiry must be today or a future date</p>
              )}
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
              <Label className="mb-2 block">Which days and hours can you work each week? *</Label>
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
                  {form.emergency_contact_phone.length > 0 && !isPhoneNumber(form.emergency_contact_phone) && (
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
          {progress.missing.length > 0 ? (
            <p className="mt-1.5 text-center text-[11px] text-slate-500">
              Still needed: {progress.missing.join(' · ')}
            </p>
          ) : (
            <p className="mt-1.5 text-center text-[11px] text-slate-400">PDF/DOC resume up to 10MB</p>
          )}
        </div>
      </div>
    </div>
  );
}