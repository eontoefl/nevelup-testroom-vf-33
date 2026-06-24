-- ============================================================
-- 첨삭(FEEDBACK) 연장 = 2학기(세션 13~24) 지원용 컬럼 추가
-- 대상 테이블: correction_schedules (user_id 당 1행)
-- 작성: 2026-06
--
-- 관리자 운영 흐름:
--   1) 연장 결제 확인되면 extension_enabled = true 로 ON
--   2) extension_start_date 에 2학기 시작일(반드시 '일요일') 지정
--   ⇒ 두 값이 모두 채워지면 학생 화면에 세션 13~24가 노출됨
--
-- 주의:
--   - extension_start_date 는 1학기 start_date 와 동일하게 '일요일' 기준이어야
--     dayOffset(0/2/4 = 일/화/목) 계산이 맞습니다.
--   - 1학기 완료 여부는 강제 조건이 아닙니다(미완료여도 연장 가능).
-- ============================================================

ALTER TABLE correction_schedules
    ADD COLUMN IF NOT EXISTS extension_enabled    BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS extension_start_date DATE;

COMMENT ON COLUMN correction_schedules.extension_enabled
    IS '연장(2학기) 활성화 여부. true + extension_start_date 세팅 시 세션 13~24 노출';
COMMENT ON COLUMN correction_schedules.extension_start_date
    IS '2학기(세션 13~24) 기준 시작일. 일요일이어야 함. dayOffset은 이 날짜 기준 0부터 다시 시작';

-- ── 예시: 특정 학생 연장 켜기 ──
-- UPDATE correction_schedules
--    SET extension_enabled = TRUE,
--        extension_start_date = '2026-07-05'   -- 일요일
--  WHERE user_id = '<USER_UUID>';
