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

    mpCertifications = await supabaseSelect(
        'study_certifications',
        `author_email=eq.${encodeURIComponent(userEmail)}&order=published_at.desc&select=id,subject,published_at`
    ) || [];

    console.log(`📊 [MyPage-AUS] 인증글 ${mpCertifications.length}건 로드`);
}

// ================================================
// 전체 렌더링
// ================================================
function renderAll() {
    renderTodayTasks();
    renderSummaryCards();
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

console.log('✅ mypage-australia.js 로드 완료');
