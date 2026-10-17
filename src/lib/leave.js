// How a leave screen reads a request, a balance and a leave type. The rules themselves live on
// the server; this is only what the screens need to show them.

export const STATUS_KEYS = {
  pending: 'leave.statusPending',
  approved: 'leave.statusApproved',
  rejected: 'leave.statusRejected',
  cancelled: 'leave.statusCancelled'
};

export const STATUS_TONES = {
  pending: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  approved: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  rejected: 'bg-slate-200 text-slate-600 hover:bg-slate-200',
  cancelled: 'bg-slate-200 text-slate-600 hover:bg-slate-200'
};

export const EMPLOYMENT_KEYS = {
  full_time: 'leave.emp.full',
  part_time: 'leave.emp.part',
  casual: 'leave.emp.casual',
  permanent: 'leave.emp.permanent',
  owner: 'leave.emp.owner'
};

export const HOURS_PER_DAY = 7.6;

export const LEAVE_TYPE_KO_MAP = {
  'annual': '연차 휴가',
  'annual leave': '연차 휴가',
  'sick': '병가 · 간병 휴가',
  "sick / carer's leave": '병가 · 간병 휴가',
  'sick leave': '병가 · 간병 휴가',
  'compassionate': '경조 휴가',
  'compassionate leave': '경조 휴가',
  'bereavement': '경조 휴가',
  'unpaid': '무급 휴가',
  'unpaid leave': '무급 휴가',
  'wellness': '웰니스 데이',
  'wellness day': '웰니스 데이'
};

export function typeName(type, lang) {
  if (!type) return '';
  if (lang === 'ko') {
    if (type.name_ko) return type.name_ko;
    const key = String(type.key || '').toLowerCase().trim();
    const nameLower = String(type.name || '').toLowerCase().trim();
    if (LEAVE_TYPE_KO_MAP[key]) return LEAVE_TYPE_KO_MAP[key];
    if (LEAVE_TYPE_KO_MAP[nameLower]) return LEAVE_TYPE_KO_MAP[nameLower];
  }
  return type.name || type.key || '';
}

export function formatLeaveTypeName(request, lang) {
  if (!request) return '';
  const rawName = request.leave_type_name || '';
  const key = String(request.leave_type_key || '').toLowerCase().trim();
  const nameLower = rawName.toLowerCase().trim();

  if (lang === 'ko') {
    if (LEAVE_TYPE_KO_MAP[key]) return LEAVE_TYPE_KO_MAP[key];
    if (LEAVE_TYPE_KO_MAP[nameLower]) return LEAVE_TYPE_KO_MAP[nameLower];
  }
  return rawName || key;
}

export function hoursLabel(value) {
  const hours = Math.round((Number(value) || 0) * 100) / 100;
  return `${hours}h`;
}

export function daysBetween(startIso, endIso) {
  const start = Date.parse(`${String(startIso || '').slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${String(endIso || startIso || '').slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

export function rangeLabel(request) {
  if (!request) return '';
  const start = request.start_date || '';
  const end = request.end_date || start;
  return start === end ? start : `${start} → ${end}`;
}

// Each balance row is joined with the leave type it belongs to, so a card can show the name,
// the emoji and who the leave applies to without a second lookup.
export function joinTypes(balances, types) {
  const byKey = new Map((types || []).map((type) => [type.key, type]));
  return (balances || []).map((balance) => ({ ...balance, type: byKey.get(balance.leave_type_key) || null }));
}

export function availableFor(balances, typeKey) {
  const found = (balances || []).find(
    (balance) => balance.leave_type_key === typeKey && balance.type && balance.type.accrual_method === 'ordinary_hours'
  ) || (balances || []).find((balance) => balance.leave_type_key === typeKey);
  return found ? Number(found.available_hours) || 0 : 0;
}