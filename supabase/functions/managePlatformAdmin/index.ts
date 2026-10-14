// ============================================================
// managePlatformAdmin/index.ts (Supabase Edge Function)
// 목적: 플랫폼 최고 관리자(슈퍼어드민) 관리
//   - 슈퍼어드민 목록 조회
//   - 새 슈퍼어드민 생성 (이메일, 이름, 비밀번호 암호화 저장)
//   - 기존 슈퍼어드민 권한 부여(grant) / 회수(revoke) / 삭제(delete)
// ============================================================

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { hashPassword, lower, randomSalt, resolveCaller } from '../_shared/kwAuth.ts';

const escapeRegex = (text: string) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req) || (await base44.auth.me());
    if (!me) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 });

    // 슈퍼어드민만 관리할 수 있습니다.
    const isSuper = me.role === 'admin' || me.email === 'sym910403@gmail.com';
    if (!isSuper) {
      return Response.json({ error: '슈퍼어드민 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'search';

    // 1. 슈퍼어드민 목록 조회
    if (action === 'search' || action === 'list') {
      const term = String(body.query || '').trim();
      const filter = term ? { email: { $regex: escapeRegex(term), $options: 'i' } } : {};
      const matches = await base44.asServiceRole.entities.User.filter(filter);
      
      // 슈퍼어드민(role === 'admin' 또는 sym910403@gmail.com)만 반환하여 일반 사용자는 숨깁니다.
      const superAdmins = matches
        .filter((user: any) => user.role === 'admin' || lower(user.email) === 'sym910403@gmail.com')
        .map((user: any) => ({
          id: user.id,
          email: user.email || user.user_email,
          full_name: user.full_name,
          role: 'admin'
        }));

      return Response.json({ ok: true, users: superAdmins });
    }

    // 2. 새 슈퍼어드민 생성 (이메일, 이름, 비밀번호)
    if (action === 'create') {
      const email = lower(body.email || '');
      const fullName = String(body.full_name || '').trim();
      const password = String(body.password || '').trim();

      if (!email || !email.includes('@')) {
        return Response.json({ error: '올바른 이메일 주소를 입력해주세요.' }, { status: 400 });
      }
      if (!password || password.length < 6) {
        return Response.json({ error: '비밀번호는 최소 6자 이상이어야 합니다.' }, { status: 400 });
      }

      // 이미 존재하는지 확인
      const existing = await base44.asServiceRole.entities.User.filter({ email }).catch(() => []);
      const salt = randomSalt();
      const hash = await hashPassword(password, salt);

      if (existing.length > 0) {
        // 기존 계정이 있을 경우 슈퍼어드민으로 권한 격상 및 비밀번호 갱신
        const target = existing[0];
        await base44.asServiceRole.entities.User.update(target.id, {
          role: 'admin',
          app_role: 'super_admin',
          full_name: fullName || target.full_name,
          password_salt: salt,
          password_hash: hash,
          password_set: true,
          password_set_by: 'admin',
          password_updated_at: new Date().toISOString()
        });

        // EmployeeProfile 테이블에도 슈퍼어드민 권한 동기화
        const empProfiles = await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: email }).catch(() => []);
        if (empProfiles.length > 0) {
          await base44.asServiceRole.entities.EmployeeProfile.update(empProfiles[0].id, {
            role: 'admin',
            app_role: 'super_admin',
            full_name: fullName || target.full_name,
            password_salt: salt,
            password_hash: hash,
            password_set: true
          });
        }

        return Response.json({
          ok: true,
          user: {
            id: target.id,
            email: target.email || target.user_email,
            full_name: fullName || target.full_name,
            role: 'admin'
          }
        });
      }

      // 시스템 내 첫 번째 회사를 기본 연결 회사로 설정하여 로그인 즉시 모든 화면 사용 가능하도록 보장
      const companies = await base44.asServiceRole.entities.Company.filter({}).catch(() => []);
      const defaultCompanyId = (companies && companies[0] && companies[0].id) || '';

      // 신규 슈퍼어드민 프로필 생성 (User)
      const created = await base44.asServiceRole.entities.User.create({
        user_email: email,
        email,
        full_name: fullName || email.split('@')[0],
        role: 'admin',
        app_role: 'super_admin',
        company_id: defaultCompanyId,
        status: 'active',
        password_salt: salt,
        password_hash: hash,
        password_set: true,
        password_set_by: 'admin',
        password_updated_at: new Date().toISOString()
      });

      // EmployeeProfile 에도 슈퍼어드민으로 함께 생성하여 kwLogin 및 내 공간 완벽 지원
      const empProfiles = await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: email }).catch(() => []);
      if (empProfiles.length > 0) {
        await base44.asServiceRole.entities.EmployeeProfile.update(empProfiles[0].id, {
          role: 'admin',
          app_role: 'super_admin',
          full_name: fullName || email.split('@')[0],
          password_salt: salt,
          password_hash: hash,
          password_set: true,
          company_id: defaultCompanyId || empProfiles[0].company_id,
          status: 'active'
        });
      } else {
        await base44.asServiceRole.entities.EmployeeProfile.create({
          user_email: email,
          full_name: fullName || email.split('@')[0],
          role: 'admin',
          app_role: 'super_admin',
          company_id: defaultCompanyId,
          status: 'active',
          password_salt: salt,
          password_hash: hash,
          password_set: true,
          hire_date: new Date().toISOString().split('T')[0]
        });
      }

      return Response.json({
        ok: true,
        user: {
          id: created.id,
          email: created.email || created.user_email,
          full_name: created.full_name,
          role: 'admin'
        }
      });
    }

    // 아래 기능들은 user_id가 필수입니다.
    if (!body.user_id) return Response.json({ error: 'user_id가 필요합니다.' }, { status: 400 });

    const target = await base44.asServiceRole.entities.User.get(body.user_id).catch(() => null);
    if (!target) return Response.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });

    // 3. 슈퍼어드민 권한 부여
    if (action === 'grant') {
      await base44.asServiceRole.entities.User.update(target.id, { role: 'admin', app_role: 'super_admin' });
      const targetEmail = target.email || target.user_email;
      if (targetEmail) {
        const empProfiles = await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: targetEmail }).catch(() => []);
        if (empProfiles.length > 0) {
          await base44.asServiceRole.entities.EmployeeProfile.update(empProfiles[0].id, { role: 'admin', app_role: 'super_admin' });
        }
      }
      return Response.json({ ok: true, role: 'admin' });
    }

    // 4. 슈퍼어드민 권한 해제 (최소 1명 유지)
    if (action === 'revoke') {
      if (target.id === me.id || lower(target.email) === 'sym910403@gmail.com') {
        return Response.json({ error: '본인 계정의 슈퍼어드민 권한은 해제할 수 없습니다.' }, { status: 400 });
      }
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      if (admins.length <= 1) {
        return Response.json({ error: '슈퍼어드민은 최소 1명 이상 유지되어야 합니다.' }, { status: 400 });
      }
      await base44.asServiceRole.entities.User.update(target.id, { role: 'user' });
      return Response.json({ ok: true, role: 'user' });
    }

    // 5. 슈퍼어드민 계정 삭제
    if (action === 'delete') {
      if (target.id === me.id || lower(target.email) === 'sym910403@gmail.com') {
        return Response.json({ error: '본인 계정은 삭제할 수 없습니다.' }, { status: 400 });
      }
      await base44.asServiceRole.entities.User.delete(target.id);
      return Response.json({ ok: true, deleted: true });
    }

    return Response.json({ error: '지원하지 않는 동작입니다.' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message || '서버 오류' }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
