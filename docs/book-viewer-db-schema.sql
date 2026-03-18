-- ================================================
-- PDF 뷰어 DB 스키마 (테이블 3개)
-- 실행 순서: 1 → 2 → 3 (외래키 의존성)
-- ================================================


-- ================================================
-- 1. tr_book_documents (책 관리)
-- ================================================
CREATE TABLE tr_book_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  storage_path TEXT NOT NULL,
  total_pages INTEGER NOT NULL,
  toc JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 활성 문서 목록 조회용 인덱스
CREATE INDEX idx_book_documents_active ON tr_book_documents (is_active, sort_order);

COMMENT ON TABLE tr_book_documents IS '입문서/교재 PDF 문서 관리';
COMMENT ON COLUMN tr_book_documents.storage_path IS 'Supabase Storage 경로 (예: books/intro-v3.pdf)';
COMMENT ON COLUMN tr_book_documents.toc IS '목차 JSON 배열 [{"title":"챕터명","page":1}, ...]';
COMMENT ON COLUMN tr_book_documents.is_active IS 'false면 학생에게 안 보임';
COMMENT ON COLUMN tr_book_documents.sort_order IS '목록 정렬 순서 (낮을수록 위)';


-- ================================================
-- 2. tr_book_progress (읽기 진도 + 북마크 + 완독)
-- ================================================
CREATE TABLE tr_book_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  book_id UUID NOT NULL REFERENCES tr_book_documents(id) ON DELETE CASCADE,
  last_page INTEGER DEFAULT 1,
  max_page_reached INTEGER DEFAULT 1,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  bookmarks JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (user_id, book_id)
);

-- 학생별 진도 조회용 인덱스
CREATE INDEX idx_book_progress_user ON tr_book_progress (user_id);
-- 관리자용: 특정 책의 완독 현황 조회
CREATE INDEX idx_book_progress_book_completed ON tr_book_progress (book_id, is_completed);

COMMENT ON TABLE tr_book_progress IS '학생별 읽기 진도, 북마크, 완독 체크';
COMMENT ON COLUMN tr_book_progress.user_id IS 'users.id (TEXT 타입, study_results_v3와 동일)';
COMMENT ON COLUMN tr_book_progress.last_page IS '마지막으로 본 페이지 (이어보기용)';
COMMENT ON COLUMN tr_book_progress.max_page_reached IS '가장 멀리 도달한 페이지 (진행률 계산용)';
COMMENT ON COLUMN tr_book_progress.bookmarks IS '북마크 페이지 배열 [5, 12, 23]';


-- ================================================
-- 3. tr_book_memos (페이지별 메모)
-- ================================================
CREATE TABLE tr_book_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  book_id UUID NOT NULL REFERENCES tr_book_documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) <= 1000),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (user_id, book_id, page_number)
);

-- 특정 책의 특정 학생 메모 전체 조회용
CREATE INDEX idx_book_memos_user_book ON tr_book_memos (user_id, book_id);

COMMENT ON TABLE tr_book_memos IS '학생별 페이지 메모 (한 페이지에 메모 1개)';
COMMENT ON COLUMN tr_book_memos.content IS '메모 내용 (최대 1000자)';


-- ================================================
-- 입문서 초기 데이터 (첫 번째 책 등록)
-- ================================================
INSERT INTO tr_book_documents (title, description, storage_path, total_pages, toc, is_active, sort_order)
VALUES (
  'TOEFL 입문서 (3개정)',
  'TOEFL 홈에디션 시험 준비를 위한 입문 안내서',
  'books/intro-v3.pdf',
  28,
  '[
    {"title": "홈에디션이란?", "page": 3},
    {"title": "금지 프로그램", "page": 7},
    {"title": "홈에디션 준비물", "page": 10},
    {"title": "시험 당일 할일들", "page": 15},
    {"title": "시험 중 주의사항", "page": 20},
    {"title": "시험 후 주의사항", "page": 24}
  ]'::jsonb,
  true,
  0
);
