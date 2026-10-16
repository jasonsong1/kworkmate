// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/manageEmployee/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { formatEmployeeNumber, randomToken } from '../_shared/util.ts';
import { hashPin, isValidPin, newPinSalt } from '../_shared/pin.ts';
import { sendEmail, sendEmailDetailed, brandedEmail, portalLink } from '../_shared/email.ts';
import { sendAccountAccessEmail, releaseAppAccess } from '../_shared/account.ts';
import { employeeLanguage, onboardingMail, onboardingReminderMail } from '../_shared/employeeMail.ts';
import { packageState, resolveLimit } from '../_shared/packages.ts';
import { clean, lower, resolveCaller } from '../_shared/kwAuth.ts';

// 대상 직원 프로필 1개에만 권한을 적용하며, 동일 이메일을 가진 타 브랜치 직원을 절대 침범하지 않습니다.
async function applyRole(base44, company, branch, email, roleKey, targetProfileId = null) {
  if (targetProfileId) {
    const patch = { company_id: branch.company_id, app_role: roleKey };
    if (roleKey !== 'company_admin') {
      patch.branch_id = branch.id;
    }
    await base44.asServiceRole.entities.EmployeeProfile.update(targetProfileId, patch);
  } else {
    // targetProfileId가 없는 경우 해당 브랜치에 소속된 프로필만 한정하여 업데이트
    const users = await base44.asServiceRole.entities.EmployeeProfile.filter({
      user_email: email,
      branch_id: branch.id
    });
    for (const user of users) {
      const patch = { company_id: branch.company_id, app_role: roleKey };
      if (roleKey !== 'company_admin') {
        patch.branch_id = branch.id;
      }
      await base44.asServiceRole.entities.EmployeeProfile.update(user.id, patch);
    }
  }
  // 회사 관리자(company_admin)일 경우 회사 멤버 목록에 추가
  if (roleKey === 'company_admin' && company) {
    const members = Array.isArray(company.member_emails) ? company.member_emails : [];
    if (!members.includes(email)) {
      await base44.asServiceRole.entities.Company.update(company.id, {
        member_emails: [...members, email]
      });
    }
  }
}

async function handler(req) {
  try {
    const base44 = createBase44Like();
    // Either door the employer signed in through answers here: the ID their employer issued, or a
    // platform account.
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Sign-in required' }, { status: 401 });

    const isSuper =
      Boolean(me) &&
      (me.role === 'admin' ||
        me.app_role === 'super_admin' ||
        lower(me.email) === 'sym910403@gmail.com');

    const body = await req.json();
    const action = body.action || 'create';

    if (action === 'assign_manager') {
      if (!isSuper && (!me.company_id || me.app_role !== 'company_admin')) {
        return Response.json({ error: 'Only a company admin can assign managers' }, { status: 403 });
      }
      const branch = await base44.asServiceRole.entities.Branch.get(body.branch_id);
      if (!branch || (!isSuper && branch.company_id !== me.company_id)) {
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
      if (!isSuper && (!me.company_id || me.app_role !== 'company_admin')) {
        return Response.json({ error: 'Only a company admin can remove managers' }, { status: 403 });
      }
      const branch = await base44.asServiceRole.entities.Branch.get(body.branch_id);
      if (!branch || (!isSuper && branch.company_id !== me.company_id)) {
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

    if (!isSuper && (!me.company_id || !me.branch_ids || me.branch_ids.length === 0)) {
      return Response.json({ error: 'Your account is not linked to a company yet' }, { status: 403 });
    }

    // Taking the employee off the books is what closes the app for them: the workspace is
    // dropped from their account while the platform keeps their sign-in, so the same email
    // registered again is linked once more on the next sign-in.
    if (action === 'delete') {
      const profile = await base44.asServiceRole.entities.EmployeeProfile.get(body.employee_id).catch(() => null);
      if (!profile || (!isSuper && profile.company_id !== me.company_id)) {
        return Response.json({ error: 'Employee not found' }, { status: 404 });
      }
      if (!isSuper && !me.branch_ids.includes(profile.branch_id)) {
        return Response.json({ error: 'You cannot manage this branch' }, { status: 403 });
      }
      await base44.asServiceRole.entities.EmployeeProfile.delete(profile.id);
      let access = { blocked: true, kept: false };
      try {
        access = await releaseAppAccess(base44, profile.user_email);
      } catch (err) {
        console.error('releaseAppAccess error:', err);
      }
      return Response.json({ ok: true, deleted: profile.id, ...access });
    }

    // Opening the account and sending its mail is kept off the save path: a slow invitation or
    // mail provider must never leave the employer looking at a form that is still saving.
    // 계정 접근 권한 부여(grant_access) 및 온보딩 이메일 전송(send_onboarding_email)
    if (action === 'grant_access' || action === 'send_onboarding_email') {
      const profile = await base44.asServiceRole.entities.EmployeeProfile.get(body.employee_id).catch(() => null);
      if (!profile || (!isSuper && profile.company_id !== me.company_id)) {
        return Response.json({ error: 'Employee not found' }, { status: 404 });
      }
      if (!isSuper && !me.branch_ids.includes(profile.branch_id)) {
        return Response.json({ error: 'You cannot manage this branch' }, { status: 403 });
      }
      const branch = await base44.asServiceRole.entities.Branch.get(profile.branch_id).catch(() => null);
      const store = branch ? branch.name : '';

      // grant_access일 때만 계정 접근 권한 및 로그인 비밀번호 설정 메일 전송
      let access = {};
      if (action === 'grant_access') {
        access = await sendAccountAccessEmail(base44, profile.user_email, body.send_invite !== false);
      }

      let emailResult = { ok: true, error: '' };
      let onboardingToken = profile.onboarding_token;
      let link = '';

      // 온보딩 이메일 발송 요청인 경우
      if (body.send_onboarding_email || action === 'send_onboarding_email') {
        // 이미 제출되었거나 완료된 경우 새 토큰 발급
        const reopened =
          !profile.onboarding_token ||
          Boolean(profile.onboarding_submitted_at) ||
          profile.onboarding_status === 'completed';
        if (reopened) {
          onboardingToken = randomToken(24);
          await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
            onboarding_token: onboardingToken,
            onboarding_status: 'pending',
            onboarding_submitted_at: ''
          });
        }
        link = portalLink(body.origin, `/onboarding/${onboardingToken}`);
        const details = {
          name: profile.full_name || 'team member',
          store,
          employeeNumber: profile.employee_number
        };
        const mail = !reopened && profile.onboarding_submitted_at
          ? onboardingReminderMail(employeeLanguage(profile.language), details)
          : onboardingMail(employeeLanguage(profile.language), details);

        emailResult = await sendEmailDetailed(base44, {
          to: profile.user_email,
          subject: mail.subject,
          html: brandedEmail({
            heading: mail.heading,
            badge: store,
            brandColor: branch ? branch.brand_color : undefined,
            lines: mail.lines,
            ctaText: mail.cta,
            ctaUrl: link,
            footer: `${store} · kworkmate`
          })
        });
        console.log(`[manageEmployee] Onboarding email to ${profile.user_email}:`, emailResult);
      }

      if (!link && onboardingToken) {
        link = portalLink(body.origin, `/onboarding/${onboardingToken}`);
      }

      return Response.json({
        ok: true,
        employee: profile,
        onboarding_token: onboardingToken,
        onboarding_link: link,
        email_sent: emailResult.ok,
        email_error: emailResult.error || '',
        ...access
      });
    }

    const input = body.employee || {};
    const branch = await base44.asServiceRole.entities.Branch.get(body.branch_id || input.branch_id);
    if (!branch || (!isSuper && (branch.company_id !== me.company_id || !me.branch_ids.includes(branch.id)))) {
      return Response.json({ error: 'You cannot manage this branch' }, { status: 403 });
    }

    const targetCompanyId = isSuper ? (branch.company_id || me.company_id) : me.company_id;
    const companyLookup = await base44.asServiceRole.entities.Company.filter({ id: targetCompanyId });
    const company = companyLookup[0] || null;
    const allowedRoles = [
      'staff',
      'branch_manager',
      ...(((company && company.custom_roles) || []).map((role) => role.key))
    ];
    // Only a company admin may hand out a role, and company admins are managed in company settings.
    const roleKey =
      isSuper ? (input.app_role || 'staff') : (me.app_role === 'company_admin' && allowedRoles.includes(input.app_role) ? input.app_role : null);

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
      if (!profile || (!isSuper && profile.company_id !== me.company_id)) {
        return Response.json({ error: 'Employee not found' }, { status: 404 });
      }
      if (requestedStatus === 'completed' && !profile.onboarding_submitted_at) {
        return Response.json(
          { error: 'This employee has not submitted their onboarding form yet' },
          { status: 400 }
        );
      }
      // The address on the record is what the employer keeps up to date, so it may be corrected
      // here; the ID the person signs in with follows the address when that was the address.
      const nextEmail = lower(input.user_email);
      const patch = {};
      if (nextEmail && nextEmail !== lower(profile.user_email)) {
        const taken = await base44.asServiceRole.entities.EmployeeProfile.filter({
          user_email: nextEmail,
          branch_id: profile.branch_id
        });
        if (taken.some((row) => row.id !== profile.id)) {
          return Response.json({ error: 'This person is already an employee in this branch' }, { status: 400 });
        }
        patch.user_email = nextEmail;
        if (!clean(profile.login_id) || lower(profile.login_id) === lower(profile.user_email)) {
          patch.login_id = nextEmail;
        }
      }

      const updated = await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
        ...patch,
        full_name: input.full_name || profile.full_name,
        // An edit that does not touch the position leaves the one already stored in place.
        position: clean(input.position) || clean(profile.position) || '',
        secondary_position: input.secondary_position || '',
        extra_positions: (Array.isArray(input.extra_positions) ? input.extra_positions : []).
        filter(Boolean).
        map((value: any) => String(value).trim()).
        slice(0, 9),
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

      if (roleKey) await applyRole(base44, company, branch, patch.user_email || profile.user_email, roleKey, profile.id);

      return Response.json({ ok: true, employee: updated });
    }

    const email = String(input.user_email || '').trim().toLowerCase();
    if (!email) return Response.json({ error: 'Email is required' }, { status: 400 });

    // 브랜치 격리: 동일 브랜치 내에서만 중복을 검사하고 다른 브랜치에는 동일 이메일 등록을 허용합니다.
    const dupe = await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: email, branch_id: branch.id });
    if (dupe.length > 0) {
      return Response.json({ error: 'This person is already an employee in this branch' }, { status: 400 });
    }

    // How many people the company's package covers.
    const state = packageState(company);
    const employeeLimit = resolveLimit(company && company.employee_limit_override, state.employeeLimit);
    if (!isSuper && employeeLimit !== null) {
      const total = await base44.asServiceRole.entities.EmployeeProfile.count({
        company_id: targetCompanyId,
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
      company_id: targetCompanyId,
      branch_id: branch.id,
      user_email: email,
      full_name: input.full_name || email,
      employee_number: employeeNumber,
      position: input.position || '',
      secondary_position: input.secondary_position || '',
      extra_positions: (Array.isArray(input.extra_positions) ? input.extra_positions : []).
      filter(Boolean).
      map((value: any) => String(value).trim()).
      slice(0, 9),
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

    if (roleKey) await applyRole(base44, company, branch, email, roleKey, profile.id);

    // The record itself is what the employer is waiting for, so it answers before any mail goes
    // out. The account is opened in its own call, which may take as long as the provider needs.
    return Response.json({ ok: true, employee: profile, employee_number: employeeNumber });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
