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
        programBadgeElement.textContent = currentUser.program.replace('내벨업챌린지 Australia - ', 'AUS - ').replace('내벨업챌린지 - ', '');
    }

    // 코스 모드에 따라 적절한 렌더링
    var mode = window.courseMode || 'regular';
    if (mode === 'correction') {
        _renderCorrectionMode();
    } else if (mode === 'practice') {
        _renderPracticeMode();
    } else if (mode === 'australia') {
        _renderAustraliaMode();
    } else {
        _renderRegularMode();
    }
}

/** 정규코스 렌더링 */
function _renderRegularMode() {
    // 정규코스 컨테이너 표시 / 연습·첨삭·호주 컨테이너 숨김
    var regularContainer = document.getElementById('scheduleContainer');
    var practiceContainer = document.getElementById('practiceScheduleContainer');
    var correctionContainer = document.getElementById('correctionScheduleContainer');
    var australiaContainer = document.getElementById('australiaScheduleContainer');
    var scheduleHeader = document.querySelector('#scheduleScreen .schedule-header');
    if (regularContainer) regularContainer.style.display = '';
    if (practiceContainer) practiceContainer.style.display = 'none';
    if (correctionContainer) correctionContainer.style.display = 'none';
    if (australiaContainer) australiaContainer.style.display = 'none';
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
    // 정규·첨삭·호주 컨테이너 숨김 / 연습코스 컨테이너 표시
    var regularContainer = document.getElementById('scheduleContainer');
    var practiceContainer = document.getElementById('practiceScheduleContainer');
    var correctionContainer = document.getElementById('correctionScheduleContainer');
    var australiaContainer = document.getElementById('australiaScheduleContainer');
    var scheduleHeader = document.querySelector('#scheduleScreen .schedule-header');
    if (regularContainer) regularContainer.style.display = 'none';
    if (practiceContainer) practiceContainer.style.display = '';
    if (correctionContainer) correctionContainer.style.display = 'none';
    if (australiaContainer) australiaContainer.style.display = 'none';
    if (scheduleHeader) {
        scheduleHeader.querySelector('h1').textContent = 'PRACTICE MODE';
        scheduleHeader.querySelector('p').textContent = 'Select the desired practice.';
    }
    
    renderPracticeSchedule();
}

/** 첨삭(FEEDBACK) 모드 렌더링 */
function _renderCorrectionMode() {
    // 정규·연습·호주 컨테이너 숨김 / 첨삭 컨테이너 표시
    var regularContainer = document.getElementById('scheduleContainer');
    var practiceContainer = document.getElementById('practiceScheduleContainer');
    var correctionContainer = document.getElementById('correctionScheduleContainer');
    var australiaContainer = document.getElementById('australiaScheduleContainer');
    var scheduleHeader = document.querySelector('#scheduleScreen .schedule-header');
    if (regularContainer) regularContainer.style.display = 'none';
    if (practiceContainer) practiceContainer.style.display = 'none';
    if (correctionContainer) correctionContainer.style.display = '';
    if (australiaContainer) australiaContainer.style.display = 'none';
    if (scheduleHeader) {
        scheduleHeader.querySelector('h1').textContent = '1:1 FEEDBACK';
        scheduleHeader.querySelector('p').textContent = 'Select the desired session.';
    }

    renderCorrectionSchedule();
}

/** Australia 모드 렌더링 */
function _renderAustraliaMode() {
    // 정규·연습·첨삭 컨테이너 숨김 / 호주 컨테이너 표시
    var regularContainer = document.getElementById('scheduleContainer');
    var practiceContainer = document.getElementById('practiceScheduleContainer');
    var correctionContainer = document.getElementById('correctionScheduleContainer');
    var australiaContainer = document.getElementById('australiaScheduleContainer');
    var scheduleHeader = document.querySelector('#scheduleScreen .schedule-header');
    if (regularContainer) regularContainer.style.display = 'none';
    if (practiceContainer) practiceContainer.style.display = 'none';
    if (correctionContainer) correctionContainer.style.display = 'none';
    if (australiaContainer) australiaContainer.style.display = '';
    if (scheduleHeader) {
        scheduleHeader.querySelector('h1').innerHTML = 'NEVEL-UP TESTROOM <span style="font-size:0.5em; font-weight:400; opacity:0.7; vertical-align:middle;">Australia</span>';
        scheduleHeader.querySelector('p').textContent = 'Select the desired week and day.';
    }
    
    renderAustraliaSchedule(currentUser.program);
}

/** Australia 스케줄 렌더링 (TESTROOM과 동일 구조) */
function renderAustraliaSchedule(program) {
    var container = document.getElementById('australiaScheduleContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    // 프로그램 타입 결정
    var programType = program.includes('Fast') ? 'fast' : 'standard';
    var totalWeeks = programType === 'standard' ? 8 : 4;
    
    console.log('[Australia] schedule render: ' + programType + ', weeks=' + totalWeeks);
    
    // 호주과정 전용 시작일 사용 (없으면 정규 시작일 fallback)
    var ausDate = currentUser && currentUser.australiaStartDate ? currentUser.australiaStartDate : null;
    var fallbackDate = currentUser && currentUser.startDate ? currentUser.startDate : null;
    var startDateStr = ausDate || fallbackDate;
    var startDate = startDateStr ? new Date(startDateStr + 'T00:00:00') : null;
    console.log('[Australia] startDate:', startDateStr, ausDate ? '(호주전용)' : '(정규 fallback)');
    var monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    
    for (var week = 1; week <= totalWeeks; week++) {
        (function(w) {
            var weekBlock = document.createElement('div');
            weekBlock.className = 'week-block';
            
            var weekHeader = document.createElement('div');
            weekHeader.className = 'week-header';
            
            var weekTitle = document.createElement('h2');
            weekTitle.className = 'week-title';
            weekTitle.textContent = 'Week ' + String(w).padStart(2, '0');
            
            var weekDivider = document.createElement('div');
            weekDivider.className = 'week-divider';
            
            weekHeader.appendChild(weekTitle);
            weekHeader.appendChild(weekDivider);
            
            var daysGrid = document.createElement('div');
            daysGrid.className = 'days-grid';
            
            var dayMapping = {
                '일': 'sunday', '월': 'monday', '화': 'tuesday',
                '수': 'wednesday', '목': 'thursday', '금': 'friday'
            };
            
            daysOfWeek.forEach(function(dayKr, dayIndex) {
                var dayEn = dayMapping[dayKr];
                var dayButton = document.createElement('button');
                dayButton.className = 'day-button';
                
                var tasks = getAusDayTasks(programType, w, dayEn);
                
                dayButton.onclick = function() {
                    selectAustraliaDay(w, dayKr, dayEn);
                };
                
                var dateStr = '';
                if (startDate) {
                    var d = new Date(startDate);
                    d.setDate(d.getDate() + (w - 1) * 7 + dayIndex);
                    dateStr = monthNames[d.getMonth()] + ' ' + String(d.getDate()).padStart(2, '0');
                }
                
                dayButton.innerHTML =
                    '<span class="day-name">' + dayEnShort[dayKr] + '</span>' +
                    '<div class="progress-dot dot-none"></div>' +
                    '<span class="day-tasks">' + dateStr + '</span>';
                
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
        })(week);
    }
}

/** Australia 요일 선택 */
function selectAustraliaDay(week, dayKr, dayEn) {
    if (!currentUser) return;
    
    currentTest.currentWeek = week;
    currentTest.currentDay = dayKr;
    
    var program = currentUser.program;
    var programType = program.includes('Fast') ? 'fast' : 'standard';
    var tasks = getAusDayTasks(programType, week, dayEn);
    
    if (tasks.length === 0) return;
    
    showAustraliaTaskListScreen(week, dayKr, tasks);
}

/** Australia 과제 목록 화면 (TESTROOM showTaskListScreen 복제, 클릭 시 준비중 팝업) */
function showAustraliaTaskListScreen(week, dayKr, tasks) {
    console.log('[Australia] task list: Week ' + week + ' ' + dayKr + ' tasks=' + tasks.length);

    document.querySelectorAll('.screen').forEach(function(screen) {
        screen.classList.remove('active');
        screen.style.display = 'none';
    });

    // 기존 OMR 섹션 제거
    var oldOmr = document.querySelector('#taskListScreen .omr-section-area');
    if (oldOmr) oldOmr.remove();

    var taskListScreenEl = document.getElementById('taskListScreen');
    taskListScreenEl.classList.add('active');
    taskListScreenEl.style.display = 'block';
    
    if (currentUser) {
        var userNameElement = document.getElementById('currentUserName');
        var programBadgeElement = document.getElementById('currentUserProgramBadge');
        if (userNameElement) userNameElement.textContent = currentUser.name;
        if (programBadgeElement) programBadgeElement.textContent = currentUser.program.replace('내벨업챌린지 Australia - ', 'AUS - ').replace('내벨업챌린지 - ', '');
    }

    var welcomeHeader = document.querySelector('#taskListScreen .welcome-header h1');
    var subtitle = document.querySelector('#taskListScreen .welcome-header .subtitle');

    if (welcomeHeader) {
        _renderDayNavHeader(welcomeHeader, week, dayKr, true);
    }
    if (subtitle) {
        subtitle.textContent = tasks.length + '개의 과제가 있습니다';
    }

    _renderDeadlineBanner(week, dayKr);

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
            } else if (taskName.includes('입문서')) {
                icon = 'fas fa-book-reader';
                description = 'PDF 읽기';
            } else if (taskName.includes('리딩')) {
                icon = 'fas fa-book-open';
                description = '독해 연습';
            } else if (taskName.includes('리스닝')) {
                icon = 'fas fa-headphones';
                description = '듣기 연습';
            } else if (taskName.includes('통스')) {
                icon = 'fas fa-microphone';
                description = '말하기 연습';
            } else if (taskName.includes('토라')) {
                icon = 'fas fa-pen';
                description = '쓰기 연습';
            } else if (taskName.includes('브레인스토밍')) {
                icon = 'fas fa-brain';
                description = '브레인스토밍';
            } else if (taskName.includes('독스')) {
                icon = 'fas fa-microphone';
                description = '독립형 스피킹';
            }
            
            card.onclick = function() {
                if (taskName.includes('내벨업보카') || taskName.includes('입문서')) {
                    // 내벨업보카·입문서는 정규과정과 동일 — executeTask가 유형별 분기 처리
                    if (!currentTest.currentWeek) currentTest.currentWeek = week;
                    if (!currentTest.currentDay) currentTest.currentDay = dayKr;
                    executeTask(taskName);
                } else if (_isAusSelectableTask(taskName)) {
                    // 리딩/리스닝/통스/토라 → 문제풀기·해설보기 선택 화면
                    _showAusTaskSelectScreen(taskName, week, dayKr);
                } else {
                    _showAusPreparing();
                }
            };
            
            card.innerHTML =
                '<div class="card-icon"><i class="' + icon + '"></i></div>' +
                '<h3>' + taskName + '</h3>' +
                '<p>' + description + '</p>';

            sectionsGrid.appendChild(card);
        });

        // ── OMR 채점 섹션 렌더링 ──
        _renderOmrSection(sectionsGrid, tasks, week, dayKr);
    }
}

/**
 * 과제 목록 화면 하단에 OMR 채점 섹션 추가
 * 리딩: 개별 OMR, 리스닝: 하루 통합 OMR
 */
function _renderOmrSection(container, tasks, week, dayKr) {
    var readingTasks = [];
    var listeningTasks = [];

    tasks.forEach(function(t) {
        var rMatch = t.match(/^리딩\s*(\d+)$/);
        var lMatch = t.match(/^리스닝\s*(\d+)$/);
        if (rMatch) readingTasks.push(parseInt(rMatch[1]));
        if (lMatch) listeningTasks.push(parseInt(lMatch[1]));
    });

    if (readingTasks.length === 0 && listeningTasks.length === 0) return;

    var section = document.createElement('div');
    section.className = 'omr-section-area';
    section.innerHTML = '<div class="omr-section-divider"><span>OMR 채점</span></div>';

    var userId = (currentUser && currentUser.id) ? currentUser.id : '';

    // 리딩 OMR 카드 (개별)
    readingTasks.forEach(function(num) {
        var card = _createOmrCard({
            icon: '📖',
            label: '리딩' + num + ' OMR 카드',
            type: 'reading',
            modules: [num],
            week: week,
            day: dayKr,
            userId: userId
        });
        section.appendChild(card);
    });

    // 리스닝 OMR 카드 (하루 통합)
    if (listeningTasks.length > 0) {
        var label = listeningTasks.length === 1
            ? '리스닝' + listeningTasks[0] + ' OMR 카드'
            : '리스닝 OMR 카드 (리스닝' + listeningTasks[0] + '~' + listeningTasks[listeningTasks.length - 1] + ')';

        var card = _createOmrCard({
            icon: '🎧',
            label: label,
            type: 'listening',
            modules: listeningTasks,
            week: week,
            day: dayKr,
            userId: userId
        });
        section.appendChild(card);
    }

    container.parentNode.appendChild(section);

    // 제출 상태 비동기 업데이트
    _updateOmrSubmitStatus(section, week, dayKr, readingTasks, listeningTasks, userId);
}

function _createOmrCard(opts) {
    var card = document.createElement('div');
    card.className = 'omr-card';
    card.setAttribute('data-type', opts.type);
    card.setAttribute('data-modules', opts.modules.join(','));

    card.innerHTML =
        '<div class="omr-card-left">' +
            '<span class="omr-card-icon">' + opts.icon + '</span>' +
            '<div class="omr-card-info">' +
                '<span class="omr-card-label">' + opts.label + '</span>' +
                '<span class="omr-card-status" data-status-key="' + opts.type + '_' + opts.modules.join(',') + '">확인 중...</span>' +
            '</div>' +
        '</div>' +
        '<i class="fas fa-chevron-right omr-card-arrow"></i>';

    card.onclick = function() {
        var statusEl = card.querySelector('.omr-card-status');
        if (statusEl && statusEl.getAttribute('data-submitted') === 'true') {
            _showOmrAlreadyPopup();
            return;
        }
        var url = 'omr-card.html?type=' + opts.type
            + '&modules=' + opts.modules.join(',')
            + '&week=' + encodeURIComponent(opts.week)
            + '&day=' + encodeURIComponent(opts.day)
            + '&userId=' + encodeURIComponent(opts.userId);
        window.open(url, 'omrCard', 'width=700,height=800,scrollbars=yes,resizable=yes');
    };

    return card;
}

function _showOmrAlreadyPopup() {
    var overlay = document.createElement('div');
    overlay.className = 'omr-confirm-overlay';
    overlay.innerHTML =
        '<div class="omr-confirm-box">' +
            '<div class="omr-confirm-icon"><i class="fas fa-check-circle" style="color:#22c55e;font-size:40px;"></i></div>' +
            '<div class="omr-confirm-title">이미 제출 완료</div>' +
            '<div class="omr-confirm-desc">OMR 카드는 실전 풀이 기록만 수집되므로,<br>다시 풀거나 답을 수정할 수 없습니다.</div>' +
            '<div class="omr-confirm-buttons">' +
                '<button class="omr-confirm-ok" id="omrAlreadyClose">확인</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.getElementById('omrAlreadyClose').onclick = function() { overlay.remove(); };
}

async function _updateOmrSubmitStatus(section, week, dayKr, readingTasks, listeningTasks, userId) {
    if (!userId) return;

    async function checkSubmitted(type, mod) {
        var q = 'user_id=eq.' + userId
            + '&section_type=eq.' + type
            + '&module_number=eq.' + mod
            + '&week=eq.' + encodeURIComponent(String(week))
            + '&day=eq.' + encodeURIComponent(dayKr)
            + '&initial_record=not.is.null'
            + '&select=initial_record'
            + '&limit=1';
        var rows = await supabaseSelect('aus_study_results', q);
        return rows && rows.length > 0 ? rows[0] : null;
    }

    // 리딩 상태
    for (var i = 0; i < readingTasks.length; i++) {
        var num = readingTasks[i];
        var rec = await checkSubmitted('reading', num);
        var statusEl = section.querySelector('[data-status-key="reading_' + num + '"]');
        if (statusEl) {
            if (rec && rec.initial_record) {
                var record = typeof rec.initial_record === 'string' ? JSON.parse(rec.initial_record) : rec.initial_record;
                statusEl.textContent = '제출 완료 (' + (record.score || 0) + '점)';
                statusEl.classList.add('omr-status-done');
                statusEl.setAttribute('data-submitted', 'true');
                statusEl.closest('.omr-card').classList.add('omr-card-done');
            } else {
                statusEl.textContent = '미제출';
                statusEl.classList.add('omr-status-pending');
            }
        }
    }

    // 리스닝 상태 (첫 번째 모듈로 확인)
    if (listeningTasks.length > 0) {
        var rec = await checkSubmitted('listening', listeningTasks[0]);
        var statusEl = section.querySelector('[data-status-key="listening_' + listeningTasks.join(',') + '"]');
        if (statusEl) {
            if (rec && rec.initial_record) {
                var record = typeof rec.initial_record === 'string' ? JSON.parse(rec.initial_record) : rec.initial_record;
                var scoreText = record.score !== undefined ? record.score + '점' : (record.total_correct + '/' + record.total_questions);
                statusEl.textContent = '제출 완료 (' + scoreText + ')';
                statusEl.classList.add('omr-status-done');
                statusEl.setAttribute('data-submitted', 'true');
                statusEl.closest('.omr-card').classList.add('omr-card-done');
            } else {
                statusEl.textContent = '미제출';
                statusEl.classList.add('omr-status-pending');
            }
        }
    }
}

// OMR 제출 완료 메시지 수신 → 상태 갱신
window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'omr-submitted') {
        // ProgressTracker 캐시 업데이트
        if (typeof ProgressTracker !== 'undefined') {
            (e.data.modules || []).forEach(function(mod) {
                ProgressTracker.markCompleted(e.data.omrType, mod);
            });
            ProgressTracker.updateTaskCards();
        }
        // OMR 카드 상태 업데이트 (페이지 새로고침 없이)
        var omrCards = document.querySelectorAll('.omr-card');
        omrCards.forEach(function(card) {
            var type = card.getAttribute('data-type');
            var mods = card.getAttribute('data-modules');
            if (type === e.data.omrType) {
                var submittedMods = (e.data.modules || []).map(String);
                var cardMods = mods.split(',');
                var match = cardMods.some(function(m) { return submittedMods.indexOf(m) >= 0; });
                if (match) {
                    var statusEl = card.querySelector('.omr-card-status');
                    if (statusEl) {
                        statusEl.textContent = '제출 완료';
                        statusEl.classList.remove('omr-status-pending');
                        statusEl.classList.add('omr-status-done');
                        statusEl.setAttribute('data-submitted', 'true');
                    }
                    card.classList.add('omr-card-done');
                }
            }
        });
    }
});

/**
 * Australia 과제가 선택 화면(문제풀기/해설보기) 대상인지 판별
 * 리딩, 리스닝, 통스, 토라(통라), 브레인스토밍 대상
 * 내벨업보카, 입문서는 제외
 */
function _isAusSelectableTask(taskName) {
    if (taskName.includes('리딩')) return true;
    if (taskName.includes('리스닝')) return true;
    if (taskName.includes('통스')) return true;
    if (taskName.includes('통라')) return true;
    if (taskName.includes('토라')) return true;
    if (taskName.includes('브레인스토밍')) return true;
    if (taskName.includes('독스')) return true;
    return false;
}

// ─── Australia 리딩 외부 링크 매핑 ───
var AUS_READING_LINKS = {
    1:  { solve: 'https://test618.com/toefl/read/search?title=warm&lang=en',            review: 'https://test618.com/toefl/read/580.html' },
    2:  { solve: 'https://test618.com/toefl/read/search?title=bantu&lang=en',            review: 'https://test618.com/toefl/read/741.html' },
    3:  { solve: 'https://test618.com/toefl/read/search?title=sculpture&lang=en',        review: 'https://test618.com/toefl/read/588.html' },
    4:  { solve: 'https://test618.com/toefl/read/search?title=rome&lang=en',             review: 'https://test618.com/toefl/read/740.html' },
    5:  { solve: 'https://test618.com/toefl/read/search?title=signal&lang=en',           review: 'https://test618.com/toefl/read/658.html' },
    6:  { solve: 'https://test618.com/toefl/read/search?title=architecture&lang=en',     review: 'https://test618.com/toefl/read/519.html' },
    7:  { solve: 'https://test618.com/toefl/read/search?title=nestlings&lang=en',        review: 'https://test618.com/toefl/read/727.html' },
    8:  { solve: 'https://test618.com/toefl/read/search?title=clocks&lang=en',           review: 'https://test618.com/toefl/read/1205.html' },
    9:  { solve: 'https://test618.com/toefl/read/search?title=cave%20art&lang=en',       review: 'https://test618.com/toefl/read/633.html' },
    10: { solve: 'https://test618.com/toefl/read/search?title=children&lang=en',         review: 'https://test618.com/toefl/read/681.html' },
    11: { solve: 'https://test618.com/toefl/read/search?title=Conizing&lang=en',         review: 'https://test618.com/toefl/read/603.html' },
    12: { solve: 'https://test618.com/toefl/read/search?title=deer&lang=en',             review: 'https://test618.com/toefl/read/627.html' },
    13: { solve: 'https://test618.com/toefl/read/search?title=aquifer&lang=en',          review: 'https://test618.com/toefl/read/525.html' },
    14: { solve: 'https://test618.com/toefl/read/search?title=desert%20formation&lang=en', review: 'https://test618.com/toefl/read/561.html' },
    15: { solve: 'https://test618.com/toefl/read/search?title=early%20cinema&lang=en',   review: 'https://test618.com/toefl/read/582.html' },
    16: { solve: 'https://test618.com/toefl/read/search?title=dealing&lang=en',          review: 'https://test618.com/toefl/read/61710.html' }
};

/**
 * 과제명에서 리딩 번호 추출
 * "리딩1" → 1, "리딩17" → 17, "리스닝3" → null
 * @param {string} taskName
 * @returns {number|null}
 */
function _getAusReadingNumber(taskName) {
    var match = taskName.match(/^리딩\s*(\d+)$/);
    return match ? parseInt(match[1]) : null;
}

// ─── Australia 통스 외부 링크 매핑 ───
var AUS_INTSPK_LINKS = {
    1: { review: 'https://test618.com/toefl/speaking/35656.html' },
    2: { review: 'https://test618.com/toefl/speaking/35608.html' },
    3: { review: 'https://test618.com/toefl/speaking/35657.html' },
    4: { review: 'https://test618.com/toefl/speaking/35717.html' },
    5: { review: 'https://test618.com/toefl/speaking/35429.html' },
    6: { review: 'https://test618.com/toefl/speaking/35611.html' },
    7: { review: 'https://test618.com/toefl/speaking/35609.html' },
    8: { review: 'https://test618.com/toefl/speaking/35617.html' }
};

// ─── Australia 리스닝 외부 링크 매핑 ───
var AUS_LISTENING_LINKS = {
    1:  { solve: 'https://test618.com/toefl/listening/exercise?id=1305',  review: 'https://test618.com/toefl/listening/1305.html' },
    2:  { solve: 'https://test618.com/toefl/listening/exercise?id=1079',  review: 'https://test618.com/toefl/listening/1079.html' },
    3:  { solve: 'https://test618.com/toefl/listening/exercise?id=1306',  review: 'https://test618.com/toefl/listening/1306.html' },
    4:  { solve: 'https://test618.com/toefl/listening/exercise?id=1407',  review: 'https://test618.com/toefl/listening/1407.html' },
    5:  { solve: 'https://test618.com/toefl/listening/exercise?id=1413',  review: 'https://test618.com/toefl/listening/1413.html' },
    6:  { solve: 'https://test618.com/toefl/listening/exercise?id=1427',  review: 'https://test618.com/toefl/listening/1427.html' },
    7:  { solve: 'https://test618.com/toefl/listening/exercise?id=1432',  review: 'https://test618.com/toefl/listening/1432.html' },
    8:  { solve: 'https://test618.com/toefl/listening/exercise?id=1436',  review: 'https://test618.com/toefl/listening/1436.html' },
    9:  { solve: 'https://test618.com/toefl/listening/exercise?id=7553',  review: 'https://test618.com/toefl/listening/7553.html' },
    10: { solve: 'https://test618.com/toefl/listening/exercise?id=45821', review: 'https://test618.com/toefl/listening/45821.html' },
    11: { solve: 'https://test618.com/toefl/listening/exercise?id=2696',  review: 'https://test618.com/toefl/listening/2696.html' },
    12: { solve: 'https://test618.com/toefl/listening/exercise?id=7548',  review: 'https://test618.com/toefl/listening/7548.html' },
    13: { solve: 'https://test618.com/toefl/listening/exercise?id=45820', review: 'https://test618.com/toefl/listening/45820.html' },
    14: { solve: 'https://test618.com/toefl/listening/exercise?id=1004',  review: 'https://test618.com/toefl/listening/1004.html' },
    15: { solve: 'https://test618.com/toefl/listening/exercise?id=1309',  review: 'https://test618.com/toefl/listening/1309.html' },
    16: { solve: 'https://test618.com/toefl/listening/exercise?id=1125',  review: 'https://test618.com/toefl/listening/1125.html' },
    17: { solve: 'https://test618.com/toefl/listening/exercise?id=1001',  review: 'https://test618.com/toefl/listening/1001.html' },
    18: { solve: 'https://test618.com/toefl/listening/exercise?id=1002',  review: 'https://test618.com/toefl/listening/1002.html' },
    19: { solve: 'https://test618.com/toefl/listening/exercise?id=1126',  review: 'https://test618.com/toefl/listening/1126.html' },
    20: { solve: 'https://test618.com/toefl/listening/exercise?id=1003',  review: 'https://test618.com/toefl/listening/1003.html' },
    21: { solve: 'https://test618.com/toefl/listening/exercise?id=1128',  review: 'https://test618.com/toefl/listening/1128.html' },
    22: { solve: 'https://test618.com/toefl/listening/exercise?id=1005',  review: 'https://test618.com/toefl/listening/1005.html' },
    23: { solve: 'https://test618.com/toefl/listening/exercise?id=1008',  review: 'https://test618.com/toefl/listening/1008.html' },
    24: { solve: 'https://test618.com/toefl/listening/exercise?id=1136',  review: 'https://test618.com/toefl/listening/1136.html' },
    25: { solve: 'https://test618.com/toefl/listening/exercise?id=1011',  review: 'https://test618.com/toefl/listening/1011.html' },
    26: { solve: 'https://test618.com/toefl/listening/exercise?id=1046',  review: 'https://test618.com/toefl/listening/1046.html' },
    27: { solve: 'https://test618.com/toefl/listening/exercise?id=1013',  review: 'https://test618.com/toefl/listening/1013.html' },
    28: { solve: 'https://test618.com/toefl/listening/exercise?id=1021',  review: 'https://test618.com/toefl/listening/1021.html' },
    29: { solve: 'https://test618.com/toefl/listening/exercise?id=1080',  review: 'https://test618.com/toefl/listening/1080.html' },
    30: { solve: 'https://test618.com/toefl/listening/exercise?id=1025',  review: 'https://test618.com/toefl/listening/1025.html' },
    31: { solve: 'https://test618.com/toefl/listening/exercise?id=1049',  review: 'https://test618.com/toefl/listening/1049.html' },
    32: { solve: 'https://test618.com/toefl/listening/exercise?id=1123',  review: 'https://test618.com/toefl/listening/1123.html' },
    33: { solve: 'https://test618.com/toefl/listening/exercise?id=1130',  review: 'https://test618.com/toefl/listening/1130.html' },
    34: { solve: 'https://test618.com/toefl/listening/exercise?id=1250',  review: 'https://test618.com/toefl/listening/1250.html' },
    35: { solve: 'https://test618.com/toefl/listening/exercise?id=1170',  review: 'https://test618.com/toefl/listening/1170.html' }
};

/**
 * 과제명에서 리스닝 번호 추출
 * "리스닝1" → 1, "리스닝35" → 35, "리딩3" → null
 */
function _getAusListeningNumber(taskName) {
    var match = taskName.match(/^리스닝\s*(\d+)$/);
    return match ? parseInt(match[1]) : null;
}

// ─── Australia 과제별 안내 모달 데이터 ───
var AUS_GUIDE_DATA = {
    '리딩': {
        emoji: '📖',
        title: '리딩 문제 푸는 방법',
        steps: [
            '<strong>실전풀이 바로가기</strong>를 눌러 실제 리딩 기출문제를 풀어주세요. 제한시간은 <strong>20분</strong>입니다.',
            '문제를 풀 때는 반드시 <strong>정답을 메모지에 기록</strong>해 주세요. 외부 사이트에서는 답안이 저장되거나 채점되지 않습니다.',
            '실전풀이를 모두 완료한 뒤 <strong>다시보기</strong>를 눌러 지문, 문제, 정답을 확인하고 <strong>채점</strong>해 주세요.',
            '채점을 완료한 뒤 <strong>해설보기</strong> 버튼을 눌러 해당 지문에 대한 해설을 보고 <strong>오답 정리</strong>를 진행해 주세요.'
        ]
    },
    '리스닝': {
        emoji: '🎧',
        title: '리스닝 문제 푸는 방법',
        sections: [
            {
                icon: '🔇',
                heading: '오디오가 자동 재생되지 않나요?',
                description: '최근 Chrome 업데이트로 자동 오디오 재생이 차단될 수 있어요. 아래 설정을 한 번만 해주시면 이후부터 정상 재생됩니다.',
                steps: [
                    '주소창에 <strong>chrome://settings/content/sound</strong> 를 입력 후 엔터를 눌러주세요.',
                    '\"소리 재생이 허용됨\" 항목에서 <strong>추가</strong> 버튼을 클릭해 주세요.',
                    '<strong>https://test618.com</strong> 을 입력하고 추가해 주세요.',
                    '설정 완료 후 문제 풀이 페이지를 <strong>새로고침</strong>하면 자동 재생이 정상 작동합니다.'
                ]
            },
            {
                icon: '🎧',
                heading: '리스닝 문제 푸는 방법',
                steps: [
                    '<strong>실전풀이 바로가기</strong>를 눌러 실제 리스닝 기출문제를 풀어주세요. 제한시간은 <strong>20분</strong>입니다.',
                    '문제를 풀 때는 반드시 <strong>정답을 메모지에 기록</strong>해 주세요. 외부 사이트에서는 답안이 저장되거나 채점되지 않습니다.',
                    '실전풀이를 모두 완료한 뒤 <strong>다시보기</strong>를 눌러 지문, 문제, 정답을 확인하고 <strong>채점</strong>해 주세요.',
                    '채점을 완료한 뒤 <strong>해설보기</strong> 버튼을 눌러 해당 지문에 대한 해설을 보고 <strong>오답 정리</strong>를 진행해 주세요.'
                ]
            }
        ]
    },
    '통스': {
        emoji: '🎤',
        title: '통스 문제 푸는 방법',
        sections: [
            {
                icon: '📝',
                heading: '진행 방법',
                steps: [
                    '<strong>통스 시작하기</strong>를 눌러 화면의 안내에 맞게 과제를 진행해 주세요.',
                    '과제를 진행하면서 반드시 <strong>휴대폰 기본 녹음 앱</strong>으로 본인의 답변을 <strong>녹음</strong>해 주세요. (1차 녹음)',
                    '1차 녹음을 완료한 뒤 <strong>다시보기</strong>를 눌러 지문과 문제를 다시 확인하고, <strong>해설보기</strong>를 통해 모범 답변과 비교하며 공부해 주세요.',
                    '해설을 충분히 학습한 뒤, 개선된 답변을 다시 녹음해 주세요. (2차 녹음)'
                ]
            },
            {
                icon: '📸',
                heading: '완료 후 할 일',
                steps: [
                    '<strong>1차 녹음본과 2차 녹음본</strong>을 함께 <strong>공부인증 게시판</strong>에 업로드해 주세요.',
                    '완료 후 <strong>해설보기</strong>를 눌러 올바른 답변 방향을 확인하고 배워 보세요.'
                ]
            }
        ]
    },
    '독스': {
        emoji: '🎙️',
        title: '독스 문제 푸는 방법',
        sections: [
            {
                icon: '📝',
                heading: '진행 방법',
                steps: [
                    '시작하기 전에 반드시 <strong>노트테이킹 용지를 펼쳐 준비</strong>해 주세요.',
                    '<strong>독스 시작하기</strong>를 눌러 진행합니다. 주제가 나오면 <strong>15초</strong> 안에 떠오르는 아이디어를 노트테이킹합니다.',
                    '이어서 <strong>45초</strong> 동안 노트를 바탕으로 답변을 말해 보세요. 배운 내용을 활용하되, 너무 완벽하게 하려 하지 않아도 괜찮아요.',
                    '<strong>시간을 엄수하는 것이 정말 중요합니다.</strong> 타이머가 끝나면 바로 멈추세요.',
                    '반드시 <strong>휴대폰 기본 녹음 앱</strong>으로 본인의 답변을 <strong>녹음</strong>해 주세요.'
                ]
            },
            {
                icon: '📸',
                heading: '완료 후 할 일',
                steps: [
                    '<strong>녹음본</strong>을 <strong>공부인증 게시판</strong>에 업로드해 주세요.',
                    '완료 후 <strong>해설보기</strong>를 눌러 올바른 답변 방향을 확인하고 배워 보세요.'
                ]
            }
        ]
    },
    '토라': {
        emoji: '✏️',
        title: '토라 문제 푸는 방법',
        sections: [
            {
                icon: '📝',
                heading: '진행 방법',
                steps: [
                    '<strong>토라 시작하기</strong>를 눌러 과제를 진행해 주세요.',
                    '<strong>10분</strong> 제한시간 내에 배운 내용을 토대로 최선의 답변을 작성하여 <strong>제출</strong>해 주세요.',
                    '제출 후 <strong>답안 저장</strong>을 눌러 본인의 답안을 저장해 주세요.'
                ]
            },
            {
                icon: '📸',
                heading: '완료 후 할 일',
                steps: [
                    '저장한 <strong>1차 답안</strong>을 <strong>공부인증 게시판</strong>에 업로드해 주세요.',
                    '반드시 <strong>해설보기</strong>를 눌러 모범 답변을 확인하고, 이를 참고하여 개선한 <strong>2차 답변</strong>을 작성해 주세요.',
                    '<strong>1차 답안과 2차 답변</strong>을 함께 <strong>공부인증 게시판</strong>에 업로드해 주세요.'
                ]
            }
        ]
    },
    '통라': {
        emoji: '✍️',
        title: '통라 문제 푸는 방법',
        sections: [
            {
                icon: '📝',
                heading: '진행 방법',
                steps: [
                    '<strong>통라 시작하기</strong>를 눌러 실전 답안을 작성해 주세요.',
                    '답안 작성이 완료되면 <strong>답안 저장</strong>을 눌러 본인의 답안을 저장해 주세요.',
                    '<strong>다시보기</strong>를 눌러 지문과 오디오를 다시 확인하며 복습해 주세요.',
                    '<strong>해설보기</strong>를 눌러 모범 답안을 확인하고 본인의 답안과 비교해 보세요.'
                ]
            },
            {
                icon: '📸',
                heading: '완료 후 할 일',
                steps: [
                    '해설을 참고하여 개선한 <strong>2차 답안</strong>을 작성해 주세요.',
                    '<strong>1차 답안과 2차 답안</strong>을 함께 <strong>공부인증 게시판</strong>에 업로드해 주세요.'
                ]
            }
        ]
    },
    '브레인스토밍': {
        emoji: '🧠',
        title: '브레인스토밍 진행 방법',
        sections: [
            {
                icon: '💡',
                heading: '브레인스토밍이란?',
                description: '독스(TOEFL Speaking)와 달리, 브레인스토밍은 답변을 녹음·업로드하는 과제가 아닙니다. <strong>15초 안에 아이디어를 떠올리고, 45초 동안 답변해 보는 연습</strong>입니다. 문법이나 구성을 깊게 고민하기보다, <strong>15초 안에 아이디어를 생각해내는 것</strong>이 최우선 과제예요.'
            },
            {
                icon: '📝',
                heading: '진행 방법',
                steps: [
                    '시작하기 전에 반드시 <strong>노트테이킹 용지를 펼쳐 준비</strong>해 주세요.',
                    '<strong>브레인스토밍 시작하기</strong>를 눌러 진행합니다. 주제가 나오면 <strong>15초</strong> 안에 떠오르는 아이디어를 노트테이킹합니다.',
                    '이어서 <strong>45초</strong> 동안 노트를 바탕으로 답변을 말해 보세요. 배운 내용을 활용하되, 너무 완벽하게 하려 하지 않아도 괜찮아요.',
                    '<strong>시간을 엄수하는 것이 정말 중요합니다.</strong> 타이머가 끝나면 바로 멈추세요.'
                ]
            },
            {
                icon: '📸',
                heading: '완료 후 할 일',
                steps: [
                    '녹음본을 업로드할 필요는 없습니다. 대신 <strong>15초 동안 노트테이킹한 모습을 사진 찍어 업로드</strong>해 주세요.',
                    '완료 후 <strong>해설보기</strong>를 눌러 올바른 답변 방향을 확인하고 배워 보세요.'
                ]
            }
        ]
    }
};

// ─── 과제별 안내 모달 확인 여부 추적 ───
// 키: 과제 카테고리 (리딩, 리스닝 등), 값: true/false
window._ausGuideChecked = {};

/**
 * 과제명에서 카테고리 추출
 * @param {string} taskName
 * @returns {string|null}
 */
function _getAusTaskCategory(taskName) {
    if (taskName.includes('리딩')) return '리딩';
    if (taskName.includes('리스닝')) return '리스닝';
    if (taskName.includes('통스')) return '통스';
    if (taskName.includes('통라')) return '통라';
    if (taskName.includes('토라')) return '토라';
    if (taskName.includes('브레인스토밍')) return '브레인스토밍';
    if (taskName.includes('독스')) return '독스';
    return null;
}

/**
 * 과제가 해당 카테고리의 "첫 번째"인지 판별
 * 리딩1, 리스닝1, 통스1, 토라1, 브레인스토밍 Day 1
 * @param {string} taskName
 * @returns {boolean}
 */
function _isAusFirstTask(taskName) {
    // 리딩1, 리스닝1, 통스1, 토라1 (숫자 1만 매칭)
    if (/^리딩\s*1$/.test(taskName.trim())) return true;
    if (/^리스닝\s*1$/.test(taskName.trim())) return true;
    if (/^통스\s*1$/.test(taskName.trim())) return true;
    if (/^토라\s*1$/.test(taskName.trim())) return true;
    if (/^통라\s*1$/.test(taskName.trim())) return true;
    if (/브레인스토밍\s*Day\s*1$/i.test(taskName.trim())) return true;
    // 독스 TOPIC 1, 토라 1 형태도 첫 번째로 취급하지 않음 (번호가 있는 기본형만)
    return false;
}

/**
 * 안내 모달을 봐야 하는 강제 조건 체크
 * 첫 번째 과제이고, 아직 안내를 안 본 경우에만 true
 * @param {string} taskName
 * @returns {boolean}
 */
function _ausGuideRequired(taskName) {
    return false;
}

/**
 * "먼저 문제 푸는 방법을 확인해주세요" 알림 팝업
 */
function _showAusGuideRequiredAlert() {
    var existing = document.getElementById('ausGuideAlertOverlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'ausGuideAlertOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:16px;padding:32px 28px;text-align:center;max-width:340px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);';
    box.innerHTML =
        '<div style="font-size:40px;margin-bottom:14px;">📋</div>' +
        '<h3 style="margin:0 0 10px;font-size:17px;color:#1a1a2e;font-weight:700;">안내를 먼저 확인해 주세요</h3>' +
        '<p style="margin:0 0 22px;font-size:14px;color:#666;line-height:1.7;">' +
            '처음 진행하는 과제예요!<br>' +
            '위쪽의 <strong style="color:#5B4A9E;">"문제 푸는 방법 확인하기"</strong> 버튼을<br>먼저 눌러 진행 방법을 확인해 주세요.' +
        '</p>' +
        '<button id="ausGuideAlertCloseBtn" style="' +
            'background:#9480c5;color:#fff;border:none;border-radius:10px;' +
            'padding:12px 36px;font-size:15px;font-weight:600;cursor:pointer;' +
            'transition:background 0.2s;' +
        '">확인</button>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    document.getElementById('ausGuideAlertCloseBtn').onclick = function() {
        overlay.remove();
    };
    overlay.onclick = function(e) {
        if (e.target === overlay) overlay.remove();
    };
}

/**
 * 과제 안내 모달 열기
 * @param {string} category - 과제 카테고리 (리딩, 리스닝 등)
 */
function _openAusGuideModal(category) {
    var data = AUS_GUIDE_DATA[category];
    if (!data) return;

    // 기존 모달 제거
    var existing = document.getElementById('ausGuideModalOverlay');
    if (existing) existing.remove();

    // 본문 HTML 생성 — sections 배열이 있으면 섹션별, 없으면 단순 steps
    var bodyHtml = '';
    
    if (data.sections && data.sections.length > 0) {
        // ── 멀티 섹션 모드 ──
        for (var s = 0; s < data.sections.length; s++) {
            var sec = data.sections[s];
            bodyHtml += '<div class="aus-guide-section">';
            // 섹션 헤더
            bodyHtml += '<div class="aus-guide-section-header">';
            if (sec.icon) bodyHtml += '<span class="aus-guide-section-icon">' + sec.icon + '</span>';
            bodyHtml += '<span class="aus-guide-section-heading">' + sec.heading + '</span>';
            bodyHtml += '</div>';
            // 섹션 설명 (선택)
            if (sec.description) {
                bodyHtml += '<p class="aus-guide-section-desc">' + sec.description + '</p>';
            }
            // 섹션 스텝
            if (sec.steps && sec.steps.length > 0) {
                bodyHtml += '<ol class="aus-guide-modal-steps">';
                for (var i = 0; i < sec.steps.length; i++) {
                    bodyHtml += '<li class="aus-guide-step">';
                    bodyHtml += '<span class="aus-guide-step-num">' + (i + 1) + '</span>';
                    bodyHtml += '<span class="aus-guide-step-text">' + sec.steps[i] + '</span>';
                    bodyHtml += '</li>';
                }
                bodyHtml += '</ol>';
            }
            bodyHtml += '</div>';
        }
    } else if (data.steps) {
        // ── 단순 스텝 모드 ──
        bodyHtml += '<ol class="aus-guide-modal-steps">';
        for (var i = 0; i < data.steps.length; i++) {
            bodyHtml += '<li class="aus-guide-step">';
            bodyHtml += '<span class="aus-guide-step-num">' + (i + 1) + '</span>';
            bodyHtml += '<span class="aus-guide-step-text">' + data.steps[i] + '</span>';
            bodyHtml += '</li>';
        }
        bodyHtml += '</ol>';
    }

    // 모달 HTML
    var overlay = document.createElement('div');
    overlay.id = 'ausGuideModalOverlay';
    overlay.className = 'aus-guide-modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'aus-guide-modal';
    modal.innerHTML =
        '<div class="aus-guide-modal-header">' +
            '<div class="aus-guide-modal-header-left">' +
                '<span class="aus-guide-modal-emoji">' + data.emoji + '</span>' +
                '<h3 class="aus-guide-modal-title">' + data.title + '</h3>' +
            '</div>' +
            '<button class="aus-guide-modal-close" id="ausGuideModalCloseBtn">' +
                '<i class="fa-solid fa-xmark"></i>' +
            '</button>' +
        '</div>' +
        '<div class="aus-guide-modal-body">' + bodyHtml + '</div>' +
        '<div class="aus-guide-modal-footer">' +
            '<button class="aus-guide-modal-confirm-btn" id="ausGuideModalConfirmBtn">확인했습니다</button>' +
        '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 확인 완료 처리
    function closeAndMark() {
        window._ausGuideChecked[category] = true;
        overlay.remove();
        // 안내 버튼 체크 표시
        var guideBtn = document.getElementById('ausGuideBtn');
        if (guideBtn) guideBtn.classList.add('aus-guide-checked');
    }

    document.getElementById('ausGuideModalConfirmBtn').onclick = closeAndMark;
    document.getElementById('ausGuideModalCloseBtn').onclick = closeAndMark;
    overlay.onclick = function(e) {
        if (e.target === overlay) closeAndMark();
    };
}

/**
 * Australia 과제 선택 화면 표시 (문제풀기 바로가기 / 해설보기)
 * explain-viewer의 실전풀이/다시풀기 선택 화면과 동일 UX — 별도 screen으로 전환
 */
function _showAusTaskSelectScreen(taskName, week, dayKr) {
    console.log('[Australia] task select: ' + taskName + ' (Week ' + week + ' ' + dayKr + ')');
    
    // 아이콘·타입 결정
    var iconEmoji = '📚';
    if (taskName.includes('리딩')) iconEmoji = '📖';
    else if (taskName.includes('리스닝')) iconEmoji = '🎧';
    else if (taskName.includes('통스')) iconEmoji = '🎤';
    else if (taskName.includes('통라')) iconEmoji = '✍️';
    else if (taskName.includes('토라')) iconEmoji = '✏️';
    else if (taskName.includes('브레인스토밍')) iconEmoji = '🧠';
    else if (taskName.includes('독스')) iconEmoji = '🎙️';

    // 과제 카테고리 파악
    var category = _getAusTaskCategory(taskName);
    
    // 요일 영문 매핑
    var dayEnMap = { '일': 'SUNDAY', '월': 'MONDAY', '화': 'TUESDAY', '수': 'WEDNESDAY', '목': 'THURSDAY', '금': 'FRIDAY', '토': 'SATURDAY' };
    var dayEn = dayEnMap[dayKr] || dayKr;
    
    // 헤더 정보 세팅
    var iconBadge = document.getElementById('ausSelectIconBadge');
    var titleEl = document.getElementById('ausSelectTitle');
    var subtitleEl = document.getElementById('ausSelectSubtitle');
    
    if (iconBadge) iconBadge.textContent = iconEmoji;
    if (titleEl) titleEl.textContent = taskName;
    if (subtitleEl) subtitleEl.textContent = 'Week ' + week + ' - ' + dayEn;
    
    // ── 안내 버튼 상태 초기화 ──
    var guideBtn = document.getElementById('ausGuideBtn');
    if (guideBtn) {
        // 이미 이 카테고리를 확인한 적 있으면 체크 표시
        if (category && window._ausGuideChecked[category]) {
            guideBtn.classList.add('aus-guide-checked');
        } else {
            guideBtn.classList.remove('aus-guide-checked');
        }
        // 안내 버튼 클릭 → 모달 열기
        guideBtn.onclick = function() {
            if (category) {
                _openAusGuideModal(category);
            }
        };
    }
    
    // 뒤로가기 → 과제 목록(taskListScreen)으로 복귀
    var backBtn = document.getElementById('ausSelectBackBtn');
    if (backBtn) {
        backBtn.onclick = function() {
            showScreen('taskListScreen');
        };
    }
    
    // ── 3개 버튼에 강제 확인 가드 적용 ──
    function _guardedAction(actionFn) {
        if (_ausGuideRequired(taskName)) {
            _showAusGuideRequiredAlert();
            return;
        }
        actionFn();
    }
    
    // ── 유형 감지 ──
    var brainstormDay = (typeof _getAusBrainstormDay === 'function') ? _getAusBrainstormDay(taskName) : null;
    var intspkNumber = (typeof _getAusIntspkNumber === 'function') ? _getAusIntspkNumber(taskName) : null;
    var indSpkNumber = (typeof _getAusIndSpkNumber === 'function') ? _getAusIndSpkNumber(taskName) : null;
    var intwrtNumber = (typeof _getAusIntwrtNumber === 'function') ? _getAusIntwrtNumber(taskName) : null;
    var toraNumber = (typeof _getAusToraNumber === 'function') ? _getAusToraNumber(taskName) : null;

    // ── 외부 링크 확인 (리딩 / 리스닝 / 통스) ──
    var externalLinks = null;
    var readingNum = _getAusReadingNumber(taskName);
    if (readingNum && AUS_READING_LINKS[readingNum]) {
        externalLinks = AUS_READING_LINKS[readingNum];
    }
    var listeningNum = _getAusListeningNumber(taskName);
    if (listeningNum && AUS_LISTENING_LINKS[listeningNum]) {
        externalLinks = AUS_LISTENING_LINKS[listeningNum];
    }
    if (intspkNumber && AUS_INTSPK_LINKS[intspkNumber]) {
        externalLinks = AUS_INTSPK_LINKS[intspkNumber];
    }
    var splitBtn = document.querySelector('.aus-select-btn--split');
    var solveBtn = document.getElementById('ausSelectBtnSolve');
    var divider = document.querySelector('.aus-split-divider');
    var reviewBtnInSplit = document.getElementById('ausSelectBtnReview');

    if (brainstormDay || indSpkNumber || toraNumber) {
        // 브레인스토밍 / 독스 / 토라: 분할 해제 → 통 버튼으로 변경
        if (divider) divider.style.display = 'none';
        if (reviewBtnInSplit) reviewBtnInSplit.style.display = 'none';
        if (solveBtn) {
            solveBtn.style.flex = '1';
            if (brainstormDay) {
                solveBtn.querySelector('.aus-split-label').innerHTML = '브레인스토밍<br>시작하기';
            } else if (toraNumber) {
                solveBtn.querySelector('.aus-split-label').innerHTML = '토라<br>시작하기';
            } else {
                solveBtn.querySelector('.aus-split-label').innerHTML = '독스<br>시작하기';
            }
        }
    } else {
        // 일반 과제 + 통스 + 통라: 분할 원복
        if (divider) divider.style.display = '';
        if (reviewBtnInSplit) reviewBtnInSplit.style.display = '';
        if (solveBtn) {
            solveBtn.style.flex = '';
            if (intwrtNumber) {
                solveBtn.querySelector('.aus-split-label').innerHTML = '통라<br>시작하기';
            } else if (intspkNumber) {
                solveBtn.querySelector('.aus-split-label').innerHTML = '통스<br>시작하기';
            } else {
                solveBtn.querySelector('.aus-split-label').innerHTML = '실전풀이<br>바로가기';
            }
        }
    }

    if (solveBtn) {
        solveBtn.onclick = function() {
            _guardedAction(function() {
                console.log('[Australia] 실전풀이 바로가기 선택: ' + taskName);
                if (brainstormDay) {
                    startBrainstormModule(brainstormDay);
                } else if (intwrtNumber) {
                    startIntwrtModule(intwrtNumber);
                } else if (toraNumber) {
                    startAusDiscussionModule(toraNumber);
                } else if (indSpkNumber) {
                    startIndSpkModule(indSpkNumber);
                } else if (intspkNumber) {
                    startIntspkModule(intspkNumber);
                } else if (externalLinks && externalLinks.solve) {
                    window.open(externalLinks.solve, '_blank');
                } else {
                    _showAusPreparing();
                }
            });
        };
    }
    
    // 다시보기 버튼
    var intwrtReviewLinks = {
        1: 'https://test618.com/toefl/writing/720.html',
        2: 'https://test618.com/toefl/writing/636.html',
        3: 'https://test618.com/toefl/writing/1022.html',
        4: 'https://test618.com/toefl/writing/577.html',
        5: 'https://test618.com/toefl/writing/1016.html',
        6: 'https://test618.com/toefl/writing/776.html',
        7: 'https://test618.com/toefl/writing/913.html',
        8: 'https://test618.com/toefl/writing/1060.html'
    };
    var reviewBtn = document.getElementById('ausSelectBtnReview');
    if (reviewBtn) {
        reviewBtn.onclick = function() {
            _guardedAction(function() {
                console.log('[Australia] 다시보기 선택: ' + taskName);
                if (intwrtNumber && intwrtReviewLinks[intwrtNumber]) {
                    window.open(intwrtReviewLinks[intwrtNumber], '_blank');
                } else if (externalLinks && externalLinks.review) {
                    window.open(externalLinks.review, '_blank');
                } else {
                    _showAusPreparing();
                }
            });
        };
    }
    
    // 해설보기 버튼
    var explainBtn = document.getElementById('ausSelectBtnExplain');
    if (explainBtn) {
        explainBtn.onclick = function() {
            _guardedAction(function() {
                console.log('[Australia] 해설보기 선택: ' + taskName);
                if (category) {
                    var url = 'commentary.html?category=' + encodeURIComponent(category)
                        + '&week=' + encodeURIComponent(week)
                        + '&day=' + encodeURIComponent(dayKr);
                    window.location.href = url;
                } else {
                    _showAusPreparing();
                }
            });
        };
    }
    
    // 화면 전환
    showScreen('ausTaskSelectScreen');
}

/** Australia 준비중 팝업 */
function _showAusPreparing() {
    // 기존 팝업이 있으면 제거
    var existing = document.getElementById('ausPrepPopup');
    if (existing) existing.remove();
    
    var overlay = document.createElement('div');
    overlay.id = 'ausPrepPopup';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
    
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:16px;padding:32px 28px;text-align:center;max-width:320px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);';
    box.innerHTML =
        '<div style="font-size:48px;margin-bottom:16px;">🚧</div>' +
        '<h3 style="margin:0 0 8px;font-size:18px;color:#333;">준비중입니다</h3>' +
        '<p style="margin:0 0 20px;font-size:14px;color:#888;">이 과제는 아직 준비중입니다.</p>' +
        '<button id="ausPrepCloseBtn" style="background:#4A90D9;color:#fff;border:none;border-radius:8px;padding:10px 32px;font-size:15px;cursor:pointer;">확인</button>';
    
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    
    document.getElementById('ausPrepCloseBtn').onclick = function() {
        overlay.remove();
    };
    overlay.onclick = function(e) {
        if (e.target === overlay) overlay.remove();
    };
}

// renderCorrectionSchedule()은 js/correction/correction-main.js에서 정의

function renderSchedule(program) {
    const container = document.getElementById('scheduleContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    // 프로그램 타입 결정
    const programType = program.includes('Fast') ? 'fast' : 'standard';
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
    const programType = program.includes('Fast') ? 'fast' : 'standard';
    
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

// ─── 태스크 리스트 요일 네비게이션 ───
var _DAY_NAV_ORDER = ['일', '월', '화', '수', '목', '금'];
var _DAY_EN_MAP = { '일': 'SUNDAY', '월': 'MONDAY', '화': 'TUESDAY', '수': 'WEDNESDAY', '목': 'THURSDAY', '금': 'FRIDAY', '토': 'SATURDAY' };
var _DAY_EN_SHORT = { '일': 'SUN', '월': 'MON', '화': 'TUE', '수': 'WED', '목': 'THU', '금': 'FRI' };

function _findAdjacentDay(week, dayKr, direction, isAustralia) {
    if (!currentUser) return null;
    var programType = currentUser.program.includes('Fast') ? 'fast' : 'standard';
    var totalWeeks = programType === 'standard' ? 8 : 4;
    var idx = _DAY_NAV_ORDER.indexOf(dayKr);
    if (idx === -1) return null;

    var w = week;
    var d = idx;
    var getTasksFn = isAustralia ? getAusDayTasks : getDayTasks;
    var dayEnKeys = { '일': 'sunday', '월': 'monday', '화': 'tuesday', '수': 'wednesday', '목': 'thursday', '금': 'friday' };

    while (true) {
        if (direction === 'prev') {
            d--;
            if (d < 0) { w--; d = _DAY_NAV_ORDER.length - 1; }
        } else {
            d++;
            if (d >= _DAY_NAV_ORDER.length) { w++; d = 0; }
        }
        if (w < 1 || w > totalWeeks) return null;
        var nextDayKr = _DAY_NAV_ORDER[d];
        var tasks = getTasksFn(programType, w, dayEnKeys[nextDayKr]);
        if (tasks && tasks.length > 0) {
            return { week: w, dayKr: nextDayKr };
        }
    }
}

function _renderDayNavHeader(headerEl, week, dayKr, isAustralia) {
    var dayEn = _DAY_EN_MAP[dayKr] || dayKr;
    var prev = _findAdjacentDay(week, dayKr, 'prev', isAustralia);
    var next = _findAdjacentDay(week, dayKr, 'next', isAustralia);

    var prevHtml = '';
    if (prev) {
        var prevLabel = prev.week !== week
            ? 'W' + prev.week + ' ' + _DAY_EN_SHORT[prev.dayKr]
            : _DAY_EN_SHORT[prev.dayKr];
        prevHtml = '<button class="day-nav-btn day-nav-prev" data-week="' + prev.week + '" data-day="' + prev.dayKr + '">' +
            '<i class="fas fa-chevron-left day-nav-arrow"></i>' +
            '<span class="day-nav-label">' + prevLabel + '</span>' +
            '</button>';
    }

    var nextHtml = '';
    if (next) {
        var nextLabel = next.week !== week
            ? 'W' + next.week + ' ' + _DAY_EN_SHORT[next.dayKr]
            : _DAY_EN_SHORT[next.dayKr];
        nextHtml = '<button class="day-nav-btn day-nav-next" data-week="' + next.week + '" data-day="' + next.dayKr + '">' +
            '<i class="fas fa-chevron-right day-nav-arrow"></i>' +
            '<span class="day-nav-label">' + nextLabel + '</span>' +
            '</button>';
    }

    headerEl.innerHTML = prevHtml +
        '<span class="day-nav-title">Week ' + week + ' - ' + dayEn + '</span>' +
        nextHtml;

    var selectFn = isAustralia ? selectAustraliaDay : selectDay;
    var dayEnKeys = { '일': 'sunday', '월': 'monday', '화': 'tuesday', '수': 'wednesday', '목': 'thursday', '금': 'friday' };
    headerEl.querySelectorAll('.day-nav-btn').forEach(function(btn) {
        btn.onclick = function() {
            var w = parseInt(btn.dataset.week);
            var dk = btn.dataset.day;
            selectFn(w, dk, dayEnKeys[dk]);
        };
    });
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
            programBadgeElement.textContent = currentUser.program.replace('내벨업챌린지 Australia - ', 'AUS - ').replace('내벨업챌린지 - ', '');
        }
    }

    // 헤더 변경
    const welcomeHeader = document.querySelector('#taskListScreen .welcome-header h1');
    const subtitle = document.querySelector('#taskListScreen .welcome-header .subtitle');

    if (welcomeHeader) {
        _renderDayNavHeader(welcomeHeader, week, dayKr, false);
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

/** 세그먼트 컨트롤 초기화 (TESTROOM / AUSTRALIA / PRACTICE / FEEDBACK 토글) */
function _initSegmentControl() {
    var segmentWrap = document.getElementById('courseSegmentControl');
    if (!segmentWrap) return;
    
    var btnRegular = document.getElementById('segBtnRegular');
    var btnAustralia = document.getElementById('segBtnAustralia');
    var btnPractice = document.getElementById('segBtnPractice');
    var btnFeedback = document.getElementById('segBtnFeedback');
    
    var hasPractice = currentUser && currentUser.practiceEnabled;
    var hasCorrection = currentUser && (currentUser.correctionEnabled || window.__isAdmin);
    var hasAustralia = currentUser && currentUser.program && currentUser.program.includes('Australia');
    
    // 호주과정 학생: TESTROOM 숨김 / 정규 학생: AUSTRALIA 숨김
    if (btnRegular) btnRegular.style.display = hasAustralia ? 'none' : '';
    if (btnAustralia) btnAustralia.style.display = hasAustralia ? '' : 'none';
    if (btnPractice) btnPractice.style.display = hasPractice ? '' : 'none';
    if (btnFeedback) btnFeedback.style.display = hasCorrection ? '' : 'none';
    
    // 세그먼트 컨트롤: 탭이 하나뿐이면 숨김
    var visibleTabs = (hasAustralia ? 1 : 1) + (hasPractice ? 1 : 0) + (hasCorrection ? 1 : 0);
    if (visibleTabs <= 1) {
        segmentWrap.style.display = 'none';
        var defaultMode = hasAustralia ? 'australia' : 'regular';
        if (window.courseMode !== defaultMode) {
            setCourseMode(defaultMode);
            if (hasAustralia) _renderAustraliaMode(); else _renderRegularMode();
        }
        return;
    }
    
    segmentWrap.style.display = '';
    
    // 현재 모드 유효성 검증 — 호주 학생 기본은 australia, 정규 학생 기본은 regular
    var defaultMode = hasAustralia ? 'australia' : 'regular';
    var mode = window.courseMode || defaultMode;
    if (mode === 'regular' && hasAustralia) mode = 'australia';
    if (mode === 'australia' && !hasAustralia) mode = 'regular';
    if (mode === 'practice' && !hasPractice) mode = defaultMode;
    if (mode === 'correction' && !hasCorrection) mode = defaultMode;
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
    if (btnAustralia) {
        btnAustralia.onclick = function() {
            if (window.courseMode === 'australia') return;
            setCourseMode('australia');
            _syncSegmentActive('australia');
            _renderAustraliaMode();
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
    var btnAustralia = document.getElementById('segBtnAustralia');
    var btnPractice = document.getElementById('segBtnPractice');
    var btnFeedback = document.getElementById('segBtnFeedback');
    if (btnRegular) btnRegular.classList.toggle('seg-active', mode === 'regular');
    if (btnAustralia) btnAustralia.classList.toggle('seg-active', mode === 'australia');
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
    } else if (window.courseMode === 'australia') {
        window.location.href = 'mypage-australia.html';
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

    var tz = getUserTimezone();
    var deadline = getTaskDeadline(taskDate, tz);

    // 연장 체크
    var taskDateStr = taskDate.getFullYear() + '-' +
        String(taskDate.getMonth() + 1).padStart(2, '0') + '-' +
        String(taskDate.getDate()).padStart(2, '0');
    var extensions = window._deadlineExtensions || [];
    var ext = extensions.find(function(e) { return e.original_date === taskDateStr; });
    if (ext) {
        deadline = new Date(deadline.getTime() + (ext.extra_days || 1) * 24 * 60 * 60 * 1000);
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
