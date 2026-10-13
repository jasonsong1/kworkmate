// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/leaveSummary/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';
import { holdsManagerPosition, managerPositionLabels } from '../_shared/access.ts';
import {
  activeTypes,
  availableHours,
  eligibleFor,
  expiresOn,
  grantPeriod,
  grantsFor,
  leaveTypesFrom,
  round2
} from '../_shared/leave.ts';
import { rowsOf, todayIso } from '../_shared/util.ts';

function monthsAgoIso(months: number) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

// The leave balances in force right now: the hours that have accrued from the ordinary hours
// actually worked, the allowance handed out for the current period, what is booked, and what
// is only waiting for approval. Every screen reads this instead of working it out again.
async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const today = todayIso();
    const branchId = body.branch_id || me.branch_id || '';
    const manages =
      me.role === 'admin' || (branchId && Array.isArray(me.branch_ids) && me.branch_ids.includes(branchId));
    const teamView = Boolean(body.team) && Boolean(manages);

    const branch = branchId ? await base44.asServiceRole.entities.Branch.get(branchId).catch(() => null) : null;
    const companyId = (branch && branch.company_id) || me.company_id || '';
    const company = companyId ? await base44.asServiceRole.entities.Company.get(companyId).catch(() => null) : null;

    const caller = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: me.email }, { limit: 1 }).catch(() => [])
    )[0];
    // Who may change the leave settings: the company admin, and any position the employer runs
    // the store with — the same people who approve the requests.
    const runsStore =
      me.role === 'admin' ||
      me.app_role === 'company_admin' ||
      me.app_role === 'branch_manager' ||
      holdsManagerPosition(caller, managerPositionLabels(company && company.custom_roles));

    let staff: any[] = [];
    if (teamView) {
      staff = rowsOf(
        await base44.asServiceRole.entities.EmployeeProfile.filter(
          { branch_id: branchId, status: 'active' },
          { limit: 500 }
        )
      );
    } else {
      const profile = rowsOf(
        await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: me.email }, { limit: 1 })
      )[0];
      if (profile) staff = [profile];
    }

    const stored = rowsOf(
      await base44.asServiceRole.entities.LeaveType.filter({ company_id: companyId }, { limit: 100 })
    );
    // Every leave the company has set up, and the ones it is offering right now. A leave
    // switched off keeps its settings and its balances, so it can be switched back on.
    const allTypes = leaveTypesFrom(stored);
    const types = activeTypes(allTypes);

    if (staff.length === 0) {
      return Response.json({
        ok: true,
        scope: teamView ? 'team' : 'self',
        types,
        all_types: allTypes,
        balances: [],
        requests: [],
        can_manage: Boolean(manages),
        can_configure: runsStore
      });
    }

    const balances = rowsOf(
      await base44.asServiceRole.entities.LeaveBalance.filter({ company_id: companyId }, { limit: 1000 })
    );
    const balanceBy = new Map(balances.map((row: any) => [`${row.employee_email}::${row.leave_type_key}`, row]));

    // Accrual is measured from the day a balance was opened, so it grows with the hours the
    // person has actually worked since then.
    const earliest =
      balances.reduce((min: string, row: any) => {
        const anchor = String(row.accrual_anchor_at || '').slice(0, 10);
        if (!anchor) return min;
        return !min || anchor < min ? anchor : min;
      }, '') || monthsAgoIso(12);

    const entries = rowsOf(
      await base44.asServiceRole.entities.TimeEntry.filter(
        { company_id: companyId, clock_in_at: { $gte: `${earliest}T00:00:00.000Z` } },
        { limit: 5000 }
      )
    );
    const workedBy: any = {};
    entries.forEach((entry: any) => {
      if (!entry || !entry.employee_email || !entry.clock_out_at) return;
      if (entry.approval_status === 'rejected') return;
      const day = String(entry.clock_in_at || entry.created_date || '').slice(0, 10);
      if (!day) return;
      workedBy[entry.employee_email] = workedBy[entry.employee_email] || [];
      workedBy[entry.employee_email].push({ day, hours: (Number(entry.minutes) || 0) / 60 });
    });

    const creates: any[] = [];
    const updates: any[] = [];
    const result: any[] = [];

    for (const person of staff) {
      const employment = person.employment_type || 'casual';
      const worked = workedBy[person.user_email] || [];
      for (const type of types) {
        if (!eligibleFor(type, employment)) continue;
        const existing = balanceBy.get(`${person.user_email}::${type.key}`);
        const anchor = String(
          (existing && existing.accrual_anchor_at) || person.start_date || today
        ).slice(0, 10);
        const ordinaryHours = worked
          .filter((entry: any) => entry.day >= anchor)
          .reduce((sum: number, entry: any) => sum + entry.hours, 0);

        const next: any = {
          company_id: companyId,
          branch_id: person.branch_id || branchId,
          employee_email: person.user_email,
          employee_name: person.full_name || person.user_email,
          employee_number: person.employee_number || '',
          leave_type_key: type.key,
          leave_type_name: type.name,
          accrual_anchor_at: `${anchor}T00:00:00.000Z`,
          opening_hours: Number((existing && existing.opening_hours) || 0),
          accrued_hours: type.accrual_method === 'ordinary_hours' ? round2(type.accrual_rate * ordinaryHours) : 0,
          granted_hours: Number((existing && existing.granted_hours) || 0),
          adjustment_hours: Number((existing && existing.adjustment_hours) || 0),
          used_hours: Number((existing && existing.used_hours) || 0),
          pending_hours: Number((existing && existing.pending_hours) || 0),
          grant_period: (existing && existing.grant_period) || '',
          granted_expires_at: (existing && existing.granted_expires_at) || '',
          note: (existing && existing.note) || '',
          last_accrued_at: new Date().toISOString()
        };

        // A new allowance period either replaces whatever is left (use it or lose it) or
        // carries the remainder forward as a correction on the balance.
        if (type.grant_enabled && grantsFor(type, employment)) {
          const period = grantPeriod(type, today, person.start_date || anchor);
          if (next.grant_period !== period.key) {
            const remainder = Math.max(0, next.granted_hours - next.used_hours - next.pending_hours);
            if (!type.expiry_enabled && next.grant_period) {
              next.adjustment_hours = round2(next.adjustment_hours + remainder);
            }
            next.granted_hours = round2(type.grant_hours);
            next.grant_period = period.key;
            next.granted_expires_at = expiresOn(type, period);
          }
        } else if (!type.grant_enabled && next.granted_hours !== 0) {
          next.granted_hours = 0;
          next.grant_period = '';
          next.granted_expires_at = '';
        }

        if (!existing) {
          creates.push(next);
          result.push(next);
          continue;
        }
        const changed =
          round2(existing.accrued_hours) !== next.accrued_hours ||
          round2(existing.granted_hours) !== next.granted_hours ||
          round2(existing.adjustment_hours) !== next.adjustment_hours ||
          String(existing.grant_period || '') !== next.grant_period ||
          String(existing.accrual_anchor_at || '').slice(0, 10) !== anchor;
        if (changed) updates.push({ id: existing.id, ...next });
        result.push({ id: existing.id, ...next });
      }
    }

    if (creates.length > 0) await base44.asServiceRole.entities.LeaveBalance.bulkCreate(creates).catch(() => null);
    if (updates.length > 0) await base44.asServiceRole.entities.LeaveBalance.bulkUpdate(updates).catch(() => null);

    const requests = teamView
      ? rowsOf(
          await base44.asServiceRole.entities.LeaveRequest.filter(
            { branch_id: branchId },
            { sort: '-start_date', limit: 200 }
          )
        )
      : rowsOf(
          await base44.asServiceRole.entities.LeaveRequest.filter(
            { employee_email: me.email },
            { sort: '-start_date', limit: 200 }
          )
        );

    return Response.json({
      ok: true,
      scope: teamView ? 'team' : 'self',
      company_id: companyId,
      company_name: company ? company.name : '',
      branch_id: branchId,
      today,
      can_manage: Boolean(manages),
      can_configure: runsStore,
      types,
      all_types: allTypes,
      staff: staff.map((person: any) => ({
        email: person.user_email,
        name: person.full_name || person.user_email,
        employment_type: person.employment_type || 'casual',
        employee_number: person.employee_number || '',
        branch_id: person.branch_id || branchId
      })),
      balances: result.map((row) => ({ ...row, available_hours: availableHours(row) })),
      requests
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
