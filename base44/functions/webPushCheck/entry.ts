import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { encryptPayload, vapidAuthHeader, vapidKeys } from '../../shared/webpush.ts';

function b64u(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64u(value: string) {
  const normalised = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalised + '='.repeat((4 - (normalised.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function tb(value: string) {
  return new TextEncoder().encode(value);
}

function join(...parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  parts.forEach((part) => {
    out.set(part, at);
    at += part.length;
  });
  return out;
}

// Temporary: proves the sealed payload can be opened by the phone that owns the subscription,
// and that the VAPID token verifies against the app's public key.
export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);

    const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const uaRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const text = JSON.stringify({ title: 'Test alert', body: 'Your phone alerts are working.', link: '/roster', tag: 'x' });

    const body = await encryptPayload({ p256dh: b64u(uaRaw), auth: b64u(authSecret) }, tb(text));

    const salt = body.slice(0, 16);
    const recordSize = body[19];
    const idlen = body[20];
    const keyid = body.slice(21, 21 + idlen);
    const ciphertext = body.slice(21 + idlen);

    const asPublic = await crypto.subtle.importKey('raw', keyid, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = new Uint8Array(
      await crypto.subtle.deriveBits({ name: 'ECDH', public: asPublic }, ua.privateKey, 256)
    );
    const ikmKey = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
    const ikm = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: join(tb('WebPush: info\0'), uaRaw, keyid) },
        ikmKey,
        256
      )
    );
    const contentKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    const cek = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt, info: tb('Content-Encoding: aes128gcm\0') },
        contentKey,
        128
      )
    );
    const nonce = new Uint8Array(
      await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt, info: tb('Content-Encoding: nonce\0') },
        contentKey,
        96
      )
    );
    const aes = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
    const opened = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, ciphertext));
    const plaintext = new TextDecoder().decode(opened.slice(2));

    const keys = await vapidKeys(base44, 'https://example.base44.app');
    const auth = await vapidAuthHeader(keys, 'https://fcm.googleapis.com/fcm/send/example');
    const jwt = auth.replace(/^vapid t=/, '').split(', k=')[0];
    const parts = jwt.split('.');
    const publicKey = await crypto.subtle.importKey(
      'raw',
      unb64u(keys.public_key),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const signatureOk = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      unb64u(parts[2]),
      tb(`${parts[0]}.${parts[1]}`)
    );
    const claims = JSON.parse(new TextDecoder().decode(unb64u(parts[1])));

    return Response.json({
      decryptOk: plaintext === text,
      vapidSignatureOk: signatureOk,
      audience: claims.aud,
      subject: claims.sub,
      keyHeaderMatches: auth.indexOf(keys.public_key) > 0,
      recordSizeByte: recordSize,
      keyIdLength: idlen,
      ciphertextLength: ciphertext.length
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}