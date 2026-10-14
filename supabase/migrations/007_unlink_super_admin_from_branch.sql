-- 007: 슈퍼어드민 계정을 특정 지점 소속에서 분리 (branch_id = null)
-- 슈퍼어드민은 특정 지점의 직원이 아니라 플랫폼 총괄 관리자이므로
-- 지점별 직원 관리(EmployeeProfile) 목록에 포함되지 않도록 branch_id를 해제합니다.
update public.employee_profile set branch_id = null where lower(user_email) = 'sym910403@gmail.com';
update public.login_session set branch_id = null where lower(email) = 'sym910403@gmail.com';
