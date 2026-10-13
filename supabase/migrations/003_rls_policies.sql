-- ============================================================
-- 003_rls_policies.sql
-- 목적: 테이블별 접근 정책(RLS) 적용. 원칙: "전부 막고, 필요한 것만 연다"
-- 선행 조건: 002_rls_helper_functions.sql 을 먼저 실행해야 합니다.
-- 실행 위치: Supabase 대시보드 > SQL Editor (여러 번 실행해도 안전합니다)
--
-- 참고) Edge Function이 쓰는 service_role 키는 RLS를 무시하므로 아래 정책의 영향을 받지 않습니다.
-- ============================================================

-- ------------------------------------------------------------
-- 0. 비로그인(anon) 사용자는 모든 테이블 접근 권한 자체를 회수
--    (채용공고 공개 조회 등은 Edge Function 으로 처리합니다)
-- ------------------------------------------------------------
revoke all on
  public."applicant", public."availability_submission", public."branch", public."calendar_subscription",
  public."company", public."employee_profile", public."interview_slot", public."job",
  public."leave_balance", public."leave_request", public."leave_type", public."login_session",
  public."notification", public."package_module", public."password_reset", public."position_preset",
  public."push_subscription", public."push_vapid_key", public."regional_holiday",
  public."roster_setting", public."shift", public."time_entry"
from anon;

-- ------------------------------------------------------------
-- A등급. 서버 전용 테이블: 브라우저(authenticated)도 완전 차단
--  - 정책을 하나도 만들지 않고 권한도 회수 → Edge Function(service_role)만 접근 가능
-- ------------------------------------------------------------
revoke all on
  public."login_session", public."password_reset", public."push_vapid_key", public."push_subscription"
from authenticated;

-- ------------------------------------------------------------
-- 공통 참조 테이블: 로그인한 사람은 읽기만 가능
-- ------------------------------------------------------------
drop policy if exists kw_select_all on public."package_module";
create policy kw_select_all on public."package_module" for select to authenticated using (true);
revoke insert, update, delete on public."package_module" from authenticated;

drop policy if exists kw_select_all on public."position_preset";
create policy kw_select_all on public."position_preset" for select to authenticated using (true);
revoke insert, update, delete on public."position_preset" from authenticated;

-- ------------------------------------------------------------
-- B등급. 회사 단위 테이블
-- ------------------------------------------------------------

-- company: 내 회사만 조회 / 수정은 사장만 / 생성·삭제는 서버만
drop policy if exists kw_select on public."company";
create policy kw_select on public."company" for select to authenticated
  using (public.kw_in_company(id));
drop policy if exists kw_update on public."company";
create policy kw_update on public."company" for update to authenticated
  using (public.kw_is_company_admin(id)) with check (public.kw_is_company_admin(id));
revoke insert, delete on public."company" from authenticated;

-- branch: 내 회사 지점 조회 / 수정·생성·삭제는 사장만
drop policy if exists kw_select on public."branch";
create policy kw_select on public."branch" for select to authenticated
  using (public.kw_in_company(company_id));
drop policy if exists kw_write on public."branch";
create policy kw_write on public."branch" for all to authenticated
  using (public.kw_is_company_admin(company_id)) with check (public.kw_is_company_admin(company_id));

-- leave_type, regional_holiday: 회사 구성원 조회 / 사장만 수정
drop policy if exists kw_select on public."leave_type";
create policy kw_select on public."leave_type" for select to authenticated
  using (public.kw_in_company(company_id));
drop policy if exists kw_write on public."leave_type";
create policy kw_write on public."leave_type" for all to authenticated
  using (public.kw_is_company_admin(company_id)) with check (public.kw_is_company_admin(company_id));

drop policy if exists kw_select on public."regional_holiday";
create policy kw_select on public."regional_holiday" for select to authenticated
  using (public.kw_in_company(company_id));
drop policy if exists kw_write on public."regional_holiday";
create policy kw_write on public."regional_holiday" for all to authenticated
  using (public.kw_is_company_admin(company_id)) with check (public.kw_is_company_admin(company_id));

-- roster_setting: 소속 지점 구성원 조회 / 지점 관리자만 수정
drop policy if exists kw_select on public."roster_setting";
create policy kw_select on public."roster_setting" for select to authenticated
  using (public.kw_in_branch(company_id, branch_id));
drop policy if exists kw_write on public."roster_setting";
create policy kw_write on public."roster_setting" for all to authenticated
  using (public.kw_can_manage_branch(company_id, branch_id))
  with check (public.kw_can_manage_branch(company_id, branch_id));

-- job, interview_slot, applicant(지원자 개인정보): 해당 지점 관리자(매니저/사장)만 조회·수정
drop policy if exists kw_manage on public."job";
create policy kw_manage on public."job" for all to authenticated
  using (public.kw_can_manage_branch(company_id, branch_id))
  with check (public.kw_can_manage_branch(company_id, branch_id));

drop policy if exists kw_manage on public."interview_slot";
create policy kw_manage on public."interview_slot" for all to authenticated
  using (public.kw_can_manage_branch(company_id, branch_id))
  with check (public.kw_can_manage_branch(company_id, branch_id));

drop policy if exists kw_manage on public."applicant";
create policy kw_manage on public."applicant" for all to authenticated
  using (public.kw_can_manage_branch(company_id, branch_id))
  with check (public.kw_can_manage_branch(company_id, branch_id));

-- ------------------------------------------------------------
-- C등급. 본인 / 지점 단위 테이블
--  본인 확인: 행의 이메일 = JWT 이메일 AND 회사 일치
-- ------------------------------------------------------------

-- shift(근무표): 소속 지점 구성원은 조회(로스터 공유) / 수정은 관리자만
drop policy if exists kw_select on public."shift";
create policy kw_select on public."shift" for select to authenticated
  using (public.kw_in_branch(company_id, branch_id));
drop policy if exists kw_write on public."shift";
create policy kw_write on public."shift" for all to authenticated
  using (public.kw_can_manage_branch(company_id, branch_id))
  with check (public.kw_can_manage_branch(company_id, branch_id));

-- time_entry(출퇴근 기록): 본인 또는 관리자 조회 / 쓰기는 관리자만 (직원 출퇴근은 Edge Function)
drop policy if exists kw_select on public."time_entry";
create policy kw_select on public."time_entry" for select to authenticated
  using (
    (company_id = public.kw_company_id() and lower(employee_email) = public.kw_email())
    or public.kw_can_manage_branch(company_id, branch_id)
  );
drop policy if exists kw_write on public."time_entry";
create policy kw_write on public."time_entry" for all to authenticated
  using (public.kw_can_manage_branch(company_id, branch_id))
  with check (public.kw_can_manage_branch(company_id, branch_id));

-- leave_request(휴가 신청): 본인 또는 관리자 조회 / 본인은 신청(insert) 가능 / 승인·수정은 관리자
drop policy if exists kw_select on public."leave_request";
create policy kw_select on public."leave_request" for select to authenticated
  using (
    (company_id = public.kw_company_id() and lower(employee_email) = public.kw_email())
    or public.kw_can_manage_branch(company_id, branch_id)
  );
drop policy if exists kw_insert_own on public."leave_request";
create policy kw_insert_own on public."leave_request" for insert to authenticated
  with check (company_id = public.kw_company_id() and lower(employee_email) = public.kw_email());
drop policy if exists kw_manage on public."leave_request";
create policy kw_manage on public."leave_request" for all to authenticated
  using (public.kw_can_manage_branch(company_id, branch_id))
  with check (public.kw_can_manage_branch(company_id, branch_id));

-- leave_balance(휴가 잔여): 본인 또는 관리자 조회 / 수정은 관리자
drop policy if exists kw_select on public."leave_balance";
create policy kw_select on public."leave_balance" for select to authenticated
  using (
    (company_id = public.kw_company_id() and lower(employee_email) = public.kw_email())
    or public.kw_can_manage_branch(company_id, branch_id)
  );
drop policy if exists kw_write on public."leave_balance";
create policy kw_write on public."leave_balance" for all to authenticated
  using (public.kw_can_manage_branch(company_id, branch_id))
  with check (public.kw_can_manage_branch(company_id, branch_id));

-- availability_submission(근무가능시간 제출): 본인은 조회/제출/수정 / 관리자는 전체
drop policy if exists kw_own on public."availability_submission";
create policy kw_own on public."availability_submission" for all to authenticated
  using (company_id = public.kw_company_id() and lower(employee_email) = public.kw_email())
  with check (company_id = public.kw_company_id() and lower(employee_email) = public.kw_email());
drop policy if exists kw_manage on public."availability_submission";
create policy kw_manage on public."availability_submission" for all to authenticated
  using (public.kw_can_manage_branch(company_id, branch_id))
  with check (public.kw_can_manage_branch(company_id, branch_id));

-- notification(알림): 본인 것만 조회/읽음처리/삭제 (알림 생성은 서버)
drop policy if exists kw_own on public."notification";
create policy kw_own on public."notification" for all to authenticated
  using (company_id = public.kw_company_id() and lower(user_email) = public.kw_email())
  with check (company_id = public.kw_company_id() and lower(user_email) = public.kw_email());

-- calendar_subscription(캘린더 구독): 본인 것만
drop policy if exists kw_own on public."calendar_subscription";
create policy kw_own on public."calendar_subscription" for all to authenticated
  using (company_id = public.kw_company_id() and lower(user_email) = public.kw_email())
  with check (company_id = public.kw_company_id() and lower(user_email) = public.kw_email());

-- ------------------------------------------------------------
-- employee_profile(직원 정보): 행 단위 정책 + "컬럼 단위" 보호
--  RLS는 행(row)만 거르고 컬럼은 못 숨기므로, 민감 컬럼은 권한 자체를 회수합니다.
--  민감 컬럼(브라우저에서 읽기/쓰기 모두 불가, Edge Function 만 접근):
--    password_hash, password_salt, password_history, pin_hash, pin_salt, onboarding_token,
--    tfn_number, bank_bsb, bank_account_number, bank_account_name, super_member_number
-- ------------------------------------------------------------
drop policy if exists kw_select on public."employee_profile";
create policy kw_select on public."employee_profile" for select to authenticated
  using (
    (company_id = public.kw_company_id() and lower(user_email) = public.kw_email())
    or public.kw_can_manage_branch(company_id, branch_id)
  );
drop policy if exists kw_write on public."employee_profile";
create policy kw_write on public."employee_profile" for all to authenticated
  using (public.kw_can_manage_branch(company_id, branch_id))
  with check (public.kw_can_manage_branch(company_id, branch_id));

-- 테이블 전체 권한을 회수한 뒤, 민감하지 않은 컬럼만 다시 허용
revoke all on public."employee_profile" from authenticated;

grant select (
  company_id, branch_id, user_email, full_name, employee_number, position, secondary_position,
  extra_positions, visa_type, app_role, language, hourly_rate, employment_type, status, start_date,
  phone, date_of_birth, address, emergency_contact_name, emergency_contact_phone, onboarding_status,
  onboarding_submitted_at, docs, onboarding_answers, tfn_pending, residency_status,
  tax_free_threshold, hecs_help, super_choice, super_fund_name, super_usi, super_fund_abn,
  signature_file_uri, signed_at, applicant_id, login_id, password_set, password_updated_at,
  password_set_by, login_failed_count, login_locked_until, last_login_at,
  id, created_date, updated_date, created_by_id, is_sample
) on public."employee_profile" to authenticated;

grant insert, update (
  company_id, branch_id, user_email, full_name, employee_number, position, secondary_position,
  extra_positions, visa_type, app_role, language, hourly_rate, employment_type, status, start_date,
  phone, date_of_birth, address, emergency_contact_name, emergency_contact_phone, onboarding_status,
  onboarding_submitted_at, docs, onboarding_answers, tfn_pending, residency_status,
  tax_free_threshold, hecs_help, super_choice, super_fund_name, super_usi, super_fund_abn,
  signature_file_uri, signed_at, applicant_id, login_id,
  id, created_date, updated_date, created_by_id, is_sample
) on public."employee_profile" to authenticated;

grant delete on public."employee_profile" to authenticated;
