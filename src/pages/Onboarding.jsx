import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import SignaturePad from '@/components/onboarding/SignaturePad';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RESIDENCY_OPTIONS, isDigits } from '@/lib/bh';
import { buildContractPdf, buildSuperPdf, buildTfnPdf } from '@/lib/onboardingPdf';
import { base44 } from '@/api/base44Client';

// The employer can add questions of their own: each one switched on becomes a page of its own,
// always ahead of the signature the employee signs last.
const BASE_STEPS = ['Tax file number', 'Superannuation', 'Bank account', 'Sign & submit'];
const FIRST_QUESTION_STEP = BASE_STEPS.length - 1;

export default function Onboarding() {
  const { token } = useParams();
  const padRef = useRef(null);
  const [state, setState] = useState('loading');
  const [data, setData] = useState(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    tfn_pending: false,
    tfn_number: '',
    residency_status: 'resident',
    tax_free_threshold: true,
    hecs_help: false,
    super_choice: '',
    super_fund_name: '',
    super_usi: '',
    super_member_number: '',
    super_fund_abn: '',
    bank_bsb: '',
    bank_account_number: '',
    bank_account_name: ''
  });
  const [signature, setSignature] = useState('');
  const [declaration, setDeclaration] = useState(false);
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    const load = async () => {
      const response = await base44.functions.invoke('getOnboardingData', { token });
      const payload = response.data || {};
      if (!payload.ok) {
        setState(payload.completed ? 'completed' : 'invalid');
        return;
      }
      setData(payload);
      setState('form');
    };
    load();
  }, [token]);

  const questions = (data && data.onboarding_questions) || [];
  const steps = [
    ...BASE_STEPS.slice(0, FIRST_QUESTION_STEP),
    ...questions.map((question) => question.label),
    BASE_STEPS[BASE_STEPS.length - 1]
  ];
  const signStep = steps.length - 1;
  const questionAt = (index) =>
    index >= FIRST_QUESTION_STEP && index < signStep ? questions[index - FIRST_QUESTION_STEP] : null;
  const currentQuestion = questionAt(step);
  const given = (currentQuestion && answers[currentQuestion.id]) || {};
  // The extra fields a yes/no question asks for are only there on the answer it names.
  const followUpFields =
    currentQuestion &&
    currentQuestion.type === 'yes_no' &&
    currentQuestion.follow_up &&
    currentQuestion.follow_up.when === (given.answer || '')
      ? currentQuestion.follow_up.fields || []
      : [];

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setAnswer = (id, value) => setAnswers((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), answer: value } }));
  const setFollowUp = (id, field, value) =>
    setAnswers((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), follow_up: { ...((prev[id] || {}).follow_up || {}), [field]: value } }
    }));

  const answerValid = (question) => {
    const value = answers[question.id] || {};
    if (question.required !== false && !String(value.answer || '').trim()) return false;
    if (question.type === 'yes_no' && question.follow_up && question.follow_up.when === value.answer) {
      const fields = question.follow_up.fields || [];
      if (fields.some((field) => !String((value.follow_up || {})[field] || '').trim())) return false;
    }
    return true;
  };

  const stepValid = useMemo(() => {
    if (step === 0) return form.tfn_pending || isDigits(form.tfn_number, 9);
    if (step === 1) {
      if (!form.super_choice) return false;
      return form.super_choice === 'default_fund' || Boolean(form.super_usi.trim());
    }
    if (step === 2) {
      return isDigits(form.bank_bsb, 6) && /^\d{5,10}$/.test(form.bank_account_number) && form.bank_account_name.trim().length > 1;
    }
    const question = questionAt(step);
    if (question) return answerValid(question);
    return Boolean(signature) && declaration;
  }, [step, form, signature, declaration, answers, questions]);

  const next = () => {
    if (!stepValid) {
      setError(
        step === 0
          ? 'Enter your 9 digit tax file number, or tick that you are waiting for it.'
          : step === 1
          ? 'Choose the employer default fund or enter your own fund USI.'
          : step === 2
          ? 'BSB must be 6 digits, account number 5–10 digits, and the account name is required.'
          : currentQuestion
          ? 'Please answer this question before continuing.'
          : 'Please sign and accept the declaration.'
      );
      return;
    }
    setError('');
    setStep((s) => s + 1);
  };

  const toFile = async (blob, name) => new File([blob], name, { type: 'application/pdf' });

  const submit = async () => {
    if (!stepValid) {
      setError('Please sign and accept the declaration.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const signatureBlob = await (await fetch(signature)).blob();
      const signatureFile = new File([signatureBlob], 'signature.png', { type: 'image/png' });
      const signatureUpload = await base44.integrations.Core.UploadPrivateFile({ file: signatureFile });

      const context = {
        employee: data.employee,
        branch: data.branch,
        company: data.company,
        form,
        signatureDataUrl: signature
      };

      const [tfnUpload, superUpload, contractUpload] = await Promise.all([
        base44.integrations.Core.UploadPrivateFile({
          file: await toFile(buildTfnPdf(context), 'tfN-declaration.pdf')
        }),
        base44.integrations.Core.UploadPrivateFile({
          file: await toFile(buildSuperPdf(context), 'super-choice.pdf')
        }),
        base44.integrations.Core.UploadPrivateFile({
          file: await toFile(buildContractPdf(context), 'employment-contract.pdf')
        })
      ]);

      const now = new Date().toISOString();
      const docs = [
        { name: 'TFN Declaration (NAT 3092)', type: 'tfn_declaration', file_uri: tfnUpload.file_uri, created_at: now },
        { name: 'Superannuation Standard Choice (NAT 13087)', type: 'super_choice', file_uri: superUpload.file_uri, created_at: now },
        { name: 'Employment contract', type: 'contract', file_uri: contractUpload.file_uri, created_at: now }
      ];

      const response = await base44.functions.invoke('submitOnboarding', {
        token,
        tfn: {
          number: form.tfn_number,
          pending: form.tfn_pending,
          residency_status: form.residency_status,
          tax_free_threshold: form.tax_free_threshold,
          hecs_help: form.hecs_help
        },
        super: {
          choice: form.super_choice,
          fund_name: form.super_fund_name,
          usi: form.super_usi,
          member_number: form.super_member_number,
          fund_abn: form.super_fund_abn
        },
        bank: {
          bsb: form.bank_bsb,
          account_number: form.bank_account_number,
          account_name: form.bank_account_name
        },
        signature_file_uri: signatureUpload.file_uri,
        docs,
        extra_answers: questions.map((question) => ({
          id: question.id,
          answer: (answers[question.id] || {}).answer || '',
          follow_up: (answers[question.id] || {}).follow_up || {}
        })),
        declaration_accepted: true
      });

      if (response.data?.error) {
        setError(response.data.error);
        setSaving(false);
        return;
      }
      if (response.data?.completed) {
        setState('completed');
        return;
      }
      setState('done');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const brand = (data && data.branch && data.branch.brand_color) || '#4338ca';

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (state === 'invalid' || state === 'completed' || state === 'done') {
    const isDone = state !== 'invalid';
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          {isDone ? (
            <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-emerald-500" />
          ) : (
            <AlertCircle className="mx-auto mb-4 h-8 w-8 text-slate-400" />
          )}
          <h1 className="text-lg font-semibold">
            {isDone ? 'Onboarding submitted' : 'Link not recognised'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {isDone
              ? 'Your onboarding has been received. Your TFN declaration, superannuation choice and bank details are filed securely, and this link can no longer be used.'
              : 'This onboarding link is invalid or has already been completed. Please contact your manager.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className="px-4 pb-7 pt-8 text-white" style={{ backgroundColor: brand }}>
        <div className="mx-auto max-w-xl">
          <p className="text-xs uppercase tracking-widest opacity-80">
            {data.company ? data.company.name : ''} {data.branch ? `· ${data.branch.name}` : ''}
          </p>
          <h1 className="mt-2 text-xl font-bold">Welcome, {data.employee.full_name}</h1>
          <p className="mt-1 text-sm opacity-90">
            Employee no. {data.employee.employee_number} · {data.employee.position || 'Team member'}
          </p>
        </div>
      </header>

      <div className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-xl px-4 py-3">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>
              Step {step + 1} of {steps.length} · {steps[step]}
            </span>
            <span>{Math.round(((step + 1) / steps.length) * 100)}%</span>
          </div>
          <Progress value={((step + 1) / steps.length) * 100} className="h-1.5" />
        </div>
      </div>

      <main className="mx-auto max-w-xl space-y-5 px-4 py-6">
        {step === 0 && (
          <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Tax file number declaration</h2>
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
              <Checkbox
                id="tfn-pending"
                checked={form.tfn_pending}
                onCheckedChange={(v) => set('tfn_pending', Boolean(v))}
              />
              <label htmlFor="tfn-pending" className="text-sm leading-snug">
                I have applied for a tax file number and am waiting for it to be issued
              </label>
            </div>
            {!form.tfn_pending && (
              <div>
                <Label>Tax file number (9 digits) *</Label>
                <Input
                  inputMode="numeric"
                  maxLength={9}
                  value={form.tfn_number}
                  onChange={(e) => set('tfn_number', e.target.value.replace(/\D/g, ''))}
                  placeholder="123456789"
                />
              </div>
            )}
            <div>
              <Label>Residency status</Label>
              <Select value={form.residency_status} onValueChange={(v) => set('residency_status', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESIDENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
              <Checkbox
                id="threshold"
                checked={form.tax_free_threshold}
                onCheckedChange={(v) => set('tax_free_threshold', Boolean(v))}
              />
              <label htmlFor="threshold" className="text-sm leading-snug">
                Claim the tax-free threshold
              </label>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3">
              <Checkbox id="hecs" checked={form.hecs_help} onCheckedChange={(v) => set('hecs_help', Boolean(v))} />
              <label htmlFor="hecs" className="text-sm leading-snug">
                I have a HECS / HELP student loan debt
              </label>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Superannuation choice</h2>
            <RadioGroup value={form.super_choice} onValueChange={(v) => set('super_choice', v)} className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl border p-3">
                <RadioGroupItem value="default_fund" id="default" />
                <label htmlFor="default" className="text-sm leading-snug">
                  Join the employer default fund
                  <span className="mt-1 block text-xs text-slate-500">
                    {data.company && data.company.default_super_fund_name
                      ? `${data.company.default_super_fund_name}${
                          data.company.default_super_fund_usi ? ` · USI ${data.company.default_super_fund_usi}` : ''
                        }`
                      : 'Your employer will confirm fund details.'}
                  </span>
                </label>
              </div>
              <div className="flex items-start gap-3 rounded-xl border p-3">
                <RadioGroupItem value="custom_fund" id="custom" />
                <label htmlFor="custom" className="text-sm leading-snug">
                  Use my existing super fund
                </label>
              </div>
            </RadioGroup>

            {form.super_choice === 'custom_fund' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Fund name</Label>
                  <Input value={form.super_fund_name} onChange={(e) => set('super_fund_name', e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <Label>USI (unique superannuation identifier) *</Label>
                  <Input value={form.super_usi} onChange={(e) => set('super_usi', e.target.value.toUpperCase())} />
                </div>
                <div>
                  <Label>Fund ABN</Label>
                  <Input value={form.super_fund_abn} onChange={(e) => set('super_fund_abn', e.target.value)} />
                </div>
                <div>
                  <Label>Member number</Label>
                  <Input
                    value={form.super_member_number}
                    onChange={(e) => set('super_member_number', e.target.value)}
                  />
                </div>
              </div>
            )}
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Where should we pay you?</h2>
            <div>
              <Label>BSB (6 digits) *</Label>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={form.bank_bsb}
                onChange={(e) => set('bank_bsb', e.target.value.replace(/\D/g, ''))}
                placeholder="062000"
              />
            </div>
            <div>
              <Label>Account number *</Label>
              <Input
                inputMode="numeric"
                maxLength={10}
                value={form.bank_account_number}
                onChange={(e) => set('bank_account_number', e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div>
              <Label>Account holder name *</Label>
              <Input value={form.bank_account_name} onChange={(e) => set('bank_account_name', e.target.value)} />
            </div>
          </section>
        )}

        {currentQuestion && (
          <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{currentQuestion.label}</h2>
            {currentQuestion.type === 'yes_no' && (
              <RadioGroup
                value={given.answer || ''}
                onValueChange={(value) => setAnswer(currentQuestion.id, value)}
                className="space-y-3"
              >
                <div className="flex items-center gap-3 rounded-xl border p-3">
                  <RadioGroupItem value="yes" id={`${currentQuestion.id}-yes`} />
                  <label htmlFor={`${currentQuestion.id}-yes`} className="text-sm leading-snug">
                    Yes
                  </label>
                </div>
                <div className="flex items-center gap-3 rounded-xl border p-3">
                  <RadioGroupItem value="no" id={`${currentQuestion.id}-no`} />
                  <label htmlFor={`${currentQuestion.id}-no`} className="text-sm leading-snug">
                    No
                  </label>
                </div>
              </RadioGroup>
            )}
            {currentQuestion.type === 'select' && (
              <Select value={given.answer || ''} onValueChange={(value) => setAnswer(currentQuestion.id, value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  {(currentQuestion.options || []).map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {currentQuestion.type !== 'yes_no' && currentQuestion.type !== 'select' && (
              <Input
                value={given.answer || ''}
                onChange={(event) => setAnswer(currentQuestion.id, event.target.value)}
                placeholder="Your answer"
              />
            )}
            {followUpFields.map((field) => (
              <div key={field}>
                <Label>{field}</Label>
                <Input
                  value={(given.follow_up || {})[field] || ''}
                  onChange={(event) => setFollowUp(currentQuestion.id, field, event.target.value)}
                />
              </div>
            ))}
          </section>
        )}

        {step === signStep && (
          <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Signature & declaration</h2>
            <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
              I declare that the information I have given in this form is true and correct, that my tax file number
              information is correct, and I authorise {data.company ? data.company.name : 'my employer'} to use these
              details for payroll, superannuation and tax purposes.
            </div>
            <SignaturePad
              ref={padRef}
              onChange={(dataUrl) => {
                setSignature(dataUrl);
                setError('');
              }}
            />
            <div className="flex items-start gap-3 rounded-xl border p-3">
              <Checkbox
                id="declaration"
                checked={declaration}
                onCheckedChange={(v) => setDeclaration(Boolean(v))}
              />
              <label htmlFor="declaration" className="text-sm leading-snug">
                I have read and accept the declaration above
              </label>
            </div>
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" />
              Your signed TFN declaration, super choice form and contract are generated and stored securely.
            </p>
          </section>
        )}

        {error && (
          <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          )}
          {step < signStep ? (
            <Button className="flex-1" onClick={next}>
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button className="flex-1" onClick={submit} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign & submit
            </Button>
          )}
        </div>

        <div className="flex justify-center gap-1.5">
          {steps.map((label, index) => (
            <Badge
              key={label}
              variant={index === step ? 'default' : 'secondary'}
              className="text-[10px] font-normal"
            >
              {label}
            </Badge>
          ))}
        </div>
      </main>
    </div>
  );
}