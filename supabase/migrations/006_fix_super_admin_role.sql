-- 006: 슈퍼어드민 계정의 app_role을 company_admin으로 보정
-- 이유: 현재 배포된 서버 함수(kwData, saveCompanySettings 등)는 app_role 'super_admin'을 알지 못해
--       저장/직원 추가가 거부됩니다. company_admin이면 모든 모듈에 쓰기 권한이 부여됩니다.
-- (화면의 플랫폼 관리 권한은 이메일(sym910403@gmail.com) 기준으로 별도 판정됩니다.)
update public.employee_profile set app_role = 'company_admin' where lower(user_email) = 'sym910403@gmail.com';
update public.login_session set app_role = 'company_admin' where lower(email) = 'sym910403@gmail.com';
