import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, Paperclip, ShieldCheck, FileCheck } from 'lucide-react';
import SignaturePad from '@/components/onboarding/SignaturePad';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildContractPdf, buildTfnPdf, buildSuperPdf } from '@/lib/onboardingPdf';
import { dateFormatOf, maskDate, validDate } from '@/lib/onboardingDates';
import { base44 } from '@/api/base44Client';

// 온보딩 설문지는 고용주가 정한 질문들로 구성되며, 마지막 단계에서 전자서명을 진행합니다.
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
  // 고용주가 요구한 증빙 서류 업로드 상태
  const [uploads, setUploads] = useState({});
  const [uploadingId, setUploadingId] = useState('');

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

  // 고용주가 설정한 페이지 번호에 따라 질문들을 페이지별로 그룹화합니다.
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

  const validationOf = (question) => question.validation || {};

  const allowedFileTypes = (question) =>
    (validationOf(question).file_types || [])
      .map((type) => String(type || '').replace(/^\./, '').trim().toLowerCase())
      .filter(Boolean);

  const digitsOnly = (value, limit) => {
    const digits = String(value || '').replace(/\D/g, '');
    return limit > 0 ? digits.slice(0, limit) : digits;
  };

  const chooseFile = async (question, file) => {
    if (!file) return;
    const types = allowedFileTypes(question);
    const extension = String(file.name || '').split('.').pop().toLowerCase();
    if (types.length > 0 && !types.includes(extension)) {
      setError(`Only these file types are accepted here: ${types.join(', ')}.`);
      return;
    }
    setUploadingId(question.id);
    setError('');
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      setUploads((prev) => ({ ...prev, [question.id]: { file_uri, name: file.name } }));
      setAnswer(question.id, file.name);
    } catch (err) {
      setError('The file could not be uploaded. Please try again.');
    } finally {
      setUploadingId('');
    }
  };

  const questionValid = (question) => {
    const value = answers[question.id] || {};
    const answer = String(value.answer || '').trim();
    if (question.required !== false && !answer) return false;
    if (answer && question.type === 'number') {
      const limit = Number(validationOf(question).digits) || 0;
      if (!/^\d+$/.test(answer)) return false;
      if (limit > 0 && answer.length > limit) return false;
    }
    if (answer && question.type === 'date' && !validDate(answer, dateFormatOf(question))) return false;
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

  // [핵심] 온보딩 설문지 최종 제출 처리
  const submit = async () => {
    if (!stepValid) {
      setError('Please sign and accept the declaration.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const now = new Date().toISOString();

      // 1. 전자서명 이미지 업로드
      const signatureBlob = await (await fetch(signature)).blob();
      const signatureFile = new File([signatureBlob], 'signature.png', { type: 'image/png' });
      const signatureUpload = await base44.integrations.Core.UploadPrivateFile({ file: signatureFile });

      // 2. 답변 내용에서 세무(TFN) 및 연금(Super) 필드 추출
      const answerVal = (id) => (answers[id] || {}).answer || '';
      const followVal = (id, field) => ((answers[id] || {}).follow_up || {})[field] || '';

      const tfnHeld = answerVal('default_tfn_held');
      const formData = {
        tfn_pending: tfnHeld === 'no',
        tfn_number: tfnHeld === 'yes' ? followVal('default_tfn_held', 'Tax File Number') : answerVal('default_tfn'),
        residency_status: answerVal('default_residency') || 'resident',
        tax_free_threshold: answerVal('default_tax_free') !== 'no',
        hecs_help: answerVal('default_hecs') === 'yes',
        super_choice: answerVal('default_super_default') === 'no' ? 'custom_fund' : 'default_fund',
        super_fund_name: answerVal('default_super_default') === 'no' ? followVal('default_super_default', 'Fund name') : (data.company?.default_super_fund_name || ''),
        super_usi: answerVal('default_super_default') === 'no' ? followVal('default_super_default', 'USI') : (data.company?.default_super_fund_usi || ''),
        super_member_number: answerVal('default_super_default') === 'no' ? followVal('default_super_default', 'Member number') : '',
        super_fund_abn: answerVal('default_super_default') === 'no' ? followVal('default_super_default', 'Fund ABN') : (data.company?.default_super_fund_abn || ''),
        signed_at: now
      };

      const pdfContext = {
        employee: data.employee,
        branch: data.branch,
        company: data.company,
        form: formData,
        signatureDataUrl: signature
      };

      // 3. ATO 공식 NAT 3092 (TFN 신고서), NAT 13080 (연금 선택서), 고용 계약서 3종 자동 생성
      const [tfnPdfBlob, superPdfBlob, contractPdfBlob] = await Promise.all([
        buildTfnPdf(pdfContext),
        buildSuperPdf(pdfContext),
        buildContractPdf(pdfContext)
      ]);

      // 4. 생성된 공식 PDF들을 안전한 Private 스토리지에 병렬 업로드
      const [tfnUpload, superUpload, contractUpload] = await Promise.all([
        base44.integrations.Core.UploadPrivateFile({
          file: await toFile(tfnPdfBlob, `TFN_Declaration_NAT3092_${data.employee.employee_number || 'staff'}.pdf`)
        }),
        base44.integrations.Core.UploadPrivateFile({
          file: await toFile(superPdfBlob, `Super_Choice_NAT13080_${data.employee.employee_number || 'staff'}.pdf`)
        }),
        base44.integrations.Core.UploadPrivateFile({
          file: await toFile(contractPdfBlob, `employment-contract_${data.employee.employee_number || 'staff'}.pdf`)
        })
      ]);

      // 5. 직원이 직접 첨부한 증빙 파일들과 함께 서류함 등록 목록 구성
      const uploadedDocs = questions
        .filter((question) => question.type === 'upload' && uploads[question.id])
        .map((question) => ({
          name: `${question.label} (${uploads[question.id].name})`,
          type: 'onboarding',
          file_uri: uploads[question.id].file_uri,
          created_at: now,
          uploaded_by: 'self'
        }));

      const docs = [
        {
          name: 'ATO Tax File Number Declaration (NAT 3092)',
          type: 'ato_tfn',
          doc_type: 'ato_tfn',
          file_uri: tfnUpload.file_uri,
          created_at: now
        },
        {
          name: 'ATO Superannuation Standard Choice (NAT 13080)',
          type: 'ato_super',
          doc_type: 'ato_super',
          file_uri: superUpload.file_uri,
          created_at: now
        },
        {
          name: 'Employment contract',
          type: 'contract',
          doc_type: 'contract',
          file_uri: contractUpload.file_uri,
          created_at: now
        },
        ...uploadedDocs
      ];

      // 6. 백엔드 함수(submitOnboarding)에 서류 및 설문 결과 전송
      const response = await base44.functions.invoke('submitOnboarding', {
        token,
        signature_file_uri: signatureUpload.file_uri,
        tfn: {
          number: formData.tfn_number,
          pending: formData.tfn_pending,
          residency_status: formData.residency_status,
          tax_free_threshold: formData.tax_free_threshold,
          hecs_help: formData.hecs_help
        },
        super: {
          choice: formData.super_choice,
          fund_name: formData.super_fund_name,
          usi: formData.super_usi,
          fund_abn: formData.super_fund_abn,
          member_number: formData.super_member_number
        },
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
      setError(err.message || '온보딩 서류 제출 중 오류가 발생했습니다.');
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
              ? 'Your onboarding has been received. Your answers and ATO official signed documents (NAT 3092 & NAT 13080) are filed securely.'
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

                  {question.type === 'upload' && (
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 p-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-slate-600">
                        {uploadingId === question.id ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                        ) : (
                          <Paperclip className="h-4 w-4 shrink-0" />
                        )}
                        <span className="truncate">
                          {uploadingId === question.id
                            ? 'Uploading…'
                            : uploads[question.id]
                              ? uploads[question.id].name
                              : 'Choose a file'}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-primary">
                        {allowedFileTypes(question).length > 0
                          ? allowedFileTypes(question).join(' / ').toUpperCase()
                          : 'Browse'}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept={allowedFileTypes(question).map((type) => `.${type}`).join(',')}
                        onChange={(event) => chooseFile(question, event.target.files && event.target.files[0])}
                      />
                    </label>
                  )}

                  {question.type === 'number' && (
                    <Input
                      inputMode="numeric"
                      value={value.answer || ''}
                      onChange={(event) =>
                        setAnswer(question.id, digitsOnly(event.target.value, Number(validationOf(question).digits) || 0))
                      }
                      placeholder={
                        Number(validationOf(question).digits) > 0
                          ? `Up to ${validationOf(question).digits} digits`
                          : 'Numbers only'
                      }
                    />
                  )}

                  {question.type === 'date' &&
                    (dateFormatOf(question) === 'YYYY-MM-DD' ? (
                      <Input
                        type="date"
                        value={value.answer || ''}
                        onChange={(event) => setAnswer(question.id, event.target.value)}
                      />
                    ) : (
                      <Input
                        inputMode="numeric"
                        value={value.answer || ''}
                        onChange={(event) =>
                          setAnswer(question.id, maskDate(event.target.value, dateFormatOf(question)))
                        }
                        placeholder={dateFormatOf(question).toLowerCase()}
                      />
                    ))}

                  {question.type !== 'yes_no' &&
                    question.type !== 'select' &&
                    question.type !== 'upload' &&
                    question.type !== 'number' &&
                    question.type !== 'date' && (
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
              {data.company ? data.company.name : 'my employer'} to use these details for their employment records and official ATO reporting.
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
            <div className="space-y-1.5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs text-emerald-800">
              <p className="flex items-center gap-1.5 font-medium">
                <FileCheck className="h-4 w-4 text-emerald-600" />
                호주 국세청(ATO) 공식 서류 자동 생성 안내
              </p>
              <p className="text-[11px] leading-relaxed text-emerald-700">
                제출 시 ATO 공식 규격의 <b>NAT 3092 (TFN 신고서)</b> 및 <b>NAT 13080 (연금 선택서)</b> 정식 PDF가 전자서명과 함께 자동 완성되어 안전하게 보관됩니다.
              </p>
            </div>
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" />
              TFN 및 금융 정보는 강력한 암호화로 안전하게 보호됩니다.
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