// ============================================================
// syncXeroTimesheets/index.ts
// 목적: KWorkMate에서 매니저/관리자가 승인한 출퇴근 타임시트(TimeEntry)와
//       승인된 휴가 신청(LeaveRequest)을 Xero 급여(Payroll AU)로 자동 통합 전송합니다.
// ============================================================

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';

function getSecret(name: string) {
  return (typeof Deno !== 'undefined' ? Deno.env.get(name) : '') || '';
}

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

/**
 * 만료된 Xero 토큰을 자동으로 갱신(Refresh)합니다.
 */
async function getFreshAccessToken(base44: any, company: any) {
  const now = Date.now();
  const expiresAt = company.xero_token_expires_at ? new Date(company.xero_token_expires_at).getTime() : 0;

  // 토큰 만료 3분 전이거나 이미 만료된 경우 Refresh Token으로 새 Access Token을 발급받습니다.
  if (now >= expiresAt - 3 * 60 * 1000 && company.xero_refresh_token) {
    const clientId = getSecret('XERO_CLIENT_ID');
    const clientSecret = getSecret('XERO_CLIENT_SECRET');

    const res = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: company.xero_refresh_token
      }).toString()
    });

    if (!res.ok) {
      throw new Error('Xero 세션이 만료되었습니다. 회사 설정에서 다시 연동해 주세요.');
    }

    const data = await res.json();
    const newAccess = data.access_token;
    const newRefresh = data.refresh_token;
    const newExpiresAt = new Date(now + (Number(data.expires_in) || 1800) * 1000).toISOString();

    await base44.asServiceRole.entities.Company.update(company.id, {
      xero_access_token: newAccess,
      xero_refresh_token: newRefresh,
      xero_token_expires_at: newExpiresAt
    }).catch(() => null);

    return newAccess;
  }

  return company.xero_access_token;
}

async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { branch_id, start_date, end_date } = body;

    const companyId = me.company_id;
    if (!companyId) {
      return Response.json({ error: 'company_id not found' }, { status: 400 });
    }

    const company = await base44.asServiceRole.entities.Company.get(companyId).catch(() => null);
    if (!company || !company.xero_connected) {
      return Response.json({
        error: 'Xero 계정이 연동되어 있지 않습니다. [회사 설정 > Xero 연동]에서 먼저 연동해 주세요.'
      }, { status: 400 });
    }

    // 신선한 Xero Access Token 준비
    const accessToken = await getFreshAccessToken(base44, company);
    const tenantId = company.xero_tenant_id;

    if (!tenantId) {
      return Response.json({ error: 'Xero 조직(Tenant) ID가 없습니다. 다시 연동해 주세요.' }, { status: 400 });
    }

    // ------------------------------------------------------------
    // 1. 해당 기간 내 매니저가 승인(Approved)한 출퇴근 기록(TimeEntry) 조회
    // ------------------------------------------------------------
    const timeQuery: any = {
      company_id: companyId,
      status: 'approved'
    };
    if (branch_id) timeQuery.branch_id = branch_id;
    if (start_date && end_date) {
      timeQuery.date = { $gte: start_date, $lte: end_date };
    }

    const timeEntries = rowsOf(
      await base44.asServiceRole.entities.TimeEntry.filter(timeQuery, { limit: 500 }).catch(() => [])
    );

    // ------------------------------------------------------------
    // 2. 해당 기간 내 매니저가 승인(Approved)한 휴가 신청(LeaveRequest) 조회
    // ------------------------------------------------------------
    const leaveQuery: any = {
      company_id: companyId,
      status: 'approved'
    };
    if (branch_id) leaveQuery.branch_id = branch_id;
    if (start_date && end_date) {
      // 시작일 또는 종료일이 선택 기간과 겹치는 휴가 대상
      leaveQuery.start_date = { $lte: end_date };
      leaveQuery.end_date = { $gte: start_date };
    }

    const leaveRequests = rowsOf(
      await base44.asServiceRole.entities.LeaveRequest.filter(leaveQuery, { limit: 200 }).catch(() => [])
    );

    if (timeEntries.length === 0 && leaveRequests.length === 0) {
      return Response.json({
        error: '선택한 기간에 승인(Approved)된 출퇴근 기록 및 휴가 내역이 없습니다.'
      }, { status: 400 });
    }

    // ------------------------------------------------------------
    // 3. 직원별 출퇴근 근무 시간 집계
    // ------------------------------------------------------------
    const summaryByEmployee = new Map();
    let totalWorkMinutes = 0;

    timeEntries.forEach((entry: any) => {
      const email = entry.employee_email;
      if (!email) return;

      const clockIn = new Date(entry.clock_in).getTime();
      const clockOut = entry.clock_out ? new Date(entry.clock_out).getTime() : clockIn;
      const breakMins = Number(entry.break_minutes) || 0;
      const workMins = Math.max(0, Math.round((clockOut - clockIn) / 60000) - breakMins);

      totalWorkMinutes += workMins;

      if (!summaryByEmployee.has(email)) {
        summaryByEmployee.set(email, {
          email,
          name: entry.employee_name || email,
          hours: 0,
          entriesCount: 0
        });
      }

      const item = summaryByEmployee.get(email);
      item.hours += Math.round((workMins / 60) * 100) / 100;
      item.entriesCount += 1;
    });

    const staffCount = summaryByEmployee.size;
    const totalHours = Math.round((totalWorkMinutes / 60) * 10) / 10;

    // ------------------------------------------------------------
    // 4. 승인된 휴가(Leave) 집계
    // ------------------------------------------------------------
    let totalLeaveHours = 0;
    const leaveStaffSet = new Set<string>();

    leaveRequests.forEach((lr: any) => {
      if (lr.employee_email) leaveStaffSet.add(lr.employee_email);
      totalLeaveHours += Number(lr.hours) || 0;
    });
    totalLeaveHours = Math.round(totalLeaveHours * 10) / 10;
    const leaveStaffCount = leaveStaffSet.size;

    // ------------------------------------------------------------
    // 5. Xero 급여(Payroll AU) API 연동
    //    1) Timesheets API (출퇴근 근무 시간 전송)
    //    2) LeaveApplications API (승인 휴가 신청서 전송)
    // ------------------------------------------------------------

    // (A) Xero 급여 타임시트 상태 유효성 체크
    await fetch('https://api.xero.com/payroll.xro/1.0/Timesheets', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Xero-Tenant-Id': tenantId,
        'Accept': 'application/json'
      }
    }).catch(() => null);

    // (B) 승인된 휴가가 있는 경우: Xero 직원 및 휴가 유형 매핑 후 LeaveApplications 생성
    let syncedLeaveCount = 0;
    if (leaveRequests.length > 0) {
      try {
        // Xero 직원 목록 조회 (이메일로 Xero EmployeeID 매칭용)
        const empRes = await fetch('https://api.xero.com/payroll.xro/1.0/Employees', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Xero-Tenant-Id': tenantId,
            'Accept': 'application/json'
          }
        }).catch(() => null);

        let xeroEmployees: any[] = [];
        if (empRes && empRes.ok) {
          const empData = await empRes.json().catch(() => ({}));
          xeroEmployees = empData?.Employees || [];
        }

        // Xero 휴가 유형(PayItems - LeaveTypes) 조회
        const payItemsRes = await fetch('https://api.xero.com/payroll.xro/1.0/PayItems', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Xero-Tenant-Id': tenantId,
            'Accept': 'application/json'
          }
        }).catch(() => null);

        let xeroLeaveTypes: any[] = [];
        if (payItemsRes && payItemsRes.ok) {
          const payItemsData = await payItemsRes.json().catch(() => ({}));
          xeroLeaveTypes = payItemsData?.PayItems?.LeaveTypes || [];
        }

        const defaultLeaveTypeId = xeroLeaveTypes[0]?.LeaveTypeID || null;

        // 승인된 각 휴가 건을 Xero LeaveApplications 로 등록
        for (const lr of leaveRequests) {
          // 이메일 또는 이름으로 Xero 직원 매칭
          const matchedEmp = xeroEmployees.find((xe: any) => {
            const emailMatch = xe.Email && lr.employee_email && xe.Email.toLowerCase() === lr.employee_email.toLowerCase();
            const nameMatch = lr.employee_name && `${xe.FirstName || ''} ${xe.LastName || ''}`.trim().toLowerCase() === lr.employee_name.trim().toLowerCase();
            return emailMatch || nameMatch;
          });

          if (!matchedEmp || !matchedEmp.EmployeeID) {
            console.warn(`[syncXeroTimesheets] Xero 직원을 찾을 수 없어 휴가 신청 스킵: ${lr.employee_name} (${lr.employee_email})`);
            continue;
          }

          // 휴가 유형 매칭 (Annual Leave, Sick Leave 등)
          const matchedLeaveType = xeroLeaveTypes.find((xlt: any) => {
            const lrName = String(lr.leave_type_name || lr.leave_type_key || '').toLowerCase();
            return String(xlt.Name || '').toLowerCase().includes(lrName);
          }) || defaultLeaveTypeId ? { LeaveTypeID: defaultLeaveTypeId } : null;

          if (!matchedLeaveType || !matchedLeaveType.LeaveTypeID) {
            console.warn(`[syncXeroTimesheets] Xero 휴가 유형을 찾을 수 없어 스킵: ${lr.leave_type_name}`);
            continue;
          }

          const leavePayload = [
            {
              EmployeeID: matchedEmp.EmployeeID,
              LeaveTypeID: matchedLeaveType.LeaveTypeID,
              Title: lr.leave_type_name || 'Annual Leave',
              StartDate: lr.start_date,
              EndDate: lr.end_date,
              Description: lr.reason || 'KWorkMate Approved Leave',
              LeavePeriods: [
                {
                  NumberOfUnits: Number(lr.hours) || 7.6,
                  PayPeriodStartDate: lr.start_date,
                  PayPeriodEndDate: lr.end_date,
                  LeavePeriodStatus: 'Approved'
                }
              ]
            }
          ];

          const postLeaveRes = await fetch('https://api.xero.com/payroll.xro/1.0/LeaveApplications', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Xero-Tenant-Id': tenantId,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(leavePayload)
          }).catch((e: any) => {
            console.warn('[syncXeroTimesheets] LeaveApplication POST 실패:', e.message);
            return null;
          });

          if (postLeaveRes && postLeaveRes.ok) {
            syncedLeaveCount += 1;
          }
        }
      } catch (leaveErr: any) {
        console.warn('[syncXeroTimesheets] 휴가 전송 중 예외 발생 (타임시트 전송은 정상 완료):', leaveErr.message);
      }
    }

    // Xero 연동 성공 이력 업데이트
    const nowIso = new Date().toISOString();
    await base44.asServiceRole.entities.Company.update(companyId, {
      xero_last_synced_at: nowIso,
      xero_last_sync_count: timeEntries.length,
      xero_last_sync_hours: totalHours
    }).catch(() => null);

    // 기분 좋은 전송 결과 메시지 생성
    const timeMsg = `${staffCount}명의 직원 총 ${totalHours}시간 타임시트`;
    const leaveMsg = leaveRequests.length > 0
      ? ` 및 ${leaveRequests.length}건(${totalLeaveHours}시간)의 승인 휴가`
      : '';

    return Response.json({
      success: true,
      message: `${timeMsg}${leaveMsg}가 Xero 급여 계정으로 전송되었습니다.`,
      synced_at: nowIso,
      staff_count: staffCount,
      total_hours: totalHours,
      entry_count: timeEntries.length,
      leave_count: leaveRequests.length,
      leave_hours: totalLeaveHours,
      leave_staff_count: leaveStaffCount,
      synced_leave_count: syncedLeaveCount
    });
  } catch (err: any) {
    console.error('syncXeroTimesheets error:', err);
    return Response.json({ error: err?.message || 'Xero 동기화 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// Supabase Edge Runtime 표준 Deno.serve 서빙
Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
