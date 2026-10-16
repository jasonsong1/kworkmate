// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/kioskPunch/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { decodeKioskToken, timeIn, timezoneForBranch, todayIn } from '../_shared/kiosk.ts';
import { verifyPin } from '../_shared/pin.ts';
import { branchManagers, notifyStaff } from '../_shared/notify.ts';

function rowsOf(result) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

// A manual punch only counts once a manager accepts it, so the manager hears about it in the
// app straight away: it shows in the bell at the top of their screen.
async function alertManagers(base44, company, branch, person, action) {
  const emails = await branchManagers(base44, company, branch);
  if (emails.length === 0) return;
  const time = timeIn(timezoneForBranch(branch));
  await notifyStaff(base44, {
    company,
    branch,
    recipients: emails.map((email) => ({ email })),
    type: 'attendance_approval',
    title: action === 'in' ? 'Clock-in needs approval' : 'Clock-out needs approval',
    body: `${person.full_name || person.user_email} clocked ${action === 'in' ? 'in' : 'out'} at ${time}.`,
    link: '/attendance'
  });
}

// Reachable without signing in, because it is opened on a store tablet: the link itself
// carries the branch and the day, and only a manual punch is ever created here. Manual
// punches are recorded as pending so a manager approves them before they count.
async function handler(req) {
  try {
    const base44 = createBase44Like();
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
        // The company's own clock-in QR design, so the store screen shows the same card the
        // manager saved in Template design.
        qr_design: (company && company.qr_design) || {},
        date: today,
        // The store's own clock, so the screen knows when its day has ended and redraws.
        timezone: timezoneForBranch(branch)
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

    // 이미 반려(rejected)된 출근 기록은 활성 출근으로 보지 않습니다.
    const active = rowsOf(
      await base44.asServiceRole.entities.TimeEntry.filter(
        { employee_email: person.user_email, status: 'active' },
        { limit: 5 }
      )
    ).filter((entry) => entry && entry.approval_status !== 'rejected');
    const nowIso = new Date().toISOString();

    // A manager's own punch is recorded as it stands: there is nobody above them to accept it.
    const managers = await branchManagers(base44, company, branch).catch(() => []);
    const isManager = managers.includes(person.user_email);
    const approval = isManager ? 'approved' : 'pending';

    if (action === 'in') {
      if (active.length > 0) return Response.json({ error: 'already_clocked_in' });

      // 이전에 반려되었으나 status가 여전히 'active'인 레코드가 있다면 'rejected'로 상태 동기화
      const staleRejected = rowsOf(
        await base44.asServiceRole.entities.TimeEntry.filter(
          { employee_email: person.user_email, status: 'active' },
          { limit: 10 }
        )
      ).filter((entry) => entry && entry.approval_status === 'rejected');
      for (const stale of staleRejected) {
        await base44.asServiceRole.entities.TimeEntry.update(stale.id, { status: 'rejected' }).catch(() => null);
      }

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
        shift_id: shift ? shift.id : null,
        clock_in_at: nowIso,
        scheduled_start: shift ? shift.start_time : null,
        scheduled_end: shift ? shift.end_time : null,
        geo_verified: false,
        status: 'active',
        source: 'manual',
        approval_status: approval,
        approved_at: isManager ? nowIso : null
      });

      if (!isManager) await alertManagers(base44, company, branch, person, 'in').catch(() => null);

      return Response.json({
        ok: true,
        action: 'in',
        name: person.full_name,
        employee_number: canonical,
        pending: !isManager
      });
    }

    if (active.length === 0) return Response.json({ error: 'not_clocked_in' });

    const entry = active[0];
    const minutes = Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(entry.clock_in_at).getTime()) / 60000));
    await base44.asServiceRole.entities.TimeEntry.update(entry.id, {
      clock_out_at: nowIso,
      minutes,
      status: 'completed',
      source: 'manual',
      approval_status: approval,
      approved_by_email: isManager ? person.user_email : null,
      approved_at: isManager ? nowIso : null
    });

    if (!isManager) await alertManagers(base44, company, branch, person, 'out').catch(() => null);

    return Response.json({
      ok: true,
      action: 'out',
      name: person.full_name,
      employee_number: canonical,
      pending: !isManager
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
