// supabase/functions/leaveSummary/index.ts
// 휴가 관리 화면에서 현재 유효한 휴가 잔액과 요청 내역, 휴가 설정을 반환하는 함수입니다.

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

// 휴가 잔액 및 신청 현황을 계산하여 반환합니다.
async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const today = todayIso();
    const branchId = body.branch_id || me.branch_id || '';

    // 슈퍼어드민(sym910403@gmail.com), 회사 관리자, 지점 매니저 권한 판별
    const meEmail = String(me.email || '').trim().toLowerCase();
    const isSuper = me.role === 'admin' || me.app_role === 'super_admin' || meEmail === 'sym910403@gmail.com';
    const isCompanyAdmin = isSuper || me.app_role === 'company_admin';
    const manages =
      isSuper ||
      isCompanyAdmin ||
      me.role === 'admin' ||
      (branchId && Array.isArray(me.branch_ids) && me.branch_ids.includes(branchId));
    const teamView = Boolean(body.team) && Boolean(manages);

    const branch = branchId ? await base44.asServiceRole.entities.Branch.get(branchId).catch(() => null) : null;
    const companyId = (branch && branch.company_id) || me.company_id || '';
    const company = companyId ? await base44.asServiceRole.entities.Company.get(companyId).catch(() => null) : null;

    const caller = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: me.email }, { limit: 1 }).catch(() => [])
    )[0];

    // 휴가 정책 설정 변경 권한
    const runsStore =
      isSuper ||
      isCompanyAdmin ||
      me.role === 'admin' ||
      me.app_role === 'branch_manager' ||
      holdsManagerPosition(caller, managerPositionLabels(company && company.custom_roles));

    let staff: any[] = [];
    if (teamView) {
      // 해당 지점의 활성 직원 전체를 가져옵니다.
      // 슈퍼어드민 본인은 지점 일반 직원이 아니므로 목록에서 확실히 제외합니다.
      const allBranchStaff = rowsOf(
        await base44.asServiceRole.entities.EmployeeProfile.filter(
          { branch_id: branchId, status: 'active' },
          { limit: 500 }
        )
      );
      staff = allBranchStaff.filter((person: any) => {
        const email = String(person.user_email || '').trim().toLowerCase();
        return email !== 'sym910403@gmail.com' && person.app_role !== 'super_admin';
      });
    } else {
      const profile = rowsOf(
        await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: me.email }, { limit: 1 })
      )[0];
      if (profile) staff = [profile];
    }

    const stored = rowsOf(
      await base44.asServiceRole.entities.LeaveType.filter({ company_id: companyId }, { limit: 100 })
    );
    // 회사가 제공하는 모든 휴가 유형과 현재 활성화된 유형 목록
    const allTypes = leaveTypesFrom(stored);
    const types = activeTypes(allTypes);

    if (staff.length === 0) {
      return Response.json({
        ok: true,
        scope: teamView ? 'team' : 'self',
        types,
        all_types: allTypes,
        staff: [],
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

    // 실제 근무 기록을 통해 자동 누적(accrual) 시간 계산
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
        const eligible = eligibleFor(type, employment);
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
          accrued_hours: eligible && type.accrual_method === 'ordinary_hours' ? round2(type.accrual_rate * ordinaryHours) : 0,
          granted_hours: Number((existing && existing.granted_hours) || 0),
          adjustment_hours: Number((existing && existing.adjustment_hours) || 0),
          used_hours: Number((existing && existing.used_hours) || 0),
          pending_hours: Number((existing && existing.pending_hours) || 0),
          grant_period: (existing && existing.grant_period) || '',
          granted_expires_at: (existing && existing.granted_expires_at) || '',
          note: (existing && existing.note) || '',
          last_accrued_at: new Date().toISOString()
        };

        if (eligible && type.grant_enabled && grantsFor(type, employment)) {
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
          if (eligible) creates.push(next);
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
    console.error('[leaveSummary] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
