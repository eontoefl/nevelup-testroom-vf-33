# Reading Result CSS/JS Prefix Migration Plan

## Goal
daily1, daily2, academic 세 리딩 결과 화면의 CSS prefix를 `rd-`로 통일하고,
CSS 파일 3개를 `css/reading-result.css` 1개로 합친다.

## Current State (AS-IS)

### Files
| File | Lines | Role |
|------|-------|------|
| `css/reading-daily1-result.css` | 569 | daily1 전용 CSS |
| `css/reading-daily2-result.css` | 435 | daily2 전용 CSS |
| `css/reading-academic-result.css` | 434 | academic 전용 CSS |
| `js/reading/daily1-result.js` | 329 | daily1 결과 렌더링 |
| `js/reading/daily2-result.js` | 293 | daily2 결과 렌더링 |
| `js/reading/academic-result.js` | 332 | academic 결과 렌더링 |

### HTML (index.html)
- Line 17-19: 3개 CSS link tags
- Line 696-730: `#daily1ExplainScreen` (HTML 구조)
- Line 731-765: `#daily2ExplainScreen` (HTML 구조)
- Line 766-800: `#academicExplainScreen` (HTML 구조)
- Line 2278: `<script src="js/reading/daily1-result.js">`
- Line 2282: `<script src="js/reading/daily2-result.js">`
- Line 2286: `<script src="js/reading/academic-result.js">`

### HTML Structure (3개 모두 동일)
```html
<div id="{screen}ExplainScreen" style="display:none">
  <div class="test-content">
    <div class="result-container">
      <div class="result-header">
        <h2 id="{prefix}ResultDayTitle">...</h2>
        <div class="result-summary">
          <div class="result-score-card">...</div>
          <div class="result-stats">
            <div class="stat-item">정답</div>
            <div class="stat-item">오답</div>
            <div class="stat-item">전체</div>
          </div>
        </div>
      </div>
      <div class="result-details" id="{prefix}ResultDetails"></div>
    </div>
  </div>
</div>
```

---

## Structure Differences (CRITICAL)

### daily1 vs daily2/academic: JS HTML 생성 구조 차이

#### 1. 문제 카드 (Result Item)
| Part | daily1 | daily2 & academic |
|------|--------|-------------------|
| 문제카드 | `<div class="daily1-result-item">` + `<div class="daily1-result-icon">` + `<div class="daily1-result-content">` | `<div class="daily2/academic-result-item">` + `<div class="question-header">` + `<div class="question-text">` |
| 문제번호 | `<strong>1.</strong>` inside daily1-question-text | `<span class="question-number">1</span>` |
| 정/오답 아이콘 | `daily1-result-icon` (별도 div) | `<span class="result-status">` inside question-header |
| 답변 영역 wrapper | 없음 (바로 answer-row) | `<div class="answer-summary">` |

#### 2. 지문 패널 (Passage Panel)
| Part | daily1 | daily2 & academic |
|------|--------|-------------------|
| 지문 wrapper | `<div class="daily1-passage-panel-result">` | `<div class="passage-section">` |
| 지문 제목 | `<h4 class="result-passage-title">` | `<h4 class="passage-title">` |
| 내용 wrapper | `<div class="sentence-translations">` | `<div class="passage-content-bilingual">` |
| 문제 wrapper | 없음 (답안이 바로 나옴) | `<div class="questions-section">` |

#### 3. 보기 해설 아코디언 (Options Explanation)
| Part | daily1 | daily2 & academic |
|------|--------|-------------------|
| 컨테이너 | `.options-explanation-container` | `.options-explanation-section` |
| 토글 버튼 | `.btn-toggle-options` | `.toggle-explanation-btn` |
| 내용 wrapper | `.options-explanation-content` | `.options-details` |
| 보기 아이템 | `.option-item` → `.option-header` + `.option-label` + `.option-text` | `.option-detail` → `.option-text` (label 포함) |

#### 4. CSS 디자인 차이
| Part | daily1 | daily2 & academic |
|------|--------|-------------------|
| 전체 테마 | 커스텀 CSS 변수 (`--d1-*`) | 글로벌 CSS 변수 (`--text-primary`, etc.) |
| 문제카드 레이아웃 | flex (아이콘 + 컨텐츠 나란히) | 단일 컬럼 (아이콘 숨김) |
| 정답/오답 카드 배경 | 모두 흰색 | 정답=초록 배경, 오답=빨간 배경 |
| 문제 해석 | 회색 배경 박스 | 화살표(→) prefix |
| 문장 번역 | prefix 없음 | 화살표(→) prefix |
| 답변값 스타일 | 텍스트만 (배경 없음) | pill 형태 (배경+테두리) |

---

## Migration Strategy (TO-BE)

### New Unified Prefix: `rd-`

#### Phase 1: JS Class Name Replacement

**daily1-result.js** - 변경할 클래스명:
```
daily1-passage-panel-result  → rd-passage-panel
daily1-result-item           → rd-result-item
daily1-result-icon           → rd-result-icon
daily1-result-content        → rd-result-content
daily1-question-text         → rd-question-text
daily1-answer-row            → rd-answer-row
daily1-answer-label          → rd-answer-label
daily1-answer-value          → rd-answer-value
daily1-tooltip               → rd-tooltip
daily1-options-{id}          → rd-options-{id}  (toggle ID prefix)
daily1-original-{id}         → rd-original-{id}  (tab pane ID)
daily1-translation-{id}      → rd-translation-{id}  (tab pane ID)
```

**daily2-result.js** - 변경할 클래스명:
```
daily2-result-item           → rd-result-item
daily2-answer-row            → rd-answer-row
daily2-answer-label          → rd-answer-label
daily2-answer-value          → rd-answer-value
daily2-tooltip               → rd-tooltip
daily2-toggle-{id}           → rd-toggle-{id}  (toggle ID prefix)
```

**academic-result.js** - 변경할 클래스명:
```
academic-result-item         → rd-result-item
academic-answer-row          → rd-answer-row
academic-answer-label        → rd-answer-label
academic-answer-value        → rd-answer-value
academic-tooltip             → rd-tooltip
academic-toggle-{id}         → rd-toggle-{id}  (toggle ID prefix)
```

#### Phase 2: HTML Structure Unification

daily1의 HTML 생성 구조를 daily2/academic과 통일한다.
(daily2/academic 구조가 더 간결하므로 이쪽을 기준으로 한다)

**daily1의 renderDaily1Answers 변경 사항:**
- `<div class="daily1-result-icon">` → `<span class="result-status">` inside question-header
- `<div class="daily1-result-content">` → 제거 (불필요한 wrapper)
- `<div class="daily1-question-text"><strong>N.</strong>` → `<div class="question-header"><span class="question-number">N</span>`
- answer-row를 `<div class="answer-summary">` 안으로 이동

**daily1의 renderDaily1OptionsExplanation 변경 사항:**
- `.options-explanation-container` → `.options-explanation-section`
- `.btn-toggle-options` → `.toggle-explanation-btn`
- `.options-explanation-content` → `.options-details`
- `.option-item` → `.option-detail`
- `.option-header` + `.option-label` + `.option-text` → `.option-text` (label 통합)

**daily1의 renderDaily1SetResult 변경 사항:**
- `.daily1-passage-panel-result` → `.passage-section`
- `.result-passage-title` → `.passage-title`
- `.sentence-translations` → `.passage-content-bilingual`
- `<div class="questions-section">` wrapper 추가

#### Phase 3: CSS Consolidation

새 파일 `css/reading-result.css` 생성:
- daily2/academic 디자인을 기준으로 통합 (daily1도 동일한 디자인 적용)
- `rd-` prefix 사용
- 화면별 스코핑: `#daily1ExplainScreen`, `#daily2ExplainScreen`, `#academicExplainScreen` 에 공통 padding 적용
- 글로벌 CSS 변수 사용 (`--text-primary`, `--primary-color`, etc.)

#### Phase 4: index.html Updates
- 3개 CSS link → 1개로 교체
- JS script 태그는 변경 없음 (파일명 유지)

---

## Must NOT Change (Immutable)

### HTML Element IDs (index.html에 하드코딩됨)
```
daily1ExplainScreen, daily2ExplainScreen, academicExplainScreen
daily1ResultDayTitle, daily2ResultDayTitle, academicResultDayTitle
daily1ResultScoreValue, daily2ResultScoreValue, academicResultScoreValue
daily1ResultCorrectCount, daily2ResultCorrectCount, academicResultCorrectCount
daily1ResultIncorrectCount, daily2ResultIncorrectCount, academicResultIncorrectCount
daily1ResultTotalCount, daily2ResultTotalCount, academicResultTotalCount
daily1ResultDetails, daily2ResultDetails, academicResultDetails
```

### Window Function Names (explain-viewer.js의 RESULT_TYPE_MAP에서 참조)
```
window.showDaily1Results
window.showDaily2Results
window.showAcademicResults
```

### Toggle Function Names (JS에서 onclick HTML을 생성)
```
window.toggleDaily1Options (daily1-result.js 내부에서 생성하는 onclick에서 호출)
window.toggleDaily2Options (daily2-result.js 내부에서 생성하는 onclick에서 호출)
window.toggleAcademicOptions (academic-result.js 내부에서 생성하는 onclick에서 호출)
```

### Tab Function Names (daily1 전용)
```
window.switchDaily1Tab (daily1-result.js에서 onclick HTML 생성)
```

### splitToMatchTranslations Functions
3개 모두 로직이 약간 다르므로 각각 유지:
- `splitToMatchTranslations` (daily1 - 기본)
- `splitToMatchTranslations_d2` (daily2)
- `splitToMatchTranslations_ac` (academic - `<<>>` 제거 + `(A)` 병합 로직)

### Other Screens Using Same Class Names
`academic-summary`, `academic-stats`, `academic-stat-box` → lectureExplainScreen 전용 (이번 마이그레이션 대상 아님)

---

## Validation Checklist

### Pre-migration
- [ ] 기존 3개 CSS/JS의 모든 클래스명 전수 추출
- [ ] `rd-` prefix 매핑 테이블 완성

### Post-migration: Automated (validate-migration.sh)
- [ ] JS에서 사용하는 모든 `rd-` 클래스가 CSS에 정의되어 있는지 확인
- [ ] JS에서 `daily1-`, `daily2-`, `academic-` prefix가 하나도 남아있지 않은지 확인
- [ ] CSS에서 `daily1-`, `daily2-`, `academic-` prefix가 하나도 남아있지 않은지 확인
- [ ] 구 CSS 파일 3개가 삭제 대상으로 표시되었는지 확인
- [ ] 신규 CSS 파일 `css/reading-result.css`가 존재하는지 확인
- [ ] index.html에서 구 CSS link 3개가 제거되고 신규 1개가 추가되었는지 확인
- [ ] window function exports가 모두 존재하는지 확인
- [ ] HTML element ID 참조가 모두 유효한지 확인

### Post-migration: Manual (브라우저 확인)
- [ ] daily1 결과 화면: 점수 카드 높이 일치
- [ ] daily1 결과 화면: 지문 + 번역 표시
- [ ] daily1 결과 화면: 문제 정답/오답 표시
- [ ] daily1 결과 화면: 보기 상세 해설 펼치기/접기
- [ ] daily1 결과 화면: 인터랙티브 단어 툴팁
- [ ] daily2 결과 화면: 동일 항목 전체 확인
- [ ] academic 결과 화면: 동일 항목 전체 확인
- [ ] 반응형(768px 이하) 레이아웃 확인
- [ ] 다른 화면(fillblanks, response, conver 등)에 영향 없는지 확인

---

## Execution Order

1. **validate-migration.sh 먼저 실행** → 현재 상태의 baseline 기록
2. **JS 수정**: daily1-result.js 구조 통일 + 3개 파일 prefix 변경
3. **CSS 통합**: reading-result.css 생성 (daily2/academic 디자인 기준)
4. **index.html 수정**: CSS link 교체
5. **validate-migration.sh 다시 실행** → 마이그레이션 완료 검증
6. **수동 브라우저 테스트**
7. **구 CSS 파일 삭제**: reading-daily1-result.css, reading-daily2-result.css, reading-academic-result.css
8. **최종 커밋 + PR**

---

## Conversation Resumption

대화가 압축/초기화된 경우:
```
MIGRATION-PLAN.md 읽고 이어서 작업해.
현재 단계: [Phase N] / [Step M]
```
