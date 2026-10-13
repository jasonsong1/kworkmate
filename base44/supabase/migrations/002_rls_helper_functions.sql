-- ============================================================
-- 002_rls_helper_functions.sql
-- 목적: RLS 정책에서 "지금 요청한 사람이 누구인지"를 쉽게 읽기 위한 도우미 함수 모음
--
-- 전제: 로그인 성공 시 Edge Function(kwLogin)이 아래 값을 담은 JWT를 발급합니다. (3단계에서 구현)
--   company_id  : 소속 회사 ID                  (예: "abc123")
--   email       : 직원 이메일
--   kw_level    : 'platform_admin' | 'company_admin' | 'manager' | 'staff'
--   branch_ids  : 접근 가능한 지점 ID 배열       (예: ["b1","b2"])
--
-- 이 JWT는 서버만 가진 비밀키로 서명되므로 브라우저에서 위조할 수 없습니다.
-- 실행 위치: Supabase 대시보드 > SQL Editor (여러 번 실행해도 안전합니다)
-- ============================================================

-- 내 회사 ID
create or replace function public.kw_company_id()
returns text language sql stable
as $$ select nullif(auth.jwt() ->> 'company_id', '') $$;

-- 내 이메일 (소문자로 통일해서 비교 오류 방지)
create or replace function public.kw_email()
returns text language sql stable
as $$ select lower(nullif(auth.jwt() ->> 'email', '')) $$;

-- 내 권한 등급
create or replace function public.kw_level()
returns text language sql stable
as $$ select nullif(auth.jwt() ->> 'kw_level', '') $$;

-- 내가 접근 가능한 지점 ID 목록 (없으면 빈 배열)
create or replace function public.kw_branch_ids()
returns text[] language sql stable
as $$
  select coalesce(
    array(select jsonb_array_elements_text(auth.jwt() -> 'branch_ids')),
    '{}'::text[]
  )
$$;

-- 플랫폼 전체 관리자인가?
create or replace function public.kw_is_platform_admin()
returns boolean language sql stable
as $$ select coalesce(public.kw_level() = 'platform_admin', false) $$;

-- 이 회사의 구성원인가? (플랫폼 관리자는 모든 회사 가능)
create or replace function public.kw_in_company(p_company text)
returns boolean language sql stable
as $$
  select public.kw_is_platform_admin()
      or (p_company is not null and p_company = public.kw_company_id())
$$;

-- 이 회사의 사장(company_admin)인가?
create or replace function public.kw_is_company_admin(p_company text)
returns boolean language sql stable
as $$
  select public.kw_is_platform_admin()
      or (public.kw_level() = 'company_admin'
          and p_company is not null
          and p_company = public.kw_company_id())
$$;

-- 이 지점의 데이터를 볼 수 있는가? (사장: 회사 전체 / 매니저·직원: 소속 지점)
create or replace function public.kw_in_branch(p_company text, p_branch text)
returns boolean language sql stable
as $$
  select public.kw_is_company_admin(p_company)
      or (p_company is not null
          and p_company = public.kw_company_id()
          and p_branch is not null
          and p_branch = any(public.kw_branch_ids()))
$$;

-- 이 지점의 데이터를 "관리(수정)"할 수 있는가? (사장 또는 해당 지점 매니저)
create or replace function public.kw_can_manage_branch(p_company text, p_branch text)
returns boolean language sql stable
as $$
  select public.kw_is_company_admin(p_company)
      or (public.kw_level() = 'manager'
          and public.kw_in_branch(p_company, p_branch))
$$;

-- 브라우저(로그인 전 포함)가 이 함수들을 호출해도 JWT 값만 읽을 뿐 안전하지만,
-- 불필요한 노출을 줄이기 위해 로그인한 사용자(authenticated)에게만 실행을 허용합니다.
revoke execute on function
  public.kw_company_id(), public.kw_email(), public.kw_level(), public.kw_branch_ids(),
  public.kw_is_platform_admin(), public.kw_in_company(text), public.kw_is_company_admin(text),
  public.kw_in_branch(text, text), public.kw_can_manage_branch(text, text)
from public, anon;

grant execute on function
  public.kw_company_id(), public.kw_email(), public.kw_level(), public.kw_branch_ids(),
  public.kw_is_platform_admin(), public.kw_in_company(text), public.kw_is_company_admin(text),
  public.kw_in_branch(text, text), public.kw_can_manage_branch(text, text)
to authenticated;
