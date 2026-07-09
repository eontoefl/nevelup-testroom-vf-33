/**
 * mypage-australia.js – 호주과정 마이페이지 로직
 *
 * 정규과정 mypage.js 기반, 호주과정 전용 수정:
 * - 오늘의 과제: getAusDayTasks() 사용
 * - 챌린지 현황: australiaStartDate 사용
 * - 인증률 / 등급&환급: 추후 구현 (고정 텍스트)
 * - 공부인증 현황: study_certifications 테이블 기반 리스트
 * - 성적 추이 / 이전 학습 기록: 제거
 */

// ================================================
// 전역 상태
// ================================================
let mpUser = null;
let mpCertifications = [];
let mpOmrResults = [];
let mpGradeRules = [];
let scoreChartInstance = null;
let currentScoreTab = 'reading';
let selectedPointIndex = -1;
let chartDataCache = null;

const DAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

// ================================================
// 초기화
// ================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📊 [MyPage-AUS] 초기화 시작');

    const saved = sessionStorage.getItem('currentUser');
    if (!saved) {
        showNotLoggedIn();
        return;
    }

    mpUser = JSON.parse(saved);
    console.log('📊 [MyPage-AUS] 유저:', mpUser.name, mpUser.programType);

    document.getElementById('userName').textContent = mpUser.name;
    document.getElementById('programBadge').textContent = '호주과정';

    try {
        await loadAllData();
        renderAll();
    } catch (err) {
        console.error('❌ [MyPage-AUS] 데이터 로드 실패:', err);
    }

    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('mainContent').style.display = 'flex';
});

// ================================================
// 데이터 로드
// ================================================
async function loadAllData() {
    const userEmail = mpUser.email;
    if (!userEmail) {
        console.warn('⚠️ [MyPage-AUS] 유저 이메일 없음');
        return;
    }

    const userId = mpUser.id;

    const [certs, omrRows, gradeRules] = await Promise.all([
        supabaseSelect(
            'study_certifications',
            `author_email=eq.${encodeURIComponent(userEmail)}&order=published_at.desc&select=id,subject,published_at`
        ),
        userId ? supabaseSelect(
            'aus_study_results',
            `user_id=eq.${userId}&initial_record=not.is.null&order=completed_at.asc&select=user_id,section_type,module_number,week,day,initial_record,current_record,locked_auth_rate,completed_at`
        ) : Promise.resolve([]),
        supabaseSelect(
            'tr_grade_rules',
            `select=grade,min_rate,refund_rate,deposit&order=min_rate.desc`
        )
    ]);

    mpCertifications = certs || [];
    mpOmrResults = omrRows || [];
    mpGradeRules = gradeRules || [];

    console.log(`📊 [MyPage-AUS] 인증글 ${mpCertifications.length}건, OMR ${mpOmrResults.length}건, 등급규칙 ${mpGradeRules.length}건 로드`);
}

// ================================================
// 전체 렌더링
// ================================================
function renderAll() {
    renderTodayTasks();
    renderSummaryCards();
    renderScoreChart();
    renderAusGrass();
    renderCertificationList();
    setupRecordsNav();
}

// ================================================
// 학습 잔디 (정규 mypage 방식 이식 — 호주 스케줄/기록 기반)
// ================================================

// 호주 과제 이름 → 저장 기록 키(분류/모듈번호). aus_study_results 실데이터 기준 매핑.
//   보카/입문서 = 모듈1(주·요일로 구분), 그 외는 이름 끝 숫자가 모듈번호.
function _ausTaskKey(taskName) {
    const t = (taskName || '').trim();
    let m;
    if (t.indexOf('내벨업보카') === 0) return { type: 'vocab', mod: 1 };
    if (t.indexOf('입문서') === 0) return { type: 'intro-book-aus', mod: 1 };
    if ((m = t.match(/^리딩\s*(\d+)/))) return { type: 'reading', mod: parseInt(m[1]) };
    if ((m = t.match(/^리스닝\s*(\d+)/))) return { type: 'listening', mod: parseInt(m[1]) };
    if ((m = t.match(/브레인스토밍\s*Day\s*(\d+)/))) return { type: 'brainstorming', mod: parseInt(m[1]) };
    if ((m = t.match(/^통스\s*(\d+)/))) return { type: 'intspk', mod: parseInt(m[1]) };
    if ((m = t.match(/^통라\s*(\d+)/))) return { type: 'intwrt', mod: parseInt(m[1]) };
    if ((m = t.match(/^토라\s*(\d+)/))) return { type: 'aus-discussion', mod: parseInt(m[1]) };
    if ((m = t.match(/^독스\s*(?:TOPIC\s*)?(\d+)/))) return { type: 'ind-spk', mod: parseInt(m[1]) };
    return null;
}

// 잔디 렌더: 완료=초록(level-2), 마감 지남+미완료=빨강(fail), 그 외=회색(empty)
function renderAusGrass() {
    const section = document.getElementById('ausGrassSection');
    const grid = document.getElementById('ausGrassGrid');
    if (!section || !grid) return;

    // 신규 코호트(앱 자동 수집)만 잔디 표시. 구 코호트는 앱 학습 기록이 없어 숨김.
    if (!_isAusCollectCohort()) { section.style.display = 'none'; return; }
    if (typeof getAusDayTasks !== 'function') { section.style.display = 'none'; return; }
    section.style.display = '';

    const programType = mpUser.programType || 'fast';
    const totalWeeks = programType === 'standard' ? 8 : 4;
    grid.className = 'grass-grid ' + (programType === 'standard' ? 'grass-std-grid' : 'grass-fast-grid');

    const startDateStr = getAusStartDate();
    const startDate = startDateStr ? new Date(startDateStr + 'T00:00:00') : null;
    const now = new Date();
    const tz = getUserTimezone();

    // 제출 기록 집합: "분류|모듈|주|요일"
    const doneSet = new Set();
    (mpOmrResults || []).forEach(function(r) {
        doneSet.add(r.section_type + '|' + String(r.module_number) + '|' + String(r.week) + '|' + r.day);
    });

    const dayEnArr = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const dayKrArr = ['일', '월', '화', '수', '목', '금'];
    const esc = function(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    let html = '<div class="g-label"></div>';
    dayKrArr.forEach(function(d) { html += '<div class="g-head">' + d + '</div>'; });

    for (let w = 1; w <= totalWeeks; w++) {
        html += '<div class="g-label">Week ' + w + '</div>';
        for (let di = 0; di < 6; di++) {
            const tasks = getAusDayTasks(programType, w, dayEnArr[di]) || [];

            // 이 날 마감 = 시작일 + (주-1)*7 + 요일 → 다음날 04:00 (호주 정규와 동일, 연장 없음)
            let past = false;
            if (startDate && typeof getTaskDeadline === 'function') {
                const taskDate = new Date(startDate);
                taskDate.setDate(taskDate.getDate() + (w - 1) * 7 + di);
                const dl = getTaskDeadline(taskDate, tz);
                past = !!(dl && now >= dl);
            }

            let cells = '';
            tasks.forEach(function(t) {
                const key = _ausTaskKey(t);
                const done = key && doneSet.has(key.type + '|' + String(key.mod) + '|' + String(w) + '|' + dayKrArr[di]);
                let cls = done ? 'level-2' : (past ? 'fail' : 'empty');
                cells += '<span class="g ' + cls + '" title="' + esc(t) + '"></span>';
            });
            if (tasks.length === 0) cells = '<span class="g blank"></span>';
            html += '<div class="g-day">' + cells + '</div>';
        }
    }
    grid.innerHTML = html;
    console.log('🌱 [MyPage-AUS] 학습 잔디 렌더 (' + programType + ', ' + totalWeeks + '주)');
}

// ================================================
// 내 기록 (좌측 네비 + 유형별 보기)
// ================================================
let currentRecTab = 'memo';

function setupRecordsNav() {
    // 구 코호트: 좌측 네비·내 기록 숨기고 대시보드만 (공부인증 현황은 그대로 표시)
    if (!_isAusCollectCohort()) {
        const sidenav = document.querySelector('.mp-sidenav');
        if (sidenav) sidenav.style.display = 'none';
        const rec = document.getElementById('viewRecords');
        if (rec) rec.style.display = 'none';
        const dash = document.getElementById('viewDashboard');
        if (dash) dash.style.display = '';
        return;
    }

    // 좌측 네비: 현황 / 내 기록 전환 (신규 코호트만)
    document.querySelectorAll('.mp-nav-item').forEach(function(btn) {
        btn.onclick = function() {
            document.querySelectorAll('.mp-nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const view = btn.dataset.view;
            const dash = document.getElementById('viewDashboard');
            const rec = document.getElementById('viewRecords');
            if (dash) dash.style.display = (view === 'dashboard') ? '' : 'none';
            if (rec) rec.style.display = (view === 'records') ? '' : 'none';
            if (view === 'records') renderRecords(currentRecTab);
        };
    });
    // 내 기록 안의 유형 탭
    document.querySelectorAll('.rec-tab').forEach(function(tab) {
        tab.onclick = function() {
            document.querySelectorAll('.rec-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentRecTab = tab.dataset.rectab;
            renderRecords(currentRecTab);
        };
    });
}

function _recParse(x) {
    if (!x) return null;
    if (typeof x === 'string') { try { return JSON.parse(x); } catch (e) { return null; } }
    return x;
}
function _recDate(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return `${d.getMonth() + 1}/${d.getDate()}`;
}
function _recEsc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
function _recSortDesc(arr) {
    return arr.slice().sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')));
}

function renderRecords(type) {
    const container = document.getElementById('recordsBody');
    if (!container) return;
    const records = mpOmrResults || [];

    if (type === 'memo') {
        const list = _recSortDesc(records.filter(r => r.section_type === 'brainstorming'));
        if (!list.length) { container.innerHTML = '<div class="rec-empty">아직 작성한 메모가 없어요.</div>'; return; }
        let html = '';
        list.forEach(function(r) {
            const cr = _recParse(r.current_record) || {};
            const memos = cr.memos || {};
            const texts = Object.keys(memos).sort().map(k => memos[k]).filter(t => t && t.trim());
            html += '<div class="rec-item">';
            html += `<div class="rec-item-head"><span class="rec-item-title">브레인스토밍 Day ${r.module_number}</span><span class="rec-item-date">${_recDate(r.completed_at)}</span></div>`;
            if (texts.length) {
                texts.forEach(function(t, i) {
                    html += `<div class="rec-memo-block"><div style="font-size:12px;color:#888;margin-bottom:4px;">주제 ${i + 1}</div>${_recEsc(t)}</div>`;
                });
            } else {
                html += '<div class="rec-item-body" style="color:#999;">메모 내용이 없어요.</div>';
            }
            html += '</div>';
        });
        container.innerHTML = html;

    } else if (type === 'essay') {
        const list = _recSortDesc(records.filter(r => r.section_type === 'intwrt' || r.section_type === 'aus-discussion'));
        if (!list.length) { container.innerHTML = '<div class="rec-empty">아직 제출한 에세이가 없어요.</div>'; return; }
        let html = '';
        list.forEach(function(r) {
            const ir = _recParse(r.initial_record) || {};
            const label = (r.section_type === 'intwrt' ? '통라 ' : '토라 ') + r.module_number;
            const wc = ir.wordCount ? ` · ${ir.wordCount}단어` : '';
            html += '<div class="rec-item">';
            html += `<div class="rec-item-head"><span class="rec-item-title">${label}${wc}</span><span class="rec-item-date">${_recDate(r.completed_at)}</span></div>`;
            html += `<div class="rec-item-body">${_recEsc(ir.answer || '')}</div>`;
            html += '</div>';
        });
        container.innerHTML = html;

    } else if (type === 'audio') {
        const list = _recSortDesc(records.filter(r => r.section_type === 'ind-spk' || r.section_type === 'intspk'));
        if (!list.length) { container.innerHTML = '<div class="rec-empty">아직 제출한 녹음이 없어요.</div>'; return; }
        let html = '';
        list.forEach(function(r) {
            const ir = _recParse(r.initial_record) || {};
            const label = (r.section_type === 'ind-spk' ? '독스 TOPIC ' : '통스 ') + r.module_number;
            let url = '';
            if (ir.audioPath) {
                url = (String(ir.audioPath).indexOf('http') === 0) ? ir.audioPath
                    : (typeof supabaseStorageUrl === 'function' ? supabaseStorageUrl('speaking-files', ir.audioPath) : '');
            }
            html += '<div class="rec-item">';
            html += `<div class="rec-item-head"><span class="rec-item-title">${label}</span><span class="rec-item-date">${_recDate(r.completed_at)}</span></div>`;
            if (url) {
                html += `<audio controls preload="none" style="width:100%;"><source src="${url}"></audio>`;
            } else {
                html += '<div class="rec-item-body" style="color:#999;">녹음 파일을 찾을 수 없어요.</div>';
            }
            html += '</div>';
        });
        container.innerHTML = html;
    }
}

// ================================================
// 시작일 관련 유틸
// ================================================
function getAusStartDate() {
    return mpUser.startDate;
}

// 신규 코호트(앱 자동 인증 대상)인지 — 수집 게이트와 동일 규칙
// 테스트 모드(AUS_GATE_ENABLED=false)면 전원, 실서비스면 시작일 >= 기준일
function _isAusCollectCohort() {
    if (typeof AUS_GATE_ENABLED !== 'undefined' && AUS_GATE_ENABLED === false) return true;
    const cutoff = (typeof AUS_COLLECT_CUTOFF !== 'undefined') ? AUS_COLLECT_CUTOFF : '2026-06-14';
    const start = mpUser && mpUser.startDate;
    return !!(start && String(start).slice(0, 10) >= cutoff);
}

function isBeforeStart() {
    const sd = getAusStartDate();
    if (!sd) return false;
    const start = new Date(sd);
    start.setHours(0, 0, 0, 0);
    return getEffectiveToday(getUserTimezone()) < start;
}

function getDaysUntilStart() {
    const sd = getAusStartDate();
    if (!sd) return 0;
    const start = new Date(sd);
    start.setHours(0, 0, 0, 0);
    return Math.ceil((start - getEffectiveToday(getUserTimezone())) / (1000 * 60 * 60 * 24));
}

function formatStartDate(dateStr) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} (${DAY_KR[d.getDay()]})`;
}

function formatFullDate(dateStr) {
    const d = new Date(dateStr);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}(${DAY_KR[d.getDay()]})`;
}

// ================================================
// 오늘의 과제 렌더링
// ================================================
function renderTodayTasks() {
    const container = document.getElementById('todayTaskList');
    if (!container) return;

    const programType = mpUser.programType || 'standard';
    const totalWeeks = programType === 'standard' ? 8 : 4;

    if (typeof getAusDayTasks !== 'function') {
        container.innerHTML = '<p class="sc-sub">스케줄 데이터를 불러올 수 없습니다</p>';
        return;
    }

    if (isBeforeStart()) {
        const startStr = formatStartDate(getAusStartDate());
        container.innerHTML = `<p class="today-task-empty">📅 ${startStr}부터 시작됩니다!</p>`;
        return;
    }

    const effectiveToday = getEffectiveToday(getUserTimezone());
    const startDateStr = getAusStartDate();
    const startDate = new Date(startDateStr + 'T00:00:00');
    if (isNaN(startDate.getTime())) {
        container.innerHTML = '<p class="today-task-empty">시작일 정보 없음</p>';
        return;
    }

    const diffDays = Math.floor((effectiveToday - startDate) / (1000 * 60 * 60 * 24));
    const dayOrder = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const weekNum = Math.floor(diffDays / 7) + 1;
    const dayIndex = diffDays % 7;
    const dayEn = dayOrder[dayIndex];

    if (weekNum > totalWeeks || dayEn === 'saturday') {
        container.innerHTML = '<p class="today-task-empty">오늘은 휴무입니다 😊</p>';
        return;
    }

    const tasks = getAusDayTasks(programType, weekNum, dayEn);

    if (!tasks || tasks.length === 0) {
        container.innerHTML = '<p class="today-task-empty">오늘은 휴무입니다 😊</p>';
        return;
    }

    function getAusTaskIcon(name) {
        if (name.includes('내벨업보카')) return '📝';
        if (name.includes('입문서')) return '📚';
        if (name.includes('리딩')) return '📖';
        if (name.includes('리스닝')) return '🎧';
        if (name.includes('통스')) return '🎤';
        if (name.includes('통라')) return '✍️';
        if (name.includes('토라')) return '✏️';
        if (name.includes('독스')) return '🎙️';
        if (name.includes('브레인스토밍')) return '🧠';
        return '📋';
    }

    let html = '<ul class="today-task-ul">';
    tasks.forEach(taskName => {
        const icon = getAusTaskIcon(taskName);
        html += `<li class="today-task-item">${icon} ${taskName}</li>`;
    });
    html += '</ul>';
    html += `<p class="today-task-count">총 ${tasks.length}건</p>`;

    container.innerHTML = html;
    console.log(`📝 [MyPage-AUS] 오늘의 과제 ${tasks.length}건 표시 (W${weekNum} ${dayEn})`);
}

// ================================================
// 학습 현황 요약 카드
// ================================================
function renderSummaryCards() {
    const programType = mpUser.programType || 'standard';
    const totalWeeks = programType === 'standard' ? 8 : 4;
    const totalCalendarDays = totalWeeks * 7;

    const startDateStr = getAusStartDate();
    if (!startDateStr) return;

    const startDate = new Date(startDateStr);
    startDate.setHours(0, 0, 0, 0);
    const today = getEffectiveToday(getUserTimezone());
    const beforeStart = isBeforeStart();

    // 챌린지 현황
    if (beforeStart) {
        const daysLeft = getDaysUntilStart();
        const startStr = formatStartDate(startDateStr);
        document.getElementById('challengeStatus').textContent = `D-${daysLeft}`;
        document.getElementById('challengeBar').style.width = '0%';
        document.getElementById('challengeSub').textContent = `${startStr} 시작 예정`;
        document.getElementById('challengeStartDate').textContent = `시작일: ${formatFullDate(startDateStr)}`;
    } else {
        const dplus = Math.min(Math.floor((today - startDate) / (1000 * 60 * 60 * 24)), totalCalendarDays);
        const remainingDays = Math.max(0, totalCalendarDays - dplus);
        const elapsedPct = Math.min(100, Math.round((dplus / totalCalendarDays) * 100));
        document.getElementById('challengeStatus').textContent = `D+${dplus} / ${totalCalendarDays}일`;
        document.getElementById('challengeBar').style.width = `${elapsedPct}%`;
        document.getElementById('challengeSub').textContent = `잔여 ${remainingDays}일`;
        document.getElementById('challengeStartDate').textContent = `시작일: ${formatFullDate(startDateStr)}`;
    }

    // ── 인증률 / 등급 / 환급 ──
    // 신규 코호트(기준일 이후 시작자)만 표시. 구 코호트는 수집이 안 돼 부정확하므로 "추후 공개" 유지.
    const ausStart = startDateStr; // 호주 시작일 = schedule_start (australia_schedule_start는 안 씀)
    const isCollectCohort = _isAusCollectCohort();

    if (!isCollectCohort) {
        document.getElementById('authRate').textContent = '-';
        document.getElementById('authRateUnit').textContent = '';
        document.getElementById('authSub').textContent = '추후 공개';
        document.getElementById('currentGrade').textContent = '-';
        document.getElementById('gradeRefund').textContent = '추후 공개';
        return;
    }

    // 분자: 과제별 인증 점수 합 (제출=100, 단어만 30% 이하 미인증=0)
    let authRateSum = 0;
    (mpOmrResults || []).forEach(function(r) {
        authRateSum += _ausTaskAuth(r);
    });

    // 분모: 오늘까지 도래한 과제 수
    const authDenominator = _countAusTasksDue(programType, totalWeeks, ausStart);

    let authRatePct, authSubText;
    if (authDenominator > 0) {
        authRatePct = Math.round(authRateSum / authDenominator);
        authSubText = `오늘까지 할당된 과제 ${authDenominator}건 기준`;
    } else {
        authRatePct = 0;
        authSubText = beforeStart ? '시작 전' : '데이터 없음';
    }

    document.getElementById('authRate').textContent = authRatePct;
    document.getElementById('authRateUnit').textContent = '%';
    document.getElementById('authSub').textContent = authSubText;

    // 등급 & 환급 (정규 규칙 tr_grade_rules 재활용)
    if (beforeStart) {
        document.getElementById('currentGrade').textContent = '-';
        document.getElementById('gradeRefund').textContent = '시작 후 산정';
    } else {
        const grade = _ausGradeFromRules(authRatePct);
        const gradeEl = document.getElementById('currentGrade');
        gradeEl.textContent = grade.letter;
        gradeEl.style.background = grade.color;
        gradeEl.style.color = '#fff';
        const refundAmount = Math.round(grade.deposit * grade.refundRate);
        document.getElementById('gradeRefund').innerHTML =
            `환급 ${Math.round(grade.refundRate * 100)}% (${refundAmount.toLocaleString()}원)`;
    }
}

// ================================================
// 인증률 계산 헬퍼
// ================================================

// 과제별 인증 점수 (제출=100 / 단어는 30% 이하면 0)
function _ausTaskAuth(r) {
    if (r.section_type === 'vocab') {
        const score = (r.locked_auth_rate != null) ? Number(r.locked_auth_rate) : 0;
        return score > 30 ? 100 : 0; // 단어 30% floor (어뷰징 방지)
    }
    return 100; // 그 외(리딩·리스닝·라이팅·스피킹·브스·입문서) = 제출=인증
}

// 오늘까지 도래한 과제 수 (분모). 호주 스케줄·시작일 기준.
function _countAusTasksDue(programType, totalWeeks, startDateStr) {
    if (!startDateStr || typeof getAusDayTasks !== 'function') return 0;
    const startDate = new Date(startDateStr + 'T00:00:00');
    if (isNaN(startDate.getTime())) return 0;

    const effectiveToday = getEffectiveToday(getUserTimezone());
    const dayOrder = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday']; // 토요일 휴무
    let total = 0;

    for (let w = 1; w <= totalWeeks; w++) {
        for (let d = 0; d < dayOrder.length; d++) {
            const taskDate = new Date(startDate);
            taskDate.setDate(taskDate.getDate() + (w - 1) * 7 + d);
            taskDate.setHours(0, 0, 0, 0);
            // 과제 날짜가 오늘 이하면 분모 포함 (오늘 과제는 마감 전이라도 포함 — 정규와 동일)
            if (taskDate <= effectiveToday) {
                const tasks = getAusDayTasks(programType, w, dayOrder[d]) || [];
                tasks.forEach(function(t) { if (t && t.trim()) total++; });
            }
        }
    }
    return total;
}

// tr_grade_rules에서 등급 판정 (정규 getGradeFromRules와 동일)
function _ausGradeFromRules(authRatePct) {
    if (mpGradeRules && mpGradeRules.length > 0) {
        for (const rule of mpGradeRules) {
            if (authRatePct >= rule.min_rate) {
                return {
                    letter: rule.grade,
                    refundRate: rule.refund_rate,
                    deposit: rule.deposit || 100000,
                    color: _ausGradeColor(rule.grade)
                };
            }
        }
        const last = mpGradeRules[mpGradeRules.length - 1];
        return { letter: last.grade, refundRate: last.refund_rate, deposit: last.deposit || 100000, color: _ausGradeColor(last.grade) };
    }
    console.warn('📊 [MyPage-AUS] tr_grade_rules 로드 실패, 등급 산정 불가');
    return { letter: '-', refundRate: 0, deposit: 100000, color: '#6b7280' };
}

function _ausGradeColor(grade) {
    const colors = { 'A': '#22c55e', 'B': '#3b82f6', 'C': '#f59e0b', 'D': '#f97316', 'F': '#ef4444' };
    return colors[grade] || '#6b7280';
}

// ================================================
// 공부인증 현황 — 내가 올린 글 목록
// ================================================
function renderCertificationList() {
    // 신규 코호트는 앱 자동 인증이라 게시판 "공부인증 현황" 칸을 숨긴다 (혼란 방지)
    const section = document.getElementById('certSection');
    if (_isAusCollectCohort()) {
        if (section) section.style.display = 'none';
        return;
    }
    if (section) section.style.display = '';

    const container = document.getElementById('certificationList');
    if (!container) return;

    const badge = document.getElementById('certCountBadge');
    if (badge) {
        badge.textContent = `${mpCertifications.length}건`;
    }

    if (mpCertifications.length === 0) {
        container.innerHTML = '<p class="cert-empty">아직 작성한 글이 없습니다</p>';
        return;
    }

    let html = '';
    mpCertifications.forEach(cert => {
        const pubDate = new Date(cert.published_at);
        const mm = pubDate.getMonth() + 1;
        const dd = pubDate.getDate();
        const dayKr = DAY_KR[pubDate.getDay()];
        const hh = String(pubDate.getHours()).padStart(2, '0');
        const mi = String(pubDate.getMinutes()).padStart(2, '0');
        const dateLabel = `${mm}/${dd}(${dayKr}) ${hh}:${mi}`;
        const subjectText = cert.subject ? escapeHtml(cert.subject) : '(제목 없음)';
        const postUrl = `https://eonfl.com/study-certify.html?id=${cert.id}`;

        html += `
            <a class="cert-item" href="${postUrl}" target="_blank" rel="noopener">
                <div class="cert-subject">${subjectText}</div>
                <div class="cert-date">
                    <span class="cert-date-text">${dateLabel}</span>
                </div>
            </a>
        `;
    });

    container.innerHTML = html;
    console.log(`📸 [MyPage-AUS] 인증글 ${mpCertifications.length}건 표시`);
}

// ================================================
// 유틸리티
// ================================================
function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showNotLoggedIn() {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('notLoggedScreen').style.display = 'flex';
}

function goBackToTestroom() {
    window.location.href = 'index.html';
}

// ================================================
// OMR 성적 추이 차트
// ================================================
const DAY_ORDER = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const DAY_SHORT = { sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat' };

function buildOmrChartData(sectionType) {
    const grouped = {};

    mpOmrResults
        .filter(r => r.section_type === sectionType && r.initial_record)
        .forEach(r => {
            const rec = typeof r.initial_record === 'string' ? JSON.parse(r.initial_record) : r.initial_record;
            const key = r.week + '_' + r.day;
            if (!grouped[key]) {
                grouped[key] = {
                    week: r.week,
                    day: r.day,
                    score: rec.score,
                    raw: rec.raw,
                    max_raw: rec.max_raw,
                    total_correct: rec.total_correct,
                    total_questions: rec.total_questions,
                    module_records: [],
                    completed_at: r.completed_at
                };
            }
            const questionCount = rec.answers ? Object.keys(rec.answers).length : 0;
            grouped[key].module_records.push({
                module_number: r.module_number,
                question_count: questionCount,
                wrong_numbers: rec.wrong_numbers || [],
                is_combined: !!(rec.combined_modules && rec.combined_modules.length > 1)
            });
        });

    const sorted = Object.values(grouped).sort((a, b) => {
        const wA = parseInt(a.week) * 100 + (DAY_ORDER[a.day] || 0);
        const wB = parseInt(b.week) * 100 + (DAY_ORDER[b.day] || 0);
        return wA - wB;
    });

    return {
        labels: sorted.map(d => 'W' + d.week + '-' + (DAY_SHORT[d.day] || d.day)),
        scores: sorted.map(d => d.score),
        details: sorted
    };
}

function renderScoreChart() {
    const canvas = document.getElementById('scoreChart');
    const emptyEl = document.getElementById('scoreChartEmpty');
    if (!canvas) return;

    setupScoreTabEvents();
    selectedPointIndex = -1;
    hideDetailPanel();

    const data = buildOmrChartData(currentScoreTab);
    chartDataCache = data;

    if (data.labels.length === 0) {
        canvas.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'flex';
        if (scoreChartInstance) { scoreChartInstance.destroy(); scoreChartInstance = null; }
        return;
    }

    canvas.style.display = '';
    if (emptyEl) emptyEl.style.display = 'none';
    if (scoreChartInstance) { scoreChartInstance.destroy(); }

    scoreChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [{
                label: 'Score',
                data: data.scores,
                clip: false,
                borderColor: '#9480c5',
                backgroundColor: 'rgba(148, 128, 197, 0.08)',
                borderWidth: 2.5,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#9480c5',
                pointBorderWidth: 2.5,
                pointRadius: 6,
                pointHoverRadius: 9,
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
            onClick: function(event, elements) {
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    selectPoint(idx, event);
                }
            },
            onHover: function(event, elements) {
                event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
            },
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
                        title: function(ctx) { return ctx[0].label; },
                        label: function(ctx) { return ctx.raw + ' / 30'; }
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 30,
                    ticks: {
                        stepSize: 5,
                        callback: function(v) { return v; },
                        font: { size: 12, weight: '500' },
                        color: '#99aabb'
                    },
                    grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                    border: { display: false }
                },
                x: {
                    ticks: {
                        font: { size: 11, weight: '600' },
                        color: '#5c6878',
                        maxRotation: 45,
                        minRotation: 0
                    },
                    grid: { display: false },
                    border: { display: false }
                }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });
}

function selectPoint(idx, event) {
    if (!chartDataCache || !scoreChartInstance) return;
    selectedPointIndex = idx;

    const ds = scoreChartInstance.data.datasets[0];
    const len = ds.data.length;
    ds.pointBackgroundColor = Array.from({ length: len }, (_, i) => i === idx ? '#9480c5' : '#fff');
    ds.pointRadius = Array.from({ length: len }, (_, i) => i === idx ? 9 : 6);
    ds.pointBorderWidth = Array.from({ length: len }, (_, i) => i === idx ? 3 : 2.5);
    scoreChartInstance.update('none');

    showPulseAnimation(idx);
    showDetailPanel(idx);
}

function showPulseAnimation(idx) {
    const meta = scoreChartInstance.getDatasetMeta(0);
    const pt = meta.data[idx];
    if (!pt) return;

    const wrap = document.getElementById('scoreChartWrap');
    const pulse = document.createElement('div');
    pulse.className = 'omr-point-pulse';
    pulse.style.left = (pt.x - 7) + 'px';
    pulse.style.top = (pt.y - 7) + 'px';
    wrap.appendChild(pulse);
    setTimeout(() => pulse.remove(), 500);
}

function showDetailPanel(idx) {
    const detail = chartDataCache.details[idx];
    if (!detail) return;

    const panel = document.getElementById('omrDetailPanel');
    document.getElementById('omrDetailLabel').textContent =
        'W' + detail.week + '-' + (DAY_SHORT[detail.day] || detail.day) + ' ' + (currentScoreTab === 'reading' ? 'Reading' : 'Listening');
    const isPerfect = detail.score === 30;
    document.getElementById('omrDetailScore').textContent = detail.score + ' / 30';
    panel.classList.toggle('is-perfect', isPerfect);
    document.getElementById('omrDetailRaw').textContent =
        (detail.total_correct != null ? detail.total_correct : detail.raw) + ' / ' +
        (detail.total_questions != null ? detail.total_questions : detail.max_raw);

    if (detail.completed_at) {
        const d = new Date(detail.completed_at);
        document.getElementById('omrDetailDate').textContent =
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else {
        document.getElementById('omrDetailDate').textContent = '-';
    }

    const wrongWrap = document.getElementById('omrDetailWrongWrap');
    const wrongBadges = document.getElementById('omrDetailWrongBadges');
    const records = detail.module_records || [];

    if (records.length > 0) {
        wrongWrap.style.display = '';
        let html = '';
        const showModuleLabel = records.length > 1;
        records.forEach(mr => {
            if (showModuleLabel) {
                html += `<div class="omr-module-label">Module ${mr.module_number}</div>`;
            }
            const wrongSet = new Set(mr.wrong_numbers.map(Number));
            for (let q = 1; q <= mr.question_count; q++) {
                const isWrong = wrongSet.has(q);
                html += `<span class="omr-q-badge ${isWrong ? 'is-wrong' : 'is-correct'}">${q}</span>`;
            }
        });
        wrongBadges.innerHTML = html;
    } else {
        wrongWrap.style.display = 'none';
        wrongBadges.innerHTML = '';
    }

    let perfectBanner = panel.querySelector('.omr-perfect-banner');
    if (isPerfect) {
        if (!perfectBanner) {
            perfectBanner = document.createElement('div');
            perfectBanner.className = 'omr-perfect-banner';
            perfectBanner.innerHTML = '<span class="omr-perfect-confetti">🎉</span> 만점이에요! 완벽합니다! <span class="omr-perfect-confetti">🎉</span>';
            panel.querySelector('.omr-detail-body').prepend(perfectBanner);
        }
    } else if (perfectBanner) {
        perfectBanner.remove();
    }

    panel.style.display = '';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideDetailPanel() {
    const panel = document.getElementById('omrDetailPanel');
    if (panel) panel.style.display = 'none';
}

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

    document.getElementById('omrDetailClose')?.addEventListener('click', () => {
        hideDetailPanel();
        if (scoreChartInstance) {
            const ds = scoreChartInstance.data.datasets[0];
            const len = ds.data.length;
            ds.pointBackgroundColor = Array(len).fill('#fff');
            ds.pointRadius = Array(len).fill(6);
            ds.pointBorderWidth = Array(len).fill(2.5);
            scoreChartInstance.update('none');
        }
        selectedPointIndex = -1;
    });
}

console.log('✅ mypage-australia.js 로드 완료');
