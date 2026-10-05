import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

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

    if (user && !user.company_id) {
      await base44.functions.invoke('syncMyProfile', {}).catch(() => null);
      user = await base44.auth.me().catch(() => null);
    }

    setMe(user);

    const superAdmin = Boolean(user && user.role === 'admin');

    if (user && user.company_id) {
      const [companies, allBranches] = await Promise.all([
        base44.entities.Company.filter({ id: user.company_id }).catch(() => []),
        base44.entities.Branch.filter({ company_id: user.company_id }).catch(() => [])
      ]);
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

    // Everyone who is not a manager is an employee: staff and every company-defined position.
    const appRole = user ? (superAdmin ? 'company_admin' : user.app_role || 'staff') : '';
    if (user && appRole !== 'company_admin' && appRole !== 'branch_manager') {
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
  const isManager = role === 'company_admin' || role === 'branch_manager';
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