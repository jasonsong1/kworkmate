-- 024_add_xero_oauth_columns_to_company.sql
-- 목적: company 테이블에 Xero OAuth 2.0 연동 상태 및 테넌트, 토큰 정보 칼럼 추가

ALTER TABLE public.company
  ADD COLUMN IF NOT EXISTS xero_connected boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS xero_tenant_id text,
  ADD COLUMN IF NOT EXISTS xero_tenant_name text,
  ADD COLUMN IF NOT EXISTS xero_access_token text,
  ADD COLUMN IF NOT EXISTS xero_refresh_token text,
  ADD COLUMN IF NOT EXISTS xero_token_expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS xero_connected_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS xero_disconnected_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS xero_last_synced_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS xero_last_sync_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xero_last_sync_hours numeric DEFAULT 0;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_company_xero_connected ON public.company(xero_connected);

-- PostgREST 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';
