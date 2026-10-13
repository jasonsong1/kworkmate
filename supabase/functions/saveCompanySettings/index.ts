// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/saveCompanySettings/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { accessFor, clean, resolveCaller } from '../_shared/kwAuth.ts';

// The company settings keys the back office writes. Anything else the caller sends is dropped.
const ALLOWED_KEYS = [
  'name',
  'abn',
  'contact_email',
  'contact_phone',
  'default_super_fund_name',
  'default_super_fund_abn',
  'default_super_fund_usi',
  'default_super_fund_phone',
  'ai_top_n',
  'auto_reject_email',
  'mini_interview_enabled',
  'video_interview_enabled',
  'screening_criteria',
  'interview_questions',
  'video_interview_questions',
  'pay_multipliers',
  'role_permissions',
  'custom_roles',
  'onboarding_docs',
  'onboarding_questions',
  'onboarding_doc_types',
  'onboarding_field_visibility'
];

// Company settings are written through here rather than from the browser: the caller's own grant
// is resolved on the server, and the write itself is done with the store's own rights. A company
// record that lists no members would otherwise refuse its own manager's save, while the screen
// reported it as done.
async function handler(req) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const companyId = clean(body.company_id) || clean(me.company_id);
    if (!companyId) return Response.json({ error: 'No company to save to' }, { status: 400 });

    const isSuperAdmin = me.role === 'admin';
    if (!isSuperAdmin && companyId !== clean(me.company_id)) {
      return Response.json({ error: 'You cannot change this company' }, { status: 403 });
    }

    // Whoever the company lets into its settings also saves them here: its own admins, and any
    // position the settings area is open to at all. The screens offer their Save button on this
    // same answer, so a button that is on screen is never refused.
    const isCompanyAdmin = isSuperAdmin || clean(me.app_role) === 'company_admin';
    if (!isCompanyAdmin) {
      const access = await accessFor(base44, me);
      const level = (access.settings && access.settings.level) || 'none';
      if (level === 'none') {
        return Response.json({ error: 'You cannot change the company settings' }, { status: 403 });
      }
    }

    const incoming = body.data && typeof body.data === 'object' ? body.data : {};
    const patch: any = {};
    ALLOWED_KEYS.forEach((key) => {
      if (key in incoming) patch[key] = incoming[key];
    });
    if (Object.keys(patch).length === 0) {
      return Response.json({ error: 'Nothing to save' }, { status: 400 });
    }

    const company = await base44.asServiceRole.entities.Company.update(companyId, patch);
    return Response.json({ ok: true, company });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
