-- 직원 프로필 테이블에 패널티 시급 적용 여부(기본값: false / 미적용) 컬럼 추가
ALTER TABLE "public"."employee_profile" 
ADD COLUMN IF NOT EXISTS "penalty_rates_enabled" boolean DEFAULT false;
