// The employer's own onboarding form, kept in one place: what a question may be, the shape the
// builder edits, and the shape the company record stores. The settings screen and the question
// builder both read the form from here, so a draft saved from the page is the same thing the
// builder showed.
import { DATE_FORMATS } from '@/lib/onboardingDates';

export const TYPE_KEYS = {
  text: 'onboardingQ.typeText',
  number: 'onboardingQ.typeNumber',
  date: 'onboardingQ.typeDate',
  yes_no: 'onboardingQ.typeYesNo',
  select: 'onboardingQ.typeSelect',
  upload: 'onboardingQ.typeUpload'
};

export const QUESTION_TYPES = Object.keys(TYPE_KEYS);

const splitList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

// The employer's own rule for one answer, kept beside the question: how many digits a number may
// hold, whether a date is a whole day or only a year, and which file types may be attached.
function validationOf(question) {
  if (question.type === 'number') {
    return { digits: Number(question.digits) > 0 ? Number(question.digits) : 0 };
  }
  if (question.type === 'date') {
    return { format: DATE_FORMATS.includes(question.dateFormat) ? question.dateFormat : DATE_FORMATS[0] };
  }
  if (question.type === 'upload') {
    return { file_types: splitList(question.fileTypesText) };
  }
  return null;
}

export function blankQuestion(page) {
  return {
    id: `q_${Math.random().toString(36).slice(2, 9)}`,
    label: '',
    type: 'text',
    required: true,
    visible: true,
    secure: false,
    page: page || 1,
    pageTitle: '',
    when: 'no',
    // The comma-separated lists are held as the manager typed them, so a comma can be typed.
    optionsText: '',
    fieldsText: '',
    digits: '',
    dateFormat: DATE_FORMATS[0],
    fileTypesText: ''
  };
}

// A stored question, opened for editing.
export function toDraft(questions) {
  return (questions || []).map((question, index) => {
    const validation = question.validation || {};
    return {
      id: question.id || `q_${Math.random().toString(36).slice(2, 9)}`,
      label: question.label || '',
      type: QUESTION_TYPES.includes(question.type) ? question.type : 'text',
      required: question.required !== false,
      visible: question.visible !== false,
      secure: Boolean(question.secure),
      page: Number(question.page) > 0 ? Number(question.page) : index + 1,
      pageTitle: question.page_title || '',
      when: question.follow_up && question.follow_up.when === 'yes' ? 'yes' : 'no',
      optionsText: (question.options || []).join(', '),
      fieldsText: ((question.follow_up && question.follow_up.fields) || []).join(', '),
      digits: Number(validation.digits) > 0 ? String(validation.digits) : '',
      dateFormat: DATE_FORMATS.includes(validation.format) ? validation.format : DATE_FORMATS[0],
      fileTypesText: (validation.file_types || []).join(', ')
    };
  });
}

// The draft as the company record keeps it: a question with no wording is dropped.
export function questionsFromDraft(draft) {
  return (draft || [])
    .filter((question) => String((question && question.label) || '').trim())
    .map((question, index) => ({
      id: question.id,
      label: String(question.label).trim(),
      type: QUESTION_TYPES.includes(question.type) ? question.type : 'text',
      required: question.required !== false,
      visible: question.visible !== false,
      secure: Boolean(question.secure),
      page: Number(question.page) > 0 ? Number(question.page) : index + 1,
      page_title: String(question.pageTitle || '').trim(),
      options: question.type === 'select' ? splitList(question.optionsText) : [],
      follow_up:
        question.type === 'yes_no'
          ? { when: question.when === 'yes' ? 'yes' : 'no', fields: splitList(question.fieldsText) }
          : null,
      validation: validationOf(question)
    }));
}