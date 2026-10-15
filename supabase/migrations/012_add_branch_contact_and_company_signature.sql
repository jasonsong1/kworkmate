-- ==============================================================================
-- 012_add_branch_contact_and_company_signature.sql
-- 1) 지점(branch) 테이블에 고용주/담당자 연락처 컬럼 추가 (택스폼 Section B Q5, Q6 연동)
-- 2) 회사(company) 테이블에 고용주 공식 전자서명(tfn_employer_signature) 컬럼 추가
-- ==============================================================================

-- 1. branch 테이블에 contact_name, contact_email, contact_phone 추가
ALTER TABLE public.branch
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- 2. company 테이블에 고용주 ATO 서명(Base64/DataURL) 컬럼 추가
ALTER TABLE public.company
  ADD COLUMN IF NOT EXISTS tfn_employer_signature TEXT;

COMMENT ON COLUMN public.branch.contact_name IS '지점 고용주/담당자 이름 (ATO NAT 3092 Section B Q6)';
COMMENT ON COLUMN public.branch.contact_email IS '지점 공식 이메일 (ATO NAT 3092 Section B Q5)';
COMMENT ON COLUMN public.branch.contact_phone IS '지점 담당자 전화번호 (ATO NAT 3092 Section B Q6)';
COMMENT ON COLUMN public.company.tfn_employer_signature IS '고용주 공식 전자서명 Data URL (ATO NAT 3092 Section B 서명란)';
