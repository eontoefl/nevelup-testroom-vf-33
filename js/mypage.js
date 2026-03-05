/**
 * ================================================
 * mypage.js – 마이페이지 Supabase 연동 로직
 * ================================================
 * 
 * sessionStorage의 currentUser 정보로 Supabase 데이터를 불러와
 * 학습 현황, 잔디, 최근 기록을 렌더링합니다.
 * 
 * 의존: supabase-client.js (supabaseSelect 등)
 */

// ================================================
// 전역 상태
// ================================================
let mpUser = null;           // sessionStorage에서 로드한 유저 정보
let mpV2Results = [];        // study_results_v2
let mpStudyRecords = [];     // (최근기록용 — 추후 V2 전환 예정, 현재 빈 배열)
let mpGradeRules = [];       // tr_grade_rules (등급/환급 기준표)
let mpDeadlineExtensions = []; // tr_deadline_extensions (데드라인 연장)

// task_type을 요일 매핑하기 위한 한→영 변환
const DAY_MAP_KR_TO_NUM = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5 };

// ================================================
// 초기화
// ================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📊 [MyPage] 초기화 시작');

    // 1. 세션에서 유저 정보 로드
    const saved = sessionStorage.getItem('currentUser');
    if (!saved) {
        showNotLoggedIn();
        return;
    }

    mpUser = JSON.parse(saved);
    console.log('📊 [MyPage] 유저:', mpUser.name, mpUser.programType);

    // 2. UI 기본 세팅
    document.getElementById('userName').textContent = mpUser.name;
    document.getElementById('programBadge').textContent = mpUser.program || '내벨업챌린지';

    // 플랜 탭 - 유저의 프로그램에 맞춰 활성화
    setupPlanTabs();

    // 3. Supabase에서 데이터 로드
    try {
        await loadAllData();
        renderAll();
    } catch (err) {
        console.error('❌ [MyPage] 데이터 로드 실패:', err);
    }

    // 4. 화면 전환
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('mainContent').style.display = 'flex';
});

// ================================================
// 데이터 로드
// ================================================
async function loadAllData() {
    const userId = mpUser.id;
    console.log('📊 [MyPage] 데이터 로드 시작 - userId:', userId);

    // V2 학습 결과 로드 (result_json은 대용량이므로 제외)
    mpV2Results = await supabaseSelect(
        'study_results_v2',
        `user_id=eq.${userId}&order=completed_at.desc&select=id,user_id,section_type,module_number,week,day,first_result_json,second_result_json,error_note_submitted,first_level,locked_auth_rate,completed_at`
    ) || [];

    // 등급/환급 기준표 로드
    mpGradeRules = await supabaseSelect(
        'tr_grade_rules',
        'order=min_rate.desc'
    ) || [];

    // 데드라인 연장 기록 로드
    mpDeadlineExtensions = await supabaseSelect(
        'tr_deadline_extensions',
        `user_id=eq.${userId}&select=original_date,extra_days`
    ) || [];

    console.log(`📊 [MyPage] 로드 완료 - V2결과: ${mpV2Results.length}건, 등급규칙: ${mpGradeRules.length}건, 연장: ${mpDeadlineExtensions.length}건`);
}

// ================================================
// 전체 렌더링
// ================================================
function renderAll() {
    renderTodayTasks();
    renderSummaryCards();
    renderDeadlineExtensionBanner();
    renderGrass();
    renderScoreChart();
}

// ================================================
// 데드라인 연장 알림 배너 렌더링
// ================================================
function renderDeadlineExtensionBanner() {
    const container = document.getElementById('deadlineExtensionBanner');
    if (!container) return;

    // 활성 연장 건 필터 (마감이 아직 안 지난 것만)
    if (!mpDeadlineExtensions || mpDeadlineExtensions.length === 0 || !mpUser.startDate) {
        container.innerHTML = '';
        return;
    }

    const now = new Date();
    const dayKrNames = ['일', '월', '화', '수', '목', '금', '토'];
    const activeExtensions = [];

    mpDeadlineExtensions.forEach(ext => {
        const origDate = new Date(ext.original_date + 'T00:00:00');
        if (isNaN(origDate.getTime())) return;

        // 연장된 마감 계산 (task-router.js와 동일)
        let extDeadline = new Date(origDate);
        extDeadline.setDate(extDeadline.getDate() + 1);
        extDeadline.setHours(4, 0, 0, 0);
        extDeadline.setDate(extDeadline.getDate() + (ext.extra_days || 1));

        if (now < extDeadline) {
            activeExtensions.push({
                originalDate: origDate,
                deadline: extDeadline,
                extraDays: ext.extra_days || 1
            });
        }
    });

    if (activeExtensions.length === 0) {
        container.innerHTML = '';
        return;
    }

    // 마감이 가까운 순으로 정렬
    activeExtensions.sort((a, b) => a.deadline - b.deadline);

    const items = activeExtensions.map(ext => {
        const origM = ext.originalDate.getMonth() + 1;
        const origD = ext.originalDate.getDate();
        const origDay = dayKrNames[ext.originalDate.getDay()];
        const dlM = ext.deadline.getMonth() + 1;
        const dlD = ext.deadline.getDate();
        const dlDay = dayKrNames[ext.deadline.getDay()];
        return `<div class="ext-banner-item">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <span><strong>${origM}/${origD}(${origDay})</strong> 과제의 마감이 <strong>${dlM}/${dlD}(${dlDay}) 새벽 4시</strong>까지 연장되었습니다.</span>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="ext-banner">
            <div class="ext-banner-header">
                <i class="fa-solid fa-calendar-plus"></i> 데드라인 연장 안내
            </div>
            ${items}
        </div>
    `;

    console.log(`📊 [MyPage] 데드라인 연장 알림 ${activeExtensions.length}건 표시`);
}

// ================================================
// 시작 전 여부 판별
// ================================================
function isBeforeStart() {
    if (!mpUser.startDate) return false; // 시작일 정보 없으면 진행중으로 간주
    const start = new Date(mpUser.startDate);
    start.setHours(0, 0, 0, 0);
    const now = new Date();
    if (now.getHours() < 4) now.setDate(now.getDate() - 1);
    now.setHours(0, 0, 0, 0);
    return now < start;
}

// 등급/환급 산정 전 여부: 시작일 다음날부터 산정 (시작일 당일 포함 = 산정 전)
function isGradeBeforeStart() {
    if (!mpUser.startDate) return false;
    const start = new Date(mpUser.startDate);
    start.setHours(0, 0, 0, 0);
    const now = new Date();
    if (now.getHours() < 4) now.setDate(now.getDate() - 1);
    now.setHours(0, 0, 0, 0);
    return now <= start; // 당일 포함
}

function getDaysUntilStart() {
    if (!mpUser.startDate) return 0;
    const start = new Date(mpUser.startDate);
    start.setHours(0, 0, 0, 0);
    const now = new Date();
    if (now.getHours() < 4) now.setDate(now.getDate() - 1);
    now.setHours(0, 0, 0, 0);
    return Math.ceil((start - now) / (1000 * 60 * 60 * 24));
}

function formatStartDate(dateStr) {
    const d = new Date(dateStr);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
}

/**
 * 시작일 전체 포맷: "2026-02-22(일)"
 */
function formatFullDate(dateStr) {
    const d = new Date(dateStr);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}(${days[d.getDay()]})`;
}

// ================================================
// 오늘의 과제 리스트 렌더링
// ================================================
function renderTodayTasks() {
    const container = document.getElementById('todayTaskList');
    if (!container) return;

    const programType = mpUser.programType || 'standard';
    const totalWeeks = programType === 'standard' ? 8 : 4;

    // getDayTasks 함수 존재 확인
    if (typeof getDayTasks !== 'function') {
        container.innerHTML = '<p class="sc-sub">스케줄 데이터를 불러올 수 없습니다</p>';
        return;
    }

    // 시작 전 체크
    if (isBeforeStart()) {
        const startStr = formatStartDate(mpUser.startDate);
        container.innerHTML = `<p class="today-task-empty">📅 ${startStr}부터 시작됩니다!</p>`;
        return;
    }

    // 오늘 날짜 계산 (새벽 4시 기준)
    const now = new Date();
    const effectiveToday = new Date(now);
    if (now.getHours() < 4) effectiveToday.setDate(effectiveToday.getDate() - 1);
    effectiveToday.setHours(0, 0, 0, 0);

    const startDate = new Date(mpUser.startDate + 'T00:00:00');
    if (isNaN(startDate.getTime())) {
        container.innerHTML = '<p class="today-task-empty">시작일 정보 없음</p>';
        return;
    }

    // 오늘이 몇 주차 무슨 요일인지 계산
    const diffDays = Math.floor((effectiveToday - startDate) / (1000 * 60 * 60 * 24));
    const dayOrder = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const weekNum = Math.floor(diffDays / 7) + 1;
    const dayIndex = diffDays % 7;
    const dayEn = dayOrder[dayIndex];

    // 챌린지 종료 또는 토요일 체크
    if (weekNum > totalWeeks || dayEn === 'saturday') {
        container.innerHTML = '<p class="today-task-empty">오늘은 휴무입니다 😊</p>';
        return;
    }

    // 오늘의 과제 목록 가져오기
    const tasks = getDayTasks(programType, weekNum, dayEn);

    if (!tasks || tasks.length === 0) {
        container.innerHTML = '<p class="today-task-empty">오늘은 휴무입니다 😊</p>';
        return;
    }

    // 과제명을 읽기 좋게 변환
    const taskLabels = {
        'reading': '📖 Reading',
        'listening': '🎧 Listening',
        'writing': '✍️ Writing',
        'speaking': '🎤 Speaking',
        'vocab': '📝 Vocab',
        'intro-book': '📚 입문서'
    };

    let html = '<ul class="today-task-ul">';
    tasks.forEach(taskName => {
        const parsed = (typeof parseTaskName === 'function') ? parseTaskName(taskName) : null;
        let label = taskName;
        if (parsed && parsed.type !== 'unknown') {
            const base = taskLabels[parsed.type] || parsed.type;
            if (parsed.type === 'vocab') {
                label = base;
            } else if (parsed.type === 'intro-book') {
                label = base;
            } else {
                const modNum = parsed.params ? (parsed.params.module || parsed.params.number || '') : '';
                label = `${base} M${modNum}`;
            }
        }
        html += `<li class="today-task-item">${label}</li>`;
    });
    html += '</ul>';
    html += `<p class="today-task-count">총 ${tasks.length}건</p>`;

    container.innerHTML = html;
    console.log(`📝 [MyPage] 오늘의 과제 ${tasks.length}건 표시 (W${weekNum} ${dayEn})`);
}

// ================================================
// ① 학습 현황 요약 카드 렌더링 (v2 — STUDENT_METRICS.md 기준)
// ================================================
function renderSummaryCards() {
    const programType = mpUser.programType || 'standard';
    const totalWeeks = programType === 'standard' ? 8 : 4;
    const totalCalendarDays = totalWeeks * 7; // 총 달력 일수

    // ── 경과일 / 잔여일 / 전체일 계산 ──
    const startDate = new Date(mpUser.startDate);
    startDate.setHours(0, 0, 0, 0);
    const today = new Date();
    if (today.getHours() < 4) today.setDate(today.getDate() - 1);
    today.setHours(0, 0, 0, 0);

    const beforeStart = isBeforeStart();

    // 1칸: 챌린지 현황
    if (beforeStart) {
        const daysLeft = getDaysUntilStart();
        const startStr = formatStartDate(mpUser.startDate);
        document.getElementById('challengeStatus').textContent = `D-${daysLeft}`;
        document.getElementById('challengeBar').style.width = '0%';
        document.getElementById('challengeSub').textContent = `${startStr} 시작 예정`;
        document.getElementById('challengeStartDate').textContent = `시작일: ${formatFullDate(mpUser.startDate)}`;
    } else {
        const dplus = Math.min(Math.floor((today - startDate) / (1000 * 60 * 60 * 24)), totalCalendarDays);
        const remainingDays = Math.max(0, totalCalendarDays - dplus);
        const elapsedPct = Math.min(100, Math.round((dplus / totalCalendarDays) * 100));
        document.getElementById('challengeStatus').textContent = `D+${dplus} / ${totalCalendarDays}일`;
        document.getElementById('challengeBar').style.width = `${elapsedPct}%`;
        document.getElementById('challengeSub').textContent = `잔여 ${remainingDays}일`;
        document.getElementById('challengeStartDate').textContent = `시작일: ${formatFullDate(mpUser.startDate)}`;
    }

    // ── 오늘까지 할당된 과제 수 계산 ──
    const taskStats = countTasksDueToday(programType, totalWeeks);
    const tasksDueToday = taskStats.due;

    // ── 인증률 계산 (V2: 각 과제별 인증률 합산 / 오늘까지 할당 과제 수) ──
    // ★ 다시 풀기 시스템: locked_auth_rate 우선 사용
    let authRateSum = 0;
    
    // study_results_v2에서 과제별 인증률 계산
    mpV2Results.forEach(r => {
        let taskAuth = 0;
        const sectionType = r.section_type;
        
        // ★ 확정된 인증률이 있으면 그 값을 그대로 사용
        if (r.locked_auth_rate != null) {
            taskAuth = Number(r.locked_auth_rate);
        }
        // 보카/입문서: 있으면 100 (다시 풀기 대상 아님, locked_auth_rate 없음)
        else if (sectionType === 'vocab' || sectionType === 'intro-book') {
            if (r.first_result_json) taskAuth = 100;
        }
        // 리딩/리스닝/라이팅/스피킹: 모두 33 + 33 + 34 = 100 (통일)
        else {
            if (r.first_result_json) taskAuth += 33;
            if (r.second_result_json) taskAuth += 33;
            if (r.error_note_submitted) taskAuth += 34;
        }
        
        authRateSum += taskAuth;
    });

    // 분모 결정
    const authDenominator = tasksDueToday > 0 ? tasksDueToday : mpV2Results.length;

    let authRatePct, authSubText;
    if (authDenominator > 0) {
        authRatePct = Math.round(authRateSum / authDenominator);
        if (tasksDueToday === 0) {
            authSubText = `시작 전`;
        } else {
            authSubText = `오늘까지 할당된 과제 ${tasksDueToday}건 기준`;
        }
    } else {
        authRatePct = 0;
        authSubText = '데이터 없음';
    }

    // 인증률 카드
    document.getElementById('authRate').textContent = authRatePct;
    document.getElementById('authRateUnit').textContent = '%';
    document.getElementById('authBar').style.width = `${Math.min(authRatePct, 100)}%`;
    document.getElementById('authSub').textContent = authSubText;

    // ── 등급 & 환급 계산 (tr_grade_rules 테이블 연동) ──
    // 시작 전이면 무조건 등급 미산정
    if (isGradeBeforeStart()) {
        document.getElementById('currentGrade').textContent = '-';
        document.getElementById('gradeRefund').textContent = '시작 후 산정';
    } else {
        const grade = getGradeFromRules(authRatePct);
        const gradeEl = document.getElementById('currentGrade');
        gradeEl.textContent = grade.letter;

        // 등급 배경색 적용 (글자는 흰색 유지)
        gradeEl.style.background = grade.color;
        gradeEl.style.color = '#fff';

        const refundAmount = Math.round(grade.deposit * grade.refundRate);
        document.getElementById('gradeRefund').innerHTML = 
            `환급 ${Math.round(grade.refundRate * 100)}% (${refundAmount.toLocaleString()}원)`;
    }
}

/**
 * 오늘까지 할당된 과제 수 계산
 * 
 * 기준 (2/22 예시):
 * - 오늘의 마감: 2/23 새벽 4시
 * - 도래일: 마감(다음날 04:00)이 현재보다 과거인 과제
 * - 오늘: 과제 날짜가 오늘인 것 (마감 전이라도 분모에 포함)
 * - 미도래일: 과제 날짜가 내일 이후
 * - 분모 = 도래일 + 오늘
 * 
 * ※ 제출된 과제(분자)는 도래/미도래/오늘 상관없이 무조건 반영
 */
function countTasksDueToday(programType, totalWeeks) {
    if (!mpUser.startDate) return { due: 0, completed: 0 };
    if (typeof getDayTasks !== 'function') return { due: 0, completed: 0 };

    const dayOrder = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const dayEnToKr = { sunday: '일', monday: '월', tuesday: '화', wednesday: '수', thursday: '목', friday: '금' };
    const startDate = new Date(mpUser.startDate + 'T00:00:00');
    if (isNaN(startDate.getTime())) return { due: 0, completed: 0 };

    const now = new Date();

    // 새벽 4시 기준: 4시 이전이면 "오늘"은 어제
    const effectiveToday = new Date(now);
    if (now.getHours() < 4) {
        effectiveToday.setDate(effectiveToday.getDate() - 1);
    }
    effectiveToday.setHours(0, 0, 0, 0);

    let totalTasks = 0;

    for (let w = 1; w <= totalWeeks; w++) {
        for (let d = 0; d < dayOrder.length; d++) {
            const taskDate = new Date(startDate);
            taskDate.setDate(taskDate.getDate() + (w - 1) * 7 + d);
            taskDate.setHours(0, 0, 0, 0);

            // ★ 데드라인 연장 체크
            const taskDateStr = taskDate.getFullYear() + '-' +
                String(taskDate.getMonth() + 1).padStart(2, '0') + '-' +
                String(taskDate.getDate()).padStart(2, '0');
            const ext = (mpDeadlineExtensions || []).find(e => e.original_date === taskDateStr);
            
            // 연장된 과제: 연장된 마감이 아직 안 지났으면 분모에서 제외
            if (ext) {
                let extDeadline = new Date(taskDate);
                extDeadline.setDate(extDeadline.getDate() + 1);
                extDeadline.setHours(4, 0, 0, 0);
                extDeadline.setDate(extDeadline.getDate() + (ext.extra_days || 1));
                if (now < extDeadline) continue; // 연장 마감 전 → 분모 제외
            }

            // 과제 날짜가 오늘(effective) 이하면 분모에 포함
            if (taskDate <= effectiveToday) {
                const dayEn = dayOrder[d];
                const dayKr = dayEnToKr[dayEn];
                const tasks = getDayTasks(programType, w, dayEn);
                
                tasks.forEach(function(taskName) {
                    const parsed = (typeof parseTaskName === 'function') ? parseTaskName(taskName) : null;
                    if (!parsed || parsed.type === 'unknown') return;

                    totalTasks++;
                });
            }
        }
    }

    return { due: totalTasks };
}

/**
 * tr_grade_rules 테이블에서 등급 판정
 * @param {number} authRatePct - 인증률 (0~100)
 * @returns {object} { letter, refundRate, deposit, color }
 */
function getGradeFromRules(authRatePct) {
    // tr_grade_rules에서 매칭 (min_rate DESC 정렬되어 있음)
    if (mpGradeRules && mpGradeRules.length > 0) {
        for (const rule of mpGradeRules) {
            if (authRatePct >= rule.min_rate) {
                return {
                    letter: rule.grade,
                    refundRate: rule.refund_rate,
                    deposit: rule.deposit || 100000,
                    color: getGradeColor(rule.grade)
                };
            }
        }
        // 어떤 규칙에도 안 걸리면 F
        const lastRule = mpGradeRules[mpGradeRules.length - 1];
        return {
            letter: lastRule.grade,
            refundRate: lastRule.refund_rate,
            deposit: lastRule.deposit || 100000,
            color: getGradeColor(lastRule.grade)
        };
    }

    // 폴백: tr_grade_rules 로드 실패 시
    console.warn('📊 [MyPage] tr_grade_rules 로드 실패, 등급 산정 불가');
    return { letter: '-', refundRate: 0, deposit: 100000, color: '#6b7280' };
}

/**
 * 등급별 색상
 */
function getGradeColor(grade) {
    const colors = { 'A': '#22c55e', 'B': '#3b82f6', 'C': '#f59e0b', 'D': '#f97316', 'F': '#ef4444' };
    return colors[grade] || '#6b7280';
}

// ================================================
// ② 잔디 렌더링
// ================================================
function renderGrass() {
    const programType = mpUser.programType || 'standard';
    const gridId = programType === 'fast' ? 'grass-fast' : 'grass-standard';

    // ★ V2 데이터 기반 인증률 맵 (level 0~3)
    const completedMap = buildCompletedMap();
    const currentDay = isBeforeStart() ? 0 : getCurrentScheduleDay();

    // ★ 데드라인 연장된 dayNum 목록 계산
    const extendedDayNums = buildExtendedDayNums();

    const levelClasses = ['', 'level-1', 'level-2', 'level-3'];

    document.querySelectorAll(`#${gridId} .g`).forEach(cell => {
        const dayNum = parseInt(cell.dataset.day);
        const order = parseInt(cell.dataset.order);
        const key = `${dayNum}_${order}`;

        // ★ 연장된 셀 테두리 표시
        if (extendedDayNums.has(dayNum)) {
            cell.classList.add('extended');
        }

        const level = completedMap.get(key);

        if (level && level > 0) {
            // 인증률 레벨에 따라 클래스 적용
            cell.classList.remove('empty', 'fail', 'success', 'level-1', 'level-2', 'level-3');
            cell.classList.add(levelClasses[level]);
        } else if (dayNum < currentDay && !extendedDayNums.has(dayNum)) {
            // ★ 기한 지남 + 미제출 → 빨간칸
            cell.classList.remove('empty', 'success', 'level-1', 'level-2', 'level-3');
            cell.classList.add('fail');
        }
    });
}

/**
 * 데드라인 연장된 날짜 → dayNum 목록 (아직 마감 전인 것만)
 */
function buildExtendedDayNums() {
    const set = new Set();
    if (!mpUser.startDate || !mpDeadlineExtensions || mpDeadlineExtensions.length === 0) return set;

    const startDate = new Date(mpUser.startDate + 'T00:00:00');
    if (isNaN(startDate.getTime())) return set;

    const now = new Date();
    const dayOrder = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

    mpDeadlineExtensions.forEach(ext => {
        const origDate = new Date(ext.original_date + 'T00:00:00');
        if (isNaN(origDate.getTime())) return;

        // 연장된 마감 계산 (task-router.js와 동일한 순서)
        let extDeadline = new Date(origDate);
        extDeadline.setDate(extDeadline.getDate() + 1);
        extDeadline.setHours(4, 0, 0, 0);
        extDeadline.setDate(extDeadline.getDate() + (ext.extra_days || 1));

        // 아직 마감 전이면 → dayNum 계산해서 추가
        if (now < extDeadline) {
            const diffMs = origDate - startDate;
            const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            // 토요일(6) 제외한 일차 계산: 7일 중 6일 사용
            const weekIndex = Math.floor(diffDays / 7);
            const dayIndex = diffDays % 7;
            if (dayIndex < dayOrder.length) {
                const dayNum = weekIndex * 6 + dayIndex + 1;
                set.add(dayNum);
            }
        }
    });

    return set;
}

/**
 * 과제별 인증률 맵 생성 (V2)
 * key: "dayNum_order" (잔디 HTML의 data-day + data-order)
 * value: 인증률 레벨 (0, 1, 2, 3)
 *   0 = 미제출, 1 = 1차만, 2 = 1차+2차, 3 = 100% 완료
 * 
 * study_results_v2의 (section_type, week, day, module_number)를
 * 잔디 그리드의 (dayNum, order)에 매핑
 */
function buildCompletedMap() {
    const map = new Map();
    const programType = mpUser.programType || 'standard';
    const gridId = programType === 'fast' ? 'grass-fast' : 'grass-standard';

    // section_type → 잔디 data-type 매핑
    const typeMap = {
        'vocab': 'voca_test',
        'intro-book': 'intro_reading',
        'reading': 'reading_module',
        'listening': 'listening_module',
        'writing': 'writing',
        'speaking': 'speaking'
    };

    // 각 V2 결과 → 해당 잔디 셀 매핑
    mpV2Results.forEach(record => {
        const week = record.week;
        const dayKr = record.day;
        const sectionType = record.section_type;
        const grassType = typeMap[sectionType] || sectionType;

        // week + 요일 → dayNum 계산
        const dayIndex = DAY_MAP_KR_TO_NUM[dayKr];
        if (dayIndex === undefined) return;
        const dayNum = (parseInt(week) - 1) * 6 + dayIndex + 1;

        // 인증률 레벨 계산
        let level = 0;
        if (sectionType === 'vocab' || sectionType === 'intro-book') {
            // 보카/입문서: 0 또는 3 (100%)
            level = record.first_result_json ? 3 : 0;
        } else {
            // 리딩/리스닝/라이팅/스피킹: 4단계
            if (record.first_result_json) level = 1;
            if (record.first_result_json && record.second_result_json) level = 2;
            if (record.first_result_json && record.second_result_json && record.error_note_submitted) level = 3;
        }

        if (level === 0) return;

        // 해당 dayNum의 잔디 셀에서 타입 매칭
        const cells = document.querySelectorAll(`#${gridId} .g[data-day="${dayNum}"]`);
        cells.forEach(cell => {
            if (cell.dataset.type === grassType) {
                map.set(`${dayNum}_${cell.dataset.order}`, level);
            }
        });
    });

    return map;
}

/**
 * 현재 스케줄 진행 일차 계산
 */
function getCurrentScheduleDay() {
    if (!mpUser.startDate) return 1;
    const start = new Date(mpUser.startDate);
    start.setHours(0, 0, 0, 0);

    // 새벽 4시 기준: 4시 이전이면 전날로 간주
    const now = new Date();
    const effectiveToday = new Date(now);
    if (now.getHours() < 4) {
        effectiveToday.setDate(effectiveToday.getDate() - 1);
    }
    effectiveToday.setHours(0, 0, 0, 0);

    // 시작일부터 오늘까지 경과 일수 (토요일 제외)
    let count = 0;
    const d = new Date(start);
    while (d <= effectiveToday) {
        if (d.getDay() !== 6) count++; // 토요일 제외
        d.setDate(d.getDate() + 1);
    }
    return Math.max(1, count);
}

// ================================================
// ③ 성적 추이 라인 차트 (first_level 기반)
// ================================================
let scoreChartInstance = null;  // Chart.js 인스턴스
let currentScoreTab = 'reading'; // 현재 활성 탭

/**
 * 특정 section_type의 차트 데이터 생성
 * → 모듈 번호 순 정렬, 라벨 + first_level 배열 반환
 */
function buildChartData(sectionType) {
    const filtered = mpV2Results
        .filter(r => r.section_type === sectionType && r.first_level != null)
        .sort((a, b) => {
            const wA = extractNum(a.week) * 100 + (a.module_number || 0);
            const wB = extractNum(b.week) * 100 + (b.module_number || 0);
            return wA - wB;
        });

    const labels = [];
    const levels = [];

    filtered.forEach(r => {
        const m = r.module_number || '?';
        labels.push('M' + m);
        levels.push(r.first_level);
    });

    return { labels, levels };
}

/**
 * Chart.js로 라인 차트 렌더링
 */
function renderScoreChart() {
    const canvas = document.getElementById('scoreChart');
    const emptyEl = document.getElementById('scoreChartEmpty');
    if (!canvas) return;

    // 탭 이벤트 바인딩 (최초 1회)
    setupScoreTabEvents();

    // 데이터 생성
    const data = buildChartData(currentScoreTab);

    // 데이터 없음 처리
    if (data.labels.length === 0) {
        canvas.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'flex';
        if (scoreChartInstance) { scoreChartInstance.destroy(); scoreChartInstance = null; }
        return;
    }

    canvas.style.display = '';
    if (emptyEl) emptyEl.style.display = 'none';

    // 기존 차트 제거 후 새로 생성
    if (scoreChartInstance) { scoreChartInstance.destroy(); }

    scoreChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Level',
                data: data.levels,
                borderColor: '#9480c5',
                backgroundColor: 'rgba(148, 128, 197, 0.08)',
                borderWidth: 2.5,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#9480c5',
                pointBorderWidth: 2.5,
                pointRadius: 5,
                pointHoverRadius: 7,
                pointHoverBackgroundColor: '#9480c5',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e1b2e',
                    titleFont: { size: 13, weight: '600' },
                    bodyFont: { size: 14, weight: '700' },
                    padding: 12,
                    cornerRadius: 10,
                    displayColors: false,
                    callbacks: {
                        title: function(ctx) { return 'Module ' + ctx[0].label.replace('M',''); },
                        label: function(ctx) { return 'Level ' + ctx.raw.toFixed(1); }
                    }
                }
            },
            scales: {
                y: {
                    min: 1.0,
                    max: 6.0,
                    ticks: {
                        stepSize: 0.5,
                        callback: function(v) { return v.toFixed(1); },
                        font: { size: 12, weight: '500' },
                        color: '#99aabb'
                    },
                    grid: {
                        color: 'rgba(0,0,0,0.04)',
                        drawBorder: false
                    },
                    border: { display: false }
                },
                x: {
                    ticks: {
                        font: { size: 12, weight: '600' },
                        color: '#5c6878'
                    },
                    grid: { display: false },
                    border: { display: false }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });

    console.log(`📊 [MyPage] 성적 추이 차트 렌더링 완료 - ${currentScoreTab}, ${data.labels.length}건`);
}

/**
 * 탭 클릭 이벤트 바인딩
 */
let scoreTabsBound = false;
function setupScoreTabEvents() {
    if (scoreTabsBound) return;
    scoreTabsBound = true;

    document.querySelectorAll('.score-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.score-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentScoreTab = tab.getAttribute('data-tab');
            renderScoreChart();
        });
    });
}

/**
 * 날짜 포맷: "2/19 (목)"
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`;
}

/**
 * task_type → 한글 라벨 + CSS 클래스
 */
function getTaskLabel(taskType) {
    const labels = {
        'reading': { name: 'Reading', cls: '' },
        'listening': { name: 'Listening', cls: 'listening' },
        'writing': { name: 'Writing', cls: 'writing' },
        'speaking': { name: 'Speaking', cls: 'speaking' },
        'vocab': { name: 'Vocab', cls: 'vocab' },
        'intro-book': { name: '입문서', cls: 'intro-book' }
    };
    return labels[taskType] || { name: taskType, cls: '' };
}

/**
 * 모듈 텍스트 생성
 */
function getModuleText(record) {
    if (record.task_type === 'vocab') {
        return `Week ${record.week} ${record.day}`;
    }
    if (record.task_type === 'intro-book') {
        return `${record.day}요일`;
    }
    return `Module ${record.module_number || ''}`;
}

/**
 * 점수 렌더링
 */
function renderScore(record) {
    if (record.task_type === 'vocab') {
        const rate = record.vocab_accuracy_rate;
        if (rate !== undefined && rate !== null) {
            const pct = Math.round(rate * 100);
            return `
                <span class="score-badge">${pct}%</span>
                <div class="score-bar">
                    <div class="score-fill" style="width:${pct}%;"></div>
                </div>
            `;
        }
        return `<span class="score-badge">${record.score || 0} / ${record.total || 0}</span>`;
    }

    if (record.task_type === 'intro-book') {
        return '<span class="score-badge" style="color:var(--accent);">✓ 완료</span>';
    }

    const score = record.score || 0;
    const total = record.total || 1;
    const pct = Math.round((score / total) * 100);

    return `
        <span class="score-badge">${score} / ${total}</span>
        <div class="score-bar">
            <div class="score-fill" style="width:${pct}%;"></div>
        </div>
    `;
}

/**
 * 해설 다시보기 버튼 렌더링
 */
function renderReplayButton(record) {
    // reading, listening, speaking, writing 지원
    const supported = ['reading', 'listening', 'speaking', 'writing'];
    if (!supported.includes(record.task_type)) {
        return `<button class="btn-replay" disabled><i class="fa-solid fa-book-open"></i> -</button>`;
    }
    
    // 지원 타입이면 버튼 표시 (클릭 시 서버에서 result_json 확인)
    return `
        <button class="btn-replay" onclick="replayExplanation('${record.id}')">
            <i class="fa-solid fa-book-open"></i> 해설
        </button>
    `;
}

/**
 * 다시 풀기 버튼 렌더링
 * 마이페이지에서 이전 과제를 연습 모드로 다시 풀 수 있음
 * (인증률/점수에 영향 없음)
 */
function renderRetryButton(record) {
    // 다시 풀기 지원 타입
    const supported = ['reading', 'listening', 'writing', 'speaking', 'vocab'];
    if (!supported.includes(record.task_type)) {
        return '';
    }
    
    // task_type + module_number로 과제 식별
    const taskType = record.task_type;
    const moduleNum = record.module_number || 1;
    const week = record.week || 1;
    const day = record.day || '';
    
    return `
        <button class="btn-retry" onclick="retryTask('${taskType}', ${moduleNum}, ${week}, '${day}')">
            <i class="fa-solid fa-rotate-right"></i> 다시풀기
        </button>
    `;
}

/**
 * 다시 풀기 실행
 * index.html로 이동하여 해당 과제를 연습 모드로 실행
 */
function retryTask(taskType, moduleNumber, week, day) {
    if (!confirm('연습 모드로 다시 풀어봅니다.\n(기존 점수/인증률에 영향 없습니다)\n\n진행하시겠습니까?')) {
        return;
    }
    
    // 로딩 오버레이 표시
    showLoadingOverlay('과제를 준비하고 있습니다...');
    
    // sessionStorage에 retry 정보 저장
    const retryData = {
        taskType: taskType,
        moduleNumber: moduleNumber,
        week: week,
        day: day,
        isPracticeMode: true
    };
    sessionStorage.setItem('retryData', JSON.stringify(retryData));
    
    // index.html로 이동
    window.location.href = 'index.html?retry=true';
}

/**
 * 노트 버튼 렌더링
 */
function renderNoteButton(record) {
    if (record.error_note_text && record.error_note_text.trim()) {
        const escaped = record.error_note_text
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n');
        const title = `${getTaskLabel(record.task_type).name} Module ${record.module_number || ''}`;
        return `
            <button class="btn-note" onclick="openNote('${title}', '${escaped}')">
                <i class="fa-regular fa-note-sticky"></i> 노트보기
            </button>
        `;
    }
    if (record.memo_text && record.memo_text.trim()) {
        const escaped = record.memo_text
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n');
        return `
            <button class="btn-note" onclick="openNote('입문서 메모', '${escaped}')">
                <i class="fa-regular fa-note-sticky"></i> 메모보기
            </button>
        `;
    }
    return `<button class="btn-note" disabled><i class="fa-regular fa-note-sticky"></i> -</button>`;
}

// ================================================
// 플랜 탭 전환
// ================================================
function setupPlanTabs() {
    const programType = mpUser.programType || 'standard';

    // 해당 잔디 그리드만 표시 (탭 버튼 없음)
    document.getElementById('grass-fast').style.display = programType === 'fast' ? '' : 'none';
    document.getElementById('grass-standard').style.display = programType === 'standard' ? '' : 'none';

    console.log(`🌱 [MyPage] 출석 잔디: ${programType} 과정 표시`);
}

// ================================================
// 모달
// ================================================
function openNote(title, content) {
    document.getElementById('noteTitle').innerHTML = 
        `<i class="fa-regular fa-note-sticky"></i> ${title}`;
    document.getElementById('noteContent').textContent = content;
    document.getElementById('noteModal').classList.add('open');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('open');
}

// 모달 바깥 클릭으로 닫기
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('open');
    }
});

// ESC 키로 모달 닫기
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
    }
});

// ================================================
// 네비게이션
// ================================================
function goBackToTestroom() {
    window.location.href = 'index.html';
}

function handleLogout() {
    if (confirm('로그아웃 하시겠습니까?')) {
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    }
}

// ================================================
// 유틸리티
// ================================================

/**
 * week/day 값에서 숫자만 추출
 * "Week 1" → 1, "1" → 1, 1 → 1, "일" → 0
 */
function extractNum(val) {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    const match = String(val).match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
}

function showNotLoggedIn() {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('notLoggedScreen').style.display = 'flex';
}

console.log('✅ mypage.js 로드 완료');
