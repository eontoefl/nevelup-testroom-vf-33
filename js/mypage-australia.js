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

    const [certs, omrRows] = await Promise.all([
        supabaseSelect(
            'study_certifications',
            `author_email=eq.${encodeURIComponent(userEmail)}&order=published_at.desc&select=id,subject,published_at`
        ),
        userId ? supabaseSelect(
            'aus_study_results',
            `user_id=eq.${userId}&initial_record=not.is.null&order=completed_at.asc&select=user_id,section_type,module_number,week,day,initial_record,completed_at`
        ) : Promise.resolve([])
    ]);

    mpCertifications = certs || [];
    mpOmrResults = omrRows || [];

    console.log(`📊 [MyPage-AUS] 인증글 ${mpCertifications.length}건, OMR ${mpOmrResults.length}건 로드`);
}

// ================================================
// 전체 렌더링
// ================================================
function renderAll() {
    renderTodayTasks();
    renderSummaryCards();
    renderScoreChart();
    renderCertificationList();
}

// ================================================
// 시작일 관련 유틸
// ================================================
function getAusStartDate() {
    return mpUser.startDate;
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

    // 인증률 — 고정 텍스트 (추후 구현)
    document.getElementById('authRate').textContent = '-';
    document.getElementById('authRateUnit').textContent = '';
    document.getElementById('authSub').textContent = '추후 공개';

    // 등급 & 환급 — 고정 텍스트 (추후 구현)
    document.getElementById('currentGrade').textContent = '-';
    document.getElementById('gradeRefund').textContent = '추후 공개';
}

// ================================================
// 공부인증 현황 — 내가 올린 글 목록
// ================================================
function renderCertificationList() {
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
