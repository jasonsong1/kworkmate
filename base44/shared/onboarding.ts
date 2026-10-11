// The onboarding paperwork, resolved on the server: which documents the employer asks a new hire
// for, which personal details they ask for, and whether one employee's record is complete. The
// employee's own screen and the employer's status list both read the answer from here, so a screen
// can never show a status the server would not agree with.

export const ONBOARDING_FIELD_KEYS = ['address', 'date_of_birth', 'emergency_contact', 'tax', 'super', 'bank'];

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

export function fieldVisibilityOf(company: any) {
  const raw = (company && company.onboarding_field_visibility) || {};
  const out: any = {};
  ONBOARDING_FIELD_KEYS.forEach((key) => {
    out[key] = raw[key] !== false;
  });
  return out;
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

function infoOff(type: any, visible: any) {
  if (type.key === 'personal') return !visible.address && !visible.date_of_birth && !visible.emergency_contact;
  if (type.key === 'bank') return !visible.bank;
  return false;
}

function fileFor(docs: any[], key: string) {
  return (
    docs.find((doc: any) => doc && doc.doc_type === key) ||
    (key === 'contract' ? docs.find((doc: any) => doc && doc.type === 'contract') : null) ||
    null
  );
}

export function checklistFor(profile: any, company: any) {
  const visible = fieldVisibilityOf(company);
  const docs = Array.isArray(profile && profile.docs) ? profile.docs : [];
  const items = docTypesOf(company).map((type: any) => {
    const info = type.kind === 'info';
    const file = info ? null : fileFor(docs, type.key);
    const done = info ? infoOff(type, visible) || infoFilled(profile, type.key) : Boolean(file);
    return { key: type.key, kind: info ? 'info' : 'file', required: type.required !== false, done, file };
  });
  const required = items.filter((item: any) => item.required);
  return {
    items,
    complete: required.every((item: any) => item.done)
  };
}

// Only the details the employer is asking for are ever written, so switching an item off also
// stops it being collected.
export function visibleFields(data: any, company: any) {
  const visible = fieldVisibilityOf(company);
  const source = data || {};
  const out: any = {};
  const put = (field: string) => {
    if (field in source) out[field] = source[field];
  };
  if (visible.address) put('address');
  if (visible.date_of_birth) put('date_of_birth');
  if (visible.emergency_contact) {
    put('emergency_contact_name');
    put('emergency_contact_phone');
  }
  if (visible.tax) {
    put('tfn_number');
    put('tfn_pending');
    put('residency_status');
  }
  if (visible.super) {
    put('super_choice');
    put('super_fund_name');
    put('super_usi');
    put('super_member_number');
  }
  if (visible.bank) {
    put('bank_bsb');
    put('bank_account_number');
    put('bank_account_name');
  }
  return out;
}

// What a record's onboarding status becomes once its paperwork is worked out again.
export function onboardingStatusFor(profile: any, company: any, docs: any[]) {
  const withDocs = { ...(profile || {}), docs: docs || [] };
  const checklist = checklistFor(withDocs, company);
  if (checklist.complete) return 'completed';
  const started =
    (docs || []).length > 0 ||
    ONBOARDING_FIELD_KEYS.some((key) => {
      if (key === 'address') return filled(profile, 'address');
      if (key === 'date_of_birth') return filled(profile, 'date_of_birth');
      if (key === 'emergency_contact') return filled(profile, 'emergency_contact_name');
      if (key === 'tax') return filled(profile, 'tfn_number');
      if (key === 'super') return filled(profile, 'super_choice') || filled(profile, 'super_fund_name');
      if (key === 'bank') return filled(profile, 'bank_bsb');
      return false;
    });
  return started ? 'in_progress' : 'pending';
}