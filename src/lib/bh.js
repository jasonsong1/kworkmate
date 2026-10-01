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

export const SHIFT_BLOCKS = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'close', label: 'Close' }
];

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
  const result = {};
  DAYS.forEach((d) => {
    result[d.key] = [];
  });
  return result;
}

export function toggleAvailability(current, dayKey, blockKey) {
  const next = { ...(current || {}) };
  const list = Array.isArray(next[dayKey]) ? [...next[dayKey]] : [];
  const index = list.indexOf(blockKey);
  if (index >= 0) list.splice(index, 1);
  else list.push(blockKey);
  next[dayKey] = list;
  return next;
}

export function availabilitySummary(matrix) {
  if (!matrix) return '—';
  const parts = DAYS.filter((d) => Array.isArray(matrix[d.key]) && matrix[d.key].length > 0).map(
    (d) => `${d.short}: ${matrix[d.key].map((b) => (b === 'close' ? 'close' : b)).join('/')}`
  );
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export function coverageDays(matrix) {
  if (!matrix) return 0;
  return DAYS.filter((d) => Array.isArray(matrix[d.key]) && matrix[d.key].length > 0).length;
}

export function defaultRequiredQuestions() {
  return [
    { key: 'visa_type', label: 'Visa type', required: true, enabled: true },
    { key: 'visa_expiry', label: 'Visa expiry date', required: true, enabled: true },
    { key: 'availability', label: 'Weekly availability matrix', required: true, enabled: true },
    { key: 'available_immediately', label: 'Available to start immediately', required: true, enabled: true },
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