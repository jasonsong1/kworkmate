-- ============================================================
-- 005_seed_super_admin.sql
-- 목적: 최고 관리자(Super Admin) sym910403@gmail.com 계정 등록 및 암호화 비밀번호 설정
-- 보안: 비밀번호는 단방향 솔트 해시(PBKDF2 SHA-256, 100,000회)로 암호화되어 안전하게 저장됩니다.
-- ============================================================

INSERT INTO public.employee_profile (
  id,
  company_id,
  branch_id,
  user_email,
  login_id,
  full_name,
  employee_number,
  position,
  app_role,
  status,
  password_hash,
  password_salt,
  password_set,
  password_updated_at,
  login_failed_count,
  is_sample,
  created_date,
  updated_date
) VALUES (
  '6abe02c194efffc0bb4899ad',
  '6abe02c194efffc0bb4899fe',
  '6abe02c1d438872ce262be01',
  'sym910403@gmail.com',
  'sym910403@gmail.com',
  'Super Admin',
  'ADMIN-001',
  'owner',
  'company_admin',
  'active',
  'a4f1756370fe2cbe5d4bf915acca015fd70131b8dbfc5b62f665bf8c46abd4c1',
  'efed2acd0ee33013536bc1bcf7a8756b',
  true,
  NOW(),
  0,
  false,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  password_salt = EXCLUDED.password_salt,
  password_set = true,
  app_role = 'company_admin',
  status = 'active',
  updated_date = NOW();
