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

// 사원의 개인 캘린더 피드 주소를 발급합니다.
// 모바일 기기(아이폰/안드로이드) 캘린더 앱에서 SSL 보안 오류 없이 바로 구독할 수 있도록
// 정식 Supabase Edge Function 보안 HTTPS 주소 및 webcal:// 주소를 생성합니다.
async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
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

    // Supabase 정식 Edge Function 엔드포인트 URL 생성 (SSL 인증서 보안 연결 보장)
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') || 'https://yktviwzqjzhfbfuuaamf.supabase.co').replace(/\/+$/, '');
    const feedUrl = `${supabaseUrl}/functions/v1/calendarFeed?token=${encodeURIComponent(record.token)}`;
    const webcalUrl = feedUrl.replace(/^https?:\/\//i, 'webcal://');

    return Response.json({
      ok: true,
      token: record.token,
      url: feedUrl,
      webcal_url: webcalUrl,
      active: record.active !== false
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
