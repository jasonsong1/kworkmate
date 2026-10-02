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

// Half-hour slots an applicant or staff member can pick for each day.
export const TIME_OPTIONS = (() => {
  const list = [];
  for (let mins = 6 * 60; mins <= 23 * 60 + 30; mins += 30) {
    const h = String(Math.floor(mins / 60)).padStart(2, '0');
    const m = String(mins % 60).padStart(2, '0');
    list.push(`${h}:${m}`);
  }
  return list;
})();

// Older applications stored shift blocks instead of a time window.
const BLOCK_RANGES = {
  morning: ['06:00', '12:00'],
  afternoon: ['12:00', '17:00'],
  close: ['17:00', '23:00']
};

const toMinutes = (time) => {
  const [h, m] = String(time || '0:0').split(':').map(Number);
  return h * 60 + m;
};

const toTime = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

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

export function employeeNumberPreview(prefix, padding, next) {
  const pad = Number(padding) > 0 ? Number(padding) : 3;
  return `${prefix || ''}${String(Number(next) || 1).padStart(pad, '0')}`;
}

export function emptyAvailability() {
  return {};
}

export function dayWindow(matrix, dayKey) {
  const value = matrix ? matrix[dayKey] : null;
  if (!value) return null;
  if (Array.isArray(value)) {
    const ranges = value.map((b) => BLOCK_RANGES[b]).filter(Boolean);
    if (ranges.length === 0) return null;
    const from = ranges.reduce((min, r) => (r[0] < min ? r[0] : min), ranges[0][0]);
    const to = ranges.reduce((max, r) => (r[1] > max ? r[1] : max), ranges[0][1]);
    return { from, to };
  }
  if (value.from && value.to) return { from: value.from, to: value.to };
  return null;
}

export function setDayWindow(matrix, dayKey, patch) {
  const current = dayWindow(matrix, dayKey) || { from: '09:00', to: '17:00' };
  const merged = { ...current, ...patch };
  let from = toMinutes(merged.from);
  let to = toMinutes(merged.to);
  if (to <= from) {
    if (patch.to) from = Math.max(6 * 60, to - 60);
    else to = Math.min(23 * 60 + 30, from + 60);
  }
  return { ...(matrix || {}), [dayKey]: { from: toTime(from), to: toTime(to) } };
}

export function clearDayWindow(matrix, dayKey) {
  const next = { ...(matrix || {}) };
  delete next[dayKey];
  return next;
}

export function windowHours(win) {
  if (!win) return 0;
  const mins = toMinutes(win.to) - toMinutes(win.from);
  return mins > 0 ? mins / 60 : 0;
}

export function coverageDays(matrix) {
  return DAYS.filter((d) => dayWindow(matrix, d.key)).length;
}

export function weeklyHours(matrix) {
  return DAYS.reduce((total, d) => total + windowHours(dayWindow(matrix, d.key)), 0);
}

export function availabilitySummary(matrix) {
  const parts = DAYS.map((d) => {
    const win = dayWindow(matrix, d.key);
    return win ? `${d.short} ${win.from}–${win.to}` : null;
  }).filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export function availabilityText(matrix) {
  const parts = DAYS.map((d) => {
    const win = dayWindow(matrix, d.key);
    return win ? `${d.label} ${win.from}-${win.to}` : null;
  }).filter(Boolean);
  return parts.length > 0 ? parts.join('; ') : 'not available';
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-');
}

export function jobSlugPath(branchName, jobTitle) {
  return [slugify(branchName), slugify(jobTitle)].filter(Boolean).join('/');
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