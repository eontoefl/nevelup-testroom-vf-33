# 입문서 과제 시스템 설계서

> 최종 업데이트: 2026-03-19
> 상태: 설계 확정 — 구현 대기

---

## 1. 전체 플로우

```
TaskListScreen에서 "입문서 정독 2/3" 클릭
  → 안내 팝업 표시 (동적 생성)
  → [시작하기] 클릭
  → book.html 진입 (URL 파라미터로 일차 정보 전달)
  → 상단에 메모 진행 상태 바 표시
  → 읽으면서 메모 작성
  → 누적 메모 기준 충족 시 자동 인증 (study_results_v3 저장)
  → 뒤로가기 → TaskListScreen 복귀
```

---

## 2. 스케줄 구조

| 프로그램 | 일수 | 과제명 | 일차별 누적 메모 기준 |
|---|---|---|---|
| Fast | 3일 | 입문서 정독 1/3, 2/3, 3/3 | 1일차: 2개, 2일차: 4개, 3일차: 6개 |
| Standard | 6일 | 입문서 정독 1/6 ~ 6/6 | 1일차: 2개, 2일차: 4개, ... 6일차: 12개 |

공식: **일차(current) × 2 = 누적 메모 기준**

기존 schedule-data.js의 과제명("입문서 정독 1/3" 등)은 변경 없음.

---

## 3. 안내 팝업

### 3-1. 표시 시점
TaskListScreen에서 입문서 과제 클릭 시, book.html 진입 전에 표시.

### 3-2. 구현 방식
기존 `confirmTaskStart()` 함수와 동일하게 **동적으로 DOM 생성**. 별도 HTML 불필요.

### 3-3. 일반 문구 (미인증 상태)
```
📖 입문서 정독 (2/3일차)

오늘 과제 인증을 위해 메모 2개를 작성해주세요.

입문서는 3일에 걸쳐 완독하는 과제입니다.
메모만 남기고 끝이 아니니, 틈틈이 꼼꼼히 읽어주세요!

[시작하기]
```

### 3-4. 동적 요소
- "2/3일차" → parseTaskName()의 current/total 값
- "메모 2개" → 오늘 기준(current × 2) - 현재 누적 메모 수 = 남은 메모 수
- "3일" → total 값 (Fast: 3, Standard: 6)

### 3-5. 이미 인증 완료 상태일 때
```
📖 입문서 정독 (2/3일차)

✅ 오늘 과제는 이미 인증되었습니다.
계속 읽으시겠습니까?

[계속 읽기]
```
인증 여부는 팝업 표시 전에 `getStudyResultV3()` 호출로 확인.

### 3-6. Fast/Standard 구분
`currentUser.programType` 값으로 구분 ('fast' 또는 'standard').
이 값은 sessionStorage의 currentUser 객체에 저장되어 있음.

---

## 4. book.html 진입 시 데이터 전달

### 4-1. URL 파라미터
```
book.html?current=2&total=3&week=1&day=월
```

| 파라미터 | 설명 | 예시 |
|---|---|---|
| current | 몇 일차 | 2 |
| total | 전체 일수 | 3 (Fast) 또는 6 (Standard) |
| week | 주차 | 1 |
| day | 요일 | 월 |

### 4-2. 파라미터 출처
- current, total: parseTaskName("입문서 정독 2/3")의 반환값
- week, day: window.currentTest의 currentWeek, currentDay

---

## 5. book.html 내 상태 바

### 5-1. 위치
진행률 바(progress bar) 바로 아래, 얇고 은은하게.

### 5-2. 표시 형태
- 미완료: `📝 오늘 메모 0/2`
- 진행중: `📝 오늘 메모 1/2`
- 완료: `✅ 오늘 과제 인증 완료`

### 5-3. 동작
- 메모 저장/삭제 시 실시간 갱신
- "오늘 필요한 메모 수"는 URL 파라미터 current × 2 에서 현재 누적 메모 수를 뺀 값
- 인증 완료 이후에도 메모 추가/수정/삭제 자유롭게 가능
- 인증 후 메모를 삭제해도 상태 바는 바뀔 수 있지만, 인증 자체는 유지됨

---

## 6. 인증 판정 로직

### 6-1. 조건
`tr_book_memos`에서 해당 유저·해당 책의 총 메모 수 ≥ current × 2

### 6-2. 타이밍
메모 저장(saveMemo) 성공 직후 메모 수 체크.

### 6-3. 인증 처리
1. 조건 충족 확인
2. 이미 인증됐는지 확인 (중복 저장 방지)
3. `upsertInitialRecord()` 호출하여 study_results_v3에 저장:
   - user_id: 현재 유저
   - section_type: 'intro-book'
   - module_number: current (일차 번호, 1/2/3 각각 별도 레코드)
   - week: URL 파라미터의 week
   - day: URL 파라미터의 day
   - initial_record: { memo_count: N, completedAt: timestamp }
   - locked_auth_rate: 100
4. 토스트 메시지: "🎉 오늘 과제가 인증되었습니다!"
5. 상태 바 → "✅ 오늘 과제 인증 완료"로 변경

### 6-4. 불변 원칙
한번 인증되면 영구 유지. 이후 메모 삭제해도 locked_auth_rate: 100은 변하지 않음.
upsertInitialRecord()는 이미 initial_record가 있으면 덮어쓰지 않는 안전장치가 내장되어 있음.

---

## 7. 메모 규칙

- 최소 글자수 제한: 없음 (추후 fraud 발생 시 추가 검토)
- 페이지당 메모 1개 (기존 tr_book_memos unique 제약 유지)
- 메모 저장/수정/삭제 자유
- 인증 이후에도 메모 기능 정상 사용 가능

---

## 8. 마감 처리

- 기존 `isTaskDeadlinePassed()` 로직 그대로 적용
- 마감 전: book.html에서 메모 기준 충족 시 `upsertInitialRecord()` + `locked_auth_rate: 100`
- 마감 후: 입문서 열람 및 메모 작성은 가능하지만, 인증률에는 반영되지 않음
  - 안내 팝업에서 마감 경고 표시 (기존 마감 정책과 동일)
  - book.html 진입은 허용하되, 인증 저장 로직을 실행하지 않음

---

## 9. 인증률 표시 (기존 시스템 연동)

별도 컬럼이나 테이블 추가 불필요. 기존 인프라 그대로 활용.

- mypage.js: locked_auth_rate 읽어서 인증률 계산 → 수정 불필요
- 잔디(출석표): section_type='intro-book' + initial_record 존재 여부로 색칠 → 수정 불필요
- 일차별 별도 레코드(module_number 1, 2, 3 등)이므로 잔디에 각 일차가 개별 반영됨

---

## 10. 기존 코드 삭제 대상

| 파일 | 삭제 내용 |
|---|---|
| index.html (2209~2247행) | introBookModal 팝업 HTML 전체 (PDF 링크, 메모칸, 제출 버튼) |
| task-router.js | openIntroBookModal() 함수 |
| task-router.js | closeIntroBookModal() 함수 |
| task-router.js | submitIntroBook() 함수 |

---

## 11. 수정 대상 파일

| 파일 | 수정 내용 |
|---|---|
| task-router.js | _executeTaskCore()에서 'intro-book' 분기 → 안내 팝업 동적 생성 + book.html 이동 |
| book.html | 상태 바 HTML 추가 |
| book-viewer.css | 상태 바 스타일 추가 |
| book-viewer.js | URL 파라미터 파싱, 메모 카운트 로직, 인증 판정 + study_results_v3 upsert, 상태 바 업데이트 |

---

## 12. 참조 파일 위치

| 파일 | 역할 |
|---|---|
| js/schedule-data.js | 스케줄 데이터 (과제명 정의) |
| js/task-router.js | 과제 클릭 → 분기 처리 |
| js/task-dashboard.js | 4섹션 과제 대시보드 |
| js/supabase-client.js | DB 연결 + upsertInitialRecord 등 공통 함수 |
| js/auth.js | 로그인 + currentUser (programType 포함) |
| js/book-viewer.js | PDF 뷰어 핵심 로직 |
| book.html | PDF 뷰어 HTML |
| css/book-viewer.css | PDF 뷰어 스타일 |
| js/mypage.js | 인증률 계산 + 잔디 표시 |
| docs/book-viewer-db-schema.sql | tr_book_documents, tr_book_progress, tr_book_memos 스키마 |
| docs/v3-design-spec.md | study_results_v3 스키마 + 인증률 로직 |
