// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/createBranch/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { packageState } from '../_shared/packages.ts';

async function handler(req) {
  try {
    const base44 = createBase44Like();
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!me.company_id || me.app_role !== 'company_admin') {
      return Response.json({ error: 'Only a company admin can add branches' }, { status: 403 });
    }

    // Running more than one store is part of the top package only.
    const company = await base44.asServiceRole.entities.Company.get(me.company_id).catch(() => null);
    if (me.role !== 'admin' && company && company.package && packageState(company).features.multi_branch !== true) {
      return Response.json({ error: 'Adding branches is part of the Pro package' }, { status: 403 });
    }

    const body = await req.json();
    const input = body.branch || {};
    if (!input.name) return Response.json({ error: 'Branch name is required' }, { status: 400 });

    const rawCode = String(input.code || input.name);
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'BRN';

    const branch = await base44.asServiceRole.entities.Branch.create({
      company_id: me.company_id,
      name: input.name,
      code,
      address: input.address || '',
      suburb: input.suburb || '',
      state: input.state || '',
      postcode: input.postcode || '',
      phone: input.phone || '',
      trading_hours: input.trading_hours || '',
      manager_emails: [],
      employee_prefix: input.employee_prefix || `${code}-`,
      employee_number_padding: Number(input.employee_number_padding) || 3,
      employee_next_number: 1,
      gps_lat: Number(input.gps_lat) || 0,
      gps_lng: Number(input.gps_lng) || 0,
      gps_radius_m: Number(input.gps_radius_m) || 100,
      logo_url: input.logo_url || '',
      brand_color: input.brand_color || '#4338ca'
    });

    const users = await base44.asServiceRole.entities.User.filter({ company_id: me.company_id });
    for (const u of users) {
      const ids = Array.isArray(u.branch_ids) ? u.branch_ids : [];
      if (!ids.includes(branch.id)) {
        await base44.asServiceRole.entities.User.update(u.id, { branch_ids: [...ids, branch.id] });
      }
    }

    return Response.json({ ok: true, branch });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
