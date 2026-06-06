-- ============================================================
-- 내벨업보카 정오표 (errata) — 2026-06-06
-- ============================================================
-- 배경:
--   실물 교재는 이미 학생들에게 배포됨(회수 불가). 구판/신판 책이 동시에 존재.
--   따라서 정답을 그냥 덮어쓰면 한쪽 코호트가 시험에서 탈락함.
--   → "빈칸 1개 + '|'로 구분된 복수 허용답안" 방식으로 양쪽 모두 정답 처리.
--     ('|' 채점 지원은 js/vocab-test-logic-v2.js 에 반영됨)
--   → 결과 화면 대표 정답은 '|' 앞 첫 번째 값으로 표시됨.
--
-- 적용 대상 (4행):
--   p5  absorbing : learning            → fascinating|learning
--   p54 subsist   : exist of presence   → survive|get by|exist of presence
--   p59 unique    : distinct + without variation(2칸) → distinct|without variation (1칸)
--   p59 uniform   : invariable          → invariable|without variation
--
-- 향후(구판 책 학생이 해당 페이지 시험 완료 후) 정리(sunset)는 파일 하단 참고.
-- ============================================================

-- ── 변경 전 현재값 확인 ──
SELECT id, page, headword, synonym1, synonym2
FROM tr_vocab
WHERE id IN ('page5_absorbing', 'page54_subsist', 'page59_unique', 'page59_uniform')
ORDER BY page, id;

-- ── 업데이트 ──
BEGIN;

-- p5 absorbing: learning(오답) → 정답 fascinating, 구판 learning 과도기 구제
UPDATE tr_vocab
SET synonym1 = 'fascinating|learning'
WHERE id = 'page5_absorbing';

-- p54 subsist: exist of presence(오답) → 신판 정답 survive(단일), 구판 과도기 구제
--   신판 동의어를 survive 하나로 확정 → 영구 1칸 (get by 미사용)
UPDATE tr_vocab
SET synonym1 = 'survive|exist of presence'
WHERE id = 'page54_subsist';

-- p59 unique: without variation 제거(uniform으로 이동) → distinct 단일.
--   구판은 1칸에 distinct/without variation 아무거나 허용. synonym2 비움(빈칸 1개로 축소).
UPDATE tr_vocab
SET synonym1 = 'distinct|without variation',
    synonym2 = ''
WHERE id = 'page59_unique';

-- p59 uniform: without variation 추가 → invariable + without variation.
--   구판(invariable만)·신판(둘 다) 모두 1칸에 아무거나 허용.
UPDATE tr_vocab
SET synonym1 = 'invariable|without variation'
WHERE id = 'page59_uniform';

COMMIT;

-- ── 변경 후 확인 ──
SELECT id, page, headword, synonym1, synonym2
FROM tr_vocab
WHERE id IN ('page5_absorbing', 'page54_subsist', 'page59_unique', 'page59_uniform')
ORDER BY page, id;


-- ============================================================
-- [참고] SUNSET — 구판 책 학생이 해당 페이지 시험을 모두 끝낸 뒤에만 실행.
--   지금은 실행하지 말 것. 코드 수정 없이 데이터만 되돌리면 됨.
-- ============================================================
-- UPDATE tr_vocab SET synonym1 = 'fascinating'        WHERE id = 'page5_absorbing';
-- UPDATE tr_vocab SET synonym1 = 'survive'            WHERE id = 'page54_subsist';   -- 영구 1칸 (구답만 제거)
-- UPDATE tr_vocab SET synonym1 = 'distinct'           WHERE id = 'page59_unique';
-- UPDATE tr_vocab SET synonym1 = 'invariable', synonym2 = 'without variation' WHERE id = 'page59_uniform';  -- 2칸으로 확장
