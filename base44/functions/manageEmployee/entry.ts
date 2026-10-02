import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { formatEmployeeNumber, randomToken } from '../../shared/util.ts';
import { sendEmail, brandedEmail, portalLink } from '../../shared/email.ts';

async function inviteUser(base44, email) {
  try {
    await base44.asServiceRole.users.inviteUser(email, 'user');
    return { invited: true };
  } catch (error) {
    return { invited: false, invite_error: error && error.message };
  }
}

// Applies a role chosen by a company admin to the person's app user record.
async function applyRole(base44, company, branch, email, roleKey) {
  const users = await base44.asServiceRole.entities.User.filter({ email });
  for (const user of users) {
    const ids = Array.isArray(user.branch_ids) ? user.branch_ids : [];
    const patch = { company_id: branch.company_id, app_role: roleKey };
    if (roleKey !== 'company_admin') {
      patch.branch_id = branch.id;
      patch.branch_ids = ids.includes(branch.id) ? ids : [...ids, branch.id];
    }
    await base44.asServiceRole.entities.User.update(user.id, patch);
  }
  // Company admins manage the company itself, so they join the company member list.
  if (roleKey === 'company_admin' && company) {
    const members = Array.isArray(company.member_emails) ? company.member_emails : [];
    if (!members.includes(email)) {
      await base44.asServiceRole.entities.Company.update(company.id, {
        member_emails: [...members, email]
      });
    }
  }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const action = body.action || 'create';

    if (action === 'assign_manager') {
      if (!me.company_id || me.app_role !== 'company_admin') {
        return Response.json({ error: 'Only a company admin can assign managers' }, { status: 403 });
      }
      const branch = await base44.asServiceRole.entities.Branch.get(body.branch_id);
      if (!branch || branch.company_id !== me.company_id) {
        return Response.json({ error: 'Branch not found' }, { status: 404 });
      }
      const emails = Array.isArray(branch.manager_emails) ? branch.manager_emails : [];
      const target = String(body.email || '').trim().toLowerCase();
      if (!target) return Response.json({ error: 'Email is required' }, { status: 400 });
      const next = emails.includes(target) ? emails : [...emails, target];
      await base44.asServiceRole.entities.Branch.update(branch.id, { manager_emails: next });

      // A company owner keeps full access even when they also manage a store.
      const companies = await base44.asServiceRole.entities.Company.filter({ id: branch.company_id });
      const isCompanyAdmin =
        companies.length > 0 && (companies[0].member_emails || []).includes(target);

      const users = await base44.asServiceRole.entities.User.filter({ email: target });
      for (const u of users) {
        const ids = Array.isArray(u.branch_ids) ? u.branch_ids : [];
        const patch = {
          company_id: branch.company_id,
          branch_id: branch.id,
          branch_ids: ids.includes(branch.id) ? ids : [...ids, branch.id]
        };
        if (!isCompanyAdmin) patch.app_role = 'branch_manager';
        await base44.asServiceRole.entities.User.update(u.id, patch);
      }
      const invite = users.length === 0 ? await inviteUser(base44, target) : { invited: false };
      return Response.json({ ok: true, manager_emails: next, ...invite });
    }

    if (action === 'remove_manager') {
      if (!me.company_id || me.app_role !== 'company_admin') {
        return Response.json({ error: 'Only a company admin can remove managers' }, { status: 403 });
      }
      const branch = await base44.asServiceRole.entities.Branch.get(body.branch_id);
      if (!branch || branch.company_id !== me.company_id) {
        return Response.json({ error: 'Branch not found' }, { status: 404 });
      }
      const target = String(body.email || '').trim().toLowerCase();
      if (!target) return Response.json({ error: 'Email is required' }, { status: 400 });

      const emails = Array.isArray(branch.manager_emails) ? branch.manager_emails : [];
      await base44.asServiceRole.entities.Branch.update(branch.id, {
        manager_emails: emails.filter((email) => email !== target)
      });

      // Only drop this branch from the person's access when it was their last manager assignment
      // and they are not a company level admin.
      const companies = await base44.asServiceRole.entities.Company.filter({ id: branch.company_id });
      const isCompanyAdmin =
        companies.length > 0 && (companies[0].member_emails || []).includes(target);
      const otherBranches = await base44.asServiceRole.entities.Branch.filter({
        company_id: branch.company_id,
        manager_emails: target
      });
      const stillManages = otherBranches.some((item) => item.id !== branch.id);

      if (!isCompanyAdmin && !stillManages) {
        const users = await base44.asServiceRole.entities.User.filter({ email: target });
        for (const u of users) {
          if (u.app_role !== 'branch_manager') continue;
          const ids = (Array.isArray(u.branch_ids) ? u.branch_ids : []).filter((id) => id !== branch.id);
          await base44.asServiceRole.entities.User.update(u.id, {
            branch_ids: ids,
            branch_id: ids[0] || null,
            app_role: 'staff'
          });
        }
      }
      return Response.json({ ok: true });
    }

    if (!me.company_id || !me.branch_ids || me.branch_ids.length === 0) {
      return Response.json({ error: 'Your account is not linked to a company yet' }, { status: 403 });
    }

    const input = body.employee || {};
    const branch = await base44.asServiceRole.entities.Branch.get(body.branch_id || input.branch_id);
    if (!branch || branch.company_id !== me.company_id || !me.branch_ids.includes(branch.id)) {
      return Response.json({ error: 'You cannot manage this branch' }, { status: 403 });
    }

    const companyLookup = await base44.asServiceRole.entities.Company.filter({ id: me.company_id });
    const company = companyLookup[0] || null;
    const allowedRoles = [
      'staff',
      'branch_manager',
      ...(((company && company.custom_roles) || []).map((role) => role.key))
    ];
    // Only a company admin may hand out a role, and company admins are managed in company settings.
    const roleKey =
      me.app_role === 'company_admin' && allowedRoles.includes(input.app_role) ? input.app_role : null;

    if (action === 'update') {
      const profile = await base44.asServiceRole.entities.EmployeeProfile.get(input.id);
      if (!profile || profile.company_id !== me.company_id) {
        return Response.json({ error: 'Employee not found' }, { status: 404 });
      }
      const updated = await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
        full_name: input.full_name || profile.full_name,
        position: input.position || '',
        hourly_rate: Number(input.hourly_rate) || 0,
        employment_type: input.employment_type || profile.employment_type,
        status: input.status || profile.status,
        phone: input.phone || '',
        start_date: input.start_date || '',
        emergency_contact_name: input.emergency_contact_name || '',
        emergency_contact_phone: input.emergency_contact_phone || '',
        app_role: roleKey || profile.app_role || 'staff'
      });

      if (roleKey) await applyRole(base44, company, branch, profile.user_email, roleKey);

      if (input.send_onboarding_email && updated.onboarding_token) {
        const link = portalLink(body.origin, `/onboarding/${updated.onboarding_token}`);
        await sendEmail(base44, {
          to: updated.user_email,
          subject: `Complete your onboarding — ${branch.name}`,
          html: brandedEmail({
            heading: `Hi ${updated.full_name}, please finish your onboarding`,
            brandColor: branch.brand_color,
            lines: [
              `Your employee number is <b>${updated.employee_number}</b>.`,
              'Please complete your tax file number declaration, superannuation choice and bank details. It takes about 3 minutes.'
            ],
            ctaText: 'Start onboarding',
            ctaUrl: link,
            footer: `${branch.name} · K-Workmate`
          })
        });
      }

      return Response.json({ ok: true, employee: updated });
    }

    const email = String(input.user_email || '').trim().toLowerCase();
    if (!email) return Response.json({ error: 'Email is required' }, { status: 400 });

    const dupe = await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: email, company_id: me.company_id });
    if (dupe.length > 0) {
      return Response.json({ error: 'This person is already an employee' }, { status: 400 });
    }

    const nextNumber = Number(branch.employee_next_number) || 1;
    const employeeNumber = formatEmployeeNumber(branch.employee_prefix, branch.employee_number_padding, nextNumber);
    const token = randomToken(24);

    const profile = await base44.asServiceRole.entities.EmployeeProfile.create({
      company_id: me.company_id,
      branch_id: branch.id,
      user_email: email,
      full_name: input.full_name || email,
      employee_number: employeeNumber,
      position: input.position || '',
      hourly_rate: Number(input.hourly_rate) || 0,
      employment_type: input.employment_type || 'casual',
      status: 'active',
      start_date: input.start_date || new Date().toISOString().slice(0, 10),
      phone: input.phone || '',
      emergency_contact_name: input.emergency_contact_name || '',
      emergency_contact_phone: input.emergency_contact_phone || '',
      onboarding_status: 'pending',
      onboarding_token: token,
      app_role: roleKey || 'staff',
      docs: []
    });

    await base44.asServiceRole.entities.Branch.update(branch.id, { employee_next_number: nextNumber + 1 });

    if (roleKey) await applyRole(base44, company, branch, email, roleKey);

    let invite = { invited: false };
    if (input.send_invite !== false) invite = await inviteUser(base44, email);

    if (input.send_onboarding_email) {
      const link = portalLink(body.origin, `/onboarding/${token}`);
      await sendEmail(base44, {
        to: email,
        subject: `Welcome to ${branch.name} — complete your onboarding`,
        html: brandedEmail({
          heading: `Welcome aboard, ${input.full_name || 'team member'}!`,
          brandColor: branch.brand_color,
          lines: [
            `You have been added to <b>${branch.name}</b>. Your employee number is <b>${employeeNumber}</b>.`,
            'Please complete your TFN declaration, superannuation choice and bank details. It takes about 3 minutes.'
          ],
          ctaText: 'Start onboarding',
          ctaUrl: link,
          footer: `${branch.name} · K-Workmate`
        })
      });
    }

    return Response.json({ ok: true, employee: profile, employee_number: employeeNumber, ...invite });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}