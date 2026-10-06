import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveCaller } from '../../shared/kwAuth.ts';
import { ALL_FEATURES, ALL_MODULES, packageState, resolveLimit, today } from '../../shared/packages.ts';
import { mergePresets, presetFor, resolveAccess, resolvePresetKey } from '../../shared/access.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

function rowsOf(result) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

// What the signed-in person may see and do: the package the company paid for, the position
// preset they hold and the grant their employer saved — resolved once, here, so no screen
// has to trust its own copy of the rules or its own clock.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const isSuperAdmin = me.role === 'admin';

    // The presets in force: the platform defaults with any super admin edit on top of them.
    const stored = rowsOf(await base44.asServiceRole.entities.PositionPreset.list().catch(() => []));
    const presets = mergePresets(stored);

    const companyId = (isSuperAdmin && body.company_id) || me.company_id || '';
    const roleKey = isSuperAdmin ? 'company_admin' : me.app_role || 'staff';
    if (!companyId) {
      return Response.json({
        ok: true,
        company_id: '',
        company_name: '',
        package: '',
        assigned: false,
        modules: [],
        features: {},
        expired: false,
        role_key: roleKey,
        preset_key: isSuperAdmin ? 'manager' : 'floor_staff',
        access: {},
        presets,
        access_error: false
      });
    }

    const company = await base44.asServiceRole.entities.Company.get(companyId).catch(() => null);
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });
    if (!isSuperAdmin && company.id !== me.company_id) {
      return Response.json({ error: 'You cannot view this company' }, { status: 403 });
    }

    const state = packageState(company);
    // The package sets the ceilings; a super admin can pin this company's own numbers instead.
    const jobLimit = resolveLimit(company.job_limit_override, state.jobLimit);
    const employeeLimit = resolveLimit(company.employee_limit_override, state.employeeLimit);
    let jobLock = company.package_job_lock === true;

    // A "pay as you go" ad stops after 30 days: it closes itself and the company cannot open
    // another one until a super admin reactivates the account.
    if (state.postingDays > 0) {
      const cutoff = new Date(Date.now() - state.postingDays * DAY_MS).toISOString();
      const filter = { company_id: company.id, status: 'open', created_date: { $lt: cutoff } };
      const stale = rowsOf(await base44.asServiceRole.entities.Job.filter(filter, { limit: 100 }));
      if (stale.length > 0) {
        await base44.asServiceRole.entities.Job.updateMany(filter, { $set: { status: 'closed' } });
        jobLock = true;
        await base44.asServiceRole.entities.Company.update(company.id, { package_job_lock: true });
      }
    }

    const openJobs = await base44.asServiceRole.entities.Job.count({ company_id: company.id, status: 'open' });
    const atLimit = jobLimit !== null && openJobs >= jobLimit;
    // Employees still on the books count against the company's ceiling.
    const employeesTotal = await base44.asServiceRole.entities.EmployeeProfile.count({
      company_id: company.id,
      status: { $ne: 'inactive' }
    }).catch(() => 0);

    // Who is signed in, and which position preset that is.
    const isCompanyAdmin = isSuperAdmin || roleKey === 'company_admin';
    const customRoles = Array.isArray(company.custom_roles) ? company.custom_roles : [];
    const presetKey = resolvePresetKey({ roleKey, customRoles, isCompanyAdmin });
    const preset = presetFor(presetKey, presets);

    // The branch the workspace is working in narrows the company grant further.
    const branchId = String(body.branch_id || me.branch_id || '');
    let branch = null;
    if (branchId) {
      const found = await base44.asServiceRole.entities.Branch.get(branchId).catch(() => null);
      if (found && found.company_id === company.id) branch = found;
    }

    // A super admin runs the platform, so the company's package and grants never narrow
    // their own workspace: they keep every module and every feature. What the company
    // actually paid for is still reported below, so the package screen stays truthful.
    const access = resolveAccess({
      packageModules: isSuperAdmin ? ALL_MODULES : state.modules,
      preset,
      companyGrant: company.role_permissions && company.role_permissions[roleKey],
      branchGrant: branch && branch.role_permissions && branch.role_permissions[roleKey],
      isCompanyAdmin
    });

    return Response.json({
      ok: true,
      company_id: company.id,
      company_name: company.name || '',
      package: state.key,
      assigned: state.assigned,
      modules: state.modules,
      features: isSuperAdmin ? { ...ALL_FEATURES } : state.features,
      job_limit: jobLimit,
      package_job_limit: state.jobLimit,
      job_limit_override: company.job_limit_override ?? '',
      jobs_open: openJobs,
      employee_limit: employeeLimit,
      package_employee_limit: state.employeeLimit,
      employee_limit_override: company.employee_limit_override ?? '',
      employees_total: employeesTotal,
      job_lock: jobLock,
      posting_days: state.postingDays,
      video_interview: state.features.video_interview,
      start_date: state.startDate,
      expires_at: state.expiresOn,
      days_left: state.daysLeft,
      expired: state.expired,
      reactivated_at: company.package_reactivated_at || '',
      can_create_job: !state.expired && !jobLock && !atLimit,
      is_super_admin: isSuperAdmin,
      role_key: roleKey,
      preset_key: preset ? preset.key : '',
      access,
      presets,
      access_error: false,
      today: today()
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}