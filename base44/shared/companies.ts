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