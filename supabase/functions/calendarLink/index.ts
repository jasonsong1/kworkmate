// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/calendarLink/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function randomString(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += ALPHABET[bytes[index] % ALPHABET.length];
  }
  return out;
}

// The private address a person pastes into their phone calendar. It carries their employee
// number and eight random characters, so it is theirs alone and can be replaced at any time.
async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const origin = String(
      body.origin || req.headers.get('origin') || ''
    ).replace(/\/+$/, '');
    const rotate = body.action === 'rotate';

    const profile = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: me.email }, { limit: 1 })
    )[0];
    const companyId = (profile && profile.company_id) || me.company_id || '';

    const existing = rowsOf(
      await base44.asServiceRole.entities.CalendarSubscription.filter({ user_email: me.email }, { limit: 1 })
    )[0];

    let record = existing;
    if (!record) {
      record = await base44.asServiceRole.entities.CalendarSubscription.create({
        company_id: companyId,
        user_email: me.email,
        employee_number: (profile && profile.employee_number) || '',
        token: `${(profile && profile.employee_number) || 'staff'}${randomString(8)}`,
        active: true,
        rotated_at: new Date().toISOString()
      });
    } else if (rotate) {
      record = await base44.asServiceRole.entities.CalendarSubscription.update(record.id, {
        token: `${(profile && profile.employee_number) || 'staff'}${randomString(8)}`,
        active: true,
        rotated_at: new Date().toISOString()
      });
    } else if (record.active === false) {
      record = await base44.asServiceRole.entities.CalendarSubscription.update(record.id, { active: true });
    }

    return Response.json({
      ok: true,
      token: record.token,
      url: origin ? `${origin}/functions/calendarFeed?token=${encodeURIComponent(record.token)}` : '',
      active: record.active !== false
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
