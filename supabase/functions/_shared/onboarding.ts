// The onboarding paperwork, resolved on the server: which documents the employer asks a new hire
// for and whether one employee's record is complete. The employee's own screen and the employer's
// status list both read the answer from here, so a screen can never show a status the server would
// not agree with.

export const DEFAULT_DOC_TYPES: any[] = [
  { key: 'id', label: '신분증 (ID)', label_en: 'Photo ID (passport or licence)', required: true },
  { key: 'right_to_work', label: 'Right to Work 증빙', label_en: 'Right to work evidence', required: true },
  {
    key: 'personal',
    label: '주소·생년월일·비상연락처',
    label_en: 'Address, date of birth & emergency contact',
    required: true,
    kind: 'info'
  },
  { key: 'tfn', label: 'TFN Declaration Form', label_en: 'TFN declaration form', required: true },
  { key: 'super', label: 'Superannuation Choice Form', label_en: 'Super choice form', required: true },
  { key: 'bank', label: '은행 계좌 정보', label_en: 'Bank account details', required: true, kind: 'info' },
  {
    key: 'contract',
    label: '서명된 Employment Contract',
    label_en: 'Signed employment contract',
    required: true
  }
];

export function docTypesOf(company: any) {
  const stored = (company && company.onboarding_doc_types) || [];
  const list = Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_DOC_TYPES;
  return list.filter((type: any) => type && type.key && (type.label || type.label_en));
}

function filled(profile: any, field: string) {
  return Boolean(String((profile && profile[field]) || '').trim());
}

function infoFilled(profile: any, key: string) {
  if (key === 'personal') {
    return filled(profile, 'address') && filled(profile, 'date_of_birth') && filled(profile, 'emergency_contact_name');
  }
  if (key === 'bank') return filled(profile, 'bank_bsb') && filled(profile, 'bank_account_number');
  return false;
}

/**
 * 서류 항목과 업로드된 파일 매칭 (서버 측)
 * 항목의 key와 일치하는 파일만 정확히 매칭합니다.
 */
function fileFor(docs: any[], type: any, used: Set<any>) {
  const labels = [type.label, type.label_en, type.key]
    .map((value: any) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const free = (doc: any) => doc && !used.has(doc);

  // 1순위: doc_type 또는 type 일치
  const typed = docs.find((doc: any) => free(doc) && (doc.doc_type === type.key || doc.type === type.key));
  if (typed) return typed;

  // 2순위: 질문 ID 또는 키 일치
  const byQuestion = docs.find((doc: any) => free(doc) && (doc.question_id === type.key || doc.key === type.key));
  if (byQuestion) return byQuestion;

  // 3순위: 파일명에 명칭 포함 (3글자 이상)
  const byName = docs.find((doc: any) => {
    if (!free(doc)) return false;
    const name = String(doc.name || '').toLowerCase();
    return labels.some((label: string) => label && label.length >= 3 && name.includes(label));
  });
  if (byName) return byName;

  return null;
}

export function checklistFor(profile: any, company: any) {
  const docs = Array.isArray(profile && profile.docs) ? profile.docs : [];
  const used = new Set();
  const items = docTypesOf(company).map((type: any) => {
    const info = type.kind === 'info';
    const file = info ? null : fileFor(docs, type, used);
    if (file) used.add(file);
    return {
      key: type.key,
      kind: info ? 'info' : 'file',
      required: type.required !== false,
      done: info ? infoFilled(profile, type.key) : Boolean(file),
      file
    };
  });
  const required = items.filter((item: any) => item.required);
  return {
    items,
    complete: required.every((item: any) => item.done)
  };
}

export function onboardingFields(data: any) {
  const source = data || {};
  const out: any = {};
  [
    'address',
    'date_of_birth',
    'emergency_contact_name',
    'emergency_contact_phone',
    'tfn_number',
    'tfn_pending',
    'residency_status',
    'super_choice',
    'super_fund_name',
    'super_usi',
    'super_member_number',
    'bank_bsb',
    'bank_account_number',
    'bank_account_name'
  ].forEach((field) => {
    if (source[field] !== undefined) out[field] = source[field];
  });
  return out;
}

export function onboardingStatusFor(profile: any, company: any, docs?: any[]) {
  const effective = { ...profile, ...(docs ? { docs } : {}) };
  const checklist = checklistFor(effective, company);
  if (checklist.complete) return 'completed';
  const hasAnyDoc = (effective.docs || []).some((doc: any) => doc && doc.type !== 'resume');
  const hasAnyInfo =
    filled(effective, 'address') ||
    filled(effective, 'tfn_number') ||
    effective.tfn_pending === true ||
    filled(effective, 'bank_account_number');
  if (hasAnyDoc || hasAnyInfo) return 'in_progress';
  return 'pending';
}