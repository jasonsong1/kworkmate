import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import SignaturePad from '@/components/onboarding/SignaturePad';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildContractPdf } from '@/lib/onboardingPdf';
import { base44 } from '@/api/base44Client';

// The onboarding form is the employer's own: their questions grouped into pages, then the
// signature the employee signs last.
const SIGN_TITLE = 'Sign & submit';

export default function Onboarding() {
  const { token } = useParams();
  const padRef = useRef(null);
  const [state, setState] = useState('loading');
  const [data, setData] = useState(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
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

  // Questions the employer gave the same page number appear together on one page. A question
  // saved before pages existed gets a page of its own.
  const pages = [];
  const explicitPages = questions
    .map((question) => Number(question.page))
    .filter((number) => Number.isFinite(number) && number > 0);
  let nextAuto = explicitPages.length > 0 ? Math.max(...explicitPages) + 1 : 1;
  questions.forEach((question) => {
    const number = Number(question.page);
    const pageNumber = Number.isFinite(number) && number > 0 ? number : nextAuto++;
    const found = pages.find((item) => item.number === pageNumber);
    if (found) found.questions.push(question);
    else pages.push({ number: pageNumber, questions: [question] });
  });
  pages.sort((a, b) => a.number - b.number);
  pages.forEach((page) => {
    const titled = page.questions.find((question) => String(question.page_title || '').trim());
    page.title = titled ? String(titled.page_title).trim() : page.questions[0].label;
  });

  const totalSteps = pages.length + 1;
  const currentPage = step < pages.length ? pages[step] : null;
  const stepTitle = currentPage ? currentPage.title : SIGN_TITLE;

  const setAnswer = (id, value) => setAnswers((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), answer: value } }));
  const setFollowUp = (id, field, value) =>
    setAnswers((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), follow_up: { ...((prev[id] || {}).follow_up || {}), [field]: value } }
    }));

  const questionValid = (question) => {
    const value = answers[question.id] || {};
    if (question.required !== false && !String(value.answer || '').trim()) return false;
    if (question.type === 'yes_no' && question.follow_up && question.follow_up.when === value.answer) {
      const fields = question.follow_up.fields || [];
      if (fields.some((field) => !String((value.follow_up || {})[field] || '').trim())) return false;
    }
    return true;
  };

  const stepValid = currentPage
    ? currentPage.questions.every(questionValid)
    : Boolean(signature) && declaration;

  const next = () => {
    if (!stepValid) {
      setError(currentPage ? 'Please answer the questions on this page before continuing.' : 'Please sign and accept the declaration.');
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
        form: {},
        signatureDataUrl: signature
      };
      const contractUpload = await base44.integrations.Core.UploadPrivateFile({
        file: await toFile(buildContractPdf(context), 'employment-contract.pdf')
      });

      const now = new Date().toISOString();
      const docs = [
        { name: 'Employment contract', type: 'contract', file_uri: contractUpload.file_uri, created_at: now }
      ];

      const response = await base44.functions.invoke('submitOnboarding', {
        token,
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
              ? 'Your onboarding has been received. Your answers and signed documents are filed securely, and this link can no longer be used.'
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
              Step {step + 1} of {totalSteps} · {stepTitle}
            </span>
            <span>{Math.round(((step + 1) / totalSteps) * 100)}%</span>
          </div>
          <Progress value={((step + 1) / totalSteps) * 100} className="h-1.5" />
        </div>
      </div>

      <main className="mx-auto max-w-xl space-y-5 px-4 py-6">
        {currentPage && (
          <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">{currentPage.title}</h2>
            {currentPage.questions.map((question) => {
              const value = answers[question.id] || {};
              const fields =
                question.type === 'yes_no' && question.follow_up && question.follow_up.when === (value.answer || '')
                  ? question.follow_up.fields || []
                  : [];
              return (
                <div key={question.id} className="space-y-2">
                  {currentPage.questions.length > 1 && <Label>{question.label}</Label>}

                  {question.type === 'yes_no' && (
                    <RadioGroup
                      value={value.answer || ''}
                      onValueChange={(answer) => setAnswer(question.id, answer)}
                      className="space-y-3"
                    >
                      <div className="flex items-center gap-3 rounded-xl border p-3">
                        <RadioGroupItem value="yes" id={`${question.id}-yes`} />
                        <label htmlFor={`${question.id}-yes`} className="text-sm leading-snug">
                          Yes
                        </label>
                      </div>
                      <div className="flex items-center gap-3 rounded-xl border p-3">
                        <RadioGroupItem value="no" id={`${question.id}-no`} />
                        <label htmlFor={`${question.id}-no`} className="text-sm leading-snug">
                          No
                        </label>
                      </div>
                    </RadioGroup>
                  )}

                  {question.type === 'select' && (
                    <Select value={value.answer || ''} onValueChange={(answer) => setAnswer(question.id, answer)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose one" />
                      </SelectTrigger>
                      <SelectContent>
                        {(question.options || []).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {question.type !== 'yes_no' && question.type !== 'select' && (
                    <Input
                      value={value.answer || ''}
                      onChange={(event) => setAnswer(question.id, event.target.value)}
                      placeholder="Your answer"
                    />
                  )}

                  {fields.map((field) => (
                    <div key={field}>
                      <Label>{field}</Label>
                      <Input
                        value={(value.follow_up || {})[field] || ''}
                        onChange={(event) => setFollowUp(question.id, field, event.target.value)}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </section>
        )}

        {step === pages.length && (
          <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Signature & declaration</h2>
            <div className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
              I declare that the information I have given in this form is true and correct, and I authorise{' '}
              {data.company ? data.company.name : 'my employer'} to use these details for their employment records.
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
              Your signed employment contract is generated and stored securely.
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
          {step < pages.length ? (
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
      </main>
    </div>
  );
}