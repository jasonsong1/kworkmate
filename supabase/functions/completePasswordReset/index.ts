// ============================================================
// completePasswordReset/index.ts
// 목적: 사용자가 이메일로 받은 비밀번호 재설정 링크의 토큰을 검증하고,
//       새 비밀번호를 안전하게 솔트 해시(PBKDF2/SHA-256) 암호화하여 저장하는 Edge Function입니다.
// ============================================================

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import {
  clean,
  closeSessionsFor,
  hashPassword,
  lower,
  passwordHistory,
  passwordProblem,
  passwordReused,
  randomSalt
} from '../_shared/kwAuth.ts';

async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || '').trim();
    if (!token) {
      return Response.json({ error: '유효하지 않은 재설정 링크입니다.' }, { status: 400 });
    }

    // 1. 전달받은 토큰으로 PasswordReset 레코드를 조회합니다.
    const rows = await base44.asServiceRole.entities.PasswordReset.filter({ token });
    const reset = rows && rows.length > 0 ? rows[0] : null;
    const live = reset && !reset.used_at && Date.parse(reset.expires_at || '') > Date.now();

    // 토큰이 없거나 만료되었거나 이미 사용된 경우
    if (!live) {
      return Response.json(
        { error: '재설정 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.', expired: true },
        { status: 400 }
      );
    }

    // 2. 해당 토큰과 연결된 직원 프로필을 조회합니다.
    const profile = await base44.asServiceRole.entities.EmployeeProfile.get(reset.profile_id).catch(() => null);
    if (!profile) {
      return Response.json({ error: '직원 프로필 정보를 찾을 수 없습니다.' }, { status: 400 });
    }

    // 3. 단순 링크 유효성 검사 요청인 경우 (화면 진입 시 토큰 체크)
    if (String(body.action || '') === 'check') {
      return Response.json({
        ok: true,
        name: profile.full_name || '',
        email: profile.user_email || ''
      });
    }

    // 4. 새 비밀번호 강도 검사
    const password = String(body.password || '');
    const problem = passwordProblem(password);
    if (problem) {
      return Response.json({ error: problem }, { status: 400 });
    }

    // 5. 과거 사용했던 비밀번호 재사용 방지 검사
    if (await passwordReused(profile, password)) {
      return Response.json({ error: 'password_reused' }, { status: 400 });
    }

    // 6. 새로운 무작위 솔트(Salt) 생성 및 비밀번호 단방향 암호화 해싱
    const salt = randomSalt();
    const loginId = clean(profile.login_id) || clean(profile.employee_number) || lower(profile.user_email);

    // 7. 암호화된 비밀번호와 솔트를 프로필에 안전하게 저장합니다.
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

    // 8. 재설정 토큰을 '사용 완료' 처리하여 재사용을 차단합니다.
    await base44.asServiceRole.entities.PasswordReset.update(reset.id, {
      used_at: new Date().toISOString()
    });

    // 9. 기존에 열려 있던 모든 로그인 세션을 무효화하여 보안을 강화합니다.
    await closeSessionsFor(base44, profile.id);

    console.log(`[completePasswordReset] 비밀번호 재설정 완료: ${profile.user_email} (ID: ${profile.id})`);
    return Response.json({ ok: true, login_id: loginId, email: profile.user_email || '' });
  } catch (error: any) {
    console.error('[completePasswordReset 오류]:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
