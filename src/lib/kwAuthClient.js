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
    localStorage.setItem(key, value);
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

// 플랫폼 최고 관리자(슈퍼어드민) 권한을 판정하여 role: 'admin'을 확실하게 보장합니다.
function formatUser(user) {
  if (!user) return null;
  const isSuper =
    user.role === 'admin' ||
    user.app_role === 'super_admin' ||
    (user.email && String(user.email).trim().toLowerCase() === 'sym910403@gmail.com');

  return {
    ...user,
    role: isSuper ? 'admin' : user.role || 'staff',
    app_role: isSuper ? 'super_admin' : user.app_role || 'staff',
    is_platform_admin: isSuper
  };
}

function storeIdentity(user) {
  const formatted = formatUser(user);
  if (formatted) {
    writeRaw(IDENTITY_KEY, JSON.stringify(formatted));
  } else {
    dropRaw(IDENTITY_KEY);
  }
}

export function kwIdentity() {
  return readTabJson(IDENTITY_KEY) || readJson(IDENTITY_KEY);
}

export function kwExtras() {
  return readJson(EXTRAS_KEY) || {};
}

export function kwSetExtras(extras) {
  writeJson(EXTRAS_KEY, { ...kwExtras(), ...(extras || {}) });
}

export function kwClearSession() {
  dropRaw(TOKEN_KEY);
  dropRaw(IDENTITY_KEY);
  localStorage.removeItem(EXTRAS_KEY);
  verifyPromise = null;
}

// Supabase Edge Function을 직접 호출하는 코어 통신 함수
export async function kwCall(fnName, payload = {}) {
  const token = kwToken();
  const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'x-kw-session': token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const error = new Error((data && data.error) || `Edge function ${fnName} failed with ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

// 사원번호 또는 업무용 이메일로 로그인
export async function kwLogin(identifier, password) {
  const result = await kwCall('kwLogin', {
    identifier: (identifier || '').trim(),
    password: password || ''
  });

  if (result.token) {
    writeToken(result.token);
  }
  if (result.user) {
    storeIdentity(result.user);
  }
  return result;
}

// Google OAuth 2.0 간편 로그인 시작
export async function kwLoginWithGoogle(returnTo = '/') {
  if (!supabase) throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
  const redirectTo = `${window.location.origin}/login?oauth=google&returnTo=${encodeURIComponent(returnTo)}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account'
      }
    }
  });
  if (error) throw error;
  return data;
}

// Google OAuth 리디렉션 복귀 후 정식 KWorkMate 세션 발급 및 동기화
export async function kwHandleOAuthCallback() {
  if (!supabase) return null;
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;

  const accessToken = session.access_token;
  const user = session.user;
  if (!accessToken || !user) return null;

  // 백엔드 kwSession 함수로 정식 KWorkMate 세션(kw_...) 발급 요청
  try {
    const fnUrl = `${supabaseUrl}/functions/v1/kwSession`;
    const res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'oauth_login', access_token: accessToken })
    });
    if (res.ok) {
      const payload = await res.json();
      if (payload && payload.token) {
        // 정식 kw_... 토큰 저장
        writeToken(payload.token);
      } else {
        writeToken(accessToken);
      }
      if (payload && payload.user) {
        const formatted = formatUser(payload.user);
        storeIdentity(formatted);
        return formatted;
      }
    }
  } catch (err) {
    console.warn('[kwHandleOAuthCallback] session exchange failed:', err);
    writeToken(accessToken);
  }

  // 기본 사용자 정보 저장
  const basic = formatUser({
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
    role: user.email?.toLowerCase() === 'sym910403@gmail.com' ? 'admin' : 'staff'
  });
  storeIdentity(basic);
  return basic;
}

export async function kwLogout() {
  try {
    if (kwActive()) {
      await kwCall('kwSession', { action: 'logout' });
    }
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
  } catch (error) {
    // 로그아웃 시 서버 에러가 발생해도 로컬 세션은 정상 삭제합니다.
  } finally {
    kwClearSession();
  }
}

export async function kwVerify() {
  if (!kwActive()) return null;
  if (!verifyPromise) {
    verifyPromise = kwCall('kwSession', { action: 'me' })
      .then((data) => {
        if (data && data.user) {
          const formattedUser = formatUser(data.user);
          storeIdentity(formattedUser);
          return { ...formattedUser, ...kwExtras() };
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
      throw new Error(`Unsupported entity operation: ${op}`);
  }
  const result = await kwCall('kwData', payload);
  return result && result.data !== undefined ? result.data : result;
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
    loginWithGoogle: (returnTo) => kwLoginWithGoogle(returnTo),
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
    },
    // 비밀번호 재설정 이메일 요청 메서드 (ForgotPassword 화면 및 비밀번호 찾기 호환)
    resetPasswordRequest: async (email) => {
      return functions.invoke('requestEmployeePasswordReset', {
        email: (email || '').trim(),
        origin: window.location.origin
      });
    }
  };

  const functions = {
    invoke: async (name, payload) => {
      try {
        const data = await kwCall(name, payload);
        return { data, status: 200 };
      } catch (err) {
        console.error(`functions.invoke('${name}') error:`, err);
        return {
          data: { error: (err && (err.message || (err.data && err.data.error))) || '서버 요청 실패' },
          status: (err && err.status) || 500
        };
      }
    },
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
      // 1. 공개 파일 업로드 (회사 로고, 지점 사진, 포스터 이미지 등)
      // 누구나 볼 수 있는 'public' 버킷에 업로드하고 직간접 접근 가능한 공개 URL(file_url)을 반환합니다.
      UploadPublicFile: async ({ file }) => {
        if (!supabase) throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
        const ext = file.name ? file.name.split('.').pop() : 'bin';
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
        const filePath = `${fileName}`;
        const { error } = await supabase.storage.from('public').upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });
        if (error) throw error;
        const { data: publicUrlData } = supabase.storage.from('public').getPublicUrl(filePath);
        return {
          file_url: publicUrlData.publicUrl,
          file_uri: `public/${filePath}`
        };
      },

      // 2. 비공개 파일 업로드 (지원자 이력서, 온보딩 서약서, 개인정보 서류 등)
      // 보안이 필요한 'private' 버킷에 업로드하고 안전한 내부 식별 경로(file_uri)를 반환합니다.
      UploadPrivateFile: async ({ file }) => {
        if (!supabase) throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
        const ext = file.name ? file.name.split('.').pop() : 'bin';
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
        const filePath = `${fileName}`;
        const { error } = await supabase.storage.from('private').upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });
        if (error) throw error;
        return {
          file_uri: `private/${filePath}`
        };
      },

      // 3. 범용 파일 업로드 (하위 호환성 유지)
      UploadFile: async ({ file, bucket = 'private' }) => {
        if (!supabase) throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
        const ext = file.name ? file.name.split('.').pop() : 'bin';
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
        const filePath = `${fileName}`;
        const { error } = await supabase.storage.from(bucket).upload(filePath, file);
        if (error) throw error;
        if (bucket === 'public') {
          const { data: publicUrlData } = supabase.storage.from('public').getPublicUrl(filePath);
          return { file_url: publicUrlData.publicUrl, file_uri: `${bucket}/${filePath}` };
        }
        return { file_uri: `${bucket}/${filePath}` };
      },

      // 4. 비공개 파일 안전 열람을 위한 서명된 URL(Signed URL) 생성
      CreateFileSignedUrl: async ({ file_uri, expiresIn = 3600 }) => {
        if (!supabase) throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
        const parts = String(file_uri || '').split('/');
        const bucket = parts[0] || 'private';
        const path = parts.slice(1).join('/');
        // 공개 버킷인 경우 서명 없이 바로 다운로드 가능한 URL 반환
        if (bucket === 'public') {
          const { data: publicUrlData } = supabase.storage.from('public').getPublicUrl(path);
          return { signed_url: publicUrlData.publicUrl };
        }
        // 비공개 버킷인 경우 시간 제한 서명 URL 발급
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
        if (error) {
          // 클라이언트 세션 토큰이 다를 경우 kwSession 함수를 통해 서명 URL 발급 재시도
          try {
            const fallback = await kwSessionAction({ action: 'sign_document', file_uri });
            if (fallback && fallback.signed_url) {
              return { signed_url: fallback.signed_url };
            }
          } catch (_) {}
          throw error;
        }
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