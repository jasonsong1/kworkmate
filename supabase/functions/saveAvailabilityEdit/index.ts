// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/saveAvailabilityEdit/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';
import { sendEmail, brandedEmail } from '../_shared/email.ts';
import { availabilityEditedMail, employeeLanguage } from '../_shared/employeeMail.ts';
import { holdsManagerPosition, managerPositionLabels } from '../_shared/access.ts';

function rowsOf(result) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

// A manager can correct what someone submitted instead of waiting for a new reply. The
// change is written back onto the submission and the person is told it was changed.
async function handler(req) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const branch = await base44.asServiceRole.entities.Branch.get(body.branch_id).catch(() => null);
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 });

    // Whoever runs the store may correct a submission: the company admin, a manager listed on the
    // branch, or anyone whose staff record carries a manager position — the same three layers the
    // roster screen itself already opens the edit button for.
    const isAdmin = me.role === 'admin' || me.app_role === 'company_admin';
    const callerEmail = String(me.email || '').trim().toLowerCase();
    const managerEmails = (branch.manager_emails || []).map((value) => String(value).trim().toLowerCase());
    let allowed = isAdmin || Boolean(callerEmail && managerEmails.includes(callerEmail));
    if (!allowed) {
      const company = branch.company_id
        ? await base44.asServiceRole.entities.Company.get(branch.company_id).catch(() => null)
        : null;
      const person = rowsOf(
        await base44.asServiceRole.entities.EmployeeProfile
          .filter({ user_email: callerEmail }, { limit: 1 })
          .catch(() => [])
      )[0];
      allowed = holdsManagerPosition(person, managerPositionLabels(company && company.custom_roles));
    }
    if (!allowed) {
      return Response.json({ error: 'Only a manager of this store can change submitted availability' }, { status: 403 });
    }

    const email = String(body.employee_email || '').trim();
    if (!email) return Response.json({ error: 'employee_email is required' }, { status: 400 });

    const payload = {
      company_id: branch.company_id,
      branch_id: branch.id,
      employee_email: email,
      employee_name: body.employee_name || '',
      week_start: body.week_start || '',
      availability: body.availability || {},
      manager_edited: true,
      updated_by_email: me.email,
      updated_by_name: me.full_name || me.email,
      manager_edited_at: new Date().toISOString()
    };

    const record = body.submission_id
      ? await base44.asServiceRole.entities.AvailabilitySubmission.update(body.submission_id, payload)
      : await base44.asServiceRole.entities.AvailabilitySubmission.create(payload);

    const people = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: email }, { limit: 1 })
    );
    const person = people[0] || null;
    let notified = false;

    if (person) {
      const company = branch.company_id
        ? await base44.asServiceRole.entities.Company.get(branch.company_id).catch(() => null)
        : null;
      const copy = availabilityEditedMail(employeeLanguage(person.language), {
        name: person.full_name || 'there',
        branchName: branch.name
      });
      notified = await sendEmail(base44, {
        to: email,
        subject: copy.subject,
        html: brandedEmail({
          heading: copy.heading,
          badge: branch.name,
          lines: copy.lines,
          brandColor: branch.brand_color || (company && company.brand_color),
          footer: `${company ? company.name : branch.name} · kworkmate`
        })
      });
    }

    return Response.json({ ok: true, submission: record, notified });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
