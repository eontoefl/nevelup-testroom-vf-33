// 화면 전환 함수들
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        screen.style.display = 'none'; // 명시적으로 숨김
    });
    const targetScreen = document.getElementById(screenId);
    targetScreen.classList.add('active');
    targetScreen.style.display = 'block'; // 명시적으로 표시
    
    console.log(`📺 [화면전환] ${screenId} 표시 완료`);
    
    // scheduleScreen으로 전환 시 학습 일정 초기화
    if (screenId === 'scheduleScreen' && currentUser) {
        initScheduleScreen();
        // 공지사항 로드
        if (typeof loadNotices === 'function') loadNotices();
        // 🔔 알림 로드
        if (window.NotificationSystem) NotificationSystem.load();
        // 세그먼트 컨트롤 초기화
        _initSegmentControl();
    }
    
    // taskListScreen으로 전환 시 사용자 이름 표시
    if (screenId === 'taskListScreen' && currentUser) {
        const userNameElement = document.getElementById('currentUserName');
        if (userNameElement) {
            userNameElement.textContent = currentUser.name;
        }
    }
}

// ===== SCHEDULE SCREEN =====
function initScheduleScreen() {
    if (!currentUser) return;
    
    // 사용자 정보 표시
    const userNameElement = document.getElementById('scheduleUserName');
    const programBadgeElement = document.getElementById('userProgramBadge');
    
    if (userNameElement) {
        userNameElement.textContent = currentUser.name;
    }
    
    if (programBadgeElement) {
        programBadgeElement.textContent = currentUser.program.replace('내벨업챌린지 - ', '');
    }
    
    // 코스 모드에 따라 적절한 렌더링
    var mode = window.courseMode || 'regular';
    if (mode === 'correction') {
        _renderCorrectionMode();
    } else if (mode === 'practice') {
        _renderPracticeMode();
    } else {
        _renderRegularMode();
    }
}

/** 정규코스 렌더링 */
function _renderRegularMode() {
    // 정규코스 컨테이너 표시 / 연습·첨삭 컨테이너 숨김
    var regularContainer = document.getElementById('scheduleContainer');
    var practiceContainer = document.getElementById('practiceScheduleContainer');
    var correctionContainer = document.getElementById('correctionScheduleContainer');
    var scheduleHeader = document.querySelector('#scheduleScreen .schedule-header');
    if (regularContainer) regularContainer.style.display = '';
    if (practiceContainer) practiceContainer.style.display = 'none';
    if (correctionContainer) correctionContainer.style.display = 'none';
    if (scheduleHeader) {
        scheduleHeader.querySelector('h1').textContent = 'NEVEL-UP TESTROOM';
        scheduleHeader.querySelector('p').textContent = 'Select the desired week and day.';
    }
    
    const doRender = () => {
        renderSchedule(currentUser.program);
        
        if (typeof ProgressTracker !== 'undefined') {
            ProgressTracker._loaded = false;
            ProgressTracker._loading = false;
            
            ProgressTracker.loadCompletedTasks().then(function() {
                renderSchedule(currentUser.program);
            });
        }
    };
    
    if (typeof loadScheduleFromSupabase === 'function') {
        loadScheduleFromSupabase().then(doRender).catch(doRender);
    } else {
        doRender();
    }
}

/** 연습코스 렌더링 */
function _renderPracticeMode() {
    // 정규·첨삭 컨테이너 숨김 / 연습코스 컨테이너 표시
    var regularContainer = document.getElementById('scheduleContainer');
    var practiceContainer = document.getElementById('practiceScheduleContainer');
    var correctionContainer = document.getElementById('correctionScheduleContainer');
    var scheduleHeader = document.querySelector('#scheduleScreen .schedule-header');
    if (regularContainer) regularContainer.style.display = 'none';
    if (practiceContainer) practiceContainer.style.display = '';
    if (correctionContainer) correctionContainer.style.display = 'none';
    if (scheduleHeader) {
        scheduleHeader.querySelector('h1').textContent = 'PRACTICE MODE';
        scheduleHeader.querySelector('p').textContent = 'Select the desired practice.';
    }
    
    renderPracticeSchedule();
}

/** 첨삭(FEEDBACK) 모드 렌더링 */
function _renderCorrectionMode() {
    // 정규·연습 컨테이너 숨김 / 첨삭 컨테이너 표시
    var regularContainer = document.getElementById('scheduleContainer');
    var practiceContainer = document.getElementById('practiceScheduleContainer');
    var correctionContainer = document.getElementById('correctionScheduleContainer');
    var scheduleHeader = document.querySelector('#scheduleScreen .schedule-header');
    if (regularContainer) regularContainer.style.display = 'none';
    if (practiceContainer) practiceContainer.style.display = 'none';
    if (correctionContainer) correctionContainer.style.display = '';
    if (scheduleHeader) {
        scheduleHeader.querySelector('h1').textContent = '1:1 FEEDBACK';
        scheduleHeader.querySelector('p').textContent = 'Select the desired session.';
    }

    renderCorrectionSchedule();
}

/**
 * 첨삭 스케줄 그리드 렌더링 (Week 1~4 × 3 sessions)
 * 정규과정의 week-block / days-grid / day-button 구조 재사용
 */
function renderCorrectionSchedule() {
    var container = document.getElementById('correctionScheduleContainer');
    if (!container) return;
    container.innerHTML = '';

    var schedule = window.CORRECTION_SCHEDULE;
    if (!schedule || schedule.length === 0) {
        container.innerHTML = '<div class="correction-empty-msg"><p>아직 첨삭 일정이 배정되지 않았습니다. 담당자에게 문의해주세요.</p></div>';
        return;
    }

    console.log('📋 [첨삭] 스케줄 렌더링 시작');

    // Week 1~4 그룹핑
    var weeks = {};
    schedule.forEach(function(s) {
        if (!weeks[s.week]) weeks[s.week] = [];
        weeks[s.week].push(s);
    });

    var weekNums = Object.keys(weeks).sort(function(a, b) { return a - b; });

    weekNums.forEach(function(weekNum) {
        var sessions = weeks[weekNum];

        var weekBlock = document.createElement('div');
        weekBlock.className = 'week-block';

        var weekHeader = document.createElement('div');
        weekHeader.className = 'week-header';

        var weekTitle = document.createElement('h2');
        weekTitle.className = 'week-title';
        weekTitle.textContent = 'Week ' + String(weekNum).padStart(2, '0');

        var weekDivider = document.createElement('div');
        weekDivider.className = 'week-divider';

        weekHeader.appendChild(weekTitle);
        weekHeader.appendChild(weekDivider);

        var daysGrid = document.createElement('div');
        daysGrid.className = 'days-grid correction-days-grid';

        sessions.forEach(function(session) {
            var dayButton = document.createElement('button');
            dayButton.className = 'day-button';
            dayButton.setAttribute('data-session', session.session);

            var writingLabel = session.writing.type === 'email' ? 'Email' : 'Discussion';
            var taskLabel = writingLabel + ' + Interview';

            dayButton.innerHTML =
                '<span class="day-name">SESSION ' + String(session.session).padStart(2, '0') + '</span>' +
                '<div class="progress-dot dot-none"></div>' +
                '<span class="day-tasks">' + taskLabel + '</span>';

            dayButton.onclick = function() {
                console.log('🎯 [첨삭] Session ' + session.session + ' 선택');
                // Phase 2에서 correctionSessionScreen으로 전환
                alert('Session ' + session.session + ' (' + taskLabel + ')\n\n세션 상세 화면은 Phase 2에서 구현됩니다.');
            };

            daysGrid.appendChild(dayButton);
        });

        weekBlock.appendChild(weekHeader);
        weekBlock.appendChild(daysGrid);
        container.appendChild(weekBlock);
    });
}

function renderSchedule(program) {
    const container = document.getElementById('scheduleContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    // 프로그램 타입 결정
    const programType = program === '내벨업챌린지 - Standard' ? 'standard' : 'fast';
    const totalWeeks = programType === 'standard' ? 8 : 4;
    
    console.log(`📅 [스케줄 렌더링] program: ${program}, programType: ${programType}, totalWeeks: ${totalWeeks}`);
    
    // startDate 기반 날짜 계산
    const startDate = currentUser && currentUser.startDate ? new Date(currentUser.startDate + 'T00:00:00') : null;
    
    // 월 영문 약어
    const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    
    for (let week = 1; week <= totalWeeks; week++) {
        const weekBlock = document.createElement('div');
        weekBlock.className = 'week-block';
        
        // 새 week-header 구조: 제목 + 구분선
        const weekHeader = document.createElement('div');
        weekHeader.className = 'week-header';
        
        const weekTitle = document.createElement('h2');
        weekTitle.className = 'week-title';
        weekTitle.textContent = `Week ${String(week).padStart(2, '0')}`;
        
        const weekDivider = document.createElement('div');
        weekDivider.className = 'week-divider';
        
        weekHeader.appendChild(weekTitle);
        weekHeader.appendChild(weekDivider);
        
        const daysGrid = document.createElement('div');
        daysGrid.className = 'days-grid';
        
        // 요일 영문명 매핑
        const dayMapping = {
            '일': 'sunday',
            '월': 'monday',
            '화': 'tuesday',
            '수': 'wednesday',
            '목': 'thursday',
            '금': 'friday'
        };
        
        // 요일별 버튼 생성 (토요일 제외)
        daysOfWeek.forEach((dayKr, dayIndex) => {
            const dayEn = dayMapping[dayKr];
            const dayButton = document.createElement('button');
            dayButton.className = 'day-button';
            
            // 해당 날짜의 과제 목록 가져오기
            const tasks = getDayTasks(programType, week, dayEn);
            
            dayButton.onclick = () => {
                selectDay(week, dayKr, dayEn);
            };
            
            // 날짜 계산: startDate + (week-1)*7 + dayIndex
            let dateStr = '';
            if (startDate) {
                const d = new Date(startDate);
                d.setDate(d.getDate() + (week - 1) * 7 + dayIndex);
                dateStr = `${monthNames[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
            }
            
            // 진도율 dot (ProgressTracker가 로드됐으면)
            // done=전부완료(초록), completed>0=진행중(노란), 0=미시작(회색)
            let dotClass = 'dot-none';
            if (tasks.length > 0 && typeof ProgressTracker !== 'undefined' && ProgressTracker._loaded) {
                const progress = ProgressTracker.getDayProgress(programType, week, dayEn);
                if (progress.total > 0) {
                    if (progress.done === progress.total) {
                        dotClass = 'dot-done';
                    } else if (progress.completed > 0) {
                        dotClass = 'dot-partial';
                    }
                }
            }
            
            dayButton.innerHTML = `
                <span class="day-name">${dayEnShort[dayKr]}</span>
                <div class="progress-dot ${dotClass}"></div>
                <span class="day-tasks">${dateStr}</span>
            `;
            
            // 휴무일인 경우 스타일 변경
            if (tasks.length === 0) {
                dayButton.style.opacity = '0.5';
                dayButton.style.cursor = 'default';
                dayButton.onclick = null;
            }
            
            daysGrid.appendChild(dayButton);
        });
        
        weekBlock.appendChild(weekHeader);
        weekBlock.appendChild(daysGrid);
        container.appendChild(weekBlock);
    }
}

function selectDay(week, dayKr, dayEn) {
    if (!currentUser) return;
    
    currentTest.currentWeek = week;
    currentTest.currentDay = dayKr;
    
    // 프로그램 타입 결정
    const program = currentUser.program;
    const programType = program === '내벨업챌린지 - Standard' ? 'standard' : 'fast';
    
    // 해당 날짜의 과제 목록 가져오기
    const tasks = getDayTasks(programType, week, dayEn);
    
    if (tasks.length === 0) {
        return;
    }
    
    // 과제 목록 화면 표시
    showTaskListScreen(week, dayKr, tasks);
}

// ===== PRACTICE SCHEDULE =====

/**
 * 연습코스 스케줄 그리드 렌더링 (Practice 1~60)
 * 정규과정의 week-block / days-grid / day-button 구조를 그대로 사용
 */
function renderPracticeSchedule() {
    var container = document.getElementById('practiceScheduleContainer');
    if (!container) return;
    container.innerHTML = '';
    
    console.log('📋 [연습코스] 스케줄 렌더링 시작');
    
    // 10개씩 6줄로 그룹핑 (Practice 1~10, 11~20, ...)
    for (var row = 0; row < 6; row++) {
        var startNum = row * 10 + 1;
        var endNum = startNum + 9;
        
        var weekBlock = document.createElement('div');
        weekBlock.className = 'week-block';
        
        // week-header: "Practice 01-10" 스타일
        var weekHeader = document.createElement('div');
        weekHeader.className = 'week-header';
        
        var weekTitle = document.createElement('h2');
        weekTitle.className = 'week-title';
        weekTitle.textContent = 'Practice ' + String(startNum).padStart(2, '0') + ' - ' + String(endNum).padStart(2, '0');
        
        var weekDivider = document.createElement('div');
        weekDivider.className = 'week-divider';
        
        weekHeader.appendChild(weekTitle);
        weekHeader.appendChild(weekDivider);
        
        // days-grid: 10개 버튼
        var daysGrid = document.createElement('div');
        daysGrid.className = 'days-grid practice-days-grid';
        
        for (var i = startNum; i <= endNum; i++) {
            var dayButton = document.createElement('button');
            dayButton.className = 'day-button';
            dayButton.setAttribute('data-practice', i);
            
            // 진도 dot
            var dotClass = 'dot-none';
            if (typeof ProgressTracker !== 'undefined' && ProgressTracker._loaded) {
                var pKey = 'practice_' + i;
                if (ProgressTracker._completedTasks && ProgressTracker._completedTasks[pKey]) {
                    dotClass = 'dot-done';
                }
            }
            
            dayButton.innerHTML = 
                '<span class="day-name">P' + String(i).padStart(2, '0') + '</span>' +
                '<div class="progress-dot ' + dotClass + '"></div>' +
                '<span class="day-tasks">Practice ' + i + '</span>';
            
            (function(num) {
                dayButton.onclick = function() {
                    selectPractice(num);
                };
            })(i);
            
            daysGrid.appendChild(dayButton);
        }
        
        weekBlock.appendChild(weekHeader);
        weekBlock.appendChild(daysGrid);
        container.appendChild(weekBlock);
    }
    
    // 진도 표시 로드
    if (typeof ProgressTracker !== 'undefined') {
        ProgressTracker._loaded = false;
        ProgressTracker._loading = false;
        ProgressTracker.loadCompletedTasks().then(function() {
            _updatePracticeProgress();
        });
    }
}

/** 연습코스 버튼 진도 표시 업데이트 */
function _updatePracticeProgress() {
    var btns = document.querySelectorAll('#practiceScheduleContainer .day-button');
    btns.forEach(function(btn) {
        var pNum = parseInt(btn.getAttribute('data-practice'));
        var pKey = 'practice_' + pNum;
        if (ProgressTracker._completedTasks && ProgressTracker._completedTasks[pKey]) {
            var dot = btn.querySelector('.progress-dot');
            if (dot) {
                dot.className = 'progress-dot dot-done';
            }
        }
    });
}

/**
 * 연습코스 Practice 선택
 */
function selectPractice(practiceNumber) {
    if (!currentUser) return;
    
    console.log('🎯 [연습코스] Practice ' + practiceNumber + ' 선택');
    
    // currentPractice 업데이트
    window.currentPractice.practiceNumber = practiceNumber;
    
    // Supabase에서 해당 practice의 과제 목록 가져오기
    _loadPracticeTasks(practiceNumber);
}

/** Supabase에서 practice schedule 로드 */
async function _loadPracticeTasks(practiceNumber) {
    var tasks = [];
    
    try {
        if (typeof supabaseSelect === 'function') {
            var rows = await supabaseSelect(
                'tr_practice_schedule',
                'practice_number=eq.' + practiceNumber + '&limit=1'
            );
            if (rows && rows.length > 0) {
                var raw = rows[0].tasks;
                if (Array.isArray(raw)) {
                    tasks = raw;
                } else if (typeof raw === 'string') {
                    try { tasks = JSON.parse(raw); } catch(e) { tasks = []; }
                }
            }
        }
    } catch (e) {
        console.error('❌ [연습코스] 스케줄 로드 실패:', e);
    }
    
    if (tasks.length === 0) {
        alert('Practice ' + practiceNumber + '의 과제 데이터가 없습니다.');
        return;
    }
    
    // 과제 목록 화면 표시 (연습코스 전용)
    showPracticeTaskListScreen(practiceNumber, tasks);
}

/**
 * 연습코스 과제 목록 화면 표시
 */
function showPracticeTaskListScreen(practiceNumber, tasks) {
    console.log('📋 [연습코스 과제] Practice ' + practiceNumber + ' - 과제:', tasks);
    
    // 모든 화면 숨기기
    document.querySelectorAll('.screen').forEach(function(screen) {
        screen.classList.remove('active');
        screen.style.display = 'none';
    });
    
    // taskListScreen 표시 (정규코스와 공유)
    var taskListScreenEl = document.getElementById('taskListScreen');
    taskListScreenEl.classList.add('active');
    taskListScreenEl.style.display = 'block';
    
    // 사용자 정보 표시
    if (currentUser) {
        var userNameElement = document.getElementById('currentUserName');
        var programBadgeElement = document.getElementById('currentUserProgramBadge');
        if (userNameElement) userNameElement.textContent = currentUser.name;
        if (programBadgeElement) programBadgeElement.textContent = 'Practice';
    }
    
    // 헤더 변경
    var welcomeHeader = document.querySelector('#taskListScreen .welcome-header h1');
    var subtitle = document.querySelector('#taskListScreen .welcome-header .subtitle');
    
    if (welcomeHeader) {
        welcomeHeader.textContent = 'Practice ' + practiceNumber;
    }
    if (subtitle) {
        subtitle.textContent = tasks.length + '개의 과제가 있습니다';
    }
    
    // 연습코스는 마감 배너 숨김
    var existingBanner = document.getElementById('taskListDeadlineBanner');
    if (existingBanner) existingBanner.remove();
    
    // 과제 목록 표시
    var sectionsGrid = document.querySelector('#taskListScreen .sections-grid');
    if (sectionsGrid) {
        sectionsGrid.innerHTML = '';
        
        tasks.forEach(function(taskName, index) {
            var card = document.createElement('div');
            card.className = 'section-card';
            card.style.cursor = 'pointer';
            
            var icon = 'fas fa-book';
            var description = taskName;
            
            if (taskName.includes('내벨업보카')) {
                icon = 'fas fa-spell-check';
                description = '단어 시험';
            } else if (taskName.includes('리딩')) {
                icon = 'fas fa-book-open';
                description = '독해 연습';
            } else if (taskName.includes('리스닝')) {
                icon = 'fas fa-headphones';
                description = '듣기 연습';
            } else if (taskName.includes('라이팅')) {
                icon = 'fas fa-pen';
                description = '쓰기 연습';
            } else if (taskName.includes('스피킹')) {
                icon = 'fas fa-microphone';
                description = '말하기 연습';
            }
            
            card.onclick = function() {
                console.log('🎯 [연습코스 과제 실행] ' + taskName);
                executeTask(taskName);
            };
            
            card.innerHTML = '<div class="card-icon"><i class="' + icon + '"></i></div>' +
                '<h3>' + taskName + '</h3>' +
                '<p>' + description + '</p>';
            
            sectionsGrid.appendChild(card);
        });
    }
}

/**
 * 과제 목록 화면 표시 (V3 스케줄 시스템)
 */
function showTaskListScreen(week, dayKr, tasks) {
    console.log('📋 [과제 목록 화면] Week', week, dayKr, '- 과제:', tasks);
    
    // 모든 화면 숨기기
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        screen.style.display = 'none';
    });
    
    // taskListScreen 표시
    const taskListScreenEl = document.getElementById('taskListScreen');
    taskListScreenEl.classList.add('active');
    taskListScreenEl.style.display = 'block';
    
    // 사용자 정보 표시
    if (currentUser) {
        const userNameElement = document.getElementById('currentUserName');
        const programBadgeElement = document.getElementById('currentUserProgramBadge');
        
        if (userNameElement) {
            userNameElement.textContent = currentUser.name;
        }
        
        if (programBadgeElement) {
            programBadgeElement.textContent = currentUser.program.replace('내벨업챌린지 - ', '');
        }
    }
    
    // 헤더 변경
    const welcomeHeader = document.querySelector('#taskListScreen .welcome-header h1');
    const subtitle = document.querySelector('#taskListScreen .welcome-header .subtitle');
    
    if (welcomeHeader) {
        var dayEnMap = { '일': 'SUNDAY', '월': 'MONDAY', '화': 'TUESDAY', '수': 'WEDNESDAY', '목': 'THURSDAY', '금': 'FRIDAY', '토': 'SATURDAY' };
        var dayEn = dayEnMap[dayKr] || dayKr;
        welcomeHeader.textContent = `Week ${week} - ${dayEn}`;
    }
    if (subtitle) {
        subtitle.textContent = `${tasks.length}개의 과제가 있습니다`;
    }
    
    // 마감 배너 표시
    _renderDeadlineBanner(week, dayKr);
    
    // 과제 목록 표시
    const sectionsGrid = document.querySelector('#taskListScreen .sections-grid');
    if (sectionsGrid) {
        sectionsGrid.innerHTML = '';
        
        tasks.forEach((taskName, index) => {
            const card = document.createElement('div');
            card.className = 'section-card';
            card.style.cursor = 'pointer';
            
            // 과제 타입에 따라 아이콘과 설명 결정
            let icon = 'fas fa-book';
            let description = taskName;
            
            if (taskName.includes('내벨업보카')) {
                icon = 'fas fa-spell-check';
                description = '단어 시험';
            } else if (taskName.includes('입문서')) {
                icon = 'fas fa-book-reader';
                description = 'PDF 읽기';
            } else if (taskName.includes('리딩')) {
                icon = 'fas fa-book-open';
                description = '독해 연습';
            } else if (taskName.includes('리스닝')) {
                icon = 'fas fa-headphones';
                description = '듣기 연습';
            } else if (taskName.includes('라이팅')) {
                icon = 'fas fa-pen';
                description = '쓰기 연습';
            } else if (taskName.includes('스피킹')) {
                icon = 'fas fa-microphone';
                description = '말하기 연습';
            }
            
            card.onclick = () => {
                console.log(`🎯 [과제 실행] ${taskName}`);
                // 마감 체크를 위해 currentTest에 주차/요일 보장
                if (!currentTest.currentWeek) currentTest.currentWeek = week;
                if (!currentTest.currentDay) currentTest.currentDay = dayKr;
                executeTask(taskName);
            };
            
            card.innerHTML = `
                <div class="card-icon"><i class="${icon}"></i></div>
                <h3>${taskName}</h3>
                <p>${description}</p>
            `;
            
            sectionsGrid.appendChild(card);
        });
    }
}

// ===== SEGMENT CONTROL =====

/** 세그먼트 컨트롤 초기화 (TESTROOM / PRACTICE / FEEDBACK 토글) */
function _initSegmentControl() {
    var segmentWrap = document.getElementById('courseSegmentControl');
    if (!segmentWrap) return;
    
    var btnRegular = document.getElementById('segBtnRegular');
    var btnPractice = document.getElementById('segBtnPractice');
    var btnFeedback = document.getElementById('segBtnFeedback');
    
    var hasPractice = currentUser && currentUser.practiceEnabled;
    var hasCorrection = currentUser && (currentUser.correctionEnabled || window.__isAdmin);
    
    // PRACTICE / FEEDBACK 버튼 개별 표시
    if (btnPractice) btnPractice.style.display = hasPractice ? '' : 'none';
    if (btnFeedback) btnFeedback.style.display = hasCorrection ? '' : 'none';
    
    // 세그먼트 컨트롤: 정규코스만 있으면 숨김
    if (!hasPractice && !hasCorrection) {
        segmentWrap.style.display = 'none';
        if (window.courseMode !== 'regular') {
            setCourseMode('regular');
            _renderRegularMode();
        }
        return;
    }
    
    segmentWrap.style.display = '';
    
    // 현재 모드 유효성 검증
    var mode = window.courseMode || 'regular';
    if (mode === 'practice' && !hasPractice) mode = 'regular';
    if (mode === 'correction' && !hasCorrection) mode = 'regular';
    if (mode !== window.courseMode) setCourseMode(mode);
    
    // active 클래스 동기화
    _syncSegmentActive(mode);
    
    if (btnRegular) {
        btnRegular.onclick = function() {
            if (window.courseMode === 'regular') return;
            setCourseMode('regular');
            _syncSegmentActive('regular');
            _renderRegularMode();
        };
    }
    if (btnPractice) {
        btnPractice.onclick = function() {
            if (window.courseMode === 'practice') return;
            setCourseMode('practice');
            _syncSegmentActive('practice');
            _renderPracticeMode();
        };
    }
    if (btnFeedback) {
        btnFeedback.onclick = function() {
            if (window.courseMode === 'correction') return;
            setCourseMode('correction');
            _syncSegmentActive('correction');
            _renderCorrectionMode();
        };
    }
}

/** 세그먼트 버튼 active 상태 동기화 */
function _syncSegmentActive(mode) {
    var btnRegular = document.getElementById('segBtnRegular');
    var btnPractice = document.getElementById('segBtnPractice');
    var btnFeedback = document.getElementById('segBtnFeedback');
    if (btnRegular) btnRegular.classList.toggle('seg-active', mode === 'regular');
    if (btnPractice) btnPractice.classList.toggle('seg-active', mode === 'practice');
    if (btnFeedback) btnFeedback.classList.toggle('seg-active', mode === 'correction');
}

// backToSchedule: 스케줄 화면 복귀 (공통)
function backToSchedule() {
    showScreen('scheduleScreen');
}

/**
 * 마이페이지 이동 — 연습코스 모드면 mypage-practice.html, 그 외 mypage.html
 */
function goToMyPage() {
    if (typeof isPracticeMode === 'function' && isPracticeMode()) {
        window.location.href = 'mypage-practice.html';
    } else {
        window.location.href = 'mypage.html';
    }
}
window.goToMyPage = goToMyPage;

// [V3] 삭제됨: showTaskSelectionScreen, getSectionInfo, startFullTest, startSection,
//   및 모든 V1 프로토타입 함수들 (initReadingSection, loadReadingPassage, etc.)
// — toeflData 하드코딩 데이터 기반 V1 전용 코드였으며,
//   V3에서는 섹션별 모듈 컨트롤러 + Supabase 데이터로 완전 대체됨

// ========================================
// 마감 배너 렌더링
// ========================================
function _renderDeadlineBanner(week, dayKr) {
    // 기존 배너 제거
    var existing = document.getElementById('taskListDeadlineBanner');
    if (existing) existing.remove();

    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    if (!user || !user.startDate) return;

    var dayMap = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
    var dayOffset = dayMap[dayKr];
    if (dayOffset === undefined) return;

    var startDate = new Date(user.startDate + 'T00:00:00');
    if (isNaN(startDate.getTime())) return;

    var taskDate = new Date(startDate);
    taskDate.setDate(taskDate.getDate() + (week - 1) * 7 + dayOffset);

    var deadline = new Date(taskDate);
    deadline.setDate(deadline.getDate() + 1);
    deadline.setHours(4, 0, 0, 0);

    // 연장 체크
    var taskDateStr = taskDate.getFullYear() + '-' +
        String(taskDate.getMonth() + 1).padStart(2, '0') + '-' +
        String(taskDate.getDate()).padStart(2, '0');
    var extensions = window._deadlineExtensions || [];
    var ext = extensions.find(function(e) { return e.original_date === taskDateStr; });
    if (ext) {
        deadline.setDate(deadline.getDate() + (ext.extra_days || 1));
    }

    var now = new Date();
    var banner = document.createElement('div');
    banner.id = 'taskListDeadlineBanner';

    if (now > deadline) {
        banner.className = 'task-deadline-banner deadline-passed';
        banner.innerHTML = '<i class="fas fa-lock"></i> 마감됨';
    } else {
        var diff = deadline - now;
        var days = Math.floor(diff / (1000 * 60 * 60 * 24));
        var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        var timeText = '';
        if (days > 0) timeText = days + '일 ' + hours + '시간 ' + minutes + '분 남음';
        else if (hours > 0) timeText = hours + '시간 ' + minutes + '분 남음';
        else timeText = minutes + '분 남음';

        var deadlineLabel = days === 0 ? '오늘 마감' : days === 1 ? '내일 마감' : days + '일 후 마감';

        if (days === 0 && hours < 6) {
            banner.className = 'task-deadline-banner deadline-urgent';
            banner.innerHTML = '<i class="fas fa-exclamation-circle"></i> 마감 임박 · ' + timeText;
        } else {
            banner.className = 'task-deadline-banner deadline-normal';
            banner.innerHTML = '<i class="fas fa-clock"></i> ' + deadlineLabel + ' · ' + timeText;
        }
    }

    var welcomeHeader = document.querySelector('#taskListScreen .welcome-header');
    if (welcomeHeader) {
        welcomeHeader.parentNode.insertBefore(banner, welcomeHeader.nextSibling);
    }
}

// ================================================
// URL 해시로 과제 목록 복귀 (#taskList/week/day)
// book.html 뒤로가기 시 scheduleScreen 대신 taskListScreen 표시
// ================================================
(function handleTaskListHash() {
    var hash = window.location.hash;
    if (!hash || !hash.startsWith('#taskList')) return;

    // 해시 사용 후 제거 (새로고침 시 중복 방지)
    history.replaceState(null, '', window.location.pathname + window.location.search);

    // 로그인 상태 확인
    if (!currentUser) return;

    // 해시 파싱: #taskList/1/월
    var parts = hash.replace('#taskList', '').split('/').filter(Boolean);
    var week = parts[0] ? parseInt(parts[0], 10) : null;
    var dayKr = parts[1] ? decodeURIComponent(parts[1]) : null;

    // week/day 있으면 해당 날짜의 과제 목록 표시
    if (week && dayKr) {
        var dayMapping = { '일': 'sunday', '월': 'monday', '화': 'tuesday', '수': 'wednesday', '목': 'thursday', '금': 'friday' };
        var dayEn = dayMapping[dayKr];
        if (dayEn) {
            selectDay(week, dayKr, dayEn);
            console.log('📋 [해시복귀] taskListScreen 표시 — Week' + week + ' ' + dayKr);
            return;
        }
    }

    // week/day 없으면 scheduleScreen 유지 (기본 동작)
    console.log('📋 [해시복귀] week/day 정보 없음 — scheduleScreen 유지');
})();
