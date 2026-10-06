// KWorkMate's own sign-in, on the browser side.
//
// An employee the employer issued an ID and password to holds a session token instead of a
// platform one. This module keeps that token, answers every data call through the app's own
// scoped gateway while it is held, and steps aside completely when it is not — so a work-email
// sign-in behaves exactly as it always did.

const TOKEN_KEY = 'kw_session_token';
const IDENTITY_KEY = 'kw_session_identity';
const EXTRAS_KEY = 'kw_session_extras';

let raw = null;
let verifyPromise = null;

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
    /* a private window may refuse storage: the session then simply does not survive a reload */
  }
}

function writeToken(value) {
  try {
    localStorage.setItem(TOKEN_KEY, String(value || ''));
  } catch (error) {
    /* a private window may refuse storage: the session then simply does not survive a reload */
  }
}

export function kwToken() {
  try {
    const stored = localStorage.getItem(TOKEN_KEY) || '';
    // Sessions saved by an earlier build went through JSON, which wrapped the token in quotes and
    // made every request unrecognisable to the server. Unwrap those so they still work.
    return stored.replace(/^"(.*)"$/, '$1');
  } catch (error) {
    return '';
  }
}

export function kwActive() {
  return Boolean(kwToken());
}

export function kwIdentity() {
  return readJson(IDENTITY_KEY);
}

export function kwExtras() {
  return readJson(EXTRAS_KEY) || {};
}

export function kwSetExtras(data) {
  writeJson(EXTRAS_KEY, { ...kwExtras(), ...(data || {}) });
}

function storeIdentity(user) {
  writeJson(IDENTITY_KEY, user);
}

export function kwClearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(IDENTITY_KEY);
  } catch (error) {
    /* nothing to clear */
  }
  verifyPromise = null;
}

// Every call this app's own door answers carries the session in the body and in a header, so it
// works the same whether the browser is on the published domain or inside the preview.
export async function kwCall(name, payload) {
  const token = kwToken();
  const response = await raw.functions.fetch(`/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-kw-session': token },
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
  // Stored as the plain string it is: quoting it here was what broke the session check.
  writeToken(data.token);
  storeIdentity(data.user);
  verifyPromise = Promise.resolve({ ...(data.user || {}), ...kwExtras() });
  return data;
}

export async function kwLogout() {
  if (kwActive()) await kwCall('kwSession', { action: 'logout' }).catch(() => null);
  kwClearSession();
}

// Checked with the server once per page load, then remembered: a token that has expired or been
// revoked in the back office does not keep a screen open.
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

export async function kwChangePassword(currentPassword, newPassword) {
  return await kwCall('kwSession', {
    action: 'change_password',
    current_password: currentPassword,
    new_password: newPassword
  });
}

// One data call, shaped like the platform's own entity methods so a screen does not know which
// door answered it.
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
        // Live updates are the platform's own channel; without a platform session a screen
        // simply reloads when it is opened or a button is pressed.
        if (op === 'subscribe') return () => () => {};
        return (...args) => kwEntityOp(entity, op, args);
      }
    }
  );
}

function wrapAuth(client) {
  const base = client.auth;
  return {
    ...base,
    me: () => (kwActive() ? kwMe() : base.me()),
    isAuthenticated: () => (kwActive() ? kwVerify().then(Boolean) : base.isAuthenticated()),
    logout: async (redirect) => {
      if (!kwActive()) {
        base.logout(redirect);
        return;
      }
      await kwLogout();
      if (redirect) window.location.href = redirect;
    },
    updateMe: async (data) => {
      if (!kwActive()) return base.updateMe(data);
      kwSetExtras(data);
      return { ...((await kwMe()) || {}), ...kwExtras() };
    },
    redirectToLogin: () => {
      if (kwActive()) {
        window.location.href = '/login';
        return;
      }
      base.redirectToLogin(window.location.href);
    }
  };
}

function wrapFunctions(client) {
  const base = client.functions;
  return {
    ...base,
    invoke: (name, payload) =>
      kwActive() ? kwCall(name, payload).then((data) => ({ data, status: 200 })) : base.invoke(name, payload),
    fetch: (path, init) => base.fetch(path, init)
  };
}

export function installKwAuth(client) {
  raw = client;
  const entities = new Proxy(
    {},
    {
      get: (target, name) => {
        if (typeof name !== 'string' || name === 'then' || name.startsWith('_')) return undefined;
        return kwActive() ? kwEntityHandler(name) : client.entities[name];
      }
    }
  );
  const auth = wrapAuth(client);
  const functions = wrapFunctions(client);
  return new Proxy(client, {
    get: (target, prop) => {
      if (prop === 'auth') return auth;
      if (prop === 'entities') return entities;
      if (prop === 'functions') return functions;
      return target[prop];
    }
  });
}