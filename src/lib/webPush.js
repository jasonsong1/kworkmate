// Everything the browser needs to turn phone alerts on: whether this device can do it at all,
// and the two steps that follow a tap on the button (allow notifications, then register).
import { base44 } from '@/api/base44Client';

function isIos() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// An iPhone only allows alerts for a site opened from its Home Screen.
export function isStandalone() {
  return (
    window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
  );
}

// ready | ios_install | unsupported | insecure
export function pushEnvironment() {
  if (!window.isSecureContext) return { state: 'insecure' };
  if (isIos() && !isStandalone()) return { state: 'ios_install' };
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) {
    return { state: 'unsupported' };
  }
  if (!navigator.serviceWorker) return { state: 'unsupported' };
  return { state: 'ready' };
}

export function deviceLabel() {
  const ua = navigator.userAgent || '';
  const platform = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Macintosh/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : 'Device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung'
      : /CriOS|Chrome/.test(ua)
        ? 'Chrome'
        : /Firefox|FxiOS/.test(ua)
          ? 'Firefox'
          : /Safari/.test(ua)
            ? 'Safari'
            : 'Browser';
  return `${platform} · ${browser}`;
}

function urlBase64ToUint8Array(value) {
  const normalised = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
  const raw = window.atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function keyToBase64Url(buffer) {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

// The endpoint this browser is subscribed with, empty when alerts are off here.
export async function currentEndpoint() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return '';
    const subscription = await reg.pushManager.getSubscription();
    return subscription ? subscription.endpoint : '';
  } catch (error) {
    return '';
  }
}

// Throws with 'ios_install' | 'unsupported' | 'insecure' | 'denied' | 'no_key' so the screen
// can say exactly what is missing.
export async function enableWebPush({ language, label }) {
  const environment = pushEnvironment();
  if (environment.state !== 'ready') throw new Error(environment.state);

  // The permission prompt has to be the first thing that follows the tap.
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');

  const reg = await registration();
  const ready = await navigator.serviceWorker.ready;
  if (!reg || !ready) throw new Error('unsupported');

  const keyResponse = await base44.functions.invoke('webPush', {
    action: 'key',
    origin: window.location.origin
  });
  const publicKey = keyResponse && keyResponse.data ? keyResponse.data.public_key : '';
  if (!publicKey) throw new Error('no_key');

  let subscription = await ready.pushManager.getSubscription();
  if (!subscription) {
    subscription = await ready.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  const p256dh = subscription.getKey ? keyToBase64Url(subscription.getKey('p256dh')) : '';
  const auth = subscription.getKey ? keyToBase64Url(subscription.getKey('auth')) : '';

  await base44.functions.invoke('webPush', {
    action: 'subscribe',
    endpoint: subscription.endpoint,
    p256dh,
    auth,
    device_label: label || deviceLabel(),
    platform: (navigator.platform || '').slice(0, 40),
    user_agent: (navigator.userAgent || '').slice(0, 200),
    locale: language === 'ko' ? 'ko' : 'en'
  });

  return subscription.endpoint;
}

// Off here, and the record goes with it so no alert is sent to a phone that opted out.
export async function disableWebPush() {
  let endpoint = '';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const subscription = reg ? await reg.pushManager.getSubscription() : null;
    if (subscription) {
      endpoint = subscription.endpoint;
      await subscription.unsubscribe();
    }
  } catch (error) {
    endpoint = '';
  }
  await base44.functions.invoke('webPush', { action: 'unsubscribe', endpoint }).catch(() => null);
  return endpoint;
}