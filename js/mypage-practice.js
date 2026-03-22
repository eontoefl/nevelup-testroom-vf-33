/**
 * ================================================
 * mypage-practice.js – 연습코스 마이페이지 로직
 * ================================================
 * 
 * study_results_practice 테이블에서 데이터를 불러와
 * 연습코스 학습 현황, 진도 그리드, 성적 추이, 최근 기록을 렌더링합니다.
 * 
 * 의존: supabase-client.js (supabaseSelect 등)
 */

// ================================================
// 전역 상태
// ================================================
let mpUser = null;
let mpPracticeResults = [];  // study_results_practice 전체

// ================================================
// 초기화
// ================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📊 [MyPage-Practice] 초기화 시작');

    // 1. 세션에서 유저 정보 로드
    const saved = sessionStorage.getItem('currentUser');
    if (!saved) {
        showNotLoggedIn();
        return;
    }

    mpUser = JSON.parse(saved);
    console.log('📊 [MyPage-Practice] 유저:', mpUser.name);

    // 2. UI 기본 세팅
    document.getElementById('userName').textContent = mpUser.name;

    // 3. Supabase에서 데이터 로드
    try {
        await loadPracticeData();
        renderAll();
    } catch (err) {
        console.error('❌ [MyPage-Practice] 데이터 로드 실패:', err);
    }

    // 4. 화면 전환
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('mainContent').style.display = 'flex';
});

// ================================================
// 데이터 로드
// ================================================
async function loadPracticeData() {
    const userId = mpUser.id;
    console.log('📊 [MyPage-Practice] 데이터 로드 시작 - userId:', userId);

    mpPracticeResults = await supabaseSelect(
        'study_results_practice',
        `user_id=eq.${userId}&order=completed_at.desc&select=id,user_id,section_type,module_number,practice_number,initial_record,current_record,error_note_submitted,initial_level,completed_at`
    ) || [];

    console.log(`📊 [MyPage-Practice] 로드 완료 - ${mpPracticeResults.length}건`);
}

// ================================================
// 전체 렌더링
// ================================================
function renderAll() {
    renderSummaryCards();
    renderProgressGrid();
    renderScoreChart();
    renderRecentRecords();
}

// ================================================
// 1. 요약 카드 렌더링
// ================================================
function renderSummaryCards() {
    // Practice별 완료 여부 계산 (practice_number별로 initial_record 존재 여부)
    const practiceMap = new Map(); // practice_number → { hasInitial, hasErrorNote }
    
    mpPracticeResults.forEach(r => {
        const pNum = r.practice_number;
        if (!practiceMap.has(pNum)) {
            practiceMap.set(pNum, { hasInitial: false, hasErrorNote: false, count: 0 });
        }
        const info = practiceMap.get(pNum);
        if (r.initial_record) {
            info.hasInitial = true;
            info.count++;
        }
        if (r.error_note_submitted) {
            info.hasErrorNote = true;
        }
    });

    // 완료한 Practice 수 (최소 1개 initial_record가 있는 Practice)
    let completedPractices = 0;
    practiceMap.forEach(info => {
        if (info.hasInitial) completedPractices++;
    });

    const completedPct = Math.round((completedPractices / 60) * 100);
    document.getElementById('completedCount').textContent = completedPractices;
    document.getElementById('completedBar').style.width = `${completedPct}%`;
    document.getElementById('completedSub').textContent = `${completedPct}% 완료`;

    // 총 풀이 기록
    const totalRecords = mpPracticeResults.filter(r => r.initial_record).length;
    document.getElementById('totalRecords').textContent = totalRecords;

    // 영역별 카운트
    const sectionCounts = {};
    mpPracticeResults.forEach(r => {
        if (!r.initial_record) return;
        const type = r.section_type || 'unknown';
        sectionCounts[type] = (sectionCounts[type] || 0) + 1;
    });
    const sectionParts = [];
    const sectionLabels = { reading: 'Reading', listening: 'Listening', writing: 'Writing', speaking: 'Speaking', vocab: 'Vocab' };
    Object.keys(sectionLabels).forEach(key => {
        if (sectionCounts[key]) sectionParts.push(`${sectionLabels[key]} ${sectionCounts[key]}`);
    });
    document.getElementById('totalRecordsSub').textContent = sectionParts.length > 0 ? sectionParts.join(' · ') : '기록 없음';

    // 오답노트 제출률 (4섹션만: reading, listening, writing, speaking)
    const fourSectionResults = mpPracticeResults.filter(r => 
        r.initial_record && ['reading', 'listening', 'writing', 'speaking'].includes(r.section_type)
    );
    const errorNoteCount = fourSectionResults.filter(r => r.error_note_submitted).length;
    const errorNoteTotal = fourSectionResults.length;
    const errorNoteRate = errorNoteTotal > 0 ? Math.round((errorNoteCount / errorNoteTotal) * 100) : 0;

    document.getElementById('errorNoteRate').textContent = errorNoteRate;
    document.getElementById('errorNoteBar').style.width = `${errorNoteRate}%`;
    document.getElementById('errorNoteSub').textContent = errorNoteTotal > 0
        ? `${errorNoteCount} / ${errorNoteTotal}건 제출`
        : '해당 기록 없음';
}

// ================================================
// 2. Practice 진도 그리드 (10열 x 6줄)
// ================================================
function renderProgressGrid() {
    const container = document.getElementById('practiceProgressGrid');
    if (!container) return;
    container.innerHTML = '';

    // Practice별 상태 맵 생성
    const statusMap = buildPracticeStatusMap();

    for (let row = 0; row < 6; row++) {
        const startNum = row * 10 + 1;
        const endNum = startNum + 9;

        // 그룹 헤더
        const groupHeader = document.createElement('div');
        groupHeader.className = 'practice-group-header';
        groupHeader.textContent = `Practice ${String(startNum).padStart(2, '0')} - ${String(endNum).padStart(2, '0')}`;
        container.appendChild(groupHeader);

        // 10개 셀 그리드
        const grid = document.createElement('div');
        grid.className = 'practice-progress-grid';

        for (let i = startNum; i <= endNum; i++) {
            const cell = document.createElement('div');
            cell.className = 'pp-cell';

            const status = statusMap.get(i) || 'empty';
            cell.classList.add('pp-' + status);

            // 셀 내용
            const numLabel = document.createElement('span');
            numLabel.className = 'pp-num';
            numLabel.textContent = 'P' + String(i).padStart(2, '0');

            const statusDot = document.createElement('span');
            statusDot.className = 'pp-dot';

            cell.appendChild(numLabel);
            cell.appendChild(statusDot);

            grid.appendChild(cell);
        }

        container.appendChild(grid);
    }
}

/**
 * Practice별 상태 맵 생성
 * 'empty' = 미시작, 'level-1' = 실전풀이만, 'level-2' = 실전풀이+오답노트
 */
function buildPracticeStatusMap() {
    const map = new Map();

    mpPracticeResults.forEach(r => {
        const pNum = r.practice_number;
        if (!pNum) return;

        const current = map.get(pNum) || 'empty';

        // 4섹션만 오답노트 판정 (vocab, intro-book은 initial만으로 완료)
        const is4Section = ['reading', 'listening', 'writing', 'speaking'].includes(r.section_type);

        if (r.initial_record && is4Section && r.error_note_submitted) {
            // level-2가 가장 높음 → 유지
            if (current !== 'level-2') {
                map.set(pNum, 'level-2');
            }
        } else if (r.initial_record) {
            if (current === 'empty') {
                map.set(pNum, 'level-1');
            }
        }
    });

    return map;
}

// ================================================
// 3. 성적 추이 차트 (initial_level 기반)
// ================================================
let scoreChartInstance = null;
let currentScoreTab = 'reading';

function buildChartData(sectionType) {
    const filtered = mpPracticeResults
        .filter(r => r.section_type === sectionType && r.initial_level != null)
        .sort((a, b) => {
            const pA = a.practice_number || 0;
            const pB = b.practice_number || 0;
            if (pA !== pB) return pA - pB;
            return (a.module_number || 0) - (b.module_number || 0);
        });

    const labels = [];
    const levels = [];

    filtered.forEach(r => {
        const p = r.practice_number || '?';
        const m = r.module_number || '?';
        labels.push('P' + p + ' M' + m);
        levels.push(r.initial_level);
    });

    return { labels, levels };
}

function renderScoreChart() {
    const canvas = document.getElementById('scoreChart');
    const emptyEl = document.getElementById('scoreChartEmpty');
    if (!canvas) return;

    setupScoreTabEvents();

    const data = buildChartData(currentScoreTab);

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
                        title: function(ctx) { return ctx[0].label; },
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
                        font: { size: 11, weight: '600' },
                        color: '#5c6878',
                        maxRotation: 45,
                        autoSkip: true,
                        maxTicksLimit: 20
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

    console.log(`📊 [MyPage-Practice] 성적 추이 차트 - ${currentScoreTab}, ${data.labels.length}건`);
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
}

// ================================================
// 4. 최근 학습 기록 테이블
// ================================================
function renderRecentRecords() {
    const tbody = document.getElementById('recentRecordsBody');
    const emptyEl = document.getElementById('recentRecordsEmpty');
    const wrapEl = document.getElementById('recentRecordsWrap');
    if (!tbody) return;

    // initial_record가 있는 것만, 최근 50건
    const records = mpPracticeResults
        .filter(r => r.initial_record)
        .slice(0, 50);

    if (records.length === 0) {
        if (wrapEl) wrapEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
    }

    if (wrapEl) wrapEl.style.display = '';
    if (emptyEl) emptyEl.style.display = 'none';

    const sectionLabels = {
        reading: '📖 Reading',
        listening: '🎧 Listening',
        writing: '✍️ Writing',
        speaking: '🎤 Speaking',
        vocab: '📝 Vocab',
        'intro-book': '📚 입문서'
    };

    const sectionClasses = {
        reading: '', listening: 'listening', writing: 'writing',
        speaking: 'speaking', vocab: 'vocab', 'intro-book': 'intro-book'
    };

    let html = '';
    records.forEach(r => {
        const pNum = r.practice_number || '-';
        const sType = r.section_type || 'unknown';
        const sLabel = sectionLabels[sType] || sType;
        const sClass = sectionClasses[sType] || '';
        const mNum = r.module_number || '-';

        // 점수 추출
        let scoreText = '-';
        if (r.initial_record) {
            let rec = r.initial_record;
            if (typeof rec === 'string') {
                try { rec = JSON.parse(rec); } catch(e) { rec = {}; }
            }
            if (rec.score != null && rec.total != null) {
                scoreText = `${rec.score} / ${rec.total}`;
            } else if (rec.accuracy != null) {
                scoreText = `${Math.round(rec.accuracy)}%`;
            }
        }

        // 오답노트 상태
        const noteStatus = r.error_note_submitted
            ? '<span style="color:#22c55e; font-weight:600;"><i class="fa-solid fa-check-circle"></i> 제출</span>'
            : (sType === 'vocab' || sType === 'intro-book'
                ? '<span style="color:#99aabb;">-</span>'
                : '<span style="color:#f59e0b;"><i class="fa-solid fa-clock"></i> 미제출</span>');

        // 완료일
        const dateText = r.completed_at
            ? formatDate(r.completed_at)
            : '-';

        html += `<tr>
            <td><span class="date-badge">P${String(pNum).padStart(2, '0')}</span></td>
            <td><span class="task-module ${sClass}">${sLabel}</span></td>
            <td>M${mNum}</td>
            <td>${scoreText}</td>
            <td>${noteStatus}</td>
            <td style="font-size:0.78rem; color:var(--text-secondary);">${dateText}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
    console.log(`📊 [MyPage-Practice] 최근 기록 ${records.length}건 렌더링`);
}

// ================================================
// 유틸리티
// ================================================
function formatDate(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '-';
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}/${day} ${h}:${min}`;
}

function goBackToTestroom() {
    window.location.href = 'index.html';
}

function showNotLoggedIn() {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('notLoggedScreen').style.display = 'flex';
}

console.log('✅ mypage-practice.js 로드 완료');
