// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/managePackage/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { isDay, normalizePackage, packageState, today } from '../_shared/packages.ts';

// Assigning, changing or reactivating a company's pricing package. A super admin is the
// only person allowed to write here; everyone else only ever reads the package.
async function handler(req) {
  try {
    const base44 = createBase44Like();
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (me.role !== 'admin') {
      return Response.json({ error: 'Only a super admin can change a package' }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action === 'reactivate' ? 'reactivate' : 'set';
    if (!body.company_id) return Response.json({ error: 'company_id is required' }, { status: 400 });

    const company = await base44.asServiceRole.entities.Company.get(body.company_id).catch(() => null);
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });

    const startDate = isDay(body.start_date) || today();

    if (action === 'set') {
      const key = normalizePackage(body.package);
      if (!key) return Response.json({ error: 'Choose a package' }, { status: 400 });
      await base44.asServiceRole.entities.Company.update(company.id, {
        package: key,
        package_start_date: startDate,
        package_reactivated_at: '',
        package_job_lock: false
      });
    } else {
      if (!company.package) return Response.json({ error: 'Assign a package first' }, { status: 400 });
      // Reactivating opens another full access period and releases the locked job ads.
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
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
