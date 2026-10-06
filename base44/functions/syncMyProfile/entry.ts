import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// The workspace an account belongs to is put together from the records the employer opened:
// the company member list, a branch manager list, or the employee profile registered against
// this email. The answer travels back with the call so the back office can enter without
// waiting for the platform session to be refreshed.
async function readWorkspace(base44, companyId) {
  const company =
    (await base44.asServiceRole.entities.Company.filter({ id: companyId }).catch(() => []))[0] || null;
  const branches = company
    ? await base44.asServiceRole.entities.Branch.filter({ company_id: company.id }).catch(() => [])
    : [];
  return { company, branches };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const email = String(me.email || '').trim().toLowerCase();

    // Only an account the employer has not linked yet is worked out here.
    if (!me.company_id) {
      const companies = await base44.asServiceRole.entities.Company.filter({ member_emails: email });
      const managed = await base44.asServiceRole.entities.Branch.filter({ manager_emails: email });
      const profiles = await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: email });

      if (companies.length > 0) {
        const company = companies[0];
        const branches = await base44.asServiceRole.entities.Branch.filter({ company_id: company.id });
        const ids = branches.map((b) => b.id);
        await base44.asServiceRole.entities.User.update(me.id, {
          company_id: company.id,
          branch_id: ids[0] || null,
          branch_ids: ids,
          app_role: 'company_admin'
        });
      } else if (managed.length > 0) {
        const ids = managed.map((b) => b.id);
        await base44.asServiceRole.entities.User.update(me.id, {
          company_id: managed[0].company_id,
          branch_id: ids[0],
          branch_ids: ids,
          app_role: 'branch_manager'
        });
      } else if (profiles.length > 0) {
        // The same address can be registered by more than one company, so the newest profile
        // is the one the account is linked to.
        const newest = profiles
          .slice()
          .sort((a, b) => String(b.created_date || '').localeCompare(String(a.created_date || '')))[0];
        const ids = [...new Set(profiles.map((p) => p.branch_id).filter(Boolean))];
        await base44.asServiceRole.entities.User.update(me.id, {
          company_id: newest.company_id,
          branch_id: newest.branch_id,
          branch_ids: ids,
          app_role: 'staff',
          position: newest.position || ''
        });
      }
    }

    const current = await base44.auth.me();
    if (!current || !current.company_id) {
      return Response.json({ ok: true, unassigned: true });
    }

    const { company, branches } = await readWorkspace(base44, current.company_id);
    return Response.json({
      ok: true,
      already: Boolean(me.company_id),
      company_id: current.company_id,
      branch_id: current.branch_id || null,
      branch_ids: current.branch_ids || [],
      app_role: current.app_role || 'staff',
      company,
      branches
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}