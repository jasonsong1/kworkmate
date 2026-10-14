// KWorkMate's own sign-in. The employer issues an ID and a password to their employee,
// the password is stored here as a slow hash, and every server call is answered with the
// scope that belongs to that employee — never with what the caller asked for.
//
// A platform session (work email + platform password) and this one can both answer a call:
// resolveCaller() prefers whichever is present, so screens shared by managers and staff
// keep working either way.

import {
  mergePresets,
  presetFor,
  primaryPositionOf,
  resolveAccess,
  resolvePresetKey,
  resolveRoleKey
} from './access.ts';
import { ALL_MODULES, applyModuleOverrides, loadModuleOverrides, packageState } from './packages.ts';
import { companyBranchIds } from './companies.ts';

const encoder = new TextEncoder();
const ITERATIONS = 100000;
const SESSION_DAYS = 30;
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 10;
export const SESSION_HEADER = 'x-kw-session';
export const MIN_PASSWORD_LENGTH = 10;
export const PASSWORD_HISTORY_LIMIT = 5;

const SEALED_FIELDS = ['password_hash', 'password_salt', 'password_history', 'pin_hash', 'pin_salt'];
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

// One rule for every password an employee ever holds: long enough, and mixing the four kinds of
// character. The employer handing one over and the employee choosing their own hear the same rule.
export function passwordProblem(password) {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  if (!/[A-Z]/.test(value)) return 'Add at least one uppercase letter';
  if (!/[a-z]/.test(value)) return 'Add at least one lowercase letter';
  if (!/[0-9]/.test(value)) return 'Add at least one number';
  if (!/[^A-Za-z0-9]/.test(value)) return 'Add at least one symbol';
  return '';
}

// A password this person has already used — the one in force or one of the few kept before it —
// can never be handed back to them.
export async function passwordReused(profile, password) {
  const kept = Array.isArray(profile && profile.password_history) ? profile.password_history : [];
  const entries = [
    profile && profile.password_hash ? { salt: profile.password_salt, hash: profile.password_hash } : null,
    ...kept
  ].filter((entry) => entry && entry.salt && entry.hash);
  for (const entry of entries) {
    if (await verifyPassword(password, entry.salt, entry.hash)) return true;
  }
  return false;
}

// The password being replaced joins the ones already remembered.
export function passwordHistory(profile) {
  const kept = Array.isArray(profile && profile.password_history) ? profile.password_history : [];
  const previous =
    profile && profile.password_hash && profile.password_salt
      ? [{ salt: profile.password_salt, hash: profile.password_hash, at: new Date().toISOString() }]
      : [];
  return [...previous, ...kept].slice(0, PASSWORD_HISTORY_LIMIT);
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

// The branches an account may touch: the branch its record names, any branch that lists them as
// its manager, and — for a position whose preset runs the company's crew areas company-wide —
// every store the company runs.
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
  const everywhere = await companyBranchIds(base44, profile).catch(() => []);
  everywhere.forEach((id) => found.add(id));
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
  const isSuper =
    session.app_role === 'super_admin' ||
    lower(session.email) === 'sym910403@gmail.com';
  return {
    id: session.profile_id,
    email: session.email,
    full_name: session.full_name || session.email,
    role: isSuper ? 'admin' : (session.role || 'user'),
    company_id: session.company_id || '',
    branch_id: session.branch_id || '',
    branch_ids: session.branch_ids || [],
    app_role: isSuper ? 'company_admin' : (session.app_role || 'staff')
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
// One rule per entity: which area of the app owns it (module), which rows belong to one person
// (self_field), and whether the row is theirs to write whatever the grants say (self_service).
export const GATEWAY_ENTITIES = {
  // The company and its stores are the context every screen stands on: nobody is asked for a
  // grant before their own address and opening hours can be shown.
  Company: { scope: 'company', company_field: 'id', module: 'settings', context: true },
  Branch: { scope: 'company', company_field: 'company_id', module: 'branches', context: true },
  PositionPreset: { scope: 'global' },
  EmployeeProfile: {
    scope: 'company',
    company_field: 'company_id',
    self_field: 'user_email',
    module: 'employees',
    staff_fields: ['phone', 'address', 'language', 'emergency_contact_name', 'emergency_contact_phone']
  },
  LeaveType: { scope: 'company', company_field: 'company_id', module: 'leave' },
  RegionalHoliday: { scope: 'company', company_field: 'company_id', module: 'settings' },
  RosterSetting: { scope: 'branch', branch_field: 'branch_id', module: 'roster' },
  // Hiring is the manager's own work: the ad, the people who answered it and the interview
  // slots they can book.
  Job: { scope: 'branch', branch_field: 'branch_id', module: 'jobs' },
  Applicant: { scope: 'branch', branch_field: 'branch_id', module: 'applicants' },
  InterviewSlot: { scope: 'branch', branch_field: 'branch_id', module: 'interviews' },
  Shift: { scope: 'branch', branch_field: 'branch_id', self_field: 'employee_email', module: 'roster' },
  // What a person records about themselves — their hours, leave, availability — is always
  // theirs to write; only somebody else's row needs a grant.
  TimeEntry: { scope: 'branch', branch_field: 'branch_id', self_field: 'employee_email', module: 'attendance', self_service: true },
  LeaveRequest: { scope: 'branch', branch_field: 'branch_id', self_field: 'employee_email', module: 'leave', self_service: true },
  LeaveBalance: { scope: 'branch', branch_field: 'branch_id', self_field: 'employee_email', module: 'leave' },
  AvailabilitySubmission: { scope: 'branch', branch_field: 'branch_id', self_field: 'employee_email', module: 'roster', self_service: true },
  // Everything a person keeps about themselves: their own bell, their own calendar link, their
  // own phone. Never anybody else's, whatever position they hold.
  Notification: { scope: 'company', company_field: 'company_id', self_field: 'user_email', module: 'dashboard', self_only: true, self_service: true },
  CalendarSubscription: { scope: 'company', company_field: 'company_id', self_field: 'user_email', module: 'dashboard', self_only: true, self_service: true },
  PushSubscription: { scope: 'company', company_field: 'company_id', self_field: 'user_email', module: 'dashboard', self_only: true, self_service: true }
};

const LEVEL_RANK = { none: 0, read: 1, update: 2, write: 3 };
// The answer for an area the employer did not open to this person: a marker rather than a
// query, so nothing is ever asked of the database on their behalf.
export const NO_ROWS = { none: true };

// The employer's own answer to "what may this person do", resolved from the same three layers
// every screen reads: the package the company paid for, the position preset their role holds,
// and the grant saved for that role on the company and on the branch they work in.
// everyModule asks for the rights the person's own role carries, before the package the company
// paid for takes a module away: the back office uses it where an action belongs to the role
// itself (handing an employee their sign-in) rather than to a screen the package includes.
export async function accessFor(base44: any, me: any, everyModule = false) {
  const roleKey = clean(me && me.app_role) || 'staff';
  const isAdmin = Boolean(me && me.role === 'admin');
  const isCompanyAdmin = isAdmin || roleKey === 'company_admin';
  const companyId = clean(me && me.company_id);
  const company = companyId
    ? await base44.asServiceRole.entities.Company.get(companyId).catch(() => null)
    : null;
  const stored = rowsOf(await base44.asServiceRole.entities.PositionPreset.list().catch(() => []));
  const presets = mergePresets(stored);
  const customRoles = company && Array.isArray(company.custom_roles) ? company.custom_roles : [];
  // The position an employer set as the person's own carries the preset the company linked to it
  // and is what their grant is saved under, so the screens and the rows they may touch agree:
  // the main position decides, never the secondary one they can also cover shifts in.
  let person = null;
  if (!isAdmin && !isCompanyAdmin) {
    person = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter(
        { user_email: me.email },
        { limit: 1 }
      ).catch(() => [])
    )[0];
  }
  const positions = primaryPositionOf(person);
  const presetKey = resolvePresetKey({ roleKey, customRoles, isCompanyAdmin, positions });
  const preset = presetFor(presetKey, presets);
  const grantKey =
    isAdmin || isCompanyAdmin ? roleKey : resolveRoleKey({ roleKey, customRoles, positions });
  const branchId = clean(me && me.branch_id);
  const branch = branchId
    ? await base44.asServiceRole.entities.Branch.get(branchId).catch(() => null)
    : null;
  // The modules the company may open: its package, with any platform-wide edit on top, so a
  // module the super admin added back is reachable here too and not only on the screen.
  const modules = company
    ? applyModuleOverrides(packageState(company), await loadModuleOverrides(base44)).modules
    : ALL_MODULES;
  return resolveAccess({
    packageModules: isAdmin || everyModule ? ALL_MODULES : modules,
    preset,
    companyGrant: company && company.role_permissions ? company.role_permissions[grantKey] : null,
    branchGrant: branch && branch.role_permissions ? branch.role_permissions[grantKey] : null,
    isCompanyAdmin
  });
}

function cellFor(rule: any, access: any) {
  if (!rule || !rule.module) return null;
  return (access && access[rule.module]) || null;
}

// Which rows this person reaches for one entity: their own, their branch's, the company's, the
// context their screen stands on, or none at all.
function scopeOf(rule: any, access: any) {
  if (rule.self_only && rule.self_field) return 'self';
  const cell = cellFor(rule, access);
  if (!cell) {
    if (rule.self_field) return 'self';
    return rule.context ? 'context' : 'none';
  }
  // The employer closed this area for the position: not one row of it is theirs to reach, not
  // even the rows carrying their own name.
  if (cell.level === 'none') return 'none';
  const scope = cell.scope || 'company';
  // An area whose rows belong to one person each: a read grant still only opens their own.
  if (scope === 'self' && !rule.self_field) return 'context';
  return scope;
}

function companyRows(me: any, rule: any) {
  if (rule.scope === 'company' && rule.company_field === 'id') return { id: me.company_id };
  if (rule.company_field) return { [rule.company_field]: me.company_id };
  return { company_id: me.company_id };
}

export function scopeQuery(me: any, rule: any, access: any) {
  if (!rule || rule.scope === 'global') return {};
  const isSuper =
    me && (
      me.role === 'admin' ||
      me.app_role === 'super_admin' ||
      lower(me.email) === 'sym910403@gmail.com'
    );
  if (isSuper && rule.scope === 'company' && rule.company_field === 'id') {
    return {};
  }
  const scope = scopeOf(rule, access);
  if (scope === 'none') return NO_ROWS;
  if (scope === 'self') {
    return rule.self_field ? { [rule.self_field]: lower(me.email) } : companyRows(me, rule);
  }
  const branches = (me.branch_ids || []).filter(Boolean);
  if (scope === 'branch' && rule.branch_field && branches.length > 0) {
    return { [rule.branch_field]: { $in: branches } };
  }
  // 'company', and 'branch' for somebody who works in no branch at all.
  return companyRows(me, rule);
}

// The scope is written last, so what the caller sent can never widen it.
export function mergeScope(query: any, scope: any) {
  const merged = { ...(query || {}) };
  Object.keys(scope || {}).forEach((key) => {
    merged[key] = scope[key];
  });
  return merged;
}

export function inScope(record: any, scope: any) {
  if (!record) return false;
  return Object.keys(scope || {}).every((key) => {
    const want = scope[key];
    const got = record[key];
    if (want && typeof want === 'object' && Array.isArray(want.$in)) return want.$in.includes(got);
    return want === got;
  });
}

export function pickFields(data: any, fields: any) {
  const source = data || {};
  const out: any = {};
  (fields || []).forEach((field: string) => {
    if (field in source) out[field] = source[field];
  });
  return out;
}

// Every row a person writes is stamped with their own identity and the store it belongs to,
// whatever the browser sent.
//
// `existing` is the row an edit is being applied to, and the three cases differ on purpose:
// a new row (undefined) lands in the store the caller works in, an edit (the row) keeps the store
// that row is already filed under — a save that says nothing about the branch edits an ad, it does
// not move it to whoever is editing — and an edit of rows we do not hold one by one (null) has no
// store invented for it at all.
export function scopeData(me: any, rule: any, data: any, access: any, existing?: any) {
  const out = { ...(data || {}) };
  if (!rule || rule.scope === 'global') return out;
  const scope = scopeOf(rule, access);
  const branches = (me.branch_ids || []).filter(Boolean);
  if (rule.scope === 'company') {
    if (rule.company_field && rule.company_field !== 'id') out[rule.company_field] = me.company_id;
  } else {
    out.company_id = me.company_id;
    if (rule.branch_field) {
      const asked = clean(out[rule.branch_field]);
      const held = existing ? clean(existing[rule.branch_field]) : '';
      const wanted =
        (branches.includes(asked) ? asked : '') ||
        held ||
        (existing === undefined ? me.branch_id || branches[0] || '' : '');
      if (wanted) out[rule.branch_field] = wanted;
      else delete out[rule.branch_field];
    }
  }
  if (scope === 'self' && rule.self_field) out[rule.self_field] = lower(me.email);
  return out;
}

// Writing follows the same answer: what the employer granted for this position, and nothing
// else. Two things stay outside it — a person's own self-service rows, and the few contact
// details of their own staff record.
export function writeMode(rule: any, access: any, me?: any) {
  if (!rule) return 'none';
  if (rule.self_service) return 'all';
  const isSuper =
    me && (
      me.role === 'admin' ||
      me.app_role === 'super_admin' ||
      lower(me.email) === 'sym910403@gmail.com'
    );
  if (isSuper) return 'all';
  const cell = cellFor(rule, access);
  const level = (cell && cell.level) || 'none';
  if (LEVEL_RANK[level] >= LEVEL_RANK.update) return 'all';
  if (rule.staff_fields && (level === 'read' || !cell)) return 'fields';
  return 'none';
}