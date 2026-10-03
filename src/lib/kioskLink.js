// The store QR code carries the branch and the day it belongs to, so staff can scan it with
// their own phone and record attendance at the right store on the right date.

export function kioskUrl(branchId, date) {
  return `${window.location.origin}/kiosk/${branchId}~${date}`;
}

export function parseKioskLink(text) {
  const match = String(text || '').match(/\/kiosk\/([^/?#~]+)~(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  return { branchId: match[1], date: match[2] };
}