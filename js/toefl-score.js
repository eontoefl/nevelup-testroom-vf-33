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
let toeflTarget = null;       // 커트라인 = 1차 목표 (관리자 입력, 없으면 null)
let toeflWish = null;         // 희망점수 = 2차 목표 (학생이 커트라인 달성 후 스스로 입력)
let toeflDeadline = null;     // 응시 마지노선 Date (없으면 null)
let toeflCelebrateIdx = -1;   // 도달한 가장 높은 목표의 Overall 점 인덱스 (저장 이미지에도 표시)
let toeflCelebrateText = '🎉 축하해요!';   // 축하 말풍선 문구 (커트라인/희망 달성에 따라 다름)

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
    toeflWish = null;
    toeflDeadline = null;
    if (!mpUser || !mpUser.applicationId) return;
    try {
        var rows = await supabaseSelect(
            'applications',
            'id=eq.' + mpUser.applicationId + '&select=target_cutoff_new,target_wish_new,no_target_score,submission_deadline'
        );
        if (!rows || !rows.length) return;
        var r = rows[0];
        // 커트라인: 목표점수를 둔 학생만 (신규 척도)
        if (!r.no_target_score) {
            var t = parseFloat(r.target_cutoff_new);
            if (!isNaN(t) && t > 0) toeflTarget = t;
        }
        // 희망점수: 학생이 설정한 2차 목표
        var w = parseFloat(r.target_wish_new);
        if (!isNaN(w) && w > 0 && w <= 6) toeflWish = w;
        // 응시 마지노선: 목표점수 유무와 무관하게 마감일이 있으면 사용
        toeflDeadline = parseToeflDate(r.submission_deadline);
    } catch (err) {
        console.warn('⚠️ [TOEFL] 목표/마감 로드 실패 (무시):', err);
    }
}

/** 희망점수가 유효한지 (설정됐고, 커트라인보다 높고, 6.0 이하) */
function toeflWishValid() {
    if (toeflWish == null) return false;
    if (toeflTarget != null && toeflWish <= toeflTarget) return false;
    return toeflWish <= 6;
}

// ================================================
// 전체 섹션 렌더링
// ================================================
function renderToeflSection() {
    renderToeflCoach();
    renderToeflScoreList();
    renderToeflChart();
    updateToeflHeaderButton();
}

/** "다음 시험" 안내 문구: 예정 시험이 있으면 응시 유도, 없으면 등록 유도 */
function buildToeflGoNext() {
    var upcoming = (typeof getToeflUpcomingExams === 'function') ? getToeflUpcomingExams() : [];
    var nextExam = upcoming.length ? upcoming[0] : null;
    return nextExam
        ? '예정된 <strong>' + formatToeflExamDate(nextExam.exam_datetime) + '</strong> 시험을 응시하고, 성적표가 나오면 카톡으로 보내주세요. 이어서 그려드릴게요.'
        : '다음 시험을 등록하면 곡선이 이어져요.';
}

/**
 * 헤더의 "등록한 시험 추가하기"는 코치 박스가 같은 추가 버튼을 보여줄 때만 숨긴다.
 * 성적이 생기면 코치 버튼이 동선상 앞에 오고, 코치에 추가 버튼이 없는 상태
 * (성적 0건 / 목표 달성 등)에서는 헤더 버튼이 빈자리를 메운다.
 * → 어느 상태든 추가 버튼이 정확히 하나만 보인다.
 */
function updateToeflHeaderButton() {
    var headerBtn = document.querySelector('.toefl-header-add');
    if (!headerBtn) return;
    var coachHasAdd = !!document.querySelector('#toeflCoach .toefl-coach-add');
    headerBtn.style.display = coachHasAdd ? 'none' : '';
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

    var saveBtn = '<button class="toefl-coach-btn" onclick="saveToeflChartImage()">' +
        '<i class="fa-solid fa-download"></i> 그래프 이미지 저장</button>';
    var wishSetBtn = '<button class="toefl-coach-btn" onclick="openToeflWishModal()">' +
        '<i class="fa-solid fa-bullseye"></i> 희망점수 정하기</button>';
    var wishEditBtn = '<button class="toefl-coach-btn toefl-coach-btn-ghost" onclick="openToeflWishModal()">' +
        '<i class="fa-solid fa-pen"></i> 희망점수 수정</button>';

    // ── 커트라인 달성 이후: 2차 목표(희망점수) 흐름 (다른 상태보다 우선) ──
    if (toeflTarget && overall >= toeflTarget) {
        var wishOn = toeflWishValid();

        // ④ 희망점수까지 달성
        if (wishOn && overall >= toeflWish) {
            el.innerHTML = buildCoachBox('success',
                '🎉 희망점수 ' + toeflWish.toFixed(1) + ' 달성!',
                '커트라인을 넘어 스스로 세운 목표까지 이뤘어요. 대단해요! ' +
                '그래프를 저장해서 후기에 올려주시면 좋아요. 더 높이 가보고 싶다면 목표를 다시 세워도 좋아요.',
                saveBtn + ' ' + wishEditBtn);
            return;
        }

        // ③ 희망점수 설정됨, 아직 미달
        if (wishOn) {
            var left = (Math.round((toeflWish - overall) * 10) / 10).toFixed(1);
            el.innerHTML = buildCoachBox('info',
                '🎯 희망점수 ' + toeflWish.toFixed(1) + '까지 ' + left + ' 남았어요',
                '커트라인은 이미 넘었어요. 이제 스스로 세운 목표를 향해 가는 중이에요. ' +
                buildToeflGoNext() +
                '<div class="toefl-wish-editline">지금 목표: 희망 ' + toeflWish.toFixed(1) + ' &nbsp;·&nbsp; ' + wishEditBtn + '</div>',
                null);
            return;
        }

        // ② 커트라인 달성, 희망점수 미설정 → 좌(축하) / 우(2차 목표 권유) 분할
        //    같은 박스에 섞으면 도전 유도가 축하에 묻혀 스킵되므로 좌우로 나눈다.
        el.innerHTML =
            '<div class="toefl-coach toefl-coach-success toefl-coach-split">' +
                '<div class="toefl-coach-split-main">' +
                    '<div class="toefl-coach-title">🎉 커트라인 ' + toeflTarget.toFixed(1) + ' 넘었어요!</div>' +
                    '<div class="toefl-coach-body">정말 고생하셨어요. 그래프를 저장해서 후기에 올려주시면 좋아요.</div>' +
                    '<div class="toefl-coach-action">' + saveBtn + '</div>' +
                '</div>' +
                '<div class="toefl-coach-split-aside">' +
                    '<div class="toefl-coach-aside-title">더 높이 가볼까요?</div>' +
                    '<div class="toefl-coach-aside-body">여유가 있다면 <strong>희망점수</strong>를 정해 한 번 더 도전!</div>' +
                    wishSetBtn +
                '</div>' +
            '</div>';
        return;
    }

    var targetLine = toeflTarget
        ? '커트라인 ' + toeflTarget.toFixed(1) + '까지 <strong>' +
          (Math.round((toeflTarget - overall) * 10) / 10).toFixed(1) + '</strong> 남았어요.<br>'
        : '';

    var nextBtn = '<button class="toefl-coach-btn toefl-coach-add" onclick="openToeflExamModal()">' +
        '<i class="fa-solid fa-plus"></i> 등록한 시험 추가하기</button>';

    // 예정된 다음 시험이 이미 있으면 "등록하라"가 아니라 "응시하고 결과 보내라"로 안내한다.
    // 이때 코치엔 추가 버튼을 두지 않는다(헤더 버튼이 "하나 더" 역할을 맡는다).
    var nextExam = getToeflUpcomingExams && getToeflUpcomingExams().length ? getToeflUpcomingExams()[0] : null;
    var goNext = buildToeflGoNext();
    var goAction = nextExam ? null : nextBtn;

    // ── 1회 응시 ──
    if (count === 1) {
        el.innerHTML = buildCoachBox('info',
            '📈 첫 점수가 찍혔어요',
            '점 하나로는 선이 안 그려집니다. ' + goNext + '<br>' + targetLine,
            goAction);
        return;
    }

    // ── 2회 이상: 직전 회차와 비교 ──
    var prev = sorted[count - 2];
    var diff = Math.round((overall - Number(prev.overall)) * 10) / 10;

    if (diff > 0) {
        el.innerHTML = buildCoachBox('success',
            '📈 Overall +' + diff.toFixed(1) + ' — 곡선이 올라가고 있어요',
            '토플은 0.5점씩 차곡차곡 쌓아가는 시험이에요. 오르는 흐름을 탔을 때 이어가는 게 제일 빠릅니다. ' + goNext + '<br>' + targetLine,
            goAction);
        return;
    }

    if (diff === 0) {
        el.innerHTML = buildCoachBox('info',
            '지금은 힘을 모으는 구간이에요',
            '정체는 보통 <strong>한 영역이 발목을 잡을 때</strong> 생깁니다. 나머지가 올라도 그 하나가 평균을 눌러버리거든요. ' +
            '아래 그래프에서 어느 선이 안 움직이는지 보세요. 거기가 다음 목표입니다.<br>' +
            '정체 구간은 대부분 다음 한 번에서 풀립니다. ' + goNext,
            goAction);
        return;
    }

    // ── 하강 ── 여기가 이탈 위험이 가장 높은 지점이다. 위로가 먼저다.
    el.innerHTML = buildCoachBox('caution',
        '이번엔 조금 내려갔네요. 먼저 이것부터 알아두세요',
        '<strong>실제 시험에서는 원래 실력의 60~70%만 나와도 잘 본 겁니다.</strong> 진짜예요. ' +
        '연습 때처럼 100% 발휘하는 사람은 없어요. 점수가 내려간 건 실력이 떨어진 게 아닙니다.<br>' +
        '3번, 4번 보면서 오르락내리락하다가 결국 목표 찍는 분들이 훨씬 많아요.' +
        buildDropReasons() +
        '<br><strong>여기서 멈추는 게 제일 아깝습니다.</strong> ' + goNext,
        goAction);
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
        '<div class="toefl-coach-head">' +
            '<div class="toefl-coach-title">' + title + '</div>' +
            (action ? '<div class="toefl-coach-action">' + action + '</div>' : '') +
        '</div>' +
        '<div class="toefl-coach-body">' + body + '</div>' +
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
            '성적은 마이페이지에서 직접 등록하지 않습니다. 성적표가 나오면 <strong>카톡으로 캡처를 보내주시면</strong> 제가 등록해드려요.' +
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
    // 아직 성적이 안 나온 예정 시험도 세로선으로 표시 (다음 점이 찍힐 자리).
    // 1개면 "예정 시험", 여러 개면 날짜로 구분("예정 8/1").
    if (typeof getToeflUpcomingExams === 'function') {
        var ups = getToeflUpcomingExams();
        ups.forEach(function(e, i) {
            var ed = new Date(e.exam_datetime);
            var label = ups.length > 1
                ? '예정 ' + (ed.getMonth() + 1) + '/' + ed.getDate()
                : '예정 시험';
            markers.push({
                key: 'upcoming' + i, date: ed,
                content: label, position: 'start',
                border: 'rgba(90, 169, 226, 0.6)', bg: 'rgba(90, 169, 226, 0.9)'
            });
        });
    }

    var points = toeflScores.map(function(s) {
        return { date: new Date(s.test_date + 'T00:00:00'), score: s };
    });
    markers.forEach(function(m) { points.push({ date: m.date, marker: m }); });
    points.sort(function(a, b) { return a.date - b.date; });

    var labels = [];
    var readingData = [], listeningData = [], speakingData = [], writingData = [], overallData = [];
    var markerLabel = {};
    var examIndices = [];   // 성적이 찍힌 시험 날짜의 x축 인덱스 (배지로 표시)

    points.forEach(function(p, idx) {
        var lbl = (p.date.getMonth() + 1) + '/' + p.date.getDate();
        labels.push(lbl);
        if (p.score) {
            examIndices.push(idx);
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

    // 커트라인 가로선 (1차 목표 · 넘어야 할 선)
    if (toeflTarget) {
        annotations.targetLine = {
            type: 'line',
            yMin: toeflTarget, yMax: toeflTarget,
            borderColor: 'rgba(226, 122, 122, 0.55)',
            borderWidth: 2, borderDash: [4, 4],
            label: {
                display: true,
                content: '커트라인 ' + toeflTarget.toFixed(1),
                position: 'end',
                backgroundColor: 'rgba(226, 122, 122, 0.85)',
                color: '#fff',
                font: { size: 11, weight: '600', family: 'Pretendard' },
                padding: { x: 8, y: 4 }, borderRadius: 6
            }
        };
    }

    // 희망점수 가로선 (2차 목표 · 가고 싶은 선) -- 금색으로 구분
    if (toeflWishValid()) {
        annotations.wishLine = {
            type: 'line',
            yMin: toeflWish, yMax: toeflWish,
            borderColor: 'rgba(217, 164, 65, 0.7)',
            borderWidth: 2, borderDash: [4, 4],
            label: {
                display: true,
                content: '희망 ' + toeflWish.toFixed(1),
                position: 'end',
                backgroundColor: 'rgba(217, 164, 65, 0.95)',
                color: '#fff',
                font: { size: 11, weight: '600', family: 'Pretendard' },
                padding: { x: 8, y: 4 }, borderRadius: 6
            }
        };
    }

    if (toeflChartInstance) { toeflChartInstance.destroy(); }

    // 도달한 가장 높은 목표의 Overall 점 인덱스 — 폭죽 축하 대상 (저장 이미지도 공유)
    // 희망점수까지 도달했으면 그 점을, 아니면 커트라인 도달점을.
    var firstIdxReaching = function(goal) {
        for (var i = 0; i < overallData.length; i++) {
            if (overallData[i] != null && Number(overallData[i]) >= goal) return i;
        }
        return -1;
    };
    var celebrateIdx = -1;
    toeflCelebrateText = '🎉 축하해요!';
    if (toeflWishValid() && firstIdxReaching(toeflWish) >= 0) {
        celebrateIdx = firstIdxReaching(toeflWish);
        toeflCelebrateText = '🎉 희망점수 달성!';
    } else if (toeflTarget && firstIdxReaching(toeflTarget) >= 0) {
        celebrateIdx = firstIdxReaching(toeflTarget);
        toeflCelebrateText = '🎉 축하해요!';
    }
    toeflCelebrateIdx = celebrateIdx;

    // 목표 도달 점 위에 폭죽 + "축하해요!" 말풍선 오버레이를 얹는다 (hover 없이 상시).
    // 캔버스에 직접 그리지 않고 HTML 오버레이 + CSS 애니메이션으로 처리한다.
    var celebratePlugin = {
        id: 'toeflCelebrate',
        afterDatasetsDraw: function(chart) {
            var wrap = chart.canvas.parentNode;
            if (!wrap) return;
            var overlay = wrap.querySelector('.toefl-celebrate');
            if (celebrateIdx < 0) { if (overlay) overlay.remove(); return; }
            var meta = chart.getDatasetMeta(0);   // Overall
            var pt = meta && meta.data && meta.data[celebrateIdx];
            if (!pt) return;
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'toefl-celebrate';
                overlay.innerHTML =
                    '<div class="toefl-celebrate-bubble">' + toeflCelebrateText + '</div>' +
                    '<span class="toefl-spark toefl-spark-ring"></span>' +
                    '<span class="toefl-spark s1"></span><span class="toefl-spark s2"></span>' +
                    '<span class="toefl-spark s3"></span><span class="toefl-spark s4"></span>' +
                    '<span class="toefl-spark s5"></span><span class="toefl-spark s6"></span>';
                wrap.appendChild(overlay);
            }
            // 재렌더 시 문구가 바뀔 수 있으므로 매번 갱신 (커트라인/희망 달성)
            var bubble = overlay.querySelector('.toefl-celebrate-bubble');
            if (bubble && bubble.textContent !== toeflCelebrateText) bubble.textContent = toeflCelebrateText;
            overlay.style.left = (chart.canvas.offsetLeft + pt.x) + 'px';
            overlay.style.top = (chart.canvas.offsetTop + pt.y) + 'px';
        }
    };

    // 본 시험 날짜(x축)를 알약 배지로 그린다. 기본 축 텍스트는 숨기고 그 자리에 그린다.
    var examBadgePlugin = {
        id: 'toeflExamBadges',
        afterDatasetsDraw: function(chart) {
            var xs = chart.scales.x;
            if (!xs) return;
            var g = chart.ctx;
            g.save();
            g.font = '600 11px Pretendard, sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            var top = chart.chartArea.bottom + 6;   // 플롯 영역 바로 아래(축 라벨 자리)
            examIndices.forEach(function(i) {
                var cx = xs.getPixelForTick(i);
                var text = labels[i] + ' 시험';
                var tw = g.measureText(text).width;
                var h = 19, padX = 9, w = tw + padX * 2;
                var x = cx - w / 2, y = top, r = h / 2;
                g.beginPath();
                if (g.roundRect) { g.roundRect(x, y, w, h, r); }
                else {
                    g.moveTo(x + r, y);
                    g.arcTo(x + w, y, x + w, y + h, r);
                    g.arcTo(x + w, y + h, x, y + h, r);
                    g.arcTo(x, y + h, x, y, r);
                    g.arcTo(x, y, x + w, y, r);
                }
                g.fillStyle = 'rgba(148, 128, 197, 0.16)';
                g.fill();
                g.fillStyle = '#7a68aa';
                g.fillText(text, cx, y + h / 2 + 0.5);
            });
            g.restore();
        }
    };

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
        plugins: [examBadgePlugin, celebratePlugin],
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
                    ticks: {
                        font: { family: 'Pretendard' },
                        // 본 시험 날짜는 배지로 그리므로 기본 텍스트를 숨긴다 (마커 날짜는 유지)
                        callback: function(val, index) {
                            return examIndices.indexOf(index) !== -1 ? '' : labels[index];
                        }
                    },
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

    // 목표 도달 축하 표시 -- 라이브 오버레이는 HTML이라 캔버스엔 안 담기므로 여기서 정적으로 그린다
    if (toeflCelebrateIdx >= 0) {
        var meta = toeflChartInstance.getDatasetMeta(0);   // Overall
        var pt = meta && meta.data && meta.data[toeflCelebrateIdx];
        if (pt) {
            var dpr = window.devicePixelRatio || 1;
            drawToeflCelebration(ctx, pad + pt.x * dpr, pad + pt.y * dpr, dpr);
        }
    }

    ctx.font = '600 15px Pretendard, sans-serif';
    ctx.fillStyle = '#9480c5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('이온토플 내벨업챌린지  |  eonfl.com',
        out.width / 2, canvas.height + pad + 30);

    var link = document.createElement('a');
    link.download = 'toefl-score-' + (mpUser && mpUser.name ? mpUser.name : 'chart') + '.png';
    link.href = out.toDataURL('image/png');
    link.click();
}

/**
 * 저장 이미지용 정적 축하 그림 (폭죽 + 말풍선). s = 스케일(devicePixelRatio).
 * (px, py)는 목표 도달 Overall 점의 캔버스 픽셀 위치.
 */
function drawToeflCelebration(ctx, px, py, s) {
    ctx.save();

    // 폭죽 파티클 (정적)
    var sparks = [[22, -18, '#9480c5'], [-24, -14, '#77bf7e'], [20, 16, '#e2a05a'],
                  [-20, 18, '#5aa9e2'], [28, 2, '#e27a7a'], [-28, -2, '#b9ace2']];
    sparks.forEach(function(sp) {
        ctx.beginPath();
        ctx.arc(px + sp[0] * s, py + sp[1] * s, 3 * s, 0, Math.PI * 2);
        ctx.fillStyle = sp[2];
        ctx.fill();
    });

    // 펄스 링 (정적 원)
    ctx.beginPath();
    ctx.arc(px, py, 15 * s, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(148, 128, 197, 0.5)';
    ctx.lineWidth = 2 * s;
    ctx.stroke();

    // 말풍선
    var text = toeflCelebrateText;
    ctx.font = '700 ' + (13 * s) + 'px Pretendard, sans-serif';
    var tw = ctx.measureText(text).width;
    var padX = 12 * s, h = 26 * s, w = tw + padX * 2;
    var bx = px - w / 2, by = py - 18 * s - h, r = 12 * s;

    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(bx, by, w, h, r); }
    else {
        ctx.moveTo(bx + r, by);
        ctx.arcTo(bx + w, by, bx + w, by + h, r);
        ctx.arcTo(bx + w, by + h, bx, by + h, r);
        ctx.arcTo(bx, by + h, bx, by, r);
        ctx.arcTo(bx, by, bx + w, by, r);
    }
    var grad = ctx.createLinearGradient(bx, by, bx + w, by + h);
    grad.addColorStop(0, '#9480c5');
    grad.addColorStop(1, '#b9ace2');
    ctx.fillStyle = grad;
    ctx.fill();

    // 꼬리
    ctx.beginPath();
    ctx.moveTo(px - 6 * s, by + h);
    ctx.lineTo(px + 6 * s, by + h);
    ctx.lineTo(px, by + h + 8 * s);
    ctx.closePath();
    ctx.fillStyle = '#a594d0';
    ctx.fill();

    // 텍스트
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, px, by + h / 2);

    ctx.restore();
}

// ================================================
// 희망점수(2차 목표) 설정 -- 커트라인 달성 후 학생이 스스로 정한다
// ================================================
function openToeflWishModal() {
    var overlay = document.getElementById('toeflWishModalOverlay');
    var sel = document.getElementById('toeflWishSelect');
    var removeBtn = document.getElementById('toeflWishRemoveBtn');
    if (!overlay || !sel) return;

    // 선택지: 커트라인보다 0.5 높은 값 ~ 6.0 (신규 척도 0.5 단위)
    var min = (toeflTarget != null ? toeflTarget : 1.0) + 0.5;
    var opts = '';
    for (var v = min; v <= 6.0 + 1e-9; v += 0.5) {
        var val = (Math.round(v * 2) / 2).toFixed(1);
        var selAttr = (toeflWish != null && Number(val) === Number(toeflWish)) ? ' selected' : '';
        opts += '<option value="' + val + '"' + selAttr + '>' + val + '</option>';
    }
    sel.innerHTML = opts;

    // 이미 설정돼 있으면 "삭제" 노출
    if (removeBtn) removeBtn.style.display = (toeflWish != null) ? '' : 'none';

    overlay.classList.add('show');
}

function closeToeflWishModal() {
    var overlay = document.getElementById('toeflWishModalOverlay');
    if (overlay) overlay.classList.remove('show');
}

async function submitToeflWish() {
    if (!mpUser || !mpUser.applicationId) { alert('신청서 정보를 찾을 수 없습니다.'); return; }
    var sel = document.getElementById('toeflWishSelect');
    var btn = document.getElementById('toeflWishSubmitBtn');
    var val = parseFloat(sel.value);
    if (isNaN(val)) { alert('희망점수를 선택해주세요.'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';
    try {
        var ok = await supabaseUpdate('applications', 'id=eq.' + mpUser.applicationId, { target_wish_new: val });
        if (!ok) { alert('저장에 실패했습니다.'); return; }
        toeflWish = val;
        closeToeflWishModal();
        renderToeflSection();
    } catch (err) {
        console.error('❌ [TOEFL] 희망점수 저장 실패:', err);
        alert('저장 중 오류가 발생했습니다.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> 목표 설정';
    }
}

async function removeToeflWish() {
    if (!mpUser || !mpUser.applicationId) return;
    if (!confirm('희망점수 목표를 지울까요?')) return;
    try {
        var ok = await supabaseUpdate('applications', 'id=eq.' + mpUser.applicationId, { target_wish_new: null });
        if (!ok) { alert('삭제에 실패했습니다.'); return; }
        toeflWish = null;
        closeToeflWishModal();
        renderToeflSection();
    } catch (err) {
        console.error('❌ [TOEFL] 희망점수 삭제 실패:', err);
        alert('삭제 중 오류가 발생했습니다.');
    }
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
