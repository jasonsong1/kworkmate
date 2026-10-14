-- ==============================================================================
-- 011_create_tfn_declarations.sql
-- 호주 국세청(ATO) 공식 NAT 3092 Tax File Number Declaration 전용 테이블 및 RLS 정책
-- ==============================================================================

-- 1. TFN 공식 선언서 관리 테이블
CREATE TABLE IF NOT EXISTS public.tfn_declarations (
  id TEXT PRIMARY KEY DEFAULT ('tfn_' || replace(gen_random_uuid()::text, '-', '')),
  company_id TEXT NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES public.employee_profile(id) ON DELETE CASCADE,
  form_version TEXT NOT NULL DEFAULT 'NAT 3092-06.2019',
  status TEXT NOT NULL DEFAULT 'submitted', -- draft, submitted, verified, archived
  
  -- Section A (직원 답변 데이터: TFN 암호문, 주소, 비자, 문항 1~10 전체 JSON)
  payee_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Section B (제출 시점의 고용주 ABN, 상호, 사업장 주소 스냅샷)
  payer_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- 전자 서명 검증 정보 (IP, 서명 일시, 사용자 에이전트, 서명 파일 경로)
  signature_uri TEXT,
  signed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. 생성된 공식 PDF 문서 관리 테이블
CREATE TABLE IF NOT EXISTS public.tfn_documents (
  id TEXT PRIMARY KEY DEFAULT ('doc_' || replace(gen_random_uuid()::text, '-', '')),
  declaration_id TEXT NOT NULL REFERENCES public.tfn_declarations(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES public.employee_profile(id) ON DELETE CASCADE,
  
  storage_bucket TEXT NOT NULL DEFAULT 'private',
  storage_path TEXT NOT NULL, -- companies/{company_id}/employees/{employee_id}/tfn_nat3092_{timestamp}.pdf
  doc_version INT NOT NULL DEFAULT 1,
  file_size INT,
  sha256_hash TEXT,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 인덱스 생성 (조회 성능 최적화)
CREATE INDEX IF NOT EXISTS idx_tfn_declarations_emp ON public.tfn_declarations(employee_id);
CREATE INDEX IF NOT EXISTS idx_tfn_declarations_company ON public.tfn_declarations(company_id);
CREATE INDEX IF NOT EXISTS idx_tfn_documents_dec ON public.tfn_documents(declaration_id);
CREATE INDEX IF NOT EXISTS idx_tfn_documents_emp ON public.tfn_documents(employee_id);

-- 4. RLS (Row Level Security) 설정
ALTER TABLE public.tfn_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tfn_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on tfn_declarations" ON public.tfn_declarations;
CREATE POLICY "Service role full access on tfn_declarations"
  ON public.tfn_declarations FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on tfn_documents" ON public.tfn_documents;
CREATE POLICY "Service role full access on tfn_documents"
  ON public.tfn_documents FOR ALL TO service_role USING (true) WITH CHECK (true);
