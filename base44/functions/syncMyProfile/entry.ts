import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (me.company_id) {
      return Response.json({ ok: true, already: true, app_role: me.app_role || 'staff', company_id: me.company_id, branch_id: me.branch_id || null });
    }

    const email = me.email;

    const companies = await base44.asServiceRole.entities.Company.filter({ member_emails: email });
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
      return Response.json({ ok: true, app_role: 'company_admin', company_id: company.id, branch_id: ids[0] || null });
    }

    const branches = await base44.asServiceRole.entities.Branch.filter({ manager_emails: email });
    if (branches.length > 0) {
      const ids = branches.map((b) => b.id);
      await base44.asServiceRole.entities.User.update(me.id, {
        company_id: branches[0].company_id,
        branch_id: ids[0],
        branch_ids: ids,
        app_role: 'branch_manager'
      });
      return Response.json({ ok: true, app_role: 'branch_manager', company_id: branches[0].company_id, branch_id: ids[0] });
    }

    const profiles = await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: email });
    if (profiles.length > 0) {
      const ids = [...new Set(profiles.map((p) => p.branch_id).filter(Boolean))];
      await base44.asServiceRole.entities.User.update(me.id, {
        company_id: profiles[0].company_id,
        branch_id: profiles[0].branch_id,
        branch_ids: ids,
        app_role: 'staff',
        position: profiles[0].position || ''
      });
      return Response.json({ ok: true, app_role: 'staff', company_id: profiles[0].company_id, branch_id: profiles[0].branch_id });
    }

    return Response.json({ ok: true, unassigned: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}