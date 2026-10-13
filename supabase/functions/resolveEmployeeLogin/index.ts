// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/resolveEmployeeLogin/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';

// The employer hands out an employee number, and the platform emails the password link, so the
// number only has to find the work address the account belongs to. Nothing here signs anyone in:
// the platform still checks the password itself.
async function handler(req) {
  try {
    const base44 = createBase44Like();
    const body = await req.json();
    const number = String(body.employee_number || '').trim();
    if (!number) return Response.json({ error: 'Employee number is required' }, { status: 400 });

    const safe = number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const profiles = await base44.asServiceRole.entities.EmployeeProfile.filter({
      employee_number: { $regex: `^${safe}$`, $options: 'i' },
      status: 'active'
    });

    const emails = [
      ...new Set(profiles.map((p) => String(p.user_email || '').trim().toLowerCase()).filter(Boolean))
    ];
    if (emails.length === 0) {
      return Response.json({ error: 'No employee is registered with that number' }, { status: 404 });
    }
    // The number only identifies one person inside a company, so an address shared by two
    // accounts has to be signed in with the email instead.
    if (emails.length > 1) {
      return Response.json(
        { error: 'That number is used by more than one account. Sign in with your work email instead.' },
        { status: 409 }
      );
    }
    return Response.json({ ok: true, email: emails[0] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
