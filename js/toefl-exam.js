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
// 렌더링 -- 시험 일정 카드 (행동 유도 영역)
// ================================================
function renderToeflExamCard() {
    var el = document.getElementById('toeflExamCard');
    if (!el) return;

    var next = getToeflNextExam();
    var validCount = getToeflAttemptCount();

    var upcoming = getToeflUpcomingExams();

    // ── 응시 예정 시험이 있는 경우 ──
    // 여러 개 등록 가능하다. 예정 시험을 모두 보여주고, 아래에 "하나 더 등록" 버튼을 둔다.
    if (upcoming.length) {
        var cards = upcoming.map(function(e, idx) {
            var dday = toeflDaysUntil(e.exam_datetime);
            var ddayLabel = dday > 0 ? 'D-' + dday : (dday === 0 ? 'D-DAY' : '');
            // 알림톡 안내는 시험 당일에 알림톡으로 가므로 여기선 동기부여만.
            var sub = idx === 0
                ? '그동안 쌓은 실력을 확인하는 날이에요. 긴장 말고 평소처럼 보고 오세요! 💪'
                : '이 흐름 그대로 이어가 보세요!';
            return '<div class="toefl-exam-card toefl-exam-card-upcoming">' +
                '<div class="toefl-exam-card-main">' +
                    '<span class="toefl-exam-dday">' + ddayLabel + '</span>' +
                    '<div class="toefl-exam-info">' +
                        '<strong>' + (idx === 0 ? '다음 시험 ' : '') + formatToeflExamDate(e.exam_datetime) + '</strong>' +
                        '<span>' + sub + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="toefl-exam-card-actions">' +
                    '<button class="toefl-exam-btn-ghost" onclick="openToeflExamModal(\'' + e.id + '\')">수정</button>' +
                    '<button class="toefl-exam-btn-ghost" onclick="cancelToeflExam(\'' + e.id + '\')">취소</button>' +
                '</div>' +
            '</div>';
        }).join('');

        // 시험 추가 버튼은 섹션 헤더에 항상 있으므로 여기엔 두지 않는다.
        el.innerHTML = cards + buildToeflRegDeadlineNote(validCount);
        return;
    }

    // ── 예정 시험이 없는 경우 ──
    // 완전 빈 상태(성적도 0건)에서는 "응시 예정 없음" 카드를 아예 그리지 않는다.
    // 바로 아래 성적 빈 상태의 "등록된 성적이 없습니다"와 의미가 겹치기 때문.
    // 여기선 마감 경고만 남기고, 빈 메시지와 CTA는 성적 빈 상태가 가져간다.
    var hasScores = (typeof toeflScores !== 'undefined' && toeflScores.length > 0);
    if (!hasScores) {
        el.innerHTML = buildToeflRegDeadlineNote(validCount);
        return;
    }

    // 성적은 있는데 예정 시험이 없는 경우: 다음 시험을 잡도록 넛지하는 상태 카드만 둔다.
    // (추가 버튼은 섹션 헤더에 있다.)
    el.innerHTML =
        '<div class="toefl-exam-card">' +
            '<div class="toefl-exam-card-main">' +
                '<div class="toefl-exam-info">' +
                    '<strong>응시 예정인 시험이 없습니다</strong>' +
                    '<span>다음 시험을 접수하셨다면, 위 [등록한 시험 추가하기]로 일정을 넣어주세요.</span>' +
                '</div>' +
            '</div>' +
        '</div>' +
        buildToeflRegDeadlineNote(validCount);
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
        return '<div class="toefl-alert toefl-alert-danger">' +
            '<i class="fa-solid fa-triangle-exclamation"></i>' +
            '<span>시험 등록 기한이 지났습니다. 시험료지원금 21만원 반환 대상이에요. 카톡으로 상담 주세요.</span>' +
        '</div>';
    }

    return '<div class="toefl-alert toefl-alert-warning">' +
        '<i class="fa-solid fa-triangle-exclamation"></i>' +
        '<span><strong>시험 등록 마감 D-' + left + '</strong> — ' + remain + '회 더 등록하셔야 해요.<br>' +
        '기한 내 미등록 시 시험료지원금 <strong>21만원 반환 대상</strong>입니다. 미룰수록 점수 올릴 기회가 줄어들어요.' +
        '<span class="toefl-alert-tip">📌 챌린지 기간 안에 <strong>시험을 접수(등록)</strong>하시면 됩니다. 실제 시험 보는 날은 챌린지가 끝난 뒤여도 괜찮아요.</span></span>' +
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

console.log('✅ toefl-exam.js 로드 완료');
