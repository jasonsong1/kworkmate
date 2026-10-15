-- ============================================================
-- 013_create_activity_logs.sql
-- 목적: 각 지점 및 회사별 사용자 활동/감사 로그(Activity Log) 테이블 생성
-- ============================================================

CREATE TABLE IF NOT EXISTS public.activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    company_id TEXT NOT NULL,
    branch_id TEXT, -- 특정 지점 관련 액션인 경우 지점 ID 저장, 전사적 설정은 NULL 가능
    actor_email TEXT NOT NULL,
    actor_name TEXT,
    actor_role TEXT,
    preset_key TEXT,
    module TEXT NOT NULL, -- 'attendance', 'leave', 'employees', 'settings', 'branches', 'jobs', 'applicants', 'interviews', 'roster'
    action TEXT NOT NULL, -- 'create', 'update', 'delete', 'approve', 'reject', 'clock_in', 'clock_out' 등
    target_id TEXT,
    target_name TEXT,
    summary TEXT NOT NULL, -- 사람이 읽기 쉬운 한 줄 요약 (예: "홍길동 직원의 출근 시간을 09:00 -> 10:00으로 수정함")
    details JSONB, -- 디테일한 로그: { before: {...}, after: {...}, reason: '...', diff: [...] }
    ip_address TEXT,
    user_agent TEXT
);

-- 검색 및 필터 성능 향상을 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_activity_log_branch ON public.activity_log(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_company ON public.activity_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_module ON public.activity_log(module, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON public.activity_log(actor_email, created_at DESC);

-- RLS 활성화
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- 익명/인증 사용자 읽기 및 쓰기 정책 (kwData 및 클라이언트 직통 쿼리 호환)
DROP POLICY IF EXISTS "activity_log_all_access" ON public.activity_log;
CREATE POLICY "activity_log_all_access" ON public.activity_log
    FOR ALL
    USING (true)
    WITH CHECK (true);
