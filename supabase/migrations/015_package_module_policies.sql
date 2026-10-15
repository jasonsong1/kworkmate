-- ============================================================
-- 015_package_module_policies.sql
-- 목적: package_module 테이블에 대한 쓰기(INSERT, UPDATE, DELETE) RLS 정책 부여
-- ============================================================

DROP POLICY IF EXISTS "kw_package_module_all" ON public.package_module;
CREATE POLICY "kw_package_module_all" ON public.package_module
    FOR ALL
    USING (true)
    WITH CHECK (true);
