import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  clean,
  closeSessionsFor,
  hashPassword,
  lower,
  passwordHistory,
  passwordProblem,
  passwordReused,
  randomSalt
} from '../../shared/kwAuth.ts';

// The link in the mail is the check: whoever holds the code may set one new password for that
// employee, once, and only until it expires.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || '').trim();
    if (!token) return Response.json({ error: 'This reset link is not valid' }, { status: 400 });

    const rows = await base44.asServiceRole.entities.PasswordReset.filter({ token });
    const reset = rows[0] || null;
    const live = reset && !reset.used_at && Date.parse(reset.expires_at || '') > Date.now();
    if (!live) {
      return Response.json(
        { error: 'This reset link has expired. Ask for a new one.', expired: true },
        { status: 400 }
      );
    }

    const profile = await base44.asServiceRole.entities.EmployeeProfile.get(reset.profile_id).catch(() => null);
    if (!profile) return Response.json({ error: 'This reset link is not valid' }, { status: 400 });

    if (String(body.action || '') === 'check') {
      return Response.json({ ok: true, name: profile.full_name || '', email: profile.user_email || '' });
    }

    const password = String(body.password || '');
    const problem = passwordProblem(password);
    if (problem) return Response.json({ error: problem }, { status: 400 });
    if (await passwordReused(profile, password)) {
      return Response.json({ error: 'password_reused' }, { status: 400 });
    }

    const salt = randomSalt();
    const loginId = clean(profile.login_id) || clean(profile.employee_number) || lower(profile.user_email);
    await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
      login_id: loginId,
      password_salt: salt,
      password_hash: await hashPassword(password, salt),
      password_history: passwordHistory(profile),
      password_set: true,
      password_updated_at: new Date().toISOString(),
      password_set_by: 'self',
      login_failed_count: 0,
      login_locked_until: ''
    });
    await base44.asServiceRole.entities.PasswordReset.update(reset.id, {
      used_at: new Date().toISOString()
    });
    // The new password ends every session that was opened with the old one.
    await closeSessionsFor(base44, profile.id);

    return Response.json({ ok: true, login_id: loginId, email: profile.user_email || '' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}