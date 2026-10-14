// 슈퍼어드민(sym910403@gmail.com)을 포함한 회사 관리자가 지점을 추가하는 Edge Function.
// 세션 토큰(x-kw-session)으로 직접 인증하며, 슈퍼어드민은 모든 제한(패키지/회사 소속)을 우회합니다.
// (Supabase 클라우드에 배포된 버전과 동일한 자체 완결형 코드입니다.)
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-kw-session',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function newId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false }
    });

    let body: any = {};
    try { body = await req.json(); } catch { /* ignore */ }
    const token = req.headers.get('x-kw-session') || body.kw_session || '';
    if (!token) return json({ error: 'Unauthorized' }, 401);

    const { data: session } = await supabase.from('login_session').select('*').eq('token', token).eq('active', true).maybeSingle();
    if (!session) return json({ error: 'Unauthorized' }, 401);

    const isSuper = session.app_role === 'super_admin' || String(session.email || '').trim().toLowerCase() === 'sym910403@gmail.com';
    const isCompanyAdmin = session.app_role === 'company_admin';
    if (!isSuper && !isCompanyAdmin) return json({ error: 'Only a company admin can add branches' }, 403);

    // 슈퍼어드민은 body.company_id 또는 현재 세션의 회사를 사용
    const companyId = (isSuper ? (body.company_id || session.company_id) : session.company_id) || '';
    if (!companyId) return json({ error: 'No company selected. Enter a company first.' }, 400);

    const input = body.branch || {};
    if (!input.name) return json({ error: 'Branch name is required' }, 400);

    const rawCode = String(input.code || input.name);
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'BRN';
    const now = new Date().toISOString();
    const branch = {
      id: newId(),
      company_id: companyId,
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
      brand_color: input.brand_color || '#4338ca',
      created_date: now,
      updated_date: now
    };
    const { data: created, error } = await supabase.from('branch').insert(branch).select().single();
    if (error) throw error;

    // 현재 세션에 새 지점을 연결
    const sids = Array.isArray(session.branch_ids) ? session.branch_ids : [];
    await supabase.from('login_session').update({
      company_id: companyId,
      branch_ids: sids.includes(created.id) ? sids : [...sids, created.id]
    }).eq('token', token);

    return json({ ok: true, branch: created });
  } catch (error: any) {
    return json({ error: error?.message || 'Server error' }, 500);
  }
});
