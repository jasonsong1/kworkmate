// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/sendPasswordSetup/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { sendAccountAccessEmail } from '../_shared/account.ts';

// Emails an employee their password setup link. The answer is the same whether or not
// the address already has an account.
async function handler(req) {
  try {
    const base44 = createBase44Like();
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const employee = await base44.asServiceRole.entities.EmployeeProfile.get(body.employee_id).catch(() => null);
    if (!employee) return Response.json({ error: 'Employee not found' }, { status: 404 });

    const managesBranch = Array.isArray(me.branch_ids) && me.branch_ids.includes(employee.branch_id);
    const allowed =
      me.role === 'admin' ||
      (employee.company_id === me.company_id && (me.app_role === 'company_admin' || managesBranch));
    if (!allowed) {
      return Response.json({ error: 'You cannot send email for this employee' }, { status: 403 });
    }

    const account = await sendAccountAccessEmail(base44, employee.user_email);
    return Response.json({ ok: true, ...account });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
