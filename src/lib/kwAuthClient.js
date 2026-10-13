// ============================================================
// kwAuthClient.js
// 목적: KWorkMate 브라우저 측 인증 및 Supabase 백엔드 직통 클라이언트
//
// Base44 SDK 의존성을 완전히 제거하고, 100% Supabase Edge Functions 및 DB로 직통 연결합니다.
// 화면 코드들은 기존과 동일하게 `base44.entities.*`, `base44.functions.invoke(...)`,
// `base44.auth.*` 형태로 호출할 수 있도록 완벽한 호환 객체를 제공합니다.
// ============================================================

import { supabase } from './supabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const TOKEN_KEY = 'kw_session_token';
const IDENTITY_KEY = 'kw_session_identity';
const EXTRAS_KEY = 'kw_session_extras';

let verifyPromise = null;

// 각 탭마다 독립된 세션을 유지하기 위해 sessionStorage를 기본으로 사용합니다.
function readRaw(key) {
  try {
    const held = sessionStorage.getItem(key);
    if (held !== null) return held;
  } catch (error) {
    /* 시크릿 창 등에서 스토리지가 차단된 경우 */
  }
  try {
    const legacy = localStorage.getItem(key);
    if (legacy !== null) sessionStorage.setItem(key, legacy);
    return legacy;
  } catch (error) {
    return null;
  }
}

function writeRaw(key, value) {
  try {
    sessionStorage.setItem(key, value);
    localStorage.removeItem(key);
  } catch (error) {
    /* 스토리지 에러 방어 */
  }
}

function dropRaw(key) {
  try {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  } catch (error) {
    /* 스토리지 에러 방어 */
  }
}

function readJson(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    /* 스토리지 에러 방어 */
  }
}

function readTabJson(key) {
  const value = readRaw(key);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function writeToken(value) {
  writeRaw(TOKEN_KEY, String(value || ''));
}

export function kwToken() {
  return (readRaw(TOKEN_KEY) || '').replace(/^"(.*)"$/, '$1');
}

export function kwActive() {
  return Boolean(kwToken());
}

export function kwIdentity() {
  return readTabJson(IDENTITY_KEY);
}

export function kwExtras() {
  return readJson(EXTRAS_KEY) || {};
}

export function kwSetExtras(data) {
  writeJson(EXTRAS_KEY, { ...kwExtras(), ...(data || {}) });
}

function storeIdentity(user) {
  writeRaw(IDENTITY_KEY, JSON.stringify(user));
}

export function kwClearSession() {
  dropRaw(TOKEN_KEY);
  dropRaw(IDENTITY_KEY);
  verifyPromise = null;
}

// Supabase Edge Functions로 직통 HTTP POST 요청을 보냅니다.
export async function kwCall(name, payload) {
  const token = kwToken();
  const endpoint = `${supabaseUrl}/functions/v1/${name}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'x-kw-session': token
    },
    body: JSON.stringify({ ...(payload || {}), kw_session: token })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error((data && data.error) || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data || {};
    throw error;
  }
  return data;
}

export async function kwLogin(identifier, password) {
  const data = await kwCall('kwLogin', { identifier, password });
  if (!data || !data.token) throw new Error('Wrong ID or password');
  writeToken(data.token);
  storeIdentity(data.user);
  verifyPromise = Promise.resolve({ ...(data.user || {}), ...kwExtras() });
  return data;
}

export async function kwLogout() {
  if (kwActive()) await kwCall('kwSession', { action: 'logout' }).catch(() => null);
  kwClearSession();
}

export async function kwVerify() {
  if (!kwActive()) return null;
  if (!verifyPromise) {
    verifyPromise = kwCall('kwSession', { action: 'me' })
      .then((data) => {
        if (data && data.user) {
          storeIdentity(data.user);
          return { ...data.user, ...kwExtras() };
        }
        return null;
      })
      .catch(() => {
        kwClearSession();
        return null;
      });
  }
  return verifyPromise;
}

export async function kwMe() {
  if (!kwActive()) return null;
  return await kwVerify();
}

export async function kwSessionAction(payload) {
  return await kwCall('kwSession', payload);
}

export async function kwChangePassword(currentPassword, newPassword) {
  return await kwCall('kwSession', {
    action: 'change_password',
    current_password: currentPassword,
    new_password: newPassword
  });
}

// 화면에서 엔티티 조작(base44.entities.X.filter 등) 시 kwData Edge Function으로 중계합니다.
export async function kwEntityOp(entity, op, args = []) {
  const payload = { entity, op };
  switch (op) {
    case 'list':
      payload.options = args[0];
      break;
    case 'filter':
      payload.query = args[0];
      payload.options = args[1];
      break;
    case 'get':
    case 'delete':
      payload.id = args[0];
      break;
    case 'count':
      payload.query = args[0];
      break;
    case 'aggregate':
      Object.assign(payload, args[0] || {});
      break;
    case 'create':
      payload.data = args[0];
      break;
    case 'update':
      payload.id = args[0];
      payload.data = args[1];
      break;
    case 'bulkCreate':
    case 'bulkUpdate':
      payload.records = args[0];
      break;
    case 'upsert':
      payload.records = args[0];
      payload.key = args[1] && args[1].key ? args[1].key : args[1];
      break;
    case 'updateMany':
      payload.query = args[0];
      payload.data = args[1];
      break;
    case 'deleteMany':
      payload.query = args[0];
      break;
    default:
      break;
  }
  const data = await kwCall('kwData', payload);
  return data.result;
}

function kwEntityHandler(entity) {
  return new Proxy(
    {},
    {
      get: (target, op) => {
        if (typeof op !== 'string' || op === 'then' || op.startsWith('_')) return undefined;
        if (op === 'subscribe') return () => () => {};
        return (...args) => kwEntityOp(entity, op, args);
      }
    }
  );
}

// Base44 SDK 없이 100% Supabase로 동작하는 최상위 App 클라이언트를 생성합니다.
export function createSupabaseAppClient() {
  const entities = new Proxy(
    {},
    {
      get: (target, name) => {
        if (typeof name !== 'string' || name === 'then' || name.startsWith('_')) return undefined;
        return kwEntityHandler(name);
      }
    }
  );

  const auth = {
    me: () => kwMe(),
    isAuthenticated: () => kwVerify().then(Boolean),
    logout: async (redirect) => {
      await kwLogout();
      if (redirect) window.location.href = redirect;
    },
    updateMe: async (data) => {
      kwSetExtras(data);
      return { ...((await kwMe()) || {}), ...kwExtras() };
    },
    redirectToLogin: () => {
      window.location.href = '/login';
    }
  };

  const functions = {
    invoke: (name, payload) =>
      kwCall(name, payload).then((data) => ({ data, status: 200 })),
    fetch: (path, init) => {
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      return fetch(`${supabaseUrl}/functions/v1/${cleanPath}`, {
        ...init,
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'x-kw-session': kwToken(),
          ...(init && init.headers)
        }
      });
    }
  };

  const integrations = {
    Core: {
      UploadFile: async ({ file, bucket = 'private' }) => {
        if (!supabase) throw new Error('Supabase client not initialized');
        const ext = file.name ? file.name.split('.').pop() : 'bin';
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
        const filePath = `${fileName}`;
        const { error } = await supabase.storage.from(bucket).upload(filePath, file);
        if (error) throw error;
        return { file_uri: `${bucket}/${filePath}` };
      },
      CreateFileSignedUrl: async ({ file_uri, expiresIn = 3600 }) => {
        if (!supabase) throw new Error('Supabase client not initialized');
        const parts = String(file_uri || '').split('/');
        const bucket = parts[0] || 'private';
        const path = parts.slice(1).join('/');
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
        if (error) throw error;
        return { signed_url: data.signedUrl };
      }
    }
  };

  const app = {
    getPublicSettings: async () => ({ id: 'kworkmate', public_settings: {} })
  };

  return {
    entities,
    auth,
    functions,
    integrations,
    app
  };
}

// 하위 호환성을 위해 유지합니다.
export function installKwAuth(client) {
  return createSupabaseAppClient();
}