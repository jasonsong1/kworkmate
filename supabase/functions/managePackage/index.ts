// supabase/functions/managePackage/index.ts
// 요금제 패키지 설정, 재활성화 및 한 달 늘리기(extend_month) Edge Function

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { isDay, normalizePackage, packageState, today } from '../_shared/packages.ts';
import { resolveCaller } from '../_shared/kwAuth.ts';

// 플랫폼 최고 관리자(Super Admin)만 요금제 및 이용 기간을 변경/연장할 수 있습니다.
async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    
    // 호출자 인증: base44.auth.me() 또는 resolveCaller를 통한 슈퍼어드민 검증
    let me: any = await resolveCaller(base44, req).catch(() => null);
    if (!me) {
      me = await base44.auth.me().catch(() => null);
    }
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isPlatformAdmin = Boolean(
      me.app_role === 'platform_admin' ||
      me.role === 'admin' ||
      me.isPlatformAdmin
    );
    if (!isPlatformAdmin) {
      return Response.json({ error: 'Only a super admin can change a package' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'set';
    if (!body.company_id) {
      return Response.json({ error: 'company_id is required' }, { status: 400 });
    }

    const company = await base44.asServiceRole.entities.Company.get(body.company_id).catch(() => null);
    if (!company) {
      return Response.json({ error: 'Company not found' }, { status: 404 });
    }

    const startDate = isDay(body.start_date) || today();

    if (action === 'extend_month') {
      // 1. [한 달 늘리기] 액션: 이용 기간을 30일 자동 연장
      const pkgKey = normalizePackage(company.package) || 'starter';
      const curState = packageState(company);
      let newStartDate = startDate;

      if (!company.package_start_date || curState.expired) {
        // 이미 만료되었거나 시작일이 없었던 경우 오늘부터 새로 45일 부여
        newStartDate = today();
      } else {
        // 아직 유효 기간이 남아있는 경우 기존 시작일에 +30일을 더해 만료일을 30일 뒤로 연장
        const curStartMs = new Date(company.package_start_date + 'T00:00:00Z').getTime();
        newStartDate = new Date(curStartMs + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      }

      await base44.asServiceRole.entities.Company.update(company.id, {
        package: pkgKey,
        package_start_date: newStartDate,
        package_reactivated_at: new Date().toISOString(),
        package_job_lock: false
      });
    } else if (action === 'set') {
      // 2. [패키지 저장] 액션: 새 패키지 및 시작일 설정
      const key = normalizePackage(body.package);
      if (!key) return Response.json({ error: 'Choose a package' }, { status: 400 });
      await base44.asServiceRole.entities.Company.update(company.id, {
        package: key,
        package_start_date: startDate,
        package_reactivated_at: '',
        package_job_lock: false
      });
    } else {
      // 3. [재활성화] 액션: 만료된 패키지를 오늘 날짜로 재활성화
      if (!company.package) return Response.json({ error: 'Assign a package first' }, { status: 400 });
      await base44.asServiceRole.entities.Company.update(company.id, {
        package_start_date: startDate,
        package_reactivated_at: new Date().toISOString(),
        package_job_lock: false
      });
    }

    const updated = await base44.asServiceRole.entities.Company.get(company.id);
    const state = packageState(updated);

    return Response.json({
      ok: true,
      package: state.key,
      start_date: state.startDate,
      expires_at: state.expiresOn,
      days_left: state.daysLeft
    });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
