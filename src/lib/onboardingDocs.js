// The onboarding paperwork: which documents a new hire hands in, which details the employer asks
// for on their own question form, and how far along one person is. The employer's own list is
// stored on the company record; this module holds the standard set it starts from and the rules
// that read both the list and one employee's record back into a status.

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

// What the settings screen writes back: a named row is a document, an unnamed one is dropped.
export function cleanDocTypes(types) {
  return (types || [])
    .filter((type) => String((type && type.label) || '').trim())
    .map((type) => ({
      key: type.key,
      label: String(type.label).trim(),
      label_en: String(type.label_en || '').trim(),
      kind: type.kind === 'info' ? 'info' : 'file',
      required: type.required !== false
    }));
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

// The employer's own questions, in the order they are asked. A question switched out of the vault
// is still put to the employee; it just does not appear in the document vault.
export function questionsOf(company) {
  return ((company && company.onboarding_questions) || []).filter(
    (question) => question && String(question.label || '').trim() && question.visible !== false
  );
}

// The answers given on the onboarding form, read as the employer's own questions with what was
// answered: the answer itself, then the details a follow-up asked for.
export function answerRows(profile, company, t) {
  const stored = Array.isArray(profile && profile.onboarding_answers) ? profile.onboarding_answers : [];
  return questionsOf(company).map((question) => {
    const given = stored.find((entry) => entry && entry.id === question.id) || {};
    const raw = String((given.answer !== undefined ? given.answer : question.answer) || '').trim();
    const answer =
      question.type === 'yes_no' && raw ? t(raw === 'yes' ? 'onboardingQ.yes' : 'onboardingQ.no') : raw;
    const details = Object.entries(given.follow_up || {})
      .map(([field, value]) => [field, String(value || '').trim()])
      .filter(([, value]) => value);
    return { id: question.id, label: String(question.label).trim(), answer, details };
  });
}

// The details kept on the record itself, for a company whose own form asks no questions: the same
// rows the profile screen shows.
export function fieldRows(profile, t) {
  if (!profile) return [];
  return [
    [t('ob.field.address'), profile.address],
    [t('ob.field.date_of_birth'), profile.date_of_birth],
    [t('ob.emergencyName'), profile.emergency_contact_name],
    [t('ob.emergencyPhone'), profile.emergency_contact_phone],
    [t('ob.tfn'), profile.tfn_pending ? t('ob.tfnPending') : profile.tfn_number],
    [t('ob.superFund'), profile.super_fund_name],
    [t('ob.superUsi'), profile.super_usi],
    [t('ob.superMember'), profile.super_member_number],
    [t('ob.bankBsb'), profile.bank_bsb],
    [t('ob.bankAccount'), profile.bank_account_number],
    [t('ob.bankHolder'), profile.bank_account_name]
  ];
}

// A file counts for an item when it was filed under that type, when the item's own name appears in
// the file's name, or — since the onboarding form files an attachment beside the question that
// asked for it — when it is simply one of the employee's own uploads no other item has claimed.
// The employer names what they want before the employee uploads, so nothing depends on a file name.
function fileFor(docs, type, used) {
  const labels = [type.label, type.label_en, type.key]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const free = (doc) => doc && !used.has(doc);
  const typed = docs.find(
    (doc) => free(doc) && (doc.doc_type === type.key || doc.type === type.key)
  );
  if (typed) return typed;
  const byName = docs.find((doc) => {
    if (!free(doc)) return false;
    const name = String(doc.name || '').toLowerCase();
    return labels.some((label) => label && name.includes(label));
  });
  if (byName) return byName;
  // Nothing says which item this upload belongs to, so the next item without a file claims it.
  return docs.find((doc) => free(doc) && (doc.type === 'onboarding' || doc.type === 'staff_upload')) || null;
}

export function checklistFor(profile, company, lang) {
  const docs = Array.isArray(profile && profile.docs) ? profile.docs : [];
  const used = new Set();
  const items = docTypesOf(company).map((type) => {
    const info = type.kind === 'info';
    const file = info ? null : fileFor(docs, type, used);
    if (file) used.add(file);
    return {
      key: type.key,
      kind: info ? 'info' : 'file',
      label: docTypeLabel(type, lang),
      required: type.required !== false,
      done: info ? infoFilled(profile, type.key) : Boolean(file),
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