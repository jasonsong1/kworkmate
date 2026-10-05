// The three layers of access, widest first: the package a company paid for, the position
// preset the signed-in person holds, and the grant the employer saved for that position.
// Every layer is a ceiling for the layer under it — an employer can narrow what a position
// preset allows, never widen it. The server resolves the three into one answer and every
// screen reads that answer, so a hidden button and a blocked query can never disagree.

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
  'settings'
];

export const LEVELS = ['none', 'read', 'update', 'write'];
export const SCOPES = ['self', 'branch', 'company'];
export const DEFAULT_SCOPE = 'branch';

const LEVEL_RANK = { none: 0, read: 1, update: 2, write: 3 };
const SCOPE_RANK = { self: 0, branch: 1, company: 2 };

function fullAccess() {
  const out = {};
  MODULES.forEach((module) => {
    out[module] = { level: 'write', scope: 'company' };
  });
  return out;
}

// The platform's own position presets. They live in code so a fresh install always has them;
// a super admin edit is stored as an override with the same key and wins over these.
export const PRESET_DEFAULTS = [
  {
    key: 'floor_staff',
    label_en: 'Floor staff',
    label_ko: '플로어 스태프',
    order: 1,
    access: {
      // The team schedule is readable by everyone on shift; a person still only edits
      // their own submitted availability. Leave is their own: they see and ask for it.
      roster: { level: 'read', scope: 'branch' },
      leave: { level: 'read', scope: 'self' },
      attendance: { level: 'read', scope: 'self' }
    }
  },
  {
    key: 'supervisor_floor',
    label_en: 'Supervisor (floor)',
    label_ko: '슈퍼바이저 (플로어)',
    order: 2,
    access: {
      dashboard: { level: 'read', scope: 'company' },
      employees: { level: 'read', scope: 'branch' },
      jobs: { level: 'read', scope: 'branch' },
      roster: { level: 'read', scope: 'branch' },
      leave: { level: 'read', scope: 'self' },
      attendance: { level: 'read', scope: 'self' }
    }
  },
  {
    key: 'supervisor_manager',
    label_en: 'Supervisor (manager)',
    label_ko: '슈퍼바이저 (매니저)',
    order: 3,
    access: {
      dashboard: { level: 'read', scope: 'company' },
      branches: { level: 'update', scope: 'branch' },
      employees: { level: 'update', scope: 'branch' },
      jobs: { level: 'update', scope: 'branch' },
      applicants: { level: 'read', scope: 'branch' },
      interviews: { level: 'read', scope: 'branch' },
      interview_settings: { level: 'read', scope: 'branch' },
      roster: { level: 'update', scope: 'branch' },
      leave: { level: 'update', scope: 'branch' },
      attendance: { level: 'read', scope: 'branch' },
      templates: { level: 'read', scope: 'branch' }
    }
  },
  {
    key: 'manager',
    label_en: 'Manager',
    label_ko: '매니저',
    order: 4,
    access: fullAccess()
  }
];

export const PRESET_KEYS = PRESET_DEFAULTS.map((preset) => preset.key);
export const DEFAULT_PRESET_KEY = 'floor_staff';

// The roles the platform itself ships with, and the preset each one starts on.
export const ROLE_PRESET = {
  company_admin: 'manager',
  branch_manager: 'supervisor_manager',
  staff: 'floor_staff'
};

export function normalizeLevel(value) {
  if (typeof value === 'string') {
    if (LEVELS.includes(value)) return value;
    // Company records saved before the levels existed stored "view" and "edit".
    if (value === 'view') return 'read';
    if (value === 'edit') return 'update';
  }
  return 'none';
}

export function normalizeScope(value) {
  return SCOPES.includes(String(value || '')) ? String(value) : '';
}

// A preset or a grant cell may arrive as a bare level string ("view"), as a { level, scope }
// object, or not at all.
export function normalizeCell(raw) {
  if (!raw) return { level: '', scope: '' };
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

export function normalizePreset(record) {
  return {
    key: String((record && record.key) || '').trim(),
    label: (record && record.label) || '',
    label_en: (record && record.label_en) || '',
    label_ko: (record && record.label_ko) || '',
    order: Number((record && record.order) || 10),
    access: normalizeAccess(record && record.access)
  };
}

// The presets in force: the code defaults, with any stored platform edit or extra preset on
// top of them.
export function mergePresets(stored) {
  const byKey = new Map();
  PRESET_DEFAULTS.forEach((preset) => byKey.set(preset.key, normalizePreset(preset)));
  (stored || []).forEach((record) => {
    const preset = normalizePreset(record);
    if (!preset.key) return;
    const base = byKey.get(preset.key);
    // One access name replaces the old English/Korean pair; both are kept in step so any
    // screen still reading the old fields shows the same thing.
    const label = preset.label || preset.label_en || (base ? base.label_en : '') || preset.key;
    byKey.set(preset.key, {
      key: preset.key,
      label,
      label_en: label,
      label_ko: label,
      order: base ? base.order : preset.order,
      access: preset.access
    });
  });
  return Array.from(byKey.values()).sort((a, b) => a.order - b.order);
}

export function presetFor(key, presets) {
  const list = presets || mergePresets([]);
  return list.find((preset) => preset.key === key) || list.find((preset) => preset.key === DEFAULT_PRESET_KEY) || null;
}

// Which modules the company may open at all, before positions are considered. A company
// admin always keeps the company settings screen, whatever package is assigned.
export function allowedModules(packageModules, isCompanyAdmin) {
  const set = new Set(packageModules || []);
  if (isCompanyAdmin) set.add('settings');
  return MODULES.filter((module) => set.has(module));
}

function narrowerLevel(first, second) {
  if (!second) return first;
  return LEVEL_RANK[second] <= LEVEL_RANK[first] ? second : first;
}

function narrowerScope(first, second) {
  if (!second) return first;
  return SCOPE_RANK[second] <= SCOPE_RANK[first] ? second : first;
}

// one = preset ceiling, two = company grant, three = branch grant (narrowest wins).
// A layer with no value for the module has no opinion; a layer that saved "none" means no
// access at all, and no lower layer can bring it back.
function resolveCell(ceiling, companyGrant, branchGrant) {
  let level = ceiling.level;
  let scope = ceiling.scope || DEFAULT_SCOPE;
  const layers = [companyGrant, branchGrant];
  for (const cell of layers) {
    if (!cell || !cell.level) continue;
    if (cell.level === 'none') return { level: 'none', scope };
    level = narrowerLevel(level, cell.level);
    scope = narrowerScope(scope, cell.scope);
  }
  return { level, scope };
}

// The one answer every screen and every function reads.
// - a module the package does not include is left out entirely (hidden, never locked)
// - a position preset without access to a module leaves it out as well
// - the employer grant and the branch grant can only narrow what is left
export function resolveAccess({ packageModules, preset, companyGrant, branchGrant, isCompanyAdmin }) {
  const modules = allowedModules(packageModules, isCompanyAdmin);
  const access = {};
  modules.forEach((module) => {
    if (isCompanyAdmin) {
      access[module] = { level: 'write', scope: 'company' };
      return;
    }
    const ceiling = (preset && preset.access && preset.access[module]) || null;
    if (!ceiling) return;
    const companyCell = normalizeCell(companyGrant && companyGrant[module]);
    const branchCell = normalizeCell(branchGrant && branchGrant[module]);
    const cell = resolveCell(ceiling, companyCell, branchCell);
    if (!cell.level || cell.level === 'none') return;
    access[module] = cell;
  });
  // The dashboard is a read-only home for everyone, whatever package or position they hold,
  // so it never appears in the permission tables and cannot be widened or narrowed.
  if (modules.includes('dashboard')) access.dashboard = { level: 'read', scope: 'company' };
  return access;
}

export function resolvePresetKey({ roleKey, customRoles, isCompanyAdmin }) {
  if (isCompanyAdmin) return ROLE_PRESET.company_admin;
  const builtIn = ROLE_PRESET[roleKey];
  if (builtIn && roleKey !== 'staff') return builtIn;
  const role = (customRoles || []).find((item) => item && item.key === roleKey);
  if (role && role.preset_key) return role.preset_key;
  return ROLE_PRESET[roleKey] || DEFAULT_PRESET_KEY;
}