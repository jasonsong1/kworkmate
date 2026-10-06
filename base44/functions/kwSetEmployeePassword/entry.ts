import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  MIN_PASSWORD_LENGTH,
  clean,
  closeSessionsFor,
  hashPassword,
  lower,
  randomSalt,
  sealRecord
} from '../../shared/kwAuth.ts';

// The employer's side of the sign-in: they hand the employee an ID and a password, and nothing
// has to be emailed anywhere. Only the company the employee belongs to may issue it.
function mayManage(me, profile) {
  if (!me) return false;
  if (me.role === 'admin') return true;
  if (!profile.company_id || me.company_id !== profile.company_id) return false;
  if (clean(me.app_role) === 'company_admin') return true;
  if (clean(me.app_role) === 'branch_manager') {
    return (me.branch_ids || []).includes(profile.branch_id);
  }
  return false;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Sign-in required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const profile = await base44.asServiceRole.entities.EmployeeProfile
      .get(String(body.profile_id || ''))
      .catch(() => null);
    if (!profile) return Response.json({ error: 'Employee not found' }, { status: 404 });
    if (!mayManage(me, profile)) {
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

    const password = String(body.password || '');
    if (password.length < MIN_PASSWORD_LENGTH) {
      return Response.json({ error: `Use at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
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