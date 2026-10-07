import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  closeSession,
  hashPassword,
  lower,
  passwordHistory,
  passwordProblem,
  passwordReused,
  randomSalt,
  resolveCaller,
  sealRecord,
  userFromSession,
  verifyPassword
} from '../../shared/kwAuth.ts';

// Everything an already signed-in employee asks about themselves: who they are, and the two
// things they may do alone — sign out, and set a new password of their own.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    // The caller is resolved before the body is read: the session can travel in the body
    // itself, and a body can only be read once.
    const me = await resolveCaller(base44, req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'me');
    if (!me) return Response.json({ error: 'Sign-in required' }, { status: 401 });

    if (!me.kw) {
      // A platform account keeps its own password with the platform.
      return Response.json({ error: 'Password changes are handled by your work email account' }, { status: 400 });
    }

    const profile = await base44.asServiceRole.entities.EmployeeProfile.get(me.profile_id).catch(() => null);
    if (!profile) return Response.json({ error: 'Your employee record was not found' }, { status: 404 });

    if (action === 'logout') {
      await closeSession(base44, me.session_token);
      return Response.json({ ok: true });
    }

    if (action === 'change_password') {
      const current = String(body.current_password || '');
      const next = String(body.new_password || '');
      const problem = passwordProblem(next);
      if (problem) return Response.json({ error: problem }, { status: 400 });
      const ok = await verifyPassword(current, profile.password_salt, profile.password_hash);
      if (!ok) return Response.json({ error: 'The current password is wrong' }, { status: 401 });
      if (await passwordReused(profile, next)) {
        return Response.json({ error: 'That password has been used before. Choose a new one.' }, { status: 400 });
      }
      const salt = randomSalt();
      await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
        password_salt: salt,
        password_hash: await hashPassword(next, salt),
        password_history: passwordHistory(profile),
        password_set: true,
        password_updated_at: new Date().toISOString(),
        password_set_by: 'self'
      });
      return Response.json({ ok: true });
    }

    // Their own paperwork, and only their own: the file has to be one this record already
    // carries before anything is signed, so nobody can ask for somebody else's document.
    if (action === 'sign_document') {
      const uri = String(body.file_uri || '');
      const docs = Array.isArray(profile.docs) ? profile.docs : [];
      if (!uri || !docs.some((doc) => doc && doc.file_uri === uri)) {
        return Response.json({ error: 'That document is not on your own record' }, { status: 403 });
      }
      const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: uri });
      return Response.json({ ok: true, signed_url });
    }

    return Response.json({
      ok: true,
      user: userFromSession({
        profile_id: profile.id,
        email: lower(profile.user_email),
        full_name: profile.full_name,
        company_id: profile.company_id,
        branch_id: profile.branch_id,
        branch_ids: me.branch_ids || [],
        app_role: profile.app_role
      }),
      profile: sealRecord(profile)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}