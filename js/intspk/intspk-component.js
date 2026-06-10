var INTSPK_AUDIO = {
    intspk2Intro: 'https://eontoefl.github.io/toefl-audio/australia/audio/intro_audio/intspk2_intro.mp3',
    intspk3Intro: 'https://eontoefl.github.io/toefl-audio/australia/audio/intro_audio/intspk3_intro.mp3',
    intspk4Intro: 'https://eontoefl.github.io/toefl-audio/australia/audio/intro_audio/intspk4_intro.mp3',
    prepareBeep: 'https://eontoefl.github.io/toefl-audio/australia/audio/fixed_audio/prepare_beep.mp3',
    speakBeep: 'https://eontoefl.github.io/toefl-audio/australia/audio/fixed_audio/begin_beep.mp3'
};

var INTSPK_INTRO_TEXT = {
    2: 'In this question, you will read a short passage about a campus situation and then listen to a talk on the same topic. You will then answer a question using information from both the reading passage and the talk. After the question, you will have <strong>30 seconds</strong> to prepare your response and <strong>60 seconds</strong> to speak.',
    3: 'In this question, you will read a short passage on an academic subject and then listen to a talk on the same topic. You will then answer a question using information from both the reading passage and the talk. After the question, you will have <strong>30 seconds</strong> to prepare your response and <strong>60 seconds</strong> to speak.',
    4: 'In this question, you will listen to a short lecture. You will then be asked to summarize important information from the lecture. After you hear the question, you will have <strong>20 seconds</strong> to prepare your response and <strong>60 seconds</strong> to speak.'
};

var INTSPK_CONFIG = {
    2: { prepTime: 30, speakTime: 60, readingTime: 45, hasReading: true },
    3: { prepTime: 30, speakTime: 60, readingTime: 45, hasReading: true },
    4: { prepTime: 20, speakTime: 60, readingTime: 0, hasReading: false }
};

window.currentIntspkModule = null;

// ============================================================
// 진입점
// ============================================================

async function startIntspkModule(itemNumber, week, day) {
    console.log('\n============================');
    console.log('IntSpk ' + itemNumber + ' 시작 (W' + week + ' ' + day + ')');
    console.log('============================\n');

    var audioPlayer = new AudioPlayer();

    var collect = (typeof isAusCollectEnabled === 'function') && isAusCollectEnabled();

    if (week && day) {
        window.currentTest = window.currentTest || {};
        window.currentTest.currentWeek = week;
        window.currentTest.currentDay = day;
    }

    window.currentIntspkModule = {
        itemNumber: itemNumber,
        week: week || null,
        day: day || null,
        collect: collect,
        audioPlayer: audioPlayer,
        data: null,
        item: null,
        timer: null,
        _progressTimer: null,
        _destroyed: false,
        _selectedFile: null,
        _certResult: null,
        _hasInitial: false,
        _submitFileName: ''
    };

    var titleEl = document.getElementById('intspkTitle');
    if (titleEl) titleEl.textContent = '통스 ' + itemNumber;

    showScreen('intspkScreen');
    _showIntspkLoading();

    try {
        var result = await loadIntspkData();
        if (!result) throw new Error('데이터 없음');
        window.currentIntspkModule.data = result;

        var item = result.items[itemNumber - 1];
        if (!item) throw new Error('통스 ' + itemNumber + ' 데이터 없음');
        window.currentIntspkModule.item = item;

        console.log('[IntSpk] 데이터 로드 완료 — type: ' + item.type);
    } catch (e) {
        console.error('[IntSpk] 데이터 로드 실패:', e);
        alert('데이터를 불러올 수 없습니다.');
        _backFromIntspk();
        return;
    }

    // 이미 실전 제출(녹음 박제)했는지 확인
    if (collect) {
        await _isLoadStatus();
    }

    _showIntspkIntroScreen();
    _playIntspkIntroNarration();
}

// 이미 initial_record(실전 제출)가 있는지 조회
async function _isLoadStatus() {
    var mod = window.currentIntspkModule;
    if (!mod || !mod.collect) return;
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user || !user.id || user.id === 'dev-user-001') return;
    if (typeof getStudyResultV3 !== 'function') return;
    try {
        var rec = await getStudyResultV3(user.id, 'intspk', mod.itemNumber, mod.week, mod.day);
        mod._hasInitial = !!(rec && rec.initial_record != null);
        console.log('[IntSpk] 기존 제출 여부:', mod._hasInitial);
    } catch (e) {
        console.warn('[IntSpk] 제출 여부 조회 실패:', e);
    }
}

function _showIntspkLoading() {
    var container = document.getElementById('intspkContent');
    container.innerHTML =
        '<div class="is-intro-screen">' +
            '<div class="is-intro-card" style="padding:60px 50px;">' +
                '<p style="color:#3e484f;font-size:16px;">데이터 로딩 중...</p>' +
            '</div>' +
        '</div>';
}

// ============================================================
// 인트로 화면
// ============================================================

function _showIntspkIntroScreen() {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;

    var item = mod.item;
    var type = item.type;
    var introText = INTSPK_INTRO_TEXT[type] || '';
    var typeLabel = 'Task ' + type;

    var container = document.getElementById('intspkContent');
    container.innerHTML =
        '<div class="is-intro-screen">' +
            '<div class="is-intro-card">' +
                '<div class="is-intro-icon">' +
                    '<i class="fas fa-microphone"></i>' +
                '</div>' +
                '<h1 class="is-intro-title">Integrated Speaking</h1>' +
                '<div class="is-intro-type-badge">' + typeLabel + '</div>' +
                '<div class="is-intro-text">' +
                    '<p>' + introText + '</p>' +
                '</div>' +
                '<div class="is-intro-note">' +
                    'Please listen carefully.' +
                '</div>' +
            '</div>' +
        '</div>';

    var continueBtn = document.getElementById('intspkContinueBtn');
    continueBtn.style.display = 'inline-block';
    continueBtn.disabled = false;
    continueBtn.style.opacity = '1';
    continueBtn.style.cursor = 'pointer';
    continueBtn.onclick = function() {
        _startIntspkContentPhase();
    };
}

function _playIntspkIntroNarration() {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;

    var type = mod.item.type;
    var introAudioUrl = '';
    if (type === 2) introAudioUrl = INTSPK_AUDIO.intspk2Intro;
    else if (type === 3) introAudioUrl = INTSPK_AUDIO.intspk3Intro;
    else if (type === 4) introAudioUrl = INTSPK_AUDIO.intspk4Intro;

    mod.audioPlayer.play(introAudioUrl, function() {
        if (mod._destroyed) return;
        _enableIntspkContinueBtn();
    });
}

function _enableIntspkContinueBtn() {
    var btn = document.getElementById('intspkContinueBtn');
    if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
}

// ============================================================
// 콘텐츠 단계 (리딩 or 메인 오디오)
// ============================================================

function _startIntspkContentPhase() {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;

    var continueBtn = document.getElementById('intspkContinueBtn');
    if (continueBtn) continueBtn.style.display = 'none';

    var config = INTSPK_CONFIG[mod.item.type];

    if (config.hasReading) {
        _showReadingScreen();
    } else {
        _showDialogScreen();
    }
}

// ── 통스2/3: 리딩 오디오 먼저 → 오디오 끝나면 지문 표시 + 타이머 시작 ──

function _showReadingScreen() {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;

    var item = mod.item;
    var config = INTSPK_CONFIG[item.type];
    var label = '통스 ' + mod.itemNumber;

    var container = document.getElementById('intspkContent');
    container.innerHTML =
        '<div class="is-reading-wrap">' +
            '<div class="is-reading-header">' +
                '<span class="is-reading-label"></span>' +
                '<span class="is-reading-timer" id="isReadingTimer">' + _isFormatTime(config.readingTime) + '</span>' +
            '</div>' +
            '<div class="is-reading-body" id="isReadingBody" style="opacity:0.4;">' +
                '<h2 class="is-reading-title">' + _isEscapeHtml(item.title) + '</h2>' +
                '<div class="is-reading-passage">' + _isEscapeHtml(item.passage) + '</div>' +
            '</div>' +
        '</div>';

    if (item.readingAudioUrl) {
        mod.audioPlayer.play(item.readingAudioUrl, function() {
            if (mod._destroyed) return;
            var body = document.getElementById('isReadingBody');
            if (body) body.style.opacity = '1';
            _runReadingCountdown(config.readingTime, function() {
                _showTransitionSpinner(function() {
                    _showDialogScreen();
                });
            });
        });
    } else {
        var body = document.getElementById('isReadingBody');
        if (body) body.style.opacity = '1';
        _runReadingCountdown(config.readingTime, function() {
            _showTransitionSpinner(function() {
                _showDialogScreen();
            });
        });
    }
}

function _runReadingCountdown(seconds, onDone) {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;

    var timeLeft = seconds;
    var timerEl = document.getElementById('isReadingTimer');

    if (timerEl) timerEl.textContent = _isFormatTime(timeLeft);

    mod.timer = setInterval(function() {
        timeLeft--;
        if (timerEl) timerEl.textContent = _isFormatTime(timeLeft);

        if (timeLeft <= 0) {
            clearInterval(mod.timer);
            mod.timer = null;
            if (onDone) onDone();
        }
    }, 1000);
}

// ── 전환 스피너 (1초) ──

function _showTransitionSpinner(onDone) {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;

    var container = document.getElementById('intspkContent');
    container.innerHTML =
        '<div class="is-spinner-wrap">' +
            '<div class="is-spinner"></div>' +
        '</div>';

    setTimeout(function() {
        if (mod._destroyed) return;
        if (onDone) onDone();
    }, 1000);
}

// ── 메인 오디오 화면 (대화/렉쳐) ──

function _showDialogScreen() {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;

    var label = '통스 ' + mod.itemNumber;

    var container = document.getElementById('intspkContent');
    container.innerHTML =
        '<div class="is-audio-wrap">' +
            '<div class="is-audio-label"></div>' +
            (mod.item.dialogImageUrl
                ? '<div class="is-audio-image"><img src="' + mod.item.dialogImageUrl + '" alt=""></div>'
                : '<div class="is-audio-icon"><i class="fas fa-volume-up"></i></div>') +
        '</div>';

    var url = mod.item.dialogAudioUrl;
    if (!url || url.trim() === '') {
        console.warn('[IntSpk] 메인 오디오 없음 — 2초 후 문제 단계 진행');
        setTimeout(function() {
            if (mod._destroyed) return;
            _showProblemScreen();
        }, 2000);
        return;
    }

    mod.audioPlayer.play(url, function() {
        if (mod._destroyed) return;
        _showProblemScreen();
    });
}

// ============================================================
// 오디오 프로그레스 바 재생
// ============================================================

function _playWithProgressBar(url, onEnded) {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;

    if (mod._progressTimer) {
        clearInterval(mod._progressTimer);
        mod._progressTimer = null;
    }

    var startTime = null;
    var duration = null;

    var originalPlay = mod.audioPlayer.play.bind(mod.audioPlayer);

    mod.audioPlayer.stop();
    var abortController = new AbortController();
    mod.audioPlayer._abortController = abortController;

    mod.audioPlayer._fetchAndDecode(url, abortController.signal, 2).then(function(audioBuffer) {
        if (abortController.signal.aborted || mod._destroyed) return;

        duration = audioBuffer.duration;

        var source = mod.audioPlayer.audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(mod.audioPlayer.audioCtx.destination);

        source.onended = function() {
            mod.audioPlayer.currentSource = null;
            if (mod._progressTimer) {
                clearInterval(mod._progressTimer);
                mod._progressTimer = null;
            }
            var fill = document.getElementById('isAudioProgressFill');
            if (fill) fill.style.width = '100%';
            if (onEnded) onEnded();
        };

        source.start();
        mod.audioPlayer.currentSource = source;
        startTime = mod.audioPlayer.audioCtx.currentTime;

        mod._progressTimer = setInterval(function() {
            if (mod._destroyed || !startTime || !duration) {
                clearInterval(mod._progressTimer);
                mod._progressTimer = null;
                return;
            }
            var elapsed = mod.audioPlayer.audioCtx.currentTime - startTime;
            var pct = Math.min((elapsed / duration) * 100, 100);
            var fill = document.getElementById('isAudioProgressFill');
            if (fill) fill.style.width = pct + '%';
        }, 100);

    }).catch(function(e) {
        if (e.name === 'AbortError') return;
        console.error('[IntSpk] 오디오 재생 실패:', e);
        if (onEnded) onEnded();
    });
}

// ============================================================
// 문제 화면 (질문 텍스트 + 오디오 → 같은 화면에 타이머)
// ============================================================

function _showProblemScreen() {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;

    var item = mod.item;
    var config = INTSPK_CONFIG[item.type];
    var prepTime = config.prepTime;

    var container = document.getElementById('intspkContent');
    container.innerHTML =
        '<div class="is-topic-wrap is-topic-wrap--higher">' +
            '<div class="is-topic-text">' + _isEscapeHtml(item.problemText) + '</div>' +
            '<div class="is-timer-section" id="isTimerSection" style="display:none;">' +
                '<div class="is-timer-display">' +
                    '<div class="is-timer-phase-label" id="isPhaseLabel">PREPARATION TIME</div>' +
                    '<div class="is-timer-content">' +
                        '<div class="is-timer-wrapper">' +
                            '<div class="is-progress-circle">' +
                                '<svg width="50" height="50" viewBox="0 0 50 50">' +
                                    '<circle class="is-progress-circle-bg" cx="25" cy="25" r="20"></circle>' +
                                    '<circle id="isProgressCircle" class="is-progress-circle-fill" cx="25" cy="25" r="20" ' +
                                            'stroke-dasharray="125.6" stroke-dashoffset="125.6"></circle>' +
                                '</svg>' +
                                '<svg class="is-mic-icon" fill="currentColor" viewBox="0 0 20 20">' +
                                    '<path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"/>' +
                                '</svg>' +
                            '</div>' +
                            '<span id="isCountdown" class="is-timer-text">' + _isFormatTime(prepTime) + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

    var problemAudioUrl = item.problemAudioUrl;
    if (problemAudioUrl && problemAudioUrl.trim() !== '') {
        mod.audioPlayer.play(problemAudioUrl, function() {
            if (mod._destroyed) return;
            _startIntspkPreparePhase();
        });
    } else {
        setTimeout(function() {
            if (mod._destroyed) return;
            _startIntspkPreparePhase();
        }, 2000);
    }
}

// ============================================================
// 준비 단계 (문제 화면 위에서 타이머 표시)
// ============================================================

function _startIntspkPreparePhase() {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;

    var config = INTSPK_CONFIG[mod.item.type];
    var prepTime = config.prepTime;

    var timerSection = document.getElementById('isTimerSection');
    if (timerSection) timerSection.style.display = 'block';

    mod.audioPlayer.play(INTSPK_AUDIO.prepareBeep, function() {
        if (mod._destroyed) return;
        _runIntspkCountdown(prepTime, function() {
            _startIntspkSpeakPhase();
        });
    });
}

// ============================================================
// 응답 단계
// ============================================================

function _startIntspkSpeakPhase() {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;

    var config = INTSPK_CONFIG[mod.item.type];
    var speakTime = config.speakTime;

    var phaseLabel = document.getElementById('isPhaseLabel');
    if (phaseLabel) phaseLabel.textContent = 'RESPONSE TIME';

    var countdownEl = document.getElementById('isCountdown');
    if (countdownEl) countdownEl.textContent = _isFormatTime(speakTime);

    var circle = document.getElementById('isProgressCircle');
    if (circle) circle.style.strokeDashoffset = '125.6';

    mod.audioPlayer.play(INTSPK_AUDIO.speakBeep, function() {
        if (mod._destroyed) return;
        _runIntspkCountdown(speakTime, function() {
            _afterIntspkSpeak();
        });
    });
}

// 말하기 종료 후 분기 (독스와 동일)
//  - 수집 코호트 + 마감 전 + 첫 제출 → 녹음 업로드 화면
//  - 마감 후 / 이미 제출 → 업로드 건너뛰고 바로 완료 안내
function _afterIntspkSpeak() {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;

    if (!mod.collect) {
        _showIntspkComplete();
        return;
    }

    var passed = (typeof isTaskDeadlinePassed === 'function') ? isTaskDeadlinePassed() : false;
    if (passed) {
        mod._certResult = 'deadline';
        _showIntspkComplete();
        return;
    }
    if (mod._hasInitial) {
        mod._certResult = 'redo';
        _showIntspkComplete();
        return;
    }

    _showIntspkUpload();
}

// ============================================================
// 카운트다운 공통
// ============================================================

function _runIntspkCountdown(seconds, onDone) {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;

    var timeLeft = seconds;
    var totalTime = seconds;
    var countdownEl = document.getElementById('isCountdown');
    var progressCircle = document.getElementById('isProgressCircle');
    var circumference = 2 * Math.PI * 20;

    if (countdownEl) countdownEl.textContent = _isFormatTime(timeLeft);
    if (progressCircle) {
        progressCircle.style.strokeDasharray = circumference;
        progressCircle.style.strokeDashoffset = circumference;
    }

    mod.timer = setInterval(function() {
        timeLeft--;
        if (countdownEl) countdownEl.textContent = _isFormatTime(timeLeft);

        if (progressCircle) {
            var elapsed = totalTime - timeLeft;
            var offset = circumference - (elapsed / totalTime) * circumference;
            progressCircle.style.strokeDashoffset = offset;
        }

        if (timeLeft <= 0) {
            clearInterval(mod.timer);
            mod.timer = null;
            if (onDone) onDone();
        }
    }, 1000);
}

// ============================================================
// 녹음 업로드 (수집 코호트)
// ============================================================

function _showIntspkUpload() {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;
    mod._selectedFile = null;

    var continueBtn = document.getElementById('intspkContinueBtn');
    if (continueBtn) continueBtn.style.display = 'none';

    var container = document.getElementById('intspkContent');
    container.innerHTML =
        '<div style="max-width:520px;margin:0 auto;padding:36px 20px;text-align:center;">' +
            '<div style="font-size:42px;margin-bottom:12px;">🎙️</div>' +
            '<h2 style="margin:0 0 8px;font-size:19px;color:#1a1a1a;">녹음 파일 업로드</h2>' +
            '<p style="font-size:14px;color:#666;line-height:1.7;margin:0 0 26px;">방금 말한 답변 녹음 파일을 올려주세요.<br>업로드하면 오늘 과제가 인증됩니다.</p>' +
            '<input type="file" accept="audio/*" id="isFileInput" style="display:none;">' +
            '<button id="isPickBtn" style="display:inline-block;padding:13px 26px;border-radius:10px;border:1.5px dashed #5B4A9E;background:#f4f3fb;color:#5B4A9E;font-size:15px;font-weight:600;cursor:pointer;">📁 파일 선택</button>' +
            '<div id="isFileName" style="display:none;margin:14px auto 0;font-size:14px;color:#16a34a;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;max-width:90%;word-break:break-all;"></div>' +
            '<div style="margin-top:28px;">' +
                '<button id="isSubmitBtn" style="width:100%;max-width:320px;padding:14px;border-radius:10px;border:none;background:#5B4A9E;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">제출</button>' +
            '</div>' +
        '</div>';

    var input = document.getElementById('isFileInput');
    var pickBtn = document.getElementById('isPickBtn');
    var nameEl = document.getElementById('isFileName');
    var submitBtn = document.getElementById('isSubmitBtn');

    pickBtn.onclick = function() { input.click(); };
    input.onchange = function() {
        if (input.files && input.files[0]) {
            mod._selectedFile = input.files[0];
            nameEl.textContent = '📎 ' + mod._selectedFile.name;
            nameEl.style.display = 'block';
            pickBtn.textContent = '📁 다른 파일 선택';
        }
    };
    submitBtn.onclick = function() { _isTrySubmit(); };
}

function _isTrySubmit() {
    var mod = window.currentIntspkModule;
    if (!mod) return;
    if (!mod._selectedFile) {
        _isShowNoFileWarning(function() { _isDoSubmit(); });
        return;
    }
    _isShowConfirm(mod._selectedFile, function() { _isDoSubmit(); });
}

// 제출 확인 팝업 (파일명 + 미리듣기 + 박제 경고)
function _isShowConfirm(file, onConfirm) {
    var existing = document.getElementById('isConfirmOverlay');
    if (existing) existing.remove();

    var objUrl = URL.createObjectURL(file);
    var overlay = document.createElement('div');
    overlay.id = 'isConfirmOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99998;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
        '<div style="background:#fff;border-radius:16px;padding:26px 22px;max-width:380px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
            '<div style="font-size:30px;margin-bottom:6px;">🎙️</div>' +
            '<h3 style="margin:0 0 12px;font-size:16px;color:#1a1a1a;">이 파일로 제출할까요?</h3>' +
            '<div style="font-size:13px;color:#16a34a;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;margin:0 0 10px;word-break:break-all;">📎 ' + _isEscapeHtml(file.name) + '</div>' +
            '<audio controls src="' + objUrl + '" style="width:100%;margin:0 0 12px;"></audio>' +
            '<p style="font-size:12.5px;color:#ef4444;line-height:1.5;margin:0 0 18px;">제출 후에는 <strong>수정할 수 없어요.</strong> 한 번 들어보고 올려주세요.</p>' +
            '<div style="display:flex;gap:10px;">' +
                '<button id="isConfirmCancel" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid #ddd;background:#fff;color:#666;font-size:14px;font-weight:600;cursor:pointer;">다시 고르기</button>' +
                '<button id="isConfirmOk" style="flex:1;padding:12px;border-radius:10px;border:none;background:#5B4A9E;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">제출</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(overlay);

    document.getElementById('isConfirmCancel').onclick = function() { URL.revokeObjectURL(objUrl); overlay.remove(); };
    document.getElementById('isConfirmOk').onclick = function() { URL.revokeObjectURL(objUrl); overlay.remove(); if (onConfirm) onConfirm(); };
}

// 파일 없이 제출 시 경고 팝업
function _isShowNoFileWarning(onConfirm) {
    var existing = document.getElementById('isNoFileOverlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'isNoFileOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99998;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
        '<div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:360px;width:88%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
            '<div style="font-size:32px;margin-bottom:10px;">🎙️</div>' +
            '<h3 style="margin:0 0 10px;font-size:16px;color:#1a1a1a;">녹음 파일이 없어요</h3>' +
            '<p style="font-size:13.5px;color:#666;line-height:1.6;margin:0 0 20px;">파일을 올리지 않았어요.<br>지금 제출하면 인증되지 않습니다.</p>' +
            '<div style="display:flex;gap:10px;">' +
                '<button id="isNoFilePickBtn" style="flex:1;padding:12px;border-radius:10px;border:none;background:#5B4A9E;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">파일 올리기</button>' +
                '<button id="isNoFileSubmitBtn" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid #ddd;background:#fff;color:#888;font-size:14px;font-weight:600;cursor:pointer;">그래도 제출</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(overlay);

    document.getElementById('isNoFilePickBtn').onclick = function() { overlay.remove(); };
    document.getElementById('isNoFileSubmitBtn').onclick = function() { overlay.remove(); if (onConfirm) onConfirm(); };
}

function _isDoSubmit() {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;

    var container = document.getElementById('intspkContent');
    container.innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:320px;gap:14px;">' +
            '<style>@keyframes isSpin{to{transform:rotate(360deg)}}</style>' +
            '<div style="width:40px;height:40px;border:4px solid #e2e8f0;border-top-color:#5B4A9E;border-radius:50%;animation:isSpin 0.8s linear infinite;"></div>' +
            '<p style="font-size:14px;color:#718096;">처리 중...</p>' +
        '</div>';

    _isSaveAnswer().then(function() {
        if (mod._destroyed) return;
        _showIntspkComplete();
    });
}

// 녹음 저장 (독스와 동일 모델)
async function _isSaveAnswer() {
    var mod = window.currentIntspkModule;
    if (!mod) return;
    mod._certResult = null;

    if (!mod.collect) return;
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user || !user.id || user.id === 'dev-user-001') return;
    if (typeof upsertInitialRecord !== 'function') return;

    var passed = (typeof isTaskDeadlinePassed === 'function') ? isTaskDeadlinePassed() : false;
    if (passed) { mod._certResult = 'deadline'; console.log('[IntSpk] 마감 후 — 저장 안 함'); return; }
    if (mod._hasInitial) { mod._certResult = 'redo'; console.log('[IntSpk] 이미 제출됨 — 저장 안 함'); return; }
    if (!mod._selectedFile) { mod._certResult = 'blank'; console.log('[IntSpk] 파일 없음 — 저장 안 함'); return; }

    try {
        var file = mod._selectedFile;
        var rawExt = file.name.indexOf('.') >= 0 ? file.name.split('.').pop().toLowerCase() : '';
        var ext = (/^[a-z0-9]+$/.test(rawExt)) ? rawExt : 'bin';
        var storagePath = user.id + '/aus_intspk_' + mod.itemNumber + '_' + Date.now() + '.' + ext;

        var filePath = (typeof supabaseStorageUpload === 'function')
            ? await supabaseStorageUpload('speaking-files', storagePath, file)
            : null;
        if (!filePath) { mod._certResult = 'error'; console.error('[IntSpk] 파일 업로드 실패'); return; }

        mod._submitFileName = file.name;
        var recordJson = { audioPath: filePath, fileName: file.name, completedAt: new Date().toISOString() };
        await upsertInitialRecord(user.id, 'intspk', mod.itemNumber, mod.week, mod.day, recordJson, {
            locked_auth_rate: 100
        });
        mod._hasInitial = true;
        mod._certResult = 'certified';
        if (typeof ProgressTracker !== 'undefined' && ProgressTracker.markCompleted) ProgressTracker.markCompleted('intspk', mod.itemNumber);
        console.log('[IntSpk] 박제 완료: certified ' + file.name);
    } catch (e) {
        console.error('[IntSpk] 저장 실패:', e);
        mod._certResult = 'error';
    }
}

// ============================================================
// 완료 화면
// ============================================================

function _showIntspkComplete() {
    var mod = window.currentIntspkModule;
    if (!mod || mod._destroyed) return;

    var r = mod._certResult;
    var descHtml;
    if (!mod.collect || !r) {
        descHtml = '<p class="is-complete-desc">통합형 스피킹 연습을 마쳤습니다.</p>';
    } else if (r === 'certified') {
        descHtml = '<p class="is-complete-desc" style="color:#16a34a;font-weight:600;">🎉 통스 ' + mod.itemNumber + ' 인증 완료! 녹음이 제출됐어요.</p>';
    } else if (r === 'redo') {
        descHtml = '<p class="is-complete-desc">이미 제출한 과제예요. 다시 한 건 저장되지 않아요.</p>';
    } else if (r === 'deadline') {
        descHtml = '<p class="is-complete-desc">마감이 지난 과제예요. 인증에는 반영되지 않습니다.</p>';
    } else if (r === 'error') {
        descHtml = '<p class="is-complete-desc" style="color:#ef4444;">업로드 중 문제가 생겼어요. 다시 시도해 주세요.</p>';
    } else { // blank
        descHtml = '<p class="is-complete-desc">녹음 파일이 없어 인증되지 않았어요. 다시 제출할 수 있어요.</p>';
    }

    var container = document.getElementById('intspkContent');
    container.innerHTML =
        '<div class="is-complete-screen">' +
            '<div class="is-complete-card">' +
                '<div class="is-complete-check">' +
                    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#48bb78" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                        '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
                        '<polyline points="22 4 12 14.01 9 11.01"/>' +
                    '</svg>' +
                '</div>' +
                '<h2 class="is-complete-title">통스 ' + mod.itemNumber + ' 완료!</h2>' +
                descHtml +
                '<button class="is-complete-btn" id="isCompleteBtn">확인</button>' +
            '</div>' +
        '</div>';

    document.getElementById('isCompleteBtn').onclick = function() {
        cleanupIntspkModule();
        _backFromIntspk();
    };
}

// ============================================================
// 뒤로가기 / 정리
// ============================================================

function _backFromIntspk() {
    showScreen('ausTaskSelectScreen');
}

function cleanupIntspkModule() {
    var mod = window.currentIntspkModule;
    if (!mod) return;

    mod._destroyed = true;

    if (mod.timer) {
        clearInterval(mod.timer);
        mod.timer = null;
    }

    if (mod._progressTimer) {
        clearInterval(mod._progressTimer);
        mod._progressTimer = null;
    }

    if (mod.audioPlayer) {
        mod.audioPlayer.stop();
        mod.audioPlayer.destroy();
    }

    window.currentIntspkModule = null;
    console.log('[IntSpk] cleanup 완료');
}

// ============================================================
// 유틸
// ============================================================

function _isFormatTime(seconds) {
    return '00:' + (seconds < 10 ? '0' + seconds : seconds);
}

function _isEscapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function _getAusIntspkNumber(taskName) {
    var match = taskName.match(/^통스\s*(\d+)$/);
    return match ? parseInt(match[1]) : null;
}

window.startIntspkModule = startIntspkModule;
window.cleanupIntspkModule = cleanupIntspkModule;
window._getAusIntspkNumber = _getAusIntspkNumber;
window._backFromIntspk = _backFromIntspk;

console.log('[IntSpk] intspk-component.js 로드 완료');
