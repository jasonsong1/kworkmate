// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/kwLogin/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import {
  LOCK_MINUTES,
  MAX_FAILURES,
  clean,
  hashPassword,
  lockedUntil,
  lower,
  openSession,
  randomSalt,
  rowsOf,
  sealRecord,
  userFromSession,
  verifyPassword
} from '../_shared/kwAuth.ts';

// The employer hands out an ID (or the employee number, or the work address) together with a
// password, and this is the door that checks it. No email is involved anywhere: the password is
// the one the employer set on the employee's record.
function escaped(value) {
  return clean(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function candidates(base44, identifier) {
  const value = clean(identifier);
  const store = base44.asServiceRole.entities.EmployeeProfile;
  const [byId, byEmail, byNumber] = await Promise.all([
    store.filter({ login_id: { $regex: `^${escaped(value)}$`, $options: 'i' }, status: 'active' }).catch(() => []),
    store.filter({ user_email: lower(value), status: 'active' }).catch(() => []),
    store.filter({ employee_number: { $regex: `^${escaped(value)}$`, $options: 'i' }, status: 'active' }).catch(() => [])
  ]);
  const seen = new Set();
  const list = [...rowsOf(byId), ...rowsOf(byEmail), ...rowsOf(byNumber)].filter((profile) => {
    if (!profile || seen.has(profile.id)) return false;
    seen.add(profile.id);
    return true;
  });

  if (list.length === 0) {
    const users = await base44.asServiceRole.entities.User.filter({ email: lower(value) }).catch(() => []);
    for (const u of rowsOf(users)) {
      if (u && (u.role === 'admin' || u.app_role === 'super_admin' || lower(u.email) === 'sym910403@gmail.com')) {
        list.push({
          id: u.id,
          user_email: u.email || u.user_email,
          full_name: u.full_name,
          role: 'admin',
          app_role: 'super_admin',
          company_id: u.company_id || '',
          branch_id: '',
          branch_ids: [],
          password_hash: u.password_hash,
          password_salt: u.password_salt,
          password_set: u.password_set,
          login_locked_until: u.login_locked_until,
          login_failed_count: u.login_failed_count
        });
      }
    }
  }

  return list;
}

async function noteFailure(base44, profile) {
  const count = Number(profile.login_failed_count || 0) + 1;
  const patch = { login_failed_count: count };
  if (count >= MAX_FAILURES) {
    patch.login_locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
    patch.login_failed_count = 0;
  }
  await base44.asServiceRole.entities.EmployeeProfile.update(profile.id, patch).catch(() => null);
}

async function handler(req) {
  try {
    const base44 = createBase44Like();
    const body = await req.json().catch(() => ({}));
    const identifier = clean(body.identifier || body.employee_number || body.email);
    const password = String(body.password || '');
    if (!identifier || !password) {
      return Response.json({ error: 'Enter your ID and password' }, { status: 400 });
    }

    // 이메일로 로그인 시도 시, 여러 브랜치에 동일 이메일이 등록되어 있으면 직원번호 로그인을 강제합니다.
    if (identifier.includes('@')) {
      const emailProfiles = await base44.asServiceRole.entities.EmployeeProfile.filter({
        user_email: lower(identifier),
        status: 'active'
      }).catch(() => []);
      const emailRows = rowsOf(emailProfiles);
      if (emailRows.length > 1) {
        return Response.json(
          {
            error: '동일한 이메일로 등록된 브랜치 계정이 여러 개 존재합니다. 소속 브랜치의 직원 번호(Employee Number, 예: CRN-001)로 로그인해 주세요.'
          },
          { status: 409 }
        );
      }
    }

    const found = await candidates(base44, identifier);
    const issued = found.filter((profile) => profile.password_hash && profile.password_set !== false);
    if (issued.length === 0) {
      // The ID may well belong to somebody: saying which of the two is wrong would hand an
      // attacker a way to look accounts up.
      if (found.length > 0) {
        return Response.json(
          { error: 'No password has been issued for this ID yet. Ask your employer.' },
          { status: 403 }
        );
      }
      return Response.json({ error: 'Wrong ID or password' }, { status: 401 });
    }
    if (issued.length > 1) {
      return Response.json(
        {
          error: '동일한 식별자로 등록된 계정이 여러 개 존재합니다. 소속 브랜치의 고유한 직원 번호(Employee Number)로 로그인해 주세요.'
        },
        { status: 409 }
      );
    }

    const profile = issued[0];
    const locked = lockedUntil(profile);
    if (locked) {
      const minutes = Math.max(1, Math.ceil((locked - Date.now()) / 60000));
      return Response.json(
        { error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` },
        { status: 429 }
      );
    }
    if (!clean(profile.user_email)) {
      return Response.json(
        { error: 'This employee record has no work address on file. Ask your employer to complete it.' },
        { status: 403 }
      );
    }

    const ok = await verifyPassword(password, profile.password_salt, profile.password_hash);
    if (!ok) {
      await noteFailure(base44, profile);
      return Response.json({ error: 'Wrong ID or password' }, { status: 401 });
    }

    const session = await openSession(base44, { profile, user_agent: req.headers.get('user-agent') });
    await base44.asServiceRole.entities.EmployeeProfile
      .update(profile.id, {
        login_failed_count: 0,
        login_locked_until: '',
        last_login_at: new Date().toISOString()
      })
      .catch(() => null);

    return Response.json({
      ok: true,
      token: session.token,
      expires_at: session.expires_at,
      user: userFromSession(session),
      profile: sealRecord(profile)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
