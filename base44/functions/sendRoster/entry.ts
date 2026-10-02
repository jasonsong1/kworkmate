import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendEmail, brandedEmail } from '../../shared/email.ts';

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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

    const byEmployee = new Map<string, any[]>();
    shifts.forEach((shift: any) => {
      if (!shift.employee_email) return;
      const list = byEmployee.get(shift.employee_email) || [];
      list.push(shift);
      byEmployee.set(shift.employee_email, list);
    });

    let sent = 0;
    for (const [email, list] of byEmployee) {
      const sorted = list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const name = sorted[0].employee_name || email;
      const lines = sorted.map(
        (shift) =>
          `<b>${dayLabel(shift.date)}</b> · ${shift.start_time}–${shift.end_time}${shift.position ? ` · ${shift.position}` : ''}`
      );
      const ok = await sendEmail(base44, {
        to: email,
        subject: `Your roster · ${dayLabel(weekStart)} – ${dayLabel(weekEnd)}`,
        html: brandedEmail({
          heading: `${branch.name} roster`,
          brandColor: branch.brand_color || (company && company.brand_color),
          lines: [`Hi ${name},`, 'Here are your shifts for this week:', ...lines],
          footer: `${company ? company.name : branch.name} · K-Workmate`
        })
      });
      if (ok) sent += 1;
    }

    await base44.asServiceRole.entities.Shift.updateMany(
      { branch_id: branchId, date: { $gte: weekStart, $lte: weekEnd } },
      { $set: { status: 'published' } }
    );

    return Response.json({ ok: true, sent, shifts: shifts.length });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}