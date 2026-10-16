-- 018_enable_supabase_realtime.sql
-- Supabase 웹소켓 Realtime 엔진 활성화
-- 새로고침(F5) 없이도 매니저와 직원의 화면이 0.1초 만에 실시간 동기화되도록 주요 테이블을 realtime publication에 등록합니다.

-- 1. publication이 없을 경우 생성
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- 2. 주요 실시간 감지 테이블 추가 (IF NOT EXISTS 처리를 위해 개별 예외 방어)
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'leave_request',
    'time_entry',
    'attendance_record',
    'shift',
    'availability_submission',
    'job_application',
    'employee_profile'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    -- 테이블이 존재하는지 확인 후 publication에 추가
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      IF NOT EXISTS (
        SELECT 1 
        FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', tbl);
      END IF;
    END IF;
  END LOOP;
END $$;
