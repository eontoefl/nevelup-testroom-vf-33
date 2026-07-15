/**
 * ================================================
 * mypage-nav.js -- 마이페이지 탭 + "지금 할 일" 배너
 * ================================================
 *
 * 의존: toefl-exam.js (toeflExams), toefl-score.js (toeflScores, toeflTarget)
 *
 * 배너를 만든 이유:
 *   마이페이지에서 학생이 뭔가를 "누를 수 있는" 곳은 실제 TOEFL 시험 섹션뿐인데,
 *   그게 3화면 아래에 묻혀 있었다. 마감 경고도, 다음 시험 등록 버튼도 아무도 못 봤다.
 *   그래서 지금 해야 할 것 딱 하나만 맨 위로 끌어올린다. 할 일이 없으면 뜨지 않는다.
 */

const MP_TAB_KEY = 'mpActiveTab';

// ================================================
// 탭 전환
// ================================================
function switchMpTab(panelId) {
    var panels = document.querySelectorAll('.mp-panel');
    for (var i = 0; i < panels.length; i++) {
        panels[i].classList.toggle('active', panels[i].id === panelId);
    }
    var tabs = document.querySelectorAll('.mp-tab');
    for (var j = 0; j < tabs.length; j++) {
        tabs[j].classList.toggle('active', tabs[j].dataset.panel === panelId);
    }
    try { sessionStorage.setItem(MP_TAB_KEY, panelId); } catch (e) {}
    // 배너는 TOEFL 탭에서 숨겨야 하므로 탭이 바뀔 때마다 다시 판단한다
    renderToeflBanner();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** 지금 TOEFL 탭을 보고 있나 (배너 중복 방지용) */
function isToeflTabActive() {
    var p = document.getElementById('panel-toefl');
    return !!(p && p.classList.contains('active'));
}

/** 마지막으로 보던 탭 복원 (?tab=toefl 로도 진입 가능) */
function initMpTabs() {
    var fromQuery = new URLSearchParams(window.location.search).get('tab');
    var target = fromQuery ? 'panel-' + fromQuery : null;

    if (!target) {
        try { target = sessionStorage.getItem(MP_TAB_KEY); } catch (e) {}
    }
    if (target && document.getElementById(target)) {
        switchMpTab(target);
        window.scrollTo({ top: 0 });
    }
}

/** 배너 CTA -> TOEFL 탭으로 이동 후 등록 모달 열기 */
function goToToeflAndRegister() {
    switchMpTab('panel-toefl');
    setTimeout(function() { openToeflExamModal(); }, 200);
}

function goToToeflTab() {
    switchMpTab('panel-toefl');
}

// ================================================
// "지금 할 일" 배너
// ================================================
function renderToeflBanner() {
    var el = document.getElementById('mpActionBanner');
    if (!el) return;

    var html = buildToeflBanner();
    el.innerHTML = html || '';
    // TOEFL 탭에서는 카드·코치가 같은 내용을 이미 보여주므로 배너를 숨긴다 (중복 방지).
    // 배너의 값어치는 다른 탭에서 "지금 할 일"을 끌어올려 보여주는 데 있다.
    el.style.display = (html && !isToeflTabActive()) ? '' : 'none';
}

function buildToeflBanner() {
    if (typeof toeflExams === 'undefined' || typeof toeflScores === 'undefined') return '';

    var now = new Date();
    var attempts = getToeflAttemptCount();
    var scoreCount = toeflScores.length;

    // ── ① 이미 치른 시험인데 성적이 아직 안 올라온 경우 (가장 급한 행동) ──
    var awaiting = toeflExams.filter(function(e) {
        return e.status === 'scheduled' && new Date(e.exam_datetime) <= now;
    });
    if (awaiting.length > scoreCount) {
        return bannerBox('act',
            '<strong>시험 보셨죠? 성적표가 나오면 카톡으로 캡처를 보내주세요.</strong> ' +
            '보내주시면 선생님이 등록해드리고, 여기에 추이 그래프가 그려집니다.',
            null);
    }

    // ── ② 응시 예정 시험이 있는 경우 ──
    var next = getToeflNextExam();
    if (next) {
        var dday = toeflDaysUntil(next.exam_datetime);
        var label = dday > 0 ? 'D-' + dday : 'D-DAY';
        return bannerBox('info',
            '<strong>다음 시험 ' + label + '</strong> — ' + formatToeflExamDate(next.exam_datetime) +
            '. 시험이 끝나면 안내를 보내드릴게요.',
            '<button class="mp-banner-btn ghost" onclick="goToToeflTab()">일정 보기</button>');
    }

    // ── ③ 최소 2회를 아직 못 채운 경우: 마감 경고 ──
    if (attempts < TOEFL_REQUIRED_COUNT) {
        var deadline = getToeflRegDeadline();
        if (deadline) {
            var left = toeflDaysUntil(deadline);
            var remain = TOEFL_REQUIRED_COUNT - attempts;

            if (left < 0) {
                return bannerBox('danger',
                    '<strong>시험 등록 기한이 지났습니다.</strong> 시험료지원금 21만원 반환 대상이에요. 카톡으로 상담 주세요.',
                    null);
            }
            return bannerBox('warn',
                '<strong>시험 등록 마감 D-' + left + '</strong> — ' + remain + '회 더 등록하셔야 해요. ' +
                '미등록 시 시험료지원금 <strong>21만원 반환 대상</strong>입니다.' +
                '<span class="mp-banner-tip">📌 챌린지 기간 안에 <strong>시험 접수(등록)</strong>만 하시면 돼요. 시험 보는 날은 챌린지 이후여도 괜찮습니다.</span>',
                '<button class="mp-banner-btn" onclick="goToToeflAndRegister()">등록한 시험 추가하기</button>');
        }
    }

    // ── ④ 목표 달성: 더 보라고 하지 않는다 ──
    if (typeof toeflTarget !== 'undefined' && toeflTarget && scoreCount &&
        Number(toeflScores[toeflScores.length - 1].overall) >= toeflTarget) {
        return bannerBox('done',
            '🎉 <strong>목표 달성!</strong> 후기 남기실 때 성적 추이 그래프를 저장해서 함께 올려주세요.',
            '<button class="mp-banner-btn ghost" onclick="goToToeflTab()">그래프 보기</button>');
    }

    // ── ⑤ 2회는 채웠지만 목표 전: 다음 시험으로 민다 ──
    if (scoreCount >= 1) {
        return bannerBox('info',
            '<strong>다음 시험을 등록하면 곡선이 이어집니다.</strong> ' +
            '토플은 2점, 5점씩 쌓는 시험이에요. 흐름을 끊지 마세요.',
            '<button class="mp-banner-btn" onclick="goToToeflAndRegister()">등록한 시험 추가하기</button>');
    }

    return '';
}

function bannerBox(tone, text, action) {
    var icon = {
        warn:   'fa-triangle-exclamation',
        danger: 'fa-circle-exclamation',
        info:   'fa-calendar-check',
        act:    'fa-comment-dots',
        done:   'fa-trophy'
    }[tone] || 'fa-circle-info';

    return '<div class="mp-banner mp-banner-' + tone + '">' +
        '<i class="fa-solid ' + icon + '"></i>' +
        '<span class="mp-banner-text">' + text + '</span>' +
        (action ? '<span class="mp-banner-action">' + action + '</span>' : '') +
    '</div>';
}

console.log('✅ mypage-nav.js 로드 완료');
