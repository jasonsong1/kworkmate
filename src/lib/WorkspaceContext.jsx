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

// 배열 형태를 100% 보장하는 안전 변환 함수
function toArray(val) {
  if (Array.isArray(val)) return val;
  if (val && Array.isArray(val.items)) return val.items;
  return [];
}

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
            presets: toArray(data.presets),
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

    let linked = null;
    if (user) linked = await link();

    setMe(user);

    const superAdmin = Boolean(
      user && (
        user.role === 'admin' ||
        user.app_role === 'super_admin' ||
        (user.email && String(user.email).trim().toLowerCase() === 'sym910403@gmail.com')
      )
    );

    // 슈퍼어드민 계정에 회사가 지정되어 있지 않을 경우 시스템의 첫 번째 회사를 자동 연결합니다.
    let effectiveCompanyId = user ? user.company_id : '';
    if (user && superAdmin && !effectiveCompanyId) {
      const allCompsRaw = await base44.entities.Company.filter({}).catch(() => []);
      const allComps = toArray(allCompsRaw);
      if (allComps.length > 0) {
        effectiveCompanyId = allComps[0].id;
        user.company_id = effectiveCompanyId;
      }
    }

    if (user && effectiveCompanyId) {
      let [companiesRaw, allBranchesRaw] = await Promise.all([
        base44.entities.Company.filter({ id: effectiveCompanyId }).catch(() => []),
        base44.entities.Branch.filter({ company_id: effectiveCompanyId }).catch(() => [])
      ]);
      let companies = toArray(companiesRaw);
      let allBranches = toArray(allBranchesRaw);

      if (companies.length === 0) {
        if (!linked) linked = await link();
        if (linked && linked.company_id === effectiveCompanyId) {
          companies = linked.company ? [linked.company] : [];
          allBranches = toArray(linked.branches);
        }
      }
      setCompany(companies[0] || null);

      const isCompanyAdmin = superAdmin || user.app_role === 'company_admin';
      const userBranchIds = Array.isArray(user.branch_ids) ? user.branch_ids : [];
      const allowed = isCompanyAdmin
        ? allBranches
        : allBranches.filter((b) => userBranchIds.includes(b.id));

      const safeAllowed = toArray(allowed);
      setBranches(isCompanyAdmin ? safeAllowed : safeAllowed.filter((b) => b.is_active !== false));

      const stored = localStorage.getItem('bh_branch');
      const pick =
        safeAllowed.find((b) => b.id === stored && b.is_active !== false) ||
        safeAllowed.find((b) => b.id === user.branch_id && b.is_active !== false) ||
        safeAllowed.find((b) => b.is_active !== false) ||
        safeAllowed[0];
      const pickedId = pick ? pick.id : '';
      setActiveBranchId(pickedId);

      await loadPackageStatus(pickedId);
    } else {
      setCompany(null);
      setBranches([]);
      setActiveBranchId('');
      await loadPackageStatus('');
    }

    if (user && !superAdmin) {
      // [보안 패치]: 로그인한 계정의 고유 프로필 ID(user.id)를 최우선으로 일치시키고,
      // 없을 경우 현재 회사(effectiveCompanyId)와 이메일이 일치하는 프로필을 특정합니다.
      let profile = null;
      if (user.id) {
        const byId = await base44.entities.EmployeeProfile.filter({ id: user.id }).catch(() => []);
        const byIdList = toArray(byId);
        if (byIdList.length > 0) profile = byIdList[0];
      }
      if (!profile && effectiveCompanyId) {
        const byComp = await base44.entities.EmployeeProfile.filter({ user_email: user.email, company_id: effectiveCompanyId }, { sort: '-created_date' }).catch(() => []);
        const byCompList = toArray(byComp);
        if (byCompList.length > 0) profile = byCompList[0];
      }
      if (!profile) {
        const profilesRaw = await base44.entities.EmployeeProfile.filter({ user_email: user.email }, { sort: '-created_date' }).catch(() => []);
        const profiles = toArray(profilesRaw);
        profile = profiles[0] || null;
      }
      setEmployeeProfile(profile);
    } else {
      setEmployeeProfile(null);
    }

    setLoading(false);
  }, [loadPackageStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const patchBranch = useCallback((id, data) => {
    setBranches((prev) => toArray(prev).map((b) => (b.id === id ? { ...b, ...data } : b)));
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
    reloadPackage(id);
  };

  const safeBranches = toArray(branches);
  const activeBranch = safeBranches.find((b) => b.id === activeBranchId) || null;

  // 최고 관리자(슈퍼어드민): sym910403@gmail.com 또는 role이 admin인 계정
  const isPlatformAdmin = Boolean(
    me && (
      me.role === 'admin' ||
      me.app_role === 'super_admin' ||
      String(me.email || '').trim().toLowerCase() === 'sym910403@gmail.com'
    )
  );

  const role = isPlatformAdmin ? 'company_admin' : (me && me.app_role) || 'staff';
  const presetsList = toArray(permissions.presets);
  const preset = presetsList.find((item) => item.key === permissions.presetKey) || null;

  const isManager =
    isPlatformAdmin ||
    role === 'company_admin' ||
    role === 'branch_manager' ||
    ['manager', 'supervisor_manager'].includes(permissions.presetKey) ||
    coversEveryBranch(preset);
  const isCompanyAdmin = isPlatformAdmin || role === 'company_admin';
  const access = permissions.access;

  const hasModule = (module) => (isPlatformAdmin ? true : access ? Boolean(access[module] && access[module].level !== 'none') : true);
  const levelOf = (module) => (isPlatformAdmin ? 'write' : access && access[module] ? access[module].level : 'none');
  const scopeOf = (module) => (isPlatformAdmin ? 'company' : access && access[module] ? access[module].scope : '');
  const feature = (name) => (isPlatformAdmin ? true : !pkg || !pkg.package ? true : (permissions.features || {})[name] !== false);

  return (
    <WorkspaceContext.Provider
      value={{
        me,
        company,
        branches: safeBranches,
        role,
        isManager,
        isPlatformAdmin,
        isCompanyAdmin,
        employeeProfile,
        activeBranch,
        activeBranchId,
        pkg,
        access,
        presets: presetsList,
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