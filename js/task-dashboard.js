/**
 * task-dashboard.js
 * V3 과제 대시보드 화면 제어
 * 
 * 역할:
 *   - 스케줄 → 과제 대시보드 화면 전환 (openTaskDashboard)
 *   - DB 조회 후 버튼 상태 설정 (실전풀이/다시풀기/해설보기)
 *   - 버튼 클릭 → 모듈 컨트롤러 호출 또는 해설 화면 이동
 *   - 대시보드 → 스케줄 복귀 (backToScheduleFromDashboard)
 *   - 문제 풀이 완료 → 대시보드 복귀 (backToTaskDashboard)
 *   - 채점 대시보드 점수 렌더링
 * 
 * 참조: v3-design-spec.md §2-4, §2-6, §10-1
 */

// ─── 대시보드 상태 저장 ───
window._taskDashboardState = null;

// ─── 섹션별 아이콘 매핑 ───
const SECTION_ICONS = {
    reading: '📚',
    listening: '🎧',
    writing: '✍️',
    speaking: '🎙️'
};

// ─── 섹션별 한글명 매핑 ───
const SECTION_LABELS = {
    reading: '리딩',
    listening: '리스닝',
    writing: '라이팅',
    speaking: '스피킹'
};

// ─── 레벨별 코멘트 매핑 ───
function _getLevelComment(level) {
    var lv = Number(level) || 0;
    if (lv >= 6.0) return 'Perfect Mastery!';
    if (lv >= 5.0) return 'Excellent Command!';
    if (lv >= 4.0) return 'Strong Performance!';
    if (lv >= 3.0) return 'Advancing Steady!';
    if (lv >= 2.0) return 'Making Progress!';
    return 'Just Getting Started!';
}

/**
 * 과제 대시보드 열기
 * task-router.js의 _executeTaskCore()에서 4섹션일 때 호출됨
 * 
 * @param {string} sectionType - 'reading' | 'listening' | 'writing' | 'speaking'
 * @param {Object} params - parseTaskName()이 반환한 params (module 또는 number)
 * @param {string} taskName - 원본 과제명 (예: "리딩 Module 1")
 */
async function openTaskDashboard(sectionType, params, taskName) {
    console.log(`📋 [대시보드] 열기 — ${sectionType}`, params);
    
    // 모듈 번호 추출 (reading/listening은 module, writing/speaking은 number)
    const moduleNumber = params.module || params.number || 1;
    
    // 현재 스케줄 정보
    const ct = window.currentTest || {};
    const week = ct.currentWeek || '1';
    const day = ct.currentDay || '월';
    
    // 대시보드 상태 저장 (다른 함수에서 참조)
    window._taskDashboardState = {
        sectionType: sectionType,
        moduleNumber: moduleNumber,
        taskName: taskName,
        week: week,
        day: day
    };
    
    // ── 헤더 업데이트 ──
    const icon = SECTION_ICONS[sectionType] || '📋';
    const label = SECTION_LABELS[sectionType] || sectionType;
    const title = `${label} 모듈 ${moduleNumber}`;
    const subtitle = `Week ${week} - ${day}요일`;
    
    const elIcon = document.getElementById('taskDashboardIcon');
    const elTitle = document.getElementById('taskDashboardTitle');
    const elSubtitle = document.getElementById('taskDashboardSubtitle');
    
    if (elIcon) elIcon.textContent = icon;
    if (elTitle) elTitle.textContent = title;
    if (elSubtitle) elSubtitle.textContent = subtitle;
    
    // ── 로딩 표시 + 화면 전환 ──
    _showDashboardLoading(true);
    showScreen('taskDashboardScreen');
    
    // ── DB 조회 → 고정인증률 확정 → 버튼 상태 설정 ──
    // 최소 500ms 스피너 표시 (학생이 새로고침을 인지할 수 있도록)
    var loadStart = Date.now();
    await _loadAndApplyDashboardState(sectionType, moduleNumber, week, day);
    var elapsed = Date.now() - loadStart;
    if (elapsed < 500) {
        await new Promise(function(r) { setTimeout(r, 500 - elapsed); });
    }
    
    // ── 로딩 해제 ──
    _showDashboardLoading(false);
}

/**
 * DB에서 record 조회 후 버튼 상태 적용
 */
async function _loadAndApplyDashboardState(sectionType, moduleNumber, week, day) {
    let record = null;
    
    try {
        // V3 DB 조회 — supabase-client.js의 getStudyResultV3() 호출
        if (typeof getStudyResultV3 === 'function') {
            const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
            if (user && user.id) {
                record = await getStudyResultV3(user.id, sectionType, moduleNumber, week, day);
            }
        } else {
            console.log('📋 [대시보드] getStudyResultV3 미구현 — 빈 상태로 표시');
        }
    } catch (e) {
        console.warn('📋 [대시보드] DB 조회 실패:', e);
    }
    
    // record에서 initial/current 존재 여부 판단
    const hasInitial = record && record.initial_record != null;
    const hasCurrent = record && record.current_record != null;
    const deadlinePassed = window._deadlinePassedMode || false;
    
    console.log('📋 [대시보드] 상태:', { hasInitial, hasCurrent, deadlinePassed });
    
    // ── 고정인증률 확정 저장 (마감 지남 + 아직 미확정) ──
    if (deadlinePassed && record && record.locked_auth_rate == null) {
        await _lockAuthRate(record, hasInitial);
    }
    
    // ── 버튼 상태 적용 (v3-design-spec.md §2-4-1) ──
    _applyButtonStates(hasInitial, hasCurrent, deadlinePassed);
    
    // ── 채점 대시보드 표시 ──
    _renderScorePanel(record, hasInitial, hasCurrent);
    
    // ── 마감 배너 ──
    const banner = document.getElementById('taskDeadlineBanner');
    if (banner) {
        banner.style.display = deadlinePassed ? 'flex' : 'none';
    }
}

/**
 * 버튼 상태 적용
 * v3-design-spec.md §2-4-1 버튼 상태 변화 표 기준
 * 
 * | 상태                              | 풀이 버튼           | 해설보기 버튼        |
 * |-----------------------------------|--------------------|--------------------|
 * | 아직 안 품 (마감 전)                | 📝 실전 풀이 (활성) | 잠김 (비활성)        |
 * | 실전풀이 완료 (마감 전)              | 🔄 다시 풀기 (활성) | 📖 해설 보기 (활성)  |
 * | 마감 지남 + initial 없음            | 🔄 다시 풀기 (활성) | 잠김 (비활성)        |
 * | 마감 지남 + initial 있음            | 🔄 다시 풀기 (활성) | 📖 해설 보기 (활성)  |
 * | 마감 지남 + current만 있음          | 🔄 다시 풀기 (활성) | 📖 해설 보기 (활성)  |
 */
function _applyButtonStates(hasInitial, hasCurrent, deadlinePassed) {
    const btnPractice = document.getElementById('taskBtnPractice');
    const btnPracticeIcon = document.getElementById('taskBtnPracticeIcon');
    const btnPracticeText = document.getElementById('taskBtnPracticeText');
    const btnPracticeStatus = document.getElementById('taskBtnPracticeStatus');
    const btnExplain = document.getElementById('taskBtnExplain');
    const btnExplainStatus = document.getElementById('taskBtnExplainStatus');
    
    // ── 풀이 버튼 ──
    if (hasInitial || (deadlinePassed && !hasInitial)) {
        // 다시 풀기 모드
        if (btnPracticeIcon) btnPracticeIcon.textContent = '🔄';
        if (btnPracticeText) btnPracticeText.textContent = '다시 풀기';
        if (btnPracticeStatus) btnPracticeStatus.textContent = hasInitial ? '완료' : '미완료';
        if (btnPractice) btnPractice.disabled = false;
    } else {
        // 실전 풀이 모드
        if (btnPracticeIcon) btnPracticeIcon.textContent = '📝';
        if (btnPracticeText) btnPracticeText.textContent = '실전 풀이';
        if (btnPracticeStatus) btnPracticeStatus.textContent = '미완료';
        if (btnPractice) btnPractice.disabled = false;
    }
    
    // ── 해설보기 버튼 ──
    const canExplain = hasInitial || hasCurrent;
    if (btnExplain) btnExplain.disabled = !canExplain;
    if (btnExplainStatus) {
        btnExplainStatus.textContent = canExplain ? '' : '풀이 완료 후 확인 가능';
    }
    
    // ── 버튼 클릭 핸들러 등록 ──
    if (btnPractice) {
        btnPractice.onclick = _onPracticeClick;
    }
    if (btnExplain) {
        btnExplain.onclick = _onExplainClick;
    }
}

/**
 * 실전풀이 / 다시풀기 버튼 클릭 핸들러
 */
function _onPracticeClick() {
    const state = window._taskDashboardState;
    if (!state) {
        console.error('❌ [대시보드] 상태 없음');
        return;
    }
    
    console.log(`▶️ [대시보드] 풀이 시작 — ${state.sectionType} Module ${state.moduleNumber}`);
    
    // 섹션별 모듈 컨트롤러 호출
    // 모듈 컨트롤러가 아직 없으면 콘솔 로그만 출력
    switch (state.sectionType) {
        case 'reading':
            if (typeof startReadingModule === 'function') {
                startReadingModule(state.moduleNumber);
            } else {
                console.log('🚧 [대시보드] startReadingModule 미구현');
            }
            break;
        case 'listening':
            if (typeof startListeningModule === 'function') {
                startListeningModule(state.moduleNumber);
            } else {
                console.log('🚧 [대시보드] startListeningModule 미구현');
            }
            break;
        case 'writing':
            if (typeof startWritingModule === 'function') {
                startWritingModule(state.moduleNumber);
            } else {
                console.log('🚧 [대시보드] startWritingModule 미구현');
            }
            break;
        case 'speaking':
            if (typeof startSpeakingModule === 'function') {
                startSpeakingModule(state.moduleNumber);
            } else {
                console.log('🚧 [대시보드] startSpeakingModule 미구현');
            }
            break;
        default:
            console.error('❌ [대시보드] 알 수 없는 섹션:', state.sectionType);
    }
}

/**
 * 해설보기 버튼 클릭 핸들러
 */
function _onExplainClick() {
    const state = window._taskDashboardState;
    if (!state) {
        console.error('❌ [대시보드] 상태 없음');
        return;
    }
    
    console.log(`📖 [대시보드] 해설보기 — ${state.sectionType} Module ${state.moduleNumber}`);
    
    // explain-viewer.js가 구현되면 연결
    if (typeof openExplainViewer === 'function') {
        openExplainViewer(state.sectionType, state.moduleNumber, state.week, state.day);
    } else {
        console.log('🚧 [대시보드] openExplainViewer 미구현');
    }
}

/**
 * 문제 풀이 완료 후 과제 대시보드로 복귀
 * 각 모듈 컨트롤러의 finish 함수에서 호출
 */
async function backToTaskDashboard() {
    console.log('🔙 [대시보드] 과제 대시보드로 복귀');
    
    // 리스닝 모듈 정리 (오디오 정지 + 타이머 정지 + 상태 초기화)
    if (typeof cleanupListeningModule === 'function') {
        cleanupListeningModule();
    }
    
    // 라이팅 모듈 정리 (타이머 정지 + 상태 초기화)
    if (typeof cleanupWritingModule === 'function') {
        cleanupWritingModule();
    }
    
    // 스피킹 모듈 정리 (오디오 정지 + AudioPlayer 해제 + 상태 초기화)
    if (typeof cleanupSpeakingModule === 'function') {
        cleanupSpeakingModule();
    }
    
    // 타이머 정리
    if (typeof stopAllTimers === 'function') {
        stopAllTimers();
    }
    
    // beforeunload 경고 해제
    if (window._beforeUnloadHandler) {
        window.removeEventListener('beforeunload', window._beforeUnloadHandler);
        window._beforeUnloadHandler = null;
    }
    
    const state = window._taskDashboardState;
    if (!state) {
        // 상태가 없으면 스케줄로 복귀 (안전장치)
        console.warn('⚠️ [대시보드] 상태 없음 — 스케줄로 복귀');
        if (typeof backToSchedule === 'function') {
            backToSchedule();
        }
        return;
    }
    
    // 로딩 표시 + 화면 전환
    _showDashboardLoading(true);
    showScreen('taskDashboardScreen');
    
    // DB 재조회 → 채점 결과 갱신 (방금 저장된 record 반영)
    // 최소 500ms 스피너 표시 (학생이 새로고침을 인지할 수 있도록)
    var loadStart = Date.now();
    await _loadAndApplyDashboardState(state.sectionType, state.moduleNumber, state.week, state.day);
    var elapsed = Date.now() - loadStart;
    if (elapsed < 500) {
        await new Promise(function(r) { setTimeout(r, 500 - elapsed); });
    }
    
    // 로딩 해제
    _showDashboardLoading(false);
}

/**
 * 과제 대시보드 → 스케줄 복귀
 * HTML: onclick="backToScheduleFromDashboard()"
 */
function backToScheduleFromDashboard() {
    console.log('🔙 [대시보드] 스케줄로 복귀');
    
    // 대시보드 상태 초기화
    window._taskDashboardState = null;
    
    // navigation.js의 backToSchedule() 호출
    if (typeof backToSchedule === 'function') {
        backToSchedule();
    } else {
        // 안전장치: backToSchedule이 없으면 직접 화면 전환
        showScreen('scheduleScreen');
    }
}

// ─── 내부 유틸 함수 ───

/**
 * 로딩 스피너 표시/숨김
 * true → 스피너 표시 + 본문(헤더·바디) 숨김
 * false → 스피너 숨김 + 본문 표시
 */
function _showDashboardLoading(isLoading) {
    const loading = document.getElementById('taskDashboardLoading');
    const header = document.querySelector('#taskDashboardScreen .task-dashboard-header');
    const body = document.querySelector('#taskDashboardScreen .task-dashboard-body');
    
    if (loading) loading.style.display = isLoading ? 'flex' : 'none';
    if (header) header.style.display = isLoading ? 'none' : '';
    if (body) body.style.display = isLoading ? 'none' : '';
}

/**
 * 고정인증률(locked_auth_rate) 확정 저장
 * v3-design-spec.md §7-3 기준
 * 
 * 마감 지남 + record 존재 + locked_auth_rate NULL → 계산 후 DB UPDATE
 * - initial_record 없음 → 0% (단, 행이 없으면 이 함수 자체가 호출 안 됨)
 * - initial_record 있음 + error_note_submitted false → 50%
 * - initial_record 있음 + error_note_submitted true → 100%
 */
async function _lockAuthRate(record, hasInitial) {
    var rate = 0;
    if (hasInitial && record.error_note_submitted) {
        rate = 100;
    } else if (hasInitial) {
        rate = 50;
    }
    
    try {
        await supabaseUpdate('study_results_v3', 'id=eq.' + record.id, {
            locked_auth_rate: rate
        });
        record.locked_auth_rate = rate;
        console.log('🔒 [대시보드] 고정인증률 확정:', rate + '%', '(record id:', record.id + ')');
    } catch (e) {
        console.error('🔒 [대시보드] 고정인증률 저장 실패:', e);
    }
}

/**
 * 채점 대시보드 렌더링
 * v3-design-spec.md §2-6 기준
 */
function _renderScorePanel(record, hasInitial, hasCurrent) {
    const initialContent = document.getElementById('scoreBlockInitialContent');
    const currentBlock = document.getElementById('scoreBlockCurrent');
    const currentContent = document.getElementById('scoreBlockCurrentContent');
    var sectionType = window._taskDashboardState ? window._taskDashboardState.sectionType : null;
    
    // 실전풀이 결과
    if (initialContent) {
        if (hasInitial) {
            initialContent.innerHTML = _renderScoreFromRecord(record.initial_record, sectionType, record);
        } else {
            initialContent.innerHTML = '<p class="score-empty-msg">풀이 후 표시됩니다</p>';
        }
    }
    
    // 다시풀기 결과
    if (currentBlock) {
        currentBlock.style.display = hasCurrent ? 'block' : 'none';
    }
    if (currentContent && hasCurrent) {
        currentContent.innerHTML = _renderScoreFromRecord(record.current_record, sectionType, record);
    }
}

/**
 * record JSON → 점수 HTML 변환
 * @param {Object} recordJson - initial_record 또는 current_record JSON
 * @param {string} sectionType - 'reading' | 'listening' | 'writing' | 'speaking'
 * @param {Object} dbRow - DB 행 전체 (speaking_file_1 등 별도 컬럼 접근용)
 */
function _renderScoreFromRecord(recordJson, sectionType, dbRow) {
    if (!recordJson) return '<p class="score-empty-msg">데이터 없음</p>';
    
    try {
        var data = (typeof recordJson === 'string') ? JSON.parse(recordJson) : recordJson;
        
        // 섹션별 상세 렌더링
        switch (sectionType) {
            case 'reading':
                return _renderReadingScore(data);
            case 'listening':
                return _renderListeningScore(data);
            case 'writing':
                return _renderWritingScore(data);
            case 'speaking':
                return _renderSpeakingScore(data);
            default:
                return _renderGenericScore(data);
        }
    } catch (e) {
        console.warn('📋 [대시보드] 점수 렌더링 실패:', e);
        return '<p class="score-empty-msg">결과 확인 중...</p>';
    }
}

// ─── 섹션별 상세 점수 렌더링 (프로그레스 바 스타일) ───

/**
 * 프로그레스 바 행 하나를 생성하는 공통 헬퍼
 * @param {string} label - 항목명
 * @param {number} correct - 정답 수
 * @param {number} total - 전체 수
 * @returns {string} HTML
 */
function _renderProgressRow(label, correct, total) {
    var percent = total > 0 ? Math.round((correct / total) * 100) : 0;
    var celebIcon = percent >= 80 ? ' <svg class="sd-celebrate" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 21L3 14l7.5 3.5L5.5 21z" fill="#77bf7e"/><path d="M3 14l2-4.5 3.5 6L3 14z" fill="#5a9e61"/><path d="M5 9.5l4.5-2 1 4-5.5-2z" fill="#9480c5"/><path d="M9.5 7.5L12 3l1.5 5.5-4-1z" fill="#b9a5e8"/><circle cx="14" cy="5" r="1" fill="#f59e0b"/><circle cx="17" cy="8" r="0.8" fill="#77bf7e"/><circle cx="19" cy="4" r="0.6" fill="#9480c5"/><circle cx="16" cy="11" r="0.7" fill="#f59e0b"/><circle cx="20" cy="7" r="0.5" fill="#ef4444"/><circle cx="12" cy="9" r="0.6" fill="#77bf7e"/></svg>' : '';
    var html = '<div class="sd-score-row">';
    html += '<div class="sd-score-row-header">';
    html += '<span class="sd-score-row-label">' + label + '</span>';
    html += '<span class="sd-score-row-stat">' + correct + ' / ' + total + celebIcon + '</span>';
    html += '</div>';
    html += '<div class="sd-progress-track">';
    html += '<div class="sd-progress-fill" style="width:' + percent + '%"></div>';
    html += '</div>';
    html += '</div>';
    return html;
}

/**
 * 총점 + 레벨 요약 카드 (2열 그리드)
 */
function _renderSummaryCards(data) {
    if (data.totalCorrect === undefined || data.totalQuestions === undefined) return '';
    var totalPercent = Math.round((data.totalCorrect / data.totalQuestions) * 100);
    var levelStr = data.level ? Number(data.level).toFixed(1) : null;
    var comment = data.level ? _getLevelComment(data.level) : '';
    
    var html = '<div class="sd-summary-grid">';
    // 총점 카드
    html += '<div class="sd-summary-card sd-card-score">';
    html += '<div class="sd-summary-card-label">TOTAL SCORE</div>';
    html += '<div class="sd-summary-card-value">' + data.totalCorrect + '<span class="sd-summary-card-sub"> / ' + data.totalQuestions + '</span></div>';
    html += '<div class="sd-summary-card-extra"><span class="sd-efficiency-badge">' + totalPercent + '% Efficiency</span></div>';
    html += '</div>';
    // 레벨 카드
    if (levelStr) {
        html += '<div class="sd-summary-card sd-card-level">';
        html += '<div class="sd-summary-card-label">ACHIEVED LEVEL</div>';
        html += '<div class="sd-summary-card-value">Level ' + levelStr + '</div>';
        html += '<div class="sd-summary-card-extra"><svg class="sd-check-icon" viewBox="0 0 16 16" width="14" height="14" fill="none"><path d="M3 8.5l3.5 3.5 6.5-8" stroke="#77bf7e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> ' + comment + '</div>';
        html += '</div>';
    }
    html += '</div>';
    return html;
}

/**
 * sets 객체를 숫자순으로 정렬하고 유형별로 그룹화하는 공통 헬퍼
 */
function _groupSets(data, typeLabels, typeOrder) {
    if (!data.sets) return [];
    var keys = Object.keys(data.sets).sort(function(a, b) {
        var numA = parseInt(a.match(/\d+$/)[0]);
        var numB = parseInt(b.match(/\d+$/)[0]);
        return numA - numB;
    });
    var typeGroups = {};
    keys.forEach(function(key) {
        var typeName = key.replace(/_set\d+$/, '');
        if (!typeGroups[typeName]) typeGroups[typeName] = [];
        typeGroups[typeName].push(data.sets[key]);
    });
    var result = [];
    typeOrder.forEach(function(typeName) {
        var sets = typeGroups[typeName];
        if (!sets) return;
        var label = typeLabels[typeName] || typeName;
        sets.forEach(function(setData, i) {
            var correct = 0;
            var total = 0;
            if (setData && setData.answers) {
                total = setData.answers.length;
                setData.answers.forEach(function(a) { if (a.isCorrect) correct++; });
            }
            var setLabel = sets.length > 1 ? label + ' Set' + (i + 1) : label;
            result.push({ label: setLabel, correct: correct, total: total });
        });
    });
    return result;
}

/** 리딩 세부 점수 */
function _renderReadingScore(data) {
    var items = _groupSets(data, {
        fillblanks: '빈칸채우기', daily1: 'Daily1', daily2: 'Daily2', academic: 'Academic'
    }, ['fillblanks', 'daily1', 'daily2', 'academic']);
    
    var html = '<div class="sd-score-list">';
    items.forEach(function(item) {
        html += _renderProgressRow(item.label, item.correct, item.total);
    });
    html += '</div>';
    html += _renderSummaryCards(data);
    return html;
}

/** 리스닝 세부 점수 */
function _renderListeningScore(data) {
    var items = _groupSets(data, {
        response: '응답고르기', conver: '대화', announcement: '공지사항', lecture: '렉쳐'
    }, ['response', 'conver', 'announcement', 'lecture']);
    
    var html = '<div class="sd-score-list">';
    items.forEach(function(item) {
        html += _renderProgressRow(item.label, item.correct, item.total);
    });
    html += '</div>';
    html += _renderSummaryCards(data);
    return html;
}

/** 라이팅 세부 점수 */
function _renderWritingScore(data) {
    var html = '<div class="sd-score-list">';
    
    // Arrange — 점수 프로그레스 바
    if (data.arrange) {
        var arrCorrect = data.arrange.correct || 0;
        var arrTotal = data.arrange.total || 0;
        html += _renderProgressRow('Arrange', arrCorrect, arrTotal);
    }
    
    // Email — 완료 표시 + 작성 내용
    if (data.email) {
        html += '<div class="sd-score-row sd-row-complete">';
        html += '<div class="sd-score-row-header">';
        html += '<span class="sd-score-row-label">Email</span>';
        html += '<span class="sd-score-row-stat sd-stat-done"><i class="fa-solid fa-circle-check"></i> 완료</span>';
        html += '</div>';
        html += '</div>';
        if (data.email.userAnswer) {
            html += '<div class="sd-text-preview">';
            html += '<div class="sd-text-preview-label">Email 작성 내용</div>';
            html += '<div class="sd-text-preview-content">' + _escapeHtml(data.email.userAnswer) + '</div>';
            html += '</div>';
        }
    }
    
    // Discussion — 완료 표시 + 작성 내용
    if (data.discussion) {
        html += '<div class="sd-score-row sd-row-complete">';
        html += '<div class="sd-score-row-header">';
        html += '<span class="sd-score-row-label">Discussion</span>';
        html += '<span class="sd-score-row-stat sd-stat-done"><i class="fa-solid fa-circle-check"></i> 완료</span>';
        html += '</div>';
        html += '</div>';
        if (data.discussion.userAnswer) {
            html += '<div class="sd-text-preview">';
            html += '<div class="sd-text-preview-label">Discussion 작성 내용</div>';
            html += '<div class="sd-text-preview-content">' + _escapeHtml(data.discussion.userAnswer) + '</div>';
            html += '</div>';
        }
    }
    
    html += '</div>';
    return html;
}

/** 스피킹 세부 점수 */
function _renderSpeakingScore(data) {
    var html = '<div class="sd-score-list">';
    
    // 따라말하기
    if (data.repeat) {
        var repeatDone = data.repeat.completed;
        html += '<div class="sd-score-row ' + (repeatDone ? 'sd-row-complete' : '') + '">';
        html += '<div class="sd-score-row-header">';
        html += '<span class="sd-score-row-label">따라말하기</span>';
        if (repeatDone) {
            html += '<span class="sd-score-row-stat sd-stat-done"><i class="fa-solid fa-circle-check"></i> 완료</span>';
        } else {
            html += '<span class="sd-score-row-stat sd-stat-pending">미완료</span>';
        }
        html += '</div>';
        html += '</div>';
    }
    
    // 인터뷰
    if (data.interview) {
        var interviewDone = data.interview.completed;
        html += '<div class="sd-score-row ' + (interviewDone ? 'sd-row-complete' : '') + '">';
        html += '<div class="sd-score-row-header">';
        html += '<span class="sd-score-row-label">인터뷰</span>';
        if (interviewDone) {
            html += '<span class="sd-score-row-stat sd-stat-done"><i class="fa-solid fa-circle-check"></i> 완료</span>';
        } else {
            html += '<span class="sd-score-row-stat sd-stat-pending">미완료</span>';
        }
        html += '</div>';
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

/** 기본 점수 표시 (섹션을 모를 때 폴백) */
function _renderGenericScore(data) {
    if (data.totalCorrect !== undefined && data.totalQuestions !== undefined) {
        var html = '<div class="sd-score-list">';
        html += _renderProgressRow('총점', data.totalCorrect, data.totalQuestions);
        html += '</div>';
        html += _renderSummaryCards(data);
        return html;
    }
    if (data.completed) {
        return '<p class="score-completed-msg">✅ 완료</p>';
    }
    return '<p class="score-empty-msg">결과 확인 중...</p>';
}

/** HTML 이스케이프 */
function _escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

console.log('✅ task-dashboard.js 로드 완료');
