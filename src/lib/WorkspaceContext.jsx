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

    if (user && user.company_id) {
      const [companies, allBranches] = await Promise.all([
        base44.entities.Company.filter({ id: user.company_id }).catch(() => []),
        base44.entities.Branch.filter({ company_id: user.company_id }).catch(() => [])
      ]);
      setCompany(companies[0] || null);

      const allowed =
        user.app_role === 'company_admin'
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

    if (user && user.app_role === 'staff') {
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

  const selectBranch = (id) => {
    setActiveBranchId(id);
    localStorage.setItem('bh_branch', id);
  };

  const activeBranch = branches.find((b) => b.id === activeBranchId) || null;
  const role = (me && me.app_role) || (me && me.role === 'admin' ? 'company_admin' : 'staff');
  const isManager = role === 'company_admin' || role === 'branch_manager';

  return (
    <WorkspaceContext.Provider
      value={{
        me,
        company,
        branches,
        role,
        isManager,
        employeeProfile,
        activeBranch,
        activeBranchId,
        selectBranch,
        loading,
        reload: load
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
      employeeProfile: null,
      activeBranch: null,
      activeBranchId: '',
      selectBranch: () => {},
      loading: true,
      reload: () => {}
    }
  );
}