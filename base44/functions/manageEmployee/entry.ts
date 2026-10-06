import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { formatEmployeeNumber, randomToken } from '../../shared/util.ts';
import { hashPin, isValidPin, newPinSalt } from '../../shared/pin.ts';
import { sendEmail, brandedEmail, portalLink } from '../../shared/email.ts';
import { sendAccountAccessEmail, releaseAppAccess } from '../../shared/account.ts';
import { employeeLanguage, onboardingMail, onboardingReminderMail } from '../../shared/employeeMail.ts';
import { packageState, resolveLimit } from '../../shared/packages.ts';

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
      // A brand new address is invited; one the platform already knows walks back in through
      // the manager records just written and needs no invitation.
      const access =
        users.length === 0
          ? await sendAccountAccessEmail(base44, target)
          : { invited: false, existing: true, password_email_sent: false, email_error: null };
      return Response.json({ ok: true, manager_emails: next, ...access });
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

    // Taking the employee off the books is what closes the app for them: the workspace is
    // dropped from their account while the platform keeps their sign-in, so the same email
    // registered again is linked once more on the next sign-in.
    if (action === 'delete') {
      const profile = await base44.asServiceRole.entities.EmployeeProfile.get(body.employee_id).catch(() => null);
      if (!profile || profile.company_id !== me.company_id) {
        return Response.json({ error: 'Employee not found' }, { status: 404 });
      }
      if (!me.branch_ids.includes(profile.branch_id)) {
        return Response.json({ error: 'You cannot manage this branch' }, { status: 403 });
      }
      await base44.asServiceRole.entities.EmployeeProfile.delete(profile.id);
      const access = await releaseAppAccess(base44, profile.user_email);
      return Response.json({ ok: true, deleted: profile.id, ...access });
    }

    // Opening the account and sending its mail is kept off the save path: a slow invitation or
    // mail provider must never leave the employer looking at a form that is still saving.
    if (action === 'grant_access') {
      const profile = await base44.asServiceRole.entities.EmployeeProfile.get(body.employee_id).catch(() => null);
      if (!profile || profile.company_id !== me.company_id) {
        return Response.json({ error: 'Employee not found' }, { status: 404 });
      }
      if (!me.branch_ids.includes(profile.branch_id)) {
        return Response.json({ error: 'You cannot manage this branch' }, { status: 403 });
      }
      const branch = await base44.asServiceRole.entities.Branch.get(profile.branch_id).catch(() => null);
      const store = branch ? branch.name : '';

      // Someone on the books must be able to sign in straight away, so the account itself is
      // always opened; only the password-setup email follows the employer's choice. An address
      // the platform already knows has its access restored rather than re-invited.
      const access = await sendAccountAccessEmail(base44, profile.user_email, body.send_invite !== false);

      if (body.send_onboarding_email && profile.onboarding_token) {
        const link = portalLink(body.origin, `/onboarding/${profile.onboarding_token}`);
        const details = {
          name: profile.full_name || 'team member',
          store,
          employeeNumber: profile.employee_number
        };
        // The first send welcomes them; a later one nudges the form they have not sent back yet.
        const mail = profile.onboarding_submitted_at
          ? onboardingReminderMail(employeeLanguage(profile.language), details)
          : onboardingMail(employeeLanguage(profile.language), details);
        await sendEmail(base44, {
          to: profile.user_email,
          subject: mail.subject,
          html: brandedEmail({
            heading: mail.heading,
            brandColor: branch ? branch.brand_color : undefined,
            lines: mail.lines,
            ctaText: mail.cta,
            ctaUrl: link,
            footer: `${store} · K-Workmate`
          })
        });
      }

      return Response.json({ ok: true, employee: profile, ...access });
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

    // The store kiosk PIN is optional on the form: leaving it blank keeps whatever is stored.
    const pinPatch = {};
    if (String(input.pin || '').trim()) {
      if (!isValidPin(input.pin)) {
        return Response.json({ error: 'The PIN must be 4 to 6 digits' }, { status: 400 });
      }
      const salt = newPinSalt();
      pinPatch.pin_salt = salt;
      pinPatch.pin_hash = await hashPin(input.pin, salt);
    }

    // The employer keeps the onboarding status moving, but completion stays behind an actual
    // submission: without the employee's submitted form the profile cannot be called complete.
    const STATUSES = ['pending', 'in_progress', 'completed'];
    const requestedStatus = STATUSES.includes(input.onboarding_status) ? input.onboarding_status : null;

    if (action === 'update') {
      const profile = await base44.asServiceRole.entities.EmployeeProfile.get(input.id);
      if (!profile || profile.company_id !== me.company_id) {
        return Response.json({ error: 'Employee not found' }, { status: 404 });
      }
      if (requestedStatus === 'completed' && !profile.onboarding_submitted_at) {
        return Response.json(
          { error: 'This employee has not submitted their onboarding form yet' },
          { status: 400 }
        );
      }
      const updated = await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
        full_name: input.full_name || profile.full_name,
        position: input.position || '',
        secondary_position: input.secondary_position || '',
        visa_type: input.visa_type || profile.visa_type || '',
        hourly_rate: Number(input.hourly_rate) || 0,
        employment_type: input.employment_type || profile.employment_type,
        status: input.status || profile.status,
        phone: input.phone || '',
        start_date: input.start_date || '',
        emergency_contact_name: input.emergency_contact_name || '',
        emergency_contact_phone: input.emergency_contact_phone || '',
        language: input.language === 'en' || input.language === 'ko' ? input.language : profile.language || 'ko',
        onboarding_status: requestedStatus || profile.onboarding_status || 'pending',
        app_role: roleKey || profile.app_role || 'staff',
        ...pinPatch
      });

      if (roleKey) await applyRole(base44, company, branch, profile.user_email, roleKey);

      return Response.json({ ok: true, employee: updated });
    }

    const email = String(input.user_email || '').trim().toLowerCase();
    if (!email) return Response.json({ error: 'Email is required' }, { status: 400 });

    const dupe = await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: email, company_id: me.company_id });
    if (dupe.length > 0) {
      return Response.json({ error: 'This person is already an employee' }, { status: 400 });
    }

    // How many people the company's package covers.
    const state = packageState(company);
    const employeeLimit = resolveLimit(company && company.employee_limit_override, state.employeeLimit);
    if (employeeLimit !== null) {
      const total = await base44.asServiceRole.entities.EmployeeProfile.count({
        company_id: me.company_id,
        status: { $ne: 'inactive' }
      });
      if (total >= employeeLimit) {
        return Response.json(
          { error: `This package covers up to ${employeeLimit} employees. Move to a higher package to add more.` },
          { status: 400 }
        );
      }
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
      secondary_position: input.secondary_position || '',
      visa_type: input.visa_type || '',
      hourly_rate: Number(input.hourly_rate) || 0,
      employment_type: input.employment_type || 'casual',
      status: 'active',
      start_date: input.start_date || new Date().toISOString().slice(0, 10),
      phone: input.phone || '',
      emergency_contact_name: input.emergency_contact_name || '',
      emergency_contact_phone: input.emergency_contact_phone || '',
      onboarding_status: 'pending',
      onboarding_token: token,
      language: input.language === 'en' ? 'en' : 'ko',
      app_role: roleKey || 'staff',
      ...pinPatch,
      docs: []
    });

    await base44.asServiceRole.entities.Branch.update(branch.id, { employee_next_number: nextNumber + 1 });

    if (roleKey) await applyRole(base44, company, branch, email, roleKey);

    // The record itself is what the employer is waiting for, so it answers before any mail goes
    // out. The account is opened in its own call, which may take as long as the provider needs.
    return Response.json({ ok: true, employee: profile, employee_number: employeeNumber });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}