// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/createCompany/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { switchUserToCompany } from '../_shared/companies.ts';

async function handler(req) {
  try {
    const base44 = createBase44Like();
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (me.role !== 'admin') {
      return Response.json({ error: 'Only the platform admin can create companies' }, { status: 403 });
    }

    const body = await req.json();
    const name = String(body.name || '').trim();
    if (!name) return Response.json({ error: 'Company name is required' }, { status: 400 });

    const same = await base44.asServiceRole.entities.Company.filter({ name });
    if (same.length > 0) {
      return Response.json({ error: 'A company with this name already exists' }, { status: 400 });
    }

    // The new company starts without members: its own company admin is appointed in Company settings.
    const company = await base44.asServiceRole.entities.Company.create({
      name,
      abn: String(body.abn || '').trim(),
      brand_color: '#4338ca',
      member_emails: [],
      auto_reject_email: true,
      mini_interview_enabled: true,
      ai_top_n: 10
    });

    await switchUserToCompany(base44, me.id, company);
    return Response.json({ ok: true, company: { id: company.id, name: company.name } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
