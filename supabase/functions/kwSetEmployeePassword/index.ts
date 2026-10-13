// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/kwSetEmployeePassword/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import {
  accessFor,
  clean,
  closeSessionsFor,
  hashPassword,
  lower,
  passwordHistory,
  passwordProblem,
  passwordReused,
  randomSalt,
  resolveCaller,
  sealRecord,
  verifyPassword
} from '../_shared/kwAuth.ts';

// The employer's side of the sign-in: they hand the employee an ID and a password, and nothing
// has to be emailed anywhere. Whoever the employer gave the staff list to may issue it, resolved
// through the same three layers every screen reads, so a role the employer set up themselves
// counts exactly like a built-in manager.
async function mayManage(base44, me, profile) {
  if (!me) return false;
  // Your own sign-in is always yours to reset, whatever position you hold.
  if (profile.id === me.profile_id || (clean(profile.user_email) && lower(profile.user_email) === lower(me.email))) {
    return true;
  }
  if (me.role === 'admin') return true;
  if (!profile.company_id || me.company_id !== profile.company_id) return false;
  if (clean(me.app_role) === 'company_admin') return true;
  const cell = (await accessFor(base44, me, true)).employees;
  if (!cell || cell.level === 'none' || cell.level === 'read') return false;
  if (cell.scope === 'company') return true;
  return (me.branch_ids || []).includes(profile.branch_id);
}

async function handler(req) {
  try {
    const base44 = createBase44Like();
    // Either door the employer signed in through answers here: the ID their employer issued, or a
    // platform account. Nobody is asked for a second sign-in before handing credentials over.
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Sign-in required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const profile = await base44.asServiceRole.entities.EmployeeProfile
      .get(String(body.profile_id || ''))
      .catch(() => null);
    if (!profile) return Response.json({ error: 'Employee not found' }, { status: 404 });
    if (!(await mayManage(base44, me, profile))) {
      return Response.json({ error: 'You cannot issue sign-in for this employee' }, { status: 403 });
    }

    if (String(body.action || 'set') === 'clear') {
      await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
        password_hash: '',
        password_salt: '',
        password_set: false,
        password_updated_at: new Date().toISOString()
      });
      await closeSessionsFor(base44, profile.id);
      return Response.json({ ok: true, password_set: false });
    }

    // Changing your own sign-in password means proving you know the one in force. An employer
    // handing credentials to somebody else is a different act and is covered by mayManage above.
    const isSelf =
      profile.id === me.profile_id ||
      (clean(profile.user_email) && lower(profile.user_email) === lower(me.email));
    if (isSelf && profile.password_set && (body.self_service === true || body.current_password)) {
      const current = String(body.current_password || '');
      if (!current) return Response.json({ error: 'current_required' }, { status: 400 });
      if (!(await verifyPassword(current, profile.password_salt, profile.password_hash))) {
        return Response.json({ error: 'current_wrong' }, { status: 400 });
      }
    }

    const password = String(body.password || '');
    const problem = passwordProblem(password);
    if (problem) return Response.json({ error: problem }, { status: 400 });
    if (await passwordReused(profile, password)) {
      return Response.json({ error: 'password_reused' }, { status: 400 });
    }
    if (!clean(profile.user_email)) {
      return Response.json(
        { error: 'Add the employee’s work address on the record first: it identifies the account' },
        { status: 400 }
      );
    }

    const salt = randomSalt();
    const loginId = clean(body.login_id) || clean(profile.login_id) || clean(profile.employee_number) || lower(profile.user_email);
    await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
      login_id: loginId,
      password_salt: salt,
      password_hash: await hashPassword(password, salt),
      password_history: passwordHistory(profile),
      password_set: true,
      password_updated_at: new Date().toISOString(),
      password_set_by: lower(me.email),
      login_failed_count: 0,
      login_locked_until: ''
    });
    // A new password ends every session that was opened with the old one.
    await closeSessionsFor(base44, profile.id);
    const fresh = await base44.asServiceRole.entities.EmployeeProfile.get(profile.id).catch(() => profile);
    return Response.json({ ok: true, login_id: loginId, password_set: true, profile: sealRecord(fresh) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
