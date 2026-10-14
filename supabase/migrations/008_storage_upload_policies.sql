-- ============================================================
-- 008_storage_upload_policies.sql
-- 목적: 공고 로고, 지원자 이력서, 온보딩 서류 업로드를 위한 Storage RLS 정책 설정
--   1) public 버킷: 익명(anon) 및 인증(authenticated) 사용자 누구나 업로드 및 조회 가능
--   2) private 버킷: 익명(anon) 및 인증(authenticated) 사용자 누구나 파일 업로드 가능
--      (공고 지원자가 로그인 없이 이력서를 제출할 수 있어야 함)
--
-- 실행 위치: Supabase 대시보드 > SQL Editor 또는 MCP execute_sql
-- ============================================================

-- 1. public 버킷 업로드 정책 (누구나 업로드 가능)
drop policy if exists "Allow Public Bucket Insert" on storage.objects;
create policy "Allow Public Bucket Insert" on storage.objects
for insert
to public
with check (bucket_id = 'public');

-- 2. public 버킷 조회 정책 (누구나 읽기 가능)
drop policy if exists "Allow Public Bucket Select" on storage.objects;
create policy "Allow Public Bucket Select" on storage.objects
for select
to public
using (bucket_id = 'public');

-- 3. private 버킷 업로드 정책 (이력서 제출 등 익명/인증 사용자 누구나 파일 등록 가능)
drop policy if exists "Allow Private Bucket Insert" on storage.objects;
create policy "Allow Private Bucket Insert" on storage.objects
for insert
to public
with check (bucket_id = 'private');

-- 4. public 및 private 버킷 업데이트/삭제 정책 (관리 및 갱신용)
drop policy if exists "Allow Manage Objects" on storage.objects;
create policy "Allow Manage Objects" on storage.objects
for all
to public
using (bucket_id in ('public', 'private'))
with check (bucket_id in ('public', 'private'));
