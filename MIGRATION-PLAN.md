# Reading Result CSS/JS Migration Plan

## Goal
daily1, daily2, academic 세 리딩 결과 화면을 하나의 통일된 디자인으로 통합한다.
- CSS 파일 3개 → `css/reading-result.css` 1개
- JS 파일 3개의 HTML 생성 구조를 통일
- 클래스명 prefix를 `rd-`로 통일

## Design Reference (기준 파일)
`/home/user/uploaded_files/daily1, daily2, academic 해설.txt`

이 파일이 최종 디자인의 **유일한 기준**이다.
CSS와 HTML 구조 모두 이 파일에서 추출한다.

---

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
- Line 696-730: `#daily1ExplainScreen`
- Line 731-765: `#daily2ExplainScreen`
- Line 766-800: `#academicExplainScreen`
- Line 2278, 2282, 2286: 3개 JS script tags

---

## Design Reference Structure (기준 파일에서 추출)

### HTML 구조 (JS가 생성해야 하는 것)

#### 세트 섹션
```html
<div class="result-set-section">
  <h3 class="result-section-title">
    <i class="fas fa-book-open"></i> Set 1: 지문 제목
  </h3>
  <div class="rd-passage-panel">...</div>
  <!-- 문제 카드들 -->
</div>
```

#### 지문 패널
```html
<div class="rd-passage-panel">
  <h4 class="result-passage-title">지문 제목</h4>
  <div class="sentence-translations">
    <div class="sentence-pair">
      <div class="sentence-original">
        원문 (<span class="interactive-word" data-translation="..." data-explanation="...">단어</span>)
      </div>
      <div class="sentence-translation">번역</div>
    </div>
  </div>
</div>
```

#### 문제 카드
```html
<div class="rd-result-item correct|incorrect">
  <div class="rd-result-icon"><i class="fas fa-check-circle|fa-times-circle"></i></div>
  <div class="rd-result-content">
    <div class="rd-question-text">
      <strong>1.</strong> 문제 텍스트
    </div>
    <div class="question-translation">
      <i class="fas fa-comment-dots"></i> 문제 해석: 번역
    </div>
    <div class="rd-answer-row">
      <span class="rd-answer-label">✓|✗ 내 답변:</span>
      <span class="rd-answer-value correct|incorrect">A) 답변</span>
    </div>
    <!-- 오답인 경우만 -->
    <div class="rd-answer-row">
      <span class="rd-answer-label">✓ 정답:</span>
      <span class="rd-answer-value correct">A) 정답</span>
    </div>
    <!-- 보기 해설 아코디언 -->
  </div>
</div>
```

#### 보기 해설 아코디언
```html
<div class="options-explanation-container">
  <button class="btn-toggle-options" onclick="toggle...('{id}')">
    <span class="toggle-text">보기 상세 해설 펼치기</span>
    <i class="fas fa-chevron-down"></i>
  </button>
  <div id="{id}" class="options-explanation-content" style="display: none;">
    <div class="option-item">
      <div class="option-header">
        <span class="option-label">A)</span>
        <span class="option-text">보기 텍스트</span>
        <span class="option-badge correct-badge|incorrect-badge">✓ 정답 | ✗ 내가 선택한 오답</span>
      </div>
      <div class="option-translation">번역</div>
      <div class="option-explanation correct|incorrect">
        <strong>정답 이유:|오답 이유:</strong><br>설명
      </div>
    </div>
  </div>
</div>
```

---

## Migration Strategy

### Phase 1: CSS 추출 — `css/reading-result.css` 생성
기준 파일의 CSS를 그대로 추출하되:
- `daily1-` prefix → `rd-` prefix로 변경
- `#daily1ExplainScreen` 스코핑 → 3개 화면 공통 스코핑
- 기준 파일의 CSS 변수(`--signature-purple` 등) 유지

### Phase 2: JS 3개 파일 새로 작성
기준 파일의 HTML 구조를 기준으로 JS의 render 함수들을 **새로 작성**한다.
기존 파일의 코드를 치환하는 것이 아니라, 기준 파일의 구조를 보고 작성한다.

#### 각 JS 파일이 유지해야 하는 고유 로직
| 항목 | daily1 | daily2 | academic |
|------|--------|--------|----------|
| splitToMatchTranslations | 기본 버전 | `_d2` 버전 | `_ac` 버전 (<<>> 제거 + (A) 병합) |
| 결과 타이틀 형식 | `Week N - 요일` | `Week N, 요일 - 일상리딩2` | `Week N, 요일 - 아카데믹리딩` |
| userAnswer 처리 | getLabelFromIndex | options[index-1] 직접 접근 | 문자열→숫자 변환 후 접근 |
| contentRaw 사용 | 없음 | 없음 | `contentRaw \|\| content` |
| options label 존재 체크 | `options[0].label` 있으면/없으면 분기 | 항상 label 있음 | 항상 label 있음 |

#### 공통 HTML 구조 (3개 파일 모두 동일하게 생성)
위 "Design Reference Structure" 섹션의 HTML 구조를 그대로 따른다.
클래스명은 모두 `rd-` prefix를 사용한다.

### Phase 3: index.html 수정
- CSS link 3개 → `css/reading-result.css` 1개로 교체
- JS script 태그는 변경 없음

### Phase 4: 검증 + 정리
- `validate-migration.sh` 실행
- 구 CSS 파일 3개 삭제
- 커밋 + PR

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

### Window Function Names
```
window.showDaily1Results, window.showDaily2Results, window.showAcademicResults
window.toggleDaily1Options, window.toggleDaily2Options, window.toggleAcademicOptions
window.switchDaily1Tab
window.renderDaily1SetResult, window.renderDaily2SetResult, window.renderAcademicSetResult
window.renderDaily1Answers, window.renderDaily2Answers, window.renderAcademicAnswers
window.renderDaily1OptionsExplanation, window.renderDaily2OptionsExplanation, window.renderAcademicOptionsExplanation
window.bindDaily1ToggleEvents, window.bindDaily2ToggleEvents, window.bindAcademicToggleEvents
```

### splitToMatchTranslations 함수
3개 모두 로직이 다르므로 각각 유지.

### 다른 화면의 클래스
`academic-summary`, `academic-stats`, `academic-stat-box` → lectureExplainScreen 전용 (대상 아님)

---

## Execution Order

1. 기준 파일에서 CSS 추출 → `css/reading-result.css` 생성 (`rd-` prefix)
2. JS 3개 파일을 기준 파일의 HTML 구조로 새로 작성 (고유 로직 유지)
3. index.html CSS link 교체
4. `validate-migration.sh` 실행 → 검증
5. 구 CSS 파일 3개 삭제
6. 커밋 + PR

---

## Conversation Resumption

대화가 압축/초기화된 경우:
```
MIGRATION-PLAN.md 읽고 이어서 작업해.
기준 파일: /home/user/uploaded_files/daily1, daily2, academic 해설.txt
현재 단계: [Phase N]
```
