// The leave rules a company starts from, and the arithmetic every leave screen and function
// shares. Full time and part time accrue on the ordinary hours they actually work; casual
// staff accrue no paid leave. This follows the usual Australian payroll convention, and the
// employer still reviews every number in their own leave settings.

export const HOURS_PER_DAY = 7.6;

// 4 weeks of annual leave a year across 52 weeks of ordinary hours, and 10 days of personal
// leave, as hours per one ordinary hour worked.
export const ANNUAL_RATE = 0.076923;
export const PERSONAL_RATE = 0.038462;

export const DEFAULT_LEAVE_TYPES = [
  {
    key: 'annual',
    name: 'Annual leave',
    name_ko: '연차 휴가',
    emoji: '🌴',
    paid: true,
    accrual_method: 'ordinary_hours',
    accrual_rate: ANNUAL_RATE,
    employment_types: ['full_time', 'part_time'],
    grant_enabled: false,
    grant_hours: 0,
    grant_period: 'yearly',
    grant_anchor: 'calendar_year',
    grant_employment_types: [],
    expiry_enabled: false,
    expiry_months: 12,
    requires_certificate: false,
    custom: false,
    active: true,
    order: 1
  },
  {
    key: 'sick',
    name: "Sick / carer's leave",
    name_ko: '병가 · 간병 휴가',
    emoji: '🤒',
    paid: true,
    accrual_method: 'ordinary_hours',
    accrual_rate: PERSONAL_RATE,
    employment_types: ['full_time', 'part_time'],
    grant_enabled: false,
    grant_hours: 0,
    grant_period: 'yearly',
    grant_anchor: 'calendar_year',
    grant_employment_types: [],
    expiry_enabled: false,
    expiry_months: 12,
    requires_certificate: true,
    custom: false,
    active: true,
    order: 2
  },
  {
    key: 'compassionate',
    name: 'Compassionate leave',
    name_ko: '경조 휴가',
    emoji: '🕊️',
    paid: true,
    accrual_method: 'none',
    accrual_rate: 0,
    employment_types: ['full_time', 'part_time', 'casual'],
    grant_enabled: false,
    grant_hours: 0,
    grant_period: 'yearly',
    grant_anchor: 'calendar_year',
    grant_employment_types: [],
    expiry_enabled: false,
    expiry_months: 12,
    requires_certificate: false,
    custom: false,
    active: true,
    order: 3
  },
  {
    key: 'unpaid',
    name: 'Unpaid leave',
    name_ko: '무급 휴가',
    emoji: '📅',
    paid: false,
    accrual_method: 'none',
    accrual_rate: 0,
    employment_types: ['full_time', 'part_time', 'casual'],
    grant_enabled: false,
    grant_hours: 0,
    grant_period: 'yearly',
    grant_anchor: 'calendar_year',
    grant_employment_types: [],
    expiry_enabled: false,
    expiry_months: 12,
    requires_certificate: false,
    custom: false,
    active: true,
    order: 4
  },
  {
    key: 'wellness',
    name: 'Wellness day',
    name_ko: '웰니스 데이',
    emoji: '💚',
    paid: true,
    accrual_method: 'none',
    accrual_rate: 0,
    employment_types: ['full_time', 'part_time'],
    grant_enabled: true,
    grant_hours: HOURS_PER_DAY,
    grant_period: 'yearly',
    grant_anchor: 'calendar_year',
    grant_employment_types: ['full_time', 'part_time'],
    expiry_enabled: true,
    expiry_months: 12,
    requires_certificate: false,
    custom: true,
    active: true,
    order: 5
  }
];

export function round2(value: any) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function activeTypes(rows: any) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.active !== false)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

// A permanent (정규직) contract is the full-time entitlements the employer already set, so a leave
// type that names full time covers permanent staff as well.
export function employmentKey(value: string) {
  const key = String(value || 'casual');
  return key === 'permanent' ? 'full_time' : key;
}

// A type with no employment list of its own is open to everyone. The employer narrows it by
// ticking the employment types the leave is meant for.
export function eligibleFor(type: any, employmentType: string) {
  const list = type && Array.isArray(type.employment_types) ? type.employment_types : [];
  if (list.length === 0) return true;
  return list.includes(employmentKey(employmentType));
}

export function grantsFor(type: any, employmentType: string) {
  const list = type && Array.isArray(type.grant_employment_types) ? type.grant_employment_types : [];
  if (list.length === 0) return eligibleFor(type, employmentType);
  return list.includes(employmentKey(employmentType));
}

function dayIso(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function addMonths(iso: string, months: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return dayIso(date.getTime());
}

function addYears(iso: string, years: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return dayIso(date.getTime());
}

function dayBefore(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return dayIso(date.getTime());
}

// Which allowance period a day falls in: a calendar year, the 12 months since the person's
// last work anniversary, or a calendar month. The key changes when a new period begins, which
// is what tells the balance to hand out the next allowance.
export function grantPeriod(type: any, onIso: string, startDate: string) {
  const day = String(onIso || '').slice(0, 10);
  if (type && type.grant_period === 'monthly') {
    const start = `${day.slice(0, 7)}-01`;
    return { key: day.slice(0, 7), start, end: dayBefore(addMonths(start, 1)), months: 1 };
  }
  const anchor = String(startDate || '').slice(0, 10);
  if (type && type.grant_anchor === 'anniversary' && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    let years = 0;
    while (years < 80 && addYears(anchor, years + 1) <= day) years += 1;
    const start = addYears(anchor, years);
    return { key: `${start}~${years}`, start, end: dayBefore(addYears(anchor, years + 1)), months: 12 };
  }
  const year = day.slice(0, 4);
  return { key: year, start: `${year}-01-01`, end: `${year}-12-31`, months: 12 };
}

export function expiresOn(type: any, period: any) {
  if (!type || !type.expiry_enabled) return '';
  const months = Number(type.expiry_months) > 0 ? Number(type.expiry_months) : 12;
  return addMonths(period.start, months);
}

// The hours left to book: what was carried in, what has accrued, what the employer granted and
// any manual correction, less what has been used and what is already waiting for approval.
export function availableHours(balance: any) {
  if (!balance) return 0;
  const total =
    (Number(balance.opening_hours) || 0) +
    (Number(balance.accrued_hours) || 0) +
    (Number(balance.granted_hours) || 0) +
    (Number(balance.adjustment_hours) || 0) -
    (Number(balance.used_hours) || 0) -
    (Number(balance.pending_hours) || 0);
  return round2(total);
}

export function periodDays(startIso: string, endIso: string) {
  const start = Date.parse(`${String(startIso).slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${String(endIso || startIso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 1;
  return Math.round((end - start) / 86400000) + 1;
}

// One stored leave type in the shape every leave screen and function reads it in.
export function normaliseLeaveType(type: any) {
  return {
    key: String(type.key || ''),
    name: type.name || type.key,
    name_ko: type.name_ko || '',
    emoji: type.emoji || '',
    paid: type.paid !== false,
    accrual_method: type.accrual_method === 'ordinary_hours' ? 'ordinary_hours' : 'none',
    accrual_rate: Number(type.accrual_rate) || 0,
    employment_types: Array.isArray(type.employment_types) ? type.employment_types : [],
    grant_enabled: Boolean(type.grant_enabled),
    grant_hours: Number(type.grant_hours) || 0,
    grant_period: type.grant_period === 'monthly' ? 'monthly' : 'yearly',
    grant_anchor: type.grant_anchor === 'anniversary' ? 'anniversary' : 'calendar_year',
    grant_employment_types: Array.isArray(type.grant_employment_types) ? type.grant_employment_types : [],
    expiry_enabled: Boolean(type.expiry_enabled),
    expiry_months: Number(type.expiry_months) || 12,
    requires_certificate: Boolean(type.requires_certificate),
    // From this many hours held, this leave's balance is shown in red.
    flag_hours: Math.max(0, Number(type.flag_hours) || 0),
    custom: Boolean(type.custom),
    active: type.active !== false,
    order: Number(type.order) || 10
  };
}

// Every leave the company has set up, or the platform's own defaults when it has set up none.
export function leaveTypesFrom(stored: any[]) {
  const rows = Array.isArray(stored) ? stored : [];
  return (rows.length > 0 ? rows : DEFAULT_LEAVE_TYPES).map(normaliseLeaveType);
}