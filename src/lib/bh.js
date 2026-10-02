export const VISA_TYPES = [
  { value: 'whv_417', label: 'Working Holiday (417)' },
  { value: 'whv_462', label: 'Work & Holiday (462)' },
  { value: 'student_500', label: 'Student (500)' },
  { value: 'graduate_485', label: 'Graduate (485)' },
  { value: 'pr_citizen', label: 'PR / Citizen' },
  { value: 'other', label: 'Other visa' }
];

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
  { value: 'full_time', label: 'Full time' }
];

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

export function visaLabel(value) {
  const found = VISA_TYPES.find((v) => v.value === value);
  return found ? found.label : value || '—';
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