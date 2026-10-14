// 계정 권한 및 이메일 초대 관련 공통 유틸리티 함수 모음입니다.
// Supabase 환경에 맞춰 테이블 명칭 및 엔티티 조회를 안전하게 처리합니다.

/**
 * 신규 유저에게 앱 초대 메일을 전송합니다.
 * 기존의 User 엔티티 대신 EmployeeProfile을 조회하여 중복 가입 여부를 확인합니다.
 */
export async function inviteAccount(base44, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return { invited: false, existing: false, error: 'Email is required' };

  try {
    // 1. 이미 직무 프로필(EmployeeProfile)이 존재하는지 확인합니다.
    const profiles = await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: target }).catch(() => []);
    if (profiles.length > 0) {
      return { invited: false, existing: true, error: null };
    }
  } catch (err) {
    console.warn('inviteAccount profile check warning:', err);
  }

  // 2. 신규 초대 발송을 시도합니다.
  try {
    if (base44.asServiceRole && base44.asServiceRole.users && typeof base44.asServiceRole.users.inviteUser === 'function') {
      await base44.asServiceRole.users.inviteUser(target, 'user');
      return { invited: true, existing: false, error: null };
    }
    return { invited: false, existing: false, error: null };
  } catch (error) {
    console.error('inviteUser failed:', error && error.message);
    return { invited: false, existing: false, error: (error && error.message) || 'Invitation could not be sent' };
  }
}

/**
 * 최초 비밀번호 설정을 위한 재설정 링크 이메일을 요청합니다.
 */
export async function sendPasswordSetupEmail(base44, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return { sent: false, error: 'Email is required' };
  try {
    if (base44.auth && typeof base44.auth.resetPasswordRequest === 'function') {
      await base44.auth.resetPasswordRequest(target);
      return { sent: true, error: null };
    }
    return { sent: false, error: null };
  } catch (error) {
    console.error('resetPasswordRequest failed:', error && error.message);
    return { sent: false, error: (error && error.message) || 'Email could not be sent' };
  }
}

/**
 * 초대 및 비밀번호 설정 이메일을 일괄 발송합니다.
 */
export async function sendAccountAccessEmail(base44, email, sendPassword = true) {
  const invite = await inviteAccount(base44, email);
  const password = sendPassword ? await sendPasswordSetupEmail(base44, email) : { sent: false, error: null };
  return {
    invited: invite.invited,
    existing: invite.existing,
    password_email_sent: password.sent,
    email_error: invite.error || password.error
  };
}

/**
 * 특정 이메일 사용자가 회사, 지점 또는 프로필에 등록되어 앱 접근 권한이 있는지 확인합니다.
 */
export async function hasAppAccess(base44, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return false;

  // 슈퍼어드민 계정은 언제나 권한을 보유합니다.
  if (target === 'sym910403@gmail.com') return true;

  const profiles = await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: target }).catch(() => []);
  if (profiles.length > 0) return true;

  const companies = await base44.asServiceRole.entities.Company.list().catch(() => []);
  const companyRows = Array.isArray(companies) ? companies : companies.items || [];
  if (companyRows.some((c) => Array.isArray(c.member_emails) && c.member_emails.includes(target))) {
    return true;
  }

  const branches = await base44.asServiceRole.entities.Branch.list().catch(() => []);
  const branchRows = Array.isArray(branches) ? branches : branches.items || [];
  if (branchRows.some((b) => Array.isArray(b.manager_emails) && b.manager_emails.includes(target))) {
    return true;
  }

  return false;
}

/**
 * 퇴사 또는 권한 해제 시 로그인 세션을 종료 처리합니다.
 */
export async function releaseAppAccess(base44, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return { blocked: false, kept: false };
  if (await hasAppAccess(base44, target)) return { blocked: false, kept: true };

  // 슈퍼어드민은 절대 접근 차단되지 않습니다.
  if (target === 'sym910403@gmail.com') return { blocked: false, kept: false };

  // 남은 활성 로그인 세션을 비활성화 처리합니다.
  await base44.asServiceRole.entities.LoginSession.updateMany(
    { email: target, active: true },
    { $set: { active: false, revoked_at: new Date().toISOString() } }
  ).catch(() => null);

  return { blocked: true, kept: false };
}