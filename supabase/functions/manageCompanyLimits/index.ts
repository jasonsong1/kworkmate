// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/manageCompanyLimits/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { packageState, resolveLimit } from '../_shared/packages.ts';

function overrideValue(raw: any) {
  const text = String(raw === null || raw === undefined ? '' : raw).trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

// The two ceilings a company runs under — how many job ads it may have open at once and how
// many employees it may hold. Only a super admin writes here; the package supplies the
// default and an empty field hands the company back to it.
async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (me.role !== 'admin') {
      return Response.json({ error: 'Only a super admin can change these limits' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    if (!body.company_id) return Response.json({ error: 'company_id is required' }, { status: 400 });

    const company = await base44.asServiceRole.entities.Company.get(body.company_id).catch(() => null);
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });

    const jobOverride = overrideValue(body.job_limit_override);
    const employeeOverride = overrideValue(body.employee_limit_override);

    const patch: any = {};
    if (jobOverride === null) patch.job_limit_override = '';
    else patch.job_limit_override = jobOverride;
    if (employeeOverride === null) patch.employee_limit_override = '';
    else patch.employee_limit_override = employeeOverride;

    await base44.asServiceRole.entities.Company.update(company.id, patch);

    const updated = await base44.asServiceRole.entities.Company.get(company.id);
    const state = packageState(updated);

    return Response.json({
      ok: true,
      job_limit: resolveLimit(updated.job_limit_override, state.jobLimit),
      employee_limit: resolveLimit(updated.employee_limit_override, state.employeeLimit)
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
