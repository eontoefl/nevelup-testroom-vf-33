-- ============================================================
-- 호주과정 OMR 정오표 (errata) — 2026-06-21
-- 리스닝23 OMR 3번 문항 정답 오류 수정
-- ============================================================
-- 배경:
--   aus_omr_answers (section_type='listening', module_number=23, id=45)의
--   3번 문항이 다중선택(type:'multi', count:2, answer:["A","D"])으로 잘못 등록됨.
--   실제 정답은 B 한 개 → 단일선택(type:'single', answer:'B')으로 정정.
--
--   ※ vocab 정오표와 달리 구판/신판 코호트 이슈 없음(채점 데이터 오류 단순 정정).
--     anon 키로는 RLS 때문에 UPDATE 불가 → 관리자 권한으로 SQL 에디터에서 실행할 것.
-- ============================================================

-- ── 변경 전 현재값 확인 ──
SELECT id, section_type, module_number, questions
FROM aus_omr_answers
WHERE id = 45;

-- ── 업데이트 ──
BEGIN;

-- 3번: multi(["A","D"]) → single('B'). questions 배열 전체를 정정본으로 교체.
UPDATE aus_omr_answers
SET questions = '[
  {"no":1,"type":"single","answer":"C"},
  {"no":2,"type":"single","answer":"A"},
  {"no":3,"type":"single","answer":"B"},
  {"no":4,"type":"single","answer":"C"},
  {"no":5,"type":"single","answer":"B"},
  {"no":6,"type":"single","answer":"B"}
]'::jsonb
WHERE id = 45
  AND section_type = 'listening'
  AND module_number = 23;

COMMIT;

-- ── 변경 후 확인 ──
SELECT id, section_type, module_number, questions
FROM aus_omr_answers
WHERE id = 45;
