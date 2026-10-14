// ==============================================================================
// KWorkMate 온보딩 서류 및 체크리스트 관리 모듈
// ATO 공식 NAT 3092, NAT 13080 서류 매핑 및 TFN 보안 마스킹 지원
// ==============================================================================

import { formatTfnDisplay } from './tfnCrypto';

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
  { key: 'tfn', label: 'TFN Declaration (ATO NAT 3092)', label_en: 'TFN declaration form (NAT 3092)', required: true },
  { key: 'super', label: 'Superannuation Choice (ATO NAT 13080)', label_en: 'Super choice form (NAT 13080)', required: true },
  { key: 'bank', label: '은행 계좌 정보', label_en: 'Bank account details', required: true, kind: 'info' },
  {
    key: 'contract',
    label: '서명된 Employment Contract',
    label_en: 'Signed employment contract',
    required: true
  }
];

// 회사의 서류 목록 설정 조회 (없으면 기본 목록)
export function docTypesOf(company) {
  const stored = (company && company.onboarding_doc_types) || [];
  const list = Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_DOC_TYPES;
  return list.filter((type) => type && type.key && (type.label || type.label_en));
}

export function cleanDocTypes(types) {
  return (types || [])
    .filter((type) => String((type && type.label) || '').trim())
    .map((type) => ({
      key: type.key,
      label: String(type.label).trim(),
      label_en: String(type.label_en || '').trim(),
      kind: type.kind === 'info' ? 'info' : 'file',
      required: type.required !== false,
      secure: Boolean(type.secure)
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

export function infoFilled(profile, key) {
  if (key === 'personal') {
    return filled(profile, 'address') && filled(profile, 'date_of_birth') && filled(profile, 'emergency_contact_name');
  }
  if (key === 'bank') return filled(profile, 'bank_bsb') && filled(profile, 'bank_account_number');
  return false;
}

export function questionsOf(company) {
  return ((company && company.onboarding_questions) || []).filter(
    (question) => question && String(question.label || '').trim() && question.visible !== false
  );
}

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

// 프로필 화면 상세 항목 표시 (TFN 보안 마스킹 적용)
export function fieldRows(profile, t) {
  if (!profile) return [];
  const rawTfn = profile.tfn_number || '';
  const displayTfn = profile.tfn_pending ? t('ob.tfnPending') : formatTfnDisplay(rawTfn);

  return [
    [t('ob.field.address'), profile.address],
    [t('ob.field.date_of_birth'), profile.date_of_birth],
    [t('ob.emergencyName'), profile.emergency_contact_name],
    [t('ob.emergencyPhone'), profile.emergency_contact_phone],
    [t('ob.tfn'), displayTfn],
    [t('ob.superFund'), profile.super_fund_name],
    [t('ob.superUsi'), profile.super_usi],
    [t('ob.superMember'), profile.super_member_number],
    [t('ob.bankBsb'), profile.bank_bsb],
    [t('ob.bankAccount'), profile.bank_account_number],
    [t('ob.bankHolder'), profile.bank_account_name]
  ];
}

/**
 * 서류 항목과 업로드된 파일 매칭 (ATO 공식 서류 특별 매칭 포함)
 */
function fileFor(docs, type, used) {
  const free = (doc) => doc && !used.has(doc);

  // 1순위: ATO 공식 서류 전용 정밀 매칭
  if (type.key === 'tfn') {
    const atoTfn = docs.find(
      (doc) => free(doc) && (
        doc.doc_type === 'ato_tfn' ||
        doc.type === 'ato_tfn' ||
        (doc.name && doc.name.includes('NAT 3092')) ||
        (doc.name && doc.name.toLowerCase().includes('tfn_declaration'))
      )
    );
    if (atoTfn) return atoTfn;
  }

  if (type.key === 'super') {
    const atoSuper = docs.find(
      (doc) => free(doc) && (
        doc.doc_type === 'ato_super' ||
        doc.type === 'ato_super' ||
        (doc.name && doc.name.includes('NAT 13080')) ||
        (doc.name && doc.name.toLowerCase().includes('super_choice'))
      )
    );
    if (atoSuper) return atoSuper;
  }

  // 2순위: doc_type 또는 type이 항목의 key와 정확히 일치
  const typed = docs.find(
    (doc) => free(doc) && (doc.doc_type === type.key || doc.type === type.key)
  );
  if (typed) return typed;

  // 3순위: 질문 ID 또는 키 일치
  const byQuestion = docs.find(
    (doc) => free(doc) && (doc.question_id === type.key || doc.key === type.key)
  );
  if (byQuestion) return byQuestion;

  // 4순위: 파일명에 서류 라벨(3글자 이상)이 포함된 경우
  const labels = [type.label, type.label_en, type.key]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const byName = docs.find((doc) => {
    if (!free(doc)) return false;
    const name = String(doc.name || '').toLowerCase();
    return labels.some((label) => label && label.length >= 3 && name.includes(label));
  });
  if (byName) return byName;

  return null;
}

export function checklistFor(profile, company, lang) {
  const docs = Array.isArray(profile && profile.docs) ? profile.docs : [];
  const used = new Set();
  const items = docTypesOf(company).map((type) => {
    const file = fileFor(docs, type, used);
    if (file) used.add(file);
    const complete = type.kind === 'info' ? infoFilled(profile, type.key) : Boolean(file);
    return {
      key: type.key,
      label: docTypeLabel(type, lang),
      kind: type.kind || 'file',
      required: type.required !== false,
      secure: Boolean(type.secure),
      complete,
      done: complete, // OnboardingStatusList 및 StaffOnboardingCard 하위 호환
      file: file || null
    };
  });
  const requiredCount = items.filter((item) => item.required).length;
  const completedCount = items.filter((item) => item.required && item.complete).length;
  return {
    items,
    requiredCount,
    completedCount,
    requiredDone: completedCount, // OnboardingStatusList 호환
    requiredTotal: requiredCount, // OnboardingStatusList 호환
    progress: requiredCount > 0 ? Math.round((completedCount / requiredCount) * 100) : 100
  };
}