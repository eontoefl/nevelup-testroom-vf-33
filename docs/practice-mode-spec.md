# 연습코스(Practice Mode) 구현 명세서

> **상태**: 확정 완료
> **최종 수정**: 2026-03-16

---

## 1. 개요

기존 정규코스(Fast 4주 / Standard 8주) 외에 **연습코스(Practice Mode)**를 추가한다.
- 정규코스와 동일한 학습 기능(풀이, 해설, 오답노트)을 제공하되, 환급/인증/마감 등 관리 요소는 제거
- Practice 1 ~ Practice 60, 총 60개 단위로 구성
- 로그인 후 정규코스 ↔ 연습코스를 자유롭게 전환 가능

---

## 2. 확정 사항

### 2-1. 모드 전환 UI

| 항목 | 내용 |
|---|---|
| **위치** | `scheduleScreen` 상단, "학습 일정" 타이틀 바로 아래 |
| **형태** | 세그먼트 컨트롤 (pill 토글): `[정규코스] [연습코스]` |
| **동작** | 선택된 모드에 따라 scheduleScreen 내용이 완전히 바뀜 |
| **상태 저장** | `currentUser.courseMode`에 저장 + `sessionStorage` 반영 (`'regular'` \| `'practice'`) |
| **기본 선택값** | `sessionStorage`에 저장된 마지막 모드 복원. 없으면 `'regular'` 기본 |
| **권한 없을 때** | `canAccessPractice`가 false이면 연습코스 탭 자체를 숨김 |

### 2-2. 연습코스 스케줄 화면

| 항목 | 내용 |
|---|---|
| **구성** | Practice 1 ~ Practice 60 버튼 나열 (주/요일 구분 없음) |
| **레이아웃** | 6열 × 10행 그리드 (P1~P6 / P7~P12 / ... / P55~P60), 페이지 스크롤 |
| **모바일 대응** | 불필요 (데스크탑 전용) |
| **클릭 시** | 해당 Practice의 과제 목록 화면으로 이동 (정규코스의 요일 클릭과 동일한 흐름) |
| **과제 구성** | Fast 과정의 하루 스케줄과 동일한 패턴 (보카 + R/L/W/S 조합) |
| **입문서 정독** | 없음 (연습코스에서는 제외) |
| **타이틀** | 📝 "연습 일정" |
| **서브타이틀** | "원하는 Practice를 선택하세요" |
| **진도 표시** | 각 Practice 버튼에 완료 상태 표시 (예: `3/3 ✓`, `1/3`, 미시작은 빈 상태) |

### 2-3. 문제 세트 번호

| 항목 | 내용 |
|---|---|
| **시작 번호** | 정규코스가 Module 1~12를 사용하므로, 연습코스는 **Module 13부터** 시작 |
| **매핑** | Practice 1의 리딩 = Module 13, Practice 2의 리딩 = Module 14, ... |
| **보카** | 매일 2pg씩, 5pg~61pg 범위를 블록 리셋 방식으로 순환 |

### 2-4. 보카 순환 방식 (블록 리셋)

- 보카 범위: 5pg ~ 61pg (총 57페이지)
- 매일 2pg씩 배정
- 28일째: 59, 60pg
- **29일째: 61pg (1pg만 배정)**
- 30일째: 5, 6pg (리셋, 새 사이클)
- 이하 반복 (29일 사이클)

순환 예시:
```
P1:  5,6pg    P2:  7,8pg    P3:  9,10pg   ...
P28: 59,60pg  P29: 61pg     P30: 5,6pg
P31: 7,8pg    ...           P58: 59,60pg
P59: 61pg     P60: 5,6pg
```

### 2-5. Practice 과제 배치 패턴

Fast 과정의 6일 패턴(일~금)을 순환하되, 모듈 번호는 13부터 시작.

> **⚠️ 중요**: 아래 패턴은 현재 하드코딩 데이터 기준이며, 실제 구현 시 Supabase `tr_schedule_assignment` 테이블의 Fast 스케줄 데이터를 참조하여 최종 확정할 것.

#### 6일 사이클 패턴 (Fast 기준)

| 패턴 | 과제 조합 |
|---|---|
| 패턴 A (일) | 보카 + 리딩 + 리스닝 |
| 패턴 B (월) | 보카 + 리딩 + 스피킹 |
| 패턴 C (화) | 보카 + 리스닝 + 라이팅 |
| 패턴 D (수) | 보카 + 리딩 + 라이팅 |
| 패턴 E (목) | 보카 + 리스닝 + 스피킹 |
| 패턴 F (금) | 보카 + 스피킹 + 라이팅 |

#### 60일 매핑 (10사이클)

| Practice | 패턴 | 보카 | 영역1 | 영역2 |
|---|---|---|---|---|
| P1 | A | 5, 6pg | 리딩 M13 | 리스닝 M13 |
| P2 | B | 7, 8pg | 리딩 M14 | 스피킹 13 |
| P3 | C | 9, 10pg | 리스닝 M14 | 라이팅 13 |
| P4 | D | 11, 12pg | 리딩 M15 | 라이팅 14 |
| P5 | E | 13, 14pg | 리스닝 M15 | 스피킹 14 |
| P6 | F | 15, 16pg | 스피킹 15 | 라이팅 15 |
| P7 | A | 17, 18pg | 리딩 M16 | 리스닝 M16 |
| P8 | B | 19, 20pg | 리딩 M17 | 스피킹 16 |
| P9 | C | 21, 22pg | 리스닝 M17 | 라이팅 16 |
| P10 | D | 23, 24pg | 리딩 M18 | 라이팅 17 |
| P11 | E | 25, 26pg | 리스닝 M18 | 스피킹 17 |
| P12 | F | 27, 28pg | 스피킹 18 | 라이팅 18 |
| P13 | A | 29, 30pg | 리딩 M19 | 리스닝 M19 |
| P14 | B | 31, 32pg | 리딩 M20 | 스피킹 19 |
| P15 | C | 33, 34pg | 리스닝 M20 | 라이팅 19 |
| P16 | D | 35, 36pg | 리딩 M21 | 라이팅 20 |
| P17 | E | 37, 38pg | 리스닝 M21 | 스피킹 20 |
| P18 | F | 39, 40pg | 스피킹 21 | 라이팅 21 |
| P19 | A | 41, 42pg | 리딩 M22 | 리스닝 M22 |
| P20 | B | 43, 44pg | 리딩 M23 | 스피킹 22 |
| P21 | C | 45, 46pg | 리스닝 M23 | 라이팅 22 |
| P22 | D | 47, 48pg | 리딩 M24 | 라이팅 23 |
| P23 | E | 49, 50pg | 리스닝 M24 | 스피킹 23 |
| P24 | F | 51, 52pg | 스피킹 24 | 라이팅 24 |
| P25 | A | 53, 54pg | 리딩 M25 | 리스닝 M25 |
| P26 | B | 55, 56pg | 리딩 M26 | 스피킹 25 |
| P27 | C | 57, 58pg | 리스닝 M26 | 라이팅 25 |
| P28 | D | 59, 60pg | 리딩 M27 | 라이팅 26 |
| P29 | E | 61pg | 리스닝 M27 | 스피킹 26 |
| P30 | F | 5, 6pg | 스피킹 27 | 라이팅 27 |
| P31 | A | 7, 8pg | 리딩 M28 | 리스닝 M28 |
| P32 | B | 9, 10pg | 리딩 M29 | 스피킹 28 |
| P33 | C | 11, 12pg | 리스닝 M29 | 라이팅 28 |
| P34 | D | 13, 14pg | 리딩 M30 | 라이팅 29 |
| P35 | E | 15, 16pg | 리스닝 M30 | 스피킹 29 |
| P36 | F | 17, 18pg | 스피킹 30 | 라이팅 30 |
| P37 | A | 19, 20pg | 리딩 M31 | 리스닝 M31 |
| P38 | B | 21, 22pg | 리딩 M32 | 스피킹 31 |
| P39 | C | 23, 24pg | 리스닝 M32 | 라이팅 31 |
| P40 | D | 25, 26pg | 리딩 M33 | 라이팅 32 |
| P41 | E | 27, 28pg | 리스닝 M33 | 스피킹 32 |
| P42 | F | 29, 30pg | 스피킹 33 | 라이팅 33 |
| P43 | A | 31, 32pg | 리딩 M34 | 리스닝 M34 |
| P44 | B | 33, 34pg | 리딩 M35 | 스피킹 34 |
| P45 | C | 35, 36pg | 리스닝 M35 | 라이팅 34 |
| P46 | D | 37, 38pg | 리딩 M36 | 라이팅 35 |
| P47 | E | 39, 40pg | 리스닝 M36 | 스피킹 35 |
| P48 | F | 41, 42pg | 스피킹 36 | 라이팅 36 |
| P49 | A | 43, 44pg | 리딩 M37 | 리스닝 M37 |
| P50 | B | 45, 46pg | 리딩 M38 | 스피킹 37 |
| P51 | C | 47, 48pg | 리스닝 M38 | 라이팅 37 |
| P52 | D | 49, 50pg | 리딩 M39 | 라이팅 38 |
| P53 | E | 51, 52pg | 리스닝 M39 | 스피킹 38 |
| P54 | F | 53, 54pg | 스피킹 39 | 라이팅 39 |
| P55 | A | 55, 56pg | 리딩 M40 | 리스닝 M40 |
| P56 | B | 57, 58pg | 리딩 M41 | 스피킹 40 |
| P57 | C | 59, 60pg | 리스닝 M41 | 라이팅 40 |
| P58 | D | 61pg | 리딩 M42 | 라이팅 41 |
| P59 | E | 5, 6pg | 리스닝 M42 | 스피킹 41 |
| P60 | F | 7, 8pg | 스피킹 42 | 라이팅 42 |

모듈 번호 증가 규칙 (6일 사이클 당):
- 리딩: 패턴 A, B, D에서 사용 → 사이클당 3개 소비
- 리스닝: 패턴 A, C, E에서 사용 → 사이클당 3개 소비
- 라이팅: 패턴 C, D, F에서 사용 → 사이클당 3개 소비
- 스피킹: 패턴 B, E, F에서 사용 → 사이클당 3개 소비
- 10사이클 × 3개 = 30 모듈 → 리딩 M13~M42, 리스닝 M13~M42, 라이팅 13~42, 스피킹 13~42

### 2-6. DB 구조

#### (1) 학습 결과 — `study_results_practice`

Practice 전용 테이블. `study_results_v3`와 별도 분리.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigint (PK, auto) | |
| `user_id` | uuid | 사용자 ID |
| `section_type` | text | `'reading'` \| `'listening'` \| `'writing'` \| `'speaking'` \| `'vocab'` |
| `module_number` | integer | 13~ (4섹션), 1 고정 (vocab) |
| `practice_number` | integer | 1~60 |
| `initial_record` | jsonb | 첫 풀이 결과 (불변) |
| `current_record` | jsonb | 다시풀기 결과 (덮어쓰기) |
| `error_note_submitted` | boolean | 오답노트 제출 여부 |
| `initial_level` | numeric | 첫 풀이 레벨 점수 |
| `completed_at` | timestamptz | 완료 시각 |
| `speaking_file_1` | text | 스피킹 녹음 파일 경로 |

**유니크 키**: `(user_id, section_type, module_number, practice_number)`

정규코스 대비 변경사항:
- `week`, `day` 제거 → `practice_number`로 대체
- `locked_auth_rate` 제거 → 연습코스는 인증률 없음
- vocab의 `module_number`는 정규코스와 동일하게 **1 고정** (practice_number로 구분)

#### (2) 스케줄 — `tr_practice_schedule`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | bigint (PK, auto) | |
| `practice_number` | integer | 1~60 (UNIQUE) |
| `tasks` | jsonb | 과제명 배열 |

예시:
```json
{ "practice_number": 1, "tasks": ["내벨업보카 5, 6pg", "리딩 Module 13", "리스닝 Module 13"] }
{ "practice_number": 2, "tasks": ["내벨업보카 7, 8pg", "리딩 Module 14", "스피킹 13"] }
```

#### (3) 접근 권한 — `applications` 테이블 컬럼 추가

| 컬럼 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `practice_enabled` | boolean | `false` | 연습코스 접근 권한 |

- 현재: 입금 확인(`deposit_confirmed_by_admin = true`)된 유저에게 자동으로 `practice_enabled = true`
- 미래: 별도 결제/관리로 독립 제어 가능

### 2-7. 접근 권한 상세

| 항목 | 내용 |
|---|---|
| **현재 정책** | 정규코스 수강생(입금 확인)만 연습코스 접근 가능 |
| **DB 컬럼** | `applications.practice_enabled` (boolean) |
| **로그인 시 처리** | `getStudentProgram()`에서 `practice_enabled` 값 함께 조회 → `currentUser.canAccessPractice`에 저장 |
| **UI 반영** | `canAccessPractice === false`이면 세그먼트 컨트롤에서 연습코스 탭 숨김 |
| **admin 예외** | `test@me.com` 계정은 `practice_enabled` 무관하게 항상 연습코스 접근 가능 |
| **미래 확장** | 관리자가 Supabase 대시보드에서 특정 유저의 `practice_enabled`를 수동 ON/OFF 가능 |

### 2-8. 화면별 텍스트 분기

연습코스에서 기존 화면을 재사용하되, 텍스트만 모드에 따라 분기한다.

| 화면 | 정규코스 | 연습코스 |
|---|---|---|
| 스케줄 타이틀 | 📅 "학습 일정" | 📝 "연습 일정" |
| 스케줄 서브타이틀 | "원하는 주차와 요일을 선택하세요" (현재 index.html에 존재) | "원하는 Practice를 선택하세요" |
| 과제 목록 헤더 | "Week 2 - 월요일" | "Practice 7" |
| 과제 목록 서브 | "3개의 과제가 있습니다" | "3개의 과제가 있습니다" (동일) |
| 과제 대시보드 헤더 | "리딩 모듈 13" | "리딩 모듈 13" (동일) |
| 과제 대시보드 서브 | "Week 2 - 월요일" | "Practice 7" |
| 뒤로가기 버튼 텍스트 | "학습 일정" | "학습 일정" (동일) |
| 마감 배너 | 표시 (마감 지남 시) | 표시하지 않음 |
| 프로그램 뱃지 | 프로그램명 표시 (예: "내벨업챌린지 - Fast") | 프로그램명 유지 (동일) |
| 알림 벨 | 표시 | 숨김 (챌린지 전용) |

### 2-9. 마감/데드라인

| 항목 | 내용 |
|---|---|
| **마감 체크** | 없음 — 연습코스는 마감이 없음 |
| **풀이 순서** | 자유 — 아무 Practice나 원하는 순서로 풀 수 있음 |
| **`_deadlinePassedMode`** | 연습코스에서는 항상 `false` |

### 2-10. 실전풀이 / 다시풀기

| 항목 | 내용 |
|---|---|
| **구조** | 정규코스와 동일: `initial_record`(첫 풀이, 불변) + `current_record`(다시풀기, 덮어쓰기) |
| **해설 뷰어** | 유지 |
| **오답노트** | 유지 |

### 2-11. 팝업 문구 (연습코스용)

정규코스 팝업:
> ⚠️ 과제를 시작하시겠습니까?
> 제한시간 20분이 바로 시작됩니다.
> 첫 풀이 결과는 차트 및 포트폴리오에 **영구 반영**되며, 재시도할 수 없습니다.

연습코스 팝업:
> 📝 연습을 시작하시겠습니까?
> 제한시간 20분이 바로 시작됩니다.
> 풀이 결과는 연습 기록에 저장됩니다.

### 2-12. 마이페이지

| 항목 | 내용 |
|---|---|
| **파일 구성** | 별도 파일 2개: `mypage.html`(정규), `mypage-practice.html`(연습) |
| **JS 파일** | 별도 파일 2개: `js/mypage.js`(정규), `js/mypage-practice.js`(연습) |
| **진입 방식** | 우측 상단 기존 마이페이지 버튼이 `courseMode`에 따라 `mypage.html` 또는 `mypage-practice.html`로 이동 |
| **뒤로가기** | "학습으로 돌아가기" → `index.html`로 이동 (연습코스 모드 유지) |

#### 정규 마이페이지 (`mypage.html`) — 기존 그대로

1. 학습 현황 요약 (오늘의 과제, 챌린지 현황, 인증률, 등급&환급)
2. 출석 잔디
3. 나의 성적 추이
4. V2 기록 바로가기

#### 연습 마이페이지 (`mypage-practice.html`) — 신규

**상단 유저 정보**: `홍길동 | 연습코스` (프로그램명 대신 "연습코스" 표시)

3개 섹션 구성:

**① 연습 현황 요약 (카드 2개)**

| 카드 | 표시 내용 | 데이터 소스 |
|---|---|---|
| **평균 레벨** | "Level 3.8" (데이터 없으면 "아직 학습 기록이 없습니다") | Reading + Listening의 `initial_level` 평균 |
| **최근 학습** | "3일 전 · Practice 18" (데이터 없으면 "아직 학습 기록이 없습니다") | `completed_at` 기준 최신 레코드 |

**② 나의 성적 추이 (라인 차트)**

| 항목 | 내용 |
|---|---|
| **차트 라이브러리** | Chart.js (기존과 동일) |
| **탭** | Reading / Listening |
| **X축** | P1, P2, P3, ... (Practice 번호) |
| **Y축** | Level 1.0 ~ 6.0 |
| **데이터** | `initial_level` 값 |
| **데이터 없을 때** | 차트 대신 "아직 학습 기록이 없습니다" 표시 |

**③ 영역별 완료 현황 (프로그레스 바)**

| 영역 | 표시 | 총 개수 기준 |
|---|---|---|
| Reading | "12 / 30 완료" + 바 | 10사이클 × 3개 = 30 |
| Listening | "12 / 30 완료" + 바 | 10사이클 × 3개 = 30 |
| Writing | "12 / 30 완료" + 바 | 10사이클 × 3개 = 30 |
| Speaking | "12 / 30 완료" + 바 | 10사이클 × 3개 = 30 |
| **데이터 없을 때** | 프로그레스 바 대신 "아직 학습 기록이 없습니다" 표시 |

---

### 2-13. 공지사항

| 항목 | 내용 |
|---|---|
| **연습코스에서 표시** | 유지 (정규/연습 무관하게 동일한 공지 표시) |
| **정규/연습 구분 필터** | 이번 범위에서는 미구현 — 추후 공홈 대시보드와 함께 별도 구현 |

---

## 3. 미확정 항목

| # | 항목 | 질문/메모 |
|---|---|---|
| — | 현재 미확정 항목 없음 | 추가 질문 시 여기에 기재 |

---

## 4. 공홈 대시보드 연동 요청서 (별도 전달용)

> **대상**: 공홈 대시보드 개발자
> **건명**: 알림톡 발송 시 정규코스/연습코스 구분 기능 추가

### 요청 내용

현재 공홈 대시보드에서 알림톡을 발송할 때 수강생 전체 대상으로만 보낼 수 있는데, **정규코스 / 연습코스 구분 발송** 기능이 필요합니다.

### 필요 작업

1. **공지 테이블에 `target_mode` 컬럼 추가**
   - 값: `'all'`(전체) | `'regular'`(정규코스만) | `'practice'`(연습코스만)
   - 기본값: `'all'`
2. **대시보드 알림톡 작성 화면에 대상 선택 드롭다운 추가**
   - 전체 / 정규코스 수강생 / 연습코스 수강생
3. **프론트(학습앱) 공지 로드 시 `target_mode` 필터링**
   - 현재 `courseMode`와 매칭되는 공지 + `'all'` 공지만 표시

### 우선순위

낮음 (연습코스 v1 출시 후 진행)

---

## 5. 수정 대상 파일 목록

### 신규 생성

| 파일 | 내용 |
|---|---|
| `mypage-practice.html` | 연습코스 마이페이지 |
| `js/mypage-practice.js` | 연습 마이페이지 로직 |
| `css/mypage-practice-style.css` | 연습 마이페이지 스타일 (필요 시) |

### 기존 파일 수정

| 파일 | 수정 내용 |
|---|---|
| `index.html` | scheduleScreen에 세그먼트 컨트롤 추가, 연습코스 스케줄 렌더링 영역 추가 |
| `js/auth.js` | 로그인 시 `practice_enabled` 조회 → `currentUser.canAccessPractice` 설정 |
| `js/main.js` | `initScheduleScreen()`, `renderSchedule()` 분기 추가, 마이페이지 버튼 URL 분기 |
| `js/schedule-data.js` | Practice 스케줄 로드 함수 추가 (`tr_practice_schedule` 조회) |
| `js/supabase-client.js` | Practice용 DB 함수 추가 (`study_results_practice` 대상 CRUD) |
| `js/task-router.js` | 연습코스 마감 체크 스킵 (`_deadlinePassedMode = false`), 팝업 문구 분기 |
| `js/task-dashboard.js` | 연습코스일 때 DB 테이블 분기 (`study_results_practice`) |
| `js/progress-tracker.js` | 연습코스 진도 추적 (`study_results_practice` 조회) |
| `js/navigation.js` | 모드에 따른 뒤로가기 동작 분기 |
| `js/app-state.js` | `courseMode` 상태 변수 추가 |
| `css/style.css` | 세그먼트 컨트롤 스타일, Practice 버튼 그리드 스타일 |

### Supabase (DB 작업)

| 작업 | 내용 |
|---|---|
| 테이블 생성 | `study_results_practice` (학습 결과) |
| 테이블 생성 | `tr_practice_schedule` (스케줄 정의) |
| 컬럼 추가 | `applications.practice_enabled` (boolean, default false) |
| 데이터 삽입 | `tr_practice_schedule`에 Practice 1~60 스케줄 데이터 |

---

## 6. Supabase SQL (복사하여 SQL Editor에서 실행)

> RLS는 기존 테이블과 동일하게 Disabled 상태로 둔다.

### 6-1. 테이블 생성

```sql
-- (1) 연습코스 학습 결과 테이블
CREATE TABLE study_results_practice (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  section_type text NOT NULL,
  module_number integer NOT NULL,
  practice_number integer NOT NULL,
  initial_record jsonb,
  current_record jsonb,
  error_note_submitted boolean DEFAULT false,
  initial_level numeric,
  completed_at timestamptz,
  speaking_file_1 text,
  UNIQUE (user_id, section_type, module_number, practice_number)
);

-- (2) 연습코스 스케줄 테이블
CREATE TABLE tr_practice_schedule (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  practice_number integer NOT NULL UNIQUE,
  tasks jsonb NOT NULL
);

-- (3) applications 테이블에 practice_enabled 컬럼 추가
ALTER TABLE applications ADD COLUMN IF NOT EXISTS practice_enabled boolean DEFAULT false;
```

### 6-2. 스케줄 데이터 삽입 (60행)

```sql
INSERT INTO tr_practice_schedule (practice_number, tasks) VALUES
  (1, '["내벨업보카 5, 6pg", "리딩 Module 13", "리스닝 Module 13"]'::jsonb),
  (2, '["내벨업보카 7, 8pg", "리딩 Module 14", "스피킹 13"]'::jsonb),
  (3, '["내벨업보카 9, 10pg", "리스닝 Module 14", "라이팅 13"]'::jsonb),
  (4, '["내벨업보카 11, 12pg", "리딩 Module 15", "라이팅 14"]'::jsonb),
  (5, '["내벨업보카 13, 14pg", "리스닝 Module 15", "스피킹 14"]'::jsonb),
  (6, '["내벨업보카 15, 16pg", "스피킹 15", "라이팅 15"]'::jsonb),
  (7, '["내벨업보카 17, 18pg", "리딩 Module 16", "리스닝 Module 16"]'::jsonb),
  (8, '["내벨업보카 19, 20pg", "리딩 Module 17", "스피킹 16"]'::jsonb),
  (9, '["내벨업보카 21, 22pg", "리스닝 Module 17", "라이팅 16"]'::jsonb),
  (10, '["내벨업보카 23, 24pg", "리딩 Module 18", "라이팅 17"]'::jsonb),
  (11, '["내벨업보카 25, 26pg", "리스닝 Module 18", "스피킹 17"]'::jsonb),
  (12, '["내벨업보카 27, 28pg", "스피킹 18", "라이팅 18"]'::jsonb),
  (13, '["내벨업보카 29, 30pg", "리딩 Module 19", "리스닝 Module 19"]'::jsonb),
  (14, '["내벨업보카 31, 32pg", "리딩 Module 20", "스피킹 19"]'::jsonb),
  (15, '["내벨업보카 33, 34pg", "리스닝 Module 20", "라이팅 19"]'::jsonb),
  (16, '["내벨업보카 35, 36pg", "리딩 Module 21", "라이팅 20"]'::jsonb),
  (17, '["내벨업보카 37, 38pg", "리스닝 Module 21", "스피킹 20"]'::jsonb),
  (18, '["내벨업보카 39, 40pg", "스피킹 21", "라이팅 21"]'::jsonb),
  (19, '["내벨업보카 41, 42pg", "리딩 Module 22", "리스닝 Module 22"]'::jsonb),
  (20, '["내벨업보카 43, 44pg", "리딩 Module 23", "스피킹 22"]'::jsonb),
  (21, '["내벨업보카 45, 46pg", "리스닝 Module 23", "라이팅 22"]'::jsonb),
  (22, '["내벨업보카 47, 48pg", "리딩 Module 24", "라이팅 23"]'::jsonb),
  (23, '["내벨업보카 49, 50pg", "리스닝 Module 24", "스피킹 23"]'::jsonb),
  (24, '["내벨업보카 51, 52pg", "스피킹 24", "라이팅 24"]'::jsonb),
  (25, '["내벨업보카 53, 54pg", "리딩 Module 25", "리스닝 Module 25"]'::jsonb),
  (26, '["내벨업보카 55, 56pg", "리딩 Module 26", "스피킹 25"]'::jsonb),
  (27, '["내벨업보카 57, 58pg", "리스닝 Module 26", "라이팅 25"]'::jsonb),
  (28, '["내벨업보카 59, 60pg", "리딩 Module 27", "라이팅 26"]'::jsonb),
  (29, '["내벨업보카 61pg", "리스닝 Module 27", "스피킹 26"]'::jsonb),
  (30, '["내벨업보카 5, 6pg", "스피킹 27", "라이팅 27"]'::jsonb),
  (31, '["내벨업보카 7, 8pg", "리딩 Module 28", "리스닝 Module 28"]'::jsonb),
  (32, '["내벨업보카 9, 10pg", "리딩 Module 29", "스피킹 28"]'::jsonb),
  (33, '["내벨업보카 11, 12pg", "리스닝 Module 29", "라이팅 28"]'::jsonb),
  (34, '["내벨업보카 13, 14pg", "리딩 Module 30", "라이팅 29"]'::jsonb),
  (35, '["내벨업보카 15, 16pg", "리스닝 Module 30", "스피킹 29"]'::jsonb),
  (36, '["내벨업보카 17, 18pg", "스피킹 30", "라이팅 30"]'::jsonb),
  (37, '["내벨업보카 19, 20pg", "리딩 Module 31", "리스닝 Module 31"]'::jsonb),
  (38, '["내벨업보카 21, 22pg", "리딩 Module 32", "스피킹 31"]'::jsonb),
  (39, '["내벨업보카 23, 24pg", "리스닝 Module 32", "라이팅 31"]'::jsonb),
  (40, '["내벨업보카 25, 26pg", "리딩 Module 33", "라이팅 32"]'::jsonb),
  (41, '["내벨업보카 27, 28pg", "리스닝 Module 33", "스피킹 32"]'::jsonb),
  (42, '["내벨업보카 29, 30pg", "스피킹 33", "라이팅 33"]'::jsonb),
  (43, '["내벨업보카 31, 32pg", "리딩 Module 34", "리스닝 Module 34"]'::jsonb),
  (44, '["내벨업보카 33, 34pg", "리딩 Module 35", "스피킹 34"]'::jsonb),
  (45, '["내벨업보카 35, 36pg", "리스닝 Module 35", "라이팅 34"]'::jsonb),
  (46, '["내벨업보카 37, 38pg", "리딩 Module 36", "라이팅 35"]'::jsonb),
  (47, '["내벨업보카 39, 40pg", "리스닝 Module 36", "스피킹 35"]'::jsonb),
  (48, '["내벨업보카 41, 42pg", "스피킹 36", "라이팅 36"]'::jsonb),
  (49, '["내벨업보카 43, 44pg", "리딩 Module 37", "리스닝 Module 37"]'::jsonb),
  (50, '["내벨업보카 45, 46pg", "리딩 Module 38", "스피킹 37"]'::jsonb),
  (51, '["내벨업보카 47, 48pg", "리스닝 Module 38", "라이팅 37"]'::jsonb),
  (52, '["내벨업보카 49, 50pg", "리딩 Module 39", "라이팅 38"]'::jsonb),
  (53, '["내벨업보카 51, 52pg", "리스닝 Module 39", "스피킹 38"]'::jsonb),
  (54, '["내벨업보카 53, 54pg", "스피킹 39", "라이팅 39"]'::jsonb),
  (55, '["내벨업보카 55, 56pg", "리딩 Module 40", "리스닝 Module 40"]'::jsonb),
  (56, '["내벨업보카 57, 58pg", "리딩 Module 41", "스피킹 40"]'::jsonb),
  (57, '["내벨업보카 59, 60pg", "리스닝 Module 41", "라이팅 40"]'::jsonb),
  (58, '["내벨업보카 61pg", "리딩 Module 42", "라이팅 41"]'::jsonb),
  (59, '["내벨업보카 5, 6pg", "리스닝 Module 42", "스피킹 41"]'::jsonb),
  (60, '["내벨업보카 7, 8pg", "스피킹 42", "라이팅 42"]'::jsonb);
```

---

## 7. 연습 마이페이지 HTML 구조 (`mypage-practice.html`)

> 기존 `mypage.html`의 네이밍 규칙을 따름. 클래스/ID에 `mp-` 접두어, `section-block`, `summary-grid`, `score-tab` 등 동일.

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>마이페이지 – 연습코스</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
  <link rel="stylesheet" href="css/mypage-style.css" />
  <link rel="stylesheet" href="css/mypage-practice-style.css" />
</head>
<body>

  <!-- ───────────── TOP BAR ───────────── -->
  <nav class="mp-topbar">
    <button class="mp-back-btn" onclick="goBackToTestroom()">
      <i class="fa-solid fa-arrow-left"></i>
      <span>학습으로 돌아가기</span>
    </button>
    <span class="mp-topbar-title">마이페이지</span>
    <button class="mp-logout-btn" onclick="handleLogout()">
      <i class="fa-solid fa-right-from-bracket"></i>
    </button>
  </nav>

  <!-- ───────────── LOADING ───────────── -->
  <div class="mp-loading" id="loadingScreen">
    <div class="mp-spinner"></div>
    <p>학습 데이터를 불러오는 중...</p>
  </div>

  <!-- ───────────── NOT LOGGED IN ───────────── -->
  <div class="mp-not-logged" id="notLoggedScreen" style="display:none;">
    <i class="fa-solid fa-lock" style="font-size:3rem; color:var(--signature); margin-bottom:16px;"></i>
    <h2>로그인이 필요합니다</h2>
    <p>테스트룸에서 먼저 로그인해주세요.</p>
    <button class="mp-cta-btn" onclick="goBackToTestroom()">
      <i class="fa-solid fa-arrow-right"></i> 테스트룸으로 이동
    </button>
  </div>

  <!-- ───────────── MAIN ───────────── -->
  <main class="page-wrap" id="mainContent" style="display:none;">

    <!-- 사용자 정보 -->
    <div class="user-info-card">
      <i class="fas fa-user-circle"></i>
      <span><strong id="userName">-</strong>님</span>
      <span class="program-badge" id="programBadge">연습코스</span>
    </div>

    <!-- ① 연습 현황 요약 카드 (2개) -->
    <section class="section-block">
      <h2 class="section-title">
        <i class="fa-solid fa-chart-line"></i> 연습 현황 요약
      </h2>

      <div class="summary-grid summary-grid-2">

        <!-- 평균 레벨 -->
        <div class="summary-card card-purple">
          <div class="sc-icon"><i class="fa-solid fa-signal"></i></div>
          <div class="sc-body">
            <p class="sc-label">📊 평균 레벨</p>
            <p class="sc-value" id="avgLevel">-</p>
            <p class="sc-sub" id="avgLevelSub"></p>
          </div>
        </div>

        <!-- 최근 학습 -->
        <div class="summary-card card-blue">
          <div class="sc-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
          <div class="sc-body">
            <p class="sc-label">🕐 최근 학습</p>
            <p class="sc-value" id="recentStudy">-</p>
            <p class="sc-sub" id="recentStudySub"></p>
          </div>
        </div>

      </div>
    </section>

    <!-- ② 나의 성적 추이 -->
    <section class="section-block">
      <h2 class="section-title">
        <i class="fa-solid fa-chart-line"></i> 나의 성적 추이
      </h2>
      <p class="section-desc">Practice별 1차 레벨 점수 변화를 확인합니다</p>

      <!-- 탭 -->
      <div class="score-tabs">
        <button class="score-tab active" data-tab="reading">
          <i class="fa-solid fa-book-open"></i> Reading
        </button>
        <button class="score-tab" data-tab="listening">
          <i class="fa-solid fa-headphones"></i> Listening
        </button>
      </div>

      <!-- 차트 영역 -->
      <div class="score-chart-wrap" id="scoreChartWrap">
        <canvas id="scoreChart" height="300"></canvas>
        <div class="score-chart-empty" id="scoreChartEmpty" style="display:none;">
          <i class="fa-solid fa-chart-line"></i>
          <p>아직 학습 기록이 없습니다</p>
        </div>
      </div>
    </section>

    <!-- ③ 영역별 완료 현황 -->
    <section class="section-block">
      <h2 class="section-title">
        <i class="fa-solid fa-tasks"></i> 영역별 완료 현황
      </h2>

      <div class="completion-grid" id="completionGrid">
        <!-- JS에서 동적 렌더링: Reading 12/30, Listening 12/30, Writing 12/30, Speaking 12/30 -->
        <!-- 데이터 없으면: "아직 학습 기록이 없습니다" -->
      </div>
    </section>

  </main>

  <script src="js/supabase-client.js"></script>
  <script src="js/mypage-practice.js"></script>
</body>
</html>
```

### HTML 네이밍 규칙 대조표

| 요소 | 정규 (`mypage.html`) | 연습 (`mypage-practice.html`) |
|---|---|---|
| 페이지 타이틀 | `마이페이지 – 학습 현황` | `마이페이지 – 연습코스` |
| 상단바 | `mp-topbar`, `mp-back-btn` | 동일 |
| 로딩 | `#loadingScreen` | 동일 |
| 비로그인 | `#notLoggedScreen` | 동일 |
| 메인 래퍼 | `#mainContent`, `.page-wrap` | 동일 |
| 유저 정보 | `.user-info-card`, `#userName`, `#programBadge` | 동일 (badge 고정값 "연습코스") |
| 요약 카드 | `.summary-grid` (4칸) | `.summary-grid.summary-grid-2` (2칸) |
| 차트 | `#scoreChart`, `#scoreChartEmpty`, `.score-tabs` | 동일 |
| 영역별 완료 | 없음 (잔디로 대체) | `#completionGrid`, `.completion-grid` |
| CSS | `mypage-style.css` | `mypage-style.css` + `mypage-practice-style.css` |
| JS | `mypage.js` | `mypage-practice.js` |
