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

// 상단 미세 프로그레스 바 (마이크로 피드백용)
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

  // 고용주가 설정한 질문 답변 상태
  const [answers, setAnswers] = useState({});
  // 고용주 질문 중 파일 업로드 상태
  const [uploads, setUploads] = useState({});
  const [uploadingId, setUploadingId] = useState('');

  // 회사 설정 증빙 서류 (신분증, 비자 증빙 등)
  const [companyDocUploads, setCompanyDocUploads] = useState({});
  const [uploadingDocKey, setUploadingDocKey] = useState('');
  const companyDocFileRef = useRef(null);
  const pickingDocKey = useRef('');

  // ==============================================================================
  // 국세청 공식 세무 폼 (ATO NAT 3092) 상태 - 앞 단계 답변에서 자동 연동(Prefill)
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

  // 데이터 로드
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

        // 기본 사원 정보가 있으면 Tax 폼에 초기 매핑
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

  // 고용주 질문 목록
  const questions = (data && data.onboarding_questions) || [];

  // 고용주가 요구하는 필수 서류 목록 (신분증, 비자 증빙 등)
  const getCompanyDocTypes = () => {
    const rawList = data?.company?.onboarding_doc_types || [
      { key: 'id', label: '신분증 (ID)', label_en: 'Photo ID (Passport or Driver Licence)', required: true },
      { key: 'right_to_work', label: 'Right to Work 증빙 (비자/시민권)', label_en: 'Right to Work Evidence (VEVO / Passport)', required: true }
    ];
    return rawList.filter((item) => item && item.kind !== 'info' && item.key !== 'tfn' && item.key !== 'super' && item.key !== 'contract');
  };

  // 고용주가 설정한 page 번호에 따라 질문들을 페이지별로 그룹화
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
    page.title = titled ? String(titled.page_title).trim() : (page.questions[0]?.label || '질문');
  });

  // 전체 온보딩 페이지 리스트: [고용주 질문 페이지들...] -> [필수 첨부서류 페이지(서류가 있을 때)] -> [국세청 세무 신고서 페이지] -> [최종 서명 페이지]
  const hasCompanyDocs = getCompanyDocTypes().length > 0;
  const pages = [
    ...questionPages.map((p, idx) => ({ type: 'questions', page: p, title: p.title || `Step ${idx + 1}` })),
    ...(hasCompanyDocs ? [{ type: 'docs', title: '필수 서류 제출 (ID & Right to Work)' }] : []),
    { type: 'tax', title: '호주 국세청(ATO) 세무 신고 (NAT 3092)' },
    { type: 'sign', title: '서약 및 전자서명' }
  ];

  const totalSteps = pages.length;
  const currentPage = step < totalSteps ? pages[step] : null;

  // 답변 핸들러 (질문 라벨을 함께 넘겨 Tax 폼에 정확히 매핑)
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
  // [중복 질문 제거] 앞 단계 답변이 들어오면 Tax 폼에 실시간 자동 매핑
  // ==============================================================================
  const syncAnswerToTaxForm = (id, val, questionLabel = '') => {
    const str = String(val || '').trim();
    if (!str) return;
    const lowerId = String(id || '').toLowerCase();
    const lowerLabel = String(questionLabel || '').toLowerCase();

    setTaxForm((prev) => {
      const next = { ...prev };

      // 1. Suburb (라벨 또는 ID 매칭)
      if (lowerId.includes('suburb') || lowerLabel.includes('suburb')) {
        next.suburb = str.toUpperCase();
        return next;
      }

      // 2. State (라벨 또는 ID 매칭)
      if (lowerId.includes('state') || lowerLabel.includes('state')) {
        next.state = str.toUpperCase();
        return next;
      }

      // 3. Postcode (라벨 또는 ID 매칭)
      if (lowerId.includes('post') || lowerLabel.includes('post')) {
        next.postcode = str.replace(/\D/g, '').slice(0, 4);
        return next;
      }

      // 4. 주소 (Street address)
      if (lowerId.includes('address') || lowerLabel.includes('address')) {
        next.addressLine = str;
        // 주소에 쉼표로 한 줄에 다 적었을 때 자동 분리 지원
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
      }
      // 2. 생년월일 (YYYY-MM-DD 정규화)
      if (id === 'default_dob' || id.includes('dob') || id.includes('birth')) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
          next.dob = str;
        } else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(str)) {
          const p = str.split(/[\/\-]/);
          next.dob = `${p[2]}-${String(p[1]).padStart(2, '0')}-${String(p[0]).padStart(2, '0')}`;
        } else {
          next.dob = str;
        }
      }
      // 3. 성명
      if (id === 'default_name' || id === 'full_name') {
        const parts = str.split(' ');
        next.givenNames = parts.slice(0, -1).join(' ') || parts[0] || '';
        next.familyName = parts.length > 1 ? parts[parts.length - 1] : '';
      }
      // 4. 전화번호 & 이메일
      if (id === 'default_phone' || id.includes('phone')) next.phone = str;
      if (id === 'default_email' || id.includes('email')) next.email = str;
      // 5. TFN
      if (id === 'default_tfn') {
        next.tfnNumber = str;
        next.tfnMode = 'number';
      }
      if (id === 'default_tfn_held') {
        if (str === 'no') next.tfnMode = 'applied';
        if (str === 'yes') next.tfnMode = 'number';
      }
      // 6. 면세 한도
      if (id === 'default_tax_free') {
        next.taxFreeThreshold = str === 'yes' ? 'yes' : 'no';
      }
      // 7. 학자금 대출
      if (id === 'default_hecs') {
        next.studentDebt = str === 'yes' ? 'yes' : 'no';
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

  // 고용주 질문 중 파일 업로드
  const chooseQuestionFile = async (question, file) => {
    if (!file) return;
    const types = allowedFileTypes(question);
    const extension = String(file.name || '').split('.').pop().toLowerCase();
    if (types.length > 0 && !types.includes(extension)) {
      setError(`다음 형식의 파일만 업로드할 수 있습니다: ${types.join(', ')}.`);
      return;
    }
    setUploadingId(question.id);
    setError('');
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      setUploads((prev) => ({ ...prev, [question.id]: { file_uri, name: file.name } }));
      setAnswer(question.id, file.name);
    } catch (err) {
      setError('파일 업로드에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setUploadingId('');
    }
  };

  // 회사 설정 필수 서류 (신분증, 비자 등) 업로드
  const chooseCompanyDoc = (docKey) => {
    pickingDocKey.current = docKey;
    if (companyDocFileRef.current) {
      companyDocFileRef.current.value = '';
      companyDocFileRef.current.click();
    }
  };

  const handleCompanyDocChange = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    const key = pickingDocKey.current;
    if (!file || !key) return;

    setUploadingDocKey(key);
    setError('');
    try {
      const res = await base44.integrations.Core.UploadPrivateFile({ file });
      if (!res || !res.file_uri) throw new Error('파일 업로드 경로를 생성하지 못했습니다.');
      setCompanyDocUploads((prev) => ({
        ...prev,
        [key]: {
          name: file.name,
          file_uri: res.file_uri,
          url: res.file_uri,
          uploaded_at: new Date().toISOString()
        }
      }));
    } catch (err) {
      setError(err.message || '서류 업로드 실패');
    } finally {
      setUploadingDocKey('');
    }
  };

  // 질문 유효성 검사
  const questionValid = (question) => {
    const val = answers[question.id] || {};
    const answer = String(val.answer || '').trim();
    if (question.required !== false && !answer) return false;
    if (answer && question.type === 'number') {
      const limit = Number(validationOf(question).digits) || 0;
      if (!/^\d+$/.test(answer)) return false;
      if (limit > 0 && answer.length > limit) return false;
    }
    if (answer && question.type === 'date' && !validDate(answer, dateFormatOf(question))) return false;
    if (question.type === 'yes_no' && question.follow_up && question.follow_up.when === val.answer) {
      const fields = question.follow_up.fields || [];
      if (fields.some((field) => !String((val.follow_up || {})[field] || '').trim())) return false;
    }
    return true;
  };

  // 현재 스텝 유효성 검사
  const validateCurrentStep = () => {
    if (!currentPage) return '';

    // 1. 고용주 질문 페이지
    if (currentPage.type === 'questions') {
      const questionsOnPage = currentPage.page?.questions || [];
      for (const q of questionsOnPage) {
        if (!questionValid(q)) {
          return `[${q.label}] 항목에 올바르게 답변해 주세요.`;
        }
      }
    }

    // 2. 필수 서류 페이지
    if (currentPage.type === 'docs') {
      const requiredDocs = getCompanyDocTypes().filter((d) => d.required !== false);
      for (const doc of requiredDocs) {
        if (!companyDocUploads[doc.key]) {
          return `필수 서류인 [${doc.label || doc.label_en || doc.key}] 파일을 업로드해 주세요.`;
        }
      }
    }

    // 3. Tax 폼 페이지
    if (currentPage.type === 'tax') {
      if (!taxForm.familyName.trim()) return '국세청 신고서에 기재할 성(Family Name)을 입력해 주세요.';
      if (!taxForm.givenNames.trim()) return '국세청 신고서에 기재할 이름(First Given Name)을 입력해 주세요.';
      if (!taxForm.dob.trim()) return '생년월일을 입력해 주세요.';
      if (!taxForm.addressLine.trim()) return '호주 거주지 주소를 입력해 주세요.';
      if (taxForm.tfnMode === 'number') {
        const cleanTfn = taxForm.tfnNumber.replace(/\D/g, '');
        if (cleanTfn.length < 8 || cleanTfn.length > 9) {
          return '올바른 8~9자리 TFN(납세자번호)를 입력하시거나, 면제/신청 중 옵션을 선택해 주세요.';
        }
      }
    }

    // 4. 서명 페이지
    if (currentPage.type === 'sign') {
      if (!signature) return '선언서 서명을 완료해 주세요.';
      if (!declaration) return '선언 및 동의 체크박스에 체크해 주세요.';
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
  // [최종 제출]: Tax 폼 작성 완료 후 Submit 버튼 클릭 시 실행
  // 100% 무손실 정부 벡터 양식(Page 5)으로 완성된 PDF 생성 후 플랫폼 보관함에 등록
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

      // 1. 전자서명 이미지 업로드
      const signatureBlob = await (await fetch(signature)).blob();
      const signatureFile = new File([signatureBlob], 'signature.png', { type: 'image/png' });
      const signatureUpload = await base44.integrations.Core.UploadPrivateFile({ file: signatureFile });

      // 2. 답변 내용 및 Tax 폼 데이터 병합
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

      const pdfContext = {
        employee: { ...data.employee, ...finalFormData },
        branch: data.branch,
        company: data.company,
        form: finalFormData,
        signatureDataUrl: signature
      };

      // 3. ATO 공식 NAT 3092 (100% 무손실 벡터 오버레이), NAT 13080, 고용계약서 자동 생성
      const [tfnPdfBlob, superPdfBlob, contractPdfBlob] = await Promise.all([
        buildTfnPdf(pdfContext),
        buildSuperPdf(pdfContext),
        buildContractPdf(pdfContext)
      ]);

      // 4. 생성된 공식 서류들을 Private 스토리지에 병렬 업로드
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

      // 5. 지원자가 질문 및 서류 단계에서 직접 업로드한 첨부파일들 통합
      const questionUploadsList = questions
        .filter((q) => q.type === 'upload' && uploads[q.id])
        .map((q) => ({
          name: `${q.label} (${uploads[q.id].name})`,
          type: 'onboarding',
          doc_type: q.id,
          file_uri: uploads[q.id].file_uri,
          url: uploads[q.id].file_uri,
          created_at: now,
          uploaded_by: 'applicant'
        }));

      const companyDocsList = Object.entries(companyDocUploads).map(([docKey, item]) => ({
        name: item.name,
        type: docKey,
        doc_type: docKey,
        file_uri: item.file_uri,
        url: item.file_uri,
        created_at: now,
        uploaded_by: 'applicant'
      }));

      // 서류함에 최종 보관될 docs 목록 (공식 3종 + 사용자 증빙 서류)
      const docs = [
        ...companyDocsList,
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

      // 6. 엣지 함수 호출하여 사원 프로필 및 tfn_declarations 감사 테이블에 등록
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
        throw new Error(res.data?.error || '온보딩 정보 제출에 실패했습니다.');
      }
    } catch (submitErr) {
      setError(submitErr.message || '온보딩 서류 처리 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  // ==============================================================================
  // 상태별 뷰 (로딩, 만료, 완료)
  // ==============================================================================
  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-slate-50">
        <SlimTopBar active={true} />
        <div className="flex items-center gap-3 text-sm text-slate-500 font-medium">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>온보딩 양식을 불러오는 중입니다...</span>
        </div>
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-slate-50">
        <div className="max-w-md rounded-2xl border bg-white p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">유효하지 않은 링크입니다</h1>
          <p className="mt-2 text-sm text-slate-600">
            링크가 만료되었거나 올바르지 않습니다. 관리자에게 새로운 온보딩 링크 발송을 요청해 주세요.
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
          <h1 className="mt-3 text-xl font-bold text-slate-900">온보딩 서류 제출 완료</h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            호주 국세청(ATO) 공식 <b>NAT 3092 (TFN 신고서)</b> 및 <b>NAT 13080 (연금 선택서)</b>, 고용계약서 서명이 성공적으로 접수되었습니다.
          </p>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 border">
            제출된 서류는 회사의 비공개 서류 보관함에 안전하게 암호화되어 보관됩니다. 창을 닫으셔도 좋습니다.
          </div>
        </div>
      </div>
    );
  }

  const brandColor = data.branch?.brand_color || '#2563eb';
  const progressPercent = Math.round(((step + 1) / totalSteps) * 100);

  return (
    <div className="min-h-screen bg-slate-50/70 pb-16">
      {/* 인터랙션을 막지 않는 마이크로 피드백 상단 바 */}
      <SlimTopBar active={saving} />

      {/* 헤더 */}
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
              {data.branch?.name ? `${data.branch.name} — 온보딩` : '직원 온보딩'}
            </h1>
          </div>
          <div className="text-right">
            <span className="text-xs font-medium text-slate-500">
              {step + 1} / {totalSteps} 단계
            </span>
          </div>
        </div>
        <Progress value={progressPercent} className="h-1 rounded-none bg-slate-100" />
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6 space-y-6">
        {/* 스텝 제목 */}
        <div>
          <h2 className="text-lg font-bold text-slate-900">{currentPage?.title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {currentPage?.type === 'questions' && '고용주가 요청한 온보딩 항목을 입력해 주세요.'}
            {currentPage?.type === 'docs' && '호주 노동법 및 근무 자격 확인에 필요한 증빙서류를 첨부해 주세요.'}
            {currentPage?.type === 'tax' && '앞서 입력하신 정보가 자동 연동되었습니다. 호주 국세청(ATO) 공식 NAT 3092 양식 내용을 확인해 주세요.'}
            {currentPage?.type === 'sign' && '제출 전 선언문을 확인하고 자필 서명을 완료해 주세요.'}
          </p>
        </div>

        {/* ============================================================================== */}
        {/* [페이지 타입 1]: 고용주 설정 질문 페이지 */}
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
                      <span className="text-[11px] text-slate-400">선택</span>
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
                          예 (Yes)
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="no" id={`${question.id}-no`} />
                        <label htmlFor={`${question.id}-no`} className="text-sm cursor-pointer">
                          아니오 (No)
                        </label>
                      </div>
                    </RadioGroup>
                  )}

                  {question.type === 'select' && (
                    <Select value={value.answer || ''} onValueChange={(ans) => setAnswer(question.id, ans, question.label)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="선택해 주세요" />
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
                            ? '업로드 중...'
                            : uploads[question.id]
                            ? uploads[question.id].name
                            : '파일 선택 (PDF, JPG, PNG)'}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-primary">
                        {uploads[question.id] ? '변경' : '찾아보기'}
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
                          ? `최대 ${validationOf(question).digits}자리 숫자`
                          : '숫자만 입력'
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

                  {question.type !== 'yes_no' &&
                    question.type !== 'select' &&
                    question.type !== 'upload' &&
                    question.type !== 'number' &&
                    question.type !== 'date' && (
                      <Input
                        value={value.answer || ''}
                        onChange={(e) => setAnswer(question.id, e.target.value, question.label)}
                        placeholder="답변을 입력해 주세요"
                      />
                    )}

                  {/* 후속 질문 필드 */}
                  {fields.map((field) => (
                    <div key={field} className="pt-2 pl-3 border-l-2 border-slate-200 space-y-1">
                      <Label className="text-xs font-medium text-slate-700">{field}</Label>
                      <Input
                        value={(value.follow_up || {})[field] || ''}
                        onChange={(e) => setFollowUp(question.id, field, e.target.value)}
                        placeholder={`${field} 입력`}
                      />
                    </div>
                  ))}
                </div>
              );
            })}
          </section>
        )}

        {/* ============================================================================== */}
        {/* [페이지 타입 2]: 회사 설정 필수 서류 제출 페이지 (신분증 & 비자 증빙) */}
        {/* ============================================================================== */}
        {currentPage?.type === 'docs' && (
          <section className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-blue-900 leading-relaxed flex items-start gap-2.5">
              <FileCheck className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-950">회사 요구 증빙서류 첨부</p>
                호주 노동법 및 본인 확인 규격에 맞추어 아래 증빙 서류를 업로드해 주세요.
              </div>
            </div>

            <div className="grid gap-3 pt-2">
              {getCompanyDocTypes().map((docType) => {
                const currentDoc = companyDocUploads[docType.key];
                const isUploading = uploadingDocKey === docType.key;

                return (
                  <div
                    key={docType.key}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-slate-50/50 hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-800 break-words">
                          {docType.label || docType.label_en || docType.key}
                        </span>
                        {docType.required !== false ? (
                          <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                            필수
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                            선택
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 break-words">
                        {docType.key === 'id'
                          ? '여권(Passport) 사진 또는 호주 운전면허증 스캔본 (PDF, JPG, PNG)'
                          : docType.key === 'right_to_work'
                          ? '호주 비자 승인 레터(VEVO) 또는 영주권/시민권 증빙 서류'
                          : docType.label_en || '서류 파일을 첨부해 주세요.'}
                      </p>
                      {currentDoc && (
                        <div className="mt-2.5 flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span className="break-all flex-1">{currentDoc.name}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setCompanyDocUploads((prev) => {
                                const next = { ...prev };
                                delete next[docType.key];
                                return next;
                              })
                            }
                            className="text-slate-400 hover:text-red-500 text-xs ml-1"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant={currentDoc ? 'outline' : 'default'}
                        disabled={isUploading}
                        onClick={() => chooseCompanyDoc(docType.key)}
                        className="text-xs h-9 min-w-[85px]"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            업로드...
                          </>
                        ) : currentDoc ? (
                          '파일 변경'
                        ) : (
                          '파일 선택'
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <input
              ref={companyDocFileRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={handleCompanyDocChange}
            />
          </section>
        )}

        {/* ============================================================================== */}
        {/* [페이지 타입 3]: 호주 국세청(ATO) 세무 신고서 NAT 3092 (맨 마지막 직전) */}
        {/* 앞 단계 답변이 이미 자동 채워져 있어서 중복 질문 없이 바로 검토 가능! */}
        {/* ============================================================================== */}
        {currentPage?.type === 'tax' && (
          <section className="space-y-6 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900 leading-relaxed">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-950 mb-1">
                <FileCheck className="h-4.5 w-4.5 text-emerald-600" />
                호주 국세청(ATO) 공식 NAT 3092 세무 신고서
              </div>
              앞서 입력하신 정보가 정부 공식 양식에 <b>자동 반영</b>되었습니다.
              내용을 확인하시고, 국세청 고유 질문(호주 세법상 거주자 분류 등)만 최종 체크해 주세요.
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
                    TFN 번호 보유 (I have a TFN)
                  </label>
                </div>
                {taxForm.tfnMode === 'number' && (
                  <div className="pl-6 pt-1">
                    <Input
                      inputMode="numeric"
                      value={taxForm.tfnNumber}
                      onChange={(e) => setTaxForm((t) => ({ ...t, tfnNumber: digitsOnly(e.target.value, 9) }))}
                      placeholder="8자리 또는 9자리 숫자 (예: 123 456 789)"
                      className="max-w-xs font-mono text-sm tracking-wider"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">숫자만 입력하시면 공식 9칸 박스에 자동 정렬됩니다.</p>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <RadioGroupItem value="applied" id="tfn-applied" />
                  <label htmlFor="tfn-applied" className="text-xs font-medium cursor-pointer">
                    TFN 신청 중 / 발급 대기 중 (I have made a separate application/enquiry to the ATO - 28일 유예)
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <RadioGroupItem value="under18" id="tfn-under18" />
                  <label htmlFor="tfn-under18" className="text-xs font-medium cursor-pointer">
                    만 18세 미만 비과세 면제 (Exemption: Under 18 years of age)
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <RadioGroupItem value="pensioner" id="tfn-pensioner" />
                  <label htmlFor="tfn-pensioner" className="text-xs font-medium cursor-pointer">
                    정부 연금 / 수당 수급자 면제 (Exemption: In receipt of a pension, benefit or allowance)
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
                  <Label className="text-xs text-slate-600">성 (Surname / Family name) *</Label>
                  <Input
                    value={taxForm.familyName}
                    onChange={(e) => setTaxForm((t) => ({ ...t, familyName: e.target.value.toUpperCase() }))}
                    placeholder="HONG"
                    className="h-9 text-xs uppercase"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-600">이름 (First given name) *</Label>
                  <Input
                    value={taxForm.givenNames}
                    onChange={(e) => setTaxForm((t) => ({ ...t, givenNames: e.target.value.toUpperCase() }))}
                    placeholder="GILDONG"
                    className="h-9 text-xs uppercase"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-slate-600">중간 이름 (Other given names)</Label>
                  <Input
                    value={taxForm.otherNames}
                    onChange={(e) => setTaxForm((t) => ({ ...t, otherNames: e.target.value.toUpperCase() }))}
                    className="h-9 text-xs uppercase"
                  />
                </div>
              </div>

              {/* 이전 성명 */}
              <div className="pt-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="changed-name"
                    checked={taxForm.hasChangedName}
                    onCheckedChange={(v) => setTaxForm((t) => ({ ...t, hasChangedName: Boolean(v) }))}
                  />
                  <label htmlFor="changed-name" className="text-xs text-slate-700 cursor-pointer">
                    과거 국세청(ATO) 거래 이후 성(Family name)을 변경한 적이 있습니다 (Q4)
                  </label>
                </div>
                {taxForm.hasChangedName && (
                  <div className="pt-2 pl-6">
                    <Input
                      value={taxForm.previousFamilyName}
                      onChange={(e) => setTaxForm((t) => ({ ...t, previousFamilyName: e.target.value.toUpperCase() }))}
                      placeholder="이전 성 (Previous family name)"
                      className="h-9 text-xs uppercase max-w-sm"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Q3: Address */}
            <div className="space-y-3 p-4 rounded-xl border bg-slate-50/60">
              <Label className="text-sm font-bold text-slate-800">3. What is your home address in Australia?</Label>
              <div className="grid gap-2.5">
                <Input
                  value={taxForm.addressLine}
                  onChange={(e) => setTaxForm((t) => ({ ...t, addressLine: e.target.value.toUpperCase() }))}
                  placeholder="Street Address (예: 123 GEORGE ST)"
                  className="h-9 text-xs uppercase"
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    value={taxForm.suburb}
                    onChange={(e) => setTaxForm((t) => ({ ...t, suburb: e.target.value.toUpperCase() }))}
                    placeholder="Suburb / Town (예: SYDNEY)"
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
                    placeholder="Postcode (4자리)"
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
                <Label className="text-sm font-bold text-slate-800">6. Date of birth (생년월일)</Label>
                <Input
                  type="date"
                  value={taxForm.dob}
                  onChange={(e) => setTaxForm((t) => ({ ...t, dob: e.target.value }))}
                  className="h-9 text-xs mt-1"
                />
              </div>
            </div>

            {/* Q7: Employment basis */}
            <div className="space-y-2 p-4 rounded-xl border bg-slate-50/60">
              <Label className="text-sm font-bold text-slate-800">7. On what basis are you paid? (고용 형태)</Label>
              <RadioGroup
                value={taxForm.employmentBasis}
                onValueChange={(v) => setTaxForm((t) => ({ ...t, employmentBasis: v }))}
                className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1"
              >
                {[
                  { id: 'casual', label: 'Casual (캐주얼)' },
                  { id: 'part_time', label: 'Part-time (파트타임)' },
                  { id: 'full_time', label: 'Full-time (풀타임)' },
                  { id: 'labour_hire', label: 'Labour hire (파견)' },
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
              <Label className="text-sm font-bold text-slate-800">8. Are you: (호주 세법상 거주자 구분)</Label>
              <RadioGroup
                value={taxForm.residency}
                onValueChange={(v) => setTaxForm((t) => ({ ...t, residency: v }))}
                className="space-y-2 pt-1"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="resident" id="res-aus" />
                  <label htmlFor="res-aus" className="text-xs font-medium cursor-pointer">
                    호주 세법상 거주자 (An Australian resident for tax purposes)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="foreign" id="res-foreign" />
                  <label htmlFor="res-foreign" className="text-xs font-medium cursor-pointer">
                    세법상 비거주자 (A foreign resident for tax purposes)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="working_holiday" id="res-whm" />
                  <label htmlFor="res-whm" className="text-xs font-medium cursor-pointer">
                    워킹홀리데이 비자 소지자 (A working holiday maker - Subclass 417 / 462)
                  </label>
                </div>
              </RadioGroup>
            </div>

            {/* Q9: Tax-free threshold */}
            <div className="space-y-2 p-4 rounded-xl border bg-slate-50/60">
              <Label className="text-sm font-bold text-slate-800">
                9. Do you want to claim the tax-free threshold from this payer? (면세 한도 적용)
              </Label>
              <p className="text-[11px] text-slate-500">주 수입원인 1개 직장에서만 $18,200 기본 면세 한도를 신청할 수 있습니다.</p>
              <RadioGroup
                value={taxForm.taxFreeThreshold}
                onValueChange={(v) => setTaxForm((t) => ({ ...t, taxFreeThreshold: v }))}
                className="flex gap-6 pt-1"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="yes" id="tft-yes" />
                  <label htmlFor="tft-yes" className="text-xs font-medium cursor-pointer">예 (Yes)</label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="no" id="tft-no" />
                  <label htmlFor="tft-no" className="text-xs font-medium cursor-pointer">아니오 (No)</label>
                </div>
              </RadioGroup>
            </div>

            {/* Q10: Student Debt */}
            <div className="space-y-2 p-4 rounded-xl border bg-slate-50/60">
              <Label className="text-sm font-bold text-slate-800">
                10. Do you have a HELP, VSL, FS, SSL or TSL debt? (학자금 대출 등 부채)
              </Label>
              <RadioGroup
                value={taxForm.studentDebt}
                onValueChange={(v) => setTaxForm((t) => ({ ...t, studentDebt: v }))}
                className="flex gap-6 pt-1"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="yes" id="loan-yes" />
                  <label htmlFor="loan-yes" className="text-xs font-medium cursor-pointer">예 (Yes)</label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="no" id="loan-no" />
                  <label htmlFor="loan-no" className="text-xs font-medium cursor-pointer">아니오 (No)</label>
                </div>
              </RadioGroup>
            </div>
          </section>
        )}

        {/* ============================================================================== */}
        {/* [페이지 타입 4]: 최종 서약 및 전자서명 (맨 마지막 단계) */}
        {/* ============================================================================== */}
        {currentPage?.type === 'sign' && (
          <section className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-700 leading-relaxed border space-y-2">
              <p className="font-semibold text-slate-900 text-sm">
                DECLARATION by payee (Section A 납세자 최종 선언)
              </p>
              <p>
                I declare that the information I have given is true and correct.
                (본인이 제출한 모든 정보는 진실하고 정확함을 선언합니다.)
              </p>
              <p className="text-[11px] text-red-600 font-medium">
                * There are penalties for deliberately making a false or misleading statement. (고의적인 허위 진술에는 법적 처벌이 따를 수 있습니다.)
              </p>
            </div>

            {/* 자필 서명 패드 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <PenTool className="h-4 w-4 text-primary" />
                  자필 전자서명 (You MUST SIGN here) *
                </Label>
                {signature && (
                  <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> 서명 완료
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

            {/* 선언문 동의 체크박스 */}
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
                위 선언문과 입력한 세무 및 고용 정보가 정확함을 확인하였으며, 호주 국세청(ATO) 규격의 공식 NAT 3092 및 NAT 13080 서류 생성을 위해 사용하는 것에 동의합니다.
              </label>
            </div>

            <div className="space-y-1.5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5 text-xs text-emerald-900">
              <p className="flex items-center gap-1.5 font-bold">
                <FileCheck className="h-4 w-4 text-emerald-600" />
                호주 국세청(ATO) 공식 원본 벡터 양식 생성
              </p>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                제출 버튼을 누르면 업로드해주신 <b>정부 원본 서식(NAT 3092-06.2019)</b>의 해당 박스에 답변이 정확히 인쇄된 초고화질 공식 PDF가 생성되어 플랫폼 서류보관함에 보관됩니다.
              </p>
            </div>

            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-slate-400" />
              TFN 및 개인정보는 AES-256 군사등급 암호화로 보호됩니다.
            </p>
          </section>
        )}

        {/* 에러 메시지 알림 */}
        {error && (
          <p className="flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-all">{error}</span>
          </p>
        )}

        {/* 하단 이동 및 최종 제출 버튼 바 */}
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
              <ArrowLeft className="mr-1.5 h-4 w-4" /> 이전
            </Button>
          )}

          {step < totalSteps - 1 ? (
            <Button
              type="button"
              className="flex-1 h-11 text-sm font-semibold"
              onClick={next}
            >
              다음 단계 <ArrowRight className="ml-1.5 h-4 w-4" />
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
                  공식 PDF 생성 및 저장 중...
                </>
              ) : (
                <>
                  <FileCheck className="mr-2 h-4 w-4" />
                  서약 완료 및 온보딩 서류 제출
                </>
              )}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
