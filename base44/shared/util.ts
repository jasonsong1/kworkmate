export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (v) => (Number(v) * Math.PI) / 180;
  const dLat = toRad(lat2) - toRad(lat1);
  const dLng = toRad(lng2) - toRad(lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export function formatEmployeeNumber(prefix, padding, n) {
  const pad = Number(padding) > 0 ? Number(padding) : 3;
  return `${prefix || ''}${String(n).padStart(pad, '0')}`;
}

export function randomToken(len) {
  const size = len || 24;
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32])
    .join('');
}

export function base64Encode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function compactDate(dateStr) {
  return String(dateStr || '').replace(/-/g, '');
}

export function compactTime(timeStr) {
  return String(timeStr || '00:00').replace(':', '');
}

export function icsLocalStamp(dateStr, timeStr) {
  return `${compactDate(dateStr)}T${compactTime(timeStr)}00`;
}

export function addMinutesToTime(dateStr, timeStr, minutes) {
  const [h, m] = String(timeStr || '00:00').split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + Number(minutes || 0);
  const dayShift = Math.floor(total / 1440);
  const rem = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(rem / 60)).padStart(2, '0');
  const mm = String(rem % 60).padStart(2, '0');
  if (dayShift === 0) return { date: dateStr, time: `${hh}:${mm}` };
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayShift);
  return { date: d.toISOString().slice(0, 10), time: `${hh}:${mm}` };
}

export function isDigits(value, length) {
  return new RegExp(`^\\d{${length}}$`).test(String(value || '').trim());
}

export function normalizePhone(value) {
  return String(value || '').replace(/[^\d+]/g, '');
}

export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// A list call answers either an array or a page, and every reader wants the rows.
export function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}