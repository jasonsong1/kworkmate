-- 021_create_invoices_table.sql
-- KWorkMate 인보이스(Tax Invoice) 이력 및 수금(Paid) 관리 테이블 생성

CREATE TABLE IF NOT EXISTS public.invoices (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id text NOT NULL REFERENCES public.company(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  issue_date text NOT NULL,
  due_date text,
  plan_key text DEFAULT 'starter',
  plan_name text DEFAULT 'Starter',
  subtotal numeric DEFAULT 0,
  gst numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  recipient_email text,
  notes text,
  status text NOT NULL DEFAULT 'unpaid', -- 'unpaid' (미납) 또는 'paid' (입금완료)
  paid_at timestamp with time zone,      -- 계좌 입금 확인 시각
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 검색 성능 향상을 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON public.invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices(created_at DESC);

-- RLS (Row Level Security) 활성화
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- 1. 조회: 슈퍼어드민은 모든 인보이스 조회 가능, 일반 회사는 자기 회사의 인보이스만 조회 가능
DROP POLICY IF EXISTS kw_select_invoices ON public.invoices;
CREATE POLICY kw_select_invoices ON public.invoices
  FOR SELECT
  TO authenticated
  USING (
    public.kw_in_company(company_id)
  );

-- 2. 작성/수정/삭제: 슈퍼어드민(Platform Admin) 전용
DROP POLICY IF EXISTS kw_write_invoices ON public.invoices;
CREATE POLICY kw_write_invoices ON public.invoices
  FOR ALL
  TO authenticated
  USING (
    public.kw_is_platform_admin()
  )
  WITH CHECK (
    public.kw_is_platform_admin()
  );

-- 3. 서비스 롤(Edge Function / 백엔드) 전체 허용
DROP POLICY IF EXISTS kw_service_role_invoices ON public.invoices;
CREATE POLICY kw_service_role_invoices ON public.invoices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
