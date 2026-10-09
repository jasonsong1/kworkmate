// Pricing packages shown in the back office. The numbers here are labels only — the
// server (getPackageStatus) decides what a company may actually do.
export const PACKAGE_KEYS = ['payg', 'starter', 'growth', 'enterprise'];

export const PACKAGE_NAMES = {
  payg: 'pkg.payg',
  starter: 'pkg.starter',
  growth: 'pkg.growth',
  enterprise: 'pkg.enterprise'
};

export const MODULE_LABELS = {
  dashboard: 'nav.dashboard',
  branches: 'nav.branches',
  employees: 'nav.employees',
  jobs: 'nav.jobs',
  applicants: 'nav.applicants',
  interviews: 'nav.interviews',
  interview_settings: 'nav.interview',
  roster: 'nav.roster',
  leave: 'nav.leave',
  attendance: 'nav.attendance',
  templates: 'nav.templateDesign',
  settings: 'nav.settings'
};

const MODULE_BY_PREFIX = [
  // Everyone's own space: it belongs to the dashboard, so nobody is ever shut out of it.
  ['/my-space', 'dashboard'],
  ['/branches', 'branches'],
  ['/property', 'branches'],
  ['/employees', 'employees'],
  ['/jobs', 'jobs'],
  ['/applicants', 'applicants'],
  ['/interviews', 'interviews'],
  ['/interview-settings', 'interview_settings'],
  ['/email-templates', 'templates'],
  ['/template-design', 'templates'],
  ['/job-design', 'templates'],
  ['/qr-design', 'attendance'],
  ['/roster', 'roster'],
  ['/leave', 'leave'],
  ['/attendance', 'attendance'],
  ['/clock', 'attendance'],
  ['/settings', 'settings']
];

export function moduleForPath(pathname) {
  const match = MODULE_BY_PREFIX.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : '';
}

export function packageName(pkg, t) {
  return pkg && PACKAGE_NAMES[pkg.package] ? t(PACKAGE_NAMES[pkg.package]) : t('pkg.notAssigned');
}

export function jobLimitLabel(limit, unlimitedText) {
  return limit === null || limit === undefined ? unlimitedText : String(limit);
}

// No package assigned yet means nothing is restricted.
export function moduleAllowed(pkg, module) {
  if (!pkg || !module || !pkg.package) return true;
  return (pkg.modules || []).includes(module);
}

// A feature sits inside a module: the module can be part of the package while one part of it
// (the video interview, the voice interview, the automated roster) is not.
export function featureAllowed(pkg, feature) {
  if (!pkg || !pkg.package) return true;
  return (pkg.features || {})[feature] !== false;
}

export function videoInterviewAllowed(pkg) {
  return featureAllowed(pkg, 'video_interview');
}

export function canCreateJob(pkg) {
  return !pkg || pkg.can_create_job !== false;
}