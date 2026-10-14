-- ============================================================
-- 009_add_role_column_to_employee_profile.sql
-- 목적: employee_profile 테이블에 role 컬럼 추가 (User 엔티티 호환용)
--       슈퍼어드민('admin') 및 일반 유저('user') 구분을 위한 스키마 동기화
-- ============================================================

-- 1. role 컬럼 추가 (기본값: 'user')
alter table public.employee_profile
add column if not exists role text default 'user';

-- 2. 기존 슈퍼어드민 계정의 role을 'admin'으로 업데이트
update public.employee_profile
set role = 'admin'
where lower(user_email) = 'sym910403@gmail.com';

-- 3. PostgREST 스키마 캐시 리로드 (스키마 변경 즉시 반영)
notify pgrst, 'reload schema';
