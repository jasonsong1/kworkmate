-- 023_add_date_columns_to_invoices.sql
-- Base44 엔티티 규격(created_date, updated_date)을 invoices 테이블에 추가하여 호환성 보장

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS created_date timestamp with time zone DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS updated_date timestamp with time zone DEFAULT timezone('utc'::text, now());

-- 기존 레코드의 날짜 데이터 동기화
UPDATE public.invoices
SET created_date = COALESCE(created_at, timezone('utc'::text, now())),
    updated_date = COALESCE(updated_at, timezone('utc'::text, now()))
WHERE created_date IS NULL OR updated_date IS NULL;
