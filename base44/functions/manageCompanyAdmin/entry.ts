import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!me.company_id || me.app_role !== 'company_admin') {
      return Response.json({ error: 'Only a company admin can manage company admins' }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action === 'remove' ? 'remove' : 'add';
    const email = String(body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return Response.json({ error: 'Enter a valid email address' }, { status: 400 });
    }

    const lookup = await base44.asServiceRole.entities.Company.filter({ id: me.company_id });
    const company = lookup[0];
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });

    const members = Array.isArray(company.member_emails) ? company.member_emails : [];

    if (action === 'remove') {
      if (email === String(me.email || '').toLowerCase()) {
        return Response.json({ error: 'You cannot remove your own company admin access' }, { status: 400 });
      }
      if (members.length <= 1) {
        return Response.json({ error: 'Keep at least one company admin' }, { status: 400 });
      }
      const next = members.filter((item) => item !== email);
      await base44.asServiceRole.entities.Company.update(company.id, { member_emails: next });

      const users = await base44.asServiceRole.entities.User.filter({ email });
      for (const user of users) {
        if (user.app_role === 'company_admin') {
          await base44.asServiceRole.entities.User.update(user.id, { app_role: 'staff' });
        }
      }
      return Response.json({ ok: true, member_emails: next });
    }

    const next = members.includes(email) ? members : [...members, email];
    await base44.asServiceRole.entities.Company.update(company.id, { member_emails: next });

    const branches = await base44.asServiceRole.entities.Branch.filter({ company_id: company.id });
    const ids = branches.map((branch) => branch.id);
    const users = await base44.asServiceRole.entities.User.filter({ email });
    for (const user of users) {
      await base44.asServiceRole.entities.User.update(user.id, {
        company_id: company.id,
        app_role: 'company_admin',
        branch_id: ids[0] || null,
        branch_ids: ids
      });
    }

    // An email that has not signed up yet becomes a company admin on first login,
    // because the company member list is what syncMyProfile reads.
    let invited = false;
    if (users.length === 0) {
      try {
        await base44.asServiceRole.users.inviteUser(email, 'user');
        invited = true;
      } catch (error) {
        invited = false;
      }
    }

    return Response.json({ ok: true, member_emails: next, invited });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}