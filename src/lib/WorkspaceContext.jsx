import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { coversEveryBranch } from '@/lib/access';

const WorkspaceContext = createContext(null);

// Nothing is hidden until the server has said what this person may see.
const EMPTY_PERMISSIONS = {
  access: null,
  presets: [],
  presetKey: '',
  roleKey: '',
  features: {},
  accessError: false
};

export function WorkspaceProvider({ children }) {
  const [me, setMe] = useState(null);
  const [company, setCompany] = useState(null);
  const [branches, setBranches] = useState([]);
  const [employeeProfile, setEmployeeProfile] = useState(null);
  const [activeBranchId, setActiveBranchId] = useState('');
  const [pkg, setPkg] = useState(null);
  const [permissions, setPermissions] = useState(EMPTY_PERMISSIONS);
  const [loading, setLoading] = useState(true);

  const loadPackageStatus = useCallback(async (branchId) => {
    const status = await base44.functions.invoke('getPackageStatus', { branch_id: branchId || '' }).catch(() => null);
    const data = status && status.data && !status.data.error ? status.data : null;
    setPkg(data);
    setPermissions(
      data
        ? {
            access: data.access || null,
            presets: data.presets || [],
            presetKey: data.preset_key || '',
            roleKey: data.role_key || '',
            features: data.features || {},
            accessError: false
          }
        : { ...EMPTY_PERMISSIONS, accessError: true }
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let user = await base44.auth.me().catch(() => null);

    // The employer's records decide which company and branches an account belongs to, so a
    // first sign-in has the answer worked out on the server and carried back with the call.
    const link = async () => {
      const response = await base44.functions.invoke('syncMyProfile', {}).catch(() => null);
      const data = response && response.data && !response.data.error ? response.data : null;
      const fresh = await base44.auth.me().catch(() => null);
      // The server has just worked the workspace out from the employer's records, so its answer
      // fills in whatever the sign-in still reports from an earlier visit: a session opened before
      // the account was linked carries no company at all, and a position the employer changed
      // since then carries another set of branches.
      user =
        fresh && data && data.company_id
          ? {
              ...fresh,
              company_id: fresh.company_id || data.company_id,
              branch_id: fresh.branch_id || data.branch_id,
              branch_ids: data.branch_ids && data.branch_ids.length ? data.branch_ids : fresh.branch_ids || [],
              app_role: fresh.app_role || data.app_role || 'staff'
            }
          : fresh;
      return data;
    };

    // The employer's records decide which company and branches this account belongs to, and a
    // position they changed after the account was linked has to reach this screen too, so the
    // answer is worked out again on every visit rather than left from the first sign-in.
    let linked = null;
    if (user) linked = await link();

    setMe(user);

    const superAdmin = Boolean(user && user.role === 'admin');

    if (user && user.company_id) {
      let [companies, allBranches] = await Promise.all([
        base44.entities.Company.filter({ id: user.company_id }).catch(() => []),
        base44.entities.Branch.filter({ company_id: user.company_id }).catch(() => [])
      ]);
      // The tenant the account belongs to is read once more on the server when the direct read
      // comes back empty, so a linked employee is never shut out of their own workspace.
      if (companies.length === 0) {
        if (!linked) linked = await link();
        if (linked && linked.company_id === user.company_id) {
          companies = linked.company ? [linked.company] : [];
          allBranches = linked.branches || [];
        }
      }
      setCompany(companies[0] || null);

      const isCompanyAdmin = superAdmin || user.app_role === 'company_admin';
      const allowed = isCompanyAdmin
        ? allBranches
        : allBranches.filter((b) => (user.branch_ids || []).includes(b.id));
      // A deactivated branch disappears for its own staff and managers; a company admin still
      // sees it so it can be brought back.
      setBranches(isCompanyAdmin ? allowed : allowed.filter((b) => b.is_active !== false));

      const stored = localStorage.getItem('bh_branch');
      const pick =
        allowed.find((b) => b.id === stored && b.is_active !== false) ||
        allowed.find((b) => b.id === user.branch_id && b.is_active !== false) ||
        allowed.find((b) => b.is_active !== false) ||
        allowed[0];
      const pickedId = pick ? pick.id : '';
      setActiveBranchId(pickedId);

      // The package, the position preset and the employer grant, resolved together: which
      // modules this workspace may open and how far inside them it may go.
      await loadPackageStatus(pickedId);
    } else {
      setCompany(null);
      setBranches([]);
      setActiveBranchId('');
      await loadPackageStatus('');
    }

    // Everyone's own staff record. A manager works shifts too, so their own space shows the same
    // record the crew's does — only the platform admin, who belongs to no store, has none.
    if (user && !superAdmin) {
      const profiles = await base44.entities.EmployeeProfile.filter({ user_email: user.email }).catch(() => []);
      setEmployeeProfile(profiles[0] || null);
    } else {
      setEmployeeProfile(null);
    }

    setLoading(false);
  }, [loadPackageStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const patchBranch = useCallback((id, data) => {
    setBranches((prev) => prev.map((b) => (b.id === id ? { ...b, ...data } : b)));
  }, []);

  const patchCompany = useCallback((data) => {
    setCompany((prev) => (prev ? { ...prev, ...data } : prev));
  }, []);

  const reloadPackage = useCallback(
    async (branchId) => {
      const pick = branchId || activeBranchId || '';
      await loadPackageStatus(pick);
    },
    [activeBranchId, loadPackageStatus]
  );

  // Entering another company changes which branches the user can see, so start from a clean workspace.
  const refreshWorkspace = useCallback(async () => {
    localStorage.removeItem('bh_branch');
    await load();
  }, [load]);

  const switchCompany = useCallback(
    async (companyId) => {
      const response = await base44.functions.invoke('switchCompany', { company_id: companyId });
      if (response.data && response.data.error) throw new Error(response.data.error);
      await refreshWorkspace();
    },
    [refreshWorkspace]
  );

  const selectBranch = (id) => {
    setActiveBranchId(id);
    localStorage.setItem('bh_branch', id);
    // A branch can narrow what the company granted, so the answer is asked again.
    reloadPackage(id);
  };

  const activeBranch = branches.find((b) => b.id === activeBranchId) || null;
  // The app owner (platform admin) can enter any company; everyone else only sees their own.
  const isPlatformAdmin = Boolean(me && me.role === 'admin');
  // A super admin always acts as the company admin of the company they are in, whatever
  // app role happens to be stored on their account.
  const role = isPlatformAdmin ? 'company_admin' : (me && me.app_role) || 'staff';
  // A manager is one of the two roles the platform ships with, or whatever position the company
  // itself put on a manager preset: an employer who promotes somebody to a manager position
  // expects the manager screens, whatever role key sits behind that position.
  const preset = (permissions.presets || []).find((item) => item.key === permissions.presetKey) || null;
  const isManager =
    role === 'company_admin' ||
    role === 'branch_manager' ||
    ['manager', 'supervisor_manager'].includes(permissions.presetKey) ||
    // A position whose preset runs the company's crew areas across every store works in the back
    // office, whatever the key of the platform preset behind it.
    coversEveryBranch(preset);
  const isCompanyAdmin = role === 'company_admin';
  const access = permissions.access;

  // With no answer from the server nothing is hidden — the back office says so and offers a retry.
  const hasModule = (module) => (access ? Boolean(access[module]) : true);
  const levelOf = (module) => (access && access[module] ? access[module].level : 'none');
  const scopeOf = (module) => (access && access[module] ? access[module].scope : '');
  const feature = (name) =>
    !pkg || !pkg.package ? true : (permissions.features || {})[name] !== false;

  return (
    <WorkspaceContext.Provider
      value={{
        me,
        company,
        branches,
        role,
        isManager,
        isPlatformAdmin,
        isCompanyAdmin,
        employeeProfile,
        activeBranch,
        activeBranchId,
        pkg,
        access,
        presets: permissions.presets,
        presetKey: permissions.presetKey,
        roleKey: permissions.roleKey,
        features: permissions.features,
        accessError: permissions.accessError,
        hasModule,
        levelOf,
        scopeOf,
        feature,
        selectBranch,
        reloadPackage,
        switchCompany,
        refreshWorkspace,
        loading,
        reload: load,
        patchBranch,
        patchCompany
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return (
    useContext(WorkspaceContext) || {
      me: null,
      company: null,
      branches: [],
      role: 'staff',
      isManager: false,
      isPlatformAdmin: false,
      isCompanyAdmin: false,
      employeeProfile: null,
      activeBranch: null,
      activeBranchId: '',
      pkg: null,
      access: null,
      presets: [],
      presetKey: '',
      roleKey: '',
      features: {},
      accessError: false,
      hasModule: () => true,
      levelOf: () => 'none',
      scopeOf: () => '',
      feature: () => true,
      selectBranch: () => {},
      reloadPackage: async () => {},
      switchCompany: () => {},
      refreshWorkspace: () => {},
      loading: true,
      reload: () => {},
      patchBranch: () => {},
      patchCompany: () => {}
    }
  );
}