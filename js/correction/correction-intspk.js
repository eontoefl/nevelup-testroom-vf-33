/**
 * ================================================
 * correction-intspk.js
 * 호주첨삭 INT SPK 2·3·4 (통합형 스피킹) 제출 화면
 * ================================================
 *
 * 정규 호주과정의 intspk-component.js를 첨삭용으로 복사한 것.
 * 세 유형(2/3/4)이 흐름만 다르고 구조가 같아 한 파일에서 처리한다.
 *
 *   Task 2 — 캠퍼스 상황 지문(45초) → 대화 → 문제 → 준비 30초 → 답변 60초
 *   Task 3 — 학술 지문(45초)        → 강의 → 문제 → 준비 30초 → 답변 60초
 *   Task 4 — 지문 없음               → 강의 → 문제 → 준비 20초 → 답변 60초
 *
 * 정규 컴포넌트를 직접 쓰지 않는 이유는 correction-indspk.js와 동일
 * (정규 진도/저장소/복귀 화면에 묶여 있음).
 *
 * DOM ID 접두사: corrIs (정규 intspk의 is* 와 충돌 방지)
 */

var CORR_IS_AUDIO = {
    2: 'https://eontoefl.github.io/toefl-audio/australia/audio/intro_audio/intspk2_intro.mp3',
    3: 'https://eontoefl.github.io/toefl-audio/australia/audio/intro_audio/intspk3_intro.mp3',
    4: 'https://eontoefl.github.io/toefl-audio/australia/audio/intro_audio/intspk4_intro.mp3',
    prepareBeep: 'https://eontoefl.github.io/toefl-audio/australia/audio/fixed_audio/prepare_beep.mp3',
    speakBeep: 'https://eontoefl.github.io/toefl-audio/australia/audio/fixed_audio/begin_beep.mp3'
};

var CORR_IS_INTRO_TEXT = {
    2: 'In this question, you will read a short passage about a campus situation and then listen to a talk on the same topic. You will then answer a question using information from both the reading passage and the talk. After the question, you will have <strong>30 seconds</strong> to prepare your response and <strong>60 seconds</strong> to speak.',
    3: 'In this question, you will read a short passage on an academic subject and then listen to a talk on the same topic. You will then answer a question using information from both the reading passage and the talk. After the question, you will have <strong>30 seconds</strong> to prepare your response and <strong>60 seconds</strong> to speak.',
    4: 'In this question, you will listen to a short lecture. You will then be asked to summarize important information from the lecture. After you hear the question, you will have <strong>20 seconds</strong> to prepare your response and <strong>60 seconds</strong> to speak.'
};

var CORR_IS_CONFIG = {
    2: { prepTime: 30, speakTime: 60, readingTime: 45, hasReading: true },
    3: { prepTime: 30, speakTime: 60, readingTime: 45, hasReading: true },
    4: { prepTime: 20, speakTime: 60, readingTime: 0,  hasReading: false }
};

var CORR_IS_ALLOWED_EXT = ['mp3', 'm4a', 'wav', 'webm', 'ogg', 'aac', 'mp4'];
var CORR_IS_MAX_SIZE = 25 * 1024 * 1024;

window._correctionIntSpkState = null;

// ============================================================
// 1. 데이터 로더 — aus_intspk에서 id로 직접 조회
// ============================================================
// 정규과정은 "몇 번째 줄"로 문항을 찾지만, 첨삭은 2000번대 id로 직접 찾는다.

var _cachedCorrIntSpkData = null;

async function _loadCorrectionIntSpkSet(setNumber) {
    if (!_cachedCorrIntSpkData) {
        var rows = await supabaseSelect('aus_intspk', 'select=*&order=id.asc');
        if (!rows || rows.length === 0) {
            console.error('❌ [Correction IntSpk] 데이터 없음');
            return null;
        }
        _cachedCorrIntSpkData = rows.map(function(row) {
            return {
                setId: Number(row.id),
                type: Number(row.type),
                title: row.title || '',
                passage: row.passage || '',
                readingAudioUrl: row.reading_audio_url || '',
                dialogAudioUrl: row.dialog_audio_url || '',
                dialogImageUrl: row.dialog_image_url || '',
                problemText: row.problem_text || '',
                problemAudioUrl: row.problem_audio_url || ''
            };
        });
        console.log('✅ [Correction IntSpk] ' + _cachedCorrIntSpkData.length + '세트 로드');
    }

    var found = _cachedCorrIntSpkData.find(function(s) { return s.setId === Number(setNumber); });
    if (!found) {
        console.error('❌ [Correction IntSpk] 세트 없음: id=' + setNumber);
        return null;
    }
    return found;
}

// ============================================================
// 2. 진입점
// ============================================================

async function startCorrectionIntSpk(session, scheduleData, submission) {
    console.log('\n🎙️ [Correction IntSpk] 시작 — Session', session.session);

    var meta = getCorrTaskMeta(session, 'speaking');
    var isDraft2 = !!(submission && submission.status === 'feedback1_ready' && submission.released_1);

    if (isDraft2 && submission && !submission.feedback_1) {
        var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
        if (u && u.id) {
            var fullSub = await getCorrectionSubmission(u.id, session.session, meta.taskType);
            if (fullSub) submission = fullSub;
        }
    }

    window._correctionIntSpkState = {
        session: session,
        scheduleData: scheduleData,
        submission: submission,
        taskType: meta.taskType,
        taskLabel: meta.label,
        setNumber: meta.number,
        item: null,
        isDraft2: isDraft2,
        audioPlayer: new AudioPlayer(),
        timer: null,
        selectedFile: null,
        _destroyed: false
    };

    var state = window._correctionIntSpkState;

    var titleEl = document.getElementById('corrIsTitle');
    if (titleEl) {
        titleEl.textContent = '첨삭 세션 ' + String(session.session).padStart(2, '0') +
            ' · ' + meta.label + (isDraft2 ? ' (2차 녹음)' : '');
    }

    showScreen('correctionIntSpkScreen');
    _corrIsShowLoading();

    var item = await _loadCorrectionIntSpkSet(meta.number);
    if (!item) {
        alert('문제를 불러올 수 없습니다.');
        backFromCorrectionIntSpk(true);
        return;
    }

    // 스케줄이 기대하는 유형과 문항의 실제 type이 다르면 잘못된 문항이다.
    // (예: 세션 3은 INT SPK 3인데 문항 type이 2로 들어간 경우)
    var expectedType = _corrIsExpectedType(meta.type);
    if (expectedType && item.type !== expectedType) {
        console.error('❌ [Correction IntSpk] 유형 불일치 — 기대:', expectedType, '실제:', item.type);
        alert('문항 설정에 문제가 있습니다. 담당자에게 문의해주세요.');
        backFromCorrectionIntSpk(true);
        return;
    }

    state.item = item;

    if (isDraft2) {
        _showCorrIsDraft2();
    } else {
        _showCorrIsIntro();
    }
}

/** 스케줄 유형 키('aus_intspk2') → 기대하는 문항 type 번호(2) */
function _corrIsExpectedType(typeKey) {
    var m = String(typeKey || '').match(/(\d)$/);
    return m ? Number(m[1]) : null;
}

function _corrIsShowLoading() {
    var container = document.getElementById('corrIsContent');
    if (container) {
        container.innerHTML =
            '<div class="is-intro-screen">' +
                '<div class="is-intro-card" style="padding:60px 50px;">' +
                    '<p style="color:#3e484f;font-size:16px;">데이터 로딩 중...</p>' +
                '</div>' +
            '</div>';
    }
}

// ============================================================
// 3. 1차 — 인트로
// ============================================================

function _showCorrIsIntro() {
    var state = window._correctionIntSpkState;
    if (!state || state._destroyed) return;

    var type = state.item.type;

    var container = document.getElementById('corrIsContent');
    container.innerHTML =
        '<div class="is-intro-screen">' +
            '<div class="is-intro-card">' +
                '<div class="is-intro-icon"><i class="fas fa-microphone"></i></div>' +
                '<h1 class="is-intro-title">Integrated Speaking</h1>' +
                '<div class="is-intro-type-badge">Task ' + type + '</div>' +
                '<div class="is-intro-text"><p>' + (CORR_IS_INTRO_TEXT[type] || '') + '</p></div>' +
                '<div class="is-intro-note">답변은 별도 기기로 녹음한 뒤, 마지막에 파일로 올려주세요.</div>' +
            '</div>' +
        '</div>';

    var continueBtn = document.getElementById('corrIsContinueBtn');
    if (continueBtn) {
        continueBtn.style.display = 'inline-block';
        continueBtn.disabled = false;
        continueBtn.style.opacity = '1';
        continueBtn.style.cursor = 'pointer';
        continueBtn.onclick = function() { _startCorrIsContentPhase(); };
    }

    state.audioPlayer.play(CORR_IS_AUDIO[type], function() {});
}

// ============================================================
// 4. 1차 — 지문(Task 2·3) → 대화/강의 → 문제 → 준비 → 답변
// ============================================================

function _startCorrIsContentPhase() {
    var state = window._correctionIntSpkState;
    if (!state || state._destroyed) return;

    state.audioPlayer.stop();

    var continueBtn = document.getElementById('corrIsContinueBtn');
    if (continueBtn) continueBtn.style.display = 'none';

    var config = CORR_IS_CONFIG[state.item.type];
    if (config.hasReading) {
        _showCorrIsReading();
    } else {
        _showCorrIsDialog();
    }
}

/** 지문 화면 — 읽어주는 음성이 끝난 뒤에 지문이 선명해지고 45초 카운트다운 시작 */
function _showCorrIsReading() {
    var state = window._correctionIntSpkState;
    if (!state || state._destroyed) return;

    var item = state.item;
    var config = CORR_IS_CONFIG[item.type];

    var container = document.getElementById('corrIsContent');
    container.innerHTML =
        '<div class="is-reading-wrap">' +
            '<div class="is-reading-header">' +
                '<span class="is-reading-label"></span>' +
                '<span class="is-reading-timer" id="corrIsReadingTimer">' + _corrIsFormatTime(config.readingTime) + '</span>' +
            '</div>' +
            '<div class="is-reading-body" id="corrIsReadingBody" style="opacity:0.4;">' +
                '<h2 class="is-reading-title">' + _corrIsEscape(item.title) + '</h2>' +
                '<div class="is-reading-passage">' + _corrIsEscape(item.passage) + '</div>' +
            '</div>' +
        '</div>';

    function startReading() {
        var body = document.getElementById('corrIsReadingBody');
        if (body) body.style.opacity = '1';
        _runCorrIsReadingCountdown(config.readingTime, function() {
            _showCorrIsSpinner(_showCorrIsDialog);
        });
    }

    if (item.readingAudioUrl) {
        state.audioPlayer.play(item.readingAudioUrl, function() {
            if (state._destroyed) return;
            startReading();
        });
    } else {
        startReading();
    }
}

function _runCorrIsReadingCountdown(seconds, onDone) {
    var state = window._correctionIntSpkState;
    if (!state || state._destroyed) return;

    var timeLeft = seconds;
    var timerEl = document.getElementById('corrIsReadingTimer');
    if (timerEl) timerEl.textContent = _corrIsFormatTime(timeLeft);

    state.timer = setInterval(function() {
        timeLeft--;
        if (timerEl) timerEl.textContent = _corrIsFormatTime(timeLeft);
        if (timeLeft <= 0) {
            clearInterval(state.timer);
            state.timer = null;
            if (onDone) onDone();
        }
    }, 1000);
}

function _showCorrIsSpinner(onDone) {
    var state = window._correctionIntSpkState;
    if (!state || state._destroyed) return;

    var container = document.getElementById('corrIsContent');
    container.innerHTML = '<div class="is-spinner-wrap"><div class="is-spinner"></div></div>';

    setTimeout(function() {
        if (state._destroyed) return;
        if (onDone) onDone();
    }, 1000);
}

/** 대화(Task 2) 또는 강의(Task 3·4) 음성 화면 */
function _showCorrIsDialog() {
    var state = window._correctionIntSpkState;
    if (!state || state._destroyed) return;

    var item = state.item;

    var container = document.getElementById('corrIsContent');
    container.innerHTML =
        '<div class="is-audio-wrap">' +
            '<div class="is-audio-label"></div>' +
            (item.dialogImageUrl
                ? '<div class="is-audio-image"><img src="' + item.dialogImageUrl + '" alt=""></div>'
                : '<div class="is-audio-icon"><i class="fas fa-volume-up"></i></div>') +
        '</div>';

    if (!item.dialogAudioUrl) {
        console.warn('[Correction IntSpk] 대화/강의 음성 없음 — 2초 후 문제 단계');
        setTimeout(function() {
            if (!state._destroyed) _showCorrIsProblem();
        }, 2000);
        return;
    }

    state.audioPlayer.play(item.dialogAudioUrl, function() {
        if (!state._destroyed) _showCorrIsProblem();
    });
}

/** 문제 화면 — 문제 음성이 끝나면 준비 타이머 */
function _showCorrIsProblem() {
    var state = window._correctionIntSpkState;
    if (!state || state._destroyed) return;

    var item = state.item;
    var config = CORR_IS_CONFIG[item.type];

    var container = document.getElementById('corrIsContent');
    container.innerHTML =
        '<div class="is-topic-wrap is-topic-wrap--higher">' +
            '<div class="is-topic-text">' + _corrIsEscape(item.problemText) + '</div>' +
            '<div class="is-timer-section" id="corrIsTimerSection" style="display:none;">' +
                '<div class="is-timer-display">' +
                    '<div class="is-timer-phase-label" id="corrIsPhaseLabel">PREPARATION TIME</div>' +
                    '<div class="is-timer-content">' +
                        '<div class="is-timer-wrapper">' +
                            '<div class="is-progress-circle">' +
                                '<svg width="50" height="50" viewBox="0 0 50 50">' +
                                    '<circle class="is-progress-circle-bg" cx="25" cy="25" r="20"></circle>' +
                                    '<circle id="corrIsProgressCircle" class="is-progress-circle-fill" cx="25" cy="25" r="20" stroke-dasharray="125.6" stroke-dashoffset="125.6"></circle>' +
                                '</svg>' +
                                '<svg class="is-mic-icon" fill="currentColor" viewBox="0 0 20 20">' +
                                    '<path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"/>' +
                                '</svg>' +
                            '</div>' +
                            '<span id="corrIsCountdown" class="is-timer-text">' + _corrIsFormatTime(config.prepTime) + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

    if (item.problemAudioUrl) {
        state.audioPlayer.play(item.problemAudioUrl, function() {
            if (!state._destroyed) _startCorrIsPrepare();
        });
    } else {
        setTimeout(function() {
            if (!state._destroyed) _startCorrIsPrepare();
        }, 2000);
    }
}

function _startCorrIsPrepare() {
    var state = window._correctionIntSpkState;
    if (!state || state._destroyed) return;

    var config = CORR_IS_CONFIG[state.item.type];

    var section = document.getElementById('corrIsTimerSection');
    if (section) section.style.display = 'block';

    state.audioPlayer.play(CORR_IS_AUDIO.prepareBeep, function() {
        if (state._destroyed) return;
        _runCorrIsCountdown(config.prepTime, _startCorrIsSpeak);
    });
}

function _startCorrIsSpeak() {
    var state = window._correctionIntSpkState;
    if (!state || state._destroyed) return;

    var config = CORR_IS_CONFIG[state.item.type];

    _corrIsSetText('corrIsPhaseLabel', 'RESPONSE TIME');
    _corrIsSetText('corrIsCountdown', _corrIsFormatTime(config.speakTime));

    var circle = document.getElementById('corrIsProgressCircle');
    if (circle) circle.style.strokeDashoffset = '125.6';

    state.audioPlayer.play(CORR_IS_AUDIO.speakBeep, function() {
        if (state._destroyed) return;
        _runCorrIsCountdown(config.speakTime, _showCorrIsUpload);
    });
}

function _runCorrIsCountdown(seconds, onDone) {
    var state = window._correctionIntSpkState;
    if (!state || state._destroyed) return;

    var timeLeft = seconds;
    var total = seconds;
    var countdownEl = document.getElementById('corrIsCountdown');
    var circle = document.getElementById('corrIsProgressCircle');
    var circumference = 2 * Math.PI * 20;

    if (countdownEl) countdownEl.textContent = _corrIsFormatTime(timeLeft);
    if (circle) {
        circle.style.strokeDasharray = circumference;
        circle.style.strokeDashoffset = circumference;
    }

    state.timer = setInterval(function() {
        timeLeft--;
        if (countdownEl) countdownEl.textContent = _corrIsFormatTime(timeLeft);
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
// 5. 녹음 파일 업로드 (1차)
// ============================================================

function _showCorrIsUpload() {
    var state = window._correctionIntSpkState;
    if (!state || state._destroyed) return;
    state.selectedFile = null;

    var container = document.getElementById('corrIsContent');
    container.innerHTML =
        '<div class="corr-ids-upload-wrap">' +
            '<div class="corr-ids-upload-icon">🎙️</div>' +
            '<h2 class="corr-ids-upload-title">녹음 파일 업로드</h2>' +
            '<p class="corr-ids-upload-desc">방금 말한 답변 녹음 파일을 올려주세요.<br>제출하면 첨삭이 시작됩니다.</p>' +
            '<div class="corr-ids-topic-recap">' + _corrIsEscape(state.item.problemText) + '</div>' +
            _corrIsFilePickerHtml() +
            '<button class="corr-ids-submit-btn" id="corrIsSubmitBtn">제출</button>' +
        '</div>';

    _bindCorrIsFilePicker();
}

function _corrIsFilePickerHtml() {
    return '' +
        '<input type="file" accept="audio/*" id="corrIsFileInput" style="display:none;">' +
        '<button class="corr-ids-pick-btn" id="corrIsPickBtn">📁 파일 선택</button>' +
        '<div class="corr-ids-file-name" id="corrIsFileName" style="display:none;"></div>';
}

function _bindCorrIsFilePicker() {
    var state = window._correctionIntSpkState;
    var input = document.getElementById('corrIsFileInput');
    var pickBtn = document.getElementById('corrIsPickBtn');
    var nameEl = document.getElementById('corrIsFileName');
    var submitBtn = document.getElementById('corrIsSubmitBtn');
    if (!input || !pickBtn || !submitBtn) return;

    pickBtn.onclick = function() { input.click(); };
    input.onchange = function() {
        if (!input.files || !input.files[0]) return;
        var file = input.files[0];

        var rawExt = file.name.indexOf('.') >= 0 ? file.name.split('.').pop().toLowerCase() : '';
        if (CORR_IS_ALLOWED_EXT.indexOf(rawExt) < 0) {
            alert('오디오 파일만 올릴 수 있습니다. (' + CORR_IS_ALLOWED_EXT.join(', ') + ')');
            input.value = '';
            return;
        }
        if (file.size > CORR_IS_MAX_SIZE) {
            alert('파일이 너무 큽니다. 25MB 이하로 올려주세요.');
            input.value = '';
            return;
        }

        state.selectedFile = file;
        nameEl.textContent = '📎 ' + file.name;
        nameEl.style.display = 'block';
        pickBtn.textContent = '📁 다른 파일 선택';
    };

    submitBtn.onclick = function() { _corrIsTrySubmit(); };
}

// ============================================================
// 6. 2차 — 카운트다운 없이 지문/음성 자유 재생 + 1차 첨삭
// ============================================================

function _showCorrIsDraft2() {
    var state = window._correctionIntSpkState;
    if (!state || state._destroyed) return;
    state.selectedFile = null;

    var continueBtn = document.getElementById('corrIsContinueBtn');
    if (continueBtn) continueBtn.style.display = 'none';

    var item = state.item;
    var sub = state.submission;

    // 1차 첨삭
    var feedbackHtml = '<p class="corr-ids-d2-nofb">1차 첨삭 내용을 불러오지 못했습니다.</p>';
    var fb = _corrIsParseFeedback(sub && sub.feedback_1);
    if (fb && typeof renderSpeakingFeedback === 'function') {
        feedbackHtml = renderSpeakingFeedback(fb);
        if (typeof renderFeedbackSummary === 'function' && fb.summary) {
            feedbackHtml += renderFeedbackSummary(fb);
        }
    }

    // 내 1차 녹음
    var d1Html = '';
    var d1Path = sub && sub.draft_1_audio_q1;
    if (d1Path) {
        var d1Url = (d1Path.indexOf('http') === 0) ? d1Path : supabaseStorageUrl('correction-audio', d1Path);
        d1Html = '<div class="corr-ids-d2-myaudio">' +
            '<span class="corr-ids-d2-myaudio-label">내 1차 녹음</span>' +
            '<audio controls preload="none" src="' + d1Url + '"></audio>' +
        '</div>';
    }

    // 지문 (Task 2·3만)
    var passageHtml = '';
    if (CORR_IS_CONFIG[item.type].hasReading && item.passage) {
        passageHtml =
            '<div class="corr-ids-d2-section-title">지문</div>' +
            '<h3 class="is-reading-title" style="margin:0 0 10px;">' + _corrIsEscape(item.title) + '</h3>' +
            '<div class="is-reading-passage" style="margin-bottom:14px;">' + _corrIsEscape(item.passage) + '</div>';
    }

    var replayBtns =
        (item.dialogAudioUrl ? '<button class="corr-ids-replay-btn" id="corrIsReplayDialog"><i class="fas fa-volume-up"></i> ' + (item.type === 2 ? '대화' : '강의') + ' 다시 듣기</button> ' : '') +
        (item.problemAudioUrl ? '<button class="corr-ids-replay-btn" id="corrIsReplayProblem"><i class="fas fa-volume-up"></i> 문제 다시 듣기</button>' : '');

    var container = document.getElementById('corrIsContent');
    container.innerHTML =
        '<div class="corr-ids-d2-wrap">' +
            '<div class="corr-ids-d2-left">' +
                passageHtml +
                '<div class="corr-ids-d2-section-title">문제</div>' +
                '<div class="is-topic-text" style="text-align:left;">' + _corrIsEscape(item.problemText) + '</div>' +
                '<div style="margin-top:12px;">' + replayBtns + '</div>' +
                d1Html +
                '<div class="corr-ids-d2-section-title" style="margin-top:22px;">다시 녹음해서 올리기</div>' +
                '<p class="corr-ids-upload-desc" style="text-align:left;margin:0 0 14px;">시간 제한 없이 다시 녹음한 뒤 파일을 올려주세요.</p>' +
                _corrIsFilePickerHtml() +
                '<button class="corr-ids-submit-btn" id="corrIsSubmitBtn">2차 제출</button>' +
            '</div>' +
            '<div class="corr-ids-d2-right">' +
                '<div class="corr-ids-d2-section-title">1차 첨삭</div>' +
                feedbackHtml +
            '</div>' +
        '</div>';

    _bindCorrIsFilePicker();

    var dlgBtn = document.getElementById('corrIsReplayDialog');
    if (dlgBtn) {
        dlgBtn.onclick = function() {
            state.audioPlayer.stop();
            state.audioPlayer.play(item.dialogAudioUrl, function() {});
        };
    }
    var probBtn = document.getElementById('corrIsReplayProblem');
    if (probBtn) {
        probBtn.onclick = function() {
            state.audioPlayer.stop();
            state.audioPlayer.play(item.problemAudioUrl, function() {});
        };
    }
}

function _corrIsParseFeedback(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch (e) { return null; }
    }
    return raw;
}

// ============================================================
// 7. 제출
// ============================================================

function _corrIsTrySubmit() {
    var state = window._correctionIntSpkState;
    if (!state) return;

    if (!state.selectedFile) {
        alert('녹음 파일을 올려주세요.');
        return;
    }
    if (!confirm('이 파일로 제출할까요?\n제출 후에는 수정할 수 없습니다.')) return;

    _corrIsDoSubmit();
}

async function _corrIsDoSubmit() {
    var state = window._correctionIntSpkState;
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

        if (state.isDraft2) {
            await updateCorrectionSubmission(state.submission.id, {
                draft_2_audio_q1: uploaded,
                status: 'draft2_submitted',
                draft_2_submitted_at: new Date().toISOString()
            });
        } else {
            await insertCorrectionSubmission({
                user_id: user.id,
                session_number: state.session.session,
                task_type: state.taskType,
                task_number: state.setNumber,
                draft_1_audio_q1: uploaded,
                status: 'draft1_submitted',
                draft_1_submitted_at: new Date().toISOString()
            });
        }

        // 호주첨삭은 채점 워크플로우(n8n) 미연결 — webhook 전송 안 함

        if (overlay) overlay.style.display = 'none';
        alert(state.isDraft2 ? '2차 녹음이 제출되었습니다.' : '녹음이 제출되었습니다.');

        cleanupCorrectionIntSpk();
        _returnToCorrIsSession();

    } catch (err) {
        console.error('❌ [Correction IntSpk] 제출 실패:', err);
        if (overlay) overlay.style.display = 'none';
        alert('제출에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');
    }
}

async function _returnToCorrIsSession() {
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
            console.warn('⚠️ [Correction IntSpk] 제출 내역 재조회 실패:', e);
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

function backFromCorrectionIntSpk(skipConfirm) {
    if (!skipConfirm && !confirm('나가면 진행 중인 답변이 저장되지 않습니다. 나가시겠습니까?')) return;
    cleanupCorrectionIntSpk();
    _returnToCorrIsSession();
}

function cleanupCorrectionIntSpk() {
    var state = window._correctionIntSpkState;
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
    window._correctionIntSpkState = null;
    console.log('[Correction IntSpk] cleanup 완료');
}

// ============================================================
// 9. 유틸
// ============================================================

function _corrIsFormatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
}

function _corrIsEscape(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function _corrIsSetText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
}

window.startCorrectionIntSpk = startCorrectionIntSpk;
window.backFromCorrectionIntSpk = backFromCorrectionIntSpk;
window.cleanupCorrectionIntSpk = cleanupCorrectionIntSpk;
window._loadCorrectionIntSpkSet = _loadCorrectionIntSpkSet;

console.log('✅ correction-intspk.js 로드 완료');
