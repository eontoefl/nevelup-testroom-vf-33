# AI 첨삭(FEEDBACK) 기능 — 구현 계획서

> **문서 버전**: v1.0  
> **작성일**: 2026-04-08  
> **브랜치**: `edit_dev` (main에서 분기, dev와 독립)  
> **배포**: main 머지 전까지 edit_dev에서만 작업  

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [확정된 결정사항 (Q&A 전체 요약)](#2-확정된-결정사항)
3. [데이터베이스 스키마](#3-데이터베이스-스키마)
4. [파일 구조](#4-파일-구조)
5. [화면(Screen) 목록 및 흐름](#5-화면-목록-및-흐름)
6. [화면별 상세 명세](#6-화면별-상세-명세)
7. [상태 전이 (Status Flow)](#7-상태-전이)
8. [데드라인 로직](#8-데드라인-로직)
9. [Webhook / n8n 연동](#9-webhook--n8n-연동)
10. [CSS / 디자인 규칙](#10-css--디자인-규칙)
11. [기존 코드 수정 사항](#11-기존-코드-수정-사항)
12. [구현 순서](#12-구현-순서)
13. [테스트 체크리스트](#13-테스트-체크리스트)

---

## 1. 프로젝트 개요

### 1.1 목표
기존 Speaky V3 테스트룸에 "FEEDBACK" 탭을 추가하여, 학생이 Writing(Email/Discussion)과 Speaking(Interview) 과제를 제출하면 AI 첨삭 피드백(2단계: 1차 → 수정 → 최종)을 받을 수 있는 시스템을 구축한다.

### 1.2 기술 스택
- 순수 HTML / CSS / JavaScript (프레임워크 없음, 빌드 도구 없음)
- Supabase (DB, Storage, REST API)
- n8n (Webhook 기반 비동기 처리 — 별도 구축, 프론트는 호출만)
- GitHub Pages 배포

### 1.3 핵심 원칙
- 기존 정규과정 코드를 **클론/재사용**, 새로 짜지 않음
- 기존 CSS 변수(primary `#9480c5` 등) 그대로 사용
- 첨삭 화면만 design.md 레이아웃 규칙(No-Line, 배경색 차이 구분) 적용
- `edit_dev` 브랜치에서만 작업, `main`/`dev` 미접촉
- 관리자(test@me.com)는 항상 FEEDBACK 탭 접근 가능

---

## 2. 확정된 결정사항

> Q&A 전체 (Q1~Q42) 요약. 모든 항목은 확정 완료.

### 2.1 DB / 데이터 구조
| 항목 | 결정 |
|------|------|
| 탭 접근 권한 | `applications` 테이블에 `correction_enabled` BOOLEAN 컬럼 추가. 로그인 시 `getStudentProgram()`에서 함께 조회 |
| 스케줄 관리 | `correction_schedules` 테이블 (user_id UNIQUE, start_date DATE 일요일만, duration_weeks INT 기본값 4) |
| 문제 데이터 | `correction_tasks` 단일 테이블 폐기 → 3개 테이블: `correction_writing_email`, `correction_writing_discussion`, `correction_speaking_interview` (각 기존 `tr_*` 복제 + `model_answer_text`, `model_answer_audio_url` 컬럼 추가) |
| 제출 기록 | `correction_submissions` (한 세션에 Writing 행 1개 + Speaking 행 1개 = 별도 2행) |
| 행 생성 시점 | 실제 제출 시 INSERT (not_started 행 미리 생성 안 함). 행이 없으면 미시작으로 판단 |
| Draft 구조 | 한 행에 1차/2차 모두 담음 (draft_1_*, draft_2_* 별도 컬럼) |
| 오디오 파일 | JSONB 대신 개별 컬럼: draft_1_audio_q1~q4, draft_2_audio_q1~q4 (총 8개) |
| STT 결과 | stt_text_1, stt_text_2 (JSONB, {"q1":"...","q2":"...","q3":"...","q4":"..."}) |
| 피드백 상태 | feedback_1_status, feedback_2_status 분리 |
| 공개 여부 | released_1, released_2 분리 |
| 스케줄 데이터 | `correction-schedule-data.js`에 하드코딩 (12세션, 4주) |
| skip_deadline_at | 사용 안 함, 제거. 데드라인은 매일 04:00 고정 |
| 스토리지 버킷 | `correction-audio` (경로: `{user_id}/{task_type}_{task_number}_draft{1|2}_q{1-4}.webm`) |

### 2.2 UI / 화면 흐름
| 항목 | 결정 |
|------|------|
| 탭 이름 | **FEEDBACK** (TESTROOM \| PRACTICE \| FEEDBACK) |
| courseMode | `'correction'` 추가 (기존 regular/practice에 추가) |
| 메인 화면 레이아웃 | Week 1~4 그룹, 각 그룹에 세션 카드 3개 (정규과정 week-block 패턴 활용) |
| 화면 흐름 (3단계) | 세션 카드 → 세션 상세 (Writing/Speaking 카드 2개) → 과제 상세 (아코디언) |
| 과제 상세 구조 | 아코디언: Draft 1 / 1차 피드백 / Draft 2 / 최종 피드백 / 모범답안. 진행된 단계만 표시 |
| Writing 제출 | 모듈 컨트롤러 복제, Arrange 제외, Email 또는 Discussion 하나만 실행 |
| Writing 컴포넌트 | 기존 EmailComponent/DiscussionComponent 그대로 사용, loader만 첨삭 전용 |
| Writing 타이머 | Email 7분(420초), Discussion 10분(600초). 만료 시 알림만, 수동 제출 |
| Speaking 제출 | 기존 InterviewComponent 복제, 4문제 카운트다운(45초×4) 후 파일 업로드 화면 전환 |
| Speaking 녹음 | 실시간 녹음 없음. 카운트다운만, 별도 기기 녹음 후 파일 업로드 |
| 파일 업로드 | Q1~Q4 라벨 붙은 파일 선택 버튼 4개 개별 배치. 드래그앤드롭 아님 |
| 파일 형식 | mp3, m4a, wav, webm, mp4, ogg, aac 등 허용. zip 등 압축파일 차단. 25MB 제한 |
| 재제출 | 1차 제출 후 읽기전용. 재제출 불가 |
| 뒤로가기 | 카운트다운 중 뒤로가기 시 확인 팝업 ("진행을 취소하시겠습니까? 처음부터 다시 시작해야 합니다.") |

### 2.3 피드백 표시
| 항목 | 결정 |
|------|------|
| 인라인 첨삭 | `<mark class="correction-mark" data-comment="코멘트">교정 대상</mark>`. data-type 없음 |
| 툴팁 | PC: hover, 모바일/태블릿: tap. 말풍선 UI |
| mark 중첩 | 한 문장에 여러 mark 가능 (겹치지 않음) |
| Speaking 첨삭 | STT 텍스트에 동일하게 mark 적용 |
| 피드백 레이아웃 | annotated_html → summary 카드 → (2차) level 점수 배지 + encouragement 카드 |
| 오류 상태 | "첨삭 준비 중 문제가 발생했습니다. 잠시 후 다시 확인해주세요." |
| 모범답안 오디오 | 기존 미니 플레이어 패턴 그대로 사용 |

### 2.4 데드라인 / 상태
| 항목 | 결정 |
|------|------|
| 1차 마감 | 스케줄상 고정 (dayOffset 기준 다음날 04:00) |
| 2차 마감 | `max(스케줄상 마감, feedback_1_at + 24시간)` |
| expired/skipped | n8n이 일괄 처리 |
| failed 상태 | "첨삭 준비 중 문제가 발생했습니다. 잠시 후 다시 확인해주세요." |
| duration_weeks | correction_schedules에 추가 (INT, 기본값 4) |
| 스케줄 미배정 | 탭은 보이되 "아직 첨삭 일정이 배정되지 않았습니다. 담당자에게 문의해주세요." |

### 2.5 기타
| 항목 | 결정 |
|------|------|
| Webhook 설정 | `js/correction-config.js`에 전역 변수 (`window.CORRECTION_CONFIG`) |
| 관리자 접근 | `window.__isAdmin` 플래그 활용. correction_enabled 무관하게 FEEDBACK 탭 표시 |
| n8n 연동 | 프론트는 webhook 호출만. URL은 설정 파일에서 읽기 |
| 과도기 승인 | UI 없음. Supabase에서 released 직접 변경. 24시간 미승인 시 n8n 자동 승인 |

---

## 3. 데이터베이스 스키마

### 3.1 `applications` 테이블 — 컬럼 추가

```sql
ALTER TABLE applications
ADD COLUMN correction_enabled BOOLEAN DEFAULT FALSE;
```

### 3.2 `correction_schedules` 테이블 — 신규

```sql
CREATE TABLE correction_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    start_date DATE NOT NULL,           -- 반드시 일요일
    duration_weeks INT NOT NULL DEFAULT 4,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_correction_schedules_user ON correction_schedules(user_id);
```

### 3.3 `correction_writing_email` 테이블 — 신규 (tr_writing_email 복제)

```sql
CREATE TABLE correction_writing_email (
    -- tr_writing_email의 모든 컬럼 복제
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    scenario TEXT,
    task TEXT,
    instruction_1 TEXT,
    instruction_2 TEXT,
    instruction_3 TEXT,
    recipient TEXT,
    subject TEXT,
    sample_answer TEXT,
    bullet_1_must TEXT,
    bullet_1_sample TEXT,
    bullet_1_points TEXT,
    bullet_1_key TEXT,
    bullet_2_must TEXT,
    bullet_2_sample TEXT,
    bullet_2_points TEXT,
    bullet_2_key TEXT,
    bullet_3_must TEXT,
    bullet_3_sample TEXT,
    bullet_3_points TEXT,
    bullet_3_key TEXT,
    -- 첨삭 전용 추가 컬럼
    model_answer_text TEXT,
    model_answer_audio_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.4 `correction_writing_discussion` 테이블 — 신규 (tr_writing_discussion 복제)

```sql
CREATE TABLE correction_writing_discussion (
    -- tr_writing_discussion의 모든 컬럼 복제
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    class_context TEXT,
    topic TEXT,
    student_opinion_1_name TEXT,
    student_opinion_1_text TEXT,
    student_opinion_2_name TEXT,
    student_opinion_2_text TEXT,
    sample_answer TEXT,
    bullet_1_sentence TEXT,
    bullet_1_ets TEXT,
    bullet_1_strategy TEXT,
    bullet_2_sentence TEXT,
    bullet_2_ets TEXT,
    bullet_2_strategy TEXT,
    bullet_3_sentence TEXT,
    bullet_3_ets TEXT,
    bullet_3_strategy TEXT,
    bullet_4_sentence TEXT,
    bullet_4_ets TEXT,
    bullet_4_strategy TEXT,
    bullet_5_sentence TEXT,
    bullet_5_ets TEXT,
    bullet_5_strategy TEXT,
    -- 첨삭 전용 추가 컬럼
    model_answer_text TEXT,
    model_answer_audio_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.5 `correction_speaking_interview` 테이블 — 신규 (tr_speaking_interview 복제)

```sql
CREATE TABLE correction_speaking_interview (
    -- tr_speaking_interview의 모든 컬럼 복제
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    context_text TEXT,
    context_translation TEXT,
    context_audio TEXT,
    context_image TEXT,
    nodding_video TEXT,
    video_1 TEXT,
    script_1 TEXT,
    translation_1 TEXT,
    model_answer_1 TEXT,
    model_answer_translation_1 TEXT,
    model_answer_audio_1 TEXT,
    highlights_1 TEXT,
    video_2 TEXT,
    script_2 TEXT,
    translation_2 TEXT,
    model_answer_2 TEXT,
    model_answer_translation_2 TEXT,
    model_answer_audio_2 TEXT,
    highlights_2 TEXT,
    video_3 TEXT,
    script_3 TEXT,
    translation_3 TEXT,
    model_answer_3 TEXT,
    model_answer_translation_3 TEXT,
    model_answer_audio_3 TEXT,
    highlights_3 TEXT,
    video_4 TEXT,
    script_4 TEXT,
    translation_4 TEXT,
    model_answer_4 TEXT,
    model_answer_translation_4 TEXT,
    model_answer_audio_4 TEXT,
    highlights_4 TEXT,
    -- 첨삭 전용 추가 컬럼
    model_answer_text TEXT,
    model_answer_audio_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.6 `correction_submissions` 테이블 — 신규

```sql
CREATE TABLE correction_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    session_number INT NOT NULL,                    -- 1~12
    task_type TEXT NOT NULL,                         -- 'writing_email', 'writing_discussion', 'speaking_interview'
    task_number INT NOT NULL,                        -- 해당 문제 번호

    -- 1차 Draft (Writing)
    draft_1_text TEXT,                               -- Writing 1차 답안

    -- 1차 Draft (Speaking) — 개별 컬럼
    draft_1_audio_q1 TEXT,                           -- Q1 오디오 파일 경로
    draft_1_audio_q2 TEXT,                           -- Q2 오디오 파일 경로
    draft_1_audio_q3 TEXT,                           -- Q3 오디오 파일 경로
    draft_1_audio_q4 TEXT,                           -- Q4 오디오 파일 경로

    -- 1차 피드백
    stt_text_1 JSONB,                                -- STT 결과 {"q1":"...","q2":"...","q3":"...","q4":"..."}
    feedback_1 JSONB,                                -- 1차 피드백 JSON (annotated_html, summary, hint_count 등)
    feedback_1_status TEXT DEFAULT 'pending',         -- pending → processing → ready / failed
    released_1 BOOLEAN DEFAULT FALSE,                -- 1차 피드백 공개 여부

    -- 2차 Draft (Writing)
    draft_2_text TEXT,                               -- Writing 2차 답안

    -- 2차 Draft (Speaking) — 개별 컬럼
    draft_2_audio_q1 TEXT,
    draft_2_audio_q2 TEXT,
    draft_2_audio_q3 TEXT,
    draft_2_audio_q4 TEXT,

    -- 2차 피드백
    stt_text_2 JSONB,                                -- 2차 STT 결과
    feedback_2 JSONB,                                -- 최종 피드백 JSON
    feedback_2_status TEXT DEFAULT 'pending',         -- pending → processing → ready / failed
    released_2 BOOLEAN DEFAULT FALSE,                -- 최종 피드백 공개 여부

    -- 전체 상태
    status TEXT NOT NULL DEFAULT 'draft1_submitted',
    -- 유효값: draft1_submitted, feedback1_processing, feedback1_ready, feedback1_failed,
    --         draft2_submitted, feedback2_processing, feedback2_ready, feedback2_failed,
    --         complete, expired, skipped

    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW(),             -- 행 생성 (= 1차 제출 시점)
    draft_1_submitted_at TIMESTAMPTZ,                -- 1차 제출 시각
    feedback_1_at TIMESTAMPTZ,                       -- 1차 피드백 완료 시각 (n8n이 채움)
    released_1_at TIMESTAMPTZ,                       -- 1차 승인 시각
    draft_2_submitted_at TIMESTAMPTZ,                -- 2차 제출 시각
    feedback_2_at TIMESTAMPTZ,                       -- 최종 피드백 완료 시각 (n8n이 채움)
    released_2_at TIMESTAMPTZ,                       -- 최종 승인 시각

    -- 유니크 제약: 한 사용자의 한 세션에서 같은 task_type은 1행만
    UNIQUE(user_id, session_number, task_type)
);

-- 인덱스
CREATE INDEX idx_correction_submissions_user ON correction_submissions(user_id);
CREATE INDEX idx_correction_submissions_session ON correction_submissions(user_id, session_number);
CREATE INDEX idx_correction_submissions_status ON correction_submissions(status);
```

### 3.7 Supabase Storage 버킷

```
버킷명: correction-audio
접근: authenticated (RLS)
경로 패턴: {user_id}/{task_type}_{task_number}_draft{1|2}_q{1-4}.webm
용량 제한: 25MB per file
```

### 3.8 피드백 JSON 구조 (feedback_1 / feedback_2)

```jsonc
{
    // Writing 피드백
    "annotated_html": "<p>I think the <mark class=\"correction-mark\" data-comment=\"'most important' is more natural\">importantest</mark> thing is...</p>",
    "summary": "전반적으로 좋은 구성이나 형용사 최상급 표현에 주의가 필요합니다.",
    "hint_count": 5,
    "level": 4.2,           // 2차 피드백에서만
    "encouragement": "...", // 2차 피드백에서만

    // Speaking 피드백 (STT 기반)
    // annotated_html에 STT 텍스트 + mark 태그
    // per_question: [
    //     { "q": 1, "annotated_html": "...", "comment": "..." },
    //     ...
    // ]
}
```

---

## 4. 파일 구조

### 4.1 신규 파일

```
js/
├── correction-config.js              ← Webhook URL 등 전역 설정
├── correction-schedule-data.js       ← 12세션 하드코딩 데이터
├── correction/
│   ├── correction-main.js            ← FEEDBACK 탭 메인 (주차 그룹 + 세션 카드 렌더링)
│   ├── correction-session.js         ← 세션 상세 화면 (Writing/Speaking 카드 2개)
│   ├── correction-detail.js          ← 과제 상세 (아코디언: draft/feedback/모범답안)
│   ├── correction-writing.js         ← Writing 첨삭 제출 (모듈컨트롤러 복제, Arrange 제외)
│   ├── correction-speaking.js        ← Speaking 첨삭 (InterviewComponent 활용 + 파일 업로드)
│   └── correction-feedback.js        ← 피드백 렌더러 (annotated_html 파싱 + tooltip + summary 카드)

css/
├── correction.css                    ← 첨삭 전용 CSS
```

### 4.2 수정 파일

| 파일 | 수정 내용 |
|------|----------|
| `index.html` | 5개 screen 추가, FEEDBACK 세그먼트 버튼 추가, 신규 CSS/JS 로드 |
| `js/app-state.js` | `courseMode`에 `'correction'` 지원 추가 |
| `js/auth.js` | `currentUser.correctionEnabled` 필드 추가 |
| `js/supabase-client.js` | `getStudentProgram()`에서 `correction_enabled` 조회 추가. 첨삭 전용 CRUD 함수 추가 |
| `js/main.js` | `_initSegmentControl()`에 FEEDBACK 버튼 로직 추가, `_renderCorrectionMode()` 추가, `initScheduleScreen()`에 correction 분기 추가 |
| `css/style.css` | 세그먼트 컨트롤 3버튼 대응 스타일 추가 |

### 4.3 미수정 파일 (그대로 재사용)

| 파일 | 재사용 방식 |
|------|------------|
| `js/writing/EmailComponent.js` | 그대로 사용 (loader만 교체) |
| `js/writing/DiscussionComponent.js` | 그대로 사용 (loader만 교체) |
| `js/speaking/InterviewComponent.js` | 그대로 사용 (onComplete 콜백에서 업로드 화면 전환) |
| `js/admin-skip.js` | `window.__isAdmin` 플래그 그대로 활용 |

---

## 5. 화면(Screen) 목록 및 흐름

### 5.1 신규 Screen (5개)

| Screen ID | 용도 | 진입 경로 |
|-----------|------|----------|
| `correctionMainScreen` | FEEDBACK 탭 메인 (4주 그룹 + 세션 카드 12개) | FEEDBACK 탭 클릭 |
| `correctionSessionScreen` | 세션 상세 (Writing 카드 + Speaking 카드) | 세션 카드 클릭 |
| `correctionDetailScreen` | 과제 상세 (아코디언: draft/feedback/모범답안) | 세션 상세에서 과제 카드 클릭 |
| `correctionWritingScreen` | Writing 제출 화면 (Email 또는 Discussion) | 과제 상세에서 "작성하기" 또는 2차 "수정하기" |
| `correctionSpeakingScreen` | Speaking 카운트다운 + 파일 업로드 화면 | 과제 상세에서 "작성하기" 또는 2차 "수정하기" |

### 5.2 화면 흐름도

```
scheduleScreen
  └─ FEEDBACK 탭 클릭
      └─ correctionMainScreen (주차 그룹 + 세션 카드)
          └─ 세션 카드 클릭
              └─ correctionSessionScreen (Writing/Speaking 카드)
                  ├─ Writing 카드 "작성하기" 클릭
                  │   └─ correctionWritingScreen (Email 또는 Discussion 컴포넌트)
                  │       └─ 제출 완료 → correctionDetailScreen (아코디언)
                  │
                  ├─ Speaking 카드 "작성하기" 클릭
                  │   └─ correctionSpeakingScreen
                  │       ├─ Phase 1: Interview 카운트다운 (4문제 × 45초)
                  │       └─ Phase 2: 파일 업로드 (Q1~Q4 × 4개 파일)
                  │           └─ 제출 완료 → correctionDetailScreen (아코디언)
                  │
                  └─ Writing/Speaking 카드 "확인하기" 클릭
                      └─ correctionDetailScreen (아코디언)
                          ├─ 1차 피드백 확인 → 2차 "수정하기" 클릭
                          │   └─ correctionWritingScreen / correctionSpeakingScreen (2차)
                          └─ 최종 피드백 + 모범답안 확인
```

### 5.3 뒤로가기 경로

| 현재 화면 | 뒤로가기 대상 |
|-----------|--------------|
| `correctionMainScreen` | `scheduleScreen` |
| `correctionSessionScreen` | `correctionMainScreen` |
| `correctionDetailScreen` | `correctionSessionScreen` |
| `correctionWritingScreen` | 확인 팝업 → `correctionSessionScreen` (제출 중단) 또는 제출 완료 → `correctionDetailScreen` |
| `correctionSpeakingScreen` | 카운트다운 중: 확인 팝업 ("진행을 취소하시겠습니까? 처음부터 다시 시작해야 합니다.") → `correctionSessionScreen`. 업로드 화면: 확인 팝업 → `correctionSessionScreen` |

---

## 6. 화면별 상세 명세

### 6.1 correctionMainScreen — FEEDBACK 메인

**레이아웃**: 정규과정 scheduleScreen 패턴 활용

**구성**:
- `correctionContainer` (id) — scheduleContainer, practiceScheduleContainer와 동급
- 4개 week-block (Week 1~4), 각 block에 세션 카드 3개

**세션 카드 구조**:
```
┌────────────────────────────────────┐
│  Session 1                         │
│  📝 Email 1  ·  🎙️ Interview 1    │
│  ● 상태 아이콘 (✅/🔄/🔒/❌)      │
│  날짜: APR 08                       │
└────────────────────────────────────┘
```

**세션 카드 상태 아이콘**:
- 행이 없음 (미시작): 빈 원 (기본)
- draft1_submitted ~ feedback1_ready: 🔄 (진행중)
- draft2_submitted ~ feedback2_ready: 🔄 (진행중)
- complete: ✅ (완료)
- expired: ❌ (마감)
- skipped: ❌ (건너뜀)

**스케줄 미배정 시**: "아직 첨삭 일정이 배정되지 않았습니다. 담당자에게 문의해주세요." 안내 표시

**날짜 계산**: `correction_schedules.start_date` + dayOffset (correction-schedule-data.js 참조)

**데이터 로드**: 
1. `correction_schedules`에서 start_date, duration_weeks 조회
2. `correction_submissions`에서 해당 user의 전체 행 조회
3. 세션별 상태 매핑 후 렌더링

### 6.2 correctionSessionScreen — 세션 상세

**레이아웃**: 기존 taskDashboardScreen의 좌우 분할과 유사하되, 첨삭 전용

**구성**:
```
┌─ 헤더 ──────────────────────────────────┐
│  ← 뒤로  Session 1  ·  Week 1           │
├─────────────────────────────────────────┤
│                                         │
│  ┌─ Writing 카드 ─────────────────────┐ │
│  │  📝 Email 1                        │ │
│  │  상태: 미제출                       │ │
│  │  [ 작성하기 ]                       │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌─ Speaking 카드 ────────────────────┐ │
│  │  🎙️ Interview 1                    │ │
│  │  상태: 미제출                       │ │
│  │  [ 작성하기 ]                       │ │
│  └───────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

**카드 상태별 텍스트 + 버튼 매핑 (Q24 확정)**:

| correction_submissions 상태 | 카드 상태 텍스트 | 버튼 |
|---|---|---|
| 행 없음 (미시작) | 미제출 | "작성하기" (활성) |
| `draft1_submitted` | 1차 제출 완료 · 첨삭 대기 | "확인하기" (비활성) |
| `feedback1_processing` | 1차 첨삭 진행중 | "확인하기" (비활성) |
| `feedback1_ready` + `released_1=false` | 1차 첨삭 완료 · 검수중 | "확인하기" (비활성) |
| `feedback1_ready` + `released_1=true` | 1차 첨삭 도착! | "확인하기" (활성) |
| `feedback1_failed` | 첨삭 준비 중 문제가 발생했습니다. 잠시 후 다시 확인해주세요. | "확인하기" (비활성) |
| `draft2_submitted` | 2차 제출 완료 · 첨삭 대기 | "확인하기" (비활성) |
| `feedback2_processing` | 2차 첨삭 진행중 | "확인하기" (비활성) |
| `feedback2_ready` + `released_2=false` | 최종 첨삭 완료 · 검수중 | "확인하기" (비활성) |
| `feedback2_ready` + `released_2=true` | 최종 첨삭 도착! | "확인하기" (활성) |
| `feedback2_failed` | 첨삭 준비 중 문제가 발생했습니다. 잠시 후 다시 확인해주세요. | "확인하기" (비활성) |
| `complete` | 완료 | "다시보기" (활성) |
| `expired` | 마감됨 | "모범답안 보기" (활성) |
| `skipped` | 건너뜀 | "모범답안 보기" (활성) |

### 6.3 correctionDetailScreen — 과제 상세 (아코디언)

**레이아웃**: 아코디언 UI. 진행된 단계만 표시, 미진행 단계 숨김.

**아코디언 섹션 5개**:

#### 섹션 1: Draft 1 (1차 작성본)
- **Writing**: 제출한 텍스트를 읽기전용으로 표시. 단어 수, 제출 시각.
- **Speaking**: 업로드한 Q1~Q4 파일의 미니 플레이어.
- **상태**: draft1_submitted 이상이면 표시.
- **접힘 상태**: 기본 접힘 (다른 단계가 진행되면).

#### 섹션 2: 1차 피드백
- **조건**: `feedback1_ready` + `released_1=true` 이상이면 표시.
- **내용**:
  - Writing: annotated_html 렌더링 (mark + tooltip)
  - Speaking: 질문별 annotated_html 렌더링
  - summary 카드
  - hint_count 표시
- **접힘 상태**: 처음 도착 시 자동 펼침.

#### 섹션 3: Draft 2 (2차 수정본)
- **조건**: `feedback1_ready` + `released_1=true` 이상이면 표시.
- **미제출 상태**: "수정하기" 버튼 활성 (correctionWritingScreen 또는 correctionSpeakingScreen으로 이동)
- **제출 상태**: 제출한 텍스트/파일 읽기전용 표시.
- **접힘 상태**: 수정하기 버튼 표시 시 자동 펼침.

#### 섹션 4: 최종 피드백
- **조건**: `feedback2_ready` + `released_2=true` 이상이면 표시.
- **내용**: 
  - annotated_html + tooltip
  - summary 카드
  - level 점수 배지
  - encouragement 카드
- **접힘 상태**: 처음 도착 시 자동 펼침.

#### 섹션 5: 모범답안
- **조건**: `complete` 또는 `expired` 또는 `skipped` 이면 표시.
- **내용**:
  - Writing: model_answer_text 표시
  - Speaking: model_answer_text + model_answer_audio_url 미니 플레이어
- **접힘 상태**: 기본 펼침.

### 6.4 correctionWritingScreen — Writing 제출

**구조**: 기존 writingEmailScreen / writingDiscussionScreen 패턴 그대로.

**핵심 차이점**:
1. **모듈 컨트롤러**: 기존 writing-module-controller.js 복제하되, Arrange 제외. Email 하나 또는 Discussion 하나만 실행.
2. **Loader**: 첨삭 전용 loader 사용 (correction_writing_email / correction_writing_discussion 테이블 조회).
3. **컴포넌트**: 기존 EmailComponent / DiscussionComponent 그대로 사용. `window.loadEmailData` / `window.loadDiscussionData`를 첨삭 loader로 일시 교체 후 복원.
4. **제출 처리**: 기존 `_finishWritingModule()` → DB `study_results_v3` 대신 `correction_submissions` INSERT/UPDATE.
5. **타이머**: Email 420초(7분), Discussion 600초(10분). 만료 시 알림만, 수동 제출.
6. **최초본/2차본 분기**: 같은 screen에서 상태에 따라 분기.
   - 1차: draft_1_text에 저장, status='draft1_submitted'
   - 2차: draft_2_text에 저장, status='draft2_submitted'
7. **Webhook 호출**: 제출 완료 후 `CORRECTION_CONFIG.webhookUrl`로 POST.

**Writing 제출 시 저장 데이터**:
```javascript
// 1차 제출 시 INSERT
{
    user_id: userId,
    session_number: sessionNum,
    task_type: 'writing_email',  // 또는 'writing_discussion'
    task_number: taskNum,
    draft_1_text: userAnswer,
    status: 'draft1_submitted',
    draft_1_submitted_at: new Date().toISOString()
}

// 2차 제출 시 UPDATE
{
    draft_2_text: userAnswer,
    status: 'draft2_submitted',
    draft_2_submitted_at: new Date().toISOString()
}
```

### 6.5 correctionSpeakingScreen — Speaking 제출

**Phase 1: Interview 카운트다운**
- 기존 InterviewComponent 그대로 사용.
- `speakingInterviewScreen`의 HTML을 `correctionSpeakingScreen` 내부에 복제.
- 4문제 × 45초 카운트다운.
- `onComplete` 콜백에서 Phase 2로 전환 (기존: `_finishSpeakingModule`, 첨삭: 파일 업로드 전환).

**Phase 2: 파일 업로드**
- 카운트다운 완료 후 업로드 UI로 전환.
- Q1~Q4 라벨 붙은 파일 선택 버튼 4개 개별 배치.

```
┌─────────────────────────────────────────┐
│  🎙️ 녹음 파일 업로드                     │
│                                         │
│  Q1: [파일 선택] recording_q1.m4a  ✅   │
│  Q2: [파일 선택] (미선택)               │
│  Q3: [파일 선택] recording_q3.mp3  ✅   │
│  Q4: [파일 선택] (미선택)               │
│                                         │
│  💡 각 질문별 녹음 파일을 선택해주세요.   │
│     허용 형식: mp3, m4a, wav, webm 등    │
│     최대 25MB                            │
│                                         │
│  [ 제출하기 ]  (4개 모두 선택 시 활성)    │
└─────────────────────────────────────────┘
```

- **파일 형식**: mp3, m4a, wav, webm, mp4, ogg, aac 허용. zip 등 압축파일 차단.
- **파일 크기**: 25MB 제한 (파일별).
- **제출 버튼**: 4개 파일 모두 선택되어야 활성화.
- **업로드 순서**: Q1 → Q2 → Q3 → Q4 순차 업로드, 프로그레스 표시.
- **Webhook 호출**: 모든 업로드 완료 후 POST.

**Speaking 제출 시 저장 데이터**:
```javascript
// 1차 제출 시 INSERT
{
    user_id: userId,
    session_number: sessionNum,
    task_type: 'speaking_interview',
    task_number: taskNum,
    draft_1_audio_q1: 'userId/speaking_interview_1_draft1_q1.m4a',
    draft_1_audio_q2: 'userId/speaking_interview_1_draft1_q2.m4a',
    draft_1_audio_q3: 'userId/speaking_interview_1_draft1_q3.m4a',
    draft_1_audio_q4: 'userId/speaking_interview_1_draft1_q4.m4a',
    status: 'draft1_submitted',
    draft_1_submitted_at: new Date().toISOString()
}

// 2차 제출 시 UPDATE
{
    draft_2_audio_q1: '...',
    draft_2_audio_q2: '...',
    draft_2_audio_q3: '...',
    draft_2_audio_q4: '...',
    status: 'draft2_submitted',
    draft_2_submitted_at: new Date().toISOString()
}
```

---

## 7. 상태 전이

### 7.1 전체 상태 흐름도

```
(행 없음 = 미시작)
        │
        ▼  학생이 1차 제출
  draft1_submitted
        │
        ▼  n8n webhook → 상태 변경
  feedback1_processing
        │
        ├──▶ (실패) feedback1_failed
        │
        ▼  n8n 피드백 완료
  feedback1_ready  (released_1=false)
        │
        ▼  수동 승인 또는 24시간 후 자동 승인 (n8n)
  feedback1_ready  (released_1=true)
        │
        ▼  학생이 2차 제출
  draft2_submitted
        │
        ▼  n8n webhook → 상태 변경
  feedback2_processing
        │
        ├──▶ (실패) feedback2_failed
        │
        ▼  n8n 피드백 완료
  feedback2_ready  (released_2=false)
        │
        ▼  수동 승인 또는 24시간 후 자동 승인 (n8n)
  feedback2_ready  (released_2=true)
        │
        ▼  양쪽 모두 released → 자동 또는 수동
  complete
```

**별도 경로**:
```
  (어떤 상태든) → n8n 데드라인 워크플로우 → expired
  (어떤 상태든) → n8n 데드라인 워크플로우 → skipped
```

### 7.2 프론트엔드에서 변경하는 상태
| 상태 변경 | 트리거 |
|-----------|--------|
| (없음) → `draft1_submitted` | 1차 제출 시 INSERT |
| `feedback1_ready` → `draft2_submitted` | 2차 제출 시 UPDATE |

### 7.3 n8n에서 변경하는 상태
| 상태 변경 | 트리거 |
|-----------|--------|
| `draft1_submitted` → `feedback1_processing` | Webhook 수신 |
| `feedback1_processing` → `feedback1_ready` | GPT 피드백 완료 |
| `feedback1_processing` → `feedback1_failed` | GPT 호출 실패 |
| `feedback1_ready` → `released_1=true` | 수동 승인 또는 24시간 자동 |
| `draft2_submitted` → `feedback2_processing` | Webhook 수신 |
| `feedback2_processing` → `feedback2_ready` | GPT 피드백 완료 |
| `feedback2_processing` → `feedback2_failed` | GPT 호출 실패 |
| `feedback2_ready` → `released_2=true` | 수동 승인 또는 24시간 자동 |
| (any) → `expired` / `skipped` | 일일 데드라인 초과 워크플로우 |
| `released_1=true` + `released_2=true` → `complete` | 전체 완료 확인 |

---

## 8. 데드라인 로직

### 8.1 correction-schedule-data.js 하드코딩 데이터

```javascript
window.CORRECTION_SCHEDULE = [
    // Week 1
    { session: 1,  week: 1, writing: { type: 'email',      number: 1 }, speaking: { number: 1  }, dayOffset: 0 },  // 일
    { session: 2,  week: 1, writing: { type: 'discussion',  number: 1 }, speaking: { number: 2  }, dayOffset: 2 },  // 화
    { session: 3,  week: 1, writing: { type: 'email',      number: 2 }, speaking: { number: 3  }, dayOffset: 4 },  // 목
    // Week 2
    { session: 4,  week: 2, writing: { type: 'discussion',  number: 2 }, speaking: { number: 4  }, dayOffset: 0 },
    { session: 5,  week: 2, writing: { type: 'email',      number: 3 }, speaking: { number: 5  }, dayOffset: 2 },
    { session: 6,  week: 2, writing: { type: 'discussion',  number: 3 }, speaking: { number: 6  }, dayOffset: 4 },
    // Week 3
    { session: 7,  week: 3, writing: { type: 'email',      number: 4 }, speaking: { number: 7  }, dayOffset: 0 },
    { session: 8,  week: 3, writing: { type: 'discussion',  number: 4 }, speaking: { number: 8  }, dayOffset: 2 },
    { session: 9,  week: 3, writing: { type: 'email',      number: 5 }, speaking: { number: 9  }, dayOffset: 4 },
    // Week 4
    { session: 10, week: 4, writing: { type: 'discussion',  number: 5 }, speaking: { number: 10 }, dayOffset: 0 },
    { session: 11, week: 4, writing: { type: 'email',      number: 6 }, speaking: { number: 11 }, dayOffset: 2 },
    { session: 12, week: 4, writing: { type: 'discussion',  number: 6 }, speaking: { number: 12 }, dayOffset: 4 },
];
```

### 8.2 1차 Draft 데드라인 계산

```javascript
function getDraft1Deadline(startDate, dayOffset) {
    // startDate: correction_schedules.start_date (일요일)
    // dayOffset: CORRECTION_SCHEDULE[i].dayOffset (0, 2, 4)
    
    var taskDate = new Date(startDate);
    taskDate.setDate(taskDate.getDate() + dayOffset);
    
    // 다음날 04:00
    var deadline = new Date(taskDate);
    deadline.setDate(deadline.getDate() + 1);
    deadline.setHours(4, 0, 0, 0);
    
    return deadline;
}
```

### 8.3 2차 Draft 데드라인 계산 (Q31 반영)

```javascript
function getDraft2Deadline(startDate, dayOffset, feedback1At) {
    // 스케줄상 2차 마감: dayOffset + 1일의 다음날 04:00
    // 2차 dayOffset = 1차 dayOffset + 1 (일→월, 화→수, 목→금)
    var draft2DayOffset = dayOffset + 1;
    
    var taskDate = new Date(startDate);
    taskDate.setDate(taskDate.getDate() + draft2DayOffset);
    
    var scheduleDeadline = new Date(taskDate);
    scheduleDeadline.setDate(scheduleDeadline.getDate() + 1);
    scheduleDeadline.setHours(4, 0, 0, 0);
    
    // feedback_1_at + 24시간
    var feedbackDeadline = null;
    if (feedback1At) {
        feedbackDeadline = new Date(feedback1At);
        feedbackDeadline.setHours(feedbackDeadline.getHours() + 24);
    }
    
    // max(스케줄상 마감, feedback_1_at + 24시간)
    if (feedbackDeadline && feedbackDeadline > scheduleDeadline) {
        return feedbackDeadline;
    }
    return scheduleDeadline;
}
```

### 8.4 프론트에서 데드라인 표시
- 정규과정의 `_renderDeadlineBanner()` 패턴 활용.
- correctionSessionScreen과 correctionDetailScreen에서 표시.
- 마감 전: "N시간 N분 남음"
- 마감 임박 (6시간 이내): 빨간색 "마감 임박"
- 마감 후: "마감됨" (읽기전용)

---

## 9. Webhook / n8n 연동

### 9.1 correction-config.js

```javascript
window.CORRECTION_CONFIG = {
    webhookUrl: 'https://placeholder-webhook-url.example.com/correction',
    // 추후 실제 n8n webhook URL로 교체
};
```

### 9.2 Webhook 호출 (프론트엔드)

```javascript
async function callCorrectionWebhook(submissionId, draftNumber) {
    var url = window.CORRECTION_CONFIG.webhookUrl;
    if (!url || url.includes('placeholder')) {
        console.log('⚠️ [Correction] Webhook URL 미설정 — 호출 생략');
        return;
    }
    
    try {
        var response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                submission_id: submissionId,
                draft_number: draftNumber  // 1 또는 2
            })
        });
        console.log('✅ [Correction] Webhook 호출 완료:', response.status);
    } catch (e) {
        console.warn('⚠️ [Correction] Webhook 호출 실패:', e);
        // 실패해도 사용자에게 영향 없음 (제출은 이미 DB에 저장됨)
    }
}
```

### 9.3 Webhook Payload (프론트 → n8n)

```json
{
    "submission_id": "uuid-...",
    "draft_number": 1
}
```

n8n은 이 ID로 `correction_submissions`를 조회하여 처리.

---

## 10. CSS / 디자인 규칙

### 10.1 적용 원칙
- **색상**: 기존 CSS 변수 그대로 (primary `#9480c5`, success `#77bf7e`, bg `#f1f4f8` 등)
- **레이아웃/구조**: design.md 규칙 적용 (No-Line, 배경색 차이 구분, 간격으로 분리)
- **적용 범위**: 첨삭 화면(`correction-*`)에만. 기존 화면 미수정.

### 10.2 design.md에서 가져오는 규칙

| 규칙 | 적용 방법 |
|------|----------|
| No-Line Rule | 첨삭 카드/섹션에 border 대신 배경색 차이 사용. `.correction-card { background: #fff }` on `.correction-container { background: var(--bg-color) }` |
| Surface Hierarchy | Base: var(--bg-color), Card: #fff, De-emphasis: #f3f4f5 |
| Glassmorphism (tooltip) | `backdrop-filter: blur(12px); background: rgba(255,255,255,0.9)` |
| Ambient Shadow | `box-shadow: 0 8px 32px rgba(25,28,29,0.05)` (floating 요소만) |
| Spacing Scale | 항목 간 1rem(16px) 간격으로 분리 (divider 대신) |
| Typography | 기존 Pretendard 유지. headline: font-weight 700, body: var(--text-secondary) |
| Input Focus | 2px outline, primary 색상 |

### 10.3 첨삭 전용 컴포넌트 스타일

#### 아코디언
```css
.correction-accordion-item {
    background: #fff;
    border-radius: 12px;
    margin-bottom: 12px;
    overflow: hidden;
    box-shadow: 0 2px 12px rgba(0,0,0,0.04);
}

.correction-accordion-header {
    padding: 16px 20px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    transition: background 0.2s;
}

.correction-accordion-header:hover {
    background: #f8f9fa;
}

.correction-accordion-body {
    padding: 0 20px 20px;
    display: none;
}

.correction-accordion-item.open .correction-accordion-body {
    display: block;
}
```

#### Tooltip (말풍선)
```css
.correction-mark {
    background: rgba(148, 128, 197, 0.15);
    border-radius: 2px;
    cursor: pointer;
    position: relative;
    transition: background 0.2s;
}

.correction-mark:hover {
    background: rgba(148, 128, 197, 0.3);
}

.correction-tooltip {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(12px);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--text-primary);
    box-shadow: 0 8px 32px rgba(25, 28, 29, 0.12);
    white-space: nowrap;
    max-width: 300px;
    white-space: normal;
    z-index: 1000;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s;
}

.correction-mark:hover .correction-tooltip,
.correction-mark.active .correction-tooltip {
    opacity: 1;
}
```

#### 파일 업로드 버튼
```css
.correction-file-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
}

.correction-file-label {
    font-weight: 600;
    min-width: 32px;
    color: var(--primary-color);
}

.correction-file-input-wrap {
    flex: 1;
    position: relative;
}

.correction-file-status {
    font-size: 13px;
    color: var(--text-secondary);
}

.correction-file-status.selected {
    color: var(--success-color);
}
```

---

## 11. 기존 코드 수정 사항

### 11.1 index.html

**세그먼트 컨트롤 (line ~381~383)**:
```html
<!-- 기존 -->
<button class="seg-btn seg-active" id="segBtnRegular">TESTROOM</button>
<button class="seg-btn" id="segBtnPractice">PRACTICE</button>

<!-- 수정 후 -->
<button class="seg-btn seg-active" id="segBtnRegular">TESTROOM</button>
<button class="seg-btn" id="segBtnPractice">PRACTICE</button>
<button class="seg-btn" id="segBtnCorrection">FEEDBACK</button>
```

**컨테이너 추가 (line ~514 부근, practiceScheduleContainer 뒤)**:
```html
<section id="correctionContainer" style="display:none;">
    <!-- correction-main.js가 동적으로 렌더링 -->
</section>
```

**신규 Screen 5개 추가** (기존 screen들 뒤에):
- `correctionMainScreen`
- `correctionSessionScreen`
- `correctionDetailScreen`
- `correctionWritingScreen`
- `correctionSpeakingScreen`

**CSS/JS 로드 추가**:
```html
<link rel="stylesheet" href="css/correction.css?v=001">

<script src="js/correction-config.js?v=001"></script>
<script src="js/correction-schedule-data.js?v=001"></script>
<script src="js/correction/correction-main.js?v=001"></script>
<script src="js/correction/correction-session.js?v=001"></script>
<script src="js/correction/correction-detail.js?v=001"></script>
<script src="js/correction/correction-writing.js?v=001"></script>
<script src="js/correction/correction-speaking.js?v=001"></script>
<script src="js/correction/correction-feedback.js?v=001"></script>
```

### 11.2 js/app-state.js

```javascript
// 기존
let courseMode = sessionStorage.getItem('courseMode') || 'regular';

// 추가 변경 없음 (courseMode에 'correction' 값 허용)
// setCourseMode() 함수도 그대로 사용 가능
```

### 11.3 js/auth.js

```javascript
// handleLogin() 내부, currentUser 구성 (line ~97~109)
// 기존:
currentUser = {
    ...
    practiceEnabled: !!programInfo.practiceEnabled
};

// 수정 후:
currentUser = {
    ...
    practiceEnabled: !!programInfo.practiceEnabled,
    correctionEnabled: !!programInfo.correctionEnabled  // 추가
};
```

### 11.4 js/supabase-client.js

```javascript
// getStudentProgram() 내부 (line ~199~201)
// 기존 select에 correction_enabled 추가:
const apps = await supabaseSelect(
    'applications',
    `email=eq.${encodeURIComponent(userEmail)}&order=created_at.desc&limit=1&select=id,preferred_program,assigned_program,preferred_start_date,schedule_start,current_step,status,deposit_confirmed_by_admin,practice_enabled,correction_enabled`
);

// return 객체에 추가 (line ~219~227):
return {
    ...
    correctionEnabled: !!app.correction_enabled  // 추가
};
```

**신규 CRUD 함수 추가**:
```javascript
// correction_schedules 조회
async function getCorrectionSchedule(userId) { ... }

// correction_submissions 조회 (user 전체)
async function getCorrectionSubmissions(userId) { ... }

// correction_submissions 단일 조회
async function getCorrectionSubmission(userId, sessionNumber, taskType) { ... }

// correction_submissions INSERT
async function insertCorrectionSubmission(data) { ... }

// correction_submissions UPDATE
async function updateCorrectionSubmission(id, data) { ... }
```

### 11.5 js/main.js

**`_initSegmentControl()` 수정 (line ~565~608)**:

```javascript
function _initSegmentControl() {
    var segmentWrap = document.getElementById('courseSegmentControl');
    if (!segmentWrap) return;
    
    var btnRegular = document.getElementById('segBtnRegular');
    var btnPractice = document.getElementById('segBtnPractice');
    var btnCorrection = document.getElementById('segBtnCorrection');
    
    // practice_enabled / correction_enabled 에 따라 버튼 표시/숨김
    var hasPractice = currentUser && currentUser.practiceEnabled;
    var hasCorrection = currentUser && (currentUser.correctionEnabled || window.__isAdmin);
    
    if (!hasPractice && !hasCorrection) {
        segmentWrap.style.display = 'none';
        if (window.courseMode !== 'regular') {
            setCourseMode('regular');
            _renderRegularMode();
        }
        return;
    }
    
    segmentWrap.style.display = '';
    if (btnPractice) btnPractice.style.display = hasPractice ? '' : 'none';
    if (btnCorrection) btnCorrection.style.display = hasCorrection ? '' : 'none';
    
    // 현재 모드에 따라 active 클래스
    var mode = window.courseMode || 'regular';
    if (btnRegular) btnRegular.classList.toggle('seg-active', mode === 'regular');
    if (btnPractice) btnPractice.classList.toggle('seg-active', mode === 'practice');
    if (btnCorrection) btnCorrection.classList.toggle('seg-active', mode === 'correction');
    
    // 클릭 핸들러
    if (btnRegular) {
        btnRegular.onclick = function() {
            if (window.courseMode === 'regular') return;
            setCourseMode('regular');
            _updateSegmentActive(btnRegular, [btnPractice, btnCorrection]);
            _renderRegularMode();
        };
    }
    if (btnPractice) {
        btnPractice.onclick = function() {
            if (window.courseMode === 'practice') return;
            setCourseMode('practice');
            _updateSegmentActive(btnPractice, [btnRegular, btnCorrection]);
            _renderPracticeMode();
        };
    }
    if (btnCorrection) {
        btnCorrection.onclick = function() {
            if (window.courseMode === 'correction') return;
            setCourseMode('correction');
            _updateSegmentActive(btnCorrection, [btnRegular, btnPractice]);
            _renderCorrectionMode();
        };
    }
}

function _updateSegmentActive(activeBtn, inactiveBtns) {
    if (activeBtn) activeBtn.classList.add('seg-active');
    inactiveBtns.forEach(function(btn) {
        if (btn) btn.classList.remove('seg-active');
    });
}
```

**`_renderCorrectionMode()` 추가**:

```javascript
function _renderCorrectionMode() {
    var regularContainer = document.getElementById('scheduleContainer');
    var practiceContainer = document.getElementById('practiceScheduleContainer');
    var correctionContainer = document.getElementById('correctionContainer');
    var scheduleHeader = document.querySelector('#scheduleScreen .schedule-header');
    
    if (regularContainer) regularContainer.style.display = 'none';
    if (practiceContainer) practiceContainer.style.display = 'none';
    if (correctionContainer) correctionContainer.style.display = '';
    if (scheduleHeader) {
        scheduleHeader.querySelector('h1').textContent = 'FEEDBACK';
        scheduleHeader.querySelector('p').textContent = 'AI-powered writing & speaking correction.';
    }
    
    // correction-main.js의 렌더 함수 호출
    if (typeof renderCorrectionSchedule === 'function') {
        renderCorrectionSchedule();
    }
}
```

**`initScheduleScreen()` 수정 (line ~34~56)**:

```javascript
function initScheduleScreen() {
    if (!currentUser) return;
    
    // ... 기존 사용자 정보 표시 ...
    
    var mode = window.courseMode || 'regular';
    if (mode === 'correction') {
        _renderCorrectionMode();
    } else if (mode === 'practice') {
        _renderPracticeMode();
    } else {
        _renderRegularMode();
    }
}
```

### 11.6 css/style.css

**세그먼트 컨트롤 3버튼 대응**:
```css
/* 기존 .seg-btn에 추가 변경 불필요 — flex: 1이라 자동 분배 */
/* 필요 시 3버튼일 때 패딩 조정 */
.course-segment-control .seg-btn {
    padding: 0 10px;  /* 3버튼일 때 여유 확보 */
}
```

---

## 12. 구현 순서

### Phase 1: 기반 (DB + 설정 + 탭)
| 순서 | 작업 | 파일 |
|------|------|------|
| 1-1 | Supabase 테이블 생성 SQL 작성 (실행은 관리자) | docs/correction-db-setup.sql |
| 1-2 | `correction-config.js` 생성 (webhook URL placeholder) | js/correction-config.js |
| 1-3 | `correction-schedule-data.js` 생성 (12세션 하드코딩) | js/correction-schedule-data.js |
| 1-4 | `applications` 테이블에 correction_enabled 컬럼 추가 SQL | (SQL) |
| 1-5 | `supabase-client.js` 수정: getStudentProgram에 correction_enabled 추가 | js/supabase-client.js |
| 1-6 | `auth.js` 수정: currentUser.correctionEnabled 추가 | js/auth.js |
| 1-7 | `app-state.js` 확인 (수정 불필요) | js/app-state.js |
| 1-8 | `index.html`: FEEDBACK 버튼 추가, correctionContainer 추가 | index.html |
| 1-9 | `main.js`: _initSegmentControl 수정, _renderCorrectionMode 추가 | js/main.js |
| 1-10 | `css/style.css`: 3버튼 세그먼트 컨트롤 스타일 | css/style.css |

### Phase 2: 메인 화면
| 순서 | 작업 | 파일 |
|------|------|------|
| 2-1 | `css/correction.css` 생성 (전체 첨삭 CSS) | css/correction.css |
| 2-2 | `supabase-client.js`: 첨삭 CRUD 함수 추가 | js/supabase-client.js |
| 2-3 | `correction-main.js`: FEEDBACK 메인 렌더링 (주차 그룹 + 세션 카드) | js/correction/correction-main.js |
| 2-4 | `index.html`: correctionMainScreen HTML 추가 | index.html |
| 2-5 | 스케줄 미배정 안내 표시 | js/correction/correction-main.js |

### Phase 3: 세션 상세 화면
| 순서 | 작업 | 파일 |
|------|------|------|
| 3-1 | `correction-session.js`: Writing/Speaking 카드 렌더링 + 상태 매핑 | js/correction/correction-session.js |
| 3-2 | `index.html`: correctionSessionScreen HTML 추가 | index.html |
| 3-3 | 데드라인 배너 (정규과정 패턴 복제) | js/correction/correction-session.js |

### Phase 4: Writing 제출
| 순서 | 작업 | 파일 |
|------|------|------|
| 4-1 | 첨삭 전용 email-loader (correction_writing_email 테이블) | js/correction/correction-writing.js 내 |
| 4-2 | 첨삭 전용 discussion-loader (correction_writing_discussion 테이블) | js/correction/correction-writing.js 내 |
| 4-3 | Writing 모듈 컨트롤러 (Arrange 제외, 단일 컴포넌트) | js/correction/correction-writing.js |
| 4-4 | `index.html`: correctionWritingScreen HTML 추가 | index.html |
| 4-5 | 제출 처리: DB INSERT + Webhook 호출 | js/correction/correction-writing.js |
| 4-6 | 2차 제출 분기 (같은 screen, 상태 기반) | js/correction/correction-writing.js |

### Phase 5: Speaking 제출 + 파일 업로드
| 순서 | 작업 | 파일 |
|------|------|------|
| 5-1 | 첨삭 전용 interview-loader (correction_speaking_interview 테이블) | js/correction/correction-speaking.js 내 |
| 5-2 | InterviewComponent 연동 (onComplete → 업로드 전환) | js/correction/correction-speaking.js |
| 5-3 | 파일 업로드 UI (Q1~Q4 × 4개 버튼) | js/correction/correction-speaking.js |
| 5-4 | `index.html`: correctionSpeakingScreen HTML 추가 | index.html |
| 5-5 | 파일 업로드 처리: Storage 업로드 + DB INSERT + Webhook 호출 | js/correction/correction-speaking.js |
| 5-6 | 2차 제출 분기 | js/correction/correction-speaking.js |
| 5-7 | 카운트다운 중 뒤로가기 팝업 | js/correction/correction-speaking.js |

### Phase 6: 과제 상세 + 피드백 표시
| 순서 | 작업 | 파일 |
|------|------|------|
| 6-1 | `correction-detail.js`: 아코디언 UI 렌더링 | js/correction/correction-detail.js |
| 6-2 | `correction-feedback.js`: annotated_html 파싱 + tooltip | js/correction/correction-feedback.js |
| 6-3 | `index.html`: correctionDetailScreen HTML 추가 | index.html |
| 6-4 | 1차 피드백 뷰 + 2차 제출 버튼 | js/correction/correction-detail.js |
| 6-5 | 최종 피드백 뷰 + level/encouragement 카드 | js/correction/correction-detail.js |
| 6-6 | 모범답안 뷰 + 오디오 미니 플레이어 | js/correction/correction-detail.js |
| 6-7 | Tooltip: PC hover, 모바일 tap | js/correction/correction-feedback.js |

### Phase 7: 데드라인 + 상태 처리
| 순서 | 작업 | 파일 |
|------|------|------|
| 7-1 | 데드라인 계산 함수 (1차/2차) | js/correction/correction-main.js |
| 7-2 | 마감 배너 렌더링 | 각 화면 JS |
| 7-3 | expired/skipped 시 읽기전용 + 모범답안만 표시 | js/correction/correction-detail.js |
| 7-4 | failed 상태 에러 메시지 표시 | js/correction/correction-session.js |

### Phase 8: 관리자 + 마무리
| 순서 | 작업 | 파일 |
|------|------|------|
| 8-1 | test@me.com 관리자 접근: __isAdmin 플래그로 FEEDBACK 탭 강제 표시 | js/main.js |
| 8-2 | Admin Skip 연동 (첨삭 카운트다운 스킵) | js/admin-skip.js |
| 8-3 | 로그아웃 시 correction 상태 초기화 | js/auth.js |
| 8-4 | 전체 화면 흐름 검증 | (테스트) |

---

## 13. 테스트 체크리스트

### 13.1 탭 / 접근 권한
- [ ] correction_enabled=false → FEEDBACK 탭 숨김
- [ ] correction_enabled=true → FEEDBACK 탭 표시
- [ ] test@me.com → correction_enabled 무관하게 FEEDBACK 탭 표시
- [ ] practice_enabled=false + correction_enabled=true → TESTROOM, FEEDBACK 2개만 표시
- [ ] practice_enabled=true + correction_enabled=true → 3개 탭 모두 표시
- [ ] 탭 전환 시 컨테이너 정확히 숨김/표시
- [ ] 로그아웃 → 재로그인 시 courseMode 정상 복원

### 13.2 FEEDBACK 메인 화면
- [ ] correction_schedules 행 없음 → "아직 첨삭 일정이 배정되지 않았습니다" 표시
- [ ] correction_schedules 있음 → 4주 × 3세션 카드 렌더링
- [ ] 세션 카드에 날짜 정확히 계산 (start_date + dayOffset)
- [ ] 세션 카드 상태 아이콘 정확 (미시작/진행중/완료/마감)
- [ ] duration_weeks 값에 따른 주차 수 조정

### 13.3 세션 상세 화면
- [ ] Writing + Speaking 카드 2개 표시
- [ ] 각 카드 상태 텍스트 정확 (Q24 매핑표 기준)
- [ ] 버튼 활성/비활성 정확
- [ ] 데드라인 배너 표시

### 13.4 Writing 제출
- [ ] 첨삭 전용 loader가 correction_writing_* 테이블에서 데이터 로드
- [ ] 기존 EmailComponent / DiscussionComponent 정상 동작
- [ ] 타이머 동작 (Email 7분, Discussion 10분)
- [ ] 타이머 만료 시 알림만 + 수동 제출
- [ ] 1차 제출: DB INSERT + webhook 호출
- [ ] 2차 제출: DB UPDATE + webhook 호출
- [ ] 이미 제출한 과제 재진입 시 읽기전용 + "첨삭 준비중입니다" 표시

### 13.5 Speaking 제출
- [ ] InterviewComponent 카운트다운 정상 (4문제 × 45초)
- [ ] 카운트다운 완료 후 파일 업로드 화면 전환
- [ ] Q1~Q4 파일 선택 버튼 4개 개별 동작
- [ ] 파일 형식 제한 (음성/영상만, zip 차단)
- [ ] 파일 크기 25MB 제한
- [ ] 4개 모두 선택 시 제출 버튼 활성
- [ ] 업로드 순차 처리 + 프로그레스
- [ ] DB INSERT + webhook 호출
- [ ] 카운트다운 중 뒤로가기 → 확인 팝업

### 13.6 피드백 표시
- [ ] annotated_html의 `<mark>` 태그 정상 렌더링
- [ ] PC: hover 시 tooltip 표시
- [ ] 모바일: tap 시 tooltip 표시
- [ ] summary 카드 표시
- [ ] hint_count 표시
- [ ] 2차 피드백: level 점수 배지 + encouragement 카드
- [ ] failed 상태: "첨삭 준비 중 문제가 발생했습니다..." 메시지

### 13.7 과제 상세 (아코디언)
- [ ] 진행된 단계만 표시, 미진행 숨김
- [ ] 아코디언 접기/펼치기 정상
- [ ] Draft 1 읽기전용 표시
- [ ] 1차 피드백 자동 펼침 (최초 도착 시)
- [ ] Draft 2 "수정하기" 버튼 → 제출 화면 이동
- [ ] 최종 피드백 자동 펼침
- [ ] 모범답안 표시 + 오디오 플레이어

### 13.8 데드라인
- [ ] 1차 마감 계산 정확 (dayOffset + 다음날 04:00)
- [ ] 2차 마감 계산 정확: max(스케줄 마감, feedback_1_at + 24시간)
- [ ] 마감 전: 남은 시간 표시
- [ ] 마감 임박 (6시간 이내): 빨간색 강조
- [ ] 마감 후: "마감됨" + 읽기전용
- [ ] expired 상태: 모범답안만 표시

### 13.9 관리자 (test@me.com)
- [ ] FEEDBACK 탭 항상 표시
- [ ] Admin Skip 버튼: Speaking 카운트다운 스킵 가능
- [ ] 모든 세션/과제 접근 가능

### 13.10 모바일 대응
- [ ] 세그먼트 컨트롤 3버튼 모바일 가독성
- [ ] 세션 카드 모바일 레이아웃
- [ ] 아코디언 모바일 터치 동작
- [ ] 파일 업로드 모바일 동작
- [ ] Tooltip tap 동작 (모바일)

---

## 부록: 참조 문서

| 문서 | 위치 | 내용 |
|------|------|------|
| AI 첨삭 구현요청서 | (첨부 파일) | 원본 요청서 전문 |
| design.md | /home/user/uploaded_files/design.md | The Ethereal Dashboard 디자인 시스템 |
| v3-design-spec.md | docs/v3-design-spec.md | 기존 V3 설계 스펙 |
| v3-flow-spec.md | docs/v3-flow-spec.md | 기존 V3 문제 흐름 |
| v3-gap-analysis.md | docs/v3-gap-analysis.md | 기존 V3 갭 분석 |

---

*끝. 이 문서의 모든 항목은 Q1~Q42 Q&A를 통해 확정된 사항입니다.*
