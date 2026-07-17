/**
 * ================================================
 * toefl-exam.js -- 실제 TOEFL 시험 일정 (1단계: 시험 등록 인증)
 * ================================================
 *
 * 의존: supabase-client.js, mypage.js (mpUser 전역변수)
 * DB: toefl_exam_schedules
 * Storage: toefl-score-images 버킷 / exam-reg 폴더
 *
 * 인증 절차:
 *   1단계 = 시험 등록 인증 → 여기(마이페이지). 일정 + ETS 등록 확인 캡처
 *   2단계 = 점수 인증     → 카카오톡으로 성적표 캡처 전송 (선생님이 등록)
 *
 * 시험 일정을 넣어두면 시험 시작 +2시간 30분에 알림톡이 자동 발송된다.
 */

// ================================================
// 전역 상태
// ================================================
let toeflExams = [];        // 시험 일정 (exam_datetime 오름차순)
let toeflEditingExamId = null;   // 수정 중인 일정 id (null이면 신규 등록)

// 계약상 시험 등록 마감: 챌린지 시작일 + Fast 28일 / Standard 42일
const TOEFL_REG_DEADLINE_DAYS = { fast: 28, standard: 42 };
const TOEFL_REQUIRED_COUNT = 2;   // 최소 응시 횟수 (목표가 아니라 최소선)

// ================================================
// 데이터 로드
// ================================================
async function loadToeflExams() {
    if (!mpUser || !mpUser.id) return;
    try {
        toeflExams = await supabaseSelect(
            'toefl_exam_schedules',
            'user_id=eq.' + mpUser.id + '&order=exam_datetime.asc'
        ) || [];
        console.log('📅 [TOEFL] 시험 일정 ' + toeflExams.length + '건 로드');
    } catch (err) {
        console.error('❌ [TOEFL] 시험 일정 로드 실패:', err);
        toeflExams = [];
    }
}

// ================================================
// 조회 헬퍼
// ================================================

/** 취소되지 않은 일정 (등록 인증으로 인정되는 건) */
function getToeflValidExams() {
    return toeflExams.filter(function(e) { return e.status !== 'cancelled'; });
}

/**
 * 응시(예정 포함) 횟수.
 * 일정 건수만 세면, 일정을 넣지 않고 카톡으로만 인증한 학생(기존 기수)이나
 * 이미 성적이 등록된 학생에게 "시험을 등록하세요" 경고가 잘못 뜬다.
 * 성적이 있다는 건 시험을 봤다는 뜻이므로 함께 센다.
 */
function getToeflAttemptCount() {
    var scored = (typeof toeflScores !== 'undefined' && toeflScores) ? toeflScores.length : 0;
    return Math.max(getToeflValidExams().length, scored);
}

/** 아직 치르지 않은 예정 시험 전체 (가까운 순) */
function getToeflUpcomingExams() {
    var now = new Date();
    return toeflExams.filter(function(e) {
        return e.status === 'scheduled' && new Date(e.exam_datetime) > now;
    });
}

/** 아직 치르지 않은 가장 가까운 시험 */
function getToeflNextExam() {
    var upcoming = getToeflUpcomingExams();
    return upcoming.length ? upcoming[0] : null;
}

/**
 * 이미 날짜가 지난 시험 (응시 완료 · 성적 아직 미등록) -- 최근 순.
 * 예정 시험만 그리면, 지난 날짜로 등록한 시험이 화면에서 아예 사라져
 * 학생이 "저장이 안 됐다"고 오해하고 반복 등록하게 된다. 지난 시험도 보여준다.
 * 성적이 이미 연결된(score_id) 시험은 성적 목록·그래프가 대신 보여주므로 제외.
 */
function getToeflPastExams() {
    var now = new Date();
    return toeflExams.filter(function(e) {
        return e.status === 'scheduled' && !e.score_id && new Date(e.exam_datetime) <= now;
    }).sort(function(a, b) {
        return new Date(b.exam_datetime) - new Date(a.exam_datetime);
    });
}

/** 시험 등록 마감일 (없으면 null) */
function getToeflRegDeadline() {
    if (!mpUser || !mpUser.startDate) return null;
    var days = TOEFL_REG_DEADLINE_DAYS[mpUser.programType] || TOEFL_REG_DEADLINE_DAYS.standard;
    var d = new Date(mpUser.startDate + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    return d;
}

/** 오늘 기준 남은 일수 (음수면 지남) */
function toeflDaysUntil(target) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var t = new Date(target);
    t.setHours(0, 0, 0, 0);
    return Math.round((t - today) / (1000 * 60 * 60 * 24));
}

function formatToeflExamDate(iso) {
    var d = new Date(iso);
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + days[d.getDay()] + ') ' +
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// ================================================
// 시험 카드 -- 시험일까지 남은 일수(D-day)로 문구/배지가 단계별로 바뀐다
// ================================================
/**
 * 시험일 기준 단계별 표시 정보.
 *   ① D-2 이상 : 기본 응원
 *   ② D-1      : 전날 (컨디션 + 카톡 예고)
 *   ③ D-DAY    : 당일 (강한 화이팅)
 *   ④ D+1~D+7  : 시험 직후 (성적 보내달라 - 부드럽게)
 *   ⑤ D+8 이상 : 성적 미인증 경고 (강하게)
 */
function toeflExamPhase(dday) {
    if (dday >= 2) return {
        cardClass: 'toefl-exam-card-upcoming',
        badgeClass: 'toefl-exam-dday',
        badgeLabel: 'D-' + dday,
        sub: '그동안 쌓은 실력을 확인하는 날이 다가와요. 지금처럼만 준비하면 돼요! 💪'
    };
    if (dday === 1) return {
        cardClass: 'toefl-exam-card-upcoming',
        badgeClass: 'toefl-exam-dday',
        badgeLabel: 'D-1',
        sub: '내일이 바로 시험날이에요! 오늘은 푹 쉬고 컨디션만 챙기세요. 시험 끝나면 제가 카톡 드릴 테니, 답장만 주시면 돼요 🙂'
    };
    if (dday === 0) return {
        cardClass: 'toefl-exam-card-upcoming',
        badgeClass: 'toefl-exam-dday',
        badgeLabel: 'D-DAY',
        sub: '드디어 오늘이에요! 긴장은 열심히 준비했다는 증거예요. 평소처럼, 아니 평소보다 더 잘하고 오실 거예요. 화이팅!! 🔥'
    };
    if (dday >= -7) return {   // D+1 ~ D+7
        cardClass: 'toefl-exam-card-past',
        badgeClass: 'toefl-exam-dday toefl-exam-dday-done',
        badgeLabel: '응시함',
        sub: '시험 보느라 고생 많으셨어요! 성적이 나오면 <strong>반드시 카톡으로 성적표를 캡처해서 보내주세요.</strong> 제가 바로 등록해드릴게요.'
    };
    return {   // D+8 이상 -- 성적 미인증 경고
        cardClass: 'toefl-exam-card-overdue',
        badgeClass: 'toefl-exam-dday toefl-exam-dday-overdue',
        badgeLabel: '미인증',
        sub: '⚠️ 아직 <strong>성적 인증이 안 된 상태</strong>예요. 성적표를 카톡으로 보내주셔야 인증 처리가 됩니다. 이미 성적이 나왔다면 지금 바로 캡처해서 보내주세요!'
    };
}

/** 시험 카드 1개 HTML. isNext=가장 가까운 예정 시험이면 제목에 '다음 시험' 접두 */
function buildToeflExamCardHtml(e, isNext) {
    var dday = toeflDaysUntil(e.exam_datetime);
    var ph = toeflExamPhase(dday);
    var dateStr = formatToeflExamDate(e.exam_datetime);
    var title = (isNext && dday >= 1) ? ('다음 시험 ' + dateStr) : (dateStr + ' 시험');
    return '<div class="toefl-exam-card ' + ph.cardClass + '">' +
        '<div class="toefl-exam-card-main">' +
            '<span class="' + ph.badgeClass + '">' + ph.badgeLabel + '</span>' +
            '<div class="toefl-exam-info">' +
                '<strong>' + title + '</strong>' +
                '<span>' + ph.sub + '</span>' +
            '</div>' +
        '</div>' +
        '<div class="toefl-exam-card-actions">' +
            '<button class="toefl-exam-btn-ghost" onclick="openToeflExamModal(\'' + e.id + '\')">수정</button>' +
            '<button class="toefl-exam-btn-ghost" onclick="cancelToeflExam(\'' + e.id + '\')">취소</button>' +
        '</div>' +
    '</div>';
}

// ================================================
// 렌더링 -- 시험 일정 카드 (행동 유도 영역)
// ================================================
function renderToeflExamCard() {
    var el = document.getElementById('toeflExamCard');
    if (!el) return;

    var validCount = getToeflAttemptCount();
    var upcoming = getToeflUpcomingExams();
    var past = getToeflPastExams();

    // ── 예정 시험 카드 (가까운 순) ── 문구·배지는 D-day 단계별로 자동 결정된다.
    // 여러 개 등록 가능하다. (추가 버튼은 섹션 헤더에 항상 있다.)
    var upcomingCards = upcoming.map(function(e, idx) {
        return buildToeflExamCardHtml(e, idx === 0);
    }).join('');

    // ── 지난 시험 카드 ── 시험 직후 성적 요청 → 7일 초과 시 미인증 경고로 바뀐다.
    // 날짜가 지난 시험도 등록한 그대로 보여준다. 안 보이면 학생이 저장 실패로 오해한다.
    var pastCards = past.map(function(e) {
        return buildToeflExamCardHtml(e, false);
    }).join('');

    var cards = upcomingCards + pastCards;

    // 설문 리워드 말풍선: 시험 직후(응시함 창)면 B, 예정 시험이 있으면 A. 카드 위에 붙인다.
    var bubble = '';
    if (toeflInSurveyWindow()) bubble = buildToeflSurveyBubble('B');
    else if (upcoming.length) bubble = buildToeflSurveyBubble('A');
    el.innerHTML = bubble + cards;

    // ── 제목 아래 공지 영역(#toeflExamNotice) ──
    // '응시 예정 없음' 넛지와 등록 마감/기한 지남 안내는 카드가 아니라
    // 제목 바로 아래 공지 영역에 위아래로 쌓아 보여준다.
    var noticeEl = document.getElementById('toeflExamNotice');
    if (!noticeEl) return;

    // '응시 예정 없음' 넛지: 예정·지난 시험이 하나도 없고, 성적은 있을 때만.
    // (성적도 0건인 완전 빈 상태에서는 아래 '등록된 성적이 없습니다'와 겹치므로 넛지를 안 띄운다.)
    var hasScores = (typeof toeflScores !== 'undefined' && toeflScores.length > 0);
    var nudge = '';
    if (!cards && hasScores) {
        nudge =
            '<div class="toefl-noti toefl-noti-info">' +
                '<span class="toefl-noti-icon"><i class="fa-solid fa-calendar-plus"></i></span>' +
                '<div class="toefl-noti-text">' +
                    '<strong>응시 예정인 시험이 없습니다</strong>' +
                    '<span>ETS에서 다음 시험을 접수하셨다면, 일정을 추가해주세요.</span>' +
                '</div>' +
            '</div>';
    }

    noticeEl.innerHTML = nudge + buildToeflRegDeadlineNote(validCount);
}

/**
 * 등록 마감 경고 (최소 2회를 아직 못 채웠을 때만)
 * 2회를 채운 뒤에는 "완료"라고 말하지 않는다. 2회는 최소선이지 목표가 아니다.
 *
 * TOEFL 탭에서는 배너가 숨겨지므로, 카드가 마감 경고를 항상 스스로 보여준다.
 * (다른 탭에서는 배너가 같은 경고를 대신 띄운다 — 서로 다른 화면이라 중복되지 않는다.)
 */
function buildToeflRegDeadlineNote(validCount) {
    if (validCount >= TOEFL_REQUIRED_COUNT) return '';

    var deadline = getToeflRegDeadline();
    if (!deadline) return '';

    var left = toeflDaysUntil(deadline);
    var remain = TOEFL_REQUIRED_COUNT - validCount;

    if (left < 0) {
        // 기간이 지났어도 "지금이라도 등록하라"고 안내 중이므로, 문을 닫지 않는다.
        // '기간 안에 접수' 문구는 지난 학생에겐 자기모순이라 못 쓰고, 실행 가능성을 준다.
        return '<div class="toefl-noti toefl-noti-crit">' +
            '<span class="toefl-noti-icon"><i class="fa-solid fa-triangle-exclamation"></i></span>' +
            '<div class="toefl-noti-text">' +
                '<strong>시험 등록 기한이 지났습니다</strong>' +
                '<span>시험료지원금 <b>21만원 반환 대상</b>이에요.</span>' +
                '<span class="toefl-noti-tip">📌 아직 접수 안 하셨다면 지금이라도 서둘러 등록하세요. 실제 시험 보는 날짜는 챌린지가 끝난 뒤여도 괜찮습니다. 등록 후 카톡으로 메세지 주세요.</span>' +
            '</div>' +
        '</div>';
    }

    return '<div class="toefl-noti toefl-noti-warn">' +
        '<span class="toefl-noti-icon"><i class="fa-solid fa-triangle-exclamation"></i></span>' +
        '<div class="toefl-noti-text">' +
            '<strong>시험 등록 마감 D-' + left + '</strong>' +
            '<span>' + remain + '회 더 등록하셔야 해요. 기한 내 미등록 시 시험료지원금 <b>21만원 반환 대상</b>입니다.</span>' +
            '<span class="toefl-noti-tip">📌 챌린지 기간 안에 시험을 접수(등록)하시면 됩니다. 실제 시험 보는 날은 챌린지가 끝난 뒤여도 괜찮아요.</span>' +
        '</div>' +
    '</div>';
}

// ================================================
// 등록/수정 모달
// ================================================
function openToeflExamModal(examId) {
    toeflEditingExamId = examId || null;

    var titleEl = document.getElementById('toeflExamModalTitle');
    var noticeEl = document.getElementById('toeflExamModalNotice');
    var dateEl = document.getElementById('toeflExamDate');
    var timeEl = document.getElementById('toeflExamTime');
    var imgEl = document.getElementById('toeflExamImage');
    var previewEl = document.getElementById('toeflExamImagePreview');

    if (dateEl) dateEl.value = '';
    if (timeEl) timeEl.value = '';
    if (imgEl) imgEl.value = '';
    if (previewEl) previewEl.style.display = 'none';

    if (toeflEditingExamId) {
        var target = toeflExams.find(function(e) { return e.id === toeflEditingExamId; });
        if (target) {
            var d = new Date(target.exam_datetime);
            if (dateEl) {
                dateEl.value = d.getFullYear() + '-' +
                    String(d.getMonth() + 1).padStart(2, '0') + '-' +
                    String(d.getDate()).padStart(2, '0');
            }
            if (timeEl) {
                timeEl.value = String(d.getHours()).padStart(2, '0') + ':' +
                    String(d.getMinutes()).padStart(2, '0');
            }
        }
        if (titleEl) titleEl.textContent = '시험 일정 수정';
        if (noticeEl) {
            noticeEl.innerHTML = '날짜가 바뀌었으니 <strong>변경된 등록 확인 캡처</strong>를 다시 첨부해주세요.';
        }
    } else {
        if (titleEl) titleEl.textContent = '등록한 시험 추가';
        if (noticeEl) {
            noticeEl.innerHTML = 'ETS에서 등록하신 <strong>시험 일시</strong>와 <strong>등록 확인 캡처</strong>를 올려주세요.';
        }
    }

    var overlay = document.getElementById('toeflExamModalOverlay');
    if (overlay) overlay.classList.add('show');
}

function closeToeflExamModal() {
    var overlay = document.getElementById('toeflExamModalOverlay');
    if (overlay) overlay.classList.remove('show');
    toeflEditingExamId = null;
}

function previewToeflExamImage(input) {
    var preview = document.getElementById('toeflExamImagePreview');
    if (!preview || !input.files || !input.files[0]) {
        if (preview) preview.style.display = 'none';
        return;
    }
    var file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
        alert('이미지 파일 크기는 5MB 이하로 업로드해주세요.');
        input.value = '';
        preview.style.display = 'none';
        return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
        preview.src = e.target.result;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

// ================================================
// 저장
// ================================================
async function submitToeflExam() {
    if (!mpUser || !mpUser.id) { alert('로그인 정보가 없습니다.'); return; }

    var btn = document.getElementById('toeflExamSubmitBtn');
    var date = document.getElementById('toeflExamDate').value;
    var time = document.getElementById('toeflExamTime').value;
    var imageInput = document.getElementById('toeflExamImage');

    if (!date) { alert('시험 날짜를 선택해주세요.'); return; }
    if (!time) { alert('시험 시작 시간을 입력해주세요.'); return; }
    // 신규든 수정이든 등록 확인 캡처는 필수다. 날짜가 바뀌면 증빙도 바뀌어야 한다.
    if (!imageInput.files || !imageInput.files[0]) {
        alert('ETS 등록 확인 캡처를 첨부해주세요.'); return;
    }

    var examDatetime = new Date(date + 'T' + time + ':00');
    if (isNaN(examDatetime.getTime())) { alert('날짜와 시간을 다시 확인해주세요.'); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';

    try {
        var file = imageInput.files[0];
        var ext = file.name.split('.').pop().toLowerCase();
        var fileName = 'exam-reg/' + mpUser.id + '/' + Date.now() + '.' + ext;
        var uploadPath = await supabaseStorageUpload('toefl-score-images', fileName, file);
        if (!uploadPath) {
            alert('이미지 업로드에 실패했습니다.'); resetToeflExamBtn(); return;
        }
        var imageUrl = supabaseStorageUrl('toefl-score-images', uploadPath);

        var ok;
        if (toeflEditingExamId) {
            ok = await supabaseUpdate('toefl_exam_schedules', 'id=eq.' + toeflEditingExamId, {
                exam_datetime: examDatetime.toISOString(),
                registration_image: imageUrl,
                // 일정이 바뀌었으니 알림톡은 새 시각 기준으로 다시 나가야 한다
                alimtalk_sent: false,
                alimtalk_sent_at: null
            });
        } else {
            ok = await supabaseInsert('toefl_exam_schedules', {
                user_id: mpUser.id,
                user_email: mpUser.email,
                user_name: mpUser.name,
                exam_datetime: examDatetime.toISOString(),
                registration_image: imageUrl,
                status: 'scheduled'
            });
        }

        if (!ok) { alert('저장에 실패했습니다.'); resetToeflExamBtn(); return; }

        closeToeflExamModal();
        await loadToeflExams();
        refreshToeflViews();

    } catch (err) {
        console.error('❌ [TOEFL] 시험 일정 저장 실패:', err);
        alert('저장 중 오류가 발생했습니다.');
    } finally {
        resetToeflExamBtn();
    }
}

/** 시험 일정이 바뀌면 카드·성적섹션·상단 배너를 함께 다시 그린다 */
function refreshToeflViews() {
    renderToeflExamCard();
    renderToeflSection();
    if (typeof renderToeflBanner === 'function') renderToeflBanner();
}

function resetToeflExamBtn() {
    var btn = document.getElementById('toeflExamSubmitBtn');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> 저장하기';
    }
}

// ================================================
// 취소 (삭제하지 않는다 -- 등록 증빙은 보존)
// ================================================
async function cancelToeflExam(examId) {
    if (!confirm('이 시험 일정을 취소할까요?\n\n시험을 실제로 취소하셨거나 응시하지 않으신 경우에만 눌러주세요.')) return;
    try {
        var ok = await supabaseUpdate('toefl_exam_schedules', 'id=eq.' + examId, {
            status: 'cancelled'
        });
        if (!ok) { alert('취소에 실패했습니다.'); return; }
        await loadToeflExams();
        refreshToeflViews();
    } catch (err) {
        console.error('❌ [TOEFL] 시험 일정 취소 실패:', err);
        alert('취소 중 오류가 발생했습니다.');
    }
}

// ================================================
// 설문 리워드 말풍선 (컴포즈 아메리카노)
// ================================================
// 예정 시험(D-N) 카드엔 '예고(A)'로 각인, 시험 직후(응시함 창)엔 '지금 참여(B)'.
// 알림톡엔 광고 문구를 못 넣으므로, 마이페이지 말풍선이 광고판 역할을 한다.
// (설문 링크 자체는 알림톡으로 가므로 말풍선엔 버튼 없이 안내만.)

/** 시험 직후 창인가 (당일 응시 후 ~ D+7). 성적 미등록 시험 기준. */
function toeflInSurveyWindow() {
    if (typeof getToeflPastExams !== 'function') return false;
    var past = getToeflPastExams();
    for (var i = 0; i < past.length; i++) {
        var dd = toeflDaysUntil(past[i].exam_datetime);
        if (dd <= 0 && dd >= -7) return true;
    }
    return false;
}

/**
 * 설문 리워드 말풍선 HTML. 예정/직후 시험 카드 위에 붙어 "말하는" 느낌.
 * variant 'B'=시험 직후(콜투액션), 그 외='A'(예고).
 */
function buildToeflSurveyBubble(variant) {
    var title, body;
    if (variant === 'B') {
        title = '시험보느라 고생 많으셨어요! 아아 받아가세요~';
        body = '카톡으로 보내드린 설문(10초) 링크로 참여하고 메가커피 아메리카노(ICE) 받아가세요! (전원제공)';
    } else {
        title = '아이스 아메리카노 꼭! 받아가세요';
        body = '시험을 보고 나면 카톡으로 짧은 설문(10초) 링크를 보내드려요. 메가커피 아메리카노(ICE) 기프티콘을 보내드려요! (전원 제공)';
    }
    return '<div class="toefl-survey-bubble-wrap">' +
        '<div class="toefl-survey-bubble">' +
            '<span class="toefl-survey-bubble-icon">☕</span>' +
            '<div class="toefl-survey-bubble-text">' +
                '<strong>' + title + '</strong>' +
                '<span>' + body + '</span>' +
            '</div>' +
        '</div>' +
    '</div>';
}

console.log('✅ toefl-exam.js 로드 완료');
