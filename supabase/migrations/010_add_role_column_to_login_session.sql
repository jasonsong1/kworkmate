-- 010_add_role_column_to_login_session.sql
-- login_session 테이블에 role 컬럼 추가 및 슈퍼어드민 기본값 세팅

alter table public.login_session
  add column if not exists role text default 'user';

-- 기존 세션 중 슈퍼어드민이나 관리자 계정 업데이트
update public.login_session
set role = 'admin'
where lower(email) = 'sym910403@gmail.com'
   or app_role in ('super_admin', 'company_admin');

-- PostgREST 스키마 캐시 리로드
notify pgrst, 'reload schema';
