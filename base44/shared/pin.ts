// The store kiosk identifies a person by employee number plus a short personal PIN.
// The PIN is never stored as typed: each person gets their own random salt and only a
// digest of "salt:PIN" is kept, so the stored record cannot be read back into a PIN.

export function isValidPin(value) {
  return /^\d{4,6}$/.test(String(value || '').trim());
}

export function newPinSalt() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${String(pin).trim()}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

export async function verifyPin(pin, hash, salt) {
  if (!hash || !salt) return false;
  const candidate = await hashPin(pin, salt);
  return candidate === hash;
}