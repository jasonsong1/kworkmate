import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { decodeKioskToken, timezoneForBranch, todayIn } from '../../shared/kiosk.ts';
import { verifyPin } from '../../shared/pin.ts';

function rowsOf(result) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

// Reachable without signing in, because it is opened on a store tablet: the link itself
// carries the branch and the day, and only a manual punch is ever created here. Manual
// punches are recorded as pending so a manager approves them before they count.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const parsed = decodeKioskToken(body.token);
    if (!parsed) return Response.json({ error: 'invalid_link' });

    const branch = await base44.asServiceRole.entities.Branch.get(parsed.branchId).catch(() => null);
    if (!branch || branch.is_active === false) {
      return Response.json({ error: 'branch_unavailable' });
    }

    const today = todayIn(timezoneForBranch(branch));
    if (parsed.date !== today) return Response.json({ error: 'expired_link' });

    const company = branch.company_id
      ? await base44.asServiceRole.entities.Company.get(branch.company_id).catch(() => null)
      : null;

    if (!body.action || body.action === 'info') {
      return Response.json({
        ok: true,
        branch_id: branch.id,
        branch_name: branch.name,
        company_name: company ? company.name : '',
        brand_color: branch.brand_color || (company && company.brand_color) || '#4338ca',
        date: today
      });
    }

    const action = body.action === 'out' ? 'out' : 'in';
    const number = String(body.employee_number || '').trim();
    if (!number) return Response.json({ error: 'employee_number_required' });
    // Numbers mix letters, digits and hyphens and are typed by hand, so match case-insensitively.
    const pattern = number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const people = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter(
        { branch_id: branch.id, employee_number: { $regex: `^${pattern}$`, $options: 'i' } },
        { limit: 1 }
      )
    );
    const person = people[0];
    if (!person) return Response.json({ error: 'employee_not_found' });
    const canonical = person.employee_number || number;
    if (person.status && person.status !== 'active') {
      return Response.json({ error: 'employee_inactive' });
    }

    // The number alone is easy to borrow or overhear, so a personal PIN confirms that the
    // person standing at the kiosk is the one the number belongs to.
    const pin = String(body.pin || '').trim();
    if (!pin) return Response.json({ error: 'pin_required' });
    if (!person.pin_hash || !person.pin_salt) return Response.json({ error: 'pin_not_set' });
    const pinOk = await verifyPin(pin, person.pin_hash, person.pin_salt);
    if (!pinOk) return Response.json({ error: 'pin_wrong' });

    const active = rowsOf(
      await base44.asServiceRole.entities.TimeEntry.filter(
        { employee_email: person.user_email, status: 'active' },
        { limit: 1 }
      )
    );
    const nowIso = new Date().toISOString();

    if (action === 'in') {
      if (active.length > 0) return Response.json({ error: 'already_clocked_in' });

      const shifts = rowsOf(
        await base44.asServiceRole.entities.Shift.filter(
          { branch_id: branch.id, employee_email: person.user_email, date: today },
          { limit: 1 }
        )
      );
      const shift = shifts[0] || null;

      await base44.asServiceRole.entities.TimeEntry.create({
        company_id: branch.company_id,
        branch_id: branch.id,
        employee_email: person.user_email,
        employee_name: person.full_name || person.user_email,
        employee_number: canonical,
        shift_id: shift ? shift.id : '',
        clock_in_at: nowIso,
        scheduled_start: shift ? shift.start_time : '',
        scheduled_end: shift ? shift.end_time : '',
        geo_verified: false,
        status: 'active',
        source: 'manual',
        approval_status: 'pending'
      });

      return Response.json({ ok: true, action: 'in', name: person.full_name, employee_number: canonical });
    }

    if (active.length === 0) return Response.json({ error: 'not_clocked_in' });

    const entry = active[0];
    const minutes = Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(entry.clock_in_at).getTime()) / 60000));
    await base44.asServiceRole.entities.TimeEntry.update(entry.id, {
      clock_out_at: nowIso,
      minutes,
      status: 'completed',
      source: 'manual',
      approval_status: 'pending',
      approved_by_email: '',
      approved_at: ''
    });

    return Response.json({ ok: true, action: 'out', name: person.full_name, employee_number: canonical });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}