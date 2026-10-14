// ============================================================
// requestEmployeePasswordReset/index.ts
// 목적: 직원이 로그인 페이지 등에서 비밀번호를 잊어버렸을 때(Forgot password),
//       이메일로 본인 인증 및 비밀번호 재설정 링크를 발송하는 Supabase Edge Function입니다.
// ============================================================

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { lower, randomHex } from '../_shared/kwAuth.ts';
import { sendEmail, brandedEmail, portalLink } from '../_shared/email.ts';

// 재설정 링크 유효 시간: 60분
const MINUTES = 60;
// 짧은 시간 내 중복 요청 방지 쿨다운 (테스트 및 빠른 재시도를 위해 15초로 설정)
const QUIET_SECONDS = 15;

async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const body = await req.json().catch(() => ({}));
    const email = lower(body.email);
    if (!email) {
      return Response.json({ error: '이메일을 입력해 주세요.' }, { status: 400 });
    }

    // 1. 활성(active) 상태의 직원 프로필을 먼저 조회합니다.
    let found = await base44.asServiceRole.entities.EmployeeProfile.filter({
      user_email: email,
      status: 'active'
    });

    // 2. 신규 사용자(온보딩 중이거나 승인 대기 등)인 경우 inactive/deleted가 아닌 모든 직원을 조회합니다.
    if (!found || found.length === 0) {
      found = await base44.asServiceRole.entities.EmployeeProfile.filter({
        user_email: email,
        status: { $ne: 'inactive' }
      });
    }

    // 3. 대소문자 차이로 인해 조회가 되지 않는 경우를 대비해 대소문자 무관 정규식 검색으로 재시도합니다.
    if (!found || found.length === 0) {
      found = await base44.asServiceRole.entities.EmployeeProfile.filter({
        user_email: { $regex: `^${email}$`, $options: 'i' }
      });
    }

    const profile = found && found.length > 0 ? found[0] : null;

    // 보안상 해당 이메일의 계정 존재 여부를 외부에 유출하지 않기 위해 동일하게 { ok: true } 반환
    if (!profile) {
      console.warn(`[requestEmployeePasswordReset] 해당 이메일(${email})을 가진 사용자를 찾을 수 없습니다.`);
      return Response.json({ ok: true });
    }

    // 4. 최근에 요청된 재설정 토큰 확인 (15초 이내 연속 클릭 방어)
    const recent = await base44.asServiceRole.entities.PasswordReset.filter(
      { profile_id: profile.id },
      { sort: '-created_date', limit: 1 }
    );
    const last = recent && recent.length > 0 ? recent[0] : null;
    const stillLive =
      last &&
      !last.used_at &&
      Date.parse(last.expires_at || '') > Date.now() &&
      Date.now() - Date.parse(last.created_date || '') < QUIET_SECONDS * 1000;

    if (stillLive) {
      console.log(`[requestEmployeePasswordReset] 쿨다운 기간(${QUIET_SECONDS}초) 내 재요청이므로 기존 링크 유지`);
      return Response.json({ ok: true });
    }

    // 5. 신규 24자리 랜덤 토큰 생성 및 재설정 레코드 저장
    const token = randomHex(24);
    await base44.asServiceRole.entities.PasswordReset.create({
      company_id: profile.company_id || '',
      profile_id: profile.id,
      email: profile.user_email || email,
      token,
      expires_at: new Date(Date.now() + MINUTES * 60 * 1000).toISOString()
    });

    // 6. 소속 지점 정보 및 브랜딩 색상 확인
    const branch = profile.branch_id
      ? await base44.asServiceRole.entities.Branch.get(profile.branch_id).catch(() => null)
      : null;

    // 7. 비밀번호 설정 링크 생성 (/password-reset?token=...)
    const link = portalLink(body.origin, `/password-reset?token=${token}`);

    // 8. 인증된 도메인(noreply@kworkmate.com)을 통해 비밀번호 설정 이메일 발송
    const sendResult = await sendEmail(base44, {
      to: profile.user_email || email,
      subject: 'K-Workmate 비밀번호 재설정 안내',
      html: brandedEmail({
        heading: '비밀번호 재설정 (Set a new password)',
        badge: branch ? branch.name : 'K-Workmate',
        brandColor: (branch && branch.brand_color) || undefined,
        lines: [
          `안녕하세요, ${profile.full_name || '팀원'}님.`,
          '아래 버튼을 클릭하여 K-Workmate 계정의 새로운 비밀번호를 설정해 주세요.',
          `이 재설정 링크는 ${MINUTES}분 동안 유효하며 1회만 사용하실 수 있습니다. 본인이 요청하지 않은 경우 이 메일을 무시하셔도 안전합니다.`
        ],
        ctaText: '새 비밀번호 설정하기 (Set New Password)',
        ctaUrl: link
      })
    });

    console.log(`[requestEmployeePasswordReset] 이메일 발송 결과:`, sendResult);
    return Response.json({ ok: true });
  } catch (error: any) {
    console.error('[requestEmployeePasswordReset 오류 발생]:', error);
    // 보안 유지를 위해 오류 시에도 ok 반환하되 서버 로그에 상세 에러 기록
    return Response.json({ ok: true, note: 'processed' });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
