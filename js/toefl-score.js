/**
 * ================================================
 * toefl-score.js -- 실제 TOEFL 성적 (읽기 전용)
 * ================================================
 *
 * 의존: supabase-client.js, mypage.js (mpUser), toefl-exam.js (toeflExams)
 * DB: toefl_actual_scores
 *
 * ⚠️ 학생은 성적을 직접 등록하지 않는다.
 *    점수 인증은 카카오톡으로 성적표 캡처를 보내면 선생님이 등록한다.
 *    이 화면은 등록된 성적을 "보여주기만" 한다.
 *
 * 화면이 절대 하면 안 되는 말: "필수 응시 완료"
 *    2회는 계약상 최소선이지 목표가 아니다. 학생이 시험을 더 볼수록
 *    점수가 오르므로, 화면은 항상 다음 시험을 향하게 만든다.
 *
 * TOEFL iBT 기준:
 *   영역별 1.0~6.0 (0.5 단위), Overall = 4개 영역 평균의 0.5 단위 반올림
 *   전환기: 기존 0-120 점수도 성적표에 병기 (legacy_total)
 */

// ================================================
// 전역 상태
// ================================================
let toeflScores = [];
let toeflChartInstance = null;
let toeflTarget = null;       // 목표 Overall = 커트라인 (없으면 null)
let toeflDeadline = null;     // 응시 마지노선 Date (없으면 null)

// ================================================
// 데이터 로드
// ================================================

/**
 * 부분 날짜 문자열을 Date로 파싱한다.
 * submission_deadline 은 'YYYY-MM-DD' / 'YYYY-MM' 등 형식이 섞여 있다. 일자 없으면 1일.
 */
function parseToeflDate(str) {
    if (!str) return null;
    var p = String(str).split('-');
    var y = parseInt(p[0], 10);
    var mo = parseInt(p[1] || '1', 10);
    var da = parseInt(p[2] || '1', 10);
    if (!y || !mo) return null;
    var d = new Date(y, mo - 1, da);
    return isNaN(d.getTime()) ? null : d;
}
async function loadToeflScores() {
    if (!mpUser || !mpUser.id) return;
    try {
        toeflScores = await supabaseSelect(
            'toefl_actual_scores',
            'user_id=eq.' + mpUser.id + '&order=test_date.asc'
        ) || [];
        console.log('🎯 [TOEFL] 성적 ' + toeflScores.length + '건 로드');
    } catch (err) {
        console.error('❌ [TOEFL] 로드 실패:', err);
        toeflScores = [];
    }
}

/** 신청서에서 목표 점수를 가져온다 (코치 문구에서 "목표까지 얼마" 표시용) */
async function loadToeflTarget() {
    toeflTarget = null;
    toeflDeadline = null;
    if (!mpUser || !mpUser.applicationId) return;
    try {
        var rows = await supabaseSelect(
            'applications',
            'id=eq.' + mpUser.applicationId + '&select=target_cutoff_new,no_target_score,submission_deadline'
        );
        if (!rows || !rows.length) return;
        var r = rows[0];
        // 커트라인: 목표점수를 둔 학생만 (신규 척도)
        if (!r.no_target_score) {
            var t = parseFloat(r.target_cutoff_new);
            if (!isNaN(t) && t > 0) toeflTarget = t;
        }
        // 응시 마지노선: 목표점수 유무와 무관하게 마감일이 있으면 사용
        toeflDeadline = parseToeflDate(r.submission_deadline);
    } catch (err) {
        console.warn('⚠️ [TOEFL] 목표/마감 로드 실패 (무시):', err);
    }
}

// ================================================
// 전체 섹션 렌더링
// ================================================
function renderToeflSection() {
    renderToeflCoach();
    renderToeflScoreList();
    renderToeflChart();
}

// ================================================
// 코치 문구 -- 성적 상태에 따라 다음 행동을 만든다
// ================================================
function renderToeflCoach() {
    var el = document.getElementById('toeflCoach');
    if (!el) return;

    var sorted = toeflScores.slice().sort(function(a, b) {
        return new Date(a.test_date) - new Date(b.test_date);
    });
    var count = sorted.length;

    // ── 성적 0건 ──
    // 코치는 성적이 생긴 뒤 상승/정체/하강에 반응하는 게 본래 역할이다.
    // 성적이 없을 때의 "카톡으로 보내주세요" 안내는 바로 아래 성적 목록 빈 상태가
    // 이미 하고 있으므로, 여기서 또 띄우면 같은 말이 두 번 나온다. 비워둔다.
    if (count === 0) {
        el.innerHTML = '';
        return;
    }

    var latest = sorted[count - 1];
    var overall = Number(latest.overall);

    // ── 목표 달성 (다른 상태보다 우선) ──
    if (toeflTarget && overall >= toeflTarget) {
        el.innerHTML = buildCoachBox('success',
            '🎉 목표 Overall ' + toeflTarget.toFixed(1) + ' 달성!',
            '정말 고생하셨어요. 후기 한 번 남겨주시기로 하셨죠? ' +
            '아래 그래프를 이미지로 저장해서 함께 올려주시면 좋아요.',
            '<button class="toefl-coach-btn" onclick="saveToeflChartImage()">' +
                '<i class="fa-solid fa-download"></i> 그래프 이미지 저장</button>');
        return;
    }

    var targetLine = toeflTarget
        ? '목표 Overall ' + toeflTarget.toFixed(1) + '까지 <strong>' +
          (Math.round((toeflTarget - overall) * 10) / 10).toFixed(1) + '</strong> 남았어요.<br>'
        : '';

    var nextBtn = '<button class="toefl-coach-btn" onclick="openToeflExamModal()">' +
        '<i class="fa-solid fa-plus"></i> 등록한 시험 추가하기</button>';

    // ── 1회 응시 ──
    if (count === 1) {
        el.innerHTML = buildCoachBox('info',
            '📈 첫 점수가 찍혔어요',
            '점 하나로는 선이 안 그려집니다. 다음 시험을 등록하면 그때부터 곡선이 보여요.<br>' + targetLine,
            nextBtn);
        return;
    }

    // ── 2회 이상: 직전 회차와 비교 ──
    var prev = sorted[count - 2];
    var diff = Math.round((overall - Number(prev.overall)) * 10) / 10;

    if (diff > 0) {
        el.innerHTML = buildCoachBox('success',
            '📈 Overall +' + diff.toFixed(1) + ' — 곡선이 올라가고 있어요',
            '토플은 2점, 5점씩 쌓는 시험이에요. 오르는 흐름을 탔을 때 이어가는 게 제일 빠릅니다.<br>' + targetLine,
            nextBtn);
        return;
    }

    if (diff === 0) {
        el.innerHTML = buildCoachBox('info',
            '이번엔 제자리였네요. 흔한 일이에요',
            '정체는 보통 <strong>한 영역이 발목을 잡을 때</strong> 생깁니다. 나머지가 올라도 그 하나가 평균을 눌러버리거든요. ' +
            '아래 그래프에서 어느 선이 안 움직이는지 보세요. 거기가 다음 목표입니다.<br>' +
            '정체 구간은 대부분 다음 한 번에서 풀립니다. <strong>여기서 멈추는 게 제일 아까워요.</strong>',
            nextBtn);
        return;
    }

    // ── 하강 ── 여기가 이탈 위험이 가장 높은 지점이다. 위로가 먼저다.
    el.innerHTML = buildCoachBox('caution',
        '이번엔 조금 내려갔네요. 먼저 이것부터 알아두세요',
        '<strong>실제 시험에서는 원래 실력의 60~70%만 나와도 잘 본 겁니다.</strong> 진짜예요. ' +
        '연습 때처럼 100% 발휘하는 사람은 없어요. 점수가 내려간 건 실력이 떨어진 게 아닙니다.<br>' +
        '3번, 4번 보면서 오르락내리락하다가 결국 목표 찍는 분들이 훨씬 많아요.' +
        buildDropReasons() +
        '<br><strong>여기서 멈추는 게 제일 아깝습니다.</strong> 한 번 내려갔다가 다음 시험에서 확 오르는 경우가 정말 흔해요. 흐름을 끊지 마세요.',
        nextBtn);
}

/** 점수가 내려간 흔한 원인 (접었다 펴는 영역) */
function buildDropReasons() {
    return '' +
    '<details class="toefl-reasons">' +
        '<summary>왜 내려갔을까? 흔한 원인들</summary>' +
        '<ol>' +
            '<li><strong>초반에 삐끗했을 수 있어요 — 이게 제일 큽니다.</strong><br>' +
                '앞부분 성적에 따라 뒷부분 난이도가 갈립니다. 초반 몇 문제에서 흔들리면 ' +
                '그 뒤를 아무리 잘 풀어도 상한선이 눌려요. <strong>처음 10분이 시험 전체를 좌우합니다.</strong></li>' +
            '<li><strong>주제 운</strong><br>' +
                '리딩·리스닝만 그런 게 아니에요. 스피킹·라이팅도 타는 주제가 있습니다. ' +
                '아는 주제가 걸리면 술술 나오고, 낯선 주제면 머리가 하얘지죠. ' +
                '실력이 아니라 운이고, 여러 번 볼수록 평준화됩니다.</li>' +
            '<li><strong>입이 안 풀렸을 수도 있어요</strong><br>' +
                '스피킹은 첫 문제에서 당황하면 그 뒤가 연쇄로 무너집니다. ' +
                '당황이 제일 큰 적이에요. 실력 문제가 아닙니다.</li>' +
            '<li><strong>시간 관리</strong><br>' +
                '마지막 문제들을 급하게 찍으셨다면, 점수는 실력이 아니라 속도 때문에 깎인 겁니다.</li>' +
            '<li><strong>컨디션</strong><br>' +
                '잠, 시험 시간대, 시험장 소음. 홈에디션이면 프록터 중단이나 네트워크 문제도요.</li>' +
            '<li><strong>시험 사이 텀이 길었다면</strong><br>' +
                '감이 떨어집니다. 간격이 벌어질수록 손해예요.</li>' +
        '</ol>' +
    '</details>';
}

function buildCoachBox(tone, title, body, action) {
    return '<div class="toefl-coach toefl-coach-' + tone + '">' +
        '<div class="toefl-coach-title">' + title + '</div>' +
        '<div class="toefl-coach-body">' + body + '</div>' +
        (action ? '<div class="toefl-coach-action">' + action + '</div>' : '') +
    '</div>';
}

// ================================================
// 성적 목록 (읽기 전용)
// ================================================
function renderToeflScoreList() {
    var el = document.getElementById('toeflScoreList');
    if (!el) return;

    if (toeflScores.length === 0) {
        // 시험 추가 버튼은 섹션 헤더에 있으므로 여기엔 안내만 둔다.
        el.innerHTML =
            '<div class="toefl-empty">' +
                '<i class="fa-solid fa-file-circle-plus"></i>' +
                '<p>등록된 성적이 없습니다</p>' +
                '<p class="toefl-empty-sub">등록한 시험을 응시하신 뒤, 성적표가 나오면 카톡으로 캡처를 보내주세요. 제가 직접 등록해드립니다.</p>' +
            '</div>';
        return;
    }

    var sorted = toeflScores.slice().sort(function(a, b) {
        return new Date(a.test_date) - new Date(b.test_date);
    });

    var html =
        '<div class="toefl-table">' +
            '<div class="toefl-table-header">' +
                '<span class="toefl-th toefl-th-order">#</span>' +
                '<span class="toefl-th toefl-th-date">날짜</span>' +
                '<span class="toefl-th toefl-th-score">R</span>' +
                '<span class="toefl-th toefl-th-score">L</span>' +
                '<span class="toefl-th toefl-th-score">W</span>' +
                '<span class="toefl-th toefl-th-score">S</span>' +
                '<span class="toefl-th toefl-th-overall">Overall</span>' +
                '<span class="toefl-th toefl-th-actions"></span>' +
            '</div>';

    sorted.forEach(function(s, idx) {
        var d = new Date(s.test_date + 'T00:00:00');
        var dateStr = (d.getMonth() + 1) + '/' + d.getDate();
        var legacyStr = s.legacy_total
            ? '<span class="toefl-legacy-inline">(' + s.legacy_total + ')</span>'
            : '';
        var prev = idx > 0 ? sorted[idx - 1] : null;

        html +=
            '<div class="toefl-table-row' + (idx % 2 === 1 ? ' toefl-row-alt' : '') + '">' +
                '<span class="toefl-td toefl-td-order"><span class="toefl-order-badge">' + (idx + 1) + '회</span></span>' +
                '<span class="toefl-td toefl-td-date">' + dateStr + '</span>' +
                '<span class="toefl-td toefl-td-score">' + Number(s.reading).toFixed(1) + buildDelta(prev ? s.reading - prev.reading : null) + '</span>' +
                '<span class="toefl-td toefl-td-score">' + Number(s.listening).toFixed(1) + buildDelta(prev ? s.listening - prev.listening : null) + '</span>' +
                '<span class="toefl-td toefl-td-score">' + Number(s.writing).toFixed(1) + buildDelta(prev ? s.writing - prev.writing : null) + '</span>' +
                '<span class="toefl-td toefl-td-score">' + Number(s.speaking).toFixed(1) + buildDelta(prev ? s.speaking - prev.speaking : null) + '</span>' +
                '<span class="toefl-td toefl-td-overall"><strong>' + Number(s.overall).toFixed(1) + '</strong>' + legacyStr + buildDelta(prev ? s.overall - prev.overall : null) + '</span>' +
                '<span class="toefl-td toefl-td-actions">' +
                    (s.memo ? '<button class="toefl-btn-icon toefl-btn-memo" onclick="toggleToeflMemo(this)" title="메모"><i class="fa-solid fa-message"></i></button>' : '') +
                    (s.score_image ? '<button class="toefl-btn-icon" onclick="openToeflImageViewer(\'' + s.score_image + '\')" title="성적표 보기"><i class="fa-solid fa-image"></i></button>' : '') +
                '</span>' +
            '</div>' +
            (s.memo ? '<div class="toefl-memo-row" style="display:none;"><i class="fa-solid fa-message"></i> ' + escapeHtmlToefl(s.memo) + '</div>' : '');
    });

    html += '</div>' +
        '<p class="toefl-list-note">' +
            '<i class="fa-solid fa-circle-info"></i> ' +
            '성적은 마이페이지에서 직접 등록하지 않습니다. 성적표가 나오면 <strong>카톡으로 캡처를 보내주시면</strong> 선생님이 등록해드려요.' +
        '</p>';

    el.innerHTML = html;
}

/** 이전 회차 대비 변화량 */
function buildDelta(diff) {
    if (diff === null || diff === undefined) return '';
    var rounded = Math.round(diff * 10) / 10;
    if (rounded === 0) return '';
    if (rounded > 0) return '<span class="toefl-delta toefl-delta-up">+' + rounded.toFixed(1) + '</span>';
    return '<span class="toefl-delta toefl-delta-down">' + rounded.toFixed(1) + '</span>';
}

/** 메모 행 토글 */
function toggleToeflMemo(btn) {
    var row = btn.closest('.toefl-table-row');
    if (!row) return;
    var memoRow = row.nextElementSibling;
    if (memoRow && memoRow.classList.contains('toefl-memo-row')) {
        var isVisible = memoRow.style.display !== 'none';
        memoRow.style.display = isVisible ? 'none' : 'flex';
        btn.classList.toggle('toefl-btn-memo-active', !isVisible);
    }
}

// ================================================
// 성적 추이 차트
// ================================================
function renderToeflChart() {
    var canvas = document.getElementById('toeflChart');
    var emptyEl = document.getElementById('toeflChartEmpty');
    var saveBtn = document.getElementById('toeflChartSaveBtn');
    if (!canvas) return;

    if (toeflScores.length === 0) {
        canvas.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'flex';
        if (saveBtn) saveBtn.style.display = 'none';
        if (toeflChartInstance) { toeflChartInstance.destroy(); toeflChartInstance = null; }
        return;
    }

    canvas.style.display = '';
    if (emptyEl) emptyEl.style.display = 'none';
    if (saveBtn) saveBtn.style.display = '';

    // 시험 + 세로 마커(챌린지 시작 / 응시 마지노선)를 날짜순으로 한 번에 조립한다.
    // (여러 마커를 splice로 끼워넣으면 인덱스가 꼬이므로 통합 정렬 방식을 쓴다.)
    var markers = [];
    var mStart = (mpUser && mpUser.startDate) ? parseToeflDate(mpUser.startDate) : null;
    if (mStart) markers.push({
        key: 'challengeStart', date: mStart, content: '챌린지 시작', position: 'start',
        border: 'rgba(148, 128, 197, 0.5)', bg: 'rgba(148, 128, 197, 0.85)'
    });
    if (toeflDeadline) markers.push({
        key: 'deadline', date: toeflDeadline, content: '응시 마지노선', position: 'end',
        border: 'rgba(226, 122, 122, 0.6)', bg: 'rgba(226, 122, 122, 0.9)'
    });

    var points = toeflScores.map(function(s) {
        return { date: new Date(s.test_date + 'T00:00:00'), score: s };
    });
    markers.forEach(function(m) { points.push({ date: m.date, marker: m }); });
    points.sort(function(a, b) { return a.date - b.date; });

    var labels = [];
    var readingData = [], listeningData = [], speakingData = [], writingData = [], overallData = [];
    var markerLabel = {};

    points.forEach(function(p) {
        var lbl = (p.date.getMonth() + 1) + '/' + p.date.getDate();
        labels.push(lbl);
        if (p.score) {
            readingData.push(Number(p.score.reading));
            listeningData.push(Number(p.score.listening));
            speakingData.push(Number(p.score.speaking));
            writingData.push(Number(p.score.writing));
            overallData.push(Number(p.score.overall));
        } else {
            readingData.push(null);
            listeningData.push(null);
            speakingData.push(null);
            writingData.push(null);
            overallData.push(null);
            markerLabel[p.marker.key] = lbl;
        }
    });

    var annotations = {};
    markers.forEach(function(m) {
        var lbl = markerLabel[m.key];
        if (!lbl) return;
        annotations[m.key] = {
            type: 'line',
            xMin: lbl, xMax: lbl,
            borderColor: m.border,
            borderWidth: 2,
            borderDash: [6, 4],
            label: {
                display: true,
                content: m.content,
                position: m.position,
                backgroundColor: m.bg,
                color: '#fff',
                font: { size: 11, weight: '600', family: 'Pretendard' },
                padding: { x: 8, y: 4 },
                borderRadius: 6
            }
        };
    });

    // 커트라인 가로선
    if (toeflTarget) {
        annotations.targetLine = {
            type: 'line',
            yMin: toeflTarget,
            yMax: toeflTarget,
            borderColor: 'rgba(226, 122, 122, 0.55)',
            borderWidth: 2,
            borderDash: [4, 4],
            label: {
                display: true,
                content: '목표 ' + toeflTarget.toFixed(1),
                position: 'end',
                backgroundColor: 'rgba(226, 122, 122, 0.85)',
                color: '#fff',
                font: { size: 11, weight: '600', family: 'Pretendard' },
                padding: { x: 8, y: 4 },
                borderRadius: 6
            }
        };
    }

    if (toeflChartInstance) { toeflChartInstance.destroy(); }

    var line = function(label, data, color, width, radius, order) {
        return {
            label: label, data: data,
            borderColor: color, borderWidth: width,
            pointRadius: radius, pointBackgroundColor: color,
            pointBorderColor: '#fff', pointBorderWidth: 1.5,
            tension: 0.3, fill: false, order: order, spanGaps: true
        };
    };

    toeflChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                line('Overall', overallData, '#1e1b2e', 3, 6, 0),
                line('Reading', readingData, '#9480c5', 2, 4, 1),
                line('Listening', listeningData, '#77bf7e', 2, 4, 2),
                line('Writing', writingData, '#e2a05a', 2, 4, 3),
                line('Speaking', speakingData, '#5aa9e2', 2, 4, 4)
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    min: 1, max: 6,
                    ticks: { stepSize: 0.5, font: { family: 'Pretendard' } },
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    ticks: { font: { family: 'Pretendard' } },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { usePointStyle: true, font: { family: 'Pretendard', size: 12 } }
                },
                annotation: { annotations: annotations }
            }
        }
    });
}

// ================================================
// 그래프 이미지 저장 (워터마크) -- 후기에 첨부하라고 만든 기능
// ================================================
function saveToeflChartImage() {
    var canvas = document.getElementById('toeflChart');
    if (!canvas || !toeflChartInstance) return;

    var pad = 24;
    var footer = 44;
    var out = document.createElement('canvas');
    out.width = canvas.width + pad * 2;
    out.height = canvas.height + pad * 2 + footer;

    var ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, pad, pad);

    ctx.font = '600 15px Pretendard, sans-serif';
    ctx.fillStyle = '#9480c5';
    ctx.textAlign = 'center';
    ctx.fillText('이온토플 내벨업챌린지  |  eonfl.com',
        out.width / 2, canvas.height + pad + 30);

    var link = document.createElement('a');
    link.download = 'toefl-score-' + (mpUser && mpUser.name ? mpUser.name : 'chart') + '.png';
    link.href = out.toDataURL('image/png');
    link.click();
}

// ================================================
// 이미지 뷰어
// ================================================
function openToeflImageViewer(imageUrl) {
    var overlay = document.getElementById('toeflImageViewerOverlay');
    var img = document.getElementById('toeflImageViewerImg');
    if (overlay && img) {
        img.src = imageUrl;
        overlay.classList.add('show');
    }
}
function closeToeflImageViewer() {
    var overlay = document.getElementById('toeflImageViewerOverlay');
    if (overlay) overlay.classList.remove('show');
}

// ================================================
// 유틸
// ================================================
function escapeHtmlToefl(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

console.log('✅ toefl-score.js 로드 완료 (읽기 전용)');
