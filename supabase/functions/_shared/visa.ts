// How many hours each visa allows a person to work in one week. Null means no limit.
// A student visa holder may work at most 24 hours a week (48 hours over a fortnight).
export const VISA_WEEKLY_HOURS = {
  working_holiday: null,
  student: 24,
  graduate: null,
  pr_citizen: null,
  other: null
};

// Older applications stored these codes; they map to the current visa keys.
const LEGACY_VISA_KEYS = {
  whv_417: 'working_holiday',
  whv_462: 'working_holiday',
  student_500: 'student',
  graduate_485: 'graduate'
};

export function visaKey(value) {
  const raw = String(value || '');
  return LEGACY_VISA_KEYS[raw] || raw;
}

export function weeklyHourCap(value) {
  const cap = VISA_WEEKLY_HOURS[visaKey(value)];
  return typeof cap === 'number' ? cap : null;
}