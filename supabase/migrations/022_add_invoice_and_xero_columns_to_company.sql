-- 022_add_invoice_and_xero_columns_to_company.sql
-- company 테이블에 인보이스 수신 이메일 및 Xero 유료 애드온(월 $20) 칼럼 추가

ALTER TABLE public.company
  ADD COLUMN IF NOT EXISTS invoice_email text,
  ADD COLUMN IF NOT EXISTS last_invoice_sent_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_invoice_number text,
  ADD COLUMN IF NOT EXISTS last_invoice_amount numeric,
  ADD COLUMN IF NOT EXISTS xero_addon_enabled boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS xero_addon_enabled_at timestamp with time zone;

-- Xero 애드온 및 인보이스 이메일 검색 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_company_xero_addon_enabled ON public.company(xero_addon_enabled);
CREATE INDEX IF NOT EXISTS idx_company_invoice_email ON public.company(invoice_email);

COMMENT ON COLUMN public.company.invoice_email IS '고객사 인보이스 수신 전용 이메일 주소';
COMMENT ON COLUMN public.company.xero_addon_enabled IS 'Xero 연동 유료 애드온(월 $20) 슈퍼어드민 활성화 여부';
