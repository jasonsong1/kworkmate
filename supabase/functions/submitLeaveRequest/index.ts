// ==============================================================================
// KWorkMate 휴가 신청 처리 엣지 펑션 (submitLeaveRequest)
// 기능: 직원 휴가 신청 접수, 보유 잔액 검증(타 회사 혼선 방지 격리), 대기 시간(pending_hours) 차감, 매니저 알림
// ==============================================================================

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';
import { DEFAULT_LEAVE_TYPES, HOURS_PER_DAY, activeTypes, availableHours, eligibleFor, periodDays, round2 } from '../_shared/leave.ts';
import { branchManagers, employeeRecipients, languageMap, notifyStaff } from '../_shared/notify.ts';
import { leaveRequestedMail } from '../_shared/employeeMail.ts';

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

function isDay(value: any) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').slice(0, 10)) ? String(value).slice(0, 10) : '';
}

async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const startDate = isDay(body.start_date);
    const endDate = isDay(body.end_date) || startDate;
    if (!startDate || endDate < startDate) {
      return Response.json({ error: 'invalid_dates' }, { status: 400 });
    }

    // [보안 패치]: 로그인한 세션의 profile_id 또는 company_id를 최우선으로 일치시켜 현재 지사 프로필을 특정
    let profile = null;
    const targetProfileId = me.profile_id || me.id;
    if (targetProfileId) {
      profile = await base44.asServiceRole.entities.EmployeeProfile.get(targetProfileId).catch(() => null);
    }
    if (!profile && me.company_id) {
      const byComp = rowsOf(
        await base44.asServiceRole.entities.EmployeeProfile.filter(
          { user_email: me.email, company_id: me.company_id },
          { limit: 1 }
        )
      );
      profile = byComp[0] || null;
    }
    if (!profile) {
      profile = rowsOf(
        await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: me.email }, { limit: 1 })
      )[0];
    }
    if (!profile) return Response.json({ error: 'no_profile' }, { status: 400 });

    const companyId = profile.company_id || me.company_id || '';
    const branch = profile.branch_id
      ? await base44.asServiceRole.entities.Branch.get(profile.branch_id).catch(() => null)
      : null;
    const company = companyId
      ? await base44.asServiceRole.entities.Company.get(companyId).catch(() => null)
      : null;

    const stored = rowsOf(
      await base44.asServiceRole.entities.LeaveType.filter({ company_id: companyId }, { limit: 100 })
    );
    const types = activeTypes((stored.length > 0 ? stored : DEFAULT_LEAVE_TYPES) as any[]);
    const type = types.find((row: any) => row.key === String(body.leave_type_key || ''));
    if (!type) return Response.json({ error: 'unknown_type' }, { status: 400 });
    if (!eligibleFor(type, profile.employment_type || 'casual')) {
      return Response.json({ error: 'not_eligible' }, { status: 400 });
    }

    const days = periodDays(startDate, endDate);
    const asked = Number(body.hours);
    const hours = round2(asked > 0 ? asked : days * HOURS_PER_DAY);
    if (hours <= 0) return Response.json({ error: 'invalid_hours' }, { status: 400 });

    const earned = type.accrual_method === 'ordinary_hours' || type.grant_enabled;
    let balanceId = '';
    if (earned) {
      // [보안 패치]: 현재 소속 회사(companyId) 및 직원 번호(employee_number)를 1순위로 조회하여
      // 타 회사(Starter Company)의 다른 레코드가 잡히는 오류를 원천 차단합니다.
      let balance = null;
      if (profile.employee_number) {
        const byNum = rowsOf(
          await base44.asServiceRole.entities.LeaveBalance.filter(
            { company_id: companyId, employee_number: profile.employee_number, leave_type_key: type.key },
            { limit: 1 }
          )
        );
        balance = byNum[0] || null;
      }
      if (!balance) {
        const byComp = rowsOf(
          await base44.asServiceRole.entities.LeaveBalance.filter(
            { company_id: companyId, employee_email: me.email, leave_type_key: type.key },
            { limit: 1 }
          )
        );
        balance = byComp[0] || null;
      }
      if (!balance) {
        const fallback = rowsOf(
          await base44.asServiceRole.entities.LeaveBalance.filter(
            { employee_email: me.email, leave_type_key: type.key },
            { limit: 1 }
          )
        );
        balance = fallback[0] || null;
      }

      if (!balance) {
        balance = await base44.asServiceRole.entities.LeaveBalance.create({
          company_id: companyId,
          branch_id: profile.branch_id || '',
          employee_email: me.email,
          employee_name: profile.full_name || me.email,
          employee_number: profile.employee_number || '',
          leave_type_key: type.key,
          leave_type_name: type.name,
          accrual_anchor_at: `${profile.start_date || startDate}T00:00:00.000Z`
        });
      }
      balanceId = balance.id;
      const left = availableHours(balance);
      if (left + 0.001 < hours) {
        return Response.json({ error: 'insufficient', available: left }, { status: 400 });
      }
    }

    const request = await base44.asServiceRole.entities.LeaveRequest.create({
      company_id: companyId,
      branch_id: profile.branch_id || '',
      employee_email: me.email,
      employee_name: profile.full_name || me.email,
      employee_number: profile.employee_number || '',
      leave_type_key: type.key,
      leave_type_name: type.name,
      paid: type.paid !== false,
      start_date: startDate,
      end_date: endDate,
      days,
      hours,
      reason: String(body.reason || '').slice(0, 500),
      status: 'pending',
      certificate_file_uri: String(body.certificate_file_uri || ''),
      certificate_filename: String(body.certificate_filename || '')
    });

    if (balanceId) {
      const current = await base44.asServiceRole.entities.LeaveBalance.get(balanceId).catch(() => null);
      if (current) {
        await base44.asServiceRole.entities.LeaveBalance.update(balanceId, {
          pending_hours: round2((Number(current.pending_hours) || 0) + hours)
        });
      }
    }

    const range = startDate === endDate ? startDate : `${startDate} – ${endDate}`;
    const managers = await branchManagers(base44, company, branch);
    if (managers.length > 0) {
      const languages = await languageMap(base44, profile.branch_id || '');
      const recipients = await employeeRecipients(base44, managers, languages);
      await notifyStaff(base44, {
        company,
        branch,
        recipients,
        type: 'leave_requested',
        title: `Leave request · ${profile.full_name || me.email}`,
        body: `${type.name} · ${range} · ${hours}h`,
        link: '/leave',
        mail: (lang: string) =>
          leaveRequestedMail(lang, {
            employeeName: profile.full_name || me.email,
            typeName: type.name,
            range,
            hours
          })
      });
    }

    return Response.json({ ok: true, request_id: request.id, hours });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
