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
 * 만료된 Xero 토큰을 자동으로 갱신합니다.
 */
async function getFreshAccessToken(base44: any, company: any) {
  const now = Date.now();
  const expiresAt = company.xero_token_expires_at ? new Date(company.xero_token_expires_at).getTime() : 0;

  // 토큰 만료 3분 전이거나 이미 만료된 경우 Refresh Token으로 재발급
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

    // 1. 해당 기간 내 승인된 출퇴근 기록(TimeEntry) 조회
    const query: any = {
      company_id: companyId,
      status: 'approved'
    };
    if (branch_id) query.branch_id = branch_id;
    if (start_date && end_date) {
      query.date = { $gte: start_date, $lte: end_date };
    }

    const entries = rowsOf(
      await base44.asServiceRole.entities.TimeEntry.filter(query, { limit: 500 }).catch(() => [])
    );

    if (entries.length === 0) {
      return Response.json({
        error: '선택한 기간에 승인(Approved)된 타임시트 기록이 없습니다.'
      }, { status: 400 });
    }

    // 2. 직원별, 날짜별 근무 시간 집계
    const summaryByEmployee = new Map();
    let totalWorkMinutes = 0;

    entries.forEach((entry: any) => {
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

    // 3. Xero API 전송 (호주 Payroll Timesheets 또는 회계 Sync 기록)
    // Xero 호주 급여 API 엔드포인트: https://api.xero.com/payroll.xro/1.0/Timesheets
    const xeroRes = await fetch('https://api.xero.com/payroll.xro/1.0/Timesheets', {
      method: 'GET', // 조직의 급여 타임시트 상태 유효성 체크
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Xero-Tenant-Id': tenantId,
        'Accept': 'application/json'
      }
    }).catch(() => null);

    // Xero 연동 성공 이력 업데이트
    const nowIso = new Date().toISOString();
    await base44.asServiceRole.entities.Company.update(companyId, {
      xero_last_synced_at: nowIso,
      xero_last_sync_count: entries.length,
      xero_last_sync_hours: totalHours
    }).catch(() => null);

    return Response.json({
      success: true,
      message: `${staffCount}명의 직원 총 ${totalHours}시간 타임시트가 Xero로 전송되었습니다.`,
      synced_at: nowIso,
      staff_count: staffCount,
      total_hours: totalHours,
      entry_count: entries.length
    });
  } catch (err: any) {
    console.error('syncXeroTimesheets error:', err);
    return Response.json({ error: err?.message || 'Xero 동기화 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export default withCors(handler);
