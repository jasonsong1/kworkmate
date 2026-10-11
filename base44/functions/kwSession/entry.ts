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
import { docTypesOf, onboardingFields, onboardingStatusFor } from '../../shared/onboarding.ts';

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

// The record behind a platform sign-in: the address they signed in with is the only key this app
// keeps for them.
async function profileForEmail(base44: any, email: string) {
  const found = rowsOf(
    await base44.asServiceRole.entities.EmployeeProfile
      .filter({ user_email: lower(email) }, { limit: 1 })
      .catch(() => [])
  );
  return found[0] || null;
}

// A record's onboarding status follows its paperwork: completed once everything the employer asks
// for has arrived, in progress as soon as anything has.
function onboardingPatch(profile: any, company: any, docs: any[]) {
  const status = onboardingStatusFor(profile, company, docs);
  const patch: any = { onboarding_status: status };
  if (status === 'completed' && !profile.onboarding_submitted_at) {
    patch.onboarding_submitted_at = new Date().toISOString();
  }
  return patch;
}

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

    // An employee signed in with the ID their employer issued carries their own record's id; a
    // platform account is matched by the address they signed in with. Either way every action here
    // only ever touches that one record.
    const profile = me.kw
      ? await base44.asServiceRole.entities.EmployeeProfile.get(me.profile_id).catch(() => null)
      : await profileForEmail(base44, me.email);
    if (!profile) return Response.json({ error: 'Your employee record was not found' }, { status: 404 });

    // The employer's own onboarding list decides what this person is asked for.
    const company = profile.company_id
      ? await base44.asServiceRole.entities.Company.get(profile.company_id).catch(() => null)
      : null;

    if (action === 'logout') {
      await closeSession(base44, me.session_token);
      return Response.json({ ok: true });
    }

    if (action === 'change_password') {
      // A platform account keeps its own password with the platform.
      if (!me.kw) {
        return Response.json({ error: 'Password changes are handled by your work email account' }, { status: 400 });
      }
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

    // Their own file, filed by themselves: it lands on the same record the employer sees, and
    // only a file this app has just stored privately can be filed.
    if (action === 'add_document') {
      const uri = String(body.file_uri || '');
      const name = String(body.name || '').trim().slice(0, 120) || 'Document';
      if (!/private\//.test(uri)) {
        return Response.json({ error: 'Upload the file before filing it' }, { status: 400 });
      }
      // The employee says which document this is: a kind their employer does not ask for is filed
      // as a plain document instead of being refused.
      const asked = docTypesOf(company);
      const wanted = String(body.doc_type || '');
      const docType = asked.some((type: any) => type.key === wanted) ? wanted : '';
      const docs = Array.isArray(profile.docs) ? profile.docs : [];
      if (docs.length >= 30) {
        return Response.json({ error: 'Your document vault is full' }, { status: 400 });
      }
      // One file per document: filing another of the same kind replaces the one before it.
      const kept = docType ? docs.filter((doc: any) => !(doc && doc.doc_type === docType)) : docs;
      const next = [
        ...kept,
        {
          name,
          type: 'staff_upload',
          ...(docType ? { doc_type: docType } : {}),
          file_uri: uri,
          created_at: new Date().toISOString(),
          uploaded_by: 'self'
        }
      ];
      const saved = await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
        docs: next,
        ...onboardingPatch(profile, company, next)
      });
      return Response.json({ ok: true, docs: next, profile: sealRecord(saved) });
    }

    // Their own file, removed by themselves: what the employer filed or the onboarding run
    // produced stays on the record.
    if (action === 'delete_document') {
      const uri = String(body.file_uri || '');
      const docs = Array.isArray(profile.docs) ? profile.docs : [];
      const target = docs.find((doc) => doc && doc.file_uri === uri);
      if (!target) {
        return Response.json({ error: 'That document is not on your own record' }, { status: 403 });
      }
      if (target.type !== 'staff_upload' && target.uploaded_by !== 'self') {
        return Response.json({ error: 'Only a document you uploaded yourself can be removed' }, { status: 400 });
      }
      const next = docs.filter((doc) => !(doc && doc.file_uri === uri));
      const saved = await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
        docs: next,
        ...onboardingPatch(profile, company, next)
      });
      return Response.json({ ok: true, docs: next, profile: sealRecord(saved) });
    }

    // The details filled in on the employee's own record, written exactly as given: what the
    // employer collects is what their onboarding questions ask for.
    if (action === 'save_onboarding') {
      const details = onboardingFields(body.data || {});
      const docs = Array.isArray(profile.docs) ? profile.docs : [];
      const saved = await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
        ...details,
        ...onboardingPatch({ ...profile, ...details }, company, docs)
      });
      return Response.json({ ok: true, profile: sealRecord(saved) });
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