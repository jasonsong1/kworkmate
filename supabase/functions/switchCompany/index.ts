// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/switchCompany/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { switchUserToCompany } from '../_shared/companies.ts';
import { resolveCaller } from '../_shared/kwAuth.ts';

async function handler(req) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (me.role !== 'admin') {
      return Response.json({ error: 'Only the platform admin can switch companies' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.company_id) return Response.json({ error: 'company_id is required' }, { status: 400 });

    const company = await base44.asServiceRole.entities.Company.get(body.company_id).catch(() => null);
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });

    await switchUserToCompany(base44, me.id, company, me);
    return Response.json({ ok: true, company: { id: company.id, name: company.name } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
