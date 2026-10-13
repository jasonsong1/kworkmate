// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/generateRoster/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { buildDraft, startOfWeekIso } from '../_shared/roster.ts';
import { resolveCaller } from '../_shared/kwAuth.ts';

// Builds a draft week from the store's saved shift patterns, submitted availability and work
// rules, and files it as draft shifts for the manager to confirm and send.
async function handler(req) {
  try {
    const base44 = createBase44Like();
    // Either door the employer signed in through answers here: the ID their employer issued, or a
    // platform account.
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Sign-in required' }, { status: 401 });

    const body = await req.json();
    const branch = await base44.asServiceRole.entities.Branch.get(body.branch_id).catch(() => null);
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 });
    const allowed = me.role === 'admin' || (Array.isArray(me.branch_ids) && me.branch_ids.includes(branch.id));
    if (!allowed) return Response.json({ error: 'You cannot manage this branch' }, { status: 403 });

    const result = await buildDraft(base44, branch, startOfWeekIso(body.week_start));
    if (result.error === 'no_settings') {
      return Response.json({ error: 'no_settings' }, { status: 400 });
    }
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
