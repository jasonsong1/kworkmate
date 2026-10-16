export const VISA_TYPES = [
  { value: 'working_holiday', label: 'Working holiday visa' },
  { value: 'student', label: 'Student visa' },
  { value: 'graduate', label: 'Graduate visa' },
  { value: 'pr_citizen', label: 'PR/Citizen' },
  { value: 'other', label: 'Other' }
];

// Applications saved before the list was simplified still carry these codes; they are read
// as the matching visa instead of showing a raw code.
const LEGACY_VISA_KEYS = {
  whv_417: 'working_holiday',
  whv_462: 'working_holiday',
  student_500: 'student',
  graduate_485: 'graduate'
};

// Hours each visa allows in one week. Null means no limit. A student visa holder may work at
// most 24 hours (48 hours a fortnight); the roster builder and its checks respect this.
export const VISA_WEEKLY_HOURS = {
  working_holiday: null,
  student: 24,
  graduate: null,
  pr_citizen: null,
  other: null
};

export function visaKey(value) {
  const raw = String(value || '');
  return LEGACY_VISA_KEYS[raw] || raw;
}

export function visaWeeklyHours(value) {
  const cap = VISA_WEEKLY_HOURS[visaKey(value)];
  return typeof cap === 'number' ? cap : null;
}

export const DAYS = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' }
];

// Half-hour start / finish times a person can choose from.
export const AVAILABILITY_TIMES = (() => {
  const times = [];
  for (let hour = 5; hour <= 23; hour += 1) {
    times.push(`${String(hour).padStart(2, '0')}:00`);
    if (hour < 23) times.push(`${String(hour).padStart(2, '0')}:30`);
  }
  return times;
})();

// Older applications stored shift blocks instead of times; convert them to a time range.
const LEGACY_BLOCK_HOURS = {
  morning: { from: '06:00', to: '12:00' },
  afternoon: { from: '12:00', to: '17:00' },
  close: { from: '17:00', to: '23:00' }
};

export const POSITIONS = ['Crew', 'Barista', 'Kitchen', 'Cashier', 'Shift Supervisor', 'Assistant Manager', 'Store Manager'];

export const EMPLOYMENT_TYPES = [
  { value: 'casual', label: 'Casual' },
  { value: 'part_time', label: 'Part time' },
  { value: 'full_time', label: 'Full time' },
  // A permanent contract carries full-time entitlements, agreed at up to 50 hours a week.
  { value: 'permanent', label: 'Permanent' },
  // The person who runs the store: the roster applies no hour limit of any kind to them.
  { value: 'owner', label: 'Owner' }
];

// The label each list shows, in the language the reader chose.
export const EMPLOYMENT_LABEL_KEYS = {
  casual: 'emp.casual',
  part_time: 'emp.part_time',
  full_time: 'emp.full_time',
  permanent: 'emp.permanent',
  owner: 'emp.owner'
};

export const VISA_LABEL_KEYS = {
  working_holiday: 'visa.working_holiday',
  student: 'visa.student',
  graduate: 'visa.graduate',
  pr_citizen: 'visa.pr_citizen',
  other: 'visa.other'
};

export const RESIDENCY_OPTIONS = [
  { value: 'resident', label: 'Australian resident for tax purposes' },
  { value: 'foreign_resident', label: 'Foreign resident' },
  { value: 'working_holiday', label: 'Working holiday maker' }
];

export const APPLICANT_STATUS = {
  submitted: { label: 'Submitted', tone: 'bg-slate-100 text-slate-700' },
  top10: { label: 'AI shortlist', tone: 'bg-indigo-100 text-indigo-700' },
  mini_interview: { label: 'Mini interview', tone: 'bg-amber-100 text-amber-800' },
  final_interview: { label: 'Final interview', tone: 'bg-sky-100 text-sky-800' },
  interview_scheduled: { label: 'Interview booked', tone: 'bg-emerald-100 text-emerald-800' },
  hired: { label: 'Hired', tone: 'bg-emerald-600 text-white' },
  rejected: { label: 'Not selected', tone: 'bg-slate-200 text-slate-500' }
};

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export const ALLOWED_RESUME_EXT = ['pdf', 'doc', 'docx'];

export function fileExtension(name) {
  const parts = String(name || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function isDigits(value, length) {
  return new RegExp(`^\\d{${length}}$`).test(String(value || '').trim());
}

export function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

// Australian mobile / phone numbers are often typed with spaces or dashes.
export function isPhoneNumber(value, length = 10) {
  return phoneDigits(value).length === length;
}

// "HH:MM" (24 hour) to minutes, so times compare by value and never as text.
export function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function employeeNumberPreview(prefix, padding, next) {
  const pad = Number(padding) > 0 ? Number(padding) : 3;
  return `${prefix || ''}${String(Number(next) || 1).padStart(pad, '0')}`;
}

export function emptyAvailability() {
  const result = {};
  DAYS.forEach((d) => {
    result[d.key] = { from: '', to: '' };
  });
  return result;
}

export function normalizeAvailability(raw) {
  const result = emptyAvailability();
  if (!raw || typeof raw !== 'object') return result;
  DAYS.forEach((d) => {
    const value = raw[d.key];
    if (Array.isArray(value)) {
      const hours = value.map((key) => LEGACY_BLOCK_HOURS[key]).filter(Boolean);
      if (hours.length > 0) {
        result[d.key] = {
          from: hours.map((h) => h.from).sort()[0],
          to: hours.map((h) => h.to).sort().slice(-1)[0]
        };
      }
    } else if (value && (value.from || value.to)) {
      // Keep a half filled day: the start time must survive until a finish time is chosen.
      result[d.key] = { from: value.from || '', to: value.to || '' };
    }
  });
  return result;
}

export function setDayAvailability(current, dayKey, patch) {
  const matrix = normalizeAvailability(current);
  return { ...matrix, [dayKey]: { ...matrix[dayKey], ...patch } };
}

export function isDayAvailable(day) {
  const from = timeToMinutes(day && day.from);
  const to = timeToMinutes(day && day.to);
  return from !== null && to !== null && to > from;
}

export function hasAnyAvailability(matrix) {
  const clean = normalizeAvailability(matrix);
  return DAYS.some((d) => isDayAvailable(clean[d.key]));
}

export function availabilitySummary(matrix) {
  const clean = normalizeAvailability(matrix);
  const parts = DAYS.filter((d) => isDayAvailable(clean[d.key])).map(
    (d) => `${d.short} ${clean[d.key].from}–${clean[d.key].to}`
  );
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export function coverageDays(matrix) {
  const clean = normalizeAvailability(matrix);
  return DAYS.filter((d) => isDayAvailable(clean[d.key])).length;
}

export const DEFAULT_INTERVIEW_QUESTIONS = [
  { id: 'q1', question: 'Tell us about your hospitality experience and where you last worked.', seconds: 60 },
  { id: 'q2', question: 'Describe a busy shift you handled and what you did.', seconds: 60 },
  { id: 'q3', question: 'How do you handle an unhappy customer?', seconds: 45 },
  { id: 'q4', question: 'Which days and shifts can you work each week?', seconds: 45 },
  { id: 'q5', question: 'When can you start, and how long do you plan to stay with us?', seconds: 45 }
];

export const NOTICE_PERIODS = [
  { value: 'immediately', label: 'Immediately' },
  { value: '1_week', label: '1 week' },
  { value: '2_weeks', label: '2 weeks' },
  { value: '4_weeks', label: '4 weeks' }
];

export function noticePeriodLabel(value) {
  const found = NOTICE_PERIODS.find((n) => n.value === value);
  return found ? found.label : value || '—';
}

export function defaultRequiredQuestions() {
  return [
    { key: 'visa_type', label: 'Visa type', required: true, enabled: true },
    { key: 'visa_expiry', label: 'Visa expiry date', required: true, enabled: true },
    { key: 'availability', label: 'Weekly availability matrix', required: true, enabled: true },
    { key: 'notice_period', label: 'Notice period', required: true, enabled: true },
    { key: 'emergency_contact', label: 'Emergency contact', required: true, enabled: true },
    { key: 'resume', label: 'Resume upload (PDF / DOC / DOCX, max 10MB)', required: true, enabled: true }
  ];
}

// A question the employer no longer asks. Older job ads still carry it in their saved
// settings, so it is filtered out wherever the question list is shown, saved or answered.
export const RETIRED_QUESTION_KEYS = ['pre_interview_url'];

export function visibleRequiredQuestions(list) {
  const source = Array.isArray(list) && list.length > 0 ? list : defaultRequiredQuestions();
  return source.filter((q) => q && !RETIRED_QUESTION_KEYS.includes(q.key));
}

export function visaLabel(value) {
  const found = VISA_TYPES.find((v) => v.value === visaKey(value));
  if (found) return found.label;
  return value || '—';
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function startOfWeekIso(iso) {
  const d = new Date(`${iso || todayIso()}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function weekDates(startIso) {
  return DAYS.map((d, i) => ({ ...d, date: addDaysIso(startIso, i) }));
}

// How far ahead a roster, a set of shifts or a week of availability is looked at: this week and
// the three after it. Anything earlier is behind us and is never shown.
export const WEEKS_AHEAD = 4;

export function weeksBetweenCount(weekStart, from = startOfWeekIso(todayIso())) {
  return Math.round((Date.parse(`${weekStart}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (7 * 24 * 60 * 60 * 1000));
}

// How long a shift actually is, with the unpaid break taken out. Every total on every screen is
// read the same way, so two screens can never disagree about a week.
export function shiftHours(shift) {
  const start = timeToMinutes(shift && shift.start_time);
  const end = timeToMinutes(shift && shift.end_time);
  if (start === null || end === null || end <= start) return 0;
  return Math.max(0, end - start - (Number(shift && shift.break_min) || 0)) / 60;
}

export function hoursValue(value) {
  return `${Math.round((Number(value) || 0) * 10) / 10}h`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function isDelayed(invitedAt, confirmedAt) {
  if (!invitedAt || confirmedAt) return false;
  return Date.now() - new Date(invitedAt).getTime() > 48 * 60 * 60 * 1000;
}

// 매장의 영업시간(trading_hours) 문자열을 분석하여 해당 요일에 영업하는지 판별합니다.
// 영업시간이 설정되어 있지 않으면 기본값으로 true(오픈)를 반환합니다.
export function isBranchOpenOnDay(tradingHoursStr, dayShortOrIndex) {
  if (!tradingHoursStr || !tradingHoursStr.trim()) return true;
  const DAY_SHORTS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  let target = '';
  if (typeof dayShortOrIndex === 'number') {
    target = DAY_SHORTS[dayShortOrIndex] || '';
  } else {
    target = String(dayShortOrIndex || '').trim().toLowerCase().slice(0, 3);
  }
  if (!target) return true;
  const parts = String(tradingHoursStr).split('·').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return parts.some((p) => p.startsWith(target));
}