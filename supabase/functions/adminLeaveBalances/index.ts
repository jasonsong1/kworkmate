// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/adminLeaveBalances/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';
import { activeTypes, availableHours, leaveTypesFrom, round2 } from '../_shared/leave.ts';
import { rowsOf, todayIso } from '../_shared/util.ts';

// The leave balances a store already has on its books when it is moved onto KWorkMate. Only the
// platform owner opens this: the hours typed in are stored as an adjustment, so what the person
// has already accrued or used by working is left exactly where it stands.
async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (me.role !== 'admin') {
      return Response.json({ error: 'Only the super admin can adjust leave balances' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const companyId = body.company_id || me.company_id || '';
    if (!companyId) return Response.json({ error: 'company_id is required' }, { status: 400 });

    const stored = rowsOf(
      await base44.asServiceRole.entities.LeaveType.filter({ company_id: companyId }, { limit: 100 })
    );
    const allTypes = leaveTypesFrom(stored);
    const types = activeTypes(allTypes);

    const staff = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter(
        { company_id: companyId, status: 'active' },
        { sort: 'full_name', limit: 500 }
      )
    ).filter((person: any) => person.user_email);

    const balances = rowsOf(
      await base44.asServiceRole.entities.LeaveBalance.filter({ company_id: companyId }, { limit: 2000 })
    );
    const byKey = new Map<string, any>(
      balances.map((row: any) => [`${row.employee_email}::${row.leave_type_key}`, row])
    );

    if (body.action === 'save') {
      const inputs = Array.isArray(body.rows) ? body.rows : [];
      const known = new Set(types.map((type: any) => type.key));
      const personBy = new Map<string, any>(staff.map((person: any) => [person.user_email, person]));
      const creates: any[] = [];
      const updates: any[] = [];

      for (const row of inputs) {
        const email = String((row && row.email) || '').trim();
        const key = String((row && row.leave_type_key) || '').trim();
        const target = Number(row && row.target_hours);
        if (!email || !known.has(key) || !Number.isFinite(target)) continue;
        const existing = byKey.get(`${email}::${key}`);
        if (existing) {
          const delta = target - availableHours(existing);
          updates.push({
            id: existing.id,
            adjustment_hours: round2((Number(existing.adjustment_hours) || 0) + delta)
          });
          continue;
        }
        const person = personBy.get(email);
        const type: any = types.find((candidate: any) => candidate.key === key);
        creates.push({
          company_id: companyId,
          branch_id: (person && person.branch_id) || '',
          employee_email: email,
          employee_name: (person && person.full_name) || email,
          employee_number: (person && person.employee_number) || '',
          leave_type_key: key,
          leave_type_name: (type && type.name) || key,
          accrual_anchor_at: `${todayIso()}T00:00:00.000Z`,
          opening_hours: 0,
          accrued_hours: 0,
          granted_hours: 0,
          adjustment_hours: round2(target),
          used_hours: 0,
          pending_hours: 0,
          last_accrued_at: new Date().toISOString()
        });
      }

      if (creates.length > 0) await base44.asServiceRole.entities.LeaveBalance.bulkCreate(creates);
      if (updates.length > 0) await base44.asServiceRole.entities.LeaveBalance.bulkUpdate(updates);

      return Response.json({ ok: true, created: creates.length, updated: updates.length });
    }

    return Response.json({
      ok: true,
      company_id: companyId,
      types: types.map((type: any) => ({
        key: type.key,
        name: type.name,
        name_ko: type.name_ko,
        emoji: type.emoji,
        employment_types: type.employment_types
      })),
      staff: staff.map((person: any) => ({
        email: person.user_email,
        name: person.full_name || person.user_email,
        employment_type: person.employment_type || 'casual',
        employee_number: person.employee_number || '',
        branch_id: person.branch_id || ''
      })),
      balances: balances.map((row: any) => ({
        employee_email: row.employee_email,
        leave_type_key: row.leave_type_key,
        available_hours: availableHours(row),
        opening_hours: Number(row.opening_hours) || 0,
        accrued_hours: Number(row.accrued_hours) || 0,
        granted_hours: Number(row.granted_hours) || 0,
        adjustment_hours: Number(row.adjustment_hours) || 0,
        used_hours: Number(row.used_hours) || 0,
        pending_hours: Number(row.pending_hours) || 0
      }))
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
