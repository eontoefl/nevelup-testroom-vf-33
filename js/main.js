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
        // 공지사항 로드 + 너비 정렬
        if (typeof loadNotices === 'function') loadNotices();
        if (typeof alignNoticeToUserInfo === 'function') setTimeout(alignNoticeToUserInfo, 100);
        // 🔔 알림 로드
        if (window.NotificationSystem) NotificationSystem.load();
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
        programBadgeElement.textContent = currentUser.program;
    }
    
    // Supabase 스케줄 로드 → 완료 후 렌더링
    const doRender = () => {
        renderSchedule(currentUser.program);
        
        // 요일별 진도 표시용 데이터 로드 (상단 진도율 바는 제거)
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

function renderSchedule(program) {
    const container = document.getElementById('scheduleContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    // 프로그램 타입 결정
    const programType = program === '내벨업챌린지 - Standard' ? 'standard' : 'fast';
    const totalWeeks = programType === 'standard' ? 8 : 4;
    
    console.log(`📅 [스케줄 렌더링] program: ${program}, programType: ${programType}, totalWeeks: ${totalWeeks}`);
    
    for (let week = 1; week <= totalWeeks; week++) {
        const weekBlock = document.createElement('div');
        weekBlock.className = 'week-block';
        
        const weekTitle = document.createElement('div');
        weekTitle.className = 'week-title';
        weekTitle.innerHTML = `<i class="fas fa-calendar-week"></i> Week ${week}`;
        
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
        daysOfWeek.forEach(dayKr => {
            const dayEn = dayMapping[dayKr];
            const dayButton = document.createElement('div');
            dayButton.className = 'day-button';
            
            // 해당 날짜의 과제 목록 가져오기
            const tasks = getDayTasks(programType, week, dayEn);
            
            dayButton.onclick = () => {
                selectDay(week, dayKr, dayEn);
            };
            
            // 과제 정보 표시
            const taskInfo = tasks.length > 0 ? `${tasks.length}개 과제` : '휴무';
            
            // 진도율 표시 (ProgressTracker가 로드됐으면)
            let progressHTML = '';
            if (tasks.length > 0 && typeof ProgressTracker !== 'undefined' && ProgressTracker._loaded) {
                const progress = ProgressTracker.getDayProgress(programType, week, dayEn);
                if (progress.total > 0) {
                    if (progress.completed === progress.total) {
                        progressHTML = '<div class="day-progress day-progress-done"><span class="check-icon"></span> 완료</div>';
                    } else if (progress.completed > 0) {
                        progressHTML = '<div class="day-progress day-progress-partial">' + progress.completed + '/' + progress.total + '</div>';
                    } else {
                        progressHTML = '<div class="day-progress day-progress-none">0/' + progress.total + '</div>';
                    }
                }
            }
            
            dayButton.innerHTML = `
                <div class="day-name">${dayKr}</div>
                <div class="day-tasks">${taskInfo}</div>
                ${progressHTML}
            `;
            
            // 휴무일인 경우 스타일 변경
            if (tasks.length === 0) {
                dayButton.style.opacity = '0.5';
                dayButton.style.cursor = 'default';
                dayButton.onclick = null;
            }
            
            daysGrid.appendChild(dayButton);
        });
        
        weekBlock.appendChild(weekTitle);
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
            programBadgeElement.textContent = currentUser.program;
        }
    }
    
    // 헤더 변경
    const welcomeHeader = document.querySelector('#taskListScreen .welcome-header h1');
    const subtitle = document.querySelector('#taskListScreen .welcome-header .subtitle');
    
    if (welcomeHeader) {
        welcomeHeader.textContent = `Week ${week} - ${dayKr}요일`;
    }
    if (subtitle) {
        subtitle.textContent = `${tasks.length}개의 과제가 있습니다`;
    }
    
    // 시작 버튼 숨기기
    const startOptions = document.querySelector('#taskListScreen .start-options');
    if (startOptions) {
        startOptions.style.display = 'none';
    }
    
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
                <i class="${icon}"></i>
                <h3>${taskName}</h3>
                <p>${description}</p>
            `;
            
            sectionsGrid.appendChild(card);
        });
    }
}

// [V3] 삭제됨: showTaskSelectionScreen, getSectionInfo, startFullTest, startSection,
//   및 모든 V1 프로토타입 함수들 (initReadingSection, loadReadingPassage, etc.)
// — toeflData 하드코딩 데이터 기반 V1 전용 코드였으며,
//   V3에서는 섹션별 모듈 컨트롤러 + Supabase 데이터로 완전 대체됨
