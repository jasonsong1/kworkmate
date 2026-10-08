import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendEmail, brandedEmail } from '../../shared/email.ts';
import { employeeLanguage, rosterMail } from '../../shared/employeeMail.ts';
import { pushStaff } from '../../shared/notify.ts';
import { resolveCaller } from '../../shared/kwAuth.ts';

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
}

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    // Either door the employer signed in through answers here: the ID their employer issued, or a
    // platform account. Managers run the back office on the employee sign-in, so the platform's
    // own session alone would refuse them.
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Sign-in required' }, { status: 401 });

    const body = await req.json();
    const branchId = body.branch_id;
    const weekStart = body.week_start;
    if (!branchId || !weekStart) {
      return Response.json({ error: 'branch_id and week_start are required' }, { status: 400 });
    }

    const branch = await base44.asServiceRole.entities.Branch.get(branchId).catch(() => null);
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 });

    const isCompanyAdmin = Boolean(me.company_id) && me.company_id === branch.company_id;
    if (!isCompanyAdmin && !(me.branch_ids || []).includes(branchId)) {
      return Response.json({ error: 'You cannot manage this roster' }, { status: 403 });
    }

    const company = branch.company_id
      ? await base44.asServiceRole.entities.Company.get(branch.company_id).catch(() => null)
      : null;

    const weekEnd = addDays(weekStart, 6);
    const shifts = await base44.asServiceRole.entities.Shift.filter({
      branch_id: branchId,
      date: { $gte: weekStart, $lte: weekEnd }
    });

    // Each shift goes out in the language set on that person's staff profile.
    const staff = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter({ branch_id: branchId }, { limit: 500 })
    );
    const languageByEmail = new Map<string, any>();
    staff.forEach((person: any) => {
      if (person && person.user_email) languageByEmail.set(person.user_email, person.language);
    });

    const byEmployee = new Map<string, any[]>();
    shifts.forEach((shift: any) => {
      if (!shift.employee_email) return;
      const list = byEmployee.get(shift.employee_email) || [];
      list.push(shift);
      byEmployee.set(shift.employee_email, list);
    });

    const range = `${dayLabel(weekStart)} – ${dayLabel(weekEnd)}`;
    let sent = 0;
    const notices: any[] = [];
    const pushRecipients: any[] = [];
    for (const [email, list] of byEmployee) {
      const sorted = list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const name = sorted[0].employee_name || email;
      const copy = rosterMail(employeeLanguage(languageByEmail.get(email)), {
        name,
        branchName: branch.name,
        range
      });
      const lines = sorted.map(
        (shift) =>
          `<b>${dayLabel(shift.date)}</b> · ${shift.start_time}–${shift.end_time}${shift.position ? ` · ${shift.position}` : ''}`
      );
      const ok = await sendEmail(base44, {
        to: email,
        subject: copy.subject,
        html: brandedEmail({
          heading: copy.heading,
          brandColor: branch.brand_color || (company && company.brand_color),
          lines: [copy.greeting, copy.lead, ...lines],
          footer: `${company ? company.name : branch.name} · kworkmate`
        })
      });
      if (ok) sent += 1;
      notices.push({
        company_id: branch.company_id,
        branch_id: branchId,
        user_email: email,
        type: 'shift_created',
        title: copy.subject,
        body: lines.map((line: string) => line.replace(/<[^>]+>/g, '')).join(' · '),
        link: '/roster',
        read: false
      });
      // Confirming the week is the moment a person needs to hear about on their phone.
      pushRecipients.push({
        email,
        title: copy.subject,
        body: lines.map((line: string) => line.replace(/<[^>]+>/g, '')).join(' · ')
      });
    }

    // The same news in the app's bell, so a person sees it without opening their inbox.
    if (notices.length > 0) {
      await base44.asServiceRole.entities.Notification.bulkCreate(notices).catch(() => null);
    }
    // The confirmed week also reaches the phone, for anyone using the installed app.
    const pushed = await pushStaff(base44, { recipients: pushRecipients, link: '/roster' }).catch(() => 0);

    await base44.asServiceRole.entities.Shift.updateMany(
      { branch_id: branchId, date: { $gte: weekStart, $lte: weekEnd } },
      { $set: { status: 'published' } }
    );

    return Response.json({ ok: true, sent, shifts: shifts.length, notified: notices.length, pushed });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}