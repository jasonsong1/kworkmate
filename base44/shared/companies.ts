import { coversEveryBranch, mergePresets, presetFor, primaryPositionOf, resolvePresetKey } from './access.ts';

// Points the signed-in platform admin at one company: every back office screen and
// backend function reads company_id / branch_ids from the user record, so this is all
// that is needed to "enter" a company.
export async function switchUserToCompany(base44, userId, company) {
  const branches = await base44.asServiceRole.entities.Branch.filter({ company_id: company.id });
  const ids = branches.map((branch) => branch.id);
  await base44.asServiceRole.entities.User.update(userId, {
    company_id: company.id,
    branch_id: ids[0] || null,
    branch_ids: ids,
    app_role: 'company_admin'
  });
  return { branch_ids: ids };
}

function rowsOf(result) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

// The stores a person's position reaches. A preset that runs the company's crew areas across the
// whole company — the Pro Director of a group, say — works in every store the company runs, so
// their sign-in is not left on the one store their own record names.
export async function companyBranchIds(base44, profile) {
  if (!profile || !profile.company_id) return [];
  const company = await base44.asServiceRole.entities.Company.get(profile.company_id).catch(() => null);
  if (!company) return [];
  const roleKey = String(profile.app_role || 'staff');
  const stored = rowsOf(await base44.asServiceRole.entities.PositionPreset.list().catch(() => []));
  const preset = presetFor(
    resolvePresetKey({
      roleKey,
      customRoles: Array.isArray(company.custom_roles) ? company.custom_roles : [],
      isCompanyAdmin: roleKey === 'company_admin',
      positions: primaryPositionOf(profile)
    }),
    mergePresets(stored)
  );
  if (!coversEveryBranch(preset)) return [];
  const branches = rowsOf(
    await base44.asServiceRole.entities.Branch.filter({ company_id: company.id }).catch(() => [])
  );
  return branches.filter((branch) => branch.is_active !== false).map((branch) => branch.id);
}