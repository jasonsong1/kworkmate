// 직원의 내 공간 세션 및 비밀번호/온보딩 서류 관리를 처리하는 Edge Function입니다.

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
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
} from '../_shared/kwAuth.ts';
import { docTypesOf, onboardingFields, onboardingStatusFor } from '../_shared/onboarding.ts';

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

async function profileForEmail(base44: any, email: string) {
  const found = rowsOf(
    await base44.asServiceRole.entities.EmployeeProfile
      .filter({ user_email: lower(email) }, { limit: 1 })
      .catch(() => [])
  );
  return found[0] || null;
}

function onboardingPatch(profile: any, company: any, docs: any[]) {
  const status = onboardingStatusFor(profile, company, docs);
  const patch: any = { onboarding_status: status };
  if (status === 'completed' && !profile.onboarding_completed_at) {
    patch.onboarding_completed_at = new Date().toISOString();
  }
  return patch;
}

async function handler(req: any) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const profile = await profileForEmail(base44, me.email);
    if (!profile) {
      return Response.json({
        ok: true,
        user: userFromSession({
          email: lower(me.email),
          full_name: me.full_name || me.email,
          role: me.role,
          app_role: me.app_role || (me.role === 'admin' ? 'super_admin' : 'staff'),
          company_id: me.company_id || '',
          branch_id: me.branch_id || '',
          branch_ids: me.branch_ids || []
        }),
        profile: null
      });
    }

    const branch = profile.branch_id
      ? await base44.asServiceRole.entities.Branch.get(profile.branch_id).catch(() => null)
      : null;
    const company = branch
      ? await base44.asServiceRole.entities.Company.get(branch.company_id).catch(() => null)
      : null;

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = String(body.action || '').trim();

    if (action === 'set_password') {
      const next = String(body.password || '');
      const problem = passwordProblem(next);
      if (problem) return Response.json({ error: problem }, { status: 400 });

      const history = passwordHistory(profile);
      if (passwordReused(next, history)) {
        return Response.json(
          { error: 'Pick a password you have not used here recently' },
          { status: 400 }
        );
      }

      if (profile.password_hash) {
        const current = String(body.current_password || '');
        if (!current) return Response.json({ error: 'Current password is required' }, { status: 400 });
        const salt = String(profile.password_salt || '');
        const ok = await verifyPassword(current, salt, profile.password_hash);
        if (!ok) return Response.json({ error: 'Current password is incorrect' }, { status: 400 });
      }

      const salt = randomSalt();
      const hash = await hashPassword(next, salt);
      const now = new Date().toISOString();
      const nextHistory = [{ hash, set_at: now }, ...history].slice(0, 5);

      await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
        password_hash: hash,
        password_salt: salt,
        password_history: nextHistory,
        password_set_at: now
      });

      return Response.json({ ok: true });
    }

    if (action === 'sign_document') {
      const uri = String(body.file_uri || '');
      const docs = Array.isArray(profile.docs) ? profile.docs : [];
      if (!uri || !docs.some((doc) => doc && doc.file_uri === uri)) {
        return Response.json({ error: 'That document is not on your own record' }, { status: 403 });
      }
      const { signed_url } = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: uri });
      return Response.json({ ok: true, signed_url });
    }

    // 직원이 자신의 서류를 업로드하여 등록합니다.
    if (action === 'add_document') {
      const uri = String(body.file_uri || '');
      const name = String(body.name || '').trim().slice(0, 120) || 'Document';
      if (!/private\//.test(uri)) {
        return Response.json({ error: 'Upload the file before filing it' }, { status: 400 });
      }

      // 클라이언트가 지정한 서류 항목 키(tfn, id, doc_pthyaa 등)를 그대로 안전하게 보존합니다.
      const docType = String(body.doc_type || '').trim();
      const docs = Array.isArray(profile.docs) ? profile.docs : [];
      if (docs.length >= 30) {
        return Response.json({ error: 'Your document vault is full' }, { status: 400 });
      }

      // 같은 종류의 서류가 이미 있다면 기존 서류를 교체합니다.
      const kept = docType
        ? docs.filter((doc: any) => !(doc && (doc.doc_type === docType || doc.type === docType)))
        : docs;

      const next = [
        ...kept,
        {
          name,
          type: docType || 'staff_upload',
          doc_type: docType,
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

    if (action === 'delete_document') {
      const uri = String(body.file_uri || '');
      const docs = Array.isArray(profile.docs) ? profile.docs : [];
      const target = docs.find((doc) => doc && doc.file_uri === uri);
      if (!target) {
        return Response.json({ error: 'That document is not on your own record' }, { status: 403 });
      }
      if (target.type !== 'staff_upload' && target.uploaded_by !== 'self' && !target.doc_type) {
        return Response.json({ error: 'Only a document you uploaded yourself can be removed' }, { status: 400 });
      }
      const next = docs.filter((doc) => !(doc && doc.file_uri === uri));
      const saved = await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
        docs: next,
        ...onboardingPatch(profile, company, next)
      });
      return Response.json({ ok: true, docs: next, profile: sealRecord(saved) });
    }

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

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
