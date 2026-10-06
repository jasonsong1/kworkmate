// KWorkMate's own sign-in. The employer issues an ID and a password to their employee,
// the password is stored here as a slow hash, and every server call is answered with the
// scope that belongs to that employee — never with what the caller asked for.
//
// A platform session (work email + platform password) and this one can both answer a call:
// resolveCaller() prefers whichever is present, so screens shared by managers and staff
// keep working either way.

const encoder = new TextEncoder();
const ITERATIONS = 100000;
const SESSION_DAYS = 30;
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 10;
export const SESSION_HEADER = 'x-kw-session';
export const MIN_PASSWORD_LENGTH = 6;

const SEALED_FIELDS = ['password_hash', 'password_salt', 'pin_hash', 'pin_salt'];
export const MANAGER_ROLES = ['company_admin', 'branch_manager'];

export function clean(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

export function lower(value) {
  return clean(value).toLowerCase();
}

export function rowsOf(result) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

export function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function randomHex(bytes = 24) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return toHex(array);
}

export function randomSalt() {
  return randomHex(16);
}

export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(String(password)), 'PBKDF2', false, [
    'deriveBits'
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(String(salt)), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  return toHex(bits);
}

function sameHex(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export async function verifyPassword(password, salt, hash) {
  if (!password || !salt || !hash) return false;
  return sameHex(await hashPassword(password, salt), String(hash));
}

// The hash never leaves the server: every answer that carries an employee goes through here.
export function sealRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const copy = { ...record };
  SEALED_FIELDS.forEach((field) => delete copy[field]);
  return copy;
}

export function seal(entity, value) {
  if (entity !== 'EmployeeProfile' || !value) return value;
  if (Array.isArray(value)) return value.map(sealRecord);
  if (value.items) return { ...value, items: value.items.map(sealRecord) };
  if (value.rows) return { ...value, rows: value.rows.map(sealRecord) };
  return sealRecord(value);
}

export function lockedUntil(profile) {
  const stamp = profile && profile.login_locked_until ? new Date(profile.login_locked_until).getTime() : 0;
  return stamp > Date.now() ? stamp : 0;
}

// An employee belongs to the branch their record names, plus any branch that lists them as
// its manager. That is the whole answer to "which branches may this account touch".
export async function branchIdsFor(base44, profile) {
  const found = new Set();
  if (profile.branch_id) found.add(profile.branch_id);
  const email = lower(profile.user_email);
  if (email) {
    const managed = rowsOf(
      await base44.asServiceRole.entities.Branch.filter({ company_id: profile.company_id }).catch(() => [])
    );
    managed.forEach((branch) => {
      const managers = (branch.manager_emails || []).map((value) => lower(value));
      if (managers.includes(email)) found.add(branch.id);
    });
  }
  return [...found];
}

// ---------- sessions ----------

export async function openSession(base44, { profile, user_agent }) {
  const branch_ids = await branchIdsFor(base44, profile);
  return await base44.asServiceRole.entities.LoginSession.create({
    token: `kw_${randomHex(24)}`,
    profile_id: profile.id,
    email: lower(profile.user_email),
    full_name: profile.full_name || '',
    company_id: profile.company_id || '',
    branch_id: profile.branch_id || '',
    branch_ids,
    app_role: profile.app_role || 'staff',
    active: true,
    expires_at: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    last_seen_at: new Date().toISOString(),
    user_agent: clean(user_agent).slice(0, 200)
  });
}

export async function loadSession(base44, token) {
  if (!token) return null;
  const found = rowsOf(
    await base44.asServiceRole.entities.LoginSession.filter({ token, active: true }, { limit: 1 }).catch(() => [])
  );
  const session = found[0];
  if (!session) return null;
  const expires = session.expires_at ? new Date(session.expires_at).getTime() : 0;
  if (expires && expires < Date.now()) return null;
  const seen = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0;
  if (Date.now() - seen > 10 * 60 * 1000) {
    await base44.asServiceRole.entities.LoginSession
      .update(session.id, { last_seen_at: new Date().toISOString() })
      .catch(() => null);
  }
  return session;
}

export async function closeSession(base44, token) {
  if (!token) return;
  await base44.asServiceRole.entities.LoginSession
    .updateMany({ token }, { $set: { active: false, revoked_at: new Date().toISOString() } })
    .catch(() => null);
}

export async function closeSessionsFor(base44, profileId) {
  if (!profileId) return;
  await base44.asServiceRole.entities.LoginSession
    .updateMany({ profile_id: profileId, active: true }, { $set: { active: false, revoked_at: new Date().toISOString() } })
    .catch(() => null);
}

// Shaped like the platform's own answer to auth.me(), so every screen that already reads
// me.email / me.company_id / me.branch_ids keeps working untouched.
export function userFromSession(session) {
  return {
    id: session.profile_id,
    email: session.email,
    full_name: session.full_name || session.email,
    role: 'user',
    company_id: session.company_id || '',
    branch_id: session.branch_id || '',
    branch_ids: session.branch_ids || [],
    app_role: session.app_role || 'staff'
  };
}

async function tokenFromRequest(req) {
  const header = req.headers ? req.headers.get(SESSION_HEADER) : '';
  if (header) return clean(header);
  if (typeof req.clone !== 'function') return '';
  try {
    const copy = req.clone();
    const body = await copy.json();
    return clean(body && body.kw_session);
  } catch (error) {
    return '';
  }
}

// Either session answers: an employee signed in with the ID their employer issued, or an
// account signed in through the platform. Nothing else gets an identity.
export async function resolveCaller(base44, req) {
  const token = await tokenFromRequest(req);
  if (token) {
    const session = await loadSession(base44, token);
    if (session) return { ...userFromSession(session), kw: true, session_token: session.token, profile_id: session.profile_id };
  }
  const me = await base44.auth.me().catch(() => null);
  return me || null;
}

export function isManagerIdentity(me) {
  if (!me) return false;
  if (me.role === 'admin') return true;
  return MANAGER_ROLES.includes(clean(me.app_role));
}

// ---------- what a caller may reach ----------
// scope: 'company' | 'branch' | 'global'. self_field names the column that belongs to one
// person, so an employee only ever reaches rows that are theirs.
export const GATEWAY_ENTITIES = {
  Company: { scope: 'company', company_field: 'id', writes: { staff: 'none', manager: 'none' } },
  Branch: { scope: 'company', company_field: 'company_id', writes: { staff: 'none', manager: 'none' } },
  PositionPreset: { scope: 'global', writes: { staff: 'none', manager: 'none' } },
  EmployeeProfile: {
    scope: 'company',
    company_field: 'company_id',
    self_field: 'user_email',
    staff_fields: ['phone', 'address', 'language', 'emergency_contact_name', 'emergency_contact_phone'],
    writes: { staff: 'fields', manager: 'none' }
  },
  LeaveType: { scope: 'company', company_field: 'company_id', writes: { staff: 'none', manager: 'none' } },
  RegionalHoliday: { scope: 'company', company_field: 'company_id', writes: { staff: 'none', manager: 'none' } },
  RosterSetting: { scope: 'branch', branch_field: 'branch_id', writes: { staff: 'none', manager: 'none' } },
  Shift: {
    scope: 'branch',
    branch_field: 'branch_id',
    self_field: 'employee_email',
    writes: { staff: 'none', manager: 'all' }
  },
  TimeEntry: {
    scope: 'branch',
    branch_field: 'branch_id',
    self_field: 'employee_email',
    writes: { staff: 'all', manager: 'all' }
  },
  LeaveRequest: {
    scope: 'branch',
    branch_field: 'branch_id',
    self_field: 'employee_email',
    writes: { staff: 'all', manager: 'all' }
  },
  LeaveBalance: {
    scope: 'branch',
    branch_field: 'branch_id',
    self_field: 'employee_email',
    writes: { staff: 'none', manager: 'none' }
  },
  AvailabilitySubmission: {
    scope: 'branch',
    branch_field: 'branch_id',
    self_field: 'employee_email',
    writes: { staff: 'all', manager: 'all' }
  },
  Notification: {
    scope: 'company',
    company_field: 'company_id',
    self_field: 'user_email',
    writes: { staff: 'all', manager: 'all' }
  },
  CalendarSubscription: {
    scope: 'company',
    company_field: 'company_id',
    self_field: 'user_email',
    writes: { staff: 'all', manager: 'all' }
  },
  PushSubscription: {
    scope: 'company',
    company_field: 'company_id',
    self_field: 'user_email',
    writes: { staff: 'all', manager: 'all' }
  }
};

export function scopeQuery(me, rule) {
  if (!rule || rule.scope === 'global') return {};
  const staff = !isManagerIdentity(me);
  if (staff && rule.self_field) return { [rule.self_field]: lower(me.email) };
  const branches = (me.branch_ids || []).filter(Boolean);
  if (rule.scope === 'branch') {
    if (branches.length > 0) return { [rule.branch_field]: { $in: branches } };
    return rule.company_field ? { [rule.company_field]: me.company_id } : {};
  }
  return { [rule.company_field]: me.company_id };
}

// The scope is written last, so what the caller sent can never widen it.
export function mergeScope(query, scope) {
  const merged = { ...(query || {}) };
  Object.keys(scope || {}).forEach((key) => {
    merged[key] = scope[key];
  });
  return merged;
}

function scopeValue(record, want) {
  const got = record ? record[Object.keys(want)[0]] : undefined;
  return got;
}

export function inScope(record, scope) {
  if (!record) return false;
  return Object.keys(scope || {}).every((key) => {
    const want = scope[key];
    const got = record[key];
    if (want && typeof want === 'object' && Array.isArray(want.$in)) return want.$in.includes(got);
    return want === got;
  });
}

export function pickFields(data, fields) {
  const source = data || {};
  const out = {};
  (fields || []).forEach((field) => {
    if (field in source) out[field] = source[field];
  });
  return out;
}

// Every row an employee writes is stamped with their own identity and their own branch,
// whatever the browser sent.
export function scopeData(me, rule, data) {
  const out = { ...(data || {}) };
  if (!rule || rule.scope === 'global') return out;
  const staff = !isManagerIdentity(me);
  const branches = (me.branch_ids || []).filter(Boolean);
  if (rule.scope === 'company') {
    if (rule.company_field && rule.company_field !== 'id') out[rule.company_field] = me.company_id;
    if (staff && rule.self_field) out[rule.self_field] = lower(me.email);
    return out;
  }
  out.company_id = me.company_id;
  if (rule.branch_field) {
    const wanted = clean(out[rule.branch_field]) || me.branch_id || branches[0] || '';
    out[rule.branch_field] = branches.includes(wanted) ? wanted : me.branch_id || branches[0] || '';
  }
  if (staff && rule.self_field) out[rule.self_field] = lower(me.email);
  return out;
}

export { scopeValue };