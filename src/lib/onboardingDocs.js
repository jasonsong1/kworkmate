// The onboarding paperwork: which documents a new hire hands in, which personal details the
// employer asks for, and how far along one person is. The employer's own list is stored on the
// company record; this module holds the standard set it starts from and the rules that read both
// the list and one employee's record back into a status.

// The personal details an employer may ask for, each one switchable on the company settings.
export const ONBOARDING_FIELD_KEYS = [
  'address',
  'date_of_birth',
  'emergency_contact',
  'tax',
  'super',
  'bank'
];

export const DEFAULT_DOC_TYPES = [
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

// The employer's list, or the standard one when they have not saved a list yet.
export function docTypesOf(company) {
  const stored = (company && company.onboarding_doc_types) || [];
  const list = stored.length > 0 ? stored : DEFAULT_DOC_TYPES;
  return list.filter((type) => type && type.key && (type.label || type.label_en));
}

// Every item is asked for unless the employer switched it off.
export function fieldVisibilityOf(company) {
  const raw = (company && company.onboarding_field_visibility) || {};
  const out = {};
  ONBOARDING_FIELD_KEYS.forEach((key) => {
    out[key] = raw[key] !== false;
  });
  return out;
}

export function docTypeLabel(type, lang) {
  if (!type) return '';
  if (lang === 'en') return type.label_en || type.label || type.key;
  return type.label || type.label_en || type.key;
}

function filled(profile, field) {
  return Boolean(String((profile && profile[field]) || '').trim());
}

// The two items that are details rather than files: "personal" is settled once the address, the
// date of birth and an emergency contact are on the record, "bank" once the account is.
export function infoFilled(profile, key) {
  if (key === 'personal') {
    return filled(profile, 'address') && filled(profile, 'date_of_birth') && filled(profile, 'emergency_contact_name');
  }
  if (key === 'bank') return filled(profile, 'bank_bsb') && filled(profile, 'bank_account_number');
  return false;
}

// An item the employer is not asking about at all counts as settled: nobody can be left short of
// completion by a question that is never put to them.
function infoOff(type, visible) {
  if (type.key === 'personal') return !visible.address && !visible.date_of_birth && !visible.emergency_contact;
  if (type.key === 'bank') return !visible.bank;
  return false;
}

// A document filed under its type settles that type. An older record filed a contract as
// "contract" before types existed, so that shape still counts.
function fileFor(docs, key) {
  return (
    docs.find((doc) => doc && doc.doc_type === key) ||
    (key === 'contract' ? docs.find((doc) => doc && doc.type === 'contract') : null) ||
    null
  );
}

export function checklistFor(profile, company, lang) {
  const visible = fieldVisibilityOf(company);
  const docs = Array.isArray(profile && profile.docs) ? profile.docs : [];
  const items = docTypesOf(company).map((type) => {
    const info = type.kind === 'info';
    const file = info ? null : fileFor(docs, type.key);
    const done = info ? infoOff(type, visible) || infoFilled(profile, type.key) : Boolean(file);
    return {
      key: type.key,
      kind: info ? 'info' : 'file',
      label: docTypeLabel(type, lang),
      required: type.required !== false,
      done,
      file
    };
  });
  const required = items.filter((item) => item.required);
  return {
    items,
    total: items.length,
    done: items.filter((item) => item.done).length,
    requiredTotal: required.length,
    requiredDone: required.filter((item) => item.done).length,
    complete: required.every((item) => item.done)
  };
}