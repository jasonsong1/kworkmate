// Web push, so a phone hears about a roster or leave change with no installed app.
// The browser's push service carries the message and the app's service worker shows it.
// VAPID identifies this app to the push service, and the payload is sealed for one
// subscription (RFC 8291) so the push service itself only ever sees ciphertext.

const VAPID_KEY_ID = 'vapid-default';
const DEFAULT_SUBJECT = 'https://base44.app';

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

function bytesToB64u(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uToBytes(value: string) {
  const normalised = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function textBytes(value: string) {
  return new TextEncoder().encode(value);
}

function concat(...parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  parts.forEach((part) => {
    out.set(part, at);
    at += part.length;
  });
  return out;
}

// The app's own VAPID identity: created once, then reused for every subscription.
export async function vapidKeys(base44: any, origin?: string) {
  const existing = rowsOf(
    await base44.asServiceRole.entities.PushVapidKey
      .filter({ key_id: VAPID_KEY_ID }, { sort: 'created_date', limit: 1 })
      .catch(() => [])
  )[0];

  if (existing && existing.public_key && existing.private_key) {
    if (origin && !existing.subject) {
      await base44.asServiceRole.entities.PushVapidKey
        .update(existing.id, { subject: origin })
        .catch(() => null);
      existing.subject = origin;
    }
    return existing;
  }

  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const privateKey = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));

  const row = {
    key_id: VAPID_KEY_ID,
    public_key: bytesToB64u(publicKey),
    private_key: bytesToB64u(privateKey),
    subject: origin || DEFAULT_SUBJECT
  };
  const created = await base44.asServiceRole.entities.PushVapidKey.create(row).catch(() => null);
  return created || row;
}

// A short-lived signed token proving the sender may use this VAPID key for that endpoint.
export async function vapidAuthHeader(keys: any, endpoint: string) {
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    b64uToBytes(keys.private_key),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const header = bytesToB64u(textBytes(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToB64u(
    textBytes(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: keys.subject || DEFAULT_SUBJECT
      })
    )
  );
  const unsigned = `${header}.${claims}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, textBytes(unsigned))
  );
  return `vapid t=${unsigned}.${bytesToB64u(signature)}, k=${keys.public_key}`;
}

// Seal one message for one subscription. Only the phone holding the matching private key
// can open it, so the push service in between never sees the text.
export async function encryptPayload(subscription: any, payload: Uint8Array) {
  const uaPublicRaw = b64uToBytes(subscription.p256dh);
  const authSecret = b64uToBytes(subscription.auth);

  const uaPublic = await crypto.subtle.importKey(
    'raw',
    uaPublicRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublic }, ephemeral.privateKey, 256)
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const ikmKey = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: authSecret,
        info: concat(textBytes('WebPush: info\0'), uaPublicRaw, asPublicRaw)
      },
      ikmKey,
      256
    )
  );

  const contentKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const cek = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: textBytes('Content-Encoding: aes128gcm\0') },
      contentKey,
      128
    )
  );
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: textBytes('Content-Encoding: nonce\0') },
      contentKey,
      96
    )
  );

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(new Uint8Array([0, 0]), payload))
  );

  const size = new Uint8Array([0, 0, 0x10, 0x00]);
  return concat(salt, size, new Uint8Array([asPublicRaw.length]), asPublicRaw, ciphertext);
}

// One delivery. A subscription the push service has thrown away is switched off here, so a
// phone that was wiped or a browser that was reset stops costing a request every time.
async function deliver(base44: any, row: any, keys: any, message: any) {
  const body = await encryptPayload(row, textBytes(JSON.stringify(message)));
  const response = await fetch(row.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
      Urgency: 'high',
      Authorization: await vapidAuthHeader(keys, row.endpoint)
    },
    body
  });

  if (response.status === 404 || response.status === 410) {
    await base44.asServiceRole.entities.PushSubscription
      .update(row.id, { active: false, last_error: `gone (${response.status})` })
      .catch(() => null);
    return false;
  }

  if (!response.ok) {
    const failures = (Number(row.failure_count) || 0) + 1;
    await base44.asServiceRole.entities.PushSubscription
      .update(row.id, { failure_count: failures, last_error: String(response.status), active: failures < 5 })
      .catch(() => null);
    return false;
  }

  await base44.asServiceRole.entities.PushSubscription
    .update(row.id, { last_success_at: new Date().toISOString(), failure_count: 0, last_error: '' })
    .catch(() => null);
  return true;
}

// The same news for every phone that turned alerts on: one query for the whole list, then a
// delivery per device. Never throws, so the leave or roster action that triggered it is safe.
export async function sendWebPush(
  base44: any,
  {
    recipients,
    title,
    body,
    link,
    tag
  }: { recipients: any[]; title?: string; body?: string; link?: string; tag?: string }
) {
  const list = (recipients || []).filter((person: any) => person && person.email);
  if (list.length === 0) return 0;

  const emails = Array.from(new Set(list.map((person: any) => String(person.email))));
  const rows = rowsOf(
    await base44.asServiceRole.entities.PushSubscription
      .filter({ user_email: { $in: emails }, active: true }, { limit: 500 })
      .catch(() => [])
  );
  if (rows.length === 0) return 0;

  let keys: any = null;
  let sent = 0;
  for (const person of list) {
    const own = rows.filter((row: any) => row.user_email === person.email);
    if (own.length === 0) continue;
    if (!keys) keys = await vapidKeys(base44);
    if (!keys || !keys.private_key) return sent;

    const message = {
      title: String(person.title || title || 'K-Workmate').slice(0, 120),
      body: String(person.body || body || '').slice(0, 300),
      link: String(person.link || link || '/roster'),
      tag: String(tag || 'kworkmate')
    };

    for (const row of own) {
      try {
        if (await deliver(base44, row, keys, message)) sent += 1;
      } catch (error: any) {
        console.warn('web push not delivered', error && error.message);
      }
    }
  }
  return sent;
}