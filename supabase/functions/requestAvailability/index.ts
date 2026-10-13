// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/requestAvailability/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { lower, resolveCaller } from '../_shared/kwAuth.ts';
import { sendEmail, brandedEmail, portalLink } from '../_shared/email.ts';
import { availabilityMail, employeeLanguage } from '../_shared/employeeMail.ts';
import { branchManagers } from '../_shared/notify.ts';

function rowsOf(result) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

// Nudges one person for their availability, separately from the weekly round that goes to
// everybody on the branch.
async function handler(req) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const branch = await base44.asServiceRole.entities.Branch.get(body.branch_id).catch(() => null);
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 });

    const company = branch.company_id
      ? await base44.asServiceRole.entities.Company.get(branch.company_id).catch(() => null)
      : null;
    // Whoever runs this store may ask its crew for their hours: a manager the store lists, a
    // company admin, and equally a position the employer set on a staff record.
    const isAdmin = me.role === 'admin' || me.app_role === 'company_admin';
    const managers = (await branchManagers(base44, company, branch)).map((email) => lower(email));
    if (!isAdmin && !managers.includes(lower(me.email))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const email = String(body.employee_email || '').trim();
    if (!email) return Response.json({ error: 'employee_email is required' }, { status: 400 });

    const people = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter(
        { branch_id: branch.id, user_email: email },
        { limit: 1 }
      )
    );
    const person = people[0];
    if (!person) return Response.json({ error: 'Employee not found' }, { status: 404 });

    const copy = availabilityMail(employeeLanguage(person.language), {
      name: person.full_name || 'there',
      branchName: branch.name
    });

    const sent = await sendEmail(base44, {
      to: email,
      subject: copy.subject,
      html: brandedEmail({
        heading: copy.heading,
        badge: branch.name,
        lines: copy.lines,
        tip: copy.tip,
        ctaText: copy.cta,
        // Straight to the sign-in page, never to a page that assumes who is asking: the person
        // opens this on their own phone and signs in with the ID their employer issued.
        ctaUrl: portalLink(body.origin, '/login?returnTo=/my-space'),
        brandColor: branch.brand_color || (company && company.brand_color),
        footer: `${company ? company.name : branch.name} · kworkmate`
      })
    });

    return Response.json({ ok: sent, name: person.full_name });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
