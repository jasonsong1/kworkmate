// The same three-layer model the server applies, in the shape the screens need: the module
// list, the two axes of a cell (level and scope) and the options a ceiling leaves open.
import { MODULE_LABELS } from '@/lib/packages';

export const MODULES = [
  'dashboard',
  'branches',
  'employees',
  'jobs',
  'applicants',
  'interviews',
  'interview_settings',
  'roster',
  'leave',
  'attendance',
  'templates',
  'settings',
  'activity_logs'
];

export const LEVELS = ['none', 'read', 'update', 'write'];
export const SCOPES = ['self', 'branch', 'company'];

// Modules whose answer is about which rows a person may see, so they carry a scope.
export const SCOPED_MODULES = [
  'dashboard',
  'employees',
  'jobs',
  'applicants',
  'interviews',
  'roster',
  'leave',
  'attendance',
  'activity_logs'
];

// The dashboard is every position's read-only home, so no screen offers it as a configurable
// area. And in the areas a store keeps as its record, create and delete is not offered at all.
export const CONFIGURABLE_MODULES = MODULES.filter((module) => module !== 'dashboard');

export const NO_DELETE_MODULES = [
  'branches',
  'interviews',
  'interview_settings',
  'roster',
  'leave',
  'attendance',
  'templates',
  'settings',
  'activity_logs'
];

export function isConfigurable(module) {
  return module !== 'dashboard';
}

const LEVEL_RANK = { none: 0, read: 1, update: 2, write: 3 };
const SCOPE_RANK = { self: 0, branch: 1, company: 2 };

export function levelRank(level) {
  return LEVEL_RANK[level] === undefined ? -1 : LEVEL_RANK[level];
}

export function scopeRank(scope) {
  return SCOPE_RANK[scope] === undefined ? -1 : SCOPE_RANK[scope];
}

export function isScoped(module) {
  return SCOPED_MODULES.includes(module);
}

export function normalizeLevel(value) {
  if (typeof value === 'string') {
    if (LEVELS.includes(value)) return value;
    if (value === 'view') return 'read';
    if (value === 'edit') return 'update';
  }
  return 'none';
}

export function normalizeScope(value) {
  return SCOPES.includes(String(value || '')) ? String(value) : '';
}

export function normalizeCell(raw) {
  if (!raw) return { level: 'none', scope: '' };
  if (typeof raw === 'string') return { level: normalizeLevel(raw), scope: '' };
  return { level: normalizeLevel(raw.level), scope: normalizeScope(raw.scope) };
}

export function normalizeAccess(raw) {
  const out = {};
  MODULES.forEach((module) => {
    const cell = normalizeCell(raw && raw[module]);
    if (cell.level && cell.level !== 'none') out[module] = { level: cell.level, scope: cell.scope };
  });
  return out;
}

export function moduleLabelKey(module) {
  return MODULE_LABELS[module] || module;
}

export function levelLabelKey(level) {
  return `perm.level.${level || 'none'}`;
}

export function scopeLabelKey(scope) {
  return `perm.scope.${scope || 'branch'}`;
}

// Nothing wider than the ceiling a higher layer allows is offered.
export function levelOptions(ceiling) {
  return LEVELS.filter((level) => level === 'none' || levelRank(level) <= levelRank(ceiling));
}

// "Full (create and delete)" is not offered in the areas that are a store's own record.
export function moduleLevelOptions(module, ceiling) {
  return levelOptions(ceiling).filter(
    (level) => !(level === 'write' && NO_DELETE_MODULES.includes(module))
  );
}

// A cell that was saved before a rule changed is brought back inside it, so a screen never
// shows a level it no longer offers.
export function clampCell(module, cell) {
  const next = normalizeCell(cell);
  if (!next.level || next.level === 'none') return next;
  if (NO_DELETE_MODULES.includes(module) && next.level === 'write') return { ...next, level: 'update' };
  return next;
}

// An area the employer closed ("no access") is kept as it stands: it is an answer of its own,
// not an empty row, so a screen that carries the answer through never hands the area back.
export function clampAccess(access) {
  const out = {};
  Object.entries(access || {}).forEach(([module, raw]) => {
    const cell = clampCell(module, raw);
    if (cell.level) out[module] = { level: cell.level, scope: cell.scope };
  });
  return out;
}

// A branch grant is a role → area → cell map, so each role's own cells are what get clamped.
// The role keys are not areas: reading them as one would throw away everything the role holds.
export function clampRoleMatrix(matrix) {
  const out = {};
  Object.entries(matrix || {}).forEach(([roleKey, cells]) => {
    const kept = {};
    MODULES.forEach((module) => {
      const raw = cells ? cells[module] : undefined;
      const cell = clampCell(module, raw);
      if (raw !== undefined && raw !== null && cell.level) kept[module] = { level: cell.level, scope: cell.scope };
    });
    out[roleKey] = kept;
  });
  return out;
}

export function scopeOptions(ceiling) {
  return SCOPES.filter((scope) => !ceiling || scopeRank(scope) <= scopeRank(ceiling));
}

export function grantedModules(access) {
  return MODULES.filter((module) => access && access[module] && access[module].level !== 'none');
}

// The areas whose records live in one store rather than in the company at large — the same list
// the server resolves against: a preset that reaches these across the whole company belongs to
// somebody who works in every store the company runs.
export const EVERY_BRANCH_MODULES = [
  'employees',
  'jobs',
  'applicants',
  'interviews',
  'roster',
  'leave',
  'attendance'
];

export function coversEveryBranch(preset) {
  if (!preset || !preset.access) return false;
  return EVERY_BRANCH_MODULES.some((module) => {
    const cell = normalizeCell(preset.access[module]);
    return Boolean(cell.level && cell.level !== 'none' && cell.scope === 'company');
  });
}