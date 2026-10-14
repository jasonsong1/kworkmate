// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/createCompany/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';

// 세션 토큰으로부터 로그인한 관리자 신원을 판별합니다.
async function resolveSessionUser(base44: any, req: Request) {
  let token = req.headers.get('x-kw-session') || '';
  if (!token) {
    try {
      const copy = req.clone();
      const body = await copy.json();
      token = body?.kw_session || '';
    } catch {
      // 무시
    }
  }
  if (!token) return null;
  const sessions = await base44.asServiceRole.entities.LoginSession.filter(
    { token, active: true },
    { limit: 1 }
  ).catch(() => []);
  const session = sessions[0];
  if (!session) return null;

  const isSuper =
    session.app_role === 'super_admin' ||
    String(session.email || '').trim().toLowerCase() === 'sym910403@gmail.com';
  return {
    id: session.profile_id,
    email: session.email,
    role: isSuper ? 'admin' : (session.role || 'user'),
    app_role: isSuper ? 'company_admin' : (session.app_role || 'staff'),
    company_id: session.company_id || '',
    branch_id: session.branch_id || '',
    session_token: session.token
  };
}

async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const me = await resolveSessionUser(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (me.role !== 'admin') {
      return Response.json({ error: 'Only the platform admin can create companies' }, { status: 403 });
    }

    const body = await req.json();
    const name = String(body.name || '').trim();
    if (!name) return Response.json({ error: 'Company name is required' }, { status: 400 });

    const same = await base44.asServiceRole.entities.Company.filter({ name }).catch(() => []);
    if (same && same.length > 0) {
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

    // 슈퍼어드민 세션 및 프로필 활성 회사를 새 회사로 전환
    if (me.id) {
      await base44.asServiceRole.entities.EmployeeProfile.update(me.id, {
        company_id: company.id
      }).catch(() => null);
    }
    if (me.session_token) {
      await base44.asServiceRole.entities.LoginSession.updateMany(
        { token: me.session_token },
        { $set: { company_id: company.id } }
      ).catch(() => null);
    }

    return Response.json({ ok: true, company: { id: company.id, name: company.name } });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
