import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileCheck,
  FileText,
  HelpCircle,
  Info,
  Loader2,
  Paperclip,
  PenTool,
  ShieldCheck,
  UploadCloud,
  UserCheck
} from 'lucide-react';
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

// Slim progress bar for micro-feedback
function SlimTopBar({ active }) {
  if (!active) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-slate-100 overflow-hidden">
      <div className="h-full bg-primary animate-pulse w-full origin-left" style={{ animationDuration: '1.2s' }} />
    </div>
  );
}

export default function Onboarding() {
  const { token } = useParams();
  const padRef = useRef(null);
  const [state, setState] = useState('loading'); // 'loading' | 'form' | 'completed' | 'invalid'
  const [data, setData] = useState(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [signature, setSignature] = useState('');
  const [declaration, setDeclaration] = useState(false);

  // Employer questionnaire answers
  const [answers, setAnswers] = useState({});
  // Question file uploads
  const [uploads, setUploads] = useState({});
  const [uploadingId, setUploadingId] = useState('');

  // ==============================================================================
  // Australian Taxation Office (ATO NAT 3092) Tax Form State
  // Pre-filled from employer questions and employee data
  // ==============================================================================
  const [taxForm, setTaxForm] = useState({
    title: 'Mr',
    familyName: '',
    givenNames: '',
    otherNames: '',
    hasChangedName: false,
    previousFamilyName: '',
    dob: '',
    email: '',
    phone: '',
    addressLine: '',
    suburb: '',
    state: 'NSW',
    postcode: '',
    tfnMode: 'number', // 'number' | 'applied' | 'under18' | 'pensioner'
    tfnNumber: '',
    employmentBasis: 'casual', // 'full_time' | 'part_time' | 'labour_hire' | 'super_stream' | 'casual'
    residency: 'resident', // 'resident' | 'foreign' | 'working_holiday'
    taxFreeThreshold: 'yes', // 'yes' | 'no'
    studentDebt: 'no' // 'yes' | 'no'
  });

  // Load onboarding session data
  useEffect(() => {
    const load = async () => {
      try {
        const response = await base44.functions.invoke('getOnboardingData', { token });
        const payload = response.data || {};
        if (!payload.ok) {
          setState(payload.completed ? 'completed' : 'invalid');
          return;
        }
        setData(payload);
        setState('form');

        // Pre-fill initial employee details if available
        const emp = payload.employee || {};
        const nameParts = (emp.full_name || '').trim().split(' ');
        const given = nameParts.slice(0, -1).join(' ') || nameParts[0] || '';
        const family = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

        setTaxForm((prev) => ({
          ...prev,
          givenNames: given,
          familyName: family,
          email: emp.user_email || '',
          phone: emp.phone || '',
          dob: emp.date_of_birth || '',
          addressLine: emp.address || '',
          tfnNumber: emp.tfn_number || '',
          employmentBasis: emp.employment_type || 'casual',
          residency: emp.residency_status || 'resident'
        }));
      } catch (err) {
        setState('invalid');
      }
    };
    load();
  }, [token]);

  // 1. Employer custom questions
  const baseQuestions = (data && data.onboarding_questions) || [];

  // 2. 회사설정(온보딩 서류 설정)에 등록된 필수/선택 서류 중 질문에 아직 없는 것(Test Doc 등) 동적 결합
  const companyDocTypes = (data && data.company && data.company.onboarding_doc_types) || [];
  const fileDocTypes = companyDocTypes.filter(
    (d) => d && d.kind !== 'info' && d.key !== 'tfn' && d.key !== 'super' && d.key !== 'contract'
  );

  const maxBasePage = Math.max(
    0,
    ...baseQuestions.map((q) => Number(q.page) || 1)
  );

  const syntheticDocQuestions = fileDocTypes
    .filter((docType) => {
      const lowerKey = String(docType.key || '').toLowerCase();
      const lowerLabel = String(docType.label || docType.label_en || '').toLowerCase().trim();
      // 기존 질문 중 동일한 목적의 업로드 질문이 있는지 검사
      const exists = baseQuestions.some((q) => {
        if (q.type !== 'upload') return false;
        const qLabel = String(q.label || '').toLowerCase().trim();
        const qId = String(q.id || '').toLowerCase().trim();
        if (qId === lowerKey) return true;
        if (lowerKey === 'id' && (qLabel.includes('id') || qLabel.includes('신분증') || qLabel.includes('photo'))) return true;
        if (lowerKey === 'right_to_work' && (qLabel.includes('right') || qLabel.includes('work') || qLabel.includes('visa') || qLabel.includes('비자') || qLabel.includes('vevo'))) return true;
        if (lowerLabel && lowerLabel.length >= 3 && qLabel === lowerLabel) return true;
        return false;
      });
      return !exists;
    })
    .map((docType, idx) => {
      const labelText = docType.label || docType.label_en || docType.key;
      return {
        id: docType.key,
        label: labelText,
        description: docType.key === 'id'
          ? 'Passport photo page or Australian Driver Licence (PDF, JPG, PNG)'
          : docType.key === 'right_to_work'
          ? 'Australian Visa Grant Notice (VEVO), Passport, or Citizenship Certificate'
          : `Please upload the required verification document: ${labelText} (PDF, JPG, PNG)`,
        type: 'upload',
        required: docType.required !== false,
        page: maxBasePage + idx + 1,
        page_title: labelText,
        validation: { file_types: ['pdf', 'jpg', 'jpeg', 'png', 'webp'] }
      };
    });

  const questions = [...baseQuestions, ...syntheticDocQuestions];

  // Group questions by page
  const questionPages = [];
  const explicitPages = questions
    .map((q) => Number(q.page))
    .filter((n) => Number.isFinite(n) && n > 0);
  let nextAuto = explicitPages.length > 0 ? Math.max(...explicitPages) + 1 : 1;
  questions.forEach((q) => {
    const n = Number(q.page);
    const pageNumber = Number.isFinite(n) && n > 0 ? n : nextAuto++;
    const found = questionPages.find((p) => p.number === pageNumber);
    if (found) found.questions.push(q);
    else questionPages.push({ number: pageNumber, questions: [q] });
  });
  questionPages.sort((a, b) => a.number - b.number);
  questionPages.forEach((page) => {
    const titled = page.questions.find((q) => String(q.page_title || '').trim());
    page.title = titled ? String(titled.page_title).trim() : (page.questions[0]?.label || 'Questions');
  });

  // Overall onboarding steps: [Question Pages...] -> [ATO Tax Declaration] -> [Declaration & Signature]
  const pages = [
    ...questionPages.map((p, idx) => ({ type: 'questions', page: p, title: p.title || `Step ${idx + 1}` })),
    { type: 'tax', title: 'ATO Tax File Number Declaration (NAT 3092)' },
    { type: 'sign', title: 'Payee Declaration & Signature' }
  ];

  const totalSteps = pages.length;
  const currentPage = step < totalSteps ? pages[step] : null;

  // Answer handler - passes label for accurate ATO Tax Form pre-filling
  const setAnswer = (id, value, label = '') => {
    setAnswers((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), answer: value } }));
    syncAnswerToTaxForm(id, value, label);
  };

  const setFollowUp = (id, field, value) => {
    setAnswers((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), follow_up: { ...((prev[id] || {}).follow_up || {}), [field]: value } }
    }));
    if (id === 'default_tfn_held' && field === 'Tax File Number') {
      setTaxForm((t) => ({ ...t, tfnNumber: value }));
    }
  };

  // ==============================================================================
  // Real-time synchronization to ATO NAT 3092 Form
  // ==============================================================================
  const syncAnswerToTaxForm = (id, val, questionLabel = '') => {
    const str = String(val || '').trim();
    if (!str) return;
    const lowerId = String(id || '').toLowerCase();
    const lowerLabel = String(questionLabel || '').toLowerCase();

    setTaxForm((prev) => {
      const next = { ...prev };

      // 1. Email (Must check BEFORE address, because "Email address" contains the word "address"!)
      if (
        id === 'default_email' ||
        lowerId.includes('email') ||
        lowerLabel.includes('email') ||
        lowerLabel.includes('이메일')
      ) {
        next.email = str;
        return next;
      }

      // 2. Phone
      if (
        id === 'default_phone' ||
        lowerId.includes('phone') ||
        lowerLabel.includes('phone') ||
        lowerLabel.includes('전화')
      ) {
        next.phone = str;
        return next;
      }

      // 3. Suburb
      if (lowerId.includes('suburb') || lowerLabel.includes('suburb')) {
        next.suburb = str.toUpperCase();
        return next;
      }

      // 4. State
      if (lowerId.includes('state') || lowerLabel.includes('state')) {
        next.state = str.toUpperCase();
        return next;
      }

      // 5. Postcode
      if (lowerId.includes('post') || lowerLabel.includes('post')) {
        next.postcode = str.replace(/\D/g, '').slice(0, 4);
        return next;
      }

      // 6. Home / Residential street address (Exclude email questions!)
      if (
        !lowerId.includes('email') &&
        !lowerLabel.includes('email') &&
        !lowerLabel.includes('이메일') &&
        (id === 'default_address' || lowerId.includes('address') || lowerLabel.includes('address') || lowerLabel.includes('주소'))
      ) {
        next.addressLine = str;
        const parts = str.split(',').map((s) => s.trim());
        if (parts.length >= 2) {
          next.addressLine = parts[0];
          const lastPart = parts[parts.length - 1];
          const match = lastPart.match(/([A-Za-z]+)\s+(\d{4})/);
          if (match) {
            next.state = match[1].toUpperCase();
            next.postcode = match[2];
          }
        }
        return next;
      }

      // 7. Date of birth
      if (id === 'default_dob' || id.includes('dob') || id.includes('birth') || lowerLabel.includes('birth') || lowerLabel.includes('생년월일')) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
          next.dob = str;
        } else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(str)) {
          const p = str.split(/[\/\-]/);
          next.dob = `${p[2]}-${String(p[1]).padStart(2, '0')}-${String(p[0]).padStart(2, '0')}`;
        } else {
          next.dob = str;
        }
        return next;
      }

      // 8. Name
      if (id === 'default_name' || id === 'full_name' || lowerLabel.includes('full name') || lowerLabel.includes('성명')) {
        const parts = str.split(' ');
        next.givenNames = parts.slice(0, -1).join(' ') || parts[0] || '';
        next.familyName = parts.length > 1 ? parts[parts.length - 1] : '';
        return next;
      }

      // 9. TFN
      if (id === 'default_tfn') {
        next.tfnNumber = str;
        next.tfnMode = 'number';
        return next;
      }
      if (id === 'default_tfn_held') {
        if (str === 'no') next.tfnMode = 'applied';
        if (str === 'yes') next.tfnMode = 'number';
        return next;
      }

      // 10. Tax-free threshold
      if (id === 'default_tax_free') {
        next.taxFreeThreshold = str === 'yes' ? 'yes' : 'no';
        return next;
      }

      // 11. Student debt
      if (id === 'default_hecs') {
        next.studentDebt = str === 'yes' ? 'yes' : 'no';
        return next;
      }

      return next;
    });
  };

  const validationOf = (q) => q.validation || {};
  const allowedFileTypes = (q) =>
    (validationOf(q).file_types || [])
      .map((t) => String(t || '').replace(/^\./, '').trim().toLowerCase())
      .filter(Boolean);

  const digitsOnly = (value, limit) => {
    const digits = String(value || '').replace(/\D/g, '');
    return limit > 0 ? digits.slice(0, limit) : digits;
  };

  // Upload file for a specific question
  const chooseQuestionFile = async (question, file) => {
    if (!file) return;
    const types = allowedFileTypes(question);
    const extension = String(file.name || '').split('.').pop().toLowerCase();
    if (types.length > 0 && !types.includes(extension)) {
      setError(`Only the following file formats are allowed: ${types.join(', ')}.`);
      return;
    }
    setUploadingId(question.id);
    setError('');
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      setUploads((prev) => ({ ...prev, [question.id]: { file_uri, name: file.name } }));
      setAnswer(question.id, file.name, question.label);
    } catch (err) {
      setError('Failed to upload file. Please try again.');
    } finally {
      setUploadingId('');
    }
  };

  // Question validation
  const questionValid = (question) => {
    const val = answers[question.id] || {};
    const answer = String(val.answer || '').trim();
    if (question.required !== false && !answer) return false;
    if (answer && question.type === 'number') {
      const limit = Number(validationOf(question).digits) || 0;
      if (!/^\d+$/.test(answer)) return false;
      if (limit > 0 && answer.length > limit) return false;
    }
    if (answer && question.type === 'phone') {
      const clean = answer.replace(/\D/g, '').replace(/^0+/, '');
      if (clean.length !== 9) return false;
    }
    if (answer && question.type === 'date' && !validDate(answer, dateFormatOf(question))) return false;
    if (question.type === 'yes_no' && question.follow_up && question.follow_up.when === val.answer) {
      const fields = question.follow_up.fields || [];
      if (fields.some((field) => !String((val.follow_up || {})[field] || '').trim())) return false;
    }
    return true;
  };

  // Validate current step
  const validateCurrentStep = () => {
    if (!currentPage) return '';

    // 1. Questions step
    if (currentPage.type === 'questions') {
      const questionsOnPage = currentPage.page?.questions || [];
      for (const q of questionsOnPage) {
        if (!questionValid(q)) {
          return `Please answer [${q.label}] correctly.`;
        }
      }
    }

    // 2. ATO Tax Form step
    if (currentPage.type === 'tax') {
      if (!taxForm.familyName.trim()) return 'Please enter your surname / family name for the ATO declaration.';
      if (!taxForm.givenNames.trim()) return 'Please enter your first given name for the ATO declaration.';
      if (!taxForm.dob.trim()) return 'Please enter your date of birth.';
      if (!taxForm.addressLine.trim()) return 'Please enter your residential address in Australia.';
      if (taxForm.tfnMode === 'number') {
        const cleanTfn = taxForm.tfnNumber.replace(/\D/g, '');
        if (cleanTfn.length < 8 || cleanTfn.length > 9) {
          return 'Please enter a valid 8 or 9-digit TFN, or select an exemption/pending option.';
        }
      }
    }

    // 3. Signature step
    if (currentPage.type === 'sign') {
      if (!signature) return 'Please provide your digital signature below.';
      if (!declaration) return 'Please check the declaration and consent box before proceeding.';
    }

    return '';
  };

  const next = () => {
    const err = validateCurrentStep();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setStep((s) => s + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toFile = async (blob, name) => new File([blob], name, { type: 'application/pdf' });

  // ==============================================================================
  // Final Submission
  // Generates official ATO NAT 3092 vector PDF, Super Choice, Contract, and submits
  // ==============================================================================
  const submit = async () => {
    const err = validateCurrentStep();
    if (err) {
      setError(err);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const now = new Date().toISOString();

      // 1. Upload signature image
      const signatureBlob = await (await fetch(signature)).blob();
      const signatureFile = new File([signatureBlob], 'signature.png', { type: 'image/png' });
      const signatureUpload = await base44.integrations.Core.UploadPrivateFile({ file: signatureFile });

      // 2. Prepare merged form data
      const answerVal = (id) => (answers[id] || {}).answer || '';
      const followVal = (id, field) => ((answers[id] || {}).follow_up || {})[field] || '';

      const tfnClean = taxForm.tfnMode === 'number' ? taxForm.tfnNumber.replace(/\D/g, '') : '';
      const finalFormData = {
        title: taxForm.title,
        family_name: taxForm.familyName.trim(),
        given_names: taxForm.givenNames.trim(),
        other_names: taxForm.otherNames.trim(),
        previous_family_name: taxForm.hasChangedName ? taxForm.previousFamilyName.trim() : '',
        date_of_birth: taxForm.dob.trim(),
        user_email: taxForm.email.trim() || data.employee?.user_email || '',
        email: taxForm.email.trim() || data.employee?.user_email || '',
        phone: taxForm.phone.trim() || data.employee?.phone || '',
        address_line1: taxForm.addressLine.trim(),
        suburb: taxForm.suburb.trim(),
        state: taxForm.state,
        postcode: taxForm.postcode.trim(),
        address: [taxForm.addressLine, taxForm.suburb, taxForm.state, taxForm.postcode].filter(Boolean).join(', '),
        tfn_number: tfnClean,
        tfn_pending: taxForm.tfnMode !== 'number',
        tfn_exemption: taxForm.tfnMode,
        employment_type: taxForm.employmentBasis,
        residency_status: taxForm.residency,
        tax_free_threshold: taxForm.taxFreeThreshold === 'yes',
        hecs_help: taxForm.studentDebt === 'yes',
        super_choice: answerVal('default_super_default') === 'no' ? 'custom_fund' : 'default_fund',
        super_fund_name: answerVal('default_super_default') === 'no' ? followVal('default_super_default', 'Fund name') : (data.company?.default_super_fund_name || ''),
        super_usi: answerVal('default_super_default') === 'no' ? followVal('default_super_default', 'USI') : (data.company?.default_super_fund_usi || ''),
        super_member_number: answerVal('default_super_default') === 'no' ? followVal('default_super_default', 'Member number') : '',
        super_fund_abn: answerVal('default_super_default') === 'no' ? followVal('default_super_default', 'Fund ABN') : (data.company?.default_super_fund_abn || ''),
        bank_bsb: (answerVal('default_bank_bsb') || '').replace(/\D/g, ''),
        bank_account_number: answerVal('default_bank_account'),
        bank_account_name: answerVal('default_bank_holder'),
        signed_at: now
      };

      // [중요] 회사설정에 등록된 고용주 전자서명이 누락되지 않도록 DB에서 최신 서명을 확실하게 보강
      let employerSignatureUrl = data.company?.tfn_employer_signature || '';
      if (!employerSignatureUrl && token) {
        try {
          const freshData = await base44.functions.invoke('getOnboardingData', { token });
          if (freshData?.data?.company?.tfn_employer_signature) {
            employerSignatureUrl = freshData.data.company.tfn_employer_signature;
          }
        } catch (e) {
          console.warn('[Onboarding] Failed to fetch company signature fallback:', e);
        }
      }

      const pdfContext = {
        employee: { ...data.employee, ...finalFormData },
        branch: data.branch,
        company: {
          ...data.company,
          tfn_employer_signature: employerSignatureUrl
        },
        form: finalFormData,
        signatureDataUrl: signature
      };

      // 3. Generate official PDFs (ATO NAT 3092 Vector Overlay, NAT 13080 Super Choice, Contract)
      const [tfnPdfBlob, superPdfBlob, contractPdfBlob] = await Promise.all([
        buildTfnPdf(pdfContext),
        buildSuperPdf(pdfContext),
        buildContractPdf(pdfContext)
      ]);

      // 4. Parallel upload generated official PDFs to private storage
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

      // 5. Consolidate documents from applicant question uploads (mapping photo ID and right to work)
      const questionUploadsList = questions
        .filter((q) => q.type === 'upload' && uploads[q.id])
        .map((q) => {
          const lowerLabel = String(q.label || '').toLowerCase();
          const lowerId = String(q.id || '').toLowerCase();
          let docType = q.id;
          if (lowerLabel.includes('id') || lowerLabel.includes('신분증') || lowerId.includes('id')) {
            docType = 'id';
          } else if (
            lowerLabel.includes('right') ||
            lowerLabel.includes('work') ||
            lowerLabel.includes('visa') ||
            lowerLabel.includes('비자') ||
            lowerLabel.includes('vevo') ||
            lowerId.includes('visa') ||
            lowerId.includes('right_to_work')
          ) {
            docType = 'right_to_work';
          }
          return {
            name: `${q.label} (${uploads[q.id].name})`,
            type: docType,
            doc_type: docType,
            file_uri: uploads[q.id].file_uri,
            url: uploads[q.id].file_uri,
            created_at: now,
            uploaded_by: 'applicant'
          };
        });

      const docs = [
        ...questionUploadsList,
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
          name: 'Employment Contract',
          type: 'contract',
          doc_type: 'contract',
          file_uri: contractUpload.file_uri,
          created_at: now
        }
      ];

      // 6. Invoke edge function to persist answers and documents
      const extraAnswers = questions.map((q) => ({
        id: q.id,
        label: q.label,
        answer: (answers[q.id] || {}).answer || '',
        follow_up: (answers[q.id] || {}).follow_up || {}
      }));

      const res = await base44.functions.invoke('submitOnboarding', {
        token,
        extra_answers: extraAnswers,
        signature_file_uri: signatureUpload.file_uri,
        declaration_accepted: true,
        tfn: {
          number: tfnClean,
          pending: taxForm.tfnMode !== 'number',
          exemption_type: taxForm.tfnMode !== 'number' ? taxForm.tfnMode : null,
          residency_status: taxForm.residency,
          tax_free_threshold: taxForm.taxFreeThreshold === 'yes',
          hecs_help: taxForm.studentDebt === 'yes',
          basis_of_payment: taxForm.employmentBasis
        },
        bank: {
          bsb: finalFormData.bank_bsb,
          account_number: finalFormData.bank_account_number,
          account_name: finalFormData.bank_account_name
        },
        super: {
          choice: finalFormData.super_choice,
          fund_name: finalFormData.super_fund_name,
          usi: finalFormData.super_usi,
          fund_abn: finalFormData.super_fund_abn,
          member_number: finalFormData.super_member_number
        },
        docs
      });

      if (res.data?.ok) {
        setState('completed');
      } else {
        throw new Error(res.data?.error || 'Failed to submit onboarding details.');
      }
    } catch (submitErr) {
      setError(submitErr.message || 'An error occurred while submitting your documents. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ==============================================================================
  // State Views: Loading, Invalid, Completed
  // ==============================================================================
  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-slate-50">
        <SlimTopBar active={true} />
        <div className="flex items-center gap-3 text-sm text-slate-500 font-medium">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>Loading onboarding form...</span>
        </div>
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-slate-50">
        <div className="max-w-md rounded-2xl border bg-white p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">Invalid or Expired Link</h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            This onboarding link has expired or is invalid. Please contact your manager or employer to request a new link.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'completed') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-slate-50">
        <div className="max-w-md rounded-2xl border bg-white p-6 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h1 className="mt-3 text-xl font-bold text-slate-900">Onboarding Documents Submitted</h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            Your official Australian Taxation Office (ATO) <b>NAT 3092 (TFN Declaration)</b>, <b>NAT 13080 (Superannuation Choice)</b>, and Employment Contract have been successfully submitted.
          </p>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 border">
            Your documents are securely encrypted and stored in the company's document vault. You may now safely close this window.
          </div>
        </div>
      </div>
    );
  }

  const brandColor = data.branch?.brand_color || '#2563eb';
  const progressPercent = Math.round(((step + 1) / totalSteps) * 100);

  return (
    <div className="min-h-screen bg-slate-50/70 pb-16">
      {/* Slim top progress bar for micro-feedback */}
      <SlimTopBar active={saving} />

      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-30 shadow-xs">
        <div className="mx-auto max-w-2xl px-4 py-3.5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: brandColor }}
              />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {data.company?.name || 'KWorkMate'}
              </span>
            </div>
            <h1 className="text-sm font-bold text-slate-900 mt-0.5">
              {data.branch?.name ? `${data.branch.name} — Employee Onboarding` : 'Employee Onboarding'}
            </h1>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium text-slate-500">
              Step {step + 1} of {totalSteps}
            </span>
          </div>
        </div>
        <Progress value={progressPercent} className="h-1 rounded-none bg-slate-100" />
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6 space-y-6">
        {/* Step Title & Subtitle */}
        <div>
          <h2 className="text-lg font-bold text-slate-900">{currentPage?.title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {currentPage?.type === 'questions' && 'Please complete the onboarding details requested by your employer.'}
            {currentPage?.type === 'tax' && 'Your information has been pre-filled. Please review and complete your official ATO NAT 3092 Tax File Number Declaration.'}
            {currentPage?.type === 'sign' && 'Please review the payee declaration and provide your digital signature below.'}
          </p>
        </div>

        {/* ============================================================================== */}
        {/* [Step Type 1]: Employer Questionnaire Step (Includes applicant file uploads) */}
        {/* ============================================================================== */}
        {currentPage?.type === 'questions' && (
          <section className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
            {(currentPage.page?.questions || []).map((question) => {
              const value = answers[question.id] || {};
              const fields =
                question.type === 'yes_no' && question.follow_up && question.follow_up.when === value.answer
                  ? question.follow_up.fields || []
                  : [];

              return (
                <div key={question.id} className="space-y-2 pb-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-slate-800">
                      {question.label} {question.required !== false && <span className="text-red-500">*</span>}
                    </Label>
                    {question.required === false && (
                      <span className="text-[11px] text-slate-400">Optional</span>
                    )}
                  </div>
                  {question.description && (
                    <p className="text-xs text-slate-500 leading-relaxed">{question.description}</p>
                  )}

                  {question.type === 'yes_no' && (
                    <RadioGroup
                      value={value.answer || ''}
                      onValueChange={(ans) => setAnswer(question.id, ans, question.label)}
                      className="flex gap-4 pt-1"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="yes" id={`${question.id}-yes`} />
                        <label htmlFor={`${question.id}-yes`} className="text-sm cursor-pointer">
                          Yes
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="no" id={`${question.id}-no`} />
                        <label htmlFor={`${question.id}-no`} className="text-sm cursor-pointer">
                          No
                        </label>
                      </div>
                    </RadioGroup>
                  )}

                  {question.type === 'select' && (
                    <Select value={value.answer || ''} onValueChange={(ans) => setAnswer(question.id, ans, question.label)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select an option" />
                      </SelectTrigger>
                      <SelectContent>
                        {(question.options || []).map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {question.type === 'upload' && (
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 p-3 text-sm hover:border-slate-400 transition-colors">
                      <span className="flex min-w-0 items-center gap-2 text-slate-600">
                        {uploadingId === question.id ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                        ) : (
                          <Paperclip className="h-4 w-4 shrink-0" />
                        )}
                        <span className="truncate">
                          {uploadingId === question.id
                            ? 'Uploading...'
                            : uploads[question.id]
                            ? uploads[question.id].name
                            : 'Choose file (PDF, JPG, PNG)'}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-primary">
                        {uploads[question.id] ? 'Change' : 'Browse'}
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        accept={allowedFileTypes(question).map((t) => `.${t}`).join(',') || '.pdf,.jpg,.jpeg,.png'}
                        onChange={(e) => chooseQuestionFile(question, e.target.files && e.target.files[0])}
                      />
                    </label>
                  )}

                  {question.type === 'number' && (
                    <Input
                      inputMode="numeric"
                      value={value.answer || ''}
                      onChange={(e) =>
                        setAnswer(question.id, digitsOnly(e.target.value, Number(validationOf(question).digits) || 0), question.label)
                      }
                      placeholder={
                        Number(validationOf(question).digits) > 0
                          ? `Up to ${validationOf(question).digits} digits`
                          : 'Numbers only'
                      }
                    />
                  )}

                  {question.type === 'date' && (
                    <Input
                      type="date"
                      value={value.answer || ''}
                      onChange={(e) => setAnswer(question.id, e.target.value, question.label)}
                    />
                  )}

                  {question.type === 'phone' && (
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 select-none">
                        +61
                      </div>
                      <Input
                        type="tel"
                        inputMode="numeric"
                        value={value.answer || ''}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '');
                          const trimmed = raw.replace(/^0+/, '').slice(0, 9);
                          setAnswer(question.id, trimmed, question.label);
                        }}
                        placeholder="411 602 349 (9 digits)"
                        maxLength={9}
                        className="flex-1 font-mono tracking-wider"
                      />
                    </div>
                  )}

                  {question.type !== 'yes_no' &&
                    question.type !== 'select' &&
                    question.type !== 'upload' &&
                    question.type !== 'number' &&
                    question.type !== 'date' &&
                    question.type !== 'phone' && (
                      <Input
                        value={value.answer || ''}
                        onChange={(e) => setAnswer(question.id, e.target.value, question.label)}
                        placeholder="Enter your answer"
                      />
                    )}

                  {/* Follow-up question fields */}
                  {fields.map((field) => (
                    <div key={field} className="pt-2 pl-3 border-l-2 border-slate-200 space-y-1">
                      <Label className="text-xs font-medium text-slate-700">{field}</Label>
                      <Input
                        value={(value.follow_up || {})[field] || ''}
                        onChange={(e) => setFollowUp(question.id, field, e.target.value)}
                        placeholder={`Enter ${field}`}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </section>
        )}

        {/* ============================================================================== */}
        {/* [Step Type 2]: Australian Taxation Office (ATO) Tax Declaration (NAT 3092) */}
        {/* Pre-filled from earlier answers so the applicant only needs to review! */}
        {/* ============================================================================== */}
        {currentPage?.type === 'tax' && (
          <section className="space-y-6 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900 leading-relaxed">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-950 mb-1">
                <FileCheck className="h-4.5 w-4.5 text-emerald-600" />
                Australian Taxation Office (ATO) NAT 3092 Tax File Number Declaration
              </div>
              Your details have been <b>automatically pre-filled</b> from your previous answers.
              Please review all fields and confirm any remaining ATO questions below.
            </div>

            {/* Q1: Tax File Number */}
            <div className="space-y-3 p-4 rounded-xl border bg-slate-50/60">
              <Label className="text-sm font-bold text-slate-800 flex items-center justify-between">
                <span>1. What is your tax file number (TFN)?</span>
                <span className="text-xs font-normal text-slate-500">ATO NAT 3092 Q1</span>
              </Label>

              <RadioGroup
                value={taxForm.tfnMode}
                onValueChange={(v) => setTaxForm((t) => ({ ...t, tfnMode: v }))}
                className="space-y-2 pt-1"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="number" id="tfn-has-number" />
                  <label htmlFor="tfn-has-number" className="text-xs font-medium cursor-pointer">
                    I have a TFN
                  </label>
                </div>
                {taxForm.tfnMode === 'number' && (
                  <div className="pl-6 pt-1">
                    <Input
                      inputMode="numeric"
                      value={taxForm.tfnNumber}
                      onChange={(e) => setTaxForm((t) => ({ ...t, tfnNumber: digitsOnly(e.target.value, 9) }))}
                      placeholder="8 or 9 digit number (e.g. 123 456 789)"
                      className="max-w-xs font-mono text-sm tracking-wider"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Numbers only will be automatically formatted into the official 9-box section.
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <RadioGroupItem value="applied" id="tfn-applied" />
                  <label htmlFor="tfn-applied" className="text-xs font-medium cursor-pointer">
                    I have made a separate application/enquiry to the ATO for a new or existing TFN (28-day grace period)
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <RadioGroupItem value="under18" id="tfn-under18" />
                  <label htmlFor="tfn-under18" className="text-xs font-medium cursor-pointer">
                    Exemption: Under 18 years of age
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <RadioGroupItem value="pensioner" id="tfn-pensioner" />
                  <label htmlFor="tfn-pensioner" className="text-xs font-medium cursor-pointer">
                    Exemption: In receipt of a pension, benefit or allowance
                  </label>
                </div>
              </RadioGroup>
            </div>

            {/* Q2 & Q4: Name */}
            <div className="space-y-3 p-4 rounded-xl border bg-slate-50/60">
              <Label className="text-sm font-bold text-slate-800">2. What is your name?</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs text-slate-600">Title</Label>
                  <Select value={taxForm.title} onValueChange={(v) => setTaxForm((t) => ({ ...t, title: v }))}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mr">Mr</SelectItem>
                      <SelectItem value="Mrs">Mrs</SelectItem>
                      <SelectItem value="Miss">Miss</SelectItem>
                      <SelectItem value="Ms">Ms</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-3">
                  <Label className="text-xs text-slate-600">Surname / Family name *</Label>
                  <Input
                    value={taxForm.familyName}
                    onChange={(e) => setTaxForm((t) => ({ ...t, familyName: e.target.value.toUpperCase() }))}
                    placeholder="SMITH"
                    className="h-9 text-xs uppercase"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-600">First given name *</Label>
                  <Input
                    value={taxForm.givenNames}
                    onChange={(e) => setTaxForm((t) => ({ ...t, givenNames: e.target.value.toUpperCase() }))}
                    placeholder="JOHN"
                    className="h-9 text-xs uppercase"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-600">Other given names</Label>
                  <Input
                    value={taxForm.otherNames}
                    onChange={(e) => setTaxForm((t) => ({ ...t, otherNames: e.target.value.toUpperCase() }))}
                    className="h-9 text-xs uppercase"
                  />
                </div>
              </div>

              {/* Previous Name (Q4) */}
              <div className="pt-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="changed-name"
                    checked={taxForm.hasChangedName}
                    onCheckedChange={(v) => setTaxForm((t) => ({ ...t, hasChangedName: Boolean(v) }))}
                  />
                  <label htmlFor="changed-name" className="text-xs text-slate-700 cursor-pointer">
                    I have changed my family name since I last dealt with the ATO (Q4)
                  </label>
                </div>
                {taxForm.hasChangedName && (
                  <div className="pt-2 pl-6">
                    <Input
                      value={taxForm.previousFamilyName}
                      onChange={(e) => setTaxForm((t) => ({ ...t, previousFamilyName: e.target.value.toUpperCase() }))}
                      placeholder="Previous family name"
                      className="h-9 text-xs uppercase max-w-sm"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Q3: Home Address in Australia */}
            <div className="space-y-3 p-4 rounded-xl border bg-slate-50/60">
              <Label className="text-sm font-bold text-slate-800">3. What is your home address in Australia?</Label>
              <div className="grid gap-2.5">
                <Input
                  value={taxForm.addressLine}
                  onChange={(e) => setTaxForm((t) => ({ ...t, addressLine: e.target.value.toUpperCase() }))}
                  placeholder="Street address (e.g. 123 GEORGE ST)"
                  className="h-9 text-xs uppercase"
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    value={taxForm.suburb}
                    onChange={(e) => setTaxForm((t) => ({ ...t, suburb: e.target.value.toUpperCase() }))}
                    placeholder="Suburb / Town (e.g. SYDNEY)"
                    className="h-9 text-xs uppercase"
                  />
                  <Select value={taxForm.state} onValueChange={(v) => setTaxForm((t) => ({ ...t, state: v }))}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent>
                      {['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].map((st) => (
                        <SelectItem key={st} value={st}>
                          {st}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    value={taxForm.postcode}
                    onChange={(e) => setTaxForm((t) => ({ ...t, postcode: digitsOnly(e.target.value, 4) }))}
                    placeholder="Postcode (4 digits)"
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Q5 & Q6: Email & DOB */}
            <div className="grid sm:grid-cols-2 gap-4 p-4 rounded-xl border bg-slate-50/60">
              <div>
                <Label className="text-sm font-bold text-slate-800">5. Primary email address</Label>
                <Input
                  type="email"
                  value={taxForm.email}
                  onChange={(e) => setTaxForm((t) => ({ ...t, email: e.target.value }))}
                  placeholder="name@email.com"
                  className="h-9 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-bold text-slate-800">6. Date of birth</Label>
                <Input
                  type="date"
                  value={taxForm.dob}
                  onChange={(e) => setTaxForm((t) => ({ ...t, dob: e.target.value }))}
                  className="h-9 text-xs mt-1"
                />
              </div>
            </div>

            {/* Q7: Employment Basis */}
            <div className="space-y-2 p-4 rounded-xl border bg-slate-50/60">
              <Label className="text-sm font-bold text-slate-800">7. On what basis are you paid?</Label>
              <RadioGroup
                value={taxForm.employmentBasis}
                onValueChange={(v) => setTaxForm((t) => ({ ...t, employmentBasis: v }))}
                className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1"
              >
                {[
                  { id: 'casual', label: 'Casual' },
                  { id: 'part_time', label: 'Part-time' },
                  { id: 'full_time', label: 'Full-time' },
                  { id: 'labour_hire', label: 'Labour hire' },
                  { id: 'super_stream', label: 'Super / Annuity' }
                ].map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <RadioGroupItem value={item.id} id={`basis-${item.id}`} />
                    <label htmlFor={`basis-${item.id}`} className="text-xs cursor-pointer">
                      {item.label}
                    </label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Q8: Residency */}
            <div className="space-y-2 p-4 rounded-xl border bg-slate-50/60">
              <Label className="text-sm font-bold text-slate-800">8. Are you:</Label>
              <RadioGroup
                value={taxForm.residency}
                onValueChange={(v) => setTaxForm((t) => ({ ...t, residency: v }))}
                className="space-y-2 pt-1"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="resident" id="res-aus" />
                  <label htmlFor="res-aus" className="text-xs font-medium cursor-pointer">
                    An Australian resident for tax purposes
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="foreign" id="res-foreign" />
                  <label htmlFor="res-foreign" className="text-xs font-medium cursor-pointer">
                    A foreign resident for tax purposes
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="working_holiday" id="res-whm" />
                  <label htmlFor="res-whm" className="text-xs font-medium cursor-pointer">
                    A working holiday maker (Subclass 417 / 462)
                  </label>
                </div>
              </RadioGroup>
            </div>

            {/* Q9: Tax-Free Threshold */}
            <div className="space-y-2 p-4 rounded-xl border bg-slate-50/60">
              <Label className="text-sm font-bold text-slate-800">
                9. Do you want to claim the tax-free threshold from this payer?
              </Label>
              <p className="text-[11px] text-slate-500">
                You can generally only claim the $18,200 tax-free threshold from one payer at a time.
              </p>
              <RadioGroup
                value={taxForm.taxFreeThreshold}
                onValueChange={(v) => setTaxForm((t) => ({ ...t, taxFreeThreshold: v }))}
                className="flex gap-6 pt-1"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="yes" id="tft-yes" />
                  <label htmlFor="tft-yes" className="text-xs font-medium cursor-pointer">Yes</label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="no" id="tft-no" />
                  <label htmlFor="tft-no" className="text-xs font-medium cursor-pointer">No</label>
                </div>
              </RadioGroup>
            </div>

            {/* Q10: Student Debt */}
            <div className="space-y-2 p-4 rounded-xl border bg-slate-50/60">
              <Label className="text-sm font-bold text-slate-800">
                10. Do you have a Higher Education Loan Program (HELP), VET Student Loan (VSL), FS, SSL or Trade Support Loan (TSL) debt?
              </Label>
              <RadioGroup
                value={taxForm.studentDebt}
                onValueChange={(v) => setTaxForm((t) => ({ ...t, studentDebt: v }))}
                className="flex gap-6 pt-1"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="yes" id="loan-yes" />
                  <label htmlFor="loan-yes" className="text-xs font-medium cursor-pointer">Yes</label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="no" id="loan-no" />
                  <label htmlFor="loan-no" className="text-xs font-medium cursor-pointer">No</label>
                </div>
              </RadioGroup>
            </div>
          </section>
        )}

        {/* ============================================================================== */}
        {/* [Step Type 3]: Payee Declaration & Digital Signature */}
        {/* ============================================================================== */}
        {currentPage?.type === 'sign' && (
          <section className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-700 leading-relaxed border space-y-2">
              <p className="font-semibold text-slate-900 text-sm">
                DECLARATION by payee (Section A)
              </p>
              <p>
                I declare that the information that I have given is true and correct.
              </p>
              <p className="text-[11px] text-red-600 font-medium">
                * There are penalties for deliberately making a false or misleading statement.
              </p>
            </div>

            {/* Signature Pad */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <PenTool className="h-4 w-4 text-primary" />
                  Digital Signature (You MUST sign here) *
                </Label>
                {signature && (
                  <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Signature captured
                  </span>
                )}
              </div>
              <SignaturePad
                ref={padRef}
                onChange={(dataUrl) => {
                  setSignature(dataUrl);
                  setError('');
                }}
              />
            </div>

            {/* Declaration Checkbox */}
            <div className="flex items-start gap-3 rounded-xl border p-3.5 bg-slate-50/50">
              <Checkbox
                id="declaration-cb"
                checked={declaration}
                onCheckedChange={(v) => {
                  setDeclaration(Boolean(v));
                  setError('');
                }}
              />
              <label htmlFor="declaration-cb" className="text-xs leading-relaxed text-slate-800 cursor-pointer">
                I declare that the personal, tax, and employment information provided is true and correct, and I consent to its use in generating official ATO NAT 3092 and NAT 13080 documents.
              </label>
            </div>

            <div className="space-y-1.5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5 text-xs text-emerald-900">
              <p className="flex items-center gap-1.5 font-bold">
                <FileCheck className="h-4 w-4 text-emerald-600" />
                Official ATO Vector PDF Generation
              </p>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Upon submission, your answers will be accurately rendered onto the official Australian Government NAT 3092 form with high-resolution vector precision and securely saved to your document vault.
              </p>
            </div>

            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-slate-400" />
              Your TFN and personal data are protected with AES-256 bank-grade encryption.
            </p>
          </section>
        )}

        {/* Error Alert */}
        {error && (
          <p className="flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-all">{error}</span>
          </p>
        )}

        {/* Navigation & Submit Buttons */}
        <div className="flex gap-3 pt-2">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setError('');
                setStep((s) => s - 1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="h-11 px-5"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
          )}

          {step < totalSteps - 1 ? (
            <Button
              type="button"
              className="flex-1 h-11 text-sm font-semibold"
              onClick={next}
            >
              Next Step <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              className="flex-1 h-11 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              disabled={saving}
              onClick={submit}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Official PDFs & Submitting...
                </>
              ) : (
                <>
                  <FileCheck className="mr-2 h-4 w-4" />
                  Submit Onboarding Documents
                </>
              )}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
