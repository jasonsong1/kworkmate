// 직원의 내 공간 세션 및 비밀번호/온보딩 서류 관리를 처리하는 Edge Function입니다.

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  closeSession,
  hashPassword,
  lower,
  openSession,
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

async function profileForEmail(base44: any, email: string, preferredCompanyId?: string) {
  const allProfiles = rowsOf(
    await base44.asServiceRole.entities.EmployeeProfile
      .filter({ user_email: lower(email) }, { sort: '-created_date', limit: 10 })
      .catch(() => [])
  );
  if (allProfiles.length === 0) return null;
  if (preferredCompanyId) {
    const matched = allProfiles.find((p: any) => p.company_id === preferredCompanyId);
    if (matched) return matched;
  }
  return allProfiles[0];
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
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = String(body.action || '').trim();

    // [Google 등 OAuth 토큰 교환]:
    // Supabase access_token을 검증하여 KWorkMate 정식 LoginSession(kw_...) 토큰을 발급합니다.
    if (action === 'oauth_login') {
      const accessToken = String(body.access_token || '').trim();
      if (!accessToken) return Response.json({ error: 'access_token is required' }, { status: 400 });

      const url = (typeof Deno !== 'undefined' && Deno.env.get('SUPABASE_URL')) || '';
      const serviceKey = (typeof Deno !== 'undefined' && Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) || '';
      const authClient = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: { user }, error: userError } = await authClient.auth.getUser(accessToken);
      if (userError || !user || !user.email) {
        return Response.json({ error: 'Invalid or expired OAuth token' }, { status: 401 });
      }

      const email = lower(user.email);
      let profile = await profileForEmail(base44, email);
      if (!profile) {
        const isSuper = email === 'sym910403@gmail.com';
        profile = {
          id: user.id,
          user_email: email,
          full_name: user.user_metadata?.full_name || email,
          role: isSuper ? 'admin' : 'user',
          app_role: isSuper ? 'super_admin' : 'staff',
          company_id: '',
          branch_id: ''
        };
      }

      const session = await openSession(base44, {
        profile,
        user_agent: req.headers.get('user-agent')
      });

      return Response.json({
        ok: true,
        token: session.token,
        user: userFromSession(session)
      });
    }

    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const profile = await profileForEmail(base44, me.email, me.company_id);
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
    const companyId = profile.company_id || (branch && branch.company_id) || me.company_id;
    const company = companyId
      ? await base44.asServiceRole.entities.Company.get(companyId).catch(() => null)
      : null;

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
        password_set_at: now,
        password_history: nextHistory,
        failed_login_count: 0,
        locked_until: null
      });

      return Response.json({ ok: true });
    }

    if (action === 'save_onboarding_fields') {
      const patch = onboardingFields(body.fields);
      const docs = rowsOf(
        await base44.asServiceRole.entities.EmployeeDocument
          .filter({ employee_profile_id: profile.id })
          .catch(() => [])
      );
      const extra = onboardingPatch({ ...profile, ...patch }, company, docs);
      const updated = await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
        ...patch,
        ...extra
      });
      return Response.json({ ok: true, profile: sealRecord(updated) });
    }

    if (action === 'complete_onboarding') {
      const docs = rowsOf(
        await base44.asServiceRole.entities.EmployeeDocument
          .filter({ employee_profile_id: profile.id })
          .catch(() => [])
      );
      const patch = onboardingPatch(profile, company, docs);
      const updated = await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, patch);
      return Response.json({ ok: true, profile: sealRecord(updated) });
    }

    // ==============================================================================
    // [서류 추가 및 다시 올리기(Re-upload) 핸들러]
    // 내 공간 또는 서류보관함에서 서류를 업로드하거나 다시 올릴 때 호출됩니다.
    // 동일한 doc_type(신분증, 비자 등)의 파일이 이미 있다면 새로운 파일로 완벽 교체(replace)합니다.
    // ==============================================================================
    if (action === 'add_document') {
      const uri = String(body.file_uri || '');
      const name = String(body.name || '').trim().slice(0, 120) || 'Document';
      if (!uri) {
        return Response.json({ error: 'file_uri is required' }, { status: 400 });
      }

      const wanted = String(body.doc_type || '');
      const docs = Array.isArray(profile.docs) ? profile.docs : [];

      // 동일한 서류 종류(doc_type)가 이미 있다면 기존 서류를 필터링하여 교체(다시 올리기 보장)
      const kept = wanted
        ? docs.filter((doc: any) => !(doc && (doc.doc_type === wanted || doc.type === wanted)))
        : docs.filter((doc: any) => !(doc && doc.file_uri === uri));

      const newDoc = {
        name,
        type: wanted || 'staff_upload',
        doc_type: wanted || 'staff_upload',
        file_uri: uri,
        url: uri,
        created_at: new Date().toISOString(),
        uploaded_by: 'self'
      };

      const nextDocs = [...kept, newDoc];

      const saved = await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
        docs: nextDocs
      });

      return Response.json({
        ok: true,
        docs: nextDocs,
        profile: sealRecord(saved || { ...profile, docs: nextDocs })
      });
    }

    // ==============================================================================
    // [서류 삭제 핸들러]
    // ==============================================================================
    if (action === 'delete_document') {
      const uri = String(body.file_uri || '');
      const docs = Array.isArray(profile.docs) ? profile.docs : [];
      const nextDocs = docs.filter((doc: any) => !(doc && (doc.file_uri === uri || doc.url === uri)));

      const saved = await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
        docs: nextDocs
      });

      return Response.json({
        ok: true,
        docs: nextDocs,
        profile: sealRecord(saved || { ...profile, docs: nextDocs })
      });
    }

    // ==============================================================================
    // [온보딩 개인정보 저장 핸들러]
    // ==============================================================================
    if (action === 'save_onboarding') {
      const data = body.data || {};
      const saved = await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, {
        ...data
      });
      return Response.json({
        ok: true,
        profile: sealRecord(saved || { ...profile, ...data })
      });
    }

    if (action === 'sign_document') {
      const fileUri = String(body.file_uri || '').trim();
      if (!fileUri) return Response.json({ error: 'file_uri is required' }, { status: 400 });

      const docs = rowsOf(
        await base44.asServiceRole.entities.EmployeeDocument
          .filter({ employee_profile_id: profile.id, file_uri: fileUri }, { limit: 1 })
          .catch(() => [])
      );
      if (docs.length === 0 && me.role !== 'admin' && me.app_role !== 'company_admin') {
        return Response.json({ error: 'Document not found' }, { status: 404 });
      }
      const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
        file_uri: fileUri,
        expiresIn: 3600
      });
      return Response.json({ ok: true, signed_url: signed.signed_url });
    }

    // Default: Return the current session profile and documents
    const documents = rowsOf(
      await base44.asServiceRole.entities.EmployeeDocument
        .filter({ employee_profile_id: profile.id }, { limit: 50 })
        .catch(() => [])
    );

    return Response.json({
      ok: true,
      user: userFromSession({
        email: lower(me.email),
        full_name: profile.full_name || me.full_name || me.email,
        role: me.role,
        app_role: me.app_role || (me.role === 'admin' ? 'super_admin' : 'staff'),
        company_id: companyId || '',
        branch_id: profile.branch_id || me.branch_id || '',
        branch_ids: me.branch_ids || (profile.branch_id ? [profile.branch_id] : [])
      }),
      profile: sealRecord(profile),
      branch: branch ? { id: branch.id, name: branch.name, brand_color: branch.brand_color } : null,
      company: company ? { id: company.id, name: company.name, brand_color: company.brand_color } : null,
      documents,
      doc_types: docTypesOf(company)
    });
  } catch (error: any) {
    console.error('[kwSession] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
