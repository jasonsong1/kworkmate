// The in-store kiosk link is the branch and the day it belongs to. It is only ever used to
// look up a branch and record a punch, and every manual punch still waits for a manager.

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
  return STATE_TIMEZONES[String((branch && branch.state) || '').trim().toUpperCase()] || 'Australia/Sydney';
}

// The calendar day as the store's own clock shows it.
export function todayIn(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function kioskToken(branchId, date) {
  return `${branchId}~${date}`;
}

export function decodeKioskToken(token) {
  const [branchId, date] = String(token || '').split('~');
  if (!branchId || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  return { branchId, date };
}