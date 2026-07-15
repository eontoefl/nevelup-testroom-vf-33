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
// 목표 = Overall(항상) + 섹션 0~4개. 커트라인/다음목표 둘 다 이 객체 형태.
let toeflCutoff = {};         // 커트라인 (관리자 입력): {overall?, reading?, listening?, writing?, speaking?}
let toeflWish = {};           // 다음 목표 (학생 입력): 같은 형태
let toeflDeadline = null;     // 응시 마지노선 Date (없으면 null)
let toeflHiliteMetric = null; // 체크리스트에서 눌러 강조 중인 섹션 키 (없으면 null)
let toeflCelebrateIdx = -1;   // 축하 대상 Overall 점 인덱스 (저장 이미지에도 표시)
let toeflCelebrateText = '🎉 축하해요!';   // 축하 말풍선 문구

// 5개 지표 (Overall + 4섹션). 색은 그래프 데이터 선과 맞춤.
var TOEFL_METRICS = [
    { key: 'overall',   label: 'Overall',   color: '#1e1b2e' },
    { key: 'reading',   label: 'Reading',   color: '#9480c5' },
    { key: 'listening', label: 'Listening', color: '#77bf7e' },
    { key: 'writing',   label: 'Writing',   color: '#e2a05a' },
    { key: 'speaking',  label: 'Speaking',  color: '#5aa9e2' }
];

/** 목표 객체 → 값이 있는 항목 리스트 (Overall 먼저) */
function toeflGoalItems(goal) {
    return TOEFL_METRICS
        .filter(function(m) { var v = goal[m.key]; return v != null && !isNaN(v); })
        .map(function(m) { return { key: m.key, label: m.label, color: m.color, value: Number(goal[m.key]) }; });
}
function toeflHasGoal(goal) { return toeflGoalItems(goal).length > 0; }
function toeflMetricMeta(key) {
    for (var i = 0; i < TOEFL_METRICS.length; i++) if (TOEFL_METRICS[i].key === key) return TOEFL_METRICS[i];
    return null;
}

/** 특정 지표의 최근(가장 마지막 시험) 점수 */
function toeflLatestScore(metricKey) {
    if (!toeflScores.length) return null;
    var sorted = toeflScores.slice().sort(function(a, b) { return new Date(a.test_date) - new Date(b.test_date); });
    var v = sorted[sorted.length - 1][metricKey];
    return (v == null || v === '') ? null : Number(v);
}
function toeflItemMet(item) {
    var cur = toeflLatestScore(item.key);
    return cur != null && cur >= item.value;
}
/** 목표의 모든 항목(Overall + 걸린 섹션)이 충족됐는가 */
function toeflGoalMet(goal) {
    var items = toeflGoalItems(goal);
    if (!items.length) return false;
    return items.every(toeflItemMet);
}
/** 다음목표 Overall이 유효한지 (설정됐고 커트라인 Overall보다 높음) */
function toeflWishOverallValid() {
    if (toeflWish.overall == null) return false;
    if (toeflCutoff.overall != null && toeflWish.overall <= toeflCutoff.overall) return false;
    return toeflWish.overall <= 6;
}

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

/** 신청서에서 커트라인·다음목표(Overall+섹션)와 마감일을 가져온다 */
async function loadToeflTarget() {
    toeflCutoff = {};
    toeflWish = {};
    toeflDeadline = null;
    if (!mpUser || !mpUser.applicationId) return;
    // 마감/커트라인/Overall 다음목표는 항상 존재하는 컬럼.
    var baseCols = 'no_target_score,submission_deadline,' +
        'target_cutoff_new,target_reading_new,target_listening_new,target_writing_new,target_speaking_new,' +
        'target_wish_new';
    // 섹션 다음목표 컬럼은 마이그레이션 이후에만 존재.
    // supabaseSelect는 400에서 throw하지 않고 []를 반환하므로, base 조회를 신뢰 소스로 쓰고
    // 섹션 컬럼은 별도 조회해서 있으면 병합한다. (배포 순서 무관하게 마이페이지가 깨지지 않도록)
    var wishSecCols = 'target_wish_reading,target_wish_listening,target_wish_writing,target_wish_speaking';
    try {
        var rows = await supabaseSelect('applications',
            'id=eq.' + mpUser.applicationId + '&select=' + baseCols);
        if (!rows || !rows.length) return;
        var r = rows[0];
        // 섹션 다음목표 병합 (컬럼 없으면 [] → 병합 안 함)
        var secRows = await supabaseSelect('applications',
            'id=eq.' + mpUser.applicationId + '&select=' + wishSecCols);
        if (secRows && secRows.length) {
            r.target_wish_reading = secRows[0].target_wish_reading;
            r.target_wish_listening = secRows[0].target_wish_listening;
            r.target_wish_writing = secRows[0].target_wish_writing;
            r.target_wish_speaking = secRows[0].target_wish_speaking;
        }
        // 커트라인 (관리자 입력, no_target_score면 무시)
        if (!r.no_target_score) {
            _setGoalVal(toeflCutoff, 'overall', r.target_cutoff_new);
            _setGoalVal(toeflCutoff, 'reading', r.target_reading_new);
            _setGoalVal(toeflCutoff, 'listening', r.target_listening_new);
            _setGoalVal(toeflCutoff, 'writing', r.target_writing_new);
            _setGoalVal(toeflCutoff, 'speaking', r.target_speaking_new);
        }
        // 다음목표 (학생 입력)
        _setGoalVal(toeflWish, 'overall', r.target_wish_new);
        _setGoalVal(toeflWish, 'reading', r.target_wish_reading);
        _setGoalVal(toeflWish, 'listening', r.target_wish_listening);
        _setGoalVal(toeflWish, 'writing', r.target_wish_writing);
        _setGoalVal(toeflWish, 'speaking', r.target_wish_speaking);

        toeflDeadline = parseToeflDate(r.submission_deadline);
    } catch (err) {
        console.warn('⚠️ [TOEFL] 목표/마감 로드 실패 (무시):', err);
    }
}
function _setGoalVal(goal, key, raw) {
    var v = parseFloat(raw);
    if (!isNaN(v) && v >= 1 && v <= 6) goal[key] = v;
}

// ================================================
// 전체 섹션 렌더링
// ================================================
function renderToeflSection() {
    renderToeflCoach();
    renderToeflGoalStatus();
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

    var saveBtn = '<button class="toefl-coach-btn" onclick="saveToeflChartImage()">' +
        '<i class="fa-solid fa-download"></i> 그래프 이미지 저장</button>';
    var wishSetBtn = '<button class="toefl-coach-btn" onclick="openToeflWishModal()">' +
        '<i class="fa-solid fa-bullseye"></i> 다음 목표 설정하기</button>';
    var wishEditBtn = '<button class="toefl-coach-btn toefl-coach-btn-ghost" onclick="openToeflWishModal()">' +
        '<i class="fa-solid fa-pen"></i> 다음 목표 수정</button>';

    var cutoffMet = toeflHasGoal(toeflCutoff) && toeflGoalMet(toeflCutoff);

    // ── 커트라인(Overall+섹션 전부) 달성 이후: 다음 목표 흐름 ──
    if (cutoffMet) {
        var wishSet = toeflWishOverallValid();
        var wishMet = wishSet && toeflGoalMet(toeflWish);

        // ④ 다음 목표까지 전부 달성
        if (wishSet && wishMet) {
            el.innerHTML = buildCoachBox('success',
                '🎉 다음 목표 달성!',
                '커트라인을 넘어 스스로 세운 목표까지 이뤘어요. 대단해요! ' +
                '그래프를 저장해서 후기에 올려주시면 좋아요. 더 높이 가보고 싶다면 목표를 다시 세워도 좋아요.',
                saveBtn + ' ' + wishEditBtn);
            return;
        }

        // ③ 다음 목표 설정됨, 아직 미달 (세부 남은 항목은 목표 현황에서)
        if (wishSet) {
            var wo = toeflWish.overall;
            var curOv = toeflLatestScore('overall');
            var leftOv = (curOv != null) ? Math.round((wo - curOv) * 10) / 10 : null;
            // Overall이 아직 남았으면 원래 문구("N 남았어요"), Overall은 넘고 섹션만 남았으면 대체 문구
            var title3 = (leftOv != null && leftOv > 0)
                ? '🎯 다음 목표 ' + wo.toFixed(1) + '까지 ' + leftOv.toFixed(1) + ' 남았어요'
                : '🎯 다음 목표를 향해 가는 중';
            var hasSecWish = toeflGoalItems(toeflWish).length > 1;
            var secHint = hasSecWish
                ? ' <span class="toefl-coach-hint">남은 항목은 아래 <strong>목표 현황</strong>에서 확인하세요.</span>'
                : '';
            el.innerHTML = buildCoachBox('info',
                title3,
                '커트라인은 이미 넘었어요. 이제 스스로 세운 목표를 향해 가는 중이에요. ' + buildToeflGoNext() +
                secHint +
                '<div class="toefl-wish-editline">' + wishEditBtn + '</div>',
                null);
            return;
        }

        // ② 다음 목표 미설정 → 좌(축하) / 우(도전 권유) 분할
        el.innerHTML =
            '<div class="toefl-coach toefl-coach-success toefl-coach-split">' +
                '<div class="toefl-coach-split-col toefl-coach-split-main">' +
                    '<div class="toefl-coach-title">🎉 커트라인 달성!</div>' +
                    '<div class="toefl-coach-body">정말 고생하셨어요. 그래프를 저장해서 후기에 올려주시면 좋아요.</div>' +
                    '<div class="toefl-coach-split-foot">' + saveBtn + '</div>' +
                '</div>' +
                '<div class="toefl-coach-split-col toefl-coach-split-aside">' +
                    '<div class="toefl-coach-aside-title">더 높이 가볼까요?</div>' +
                    '<div class="toefl-coach-aside-body"><strong>다음 목표</strong>를 정해 한 번 더 도전!</div>' +
                    '<div class="toefl-coach-split-foot">' + wishSetBtn + '</div>' +
                '</div>' +
            '</div>';
        return;
    }

    // ── 커트라인 미달(또는 목표 없음) → Overall 추이 기반 동기부여 ──
    // (남은 커트라인 항목 세부는 아래 목표 현황이 담당하므로 여기선 반복하지 않는다)
    var overall = Number(sorted[count - 1].overall);
    var nextBtn = '<button class="toefl-coach-btn toefl-coach-add" onclick="openToeflExamModal()">' +
        '<i class="fa-solid fa-plus"></i> 등록한 시험 추가하기</button>';
    var nextExam = getToeflUpcomingExams && getToeflUpcomingExams().length ? getToeflUpcomingExams()[0] : null;
    var goNext = buildToeflGoNext();
    var goAction = nextExam ? null : nextBtn;

    // ── 커트라인 부분 달성: Overall 커트라인은 넘었고 섹션 커트라인만 남은 상태 ──
    // 그래프는 Overall만 그리므로 "커트라인 찍은 듯" 보이지만 실제론 섹션이 남았다.
    // 이 결정적 순간을 코치가 콕 집어준다(상승/정체/하강 문구보다 우선).
    if (toeflHasGoal(toeflCutoff) &&
        (toeflCutoff.overall == null || overall >= toeflCutoff.overall)) {
        var remainCut = toeflGoalItems(toeflCutoff).filter(function(it) {
            return it.key !== 'overall' && !toeflItemMet(it);
        });
        if (remainCut.length > 0) {
            var remainStr = remainCut.map(function(it) {
                var cur = toeflLatestScore(it.key);
                var gap = (cur != null) ? (Math.round((it.value - cur) * 10) / 10).toFixed(1) : null;
                return it.label + (gap ? ' ' + gap + '점' : '');
            }).join(', ');
            var cutTitle = (remainCut.length === 1)
                ? '🎯 커트라인까지 ' + remainCut[0].label + '만 남았어요'
                : '🎯 커트라인까지 ' + remainCut.length + '개 영역 남았어요';
            el.innerHTML = buildCoachBox('info',
                cutTitle,
                'Overall은 이미 넘었어요! 이제 <strong>' + remainStr + '</strong>만 올리면 커트라인 완성이에요. ' + goNext,
                goAction);
            return;
        }
    }

    // ── 1회 응시 ──
    if (count === 1) {
        el.innerHTML = buildCoachBox('info',
            '📈 첫 점수가 찍혔어요',
            '점 하나로는 선이 안 그려집니다. ' + goNext,
            goAction);
        return;
    }

    // ── 2회 이상: 직전 회차와 비교 ──
    var prev = sorted[count - 2];
    var diff = Math.round((overall - Number(prev.overall)) * 10) / 10;

    if (diff > 0) {
        el.innerHTML = buildCoachBox('success',
            '📈 Overall +' + diff.toFixed(1) + ' — 곡선이 올라가고 있어요',
            '토플은 0.5점씩 차곡차곡 쌓아가는 시험이에요. 오르는 흐름을 탔을 때 이어가는 게 제일 빠릅니다. ' + goNext,
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
// 목표 현황 (체크리스트) -- Overall+섹션 목표를 ✅/⬜로 나열
// 섹션 행은 눌러서 그래프에 그 섹션 선+추이를 강조할 수 있다.
// ================================================
function renderToeflGoalStatus() {
    var el = document.getElementById('toeflGoalStatus');
    if (!el) return;

    var hasCutoff = toeflHasGoal(toeflCutoff);
    var hasWish = toeflWishOverallValid();
    if (!hasCutoff && !hasWish) { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = '';

    var groups = '';
    if (hasCutoff) groups += buildToeflGoalGroup('커트라인', toeflCutoff, true);
    if (hasWish) groups += buildToeflGoalGroup('다음 목표', toeflWish, false);

    el.innerHTML =
        '<div class="toefl-goalstatus">' +
            '<div class="toefl-goalstatus-title">🎯 목표 현황</div>' +
            groups +
        '</div>';
}

function buildToeflGoalGroup(label, goal, isCutoff) {
    var tip = isCutoff
        ? ' <span class="toefl-goal-tip" tabindex="0" title="지원하는 학교·기관이 공식적으로 요구하는 최소 점수예요. 내가 받고 싶은 점수가 아니라 반드시 넘어야 하는 선입니다. 더 높은 도전은 [다음 목표]에서 세워요.">' +
          '<i class="fa-solid fa-circle-info"></i></span>'
        : '';
    var rows = toeflGoalItems(goal).map(function(it) {
        var cur = toeflLatestScore(it.key);
        var met = cur != null && cur >= it.value;
        var curStr = (cur == null) ? '기록 없음' : cur.toFixed(1);
        var gap = (cur != null && !met) ? ' · ' + (Math.round((it.value - cur) * 10) / 10).toFixed(1) + '점 더' : '';
        var clickable = (it.key !== 'overall');   // 섹션만 클릭 강조
        var active = (toeflHiliteMetric === it.key) ? ' toefl-goal-row-active' : '';
        return '<div class="toefl-goal-row' + (clickable ? ' toefl-goal-row-click' : '') + active + '"' +
            (clickable ? ' onclick="toggleToeflHilite(\'' + it.key + '\')"' : '') + '>' +
            '<span class="toefl-goal-check">' + (met ? '✅' : '⬜') + '</span>' +
            '<span class="toefl-goal-metric" style="color:' + it.color + '">' + it.label + '</span>' +
            '<span class="toefl-goal-val">' + it.value.toFixed(1) + '</span>' +
            '<span class="toefl-goal-cur">현재 ' + curStr + gap + '</span>' +
            (clickable ? '<i class="fa-solid fa-chart-line toefl-goal-eye"></i>' : '') +
        '</div>';
    }).join('');
    return '<div class="toefl-goal-group">' +
        '<div class="toefl-goal-grouptitle">' + label + tip + '</div>' + rows + '</div>';
}

/** 섹션 목표 행 클릭: 그래프에 그 섹션 선+추이 강조 토글 */
function toggleToeflHilite(metricKey) {
    toeflHiliteMetric = (toeflHiliteMetric === metricKey) ? null : metricKey;
    renderToeflGoalStatus();
    renderToeflChart();
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
        key: 'challengeStart', date: mStart, name: '챌린지 시작', position: 'start',
        border: 'rgba(148, 128, 197, 0.5)',
        fg: '#7a68aa', pill: 'rgba(148, 128, 197, 0.16)'
    });
    if (toeflDeadline) markers.push({
        key: 'deadline', date: toeflDeadline, name: '응시 마지노선', position: 'end',
        border: 'rgba(226, 122, 122, 0.6)',
        fg: '#c0533a', pill: 'rgba(226, 122, 122, 0.16)'
    });
    // 아직 성적이 안 나온 예정 시험도 세로선 + 알약 뱃지로 표시 (다음 점이 찍힐 자리).
    // 뱃지 텍스트는 "날짜 + 이름"이라, 여러 개면 '예정'만(날짜 중복 방지), 1개면 '예정 시험'.
    if (typeof getToeflUpcomingExams === 'function') {
        var ups = getToeflUpcomingExams();
        ups.forEach(function(e, i) {
            var ed = new Date(e.exam_datetime);
            markers.push({
                key: 'upcoming' + i, date: ed,
                name: (ups.length > 1 ? '예정' : '예정 시험'), position: 'start',
                border: 'rgba(90, 169, 226, 0.6)',
                fg: '#3f7fb0', pill: 'rgba(90, 169, 226, 0.16)'
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
    var examIndices = [];   // 성적이 찍힌 시험 날짜의 x축 인덱스 (점 표시용)
    // x축 알약 뱃지: 실제 시험 + 마커(챌린지 시작/응시 마지노선/예정) 모두 "날짜 + 이름" 알약으로 통일
    var badges = [];        // {index, text, fg, pill}

    points.forEach(function(p, idx) {
        var lbl = (p.date.getMonth() + 1) + '/' + p.date.getDate();
        labels.push(lbl);
        if (p.score) {
            examIndices.push(idx);
            badges.push({ index: idx, text: lbl + ' 시험', fg: '#7a68aa', pill: 'rgba(148, 128, 197, 0.16)' });
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
            // line: 이 뱃지엔 세로 안내선이 딸린다(마커). 선은 뱃지 중앙에 맞춰 플러그인이 직접 그린다.
            badges.push({ index: idx, text: lbl + ' ' + p.marker.name, fg: p.marker.fg, pill: p.marker.pill, line: p.marker.border });
        }
    });

    // 마커 세로 점선은 뱃지 중앙에 정확히 맞추려고 플러그인에서 직접 그린다(아래 examBadgePlugin).
    // 여기 annotations에는 가로 목표선(커트라인/다음목표)만 담는다.
    var annotations = {};

    // 가로 목표선. 라벨은 알약 뱃지가 아니라 "선 끝에 볼드 제목"처럼.
    // 선과 같은 높이(yAdjust 0)로 끝에 두고, 흰 배경(카드색)으로 선을 살짝 끊어 텍스트로 이어지게 한다.
    var hlineFn = function(value, lineColor, textColor, label, pos, opts) {
        opts = opts || {};
        return {
            type: 'line', yMin: value, yMax: value,
            borderColor: lineColor, borderWidth: opts.borderWidth || 2, borderDash: [4, 4],
            label: {
                display: true, content: label, position: pos,
                backgroundColor: '#ffffff',
                color: textColor,
                font: { size: 12, weight: '700', family: 'Pretendard' },
                padding: { x: 5, y: 1 },
                borderRadius: 0
            }
        };
    };

    // Overall 목표선: 커트라인(빨강) + 다음목표(금색). 섹션은 선으로 안 그림.
    // 커트라인은 이미 넘겼으면 배경으로 물러나게(얇고 연하게) 처리 — 초점은 다음 목표로.
    if (toeflCutoff.overall != null) {
        var cutoffCleared = toeflHasGoal(toeflCutoff) && toeflGoalMet(toeflCutoff);
        annotations.cutoffLine = cutoffCleared
            ? hlineFn(toeflCutoff.overall,
                'rgba(226, 122, 122, 0.22)', 'rgba(192, 83, 58, 0.5)',
                '커트라인 ' + toeflCutoff.overall.toFixed(1), 'end',
                { borderWidth: 1 })
            : hlineFn(toeflCutoff.overall,
                'rgba(226, 122, 122, 0.55)', '#cf5b5b',
                '커트라인 ' + toeflCutoff.overall.toFixed(1), 'end');
    }
    if (toeflWishOverallValid()) {
        annotations.wishLine = hlineFn(toeflWish.overall,
            'rgba(217, 164, 65, 0.7)', '#c1962f',
            '다음 목표 ' + toeflWish.overall.toFixed(1), 'end');
    }

    // 섹션 강조: 체크리스트에서 누른 섹션의 목표선을 그 섹션 색으로 잠깐 표시 (좌측 끝에 볼드 제목)
    if (toeflHiliteMetric && toeflHiliteMetric !== 'overall') {
        var mk = toeflHiliteMetric;
        var meta = toeflMetricMeta(mk);
        var mColor = meta ? meta.color : '#888';
        if (toeflCutoff[mk] != null) {
            annotations.hlCut = hlineFn(toeflCutoff[mk], mColor, mColor,
                '커트라인 ' + meta.label + ' ' + toeflCutoff[mk].toFixed(1), 'start');
        }
        if (toeflWish[mk] != null && (toeflCutoff[mk] == null || toeflWish[mk] > toeflCutoff[mk])) {
            annotations.hlWish = hlineFn(toeflWish[mk], mColor, mColor,
                '다음 ' + meta.label + ' ' + toeflWish[mk].toFixed(1), 'start');
        }
    }

    if (toeflChartInstance) { toeflChartInstance.destroy(); }

    // 축하: 그룹(Overall+섹션 전부) 완성 시. 다차원이라 "처음 도달한 점"이 아니라 최근 Overall 점 위에.
    // 단, "지금 활성 목표"만 축하한다 — 다음 목표를 이미 세웠으면 커트라인 폭죽은 띄우지 않는다.
    // (커트라인 선을 연하게 물러나게 한 것과 일관: 다음 목표를 좇는 동안엔 커트라인은 지난 일)
    var lastOverallIdx = -1;
    for (var li = overallData.length - 1; li >= 0; li--) {
        if (overallData[li] != null) { lastOverallIdx = li; break; }
    }
    var celebrateIdx = -1;
    toeflCelebrateText = '🎉 축하해요!';
    if (toeflWishOverallValid() && toeflGoalMet(toeflWish)) {
        celebrateIdx = lastOverallIdx;
        toeflCelebrateText = '🎉 다음 목표 달성!';
    } else if (!toeflWishOverallValid() && toeflHasGoal(toeflCutoff) && toeflGoalMet(toeflCutoff)) {
        celebrateIdx = lastOverallIdx;
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

    // 뱃지의 클램프된 박스(x/너비/중앙)를 계산. 양 끝 뱃지는 플롯 밖으로 안 삐져나가게 안쪽으로 붙인다.
    var toeflBadgeBox = function(chart, b) {
        var g = chart.ctx, ca = chart.chartArea;
        g.save();
        g.font = '600 11px Pretendard, sans-serif';
        var w = g.measureText(b.text).width + 18;
        g.restore();
        var cx = chart.scales.x.getPixelForTick(b.index);
        var x = Math.max(ca.left, Math.min(cx - w / 2, ca.right - w));
        return { x: x, w: w, center: x + w / 2 };
    };

    // x축의 날짜 알약 뱃지(시험 + 마커)와 마커 세로 안내선을 그린다.
    // 세로선은 뱃지 중앙(클램프 반영)에 맞춰 그려서 뱃지와 항상 붙어 다닌다.
    var examBadgePlugin = {
        id: 'toeflExamBadges',
        // 세로 안내선은 데이터 선 뒤에 (beforeDatasetsDraw)
        beforeDatasetsDraw: function(chart) {
            if (!chart.scales.x) return;
            var g = chart.ctx, ca = chart.chartArea;
            g.save();
            g.setLineDash([6, 4]);
            g.lineWidth = 2;
            badges.forEach(function(b) {
                if (!b.line) return;
                var cxx = toeflBadgeBox(chart, b).center;
                g.strokeStyle = b.line;
                g.beginPath();
                g.moveTo(cxx, ca.top);
                g.lineTo(cxx, ca.bottom);
                g.stroke();
            });
            g.restore();
        },
        // 알약 뱃지는 데이터 위에 (afterDatasetsDraw)
        afterDatasetsDraw: function(chart) {
            if (!chart.scales.x) return;
            var g = chart.ctx, ca = chart.chartArea;
            g.save();
            g.font = '600 11px Pretendard, sans-serif';
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            var y = ca.bottom + 6;   // 플롯 영역 바로 아래(축 라벨 자리)
            var h = 19, r = h / 2;
            badges.forEach(function(b) {
                var box = toeflBadgeBox(chart, b);
                var x = box.x, w = box.w;
                g.beginPath();
                if (g.roundRect) { g.roundRect(x, y, w, h, r); }
                else {
                    g.moveTo(x + r, y);
                    g.arcTo(x + w, y, x + w, y + h, r);
                    g.arcTo(x + w, y + h, x, y + h, r);
                    g.arcTo(x, y + h, x, y, r);
                    g.arcTo(x, y, x + w, y, r);
                }
                g.fillStyle = b.pill;
                g.fill();
                g.fillStyle = b.fg;
                g.fillText(b.text, box.center, y + h / 2 + 0.5);
            });
            g.restore();
        }
    };
    var badgeIndices = badges.map(function(b) { return b.index; });

    // 섹션 강조 중이면: 강조 섹션은 굵게, Overall은 유지, 나머지는 흐리게
    var hl = toeflHiliteMetric;
    var dim = function(color) {
        return color.length === 7 ? color + '22' : color;   // #rrggbb + alpha
    };
    var line = function(label, data, color, width, radius, order, metricKey) {
        var faded = hl && metricKey !== hl && metricKey !== 'overall';
        var emph = hl && metricKey === hl;
        return {
            label: label, data: data,
            borderColor: faded ? dim(color) : color,
            borderWidth: emph ? width + 1.5 : width,
            pointRadius: faded ? 0 : (emph ? radius + 1 : radius),
            pointBackgroundColor: faded ? dim(color) : color,
            pointBorderColor: '#fff', pointBorderWidth: 1.5,
            tension: 0.3, fill: false, order: emph ? -1 : order, spanGaps: true
        };
    };

    toeflChartInstance = new Chart(canvas, {
        type: 'line',
        plugins: [examBadgePlugin, celebratePlugin],
        data: {
            labels: labels,
            datasets: [
                line('Overall', overallData, '#1e1b2e', 3, 6, 0, 'overall'),
                line('Reading', readingData, '#9480c5', 2, 4, 1, 'reading'),
                line('Listening', listeningData, '#77bf7e', 2, 4, 2, 'listening'),
                line('Writing', writingData, '#e2a05a', 2, 4, 3, 'writing'),
                line('Speaking', speakingData, '#5aa9e2', 2, 4, 4, 'speaking')
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
                        // 시험·마커 날짜는 모두 알약 뱃지로 그리므로 기본 축 텍스트는 숨긴다.
                        callback: function(val, index) {
                            return badgeIndices.indexOf(index) !== -1 ? '' : labels[index];
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
// 다음목표 값 → DB 컬럼 매핑
var TOEFL_WISH_COL = {
    overall: 'target_wish_new', reading: 'target_wish_reading',
    listening: 'target_wish_listening', writing: 'target_wish_writing', speaking: 'target_wish_speaking'
};

/** 그 지표의 역대 최고 점수 (여러 시험 중 가장 높은 값) */
function toeflMaxScore(metricKey) {
    var max = null;
    toeflScores.forEach(function(s) {
        var v = s[metricKey];
        if (v == null || v === '') return;
        v = Number(v);
        if (max == null || v > max) max = v;
    });
    return max;
}

/** 그 지표의 다음목표 하한(이 값보다 커야 유효): max(그 지표 커트라인, 역대 최고점).
 *  다음 목표는 "더 높이 도전"이므로 이미 받아본 최고점보다 반드시 높아야 한다. */
function _toeflWishFloor(key) {
    var cut = (toeflCutoff[key] != null) ? toeflCutoff[key] : 0;
    var best = toeflMaxScore(key);
    var floor = Math.max(cut, best != null ? best : 0);
    if (key === 'overall' && floor < 1.0) floor = 1.0;
    return floor;
}

function _toeflOptionsHtml(floor, selected) {
    var min = floor + 0.5;
    var html = '';
    for (var v = min; v <= 6.0 + 1e-9; v += 0.5) {
        var val = (Math.round(v * 2) / 2).toFixed(1);
        var s = (selected != null && Number(val) === Number(selected)) ? ' selected' : '';
        html += '<option value="' + val + '"' + s + '>' + val + '</option>';
    }
    return html;
}

function openToeflWishModal() {
    var overlay = document.getElementById('toeflWishModalOverlay');
    var fields = document.getElementById('toeflWishFields');
    var removeBtn = document.getElementById('toeflWishRemoveBtn');
    if (!overlay || !fields) return;

    var html = '';
    TOEFL_METRICS.forEach(function(m) {
        var isOverall = (m.key === 'overall');
        var floor = _toeflWishFloor(m.key);
        var existing = toeflWish[m.key];
        // 하한이 이미 6.0이면 더 높은 목표를 걸 수 없음 → 섹션은 비활성, Overall은 그대로(6.0만)
        var maxed = floor >= 6.0;

        if (isOverall) {
            html += '<div class="toefl-field">' +
                '<label>다음 목표 Overall <span class="toefl-field-req">필수</span></label>' +
                '<select id="toeflWish_overall">' + _toeflOptionsHtml(floor, existing) + '</select>' +
                '</div>';
        } else {
            var checked = (existing != null);
            html += '<div class="toefl-wish-secrow">' +
                '<label class="toefl-wish-seccheck">' +
                    '<input type="checkbox" id="toeflWishChk_' + m.key + '"' +
                        (checked ? ' checked' : '') + (maxed ? ' disabled' : '') +
                        ' onchange="onToeflWishSecToggle(\'' + m.key + '\')">' +
                    '<span style="color:' + m.color + '">' + m.label + '</span>' +
                '</label>' +
                '<select id="toeflWish_' + m.key + '"' + ((checked && !maxed) ? '' : ' disabled') + '>' +
                    (maxed ? '<option>이미 최고점</option>' : _toeflOptionsHtml(floor, existing)) +
                '</select>' +
            '</div>';
        }
    });
    fields.innerHTML = html;

    if (removeBtn) removeBtn.style.display = toeflHasGoal(toeflWish) ? '' : 'none';
    overlay.classList.add('show');
}

function onToeflWishSecToggle(key) {
    var chk = document.getElementById('toeflWishChk_' + key);
    var sel = document.getElementById('toeflWish_' + key);
    if (chk && sel) sel.disabled = !chk.checked;
}

function closeToeflWishModal() {
    var overlay = document.getElementById('toeflWishModalOverlay');
    if (overlay) overlay.classList.remove('show');
}

async function submitToeflWish() {
    if (!mpUser || !mpUser.applicationId) { alert('신청서 정보를 찾을 수 없습니다.'); return; }
    var btn = document.getElementById('toeflWishSubmitBtn');

    var overallVal = parseFloat((document.getElementById('toeflWish_overall') || {}).value);
    if (isNaN(overallVal)) { alert('다음 목표 Overall 점수를 선택해주세요.'); return; }

    var payload = { target_wish_new: overallVal };
    TOEFL_METRICS.forEach(function(m) {
        if (m.key === 'overall') return;
        var chk = document.getElementById('toeflWishChk_' + m.key);
        var sel = document.getElementById('toeflWish_' + m.key);
        var v = (chk && chk.checked && sel) ? parseFloat(sel.value) : NaN;
        payload[TOEFL_WISH_COL[m.key]] = isNaN(v) ? null : v;
    });

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';
    try {
        var ok = await supabaseUpdate('applications', 'id=eq.' + mpUser.applicationId, payload);
        if (!ok) { alert('저장에 실패했습니다.'); return; }
        toeflWish = {};
        _setGoalVal(toeflWish, 'overall', payload.target_wish_new);
        _setGoalVal(toeflWish, 'reading', payload.target_wish_reading);
        _setGoalVal(toeflWish, 'listening', payload.target_wish_listening);
        _setGoalVal(toeflWish, 'writing', payload.target_wish_writing);
        _setGoalVal(toeflWish, 'speaking', payload.target_wish_speaking);
        closeToeflWishModal();
        renderToeflSection();
    } catch (err) {
        console.error('❌ [TOEFL] 다음목표 저장 실패:', err);
        alert('저장 중 오류가 발생했습니다.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> 목표 설정';
    }
}

async function removeToeflWish() {
    if (!mpUser || !mpUser.applicationId) return;
    if (!confirm('다음 목표를 지울까요? (Overall·섹션 전부)')) return;
    try {
        var ok = await supabaseUpdate('applications', 'id=eq.' + mpUser.applicationId, {
            target_wish_new: null, target_wish_reading: null, target_wish_listening: null,
            target_wish_writing: null, target_wish_speaking: null
        });
        if (!ok) { alert('삭제에 실패했습니다.'); return; }
        toeflWish = {};
        toeflHiliteMetric = null;
        closeToeflWishModal();
        renderToeflSection();
    } catch (err) {
        console.error('❌ [TOEFL] 다음목표 삭제 실패:', err);
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
