import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  const [me, setMe] = useState(null);
  const [company, setCompany] = useState(null);
  const [branches, setBranches] = useState([]);
  const [employeeProfile, setEmployeeProfile] = useState(null);
  const [activeBranchId, setActiveBranchId] = useState('');
  const [loading, setLoading] = useState(true);

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

      const allowed =
        superAdmin || user.app_role === 'company_admin'
          ? allBranches
          : allBranches.filter((b) => (user.branch_ids || []).includes(b.id));
      setBranches(allowed);

      const stored = localStorage.getItem('bh_branch');
      const pick =
        allowed.find((b) => b.id === stored) ||
        allowed.find((b) => b.id === user.branch_id) ||
        allowed[0];
      setActiveBranchId(pick ? pick.id : '');
    } else {
      setCompany(null);
      setBranches([]);
      setActiveBranchId('');
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
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patchBranch = useCallback((id, data) => {
    setBranches((prev) => prev.map((b) => (b.id === id ? { ...b, ...data } : b)));
  }, []);

  const patchCompany = useCallback((data) => {
    setCompany((prev) => (prev ? { ...prev, ...data } : prev));
  }, []);

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
  };

  const activeBranch = branches.find((b) => b.id === activeBranchId) || null;
  // The app owner (platform admin) can enter any company; everyone else only sees their own.
  const isPlatformAdmin = Boolean(me && me.role === 'admin');
  // A super admin always acts as the company admin of the company they are in, whatever
  // app role happens to be stored on their account.
  const role = isPlatformAdmin ? 'company_admin' : (me && me.app_role) || 'staff';
  const isManager = role === 'company_admin' || role === 'branch_manager';

  return (
    <WorkspaceContext.Provider
      value={{
        me,
        company,
        branches,
        role,
        isManager,
        isPlatformAdmin,
        employeeProfile,
        activeBranch,
        activeBranchId,
        selectBranch,
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
      employeeProfile: null,
      activeBranch: null,
      activeBranchId: '',
      selectBranch: () => {},
      switchCompany: () => {},
      refreshWorkspace: () => {},
      loading: true,
      reload: () => {},
      patchBranch: () => {},
      patchCompany: () => {}
    }
  );
}