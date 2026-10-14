// supabase/functions/adminLeaveBalances/index.ts
// 최고 관리자(슈퍼어드민) 전용: 회사의 직원들의 기존 휴가 잔액을 일괄 조회 및 조정하는 함수입니다.

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';
import { activeTypes, availableHours, leaveTypesFrom, round2 } from '../_shared/leave.ts';
import { rowsOf, todayIso } from '../_shared/util.ts';

// 플랫폼 최고 관리자(슈퍼어드민)만 진입하여 직원의 휴가 잔액을 조정합니다.
async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // [슈퍼어드민 단독 권한 검사]:
    // Supabase Auth 세션의 me.role이 'admin'이거나, app_role이 'super_admin'이거나, 지정된 슈퍼어드민 이메일(sym910403@gmail.com)인 경우만 허용
    const meEmail = String(me.email || '').trim().toLowerCase();
    const isSuper = me.role === 'admin' || me.app_role === 'super_admin' || meEmail === 'sym910403@gmail.com';
    if (!isSuper) {
      return Response.json({ error: '슈퍼어드민만 휴가 잔액을 조정할 수 있습니다.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const companyId = body.company_id || me.company_id || '';
    if (!companyId) return Response.json({ error: 'company_id is required' }, { status: 400 });

    const stored = rowsOf(
      await base44.asServiceRole.entities.LeaveType.filter({ company_id: companyId }, { limit: 100 })
    );
    const allTypes = leaveTypesFrom(stored);
    const types = activeTypes(allTypes);

    // 해당 회사에 소속된 활성 직원 전체를 조회합니다.
    // 슈퍼어드민 본인은 휴가 잔액 조정 대상 직원이 아니므로 목록에서 제외합니다.
    const rawStaff = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter(
        { company_id: companyId, status: 'active' },
        { sort: 'full_name', limit: 500 }
      )
    );
    const staff = rawStaff.filter((person: any) => {
      const email = String(person.user_email || '').trim().toLowerCase();
      return email && email !== 'sym910403@gmail.com' && person.app_role !== 'super_admin';
    });

    const balances = rowsOf(
      await base44.asServiceRole.entities.LeaveBalance.filter({ company_id: companyId }, { limit: 2000 })
    );
    const byKey = new Map<string, any>(
      balances.map((row: any) => [`${row.employee_email}::${row.leave_type_key}`, row])
    );

    // [잔액 저장 동작]:
    // 원하는 목표 시간(target_hours)과 현재 시간의 차이를 계산하여 adjustment_hours(조정값)로 안전하게 저장합니다.
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
    console.error('[adminLeaveBalances] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
