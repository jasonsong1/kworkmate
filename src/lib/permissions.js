import { useWorkspace } from '@/lib/WorkspaceContext';

export const PERMISSION_AREAS = [
  { key: 'roster' },
  { key: 'attendance' },
  { key: 'employees' },
  { key: 'jobs' },
  { key: 'templates' },
  { key: 'branch_settings' },
  { key: 'company_settings' }
];

export const PERMISSION_LEVELS = ['none', 'view', 'edit'];

export const EDITABLE_ROLES = ['branch_manager', 'staff'];

// Company wide defaults, used until a company or branch defines something else.
export const DEFAULT_ROLE_PERMISSIONS = {
  branch_manager: {
    roster: 'edit',
    attendance: 'edit',
    employees: 'view',
    jobs: 'edit',
    templates: 'view',
    branch_settings: 'edit',
    company_settings: 'none'
  },
  staff: {
    roster: 'view',
    attendance: 'view',
    employees: 'none',
    jobs: 'none',
    templates: 'none',
    branch_settings: 'none',
    company_settings: 'none'
  }
};

const AREA_BY_PREFIX = [
  ['/roster', 'roster'],
  ['/attendance', 'attendance'],
  ['/clock', 'attendance'],
  ['/employees', 'employees'],
  ['/jobs', 'jobs'],
  ['/applicants', 'jobs'],
  ['/interviews', 'jobs'],
  ['/interview-settings', 'templates'],
  ['/email-templates', 'templates'],
  ['/branches', 'branch_settings'],
  ['/property', 'branch_settings'],
  ['/settings', 'company_settings']
];

export function areaForPath(pathname) {
  const match = AREA_BY_PREFIX.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : null;
}

export function resolvePermissions(company, branch, role) {
  const resolved = {};
  if (role === 'company_admin') {
    PERMISSION_AREAS.forEach((area) => {
      resolved[area.key] = 'edit';
    });
    return resolved;
  }
  const fallback = DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.staff;
  const companySet = (company && company.role_permissions && company.role_permissions[role]) || {};
  const branchSet = (branch && branch.role_permissions && branch.role_permissions[role]) || {};
  PERMISSION_AREAS.forEach((area) => {
    resolved[area.key] = branchSet[area.key] || companySet[area.key] || fallback[area.key] || 'none';
  });
  return resolved;
}

export function usePermissions() {
  const { company, activeBranch, role } = useWorkspace();
  const permissions = resolvePermissions(company, activeBranch, role);
  return {
    role,
    isCompanyAdmin: role === 'company_admin',
    permissions,
    level: (area) => permissions[area] || 'none',
    canView: (area) => (permissions[area] || 'none') !== 'none',
    canEdit: (area) => permissions[area] === 'edit'
  };
}