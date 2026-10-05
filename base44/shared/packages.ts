// Pricing packages: the single table every function reads when it has to judge what a
// company paid for — which modules it may open, which hiring features it unlocked, how many
// job ads it can run at once, how many employees it covers and how long its access lasts.
// The back office reads the same numbers from the server, so a screen and the rule behind
// it can never drift apart.
export const ACCESS_DAYS = 45;
export const JOB_AD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const ALL_MODULES = [
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

// Features sit inside a module: the module stays, one part of it is not part of the package.
export const FEATURE_KEYS = [
  'mini_interview',
  'video_interview',
  'voice_interview',
  'onboarding',
  'auto_roster',
  'multi_branch',
  'branch_isolation',
  'unified_dashboard'
];

const NO_FEATURES = {
  mini_interview: false,
  video_interview: false,
  voice_interview: false,
  onboarding: false,
  auto_roster: false,
  multi_branch: false,
  branch_isolation: false,
  unified_dashboard: false
};

export const ALL_FEATURES = {
  mini_interview: true,
  video_interview: true,
  voice_interview: true,
  onboarding: true,
  auto_roster: true,
  multi_branch: true,
  branch_isolation: true,
  unified_dashboard: true
};

// jobLimit / employeeLimit null means no limit. postingDays 0 means an ad never expires by itself.
export const PACKAGES = {
  payg: {
    jobLimit: 1,
    employeeLimit: 2,
    postingDays: JOB_AD_DAYS,
    modules: ['dashboard', 'jobs', 'applicants', 'interviews', 'templates', 'settings'],
    features: { ...NO_FEATURES }
  },
  starter: {
    jobLimit: 2,
    employeeLimit: 5,
    postingDays: 0,
    modules: ALL_MODULES,
    features: { ...NO_FEATURES, mini_interview: true, onboarding: true, auto_roster: true }
  },
  growth: {
    jobLimit: 6,
    employeeLimit: 15,
    postingDays: 0,
    modules: ALL_MODULES,
    features: {
      ...NO_FEATURES,
      mini_interview: true,
      video_interview: true,
      voice_interview: true,
      onboarding: true,
      auto_roster: true
    }
  },
  enterprise: {
    jobLimit: null,
    employeeLimit: null,
    postingDays: 0,
    modules: ALL_MODULES,
    features: { ...ALL_FEATURES }
  }
};

export const PACKAGE_KEYS = Object.keys(PACKAGES);

export function normalizePackage(value) {
  const key = String(value || '').trim().toLowerCase();
  return PACKAGE_KEYS.includes(key) ? key : '';
}

// A super admin can pin a company's own ceiling instead of the package default: an empty
// value keeps the package default, 0 lifts the ceiling altogether, anything higher is the cap.
export function resolveLimit(override, fallback) {
  if (override === null || override === undefined || override === '') return fallback;
  const value = Number(override);
  if (!Number.isFinite(value)) return fallback;
  return value <= 0 ? null : value;
}

// A date the platform stores as YYYY-MM-DD, or '' when the value is not one.
export function isDay(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

function dayStart(value) {
  const text = isDay(value);
  return text ? Date.parse(`${text}T00:00:00Z`) : NaN;
}

function dayIso(time) {
  return new Date(time).toISOString().slice(0, 10);
}

// Access runs for ACCESS_DAYS days, counting the start date as day one; the morning after
// the last day every back office screen closes.
export function packageState(company, now = Date.now()) {
  const key = normalizePackage(company && company.package);
  if (!key) {
    return {
      key: '',
      assigned: false,
      modules: ALL_MODULES,
      features: { ...ALL_FEATURES },
      jobLimit: null,
      employeeLimit: null,
      postingDays: 0,
      startDate: '',
      expiresOn: '',
      daysLeft: null,
      expired: false
    };
  }

  const meta = PACKAGES[key];
  const startDate = isDay(company.package_start_date) || today();
  const from = dayStart(startDate);
  const lastDay = from + (ACCESS_DAYS - 1) * DAY_MS;
  const closesAt = from + ACCESS_DAYS * DAY_MS;
  const expired = now >= closesAt;

  return {
    key,
    assigned: true,
    modules: meta.modules,
    features: { ...meta.features },
    jobLimit: meta.jobLimit,
    employeeLimit: meta.employeeLimit,
    postingDays: meta.postingDays,
    startDate: dayIso(from),
    expiresOn: dayIso(lastDay),
    daysLeft: expired ? 0 : Math.max(0, Math.ceil((closesAt - now) / DAY_MS)),
    expired
  };
}