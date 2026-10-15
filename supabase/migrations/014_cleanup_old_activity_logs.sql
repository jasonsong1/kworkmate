-- ============================================================
-- 014_cleanup_old_activity_logs.sql
-- 목적: 활동 로그(activity_log) 3개월(90일) 보관 주기 정책 적용 및 자동 삭제
-- ============================================================

-- 1. 3개월(INTERVAL '3 months') 지난 활동 로그를 삭제하는 함수 생성
CREATE OR REPLACE FUNCTION public.cleanup_old_activity_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.activity_log
    WHERE created_at < (now() - INTERVAL '3 months');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- 함수 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.cleanup_old_activity_logs() TO authenticated, service_role, anon;

-- 2. pg_cron 익스텐션을 활용해 매일 새벽 3시(UTC)에 자동 삭제 작업 스케줄링
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 기존 동일 스케줄이 있다면 삭제 후 재등록
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-activity-logs-daily') THEN
        PERFORM cron.unschedule('cleanup-activity-logs-daily');
    END IF;
    
    PERFORM cron.schedule(
        'cleanup-activity-logs-daily',
        '0 3 * * *',
        'SELECT public.cleanup_old_activity_logs()'
    );
END $$;
