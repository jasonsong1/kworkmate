-- ============================================================
-- 016_grant_package_module_permissions.sql
-- 목적: package_module 테이블에 authenticated, anon, service_role 역할에 대한 전체 DML(SELECT, INSERT, UPDATE, DELETE) 권한 부여
-- ============================================================

GRANT ALL ON TABLE public.package_module TO authenticated, anon, service_role;
