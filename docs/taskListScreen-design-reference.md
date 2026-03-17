# TaskListScreen 디자인 레퍼런스 (CSS AI용)

> 이 문서는 `#taskListScreen` 화면의 디자인을 변경하기 위해 필요한 모든 정보를 담고 있습니다.
> HTML 구조, 동적 생성 로직, 현재 적용 CSS, CSS 변수, 반응형 규칙을 포함합니다.

---

## 1. 프로젝트 CSS 변수 (전역)

```css
:root {
    --primary-color: #9480c5;
    --secondary-color: #b9c9da;
    --success-color: #77bf7e;
    --danger-color: #ef4444;
    --warning-color: #f59e0b;
    --bg-color: #f4f5fe;
    --surface-color: #ffffff;
    --text-primary: #1e293b;
    --text-secondary: #64748b;
    --border-color: #e2e8f0;
    --shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.1);
}
```

**폰트**: `'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`

**시그니처 색상**: 보라 `#9480c5`, 초록 `#77bf7e`, 서브 `#b9c9da`

---

## 2. HTML 구조 (index.html에 있는 정적 마크업)

```html
<div id="taskListScreen" class="screen" style="display:none;">
    <!-- 상단 네비게이션 바 (container 밖) -->
    <div class="top-nav-bar">
        <div class="top-nav-left">
            <button class="btn-back" onclick="backToSchedule()" title="뒤로가기">
                <i class="fas fa-arrow-left"></i>
            </button>
            <div class="user-info">
                <i class="fas fa-user-circle"></i>
                <span><strong id="currentUserName"></strong>님</span>
                <span class="program-badge" id="currentUserProgramBadge"></span>
            </div>
        </div>
        <button class="nav-icon-btn nav-icon-logout" onclick="logout()" title="로그아웃">
            <i class="fas fa-sign-out-alt"></i>
        </button>
    </div>
    
    <div class="container" style="position: relative;">
        <div class="welcome-header">
            <i class="fas fa-graduation-cap"></i>
            <h1>내벨업 테스트룸</h1>
            <p class="subtitle">Level Up Test Room</p>
        </div>
        
        <div class="test-info">
            <h2>과제 목록</h2>
            <div class="sections-grid">
                <!-- JS(showTaskListScreen)에서 동적으로 과제 카드 생성 -->
            </div>
        </div>
    </div>
</div>
```

---

## 3. 동적으로 생성되는 과제 카드 (JS → DOM)

`showTaskListScreen(week, dayKr, tasks)` 함수가 호출되면:

### 3-1. 헤더 텍스트 변경
```js
// h1 텍스트가 "Week 1 - 월요일" 등으로 변경됨
welcomeHeader.textContent = `Week ${week} - ${dayKr}요일`;
// subtitle이 "6개의 과제가 있습니다" 등으로 변경됨
subtitle.textContent = `${tasks.length}개의 과제가 있습니다`;
```

### 3-2. 과제 카드 HTML (`.sections-grid` 안에 동적 생성)

각 과제마다 아래 구조의 `div.section-card`가 생성됩니다:

```html
<div class="section-card" style="cursor: pointer;">
    <i class="fas fa-book-open"></i>   <!-- 과제 타입별 아이콘 -->
    <h3>리딩 Module 1</h3>              <!-- 과제명 -->
    <p>독해 연습</p>                     <!-- 과제 설명 -->
</div>
```

### 3-3. 과제 타입별 아이콘·설명 매핑

| 과제명에 포함된 키워드 | 아이콘 클래스 | 설명 텍스트 |
|---|---|---|
| `내벨업보카` | `fas fa-spell-check` | 단어 시험 |
| `입문서` | `fas fa-book-reader` | PDF 읽기 |
| `리딩` | `fas fa-book-open` | 독해 연습 |
| `리스닝` | `fas fa-headphones` | 듣기 연습 |
| `라이팅` | `fas fa-pen` | 쓰기 연습 |
| `스피킹` | `fas fa-microphone` | 말하기 연습 |
| (기본값) | `fas fa-book` | (과제명 그대로) |

### 3-4. 완료 상태 표시 (ProgressTracker에 의해 추가)

과제를 완료하면 `ProgressTracker.updateTaskCards()`가 실행되어:
1. `.section-card`에 `task-completed` 클래스 추가
2. 카드 내부에 `.task-complete-badge` div 추가 (실제로는 display:none이고 ::after pseudo-element만 보임)

```html
<!-- 완료된 카드 -->
<div class="section-card task-completed" style="cursor: pointer;">
    <i class="fas fa-book-open"></i>
    <h3>리딩 Module 1</h3>
    <p>독해 연습</p>
    <div class="task-complete-badge">
        <span class="check-icon check-icon-sm"></span>
    </div>
</div>
```

### 3-5. 사용자 정보 동적 업데이트

```js
// 사용자 이름
document.getElementById('currentUserName').textContent = currentUser.name;
// 프로그램 뱃지 (예: "TOEFL", "IELTS" 등)
document.getElementById('currentUserProgramBadge').textContent = currentUser.program;
```

---

## 4. 현재 적용 CSS (전체)

### 4-1. 화면 기본 (.screen)
```css
.screen {
    display: none;
    min-height: 100vh;
    position: relative;
}

.screen.active {
    display: block;
}
```

### 4-2. 상단 네비게이션 바
```css
.top-nav-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 30px;
    background: transparent;
    width: 100%;
    box-sizing: border-box;
}

.top-nav-left {
    display: flex;
    align-items: center;
    gap: 12px;
}

.top-nav-bar .user-info {
    position: static;
    background: white;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: var(--shadow);
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 17px;
}

.btn-back {
    background: white;
    border: 2px solid var(--border-color);
    padding: 12px 16px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 18px;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    transition: all 0.3s;
    box-shadow: var(--shadow);
    width: 48px;
    height: 48px;
    flex-shrink: 0;
}

.btn-back:hover {
    border-color: var(--primary-color);
    color: var(--primary-color);
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
```

### 4-3. 네비게이션 아이콘 버튼 (로그아웃 등)
```css
.nav-icon-btn {
    background: white;
    border: 2px solid #e5e7eb;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 17px;
    color: #555;
    transition: all 0.3s;
    flex-shrink: 0;
    position: relative;
}

.nav-icon-btn:hover {
    border-color: #6c5ce7;
    color: #6c5ce7;
    transform: scale(1.08);
    box-shadow: 0 4px 12px rgba(108, 92, 231, 0.15);
}

.nav-icon-btn.nav-icon-logout:hover {
    border-color: #ef4444;
    color: #ef4444;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15);
}

/* 툴팁 (hover 시 표시) */
.nav-icon-btn::after {
    content: attr(title);
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: #1a1a1a;
    color: white;
    font-size: 12px;
    font-weight: 500;
    padding: 6px 12px;
    border-radius: 8px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s;
    z-index: 100;
}

.nav-icon-btn:hover::after {
    opacity: 1;
}
```

### 4-4. 컨테이너
```css
.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px 20px;
}
```

### 4-5. 웰컴 헤더 영역
```css
.welcome-header {
    text-align: center;
    margin-bottom: 60px;
}

.welcome-header i {
    font-size: 80px;
    color: var(--primary-color);
    margin-bottom: 20px;
}

.welcome-header h1 {
    font-size: 48px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 10px;
}

.welcome-header .subtitle {
    font-size: 20px;
    color: var(--text-secondary);
}
```

### 4-6. 과제 목록 영역
```css
.test-info {
    background: var(--surface-color);
    padding: 40px;
    border-radius: 16px;
    box-shadow: var(--shadow-lg);
    margin-bottom: 40px;
}

.test-info h2 {
    text-align: center;
    font-size: 28px;
    margin-bottom: 30px;
    color: var(--text-primary);
}

.sections-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin-bottom: 20px;
}
```

### 4-7. 과제 카드
```css
.section-card {
    text-align: center;
    padding: 30px 20px;
    background: var(--bg-color);
    border-radius: 12px;
    border: 2px solid var(--border-color);
    transition: all 0.3s;
    position: relative;
}

.section-card:hover {
    transform: translateY(-5px);
    border-color: var(--primary-color);
    box-shadow: var(--shadow-lg);
}

.section-card i {
    font-size: 48px;
    color: var(--primary-color);
    margin-bottom: 15px;
}

.section-card h3 {
    font-size: 18px;
    margin-bottom: 10px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.section-card p {
    color: var(--text-secondary);
    margin-bottom: 5px;
}

.section-card .time {
    font-weight: 400;
    color: var(--primary-color);
    font-size: 18px;
}
```

### 4-8. 완료 상태 CSS
```css
.task-complete-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    display: none; /* ::after '제출됨' 텍스트와 겹침 방지 - ::after만 표시 */
}

.section-card.task-completed {
    border-color: var(--success-color);
    background: linear-gradient(135deg, var(--bg-color), rgba(119, 191, 126, 0.05));
    opacity: 0.85;
}

.section-card.task-completed::after {
    content: '✓ 제출됨';
    position: absolute;
    top: 8px;
    right: 8px;
    font-size: 11px;
    font-weight: 600;
    color: var(--success-color);
    background: rgba(119, 191, 126, 0.12);
    padding: 2px 8px;
    border-radius: 10px;
}
```

### 4-9. 프로그램 뱃지
```css
.program-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    border-radius: 9999px;
    background-color: rgba(119, 191, 126, 0.1);
    color: var(--secondary);
    font-size: 0.75rem;
    font-weight: 700;
    width: fit-content;
}
```

### 4-10. user-info (범용 - top-nav-bar 외부)
```css
.user-info {
    position: absolute;
    top: 20px;
    left: 80px;
    background: white;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: var(--shadow);
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 17px;
}

.user-info i {
    color: var(--primary-color);
    font-size: 24px;
}

.user-info strong {
    color: var(--text-primary);
    font-weight: 700;
}
```

---

## 5. 반응형 규칙

```css
@media (max-width: 1024px) {
    .sections-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (max-width: 768px) {
    .welcome-header h1 {
        font-size: 36px;
    }
    .welcome-header i {
        font-size: 60px;
    }
    .nav-icon-btn::after {
        display: none;
    }
    .nav-icon-btn {
        width: 40px;
        height: 40px;
        font-size: 15px;
    }
}

@media (max-width: 640px) {
    .sections-grid {
        grid-template-columns: 1fr;
    }
}
```

---

## 6. 사용 중인 아이콘 라이브러리

**Font Awesome 6** (CDN)
- `fas fa-arrow-left` (뒤로가기)
- `fas fa-user-circle` (사용자)
- `fas fa-sign-out-alt` (로그아웃)
- `fas fa-graduation-cap` (웰컴 헤더)
- `fas fa-spell-check` (내벨업보카)
- `fas fa-book-reader` (입문서)
- `fas fa-book-open` (리딩)
- `fas fa-headphones` (리스닝)
- `fas fa-pen` (라이팅)
- `fas fa-microphone` (스피킹)
- `fas fa-book` (기본)

---

## 7. 일반적인 과제 목록 예시 (6개 카드)

하루에 보통 6개 과제가 표시됩니다:

1. **내벨업보카 5, 6, 7pg** → `fas fa-spell-check` / 단어 시험
2. **입문서 정독** → `fas fa-book-reader` / PDF 읽기
3. **리딩 Module 1** → `fas fa-book-open` / 독해 연습
4. **리스닝 Module 1** → `fas fa-headphones` / 듣기 연습
5. **라이팅 Module 1** → `fas fa-pen` / 쓰기 연습
6. **스피킹 Module 1** → `fas fa-microphone` / 말하기 연습

일부 카드는 `task-completed` 클래스가 붙어 있을 수 있습니다 (완료 상태).

---

## 8. 화면 전환 흐름

```
스케줄(캘린더) → [날짜 클릭] → taskListScreen (이 화면)
                                    → [과제 클릭] → executeTask()
                                        → vocab/intro-book → 직접 실행
                                        → reading/listening/writing/speaking → taskDashboardScreen으로 이동
```

---

## 9. 수정 시 주의사항

1. **클래스명 변경 불가**: `.section-card`, `.sections-grid`, `.task-completed`, `.task-complete-badge` 등은 JS에서 직접 참조하므로 이름 변경 시 JS도 수정 필요
2. **동적 카드**: `.sections-grid` 내부는 비어있고 JS가 채움. CSS는 동적 생성될 카드에도 적용되어야 함
3. **다른 화면과 공유되는 클래스**: `.container`, `.btn-back`, `.nav-icon-btn`, `.user-info`, `.program-badge`는 다른 화면에서도 사용됨. 변경 시 `#taskListScreen` 스코프로 제한해야 함
4. **완료 상태 CSS**: `ProgressTracker`가 동적으로 클래스를 추가하므로, 완료 스타일이 의도대로 보이는지 확인 필요
