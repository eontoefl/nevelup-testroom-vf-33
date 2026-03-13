# Speaky V3 — TOEFL 학습 웹앱

TOEFL 4개 영역(Reading, Listening, Writing, Speaking) 학습 및 해설 뷰어를 제공하는 정적 웹 애플리케이션입니다.

**배포 URL**: https://testroom.eonfl.com  
**호스팅**: GitHub Pages (CNAME: `testroom.eonfl.com`)  
**백엔드**: Supabase (인증, DB, Storage)

---

## 기술 스택

- **프론트엔드**: 순수 HTML / CSS / JavaScript (프레임워크 없음)
- **DB / 인증**: Supabase (REST API 직접 호출)
- **배포**: GitHub Pages (정적 파일 서빙)
- **빌드 도구**: 없음 (빌드 과정 없이 파일 직접 서빙)

---

## 폴더 구조

```
/
├── index.html              # 메인 SPA (로그인, 대시보드, 학습, 해설 등 모든 화면)
├── dashboard.html          # 대시보드 (별도 페이지)
├── mypage.html             # 마이페이지
├── v2-records.html         # V2 기록 조회
├── CNAME                   # GitHub Pages 커스텀 도메인
│
├── docs/                   # 설계 문서
│   ├── v3-design-spec.md   # V3 전체 설계 명세서
│   ├── v3-flow-spec.md     # V3 문제 플로우 설계서
│   └── v3-gap-analysis.md  # V3 빈 구간 분석 보고서
│
├── css/                    # 스타일시트
│   ├── style.css           # 공통 스타일 + CSS 변수 정의
│   ├── task-dashboard.css  # 대시보드 스타일
│   ├── explain-viewer.css  # 해설 뷰어 스타일
│   ├── error-note.css      # 오답노트 스타일
│   └── (유형별-result.css) # 각 문제 유형별 결과 화면 스타일
│
└── js/                     # JavaScript
    ├── supabase-client.js  # Supabase REST API 클라이언트
    ├── auth.js             # 인증 (로그인/로그아웃)
    ├── main.js             # 화면 전환 (showScreen)
    ├── task-dashboard.js   # 대시보드 + 해설 진입점
    ├── explain-viewer.js   # 해설 뷰어 (뎁스 방식)
    ├── error-note.js       # 오답노트 (우측 메모 패널)
    ├── admin-skip.js       # 관리자 전용 오디오/타이머 Skip
    ├── timer.js            # 학습 타이머
    ├── error-reporter.js   # 콘솔 에러 래핑
    │
    ├── reading/            # 리딩 영역
    │   ├── *-loader.js     # 문제 데이터 로드 (Supabase)
    │   ├── *-component.js  # 풀이 UI 컴포넌트
    │   ├── *-result.js     # 해설(결과) 화면 렌더링
    │   └── reading-module-controller.js  # 모듈 진행 제어 + DB 저장
    │
    ├── listening/          # 리스닝 영역 (reading과 동일 패턴)
    │   ├── *-loader.js
    │   ├── *-component.js
    │   ├── *-result.js
    │   └── listening-module-controller.js
    │
    ├── writing/            # 라이팅 영역
    │   ├── *-loader.js
    │   ├── *Component.js   # Arrange, Email, Discussion
    │   ├── *-result.js
    │   └── writing-module-controller.js
    │
    └── speaking/           # 스피킹 영역
        ├── *-loader.js
        ├── RepeatComponent.js    # 따라말하기
        ├── InterviewComponent.js # 인터뷰
        ├── *-result.js
        ├── audio-player.js       # AudioContext 기반 재생 엔진
        └── speaking-module-controller.js
```

---

## 각 영역의 문제 유형

| 영역 | 유형 | loader | component | result |
|---|---|---|---|---|
| Reading | Fill-in-the-Blanks, Daily1, Daily2, Academic | O | O | O |
| Listening | Response, Conversation, Announcement, Lecture | O | O | O |
| Writing | Arrange, Email, Discussion | O | O | O |
| Speaking | Repeat, Interview | O | O | O |

---

## 핵심 데이터 흐름

```
문제 풀이:  loader → component → module-controller → DB 저장 (initial_record / current_record)
해설 보기:  task-dashboard → explain-viewer → DB 조회 → _extractData → show*Result 함수 → 해설 화면
```

- **initial_record**: 실전풀이 결과
- **current_record**: 다시풀기 결과
- DB 테이블: `study_results_v3`

---

## 해설 뷰어 구조 (V3 뎁스 방식)

```
대시보드 → [해설 보기] → 선택 화면 (실전풀이 / 다시풀기) → 해설 콘텐츠 (빨간 그릇들)
                                    ← 뒤로가기 ←                    ← 뒤로가기 ←
```

- **선택 화면**: DB 조회 후 initial_record/current_record 유무에 따라 버튼 활성/비활성
- **해설 콘텐츠**: 유형별 "빨간 그릇"(explainScreen)을 이전/다음으로 전환
- **오답노트**: 우측 메모 패널, 선택한 버튼에 따라 실전풀이용/다시풀기용 자동 결정

---

## CSS 테마 색상

```css
--primary-color: #9480c5;   /* 시그니처 (보라) */
--success-color: #77bf7e;   /* 강조 (초록) */
--bg-color: #f4f5fe;        /* 배경 */
--surface-color: #ffffff;   /* 카드/패널 */
--text-primary: #1e293b;    /* 본문 텍스트 */
--text-secondary: #64748b;  /* 보조 텍스트 */
--border-color: #e2e8f0;    /* 테두리 */
```

---

## 설계 문서

| 문서 | 내용 |
|---|---|
| `docs/v3-design-spec.md` | V3 전체 설계 명세 — 화면 구성, DB 구조, 컴포넌트 역할 |
| `docs/v3-flow-spec.md` | V3 문제 플로우 설계 — 각 유형별 풀이 진행 순서 |
| `docs/v3-gap-analysis.md` | V3 빈 구간 분석 — 설계 대비 미구현 항목 목록 |

---

## 개발 규칙

- **브랜치**: `genspark_ai_developer` → `main` PR 방식
- **커밋**: 모든 코드 수정 후 즉시 커밋 + PR 생성/업데이트
- **이슈 발견 시**: 중단 후 보고, 혼자 판단으로 수정 금지
- **설명**: 코드 용어 없이 쉽게 설명, 근본적 해결책 제시
- **관리자 계정**: `test@me.com` (admin-skip 기능 활성화)
