-- ============================================================
-- 004_create_storage_buckets.sql
-- 목적: 앱에서 사용할 파일 저장소(Storage) 버킷 생성
--   1) 'private' 버킷: 직원 이력서, 서명 서류 등 민감 파일 (비공개, 서명 URL로만 접근)
--   2) 'public' 버킷: 회사 로고, 지점 사진 등 공개 파일
--
-- 실행 위치: Supabase 대시보드 > SQL Editor (여러 번 실행해도 안전합니다)
-- ============================================================

-- 1. private 버킷 생성 (비공개)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private',
  'private',
  false,
  52428800, -- 50MB 제한
  null
)
on conflict (id) do update set
  public = false;

-- 2. public 버킷 생성 (공개)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public',
  'public',
  true,
  10485760, -- 10MB 제한
  null
)
on conflict (id) do update set
  public = true;

-- 3. RLS 정책: 인증된 사용자(또는 service_role)의 파일 업로드/조회 허용
-- public 버킷 누구나 읽기 허용
drop policy if exists "Public Access" on storage.objects;
create policy "Public Access" on storage.objects for select
using (bucket_id = 'public');

-- 로그인한 사용자 업로드 허용
drop policy if exists "Authenticated Upload" on storage.objects;
create policy "Authenticated Upload" on storage.objects for insert
to authenticated
with check (bucket_id in ('public', 'private'));

-- 로그인한 사용자 본인 파일 수정/삭제 허용
drop policy if exists "Authenticated Manage" on storage.objects;
create policy "Authenticated Manage" on storage.objects for all
to authenticated
using (bucket_id in ('public', 'private'));
