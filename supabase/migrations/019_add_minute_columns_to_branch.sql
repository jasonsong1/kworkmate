-- 019_add_minute_columns_to_branch.sql
-- 지점별 로스터 이메일 발송 및 자동 초안 생성의 '분(Minute)' 설정을 저장하기 위한 컬럼 추가

ALTER TABLE "public"."branch" 
ADD COLUMN IF NOT EXISTS "roster_email_minute" numeric DEFAULT 0;

ALTER TABLE "public"."branch" 
ADD COLUMN IF NOT EXISTS "roster_auto_minute" numeric DEFAULT 0;

COMMENT ON COLUMN "public"."branch"."roster_email_minute" IS '로스터 근무 가능 시간 요청 이메일 자동 발송 분 (0~59)';
COMMENT ON COLUMN "public"."branch"."roster_auto_minute" IS '다음 주 로스터 초안 자동 생성 분 (0~59)';
