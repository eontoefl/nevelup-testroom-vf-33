/**
 * ================================================
 * correction-indspk.js
 * 호주첨삭 IND SPK (독립형 스피킹) 제출 화면
 * ================================================
 *
 * 정규 호주과정의 ind-spk-component.js를 첨삭용으로 복사한 것.
 * 정규 컴포넌트를 직접 재사용하지 않는 이유:
 *   - 정규는 답안을 aus_study_results에 저장하고 정규 진도(잔디)를 채운다
 *   - 정규는 끝나면 호주 과제선택 화면으로 돌아간다
 *   - 정규는 마감/코호트 게이트에 묶여 있다
 * 첨삭은 correction_submissions에 저장하고 첨삭 세션 화면으로 돌아가야 한다.
 *
 * DOM ID 접두사: corrIds (정규 ind-spk의 ids* 와 충돌 방지)
 *
 * 플로우:
 *   1차 — 인트로 → 주제+음성 → 준비 15초 → 답변 45초 → 녹음파일 업로드 → 제출
 *   2차 — 카운트다운 없이 주제/음성 자유 재생 + 1차 피드백 보며 재녹음 업로드
 */

var CORR_IDS_AUDIO = {
    introNarration: 'https://eontoefl.github.io/toefl-audio/australia/audio/intro_audio/indspk_brainstorm_intro.mp3',
    prepareBeep: 'https://eontoefl.github.io/toefl-audio/australia/audio/fixed_audio/prepare_beep.mp3',
    speakBeep: 'https://eontoefl.github.io/toefl-audio/australia/audio/fixed_audio/begin_beep.mp3'
};

var CORR_IDS_PREP_SEC = 15;
var CORR_IDS_SPEAK_SEC = 45;

var CORR_IDS_ALLOWED_EXT = ['mp3', 'm4a', 'wav', 'webm', 'ogg', 'aac', 'mp4'];
var CORR_IDS_MAX_SIZE = 25 * 1024 * 1024;   // 25MB

window._correctionIndSpkState = null;

// ============================================================
// 1. 데이터 로더 — aus_indspk에서 id로 직접 조회
// ============================================================
// 정규과정은 "몇 번째 줄"(items[N-1])로 문항을 찾는다.
// 첨삭은 2000번대 id로 직접 찾는다 — 그래야 문항을 추가해도 정규가 안 밀린다.

var _cachedCorrIndSpkData = null;

async function _loadCorrectionIndSpkSet(setNumber) {
    if (!_cachedCorrIndSpkData) {
        var rows = await supabaseSelect('aus_indspk', 'select=*&order=id.asc');
        if (!rows || rows.length === 0) {
            console.error('❌ [Correction IndSpk] 데이터 없음');
            return null;
        }
        _cachedCorrIndSpkData = rows.map(function(row) {
            return {
                setId: Number(row.id),
                text: row.topic_text || '',
                audioUrl: row.topic_audio_url || ''
            };
        });
        console.log('✅ [Correction IndSpk] ' + _cachedCorrIndSpkData.length + '세트 로드');
    }

    var found = _cachedCorrIndSpkData.find(function(s) { return s.setId === Number(setNumber); });
    if (!found) {
        console.error('❌ [Correction IndSpk] 세트 없음: id=' + setNumber);
        return null;
    }
    return found;
}

// ============================================================
// 2. 진입점
// ============================================================

async function startCorrectionIndSpk(session, scheduleData, submission) {
    console.log('\n🎙️ [Correction IndSpk] 시작 — Session', session.session);

    var meta = getCorrTaskMeta(session, 'speaking');
    var isDraft2 = !!(submission && submission.status === 'feedback1_ready' && submission.released_1);

    // 2차인데 feedback_1이 없으면 단일 행 재조회 (목록 조회는 feedback JSONB 미포함)
    if (isDraft2 && submission && !submission.feedback_1) {
        var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
        if (u && u.id) {
            var fullSub = await getCorrectionSubmission(u.id, session.session, meta.taskType);
            if (fullSub) submission = fullSub;
        }
    }

    window._correctionIndSpkState = {
        session: session,
        scheduleData: scheduleData,
        submission: submission,
        taskType: meta.taskType,
        taskLabel: meta.label,
        setNumber: meta.number,
        setData: null,
        isDraft2: isDraft2,
        audioPlayer: new AudioPlayer(),
        timer: null,
        selectedFile: null,
        _destroyed: false
    };

    var state = window._correctionIndSpkState;

    // 헤더
    var titleEl = document.getElementById('corrIdsTitle');
    if (titleEl) {
        titleEl.textContent = '첨삭 세션 ' + String(session.session).padStart(2, '0') +
            ' · ' + meta.label + (isDraft2 ? ' (2차 녹음)' : '');
    }

    showScreen('correctionIndSpkScreen');

    var setData = await _loadCorrectionIndSpkSet(meta.number);
    if (!setData) {
        alert('문제를 불러올 수 없습니다.');
        backFromCorrectionIndSpk();
        return;
    }
    state.setData = setData;

    if (isDraft2) {
        _showCorrIdsDraft2();
    } else {
        _showCorrIdsIntro();
    }
}

// ============================================================
// 3. 1차 — 인트로
// ============================================================

function _showCorrIdsIntro() {
    var state = window._correctionIndSpkState;
    if (!state || state._destroyed) return;

    var container = document.getElementById('corrIdsContent');
    container.innerHTML =
        '<div class="ids-intro-screen">' +
            '<div class="ids-intro-card">' +
                '<div class="ids-intro-icon"><i class="fas fa-microphone"></i></div>' +
                '<h1 class="ids-intro-title">Independent Speaking</h1>' +
                '<div class="ids-intro-type-badge">Task 1</div>' +
                '<div class="ids-intro-text">' +
                    '<p>In this question, you will be asked to talk about a familiar topic.</p>' +
                    '<p>After you hear the question, you will have <strong>15 seconds</strong> to prepare your response, and <strong>45 seconds</strong> to speak.</p>' +
                '</div>' +
                _corrRecordNoticeHtml() +
            '</div>' +
        '</div>';

    var continueBtn = document.getElementById('corrIdsContinueBtn');
    if (continueBtn) {
        continueBtn.style.display = 'inline-block';
        continueBtn.disabled = false;
        continueBtn.style.opacity = '1';
        continueBtn.style.cursor = 'pointer';
        continueBtn.onclick = function() { _showCorrIdsTopic(); };
    }

    state.audioPlayer.play(CORR_IDS_AUDIO.introNarration, function() {});
}

// ============================================================
// 4. 1차 — 주제 화면 → 준비 15초 → 답변 45초
// ============================================================

function _showCorrIdsTopic() {
    var state = window._correctionIndSpkState;
    if (!state || state._destroyed) return;

    state.audioPlayer.stop();

    var continueBtn = document.getElementById('corrIdsContinueBtn');
    if (continueBtn) continueBtn.style.display = 'none';

    var container = document.getElementById('corrIdsContent');
    container.innerHTML =
        '<div class="ids-topic-wrap">' +
            '<div class="ids-topic-text">' + _corrIdsEscape(state.setData.text) + '</div>' +
            '<div class="ids-timer-section" id="corrIdsTimerSection" style="display:none;">' +
                '<div class="ids-timer-display">' +
                    '<div class="ids-timer-phase-label" id="corrIdsPhaseLabel">PREPARATION TIME</div>' +
                    '<div class="ids-timer-content">' +
                        '<div class="ids-timer-wrapper">' +
                            '<div class="ids-progress-circle">' +
                                '<svg width="50" height="50" viewBox="0 0 50 50">' +
                                    '<circle class="ids-progress-circle-bg" cx="25" cy="25" r="20"></circle>' +
                                    '<circle id="corrIdsProgressCircle" class="ids-progress-circle-fill" cx="25" cy="25" r="20" stroke-dasharray="125.6" stroke-dashoffset="125.6"></circle>' +
                                '</svg>' +
                                '<svg class="ids-mic-icon" fill="currentColor" viewBox="0 0 20 20">' +
                                    '<path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"/>' +
                                '</svg>' +
                            '</div>' +
                            '<span id="corrIdsCountdown" class="ids-timer-text">00:15</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

    var url = state.setData.audioUrl;
    if (!url) {
        console.warn('[Correction IndSpk] 토픽 음성 없음 — 2초 후 준비 단계');
        setTimeout(function() {
            if (!state._destroyed) _startCorrIdsPrepare();
        }, 2000);
        return;
    }

    state.audioPlayer.play(url, function() {
        if (!state._destroyed) _startCorrIdsPrepare();
    });
}

function _startCorrIdsPrepare() {
    var state = window._correctionIndSpkState;
    if (!state || state._destroyed) return;

    var section = document.getElementById('corrIdsTimerSection');
    if (section) section.style.display = 'block';
    _corrIdsSetText('corrIdsPhaseLabel', 'PREPARATION TIME');
    _corrIdsSetText('corrIdsCountdown', '00:15');

    state.audioPlayer.play(CORR_IDS_AUDIO.prepareBeep, function() {
        if (state._destroyed) return;
        _runCorrIdsCountdown(CORR_IDS_PREP_SEC, _startCorrIdsSpeak);
    });
}

function _startCorrIdsSpeak() {
    var state = window._correctionIndSpkState;
    if (!state || state._destroyed) return;

    _corrIdsSetText('corrIdsPhaseLabel', 'RESPONSE TIME');
    _corrIdsSetText('corrIdsCountdown', '00:45');

    var circle = document.getElementById('corrIdsProgressCircle');
    if (circle) circle.style.strokeDashoffset = '125.6';

    state.audioPlayer.play(CORR_IDS_AUDIO.speakBeep, function() {
        if (state._destroyed) return;
        _runCorrIdsCountdown(CORR_IDS_SPEAK_SEC, _showCorrIdsUpload);
    });
}

function _runCorrIdsCountdown(seconds, onDone) {
    var state = window._correctionIndSpkState;
    if (!state || state._destroyed) return;

    var timeLeft = seconds;
    var total = seconds;
    var countdownEl = document.getElementById('corrIdsCountdown');
    var circle = document.getElementById('corrIdsProgressCircle');
    var circumference = 2 * Math.PI * 20;

    if (countdownEl) countdownEl.textContent = _corrIdsFormatTime(timeLeft);
    if (circle) {
        circle.style.strokeDasharray = circumference;
        circle.style.strokeDashoffset = circumference;
    }

    state.timer = setInterval(function() {
        timeLeft--;
        if (countdownEl) countdownEl.textContent = _corrIdsFormatTime(timeLeft);
        if (circle) {
            var elapsed = total - timeLeft;
            circle.style.strokeDashoffset = circumference - (elapsed / total) * circumference;
        }
        if (timeLeft <= 0) {
            clearInterval(state.timer);
            state.timer = null;
            if (onDone) onDone();
        }
    }, 1000);
}

// ============================================================
// 5. 녹음 파일 업로드 화면 (1차)
// ============================================================

function _showCorrIdsUpload() {
    var state = window._correctionIndSpkState;
    if (!state || state._destroyed) return;
    state.selectedFile = null;

    var container = document.getElementById('corrIdsContent');
    container.innerHTML =
        '<div class="corr-ids-upload-wrap">' +
            '<div class="corr-ids-upload-icon">🎙️</div>' +
            '<h2 class="corr-ids-upload-title">녹음 파일 업로드</h2>' +
            '<p class="corr-ids-upload-desc">방금 말한 답변 녹음 파일을 올려주세요.<br>제출하면 첨삭이 시작됩니다.</p>' +
            '<div class="corr-ids-topic-recap">' + _corrIdsEscape(state.setData.text) + '</div>' +
            _corrIdsFilePickerHtml() +
            '<button class="corr-ids-submit-btn" id="corrIdsSubmitBtn">제출</button>' +
        '</div>';

    _bindCorrIdsFilePicker();
}

/** 파일 선택 UI (1차·2차 공용) */
function _corrIdsFilePickerHtml() {
    return '' +
        '<input type="file" accept="audio/*" id="corrIdsFileInput" style="display:none;">' +
        '<button class="corr-ids-pick-btn" id="corrIdsPickBtn">📁 파일 선택</button>' +
        '<div class="corr-ids-file-name" id="corrIdsFileName" style="display:none;"></div>';
}

function _bindCorrIdsFilePicker() {
    var state = window._correctionIndSpkState;
    var input = document.getElementById('corrIdsFileInput');
    var pickBtn = document.getElementById('corrIdsPickBtn');
    var nameEl = document.getElementById('corrIdsFileName');
    var submitBtn = document.getElementById('corrIdsSubmitBtn');
    if (!input || !pickBtn || !submitBtn) return;

    pickBtn.onclick = function() { input.click(); };
    input.onchange = function() {
        if (!input.files || !input.files[0]) return;
        var file = input.files[0];

        var rawExt = file.name.indexOf('.') >= 0 ? file.name.split('.').pop().toLowerCase() : '';
        if (CORR_IDS_ALLOWED_EXT.indexOf(rawExt) < 0) {
            alert('오디오 파일만 올릴 수 있습니다. (' + CORR_IDS_ALLOWED_EXT.join(', ') + ')');
            input.value = '';
            return;
        }
        if (file.size > CORR_IDS_MAX_SIZE) {
            alert('파일이 너무 큽니다. 25MB 이하로 올려주세요.');
            input.value = '';
            return;
        }

        state.selectedFile = file;
        nameEl.textContent = '📎 ' + file.name;
        nameEl.style.display = 'block';
        pickBtn.textContent = '📁 다른 파일 선택';
    };

    submitBtn.onclick = function() { _corrIdsTrySubmit(); };
}

// ============================================================
// 6. 2차 — 카운트다운 없이 주제/음성 자유 재생 + 1차 피드백
// ============================================================

function _showCorrIdsDraft2() {
    var state = window._correctionIndSpkState;
    if (!state || state._destroyed) return;
    state.selectedFile = null;

    var continueBtn = document.getElementById('corrIdsContinueBtn');
    if (continueBtn) continueBtn.style.display = 'none';

    var sub = state.submission;
    var fb = _corrIdsParseFeedback(sub && sub.feedback_1);
    var feedbackHtml = corrFeedbackSlotHtml();

    // 1차 녹음 다시 듣기
    var d1Path = sub && sub.draft_1_audio_q1;
    var d1Html = '';
    if (d1Path) {
        var d1Url = (d1Path.indexOf('http') === 0) ? d1Path : supabaseStorageUrl('correction-audio', d1Path);
        d1Html = '<div class="corr-ids-d2-myaudio">' +
            '<span class="corr-ids-d2-myaudio-label">내 1차 녹음</span>' +
            '<audio controls preload="none" src="' + d1Url + '"></audio>' +
        '</div>';
    }

    var audioBtn = state.setData.audioUrl
        ? '<button class="corr-ids-replay-btn" id="corrIdsReplayBtn"><i class="fas fa-volume-up"></i> 문제 음성 다시 듣기</button>'
        : '';

    var container = document.getElementById('corrIdsContent');
    container.innerHTML =
        '<div class="corr-ids-d2-wrap">' +
            '<div class="corr-ids-d2-left">' +
                '<div class="corr-ids-d2-section-title">문제</div>' +
                '<div class="ids-topic-text">' + _corrIdsEscape(state.setData.text) + '</div>' +
                audioBtn +
                d1Html +
                '<div class="corr-ids-d2-section-title" style="margin-top:22px;">다시 녹음해서 올리기</div>' +
                '<p class="corr-ids-upload-desc" style="text-align:left;margin:0 0 14px;">시간 제한 없이 다시 녹음한 뒤 파일을 올려주세요.</p>' +
                _corrIdsFilePickerHtml() +
                '<button class="corr-ids-submit-btn" id="corrIdsSubmitBtn">2차 제출</button>' +
            '</div>' +
            '<div class="corr-ids-d2-right">' +
                '<div class="corr-ids-d2-section-title">1차 첨삭</div>' +
                feedbackHtml +
            '</div>' +
        '</div>';

    corrFillFeedbackSlot(container, fb, 'speaking');
    _bindCorrIdsFilePicker();

    var replayBtn = document.getElementById('corrIdsReplayBtn');
    if (replayBtn) {
        replayBtn.onclick = function() {
            state.audioPlayer.stop();
            state.audioPlayer.play(state.setData.audioUrl, function() {});
        };
    }
}

/** feedback JSONB — 문자열로 이중 직렬화된 경우 방어 */
function _corrIdsParseFeedback(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch (e) { return null; }
    }
    return raw;
}

// ============================================================
// 7. 제출
// ============================================================

function _corrIdsTrySubmit() {
    var state = window._correctionIndSpkState;
    if (!state) return;

    if (!state.selectedFile) {
        alert('녹음 파일을 올려주세요.');
        return;
    }
    if (!confirm('이 파일로 제출할까요?\n제출 후에는 수정할 수 없습니다.')) return;

    _corrIdsDoSubmit();
}

async function _corrIdsDoSubmit() {
    var state = window._correctionIndSpkState;
    if (!state || state._destroyed) return;

    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    if (!user || !user.id) {
        alert('로그인 정보를 확인할 수 없습니다.');
        return;
    }

    var overlay = document.getElementById('submitLoadingOverlay');
    if (overlay) overlay.style.display = 'flex';

    try {
        var file = state.selectedFile;
        var rawExt = file.name.indexOf('.') >= 0 ? file.name.split('.').pop().toLowerCase() : 'mp3';
        var draftNo = state.isDraft2 ? 2 : 1;

        // 호주 스피킹은 답변이 1개 → q1 칸만 사용
        var storagePath = user.id + '/' + state.taskType + '_' + state.setNumber +
            '_draft' + draftNo + '_q1.' + rawExt;

        var uploaded = await supabaseStorageUpload('correction-audio', storagePath, file);
        if (!uploaded) throw new Error('파일 업로드 실패');

        var saved;
        if (state.isDraft2) {
            saved = await updateCorrectionSubmission(state.submission.id, {
                draft_2_audio_q1: uploaded,
                status: 'draft2_submitted',
                draft_2_submitted_at: new Date().toISOString()
            });
        } else {
            saved = await insertCorrectionSubmission({
                user_id: user.id,
                session_number: state.session.session,
                task_type: state.taskType,
                task_number: state.setNumber,
                draft_1_audio_q1: uploaded,
                status: 'draft1_submitted',
                draft_1_submitted_at: new Date().toISOString()
            });
        }

        // supabaseRequest()는 실패해도 throw하지 않고 null을 반환한다.
        // 확인하지 않으면 저장이 거부돼도 "제출되었습니다"가 뜬다.
        if (!saved) throw new Error('저장 결과가 비어 있음 (DB 거부)');

        // n8n 전송 — 아직 개통 안 된 유형이면 getCorrWebhookUrl()이 null을 돌려줘
        // 보내지 않고 넘어간다 (제출은 저장됨 → 첨삭은 소급 처리)
        if (typeof _sendCorrectionWebhook === 'function') {
            _sendCorrectionWebhook(state.isDraft2, {
                event: state.isDraft2 ? 'draft2_submitted' : 'draft1_submitted',
                user_id: user.id,
                user_name: user.name,
                user_email: user.email,
                session_number: state.session.session,
                session_start_date: getCorrSessionStartDate(state.scheduleData, state.session),
                task_type: state.taskType,
                task_number: state.setNumber,
                submitted_at: new Date().toISOString()
            });
        }

        if (overlay) overlay.style.display = 'none';
        alert(state.isDraft2 ? '2차 녹음이 제출되었습니다.' : '녹음이 제출되었습니다.');

        cleanupCorrectionIndSpk();
        _returnToCorrIdsSession();

    } catch (err) {
        console.error('❌ [Correction IndSpk] 제출 실패:', err);
        if (overlay) overlay.style.display = 'none';
        alert('제출에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');
    }
}

/** 제출 후 세션 상세로 복귀 (제출 상태 다시 읽어서 카드 갱신) */
async function _returnToCorrIdsSession() {
    var sessionState = window._correctionSessionState;
    if (!sessionState) {
        showScreen('scheduleScreen');
        return;
    }

    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    var submissionMap = sessionState.submissionMap || {};

    if (user && user.id) {
        try {
            var submissions = await getCorrectionSubmissions(user.id);
            submissionMap = {};
            submissions.forEach(function(sub) {
                submissionMap[sub.session_number + '_' + sub.task_type] = sub;
                var category = sub.task_type.indexOf('writing') === 0 ? 'writing' : 'speaking';
                submissionMap[sub.session_number + '_' + category] = sub;
            });
        } catch (e) {
            console.warn('⚠️ [Correction IndSpk] 제출 내역 재조회 실패:', e);
        }
    }

    openCorrectionSession(
        sessionState.session,
        sessionState.scheduleData,
        submissionMap,
        sessionState.extensionMap
    );
}

// ============================================================
// 8. 뒤로가기 / 정리
// ============================================================

function backFromCorrectionIndSpk() {
    if (!confirm('나가면 진행 중인 답변이 저장되지 않습니다. 나가시겠습니까?')) return;
    cleanupCorrectionIndSpk();
    _returnToCorrIdsSession();
}

function cleanupCorrectionIndSpk() {
    var state = window._correctionIndSpkState;
    if (!state) return;

    state._destroyed = true;
    if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }
    if (state.audioPlayer) {
        state.audioPlayer.stop();
        state.audioPlayer.destroy();
    }
    window._correctionIndSpkState = null;
    console.log('[Correction IndSpk] cleanup 완료');
}

// ============================================================
// 9. 유틸
// ============================================================

function _corrIdsFormatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
}

function _corrIdsEscape(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function _corrIdsSetText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
}

window.startCorrectionIndSpk = startCorrectionIndSpk;
window.backFromCorrectionIndSpk = backFromCorrectionIndSpk;
window.cleanupCorrectionIndSpk = cleanupCorrectionIndSpk;
window._loadCorrectionIndSpkSet = _loadCorrectionIndSpkSet;

console.log('✅ correction-indspk.js 로드 완료');
