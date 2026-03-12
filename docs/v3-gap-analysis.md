# V3 빈 구간 분석 보고서

> 작성일: 2026-03-06
> 기준 문서: v3-design-spec.md, v3-flow-spec.md
> 대조 대상: index.html, js/ 내 모든 활성 파일

---

## 0단계: V2 `<script>` 태그 정리 ✅ 완료

### 처리 결과

V2 파일 아카이브 이동 후 빈 `<script>` 태그 11개를 **주석 처리** 완료.
각 태그에 `[V3-대기]` 라벨과 대체 예정 파일명을 기재.

| `<script>` 경로 | 처리 | V3 대체 파일 |
|-----------------|------|-------------|
| `js/speaking-repeat-logic.js` | 주석 처리 | speaking-module-controller.js |
| `js/speaking-interview-logic.js` | 주석 처리 | speaking-module-controller.js |
| `js/ComponentPatch.js` | 주석 처리 | 모듈 컨트롤러에 내장 |
| `js/module-definitions.js` | 주석 처리 | 모듈 컨트롤러 작성 시 참고용 |
| `js/module-controller-v2.js` | 주석 처리 | 섹션별 *-module-controller.js |
| `js/result-controller-v2.js` | 주석 처리 | task-dashboard.js |
| `js/writing-flow-v2.js` | 주석 처리 | writing-module-controller.js |
| `js/study-save.js` | 주석 처리 | supabase-client.js에 V3 함수 추가 |
| `js/explain-viewer-v2.js` | 주석 처리 | explain-viewer.js |
| `js/final-explain-screen.js` | 주석 처리 | explain-viewer.js에 통합 |
| `js/review-panel.js` | 주석 처리 | 모듈 컨트롤러에 내장 |
| `js/tasks.js` | 주석 처리 | 삭제 대상 (dead code) |

**추가 정리:**
- `index.html`의 `startFullTest()` 버튼 제거, `.start-options` div를 `display:none`으로 비움
- CSS 파일(`final-explain-screen.css`, `review-panel.css`)은 유지 (V3에서 재사용 가능)

---

## 1단계: 화면 이동 경로 + DB 도구 준비 ✅ 완료

### GAP-1. 스케줄 → 과제 대시보드 ✅ 완료

**수정 파일:** `js/task-router.js`
**작업:** `_executeTaskCore()`에서 4섹션(reading/listening/writing/speaking)일 때 `openTaskDashboard(parsed.type, parsed.params, taskName)` 호출하도록 변경.

---

### GAP-2. 과제 대시보드 → 문제 풀이 시작 ✅ 구조 완료

**신규 파일:** `js/task-dashboard.js`
**작업:** `_onPracticeClick()` → 섹션별 `startXxxModule()` 호출 (함수 존재 여부 확인 후 호출). DB 조회 → 버튼 상태 설정 → 클릭 핸들러 등록까지 구현.

> 실제 `startReadingModule()` 등 모듈 컨트롤러 함수는 2단계에서 생성.

---

### GAP-4. 문제 풀이 완료 → 과제 대시보드 복귀 ✅ 구조 완료

**수정 파일:** `js/task-dashboard.js`
**작업:**
- `backToTaskDashboard()` 함수 정의 (미디어 정리 → 타이머 정리 → 대시보드 화면 전환 → DB 재조회)
- `backToStageSelect()` → `backToTaskDashboard()` 래퍼 함수 추가 (HTML onclick 호환)

> 2단계에서 모듈 컨트롤러의 finish() → `backToTaskDashboard()` 연결 완성.

---

### GAP-5. 과제 대시보드 → 해설 보기 ✅ 구조 완료

**수정 파일:** `js/task-dashboard.js`
**작업:** `_onExplainClick()` → `openExplainViewer()` 호출 (함수 존재 여부 확인).

> 실제 `openExplainViewer()` 함수는 3단계에서 `explain-viewer.js` 생성 시 정의.

---

### GAP-7. 과제 대시보드 → 스케줄 복귀 ✅ 완료

**수정 파일:** `js/task-dashboard.js`
**작업:** `backToScheduleFromDashboard()` 함수 정의 (상태 초기화 → `backToSchedule()` 호출).

---

### GAP-8. V3 DB 함수 추가 ✅ 완료

**수정 파일:** `js/supabase-client.js`, `js/task-dashboard.js`
**작업:** V3 전용 CRUD 함수 4개 추가 + 대시보드 연결.

| 함수 | 테이블 | 용도 |
|------|--------|------|
| `getStudyResultV3()` | `study_results_v3` SELECT | 대시보드 진입 시 레코드 조회 |
| `upsertInitialRecord()` | `study_results_v3` UPSERT | 실전풀이 최초 저장 (불변 보호 내장) |
| `upsertCurrentRecord()` | `study_results_v3` UPSERT | 다시풀기 덮어쓰기 저장 |
| `getCompletedTasksV3()` | `study_results_v3` SELECT | 완료 과제 목록 (progress-tracker용) |

> 기존 V1 함수(`saveStudyRecord`, `saveAuthRecord`)는 유지 — 입문서/보카가 아직 사용 중

---

### 1단계 추가 정리 ✅ 완료

| 파일 | 작업 | 상세 |
|------|------|------|
| `js/main.js` | 데드코드 삭제 | 41KB → 10KB. V1 init/load/save 함수 삭제 |
| `js/data.js` → `js/app-state.js` | V1 데이터 삭제 + 파일명 변경 | 29KB → 0.7KB. `currentTest` + `daysOfWeek`만 유지 |
| `js/navigation.js` | V1/V2 잔재 삭제 | `FlowController.cleanup()`, `moduleController` 정리 코드 삭제 |

---

### 1단계에서 발견된 이슈 (향후 처리)

| # | 이슈 | 위치 | 처리 시기 |
|---|------|------|----------|
| F-1 | ~~`task-router.js` L385~397 주석이 "함수 삭제됨"이라 하지만 L402~601에 실제 함수 존재 (모순)~~ | task-router.js | ✅ 해결 (리딩 코드 220줄 삭제) |
| F-2 | ~~`finishReadingModule()`이 `backToSchedule()` 호출~~ | task-router.js | ✅ 해결 (리딩 모듈 컨트롤러에서 `backToTaskDashboard()` 호출) |
| F-3 | `progress-tracker.js`가 V1 테이블 `tr_study_records`만 조회 | progress-tracker.js | 3단계 (V3 조회 함수 교체 시) |
| F-4 | `submitIntroBook()`이 V1 테이블에 INSERT | task-router.js L159 | 별도 (입문서 V3 전환 시) |
| F-5 | 6개 result 파일이 `sessionStorage`에서 `currentTest`를 읽는 곳 있음 | 각 result 파일 | 2단계 (모듈 컨트롤러에서 통일) |
| F-6 | `error-note.js`가 V1 테이블에 오답노트 저장 | error-note.js L707, L720 | 4단계 |
| F-7 | `tasks.js` 파일이 프로젝트에 남아 있음 (script 주석 처리로 로드 안 됨) | js/tasks.js | 최종 정리 시 삭제 |

---

## 2단계: 모듈 컨트롤러 + 결과 저장

> **선행 조건:** 1단계 완료 (DB 함수, 대시보드 라우팅)
> **이 단계의 핵심:** 문제를 풀고 결과를 저장하는 흐름 완성

### 2-PRE. Supabase에 `study_results_v3` 테이블 생성 ⚠️ 미완료

> **시점:** 2단계 첫 번째 모듈 컨트롤러 테스트 전에 반드시 완료
> **이유:** 모듈 컨트롤러의 finish()가 `upsertInitialRecord()` / `upsertCurrentRecord()`를 호출하는데, 이 함수들이 `study_results_v3` 테이블에 저장함. 테이블이 없으면 404 오류 발생.
> **테이블 구조:** v3-design-spec.md §3-2 참조
> **유니크 제약:** `(user_id, section_type, module_number, week, day)`

---

### GAP-3. 유형 간 이동 — 모듈 컨트롤러 4개 생성

4개의 섹션별 모듈 컨트롤러를 생성하여 13개 유형의 문제 풀이 흐름을 제어.

```
과제 대시보드 → [모듈 컨트롤러] → 유형1 → 유형2 → ... → 완료 → DB 저장 → 대시보드 복귀
```

#### 기존 컴포넌트/로더 현황

| 섹션 | 유형 | 컴포넌트 | 로더 | 결과 렌더러 | init 함수 |
|------|------|---------|------|-----------|----------|
| Reading | fillblanks | ✅ fillblanks-component.js | ✅ fillblanks-loader.js | ✅ fillblanks-result.js | `initReadingFillBlanks(setNum)` |
| Reading | daily1 | ✅ daily1-component.js | ✅ daily1-loader.js | ✅ daily1-result.js | `initReadingDaily1(setNum)` |
| Reading | daily2 | ✅ daily2-component.js | ✅ daily2-loader.js | ✅ daily2-result.js | `initReadingDaily2(setNum)` |
| Reading | academic | ✅ academic-component.js | ✅ academic-loader.js | ✅ academic-result.js | `initReadingAcademic(setNum)` |
| Listening | response | ✅ response-component.js | ✅ response-loader.js | ✅ response-result.js | `initListeningResponse(setNum)` |
| Listening | conver | ✅ conver-component.js | ✅ conver-loader.js | ✅ conver-result.js | `initListeningConver(setNum)` |
| Listening | announcement | ✅ announcement-component.js | ✅ announcement-loader.js | ✅ announcement-result.js | ❓ 확인 필요 |
| Listening | lecture | ✅ lecture-component.js | ✅ lecture-loader.js | ✅ lecture-result.js | ❓ 확인 필요 |
| Writing | arrange | ✅ ArrangeComponent.js | ✅ arrange-loader.js | ✅ arrange-result.js | ❓ 확인 필요 |
| Writing | email | ✅ EmailComponent.js | ✅ email-loader.js | ✅ email-result.js | ❓ 확인 필요 |
| Writing | discussion | ✅ DiscussionComponent.js | ✅ discussion-loader.js | ✅ discussion-result.js | ❓ 확인 필요 |
| Speaking | repeat | ✅ RepeatComponent.js | ✅ repeat-loader.js | ✅ repeat-result.js | `ComponentPatch.init(setId)` |
| Speaking | interview | ✅ InterviewComponent.js | ✅ interview-loader.js | ✅ interview-result.js | `ComponentPatch.init(setId)` |

> **모든 유형에 컴포넌트 + 로더 + 결과 렌더러가 존재.** 부족한 것은 이들을 **순서대로 연결하는 모듈 컨트롤러** 뿐.

#### 작업 절차 (섹션별 반복)

각 섹션 모듈 컨트롤러는 **독립적**으로 동작하므로(리딩↔리스닝↔라이팅↔스피킹 사이에 의존 관계 없음), 아래 절차를 섹션마다 반복한다:

```
1. 모듈 컨트롤러 파일 생성
2. index.html에 script 태그 추가
3. 간단 플로우 테스트 (시작 → 문제 이동 → 제출 → 대시보드 복귀)
4. 플로우 테스트 중 발견된 이슈 수정
5. 세부 테스트 (아래 시나리오 기반 — 엣지 케이스, 빠른 연타, 타이머 만료 등)
6. 세부 테스트 통과 → 다음 섹션으로 이동
```

> ⚠️ 4개를 한꺼번에 만들고 나중에 테스트하지 않음. **하나 만들고 → 테스트 통과 → 다음 하나** 순서로 진행.

---

#### 2-A. Reading Module Controller ✅ 구현 완료 (플로우 테스트 통과)

**파일:** `js/reading/reading-module-controller.js` ✅ 생성 완료
**사양:** v3-flow-spec.md §1-1 ~ §1-4

**핵심 정보:**
- 모듈 1개 = **35문제**: FB×2세트(20) → Daily1×2세트(4) → Daily2×2세트(6) → Academic×1세트(5)
- **20분 타이머** (모듈 전체)
- Next/Back **자유 이동**, Review Panel (문제 클릭 → 이동)
- Submit 또는 시간 초과 → 자동 제출 → 대시보드 복귀

📋 완료 항목:
- [x] `startReadingModule(moduleNumber)` 전역 함수 정의
- [x] `task-router.js`의 기존 리딩 함수들 이관 (220줄 삭제)
- [x] 모듈 번호 → 세트 번호 매핑 (Module 1: sets [1,2], Module 2: sets [3,4])
- [x] 각 유형 init 함수 호출 시 `onComplete` 콜백 연결
- [x] 완료 시 V3 JSON 구조로 답안 정리 → DB 저장 (`upsertInitialRecord` / `upsertCurrentRecord`)
- [x] Review Panel 연동 (Answered/Not Answered 상태, 문제 클릭 이동)
- [x] 문제 번호 표시: "Question X of 35"
- [x] `task-router.js`에서 리딩 관련 코드 전부 삭제
- [x] `moduleSubmitAll()` 전역 래퍼 — 리딩 활성 시 리딩 submit 호출
- [x] `index.html`에 script 태그 추가 + `supabase-client.js` 로드 순서 조정

📋 테스트 중 발견·수정한 이슈:
- [x] `academic-loader.js`: questionType 키워드 추측 → DB 태그(`Q1[highlight]`) 읽기 방식으로 변경
- [x] `academic-loader.js`: 구분자 `#|#`, `##` 미처리 → 처리 추가, 하이라이트 클래스명 통일
- [x] `index.html`: 2차 풀이 뱃지 3개 제거
- [x] `task-router.js`: 시작 확인 팝업 문구 V3에 맞게 변경
- [x] `index.html`: `supabase-client.js` 로드 순서를 컨트롤러보다 앞으로 이동 + 버전 번호 갱신 (캐시 방지)

⚠️ DB 저장 테스트 보류: `study_results_v3` 테이블 미생성 (2-PRE 참조)

레벨 변환표 (Reading, 총 35문제):

| 정답 수 | 레벨 | 정답 수 | 레벨 | 정답 수 | 레벨 |
|---------|------|---------|------|---------|------|
| 0~3 | 1.0 | 14~17 | 3.0 | 28~30 | 5.0 |
| 4~6 | 1.5 | 18~20 | 3.5 | 31~32 | 5.5 |
| 7~10 | 2.0 | 21~24 | 4.0 | 33~35 | 6.0 |
| 11~13 | 2.5 | 25~27 | 4.5 | | |

#### 2-A-TEST. 리딩 세부 테스트 시나리오 ⬜ 미진행

> **선행:** 2-PRE(테이블 생성) 완료 후 진행
> **목적:** 학생/운영자가 발견하기 어려운 엣지 케이스까지 검증

##### T1. 기본 플로우

| # | 시나리오 | 확인 항목 |
|---|---------|----------|
| T1-1 | 시작 → 35문제 순서대로 풀기 → Submit | 대시보드 복귀, DB에 initial_record 저장 |
| T1-2 | 대시보드에서 "다시풀기" 클릭 → 35문제 → Submit | DB에 current_record 저장 (initial_record 변경 안 됨) |
| T1-3 | 마감 지난 과제 시작 | "마감 지났습니다" 팝업 표시 후 풀이 가능 |

##### T2. 타이머

| # | 시나리오 | 확인 항목 |
|---|---------|----------|
| T2-1 | 20분 자연 만료 | 경고 없이 자동 제출, 입력한 답만 채점, 대시보드 복귀 |
| T2-2 | 1분 남았을 때 표시 | 타이머 색상 변경 또는 경고 표시 여부 |
| T2-3 | 타이머 진행 중 Review Panel 열기 | 타이머 계속 흘러감 (멈추지 않음) |

##### T3. 버튼 연타·빠른 조작

| # | 시나리오 | 확인 항목 |
|---|---------|----------|
| T3-1 | Next 버튼 빠르게 10번 연타 | 문제가 10개 넘어감 (2개씩 건너뛰거나 오류 없이 정상 이동) |
| T3-2 | Back 버튼 빠르게 10번 연타 | 1번 문제에서 멈춤, 음수 문제번호 안 나옴 |
| T3-3 | Submit 버튼 빠르게 3번 연타 | DB 저장이 1번만 실행됨 (중복 저장 방지) |
| T3-4 | Next와 Back을 번갈아 빠르게 연타 | 화면 깨짐 없음, 문제 번호 정확함 |
| T3-5 | 선택지 A→B→C→D 빠르게 연달아 클릭 | 마지막 클릭(D)만 선택됨, 중복 선택 없음 |

##### T4. 문제 번호·진행 표시

| # | 시나리오 | 확인 항목 |
|---|---------|----------|
| T4-1 | 빈칸채우기 1번 문제 | "Question 1 of 35" 표시 |
| T4-2 | 빈칸채우기 → Daily1 넘어가는 시점 | "Question 21 of 35" 정확히 표시, 화면 전환 깨짐 없음 |
| T4-3 | Academic 마지막 문제 (35번) | "Question 35 of 35", Submit 버튼 표시, Next 숨김 |
| T4-4 | 1번 문제에서 Back 버튼 | Back 버튼 숨김 또는 비활성 |

##### T5. 유형 전환 (세트 → 세트)

| # | 시나리오 | 확인 항목 |
|---|---------|----------|
| T5-1 | 빈칸채우기 Set1(Q10) → Next → Set2(Q11) | 화면 전환 정상, 이전 세트 답안 유지 |
| T5-2 | Daily1 Set2(Q24) → Next → Daily2 Set1(Q25) | 유형 전환 시 지문/선택지 정상 로드 |
| T5-3 | Daily2 Set2(Q30) → Next → Academic(Q31) | Academic 지문 렌더링 정상 |
| T5-4 | Academic(Q31)에서 Back → Daily2(Q30) | 이전 유형으로 복귀, 답안 유지 |
| T5-5 | 빈칸채우기 Set1에서 답 입력 → Set2 갔다가 → Back으로 Set1 복귀 | Set1 답안 그대로 남아있음 |

##### T6. Review Panel

| # | 시나리오 | 확인 항목 |
|---|---------|----------|
| T6-1 | Review Panel 열기 | 35문제 목록 표시, 답한 문제/안 한 문제 구분 |
| T6-2 | Q28 클릭 → 이동 | Q28로 정확히 이동, 해당 유형 화면 표시 |
| T6-3 | Review에서 Q5 이동 → Next 누르기 | Q6으로 이동 (Q5 이후부터 정상 진행) |
| T6-4 | Review Panel 열었다 닫기 반복 5번 | 화면 깨짐 없음, 타이머 정상 |

##### T7. 어휘·삽입 문제 (Academic)

| # | 시나리오 | 확인 항목 |
|---|---------|----------|
| T7-1 | 어휘문제(Q31) 진입 | 지문에 해당 단어 노란색 하이라이트 표시 |
| T7-2 | 어휘문제 → 일반문제 이동 | 노란색 하이라이트 사라짐 |
| T7-3 | 삽입문제(Q35) 진입 | 지문에 (A)(B)(C)(D) 위치 마커 표시 |
| T7-4 | 삽입문제 → 어휘문제로 Back | 위치 마커 사라지고 하이라이트 표시 |
| T7-5 | 구분자 확인 | 지문에 `#|#`, `##`, `#||#` 원문이 보이지 않음 |

##### T8. 답안 보존

| # | 시나리오 | 확인 항목 |
|---|---------|----------|
| T8-1 | Q5에서 답 선택 → Q20까지 이동 → Q5로 복귀 | Q5 답안 그대로 선택되어 있음 |
| T8-2 | 빈칸채우기에 답 입력 → Daily1 갔다 돌아옴 | 빈칸 입력값 유지 |
| T8-3 | 35문제 중 10문제만 답하고 Submit | 답한 10문제만 채점, 나머지 25문제는 오답 처리 |

##### T9. 에러 상황

| # | 시나리오 | 확인 항목 |
|---|---------|----------|
| T9-1 | 문제 풀이 중 브라우저 새로고침 | 풀이 초기화 (설계 문서상 정상 동작 — 복구 미지원) |
| T9-2 | 네트워크 끊긴 상태에서 Submit | 에러 메시지 표시, 재시도 안내 |
| T9-3 | 콘솔 에러 0건 확인 | 전체 플로우 동안 콘솔에 빨간 에러 없음 |

---

#### 2-B. Listening Module Controller

**파일:** `js/listening/listening-module-controller.js` (신규)
**사양:** v3-flow-spec.md §2-1 ~ §2-6

**핵심 정보:**
- 모듈 1개 = **32문제**: Response×1세트(12) → Conver×3세트(6) → Announcement×3세트(6) → Lecture×2세트(8)
- **전체 타이머 없음** — 문제별 개별 타이머 (Response: 20초, Conver/Announce: 20초, Lecture: 30초)
- **순방향만** (Back 없음, 되돌아가기 불가)
- Review Panel: **열람 전용** (클릭해도 이동 안 함)
- 오디오: 수동 재생, 1회만. 재생 중 Next 숨김.

📋 TODO:
- [ ] `startListeningModule(moduleNumber)` 전역 함수 정의
- [ ] 세트 순서 시퀀스 관리: Response → Conver×3 → Announce×3 → Lecture×2
- [ ] 각 유형의 init 함수 호출 + `onComplete` 콜백 연결
- [ ] 오디오 재생 화면 → 문제 화면 전환 로직 (컴포넌트 내부에 이미 구현되어 있는지 확인)
- [ ] 문제 번호 표시: "Question X of 32" (1문제씩)
- [ ] 완료 시 V3 JSON → DB 저장 → `backToTaskDashboard()`
- [ ] Review Panel: 열람 전용 (Answered/Not Answered 표시, 이동 불가)
- [ ] Next 버튼과 오디오 관계: 재생 전(보임), 재생 중(숨김), 재생 완료(보임)

레벨 변환표 (Listening, 총 32문제):

| 정답 수 | 레벨 | 정답 수 | 레벨 | 정답 수 | 레벨 |
|---------|------|---------|------|---------|------|
| 0~2 | 1.0 | 12~15 | 3.0 | 25~27 | 5.0 |
| 3~5 | 1.5 | 16~18 | 3.5 | 28~29 | 5.5 |
| 6~8 | 2.0 | 19~21 | 4.0 | 30~32 | 6.0 |
| 9~11 | 2.5 | 22~24 | 4.5 | | |

---

#### 2-C. Writing Module Controller

**파일:** `js/writing/writing-module-controller.js` (신규)
**사양:** v3-flow-spec.md §3-1 ~ §3-6

**핵심 정보:**
- 모듈 1개 = **12문제 카운트**: Arrange×1세트(10) → Email×1세트(1) → Discussion×1세트(1)
- **유형별 개별 타이머** (Arrange: 6분50초, Email: 7분, Discussion: 10분)
- 시간 초과 → 입력 비활성화 → 학생이 Next 눌러야 다음으로
- Review Panel **없음**
- Arrange: Next/Back 자유 이동 (1번 Back 없음, 10번 Next → Email)

📋 TODO:
- [ ] `startWritingModule(moduleNumber)` 전역 함수 정의
- [ ] Arrange → Email → Discussion 순서 시퀀스 관리
- [ ] 각 유형의 init/시작 함수 호출 + `onComplete` 콜백 연결
- [ ] 유형별 타이머 관리 (기존 컴포넌트에 타이머가 내장되어 있는지 확인)
- [ ] 문제 번호 표시: "Question X of 12"
- [ ] 완료 시 V3 JSON → DB 저장
  - Arrange: 채점 결과
  - Email: `writing_email_text` 별도 컬럼 + initial_record에 포함
  - Discussion: `writing_discussion_text` 별도 컬럼 + initial_record에 포함
- [ ] 다시풀기: Email/Discussion → current_record에 포함 + `.txt` 파일 자동 다운로드
- [ ] `backToTaskDashboard()` 호출

⚠️ 라이팅 저장 규칙 (v3-flow-spec.md §3-3):
- 실전풀이: `writing_email_text`, `writing_discussion_text` 별도 컬럼에 **최초 1회만** 저장
- 다시풀기: 별도 컬럼 변경 안 함, current_record에만 포함 + .txt 다운로드

---

#### 2-D. Speaking Module Controller

**파일:** `js/speaking/speaking-module-controller.js` (신규)
**사양:** v3-flow-spec.md §4-1 ~ §4-5

**핵심 정보:**
- 모듈 1개 = **11문제**: Repeat×1세트(7) → Interview×1세트(4)
- **완전 자동 시퀀스** — 학생이 누르는 버튼 없음
- Repeat 완료 → **바로 Interview 인트로** (내부적으로 Repeat 완전 정리 후 시작)
- 타이머: 전체 모듈 타이머 없음, 문제별 내부 타이머만
- Review Panel 없음, Next/Back 없음

📋 TODO:
- [ ] `startSpeakingModule(moduleNumber)` 전역 함수 정의
- [ ] RepeatComponent.init(setId) 호출 + onComplete 콜백 등록
  - 현재: `ComponentPatch.js`가 init()을 추가했었음 (V2) — V3에서는 모듈 컨트롤러가 직접 처리
  - RepeatComponent 소스를 확인하여 init 패턴 파악 필요
- [ ] Repeat onComplete → Interview 시작 전에 **Repeat 완전 정리** (오디오 중지, 타이머 해제)
- [ ] InterviewComponent.init(setId) 호출 + onComplete 콜백 등록
- [ ] Interview onComplete → 완료 → DB 저장 → `backToTaskDashboard()`
- [ ] 저장: 완료 여부만 기록 (채점 결과 없음)
- [ ] 문제 번호 표시: "Question X of 11" (인트로 화면에서는 미표시)

⚠️ ComponentPatch 대체:
- V2에서 `ComponentPatch.js`가 RepeatComponent와 InterviewComponent에 `init(setId)` 메서드를 주입했음
- V3에서는 ComponentPatch를 사용하지 않음 → 모듈 컨트롤러가 직접 초기화
- RepeatComponent/InterviewComponent 내부에 init이 있는지, 아니면 다른 초기화 방식인지 확인 필요

---

### GAP-9. initial_record / current_record 저장 로직

> 각 모듈 컨트롤러의 finish() 함수 안에서 구현 (위 2-A ~ 2-D에 포함)

📋 TODO:
- [ ] 각 모듈 컨트롤러의 `finish()` 함수에서:
  1. 전체 답안을 V3 JSON 구조로 정리
  2. 첫 풀이 → `upsertInitialRecord()`, 다시풀기 → `upsertCurrentRecord()` 호출
  3. `backToTaskDashboard()` 호출 → 대시보드 DB 재조회 → 점수 표시
- [ ] 라이팅 추가: `writing_email_text`, `writing_discussion_text` 별도 컬럼 저장
- [ ] 스피킹: 완료 여부만 기록 (채점 결과 없음)

---

### 2-E. task-router.js 정리 (모듈 컨트롤러 완성 후)

📋 TODO:
- [x] L402~601 리딩 관련 함수 전부 삭제 (220줄 → 리딩 모듈 컨트롤러로 이관)
- [ ] L385~399 오래된 주석 블록 삭제
- [ ] L609 리스닝/라이팅/스피킹 관련 주석 삭제
- [ ] 최종 상태: `task-router.js` = 마감 체크 + 입문서 모달 + 과제 분기(`executeTask`) + 보카 시작만 남김

---

### 2-F. index.html `<script>` 태그 추가

📋 TODO (모듈 컨트롤러 파일 생성 후):
- [x] `<script src="js/reading/reading-module-controller.js">` 추가
- [ ] `<script src="js/listening/listening-module-controller.js">` 추가
- [ ] `<script src="js/writing/writing-module-controller.js">` 추가
- [ ] `<script src="js/speaking/speaking-module-controller.js">` 추가
- [ ] 주석 처리된 V2 태그 중 해당 위치의 `[V3-대기]` 주석 업데이트

---

### 2-G. moduleSubmitAll 교체

**현황:** `index.html`에 4개의 Submit 버튼이 `onclick="moduleSubmitAll()"` 호출.

📋 TODO:
- [x] 리딩 모듈 컨트롤러에 Submit 핸들러 구현 + 전역 `moduleSubmitAll()` 래퍼 (리딩 활성 시 위임)
- [ ] 리스닝 모듈 컨트롤러 Submit 연결
- [ ] 라이팅 모듈 컨트롤러 Submit 연결
- [ ] 스피킹 모듈 컨트롤러 Submit 연결

---

## 3단계: 해설 / 점수 / 진도

> **선행 조건:** 2단계 완료 (모듈 컨트롤러가 데이터를 저장해야 보여줄 게 있음)

### GAP-6. 해설 보기 → 과제 대시보드 복귀

**현황:** `explainBackBtn`에 onclick 핸들러 없음.

📋 TODO:
- [ ] `explain-viewer.js` 생성 시 `explainBackBtn` onclick → `backToTaskDashboard()` 연결

---

### GAP-10. 해설 화면 데이터 로드 및 렌더링

**현황:** `explainViewerScreen`의 좌측 탭은 빈 `<div>`. Result 파일의 함수들이 window에 등록되어 있으나, 해설 화면 안에 렌더링하는 코드 없음.

📋 TODO:
- [ ] `js/explain-viewer.js` 신규 생성
  - `openExplainViewer(sectionType, moduleNumber, week, day)` — 해설 화면 열기
  - DB에서 initial_record / current_record 로드
  - 활성 탭에 따라 섹션별 result 렌더러 호출
  - `explainBackBtn` onclick → `backToTaskDashboard()` 연결 (GAP-6 해결)
- [ ] 탭 전환 시 메모장 내용도 교체 (`error_note_text` ↔ `current_error_note_text`)

---

### GAP-12. 채점 대시보드 점수 표시

**현황:** `task-dashboard.js`에 `_renderScoreFromRecord()` 기본 구현 있음. 섹션별 상세 렌더링은 미구현.

📋 TODO:
- [ ] `_renderScoreFromRecord()`를 섹션별로 확장:
  - Reading: "빈칸채우기 Set1: 8/10, Set2: 7/10, Daily1: 3/4, ..." 형식
  - Listening: "응답고르기: 10/12, 대화: 4/6, ..." 형식
  - Writing: "Arrange: 8/10 정답, Email: 작성 완료 (108 words), Discussion: 작성 완료 (95 words)"
  - Speaking: "따라말하기: 완료 ✅ / 인터뷰: 완료 ✅"
- [ ] record JSON 구조가 확정되면 렌더링 코드 완성 (2단계 모듈 컨트롤러 구현 후)

---

### GAP-13. 스케줄 화면 완료 체크 아이콘

**현황:** `progress-tracker.js`가 V1 테이블 `tr_study_records`에서 완료 과제를 조회.

📋 TODO:
- [ ] `progress-tracker.js`에서 `getStudyRecords()` → `getCompletedTasksV3()` 로 교체
- [ ] V3에서 "완료" 기준: `initial_record IS NOT NULL`

---

## 4단계: 부가 기능

> **선행 조건:** 3단계 완료 (해설 화면이 있어야 오답노트를 붙일 수 있음)

### GAP-11. 오답노트 저장/불러오기/제출

📋 TODO:
- [ ] `error-note.js`를 V3 테이블 구조에 맞게 수정
  - 실전풀이 탭 → `error_note_text` + `error_note_submitted`
  - 다시풀기 탭 → `current_error_note_text`
- [ ] 자동저장(localStorage) → 최종제출(DB)
- [ ] 해설 화면 탭 전환 시 메모장 내용 교체

---

### GAP-A. 마감 체크 + 배너 표시

**현황:** `isTaskDeadlinePassed()`는 `task-router.js`에 이미 구현됨. 대시보드 배너 표시 로직 있음.

📋 TODO:
- [ ] 대시보드 진입 시 마감 체크 → 배너 표시 연동 확인 (이미 구현됨, 테스트 필요)
- [ ] 마감 지난 과제의 저장 방식 결정 (current_record만? 인증률 미반영?)

---

### GAP-B. 인증률 계산

**현황:** `progress-tracker.js`에 `loadAuthRecords()` 존재, V1 테이블 `tr_auth_records` 조회.

📋 TODO:
- [ ] V3 인증률 계산 로직 결정 (V3 테이블 구조에 맞게)
- [ ] `progress-tracker.js` 또는 별도 파일에서 V3 테이블 기반 인증률 계산

---

### GAP-C. 스피킹 파일 첨부 (후순위)

**현황:** v3-design-spec.md에 따르면 스피킹 녹음 파일 별도 제출은 없음 (§2-3-2).

📋 TODO:
- [ ] 현재 사양에서는 불필요 — 추후 요구사항 변경 시 재검토

---

## 요약: 전체 파일 액션 목록

### ✅ 1단계 완료 파일

| 파일 | 작업 |
|------|------|
| `index.html` | V2 script 12개 주석, startFullTest 제거, task-dashboard.js 추가 |
| `js/main.js` | V1 데드코드 삭제 (41KB → 10KB) |
| `js/app-state.js` | `data.js`에서 파일명 변경 + V1 데이터 삭제 (29KB → 0.7KB) |
| `js/navigation.js` | V1/V2 잔재 삭제 |
| `js/task-dashboard.js` | 신규 — 대시보드 제어 + V3 DB 연결 |
| `js/task-router.js` | 4섹션 대시보드 라우팅 추가 |
| `js/supabase-client.js` | V3 CRUD 함수 4개 추가 |

### ✅ 2단계 완료 파일 (리딩)

| 파일 | 작업 |
|------|------|
| `js/reading/reading-module-controller.js` | ✅ 신규 — 리딩 7세트 순서 제어 + 저장 |
| `js/reading/academic-loader.js` | ✅ 수정 — questionType DB 태그 읽기, 구분자 처리, 하이라이트 클래스 통일 |
| `js/task-router.js` | ✅ 리딩 함수 220줄 삭제 + 시작 팝업 문구 변경 |
| `index.html` | ✅ 리딩 컨트롤러 script 추가, supabase-client 로드 순서 조정, 2차 뱃지 제거 |

### 📝 2단계 예정 (나머지 모듈 컨트롤러 + 결과 저장)

| 파일 | 작업 |
|------|------|
| `js/listening/listening-module-controller.js` | 신규 — 리스닝 9세트 순서 제어 + 저장 |
| `js/writing/writing-module-controller.js` | 신규 — 라이팅 3유형 순서 제어 + 저장 |
| `js/speaking/speaking-module-controller.js` | 신규 — 스피킹 자동 시퀀스 + 저장 |
| `index.html` | 나머지 모듈 컨트롤러 script 태그 추가 |

### 📝 3단계 예정 (해설 / 점수 / 진도)

| 파일 | 작업 |
|------|------|
| `js/explain-viewer.js` | 신규 — 해설 화면 제어 |
| `js/task-dashboard.js` | 채점 점수 상세 렌더링 확장 |
| `js/progress-tracker.js` | V3 조회 함수로 교체 |

### 📝 4단계 예정 (부가 기능)

| 파일 | 작업 |
|------|------|
| `js/error-note.js` | V3 테이블 구조 대응 |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-03-06 | 초판 작성 — 전체 14개 빈 구간 식별, 코드/자연어 이중 설명, 근본 해결 제안 |
| 2026-03-06 | 톤 수정 — V2 파일 이동은 리팩토링의 의도적 결과임을 반영, 0단계 재작성 |
| 2026-03-06 | 1단계 완료 반영 — GAP-1,2,4,5,7,8 해결, 데드코드 정리, 발견 이슈 7건 기록 |
| 2026-03-07 | **단계 재정렬** — 실제 의존 관계에 맞게 순서 변경: 2단계=모듈 컨트롤러+저장, 3단계=해설/점수/진도, 4단계=부가기능. GAP 번호는 유지하되 배치만 변경. |
| 2026-03-07 | **2-A 리딩 모듈 컨트롤러 완료** — reading-module-controller.js 생성, academic-loader.js questionType 수정, task-router.js 리딩 코드 삭제(220줄), index.html 정리(script 순서/2차뱃지/팝업). F-1, F-2 해결. 2-PRE(study_results_v3 테이블 생성) 항목 추가 — DB 저장 테스트는 테이블 생성 후 진행. |
