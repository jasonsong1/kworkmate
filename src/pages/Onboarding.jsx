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
  PenTool,
  ShieldCheck,
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
import { base44 } from '@/api/base44Client';

const STEPS = [
  { id: 'personal', title: '1. 인적사항', subtitle: 'Personal Details & Name' },
  { id: 'address', title: '2. 거주 주소', subtitle: 'Home Address in Australia' },
  { id: 'tax', title: '3. 세무 신고', subtitle: 'ATO TFN Declaration (NAT 3092)' },
  { id: 'super_bank', title: '4. 연금 및 계좌', subtitle: 'Superannuation & Bank' },
  { id: 'sign', title: '5. 서명 및 제출', subtitle: 'Declaration & Signature' }
];

export default function Onboarding() {
  const { token } = useParams();
  const padRef = useRef(null);
  const [state, setState] = useState('loading');
  const [data, setData] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [signature, setSignature] = useState('');
  const [declaration, setDeclaration] = useState(false);

  // 1. 인적사항 상태 (Section A Q2, Q4, Q5, Q6)
  const [personal, setPersonal] = useState({
    title: 'Mr',
    familyName: '',
    givenNames: '',
    otherNames: '',
    hasChangedName: false,
    previousFamilyName: '',
    dob: '',
    email: '',
    phone: ''
  });

  // 2. 호주 거주 주소 상태 (Section A Q3)
  const [address, setAddress] = useState({
    line1: '',
    line2: '',
    suburb: '',
    state: 'NSW',
    postcode: ''
  });

  // 3. ATO 세무 신고 상태 (Section A Q1, Q7, Q8, Q9, Q10)
  const [tax, setTax] = useState({
    tfnMode: 'number', // 'number' | 'applied' | 'under18' | 'pensioner'
    tfnNumber: '',
    employmentBasis: 'casual', // 'full_time' | 'part_time' | 'labour_hire' | 'super_stream' | 'casual'
    residency: 'resident', // 'resident' | 'foreign' | 'working_holiday'
    taxFreeThreshold: 'yes', // 'yes' | 'no'
    studentDebt: 'no' // 'yes' | 'no'
  });

  // 4. 연금 및 급여 계좌 상태
  const [superBank, setSuperBank] = useState({
    useDefaultSuper: 'yes',
    superFundName: '',
    superUsi: '',
    superAbn: '',
    superMemberNumber: '',
    bsb: '',
    accountNumber: '',
    accountName: ''
  });

  useEffect(() => {
    const load = async () => {
      const response = await base44.functions.invoke('getOnboardingData', { token });
      const payload = response.data || {};
      if (!payload.ok) {
        setState(payload.completed ? 'completed' : 'invalid');
        return;
      }
      setData(payload);

      // 직원 기본 정보가 있으면 폼에 프리필
      const emp = payload.employee || {};
      const nameParts = String(emp.full_name || '').trim().split(/\s+/);
      const surname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || '';
      const given = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : nameParts[0] || '';

      setPersonal((prev) => ({
        ...prev,
        familyName: surname,
        givenNames: given,
        email: emp.user_email || '',
        phone: emp.phone || '',
        dob: emp.date_of_birth || ''
      }));

      if (emp.address) {
        setAddress((prev) => ({
          ...prev,
          line1: emp.address
        }));
      }

      if (emp.employment_type) {
        setTax((prev) => ({
          ...prev,
          employmentBasis: emp.employment_type.includes('part') ? 'part_time' : emp.employment_type.includes('full') ? 'full_time' : 'casual'
        }));
      }

      setState('form');
    };
    load();
  }, [token]);

  // 스텝 유효성 검사
  const validateStep = (idx) => {
    setError('');
    if (idx === 0) {
      if (!personal.familyName.trim()) return '성을 입력해 주세요 (Family name).';
      if (!personal.givenNames.trim()) return '이름을 입력해 주세요 (First given name).';
      if (!personal.dob) return '생년월일을 입력해 주세요 (Date of birth).';
      if (!personal.email.trim() || !personal.email.includes('@')) return '유효한 이메일 주소를 입력해 주세요.';
      if (personal.hasChangedName && !personal.previousFamilyName.trim()) {
        return '이전 성(Previous family name)을 입력해 주세요.';
      }
    } else if (idx === 1) {
      if (!address.line1.trim()) return '도로명 주소를 입력해 주세요 (Street address).';
      if (!address.suburb.trim()) return '교외/도시명(Suburb)을 입력해 주세요.';
      if (!address.postcode.trim() || address.postcode.length !== 4) return '우편번호(Postcode) 4자리를 정확히 입력해 주세요.';
    } else if (idx === 2) {
      if (tax.tfnMode === 'number') {
        const clean = tax.tfnNumber.replace(/\D/g, '');
        if (clean.length !== 9) return '호주 TFN 번호 9자리를 정확히 입력해 주세요. (발급 전인 경우 아래 예외 사유를 선택하세요)';
      }
    } else if (idx === 3) {
      if (superBank.useDefaultSuper === 'no') {
        if (!superBank.superFundName.trim()) return '연금 펀드 이름(Fund name)을 입력해 주세요.';
        if (!superBank.superUsi.trim()) return '연금 USI 번호를 입력해 주세요.';
        if (!superBank.superMemberNumber.trim()) return '연금 회원 번호(Member number)를 입력해 주세요.';
      }
      if (superBank.bsb && superBank.bsb.replace(/\D/g, '').length !== 6) {
        return '은행 BSB 번호는 6자리여야 합니다.';
      }
    } else if (idx === 4) {
      if (!signature) return '서명란에 직접 자필 전자서명을 완료해 주세요.';
      if (!declaration) return 'ATO 공식 선언문에 동의 체크해 주세요.';
    }
    return '';
  };

  const handleNext = () => {
    const err = validateStep(currentStep);
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
  };

  const handlePrev = () => {
    setError('');
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const toFile = async (blob, name) => new File([blob], name, { type: 'application/pdf' });

  // 최종 제출 처리
  const handleSubmit = async () => {
    const err = validateStep(4);
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

      // 2. TFN 및 세무 폼 데이터 조합
      const tfnClean = tax.tfnMode === 'number' ? tax.tfnNumber.replace(/\D/g, '') : '';
      const formData = {
        title: personal.title,
        family_name: personal.familyName.trim(),
        given_names: personal.givenNames.trim(),
        other_names: personal.otherNames.trim(),
        previous_family_name: personal.hasChangedName ? personal.previousFamilyName.trim() : '',
        date_of_birth: personal.dob,
        user_email: personal.email.trim(),
        phone: personal.phone.trim(),
        address_line1: address.line1.trim(),
        address_line2: address.line2.trim(),
        suburb: address.suburb.trim(),
        state: address.state,
        postcode: address.postcode.trim(),
        address: [address.line1, address.line2, address.suburb, address.state, address.postcode].filter(Boolean).join(', '),
        tfn_number: tfnClean,
        tfn_pending: tax.tfnMode !== 'number',
        tfn_exemption: tax.tfnMode,
        employment_type: tax.employmentBasis,
        residency_status: tax.residency,
        tax_free_threshold: tax.taxFreeThreshold === 'yes',
        hecs_help: tax.studentDebt === 'yes',
        super_choice: superBank.useDefaultSuper === 'yes' ? 'default_fund' : 'custom_fund',
        super_fund_name: superBank.useDefaultSuper === 'yes' ? (data.company?.default_super_fund_name || '') : superBank.superFundName.trim(),
        super_usi: superBank.useDefaultSuper === 'yes' ? (data.company?.default_super_fund_usi || '') : superBank.superUsi.trim(),
        super_fund_abn: superBank.useDefaultSuper === 'yes' ? (data.company?.default_super_fund_abn || '') : superBank.superAbn.trim(),
        super_member_number: superBank.useDefaultSuper === 'yes' ? '' : superBank.superMemberNumber.trim(),
        bank_bsb: superBank.bsb.replace(/\D/g, ''),
        bank_account_number: superBank.accountNumber.trim(),
        bank_account_name: superBank.accountName.trim(),
        signed_at: now
      };

      const pdfContext = {
        employee: { ...data.employee, ...formData },
        branch: data.branch,
        company: data.company,
        form: formData,
        signatureDataUrl: signature
      };

      // 3. ATO 공식 NAT 3092 (100% 원본 벡터 오버레이), NAT 13080, 고용계약서 자동 생성
      const [tfnPdfBlob, superPdfBlob, contractPdfBlob] = await Promise.all([
        buildTfnPdf(pdfContext),
        buildSuperPdf(pdfContext),
        buildContractPdf(pdfContext)
      ]);

      // 4. 비공개 Private 스토리지에 병렬 업로드
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
        }
      ];

      // 5. 서버 Edge Function 호출 (TFN 암호화 및 tfn_declarations 테이블 영구 저장)
      const response = await base44.functions.invoke('submitOnboarding', {
        token,
        signature_file_uri: signatureUpload.file_uri,
        tfn: {
          number: formData.tfn_number,
          pending: formData.tfn_pending,
          exemption: formData.tfn_exemption,
          residency_status: formData.residency_status,
          tax_free_threshold: formData.tax_free_threshold,
          hecs_help: formData.hecs_help
        },
        personal: {
          title: formData.title,
          family_name: formData.family_name,
          given_names: formData.given_names,
          other_names: formData.other_names,
          previous_family_name: formData.previous_family_name,
          dob: formData.date_of_birth,
          address: formData.address,
          address_line1: formData.address_line1,
          address_line2: formData.address_line2,
          suburb: formData.suburb,
          state: formData.state,
          postcode: formData.postcode,
          phone: formData.phone
        },
        super: {
          choice: formData.super_choice,
          fund_name: formData.super_fund_name,
          usi: formData.super_usi,
          fund_abn: formData.super_fund_abn,
          member_number: formData.super_member_number
        },
        bank: {
          bsb: formData.bank_bsb,
          account_number: formData.bank_account_number,
          account_name: formData.bank_account_name
        },
        docs,
        declaration_accepted: true,
        tfn_file_uri: tfnUpload.file_uri,
        tfn_file_size: tfnPdfBlob.size
      });

      if (response.data?.error) {
        setError(response.data.error);
        setSaving(false);
        return;
      }

      setState('done');
    } catch (err) {
      setError(err.message || '온보딩 서류 제출 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (state === 'invalid' || state === 'completed' || state === 'done') {
    const isDone = state === 'done' || state === 'completed';
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-8 text-center shadow-xl">
          {isDone ? (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">온보딩 서류 제출 완료</h2>
              <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                호주 국세청(ATO) 공식 NAT 3092 TFN 신고서 및 연금 서류가 안전하게 암호화되어 제출되었습니다.
              </p>
              <div className="rounded-lg bg-slate-800/60 border border-slate-700/60 p-4 text-xs text-slate-300 space-y-1 text-left mb-6">
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold mb-1">
                  <ShieldCheck className="h-4 w-4" /> 공식 서류 발급 완료
                </div>
                <div>• ATO Tax File Number Declaration (NAT 3092)</div>
                <div>• ATO Superannuation Standard Choice (NAT 13080)</div>
                <div>• Standard Employment Contract</div>
              </div>
              <p className="text-xs text-slate-500">본 창을 닫으셔도 좋습니다.</p>
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">유효하지 않은 링크</h2>
              <p className="text-sm text-slate-400">
                링크가 만료되었거나 이미 사용된 링크입니다. 고용주에게 새로운 온보딩 링크를 요청해 주세요.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const branchName = data.branch?.name || data.company?.name || 'K-Workmate';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      {/* 상단 헤더 */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-white tracking-tight">{branchName}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                직원 온보딩
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">호주 국세청(ATO) 공식 TFN Declaration & 서약서</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 font-medium">
              단계 {currentStep + 1} / {STEPS.length}
            </span>
            <div className="w-24 mt-1">
              <Progress value={((currentStep + 1) / STEPS.length) * 100} className="h-1.5 bg-slate-800" />
            </div>
          </div>
        </div>
      </header>

      {/* 메인 폼 컨텐츠 */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 my-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-7 shadow-2xl">
          {/* 스텝 제목 */}
          <div className="mb-6 border-b border-slate-800 pb-4">
            <h1 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
              {STEPS[currentStep].title}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              {STEPS[currentStep].subtitle}
            </p>
          </div>

          {/* Step 1: 인적사항 (Personal Details & Name) */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-slate-300">호칭 (Title) *</Label>
                <div className="grid grid-cols-4 gap-2 mt-1.5">
                  {['Mr', 'Mrs', 'Miss', 'Ms'].map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant={personal.title === t ? 'default' : 'outline'}
                      className={personal.title === t ? 'bg-blue-600 text-white font-semibold' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}
                      onClick={() => setPersonal((p) => ({ ...p, title: t }))}>
                      {t}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-slate-300">영문 성 (Family name / Surname) *</Label>
                  <Input
                    className="mt-1.5 bg-slate-950 border-slate-700 text-white font-medium"
                    placeholder="예: HONG"
                    value={personal.familyName}
                    onChange={(e) => setPersonal((p) => ({ ...p, familyName: e.target.value.toUpperCase() }))}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">여권이나 비자에 등록된 영문 성</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-300">영문 이름 (First given name) *</Label>
                  <Input
                    className="mt-1.5 bg-slate-950 border-slate-700 text-white font-medium"
                    placeholder="예: GILDONG"
                    value={personal.givenNames}
                    onChange={(e) => setPersonal((p) => ({ ...p, givenNames: e.target.value.toUpperCase() }))}
                  />
                  <p className="text-[11px] text-slate-500 mt-1">영문 이름 (First Name)</p>
                </div>
              </div>

              <div>
                <Label className="text-xs text-slate-300">중간 이름 (Other given names) - 선택</Label>
                <Input
                  className="mt-1.5 bg-slate-950 border-slate-700 text-white"
                  placeholder="중간 이름이 있는 경우만 입력"
                  value={personal.otherNames}
                  onChange={(e) => setPersonal((p) => ({ ...p, otherNames: e.target.value.toUpperCase() }))}
                />
              </div>

              {/* 이전 성 변경 이력 (Section A Q4) */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hasChangedName"
                    checked={personal.hasChangedName}
                    onCheckedChange={(v) => setPersonal((p) => ({ ...p, hasChangedName: Boolean(v) }))}
                  />
                  <Label htmlFor="hasChangedName" className="text-xs text-slate-300 cursor-pointer">
                    호주 국세청(ATO)에 과거 다른 성으로 등록된 이력이 있습니까? (Question 4)
                  </Label>
                </div>
                {personal.hasChangedName && (
                  <div className="pt-2">
                    <Label className="text-xs text-slate-300">이전 성 (Previous family name) *</Label>
                    <Input
                      className="mt-1.5 bg-slate-900 border-slate-700 text-white"
                      placeholder="과거에 사용하던 영문 성 입력"
                      value={personal.previousFamilyName}
                      onChange={(e) => setPersonal((p) => ({ ...p, previousFamilyName: e.target.value.toUpperCase() }))}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-slate-300">생년월일 (Date of birth) *</Label>
                  <Input
                    type="date"
                    className="mt-1.5 bg-slate-950 border-slate-700 text-white"
                    value={personal.dob}
                    onChange={(e) => setPersonal((p) => ({ ...p, dob: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-300">전화번호 (Mobile phone) *</Label>
                  <Input
                    className="mt-1.5 bg-slate-950 border-slate-700 text-white"
                    placeholder="0412 345 678"
                    value={personal.phone}
                    onChange={(e) => setPersonal((p) => ({ ...p, phone: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs text-slate-300">기본 이메일 주소 (Primary e-mail address) *</Label>
                <Input
                  type="email"
                  className="mt-1.5 bg-slate-950 border-slate-700 text-white"
                  placeholder="your.email@example.com"
                  value={personal.email}
                  onChange={(e) => setPersonal((p) => ({ ...p, email: e.target.value }))}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  호주 국세청 서식 및 급여명세서(Payslip)가 발송되는 공식 이메일입니다.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: 호주 거주 주소 (Home Address in Australia) */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-slate-300">호주 내 도로명 주소 (Street Address Line 1) *</Label>
                <Input
                  className="mt-1.5 bg-slate-950 border-slate-700 text-white"
                  placeholder="예: 123 GEORGE STREET"
                  value={address.line1}
                  onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value.toUpperCase() }))}
                />
              </div>

              <div>
                <Label className="text-xs text-slate-300">상세 주소 (Unit / Apartment / Line 2) - 선택</Label>
                <Input
                  className="mt-1.5 bg-slate-950 border-slate-700 text-white"
                  placeholder="예: UNIT 45"
                  value={address.line2}
                  onChange={(e) => setAddress((a) => ({ ...a, line2: e.target.value.toUpperCase() }))}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <Label className="text-xs text-slate-300">교외/지역 (Suburb / Town) *</Label>
                  <Input
                    className="mt-1.5 bg-slate-950 border-slate-700 text-white"
                    placeholder="예: SYDNEY"
                    value={address.suburb}
                    onChange={(e) => setAddress((a) => ({ ...a, suburb: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-300">주 (State / Territory) *</Label>
                  <Select value={address.state} onValueChange={(v) => setAddress((a) => ({ ...a, state: v }))}>
                    <SelectTrigger className="mt-1.5 bg-slate-950 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                      {['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].map((st) => (
                        <SelectItem key={st} value={st}>{st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-slate-300">우편번호 (Postcode) *</Label>
                  <Input
                    maxLength={4}
                    className="mt-1.5 bg-slate-950 border-slate-700 text-white font-mono"
                    placeholder="2000"
                    value={address.postcode}
                    onChange={(e) => setAddress((a) => ({ ...a, postcode: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: 세무 신고 (ATO NAT 3092 Tax Declaration) */}
          {currentStep === 2 && (
            <div className="space-y-6">
              {/* Question 1: TFN 입력 및 예외 사유 */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold mt-0.5">
                    1
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-white">납세자번호 (Tax File Number) 입력 *</Label>
                    <p className="text-xs text-slate-400 mt-0.5">
                      9자리 TFN 번호를 입력하거나 해당되는 예외 사유를 선택하세요.
                    </p>
                  </div>
                </div>

                <RadioGroup value={tax.tfnMode} onValueChange={(v) => setTax((t) => ({ ...t, tfnMode: v }))} className="space-y-2 mt-2">
                  <div className="flex items-center space-x-2 rounded-lg border border-slate-800 p-3 bg-slate-900/60">
                    <RadioGroupItem value="number" id="tfn_num" />
                    <Label htmlFor="tfn_num" className="text-xs sm:text-sm text-slate-200 cursor-pointer flex-1">
                      본인의 9자리 TFN 번호를 직접 입력합니다.
                    </Label>
                  </div>

                  {tax.tfnMode === 'number' && (
                    <div className="pl-6 pt-1">
                      <Input
                        maxLength={9}
                        className="bg-slate-950 border-blue-500/60 text-white font-mono text-base tracking-widest max-w-xs"
                        placeholder="123456789"
                        value={tax.tfnNumber}
                        onChange={(e) => setTax((t) => ({ ...t, tfnNumber: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        🔒 TFN 번호는 정부 보안 규정에 따라 AES-256 군사등급 암호화되어 안전하게 처리됩니다.
                      </p>
                    </div>
                  )}

                  <div className="flex items-center space-x-2 rounded-lg border border-slate-800 p-3 bg-slate-900/60">
                    <RadioGroupItem value="applied" id="tfn_app" />
                    <Label htmlFor="tfn_app" className="text-xs sm:text-sm text-slate-200 cursor-pointer flex-1">
                      ATO에 TFN 발급을 이미 신청/문의 중입니다 (28일 이내 제출 유예)
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2 rounded-lg border border-slate-800 p-3 bg-slate-900/60">
                    <RadioGroupItem value="under18" id="tfn_u18" />
                    <Label htmlFor="tfn_u18" className="text-xs sm:text-sm text-slate-200 cursor-pointer flex-1">
                      만 18세 미만이며 세금 부과 기준액 이하로 소득을 받습니다.
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2 rounded-lg border border-slate-800 p-3 bg-slate-900/60">
                    <RadioGroupItem value="pensioner" id="tfn_pen" />
                    <Label htmlFor="tfn_pen" className="text-xs sm:text-sm text-slate-200 cursor-pointer flex-1">
                      정부 연금, 수당 또는 지원금 수급자로서 면제를 신청합니다.
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Question 7: 고용 형태 (Payment Basis) */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold mt-0.5">
                    7
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-white">고용 형태 (On what basis are you paid?) *</Label>
                    <p className="text-xs text-slate-400 mt-0.5">해당하는 고용 유형 1가지를 선택하세요.</p>
                  </div>
                </div>

                <RadioGroup value={tax.employmentBasis} onValueChange={(v) => setTax((t) => ({ ...t, employmentBasis: v }))} className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {[
                    { val: 'casual', label: 'Casual employment (캐주얼)' },
                    { val: 'part_time', label: 'Part-time employment (파트타임)' },
                    { val: 'full_time', label: 'Full-time employment (풀타임)' },
                    { val: 'labour_hire', label: 'Labour hire (인력 파견)' },
                    { val: 'super_stream', label: 'Superannuation / Annuity stream' }
                  ].map((item) => (
                    <div key={item.val} className="flex items-center space-x-2 rounded-lg border border-slate-800 p-2.5 bg-slate-900/60">
                      <RadioGroupItem value={item.val} id={item.val} />
                      <Label htmlFor={item.val} className="text-xs text-slate-200 cursor-pointer flex-1">
                        {item.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Question 8: 세법상 거주자 구분 (Residency Status) */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold mt-0.5">
                    8
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-white">세법상 거주자 구분 (Residency Status) *</Label>
                    <p className="text-xs text-slate-400 mt-0.5">본인의 호주 세법상 신분을 1가지 선택하세요.</p>
                  </div>
                </div>

                <RadioGroup value={tax.residency} onValueChange={(v) => setTax((t) => ({ ...t, residency: v }))} className="space-y-2 mt-2">
                  <div className="flex items-center space-x-2 rounded-lg border border-slate-800 p-3 bg-slate-900/60">
                    <RadioGroupItem value="resident" id="res_aus" />
                    <Label htmlFor="res_aus" className="text-xs sm:text-sm text-slate-200 cursor-pointer flex-1">
                      <span className="font-semibold text-white">An Australian resident for tax purposes</span>
                      <p className="text-xs text-slate-400 mt-0.5">호주 영주권자/시민권자 또는 6개월 이상 학업을 지속하는 유학생 등</p>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2 rounded-lg border border-slate-800 p-3 bg-slate-900/60">
                    <RadioGroupItem value="working_holiday" id="res_whm" />
                    <Label htmlFor="res_whm" className="text-xs sm:text-sm text-slate-200 cursor-pointer flex-1">
                      <span className="font-semibold text-white">A working holiday maker</span>
                      <p className="text-xs text-slate-400 mt-0.5">워킹홀리데이 비자(Subclass 417 또는 462) 소지자</p>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2 rounded-lg border border-slate-800 p-3 bg-slate-900/60">
                    <RadioGroupItem value="foreign" id="res_for" />
                    <Label htmlFor="res_for" className="text-xs sm:text-sm text-slate-200 cursor-pointer flex-1">
                      <span className="font-semibold text-white">A foreign resident for tax purposes</span>
                      <p className="text-xs text-slate-400 mt-0.5">상기 항목에 해당하지 않는 비거주 외국인</p>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Question 9: Tax-free threshold 신청 여부 */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold mt-0.5">
                    9
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-white">면세 한도($18,200) 신청 (Tax-free threshold) *</Label>
                    <p className="text-xs text-slate-400 mt-0.5">
                      이 고용주로부터 비과세 기준액을 적용받으시겠습니까?
                    </p>
                  </div>
                </div>

                <div className="rounded bg-blue-950/30 border border-blue-900/40 p-3 text-xs text-blue-300 leading-relaxed">
                  💡 <b>안내</b>: 호주 세법상 면세 혜택($18,200)은 동시에 1곳의 주 고용주에게만 신청할 수 있습니다. 이미 다른 곳에서 혜택을 받고 계시거나 워킹홀리데이 비자 소지자인 경우 보통 <b>No</b>를 선택합니다.
                </div>

                <RadioGroup value={tax.taxFreeThreshold} onValueChange={(v) => setTax((t) => ({ ...t, taxFreeThreshold: v }))} className="grid grid-cols-2 gap-3 mt-2">
                  <div className="flex items-center space-x-2 rounded-lg border border-slate-800 p-3 bg-slate-900/60">
                    <RadioGroupItem value="yes" id="tft_yes" />
                    <Label htmlFor="tft_yes" className="text-sm font-semibold text-white cursor-pointer flex-1">
                      Yes (신청함)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 rounded-lg border border-slate-800 p-3 bg-slate-900/60">
                    <RadioGroupItem value="no" id="tft_no" />
                    <Label htmlFor="tft_no" className="text-sm font-semibold text-white cursor-pointer flex-1">
                      No (신청 안 함)
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Question 10: 학자금 대출(HELP / VSL 등) 여부 */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold mt-0.5">
                    10
                  </div>
                  <div>
                    <Label className="text-sm font-semibold text-white">호주 정부 학자금 대출(HELP/VSL/TSL 등) 부채가 있습니까? *</Label>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Higher Education Loan Program(HELP), VET Student Loan(VSL) 등 학자금 대출 잔액 여부
                    </p>
                  </div>
                </div>

                <RadioGroup value={tax.studentDebt} onValueChange={(v) => setTax((t) => ({ ...t, studentDebt: v }))} className="grid grid-cols-2 gap-3 mt-2">
                  <div className="flex items-center space-x-2 rounded-lg border border-slate-800 p-3 bg-slate-900/60">
                    <RadioGroupItem value="yes" id="debt_yes" />
                    <Label htmlFor="debt_yes" className="text-sm font-semibold text-white cursor-pointer flex-1">
                      Yes (대출 있음)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 rounded-lg border border-slate-800 p-3 bg-slate-900/60">
                    <RadioGroupItem value="no" id="debt_no" />
                    <Label htmlFor="debt_no" className="text-sm font-semibold text-white cursor-pointer flex-1">
                      No (대출 없음)
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          )}

          {/* Step 4: 연금 및 급여 계좌 (Super & Bank) */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {/* 연금 선택 */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <Label className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-blue-400" />
                  연금 펀드 선택 (Superannuation Choice) *
                </Label>
                <p className="text-xs text-slate-400">
                  회사 기본 지정 펀드를 사용하거나 본인의 개인 연금 펀드를 지정할 수 있습니다.
                </p>

                <RadioGroup value={superBank.useDefaultSuper} onValueChange={(v) => setSuperBank((s) => ({ ...s, useDefaultSuper: v }))} className="space-y-2 mt-2">
                  <div className="flex items-center space-x-2 rounded-lg border border-slate-800 p-3 bg-slate-900/60">
                    <RadioGroupItem value="yes" id="sup_def" />
                    <Label htmlFor="sup_def" className="text-xs sm:text-sm text-slate-200 cursor-pointer flex-1">
                      <span className="font-semibold text-white">회사의 기본 지정 연금 펀드 사용</span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {data.company?.default_super_fund_name ? `(${data.company.default_super_fund_name})` : '(고용주 지정 기본 펀드로 개설 및 입금)'}
                      </p>
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2 rounded-lg border border-slate-800 p-3 bg-slate-900/60">
                    <RadioGroupItem value="no" id="sup_cust" />
                    <Label htmlFor="sup_cust" className="text-xs sm:text-sm text-slate-200 cursor-pointer flex-1">
                      <span className="font-semibold text-white">본인이 보유한 기존 연금 펀드 계좌로 입금</span>
                    </Label>
                  </div>
                </RadioGroup>

                {superBank.useDefaultSuper === 'no' && (
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <div>
                      <Label className="text-xs text-slate-300">연금 펀드 이름 (Fund Name) *</Label>
                      <Input
                        className="mt-1 bg-slate-950 border-slate-700 text-white"
                        placeholder="예: AustralianSuper"
                        value={superBank.superFundName}
                        onChange={(e) => setSuperBank((s) => ({ ...s, superFundName: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-slate-300">USI 번호 *</Label>
                        <Input
                          className="mt-1 bg-slate-950 border-slate-700 text-white font-mono"
                          placeholder="Unique Super Identifier"
                          value={superBank.superUsi}
                          onChange={(e) => setSuperBank((s) => ({ ...s, superUsi: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-300">연금 회원 번호 (Member Number) *</Label>
                        <Input
                          className="mt-1 bg-slate-950 border-slate-700 text-white font-mono"
                          placeholder="Member Number"
                          value={superBank.superMemberNumber}
                          onChange={(e) => setSuperBank((s) => ({ ...s, superMemberNumber: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 급여 수령 계좌 */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                <Label className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-emerald-400" />
                  급여 수령 계좌 (Bank Account Details)
                </Label>
                <p className="text-xs text-slate-400">급여가 입금될 호주 은행 계좌 정보를 입력해 주세요.</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-slate-300">BSB (6자리 숫자)</Label>
                    <Input
                      maxLength={6}
                      className="mt-1 bg-slate-950 border-slate-700 text-white font-mono"
                      placeholder="123456"
                      value={superBank.bsb}
                      onChange={(e) => setSuperBank((s) => ({ ...s, bsb: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-300">계좌번호 (Account Number)</Label>
                    <Input
                      className="mt-1 bg-slate-950 border-slate-700 text-white font-mono"
                      placeholder="8자리 내외 숫자"
                      value={superBank.accountNumber}
                      onChange={(e) => setSuperBank((s) => ({ ...s, accountNumber: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-300">예금주명 (Account Name)</Label>
                    <Input
                      className="mt-1 bg-slate-950 border-slate-700 text-white"
                      placeholder="예: GILDONG HONG"
                      value={superBank.accountName}
                      onChange={(e) => setSuperBank((s) => ({ ...s, accountName: e.target.value.toUpperCase() }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: 서명 및 최종 제출 (Review & Signature) */}
          {currentStep === 4 && (
            <div className="space-y-5">
              {/* 공식 선언문 확인 */}
              <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 p-4 space-y-2">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                  <ShieldCheck className="h-5 w-5" />
                  호주 국세청(ATO) 공식 선언문 (DECLARATION by payee)
                </div>
                <p className="text-xs text-slate-300 leading-relaxed italic">
                  "I declare that the information that I have given is true and correct."
                </p>
                <div className="text-[11px] text-amber-400/90 font-medium pt-1">
                  ⚠️ <b>법적 책임 고지</b>: 호주 법률에 따라 고의로 허위 사실을 진술하거나 허위 문서를 제출하는 경우 형사 처벌 및 과태료가 부과될 수 있습니다 (There are penalties for deliberately making a false or misleading statement).
                </div>
              </div>

              {/* 자필 전자서명 패드 */}
              <div>
                <Label className="text-xs text-slate-300 flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1 font-semibold text-white">
                    <PenTool className="h-3.5 w-3.5 text-blue-400" />
                    직원 자필 서명 (Signature) *
                  </span>
                  <span className="text-[11px] text-slate-500">마우스나 터치스크린으로 직접 서명하세요</span>
                </Label>
                <div className="rounded-xl border border-slate-700 bg-white p-1 overflow-hidden shadow-inner">
                  <SignaturePad ref={padRef} onEnd={() => setSignature(padRef.current?.toDataURL() || '')} />
                </div>
                <div className="flex justify-end mt-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-slate-400 hover:text-white"
                    onClick={() => {
                      padRef.current?.clear();
                      setSignature('');
                    }}>
                    서명 지우기
                  </Button>
                </div>
              </div>

              {/* 선언 동의 체크 */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 flex items-start space-x-3">
                <Checkbox
                  id="final_dec"
                  checked={declaration}
                  onCheckedChange={(v) => setDeclaration(Boolean(v))}
                  className="mt-0.5"
                />
                <Label htmlFor="final_dec" className="text-xs sm:text-sm text-slate-200 cursor-pointer leading-relaxed">
                  본인은 본 서식에 기재한 모든 인적 사항 및 세무 정보가 사실임을 확인하며, 상기 자필 서명으로 호주 국세청(ATO) 공식 NAT 3092 선언서에 정식 서명합니다.
                </Label>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-5 rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* 하단 탐색 버튼 */}
          <div className="mt-8 flex items-center justify-between pt-4 border-t border-slate-800">
            {currentStep > 0 ? (
              <Button
                type="button"
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={handlePrev}
                disabled={saving}>
                <ArrowLeft className="mr-1.5 h-4 w-4" /> 이전
              </Button>
            ) : <div />}

            {currentStep < STEPS.length - 1 ? (
              <Button
                type="button"
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-5"
                onClick={handleNext}>
                다음 <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 shadow-lg shadow-emerald-900/30"
                onClick={handleSubmit}
                disabled={saving || !signature || !declaration}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    공식 서류 생성 및 암호화 제출 중...
                  </>
                ) : (
                  <>
                    <FileCheck className="mr-2 h-4 w-4" />
                    온보딩 공식 서류 최종 제출
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </main>

      {/* 하단 푸터 */}
      <footer className="border-t border-slate-900 py-4 text-center text-xs text-slate-500">
        K-Workmate Onboarding System · 호주 국세청(ATO) 공식 서식 준수
      </footer>
    </div>
  );
}
