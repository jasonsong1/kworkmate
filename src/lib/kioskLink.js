// The store QR code carries the branch and the day it belongs to, so staff can scan it with
// their own phone and record attendance at the right store on the right date.

// Each state keeps its own clock, so the day on the code is the store's own day and not the
// viewer's: a code shown in Sydney just after midnight still counts as today at the store.
const STATE_TIMEZONES = {
  NSW: 'Australia/Sydney',
  ACT: 'Australia/Sydney',
  VIC: 'Australia/Melbourne',
  QLD: 'Australia/Brisbane',
  SA: 'Australia/Adelaide',
  WA: 'Australia/Perth',
  TAS: 'Australia/Hobart',
  NT: 'Australia/Darwin'
};

export function timezoneForBranch(branch) {
  const state = String((branch && branch.state) || '').trim().toUpperCase();
  return STATE_TIMEZONES[state] || 'Australia/Sydney';
}

// The calendar day at the branch, as its own clock shows it.
export function todayFor(branch) {
  return new Date().toLocaleDateString('en-CA', { timeZone: timezoneForBranch(branch) });
}

export function kioskUrl(branchId, date) {
  return `${window.location.origin}/kiosk/${branchId}~${date}`;
}

export function parseKioskLink(text) {
  const match = String(text || '').match(/\/kiosk\/([^/?#~]+)~(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  return { branchId: match[1], date: match[2] };
}