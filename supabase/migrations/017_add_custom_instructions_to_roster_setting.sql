-- 017_add_custom_instructions_to_roster_setting.sql
-- 고용주가 AI 로스터 생성 시 반영하고 싶은 개별 맞춤 요청사항(자연어 지침)을 저장하기 위한 컬럼 추가

ALTER TABLE roster_setting 
ADD COLUMN IF NOT EXISTS custom_instructions TEXT DEFAULT '';

COMMENT ON COLUMN roster_setting.custom_instructions IS '고용주 맞춤 AI 로스터 생성 지침 (자연어 규칙)';
