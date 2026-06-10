/**
 * ind-spk-component.js
 * 독립형 스피킹 컴포넌트
 *
 * 플로우:
 *   인트로(나레이션) → [주제 표시 + 토픽 오디오] → 준비 15초 → 응답 45초 → 완료
 *   세트 1개 = 주제 1개
 */

// ============================================================
// 오디오 URL
// ============================================================
var INDSPK_AUDIO = {
    introNarration: 'https://eontoefl.github.io/toefl-audio/australia/audio/intro_audio/indspk_brainstorm_intro.mp3',
    prepareBeep: 'https://eontoefl.github.io/toefl-audio/australia/audio/fixed_audio/prepare_beep.mp3',
    speakBeep: 'https://eontoefl.github.io/toefl-audio/australia/audio/fixed_audio/begin_beep.mp3'
};

// 준비/응답 시간(초)
var INDSPK_PREP_SEC = 15;
var INDSPK_SPEAK_SEC = 45;

// ============================================================
// 전역 상태
// ============================================================
window.currentIndSpkModule = null;

// ============================================================
// 진입점
// ============================================================

async function startIndSpkModule(topicNumber, week, day) {
    console.log('\n============================');
    console.log('Independent Speaking TOPIC ' + topicNumber + ' 시작 (W' + week + ' ' + day + ')');
    console.log('============================\n');

    var audioPlayer = new AudioPlayer();

    var collect = (typeof isAusCollectEnabled === 'function') && isAusCollectEnabled();

    // 마감 판정을 위해 스케줄 정보 세팅
    if (week && day) {
        window.currentTest = window.currentTest || {};
        window.currentTest.currentWeek = week;
        window.currentTest.currentDay = day;
    }

    window.currentIndSpkModule = {
        topicNumber: topicNumber,
        week: week || null,
        day: day || null,
        collect: collect,
        audioPlayer: audioPlayer,
        data: null,
        timer: null,
        _destroyed: false,
        _selectedFile: null,
        _certResult: null,
        _hasInitial: false,
        _submitFileName: ''
    };

    var titleEl = document.getElementById('indSpkTitle');
    if (titleEl) titleEl.textContent = 'Independent Speaking TOPIC ' + topicNumber;

    showScreen('indSpkScreen');
    _showIndSpkIntroScreen();

    try {
        var result = await loadIndSpkData();
        if (!result) throw new Error('데이터 없음');
        window.currentIndSpkModule.data = result;
        console.log('[IndSpk] 데이터 로드 완료');
    } catch (e) {
        console.error('[IndSpk] 데이터 로드 실패:', e);
        alert('데이터를 불러올 수 없습니다.');
        backToAusTaskSelect();
        return;
    }

    // 이미 실전 제출(녹음 박제)했는지 확인 — 그렇다면 이번 시도는 저장 안 함
    if (collect) {
        await _idsLoadStatus();
    }

    _playIndSpkIntroNarration();
}

// 이미 initial_record(실전 제출)가 있는지 조회
async function _idsLoadStatus() {
    var mod = window.currentIndSpkModule;
    if (!mod || !mod.collect) return;
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user || !user.id || user.id === 'dev-user-001') return;
    if (typeof getStudyResultV3 !== 'function') return;
    try {
        var rec = await getStudyResultV3(user.id, 'ind-spk', mod.topicNumber, mod.week, mod.day);
        mod._hasInitial = !!(rec && rec.initial_record != null);
        console.log('[IndSpk] 기존 제출 여부:', mod._hasInitial);
    } catch (e) {
        console.warn('[IndSpk] 제출 여부 조회 실패:', e);
    }
}

// ============================================================
// 인트로 화면
// ============================================================

function _showIndSpkIntroScreen() {
    var mod = window.currentIndSpkModule;
    var container = document.getElementById('indSpkContent');

    container.innerHTML =
        '<div class="ids-intro-screen">' +
            '<div class="ids-intro-card">' +
                '<div class="ids-intro-icon">' +
                    '<i class="fas fa-microphone"></i>' +
                '</div>' +
                '<h1 class="ids-intro-title">Independent Speaking</h1>' +
                '<div class="ids-intro-type-badge">Task 1</div>' +
                '<div class="ids-intro-text">' +
                    '<p>In this question, you will be asked to talk about a familiar topic.</p>' +
                    '<p>After you hear the question, you will have <strong>15 seconds</strong> to prepare your response, and <strong>45 seconds</strong> to speak.</p>' +
                '</div>' +
                '<div class="ids-intro-note">' +
                    'Please listen carefully.' +
                '</div>' +
            '</div>' +
        '</div>';

    var continueBtn = document.getElementById('indSpkContinueBtn');
    continueBtn.style.display = 'inline-block';
    continueBtn.disabled = false;
    continueBtn.style.opacity = '1';
    continueBtn.style.cursor = 'pointer';
    continueBtn.onclick = function() {
        _startIndSpkTopicPhase();
    };
}

function _playIndSpkIntroNarration() {
    var mod = window.currentIndSpkModule;
    if (!mod || mod._destroyed) return;

    mod.audioPlayer.play(INDSPK_AUDIO.introNarration, function() {
        if (mod._destroyed) return;
        _enableIndSpkContinueBtn();
    });
}

function _enableIndSpkContinueBtn() {
    var btn = document.getElementById('indSpkContinueBtn');
    if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
}

// ============================================================
// 주제 화면
// ============================================================

function _startIndSpkTopicPhase() {
    var mod = window.currentIndSpkModule;
    if (!mod || mod._destroyed) return;

    var itemIndex = mod.topicNumber - 1;
    var item = mod.data.items[itemIndex];
    if (!item) {
        alert('TOPIC ' + mod.topicNumber + ' 데이터가 없습니다.');
        backToAusTaskSelect();
        return;
    }

    _showIndSpkTopicScreen(item);
}

function _showIndSpkTopicScreen(item) {
    var mod = window.currentIndSpkModule;
    if (!mod || mod._destroyed) return;

    var continueBtn = document.getElementById('indSpkContinueBtn');
    continueBtn.style.display = 'none';

    var container = document.getElementById('indSpkContent');
    container.innerHTML =
        '<div class="ids-topic-wrap">' +
            '<div class="ids-topic-text">' + _idsEscapeHtml(item.text) + '</div>' +
            '<div class="ids-timer-section" id="idsTimerSection" style="display:none;">' +
                '<div class="ids-timer-display">' +
                    '<div class="ids-timer-phase-label" id="idsPhaseLabel">PREPARATION TIME</div>' +
                    '<div class="ids-timer-content">' +
                        '<div class="ids-timer-wrapper">' +
                            '<div class="ids-progress-circle">' +
                                '<svg width="50" height="50" viewBox="0 0 50 50">' +
                                    '<circle class="ids-progress-circle-bg" cx="25" cy="25" r="20"></circle>' +
                                    '<circle id="idsProgressCircle" class="ids-progress-circle-fill" cx="25" cy="25" r="20" ' +
                                            'stroke-dasharray="125.6" stroke-dashoffset="125.6"></circle>' +
                                '</svg>' +
                                '<svg class="ids-mic-icon" fill="currentColor" viewBox="0 0 20 20">' +
                                    '<path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"/>' +
                                '</svg>' +
                            '</div>' +
                            '<span id="idsCountdown" class="ids-timer-text">00:15</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

    _playIndSpkTopicAudio(item);
}

function _playIndSpkTopicAudio(item) {
    var mod = window.currentIndSpkModule;
    if (!mod || mod._destroyed) return;

    var url = item.audioUrl;
    if (!url || url.trim() === '') {
        console.warn('[IndSpk] 토픽 오디오 없음 — 2초 후 준비 단계 진행');
        setTimeout(function() {
            if (mod._destroyed) return;
            _startIndSpkPreparePhase();
        }, 2000);
        return;
    }

    mod.audioPlayer.play(url, function() {
        if (mod._destroyed) return;
        _startIndSpkPreparePhase();
    });
}

// ============================================================
// 준비 단계 (15초)
// ============================================================

function _startIndSpkPreparePhase() {
    var mod = window.currentIndSpkModule;
    if (!mod || mod._destroyed) return;

    var timerSection = document.getElementById('idsTimerSection');
    if (timerSection) timerSection.style.display = 'block';

    var phaseLabel = document.getElementById('idsPhaseLabel');
    if (phaseLabel) phaseLabel.textContent = 'PREPARATION TIME';

    var countdownEl = document.getElementById('idsCountdown');
    if (countdownEl) countdownEl.textContent = '00:15';

    mod.audioPlayer.play(INDSPK_AUDIO.prepareBeep, function() {
        if (mod._destroyed) return;
        _runIndSpkCountdown(INDSPK_PREP_SEC, function() {
            _startIndSpkSpeakPhase();
        });
    });
}

// ============================================================
// 응답 단계 (45초)
// ============================================================

function _startIndSpkSpeakPhase() {
    var mod = window.currentIndSpkModule;
    if (!mod || mod._destroyed) return;

    var phaseLabel = document.getElementById('idsPhaseLabel');
    if (phaseLabel) phaseLabel.textContent = 'RESPONSE TIME';

    var countdownEl = document.getElementById('idsCountdown');
    if (countdownEl) countdownEl.textContent = '00:45';

    var circle = document.getElementById('idsProgressCircle');
    if (circle) circle.style.strokeDashoffset = '125.6';

    mod.audioPlayer.play(INDSPK_AUDIO.speakBeep, function() {
        if (mod._destroyed) return;
        _runIndSpkCountdown(INDSPK_SPEAK_SEC, function() {
            _afterIndSpkSpeak();
        });
    });
}

// 말하기 종료 후 분기
//  - 수집 코호트 + 마감 전 + 첫 제출 → 녹음 업로드 화면
//  - 마감 후 / 이미 제출(재시도) → 업로드 헛수고 방지, 바로 완료화면으로 안내
//  - 비수집 코호트 → 기존 완료
function _afterIndSpkSpeak() {
    var mod = window.currentIndSpkModule;
    if (!mod || mod._destroyed) return;

    if (!mod.collect) {
        _showIndSpkComplete();
        return;
    }

    var passed = (typeof isTaskDeadlinePassed === 'function') ? isTaskDeadlinePassed() : false;
    if (passed) {
        mod._certResult = 'deadline';
        _showIndSpkComplete();
        return;
    }
    if (mod._hasInitial) {
        mod._certResult = 'redo';
        _showIndSpkComplete();
        return;
    }

    // 마감 전 + 첫 제출만 업로드 화면
    _showIndSpkUpload();
}

// ============================================================
// 카운트다운 공통
// ============================================================

function _runIndSpkCountdown(seconds, onDone) {
    var mod = window.currentIndSpkModule;
    if (!mod || mod._destroyed) return;

    var timeLeft = seconds;
    var totalTime = seconds;
    var countdownEl = document.getElementById('idsCountdown');
    var progressCircle = document.getElementById('idsProgressCircle');
    var circumference = 2 * Math.PI * 20;

    if (countdownEl) countdownEl.textContent = _idsFormatTime(timeLeft);
    if (progressCircle) {
        progressCircle.style.strokeDasharray = circumference;
        progressCircle.style.strokeDashoffset = circumference;
    }

    mod.timer = setInterval(function() {
        timeLeft--;
        if (countdownEl) countdownEl.textContent = _idsFormatTime(timeLeft);

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

function _showIndSpkUpload() {
    var mod = window.currentIndSpkModule;
    if (!mod || mod._destroyed) return;
    mod._selectedFile = null;

    var continueBtn = document.getElementById('indSpkContinueBtn');
    if (continueBtn) continueBtn.style.display = 'none';

    var container = document.getElementById('indSpkContent');
    container.innerHTML =
        '<div style="max-width:520px;margin:0 auto;padding:36px 20px;text-align:center;">' +
            '<div style="font-size:42px;margin-bottom:12px;">🎙️</div>' +
            '<h2 style="margin:0 0 8px;font-size:19px;color:#1a1a1a;">녹음 파일 업로드</h2>' +
            '<p style="font-size:14px;color:#666;line-height:1.7;margin:0 0 26px;">방금 말한 답변 녹음 파일을 올려주세요.<br>업로드하면 오늘 과제가 인증됩니다.</p>' +
            '<input type="file" accept="audio/*" id="idsFileInput" style="display:none;">' +
            '<button id="idsPickBtn" style="display:inline-block;padding:13px 26px;border-radius:10px;border:1.5px dashed #5B4A9E;background:#f4f3fb;color:#5B4A9E;font-size:15px;font-weight:600;cursor:pointer;">📁 파일 선택</button>' +
            '<div id="idsFileName" style="display:none;margin:14px auto 0;font-size:14px;color:#16a34a;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;max-width:90%;word-break:break-all;"></div>' +
            '<div style="margin-top:28px;">' +
                '<button id="idsSubmitBtn" style="width:100%;max-width:320px;padding:14px;border-radius:10px;border:none;background:#5B4A9E;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">제출</button>' +
            '</div>' +
        '</div>';

    var input = document.getElementById('idsFileInput');
    var pickBtn = document.getElementById('idsPickBtn');
    var nameEl = document.getElementById('idsFileName');
    var submitBtn = document.getElementById('idsSubmitBtn');

    pickBtn.onclick = function() { input.click(); };
    input.onchange = function() {
        if (input.files && input.files[0]) {
            mod._selectedFile = input.files[0];
            nameEl.textContent = '📎 ' + mod._selectedFile.name;
            nameEl.style.display = 'block';
            pickBtn.textContent = '📁 다른 파일 선택';
        }
    };
    submitBtn.onclick = function() { _idsTrySubmit(); };
}

function _idsTrySubmit() {
    var mod = window.currentIndSpkModule;
    if (!mod) return;
    if (!mod._selectedFile) {
        _idsShowNoFileWarning(function() { _idsDoSubmit(); });
        return;
    }
    _idsShowConfirm(mod._selectedFile, function() { _idsDoSubmit(); });
}

// 제출 확인 팝업 (파일명 + 미리듣기 + 박제 경고)
function _idsShowConfirm(file, onConfirm) {
    var existing = document.getElementById('idsConfirmOverlay');
    if (existing) existing.remove();

    var objUrl = URL.createObjectURL(file);
    var overlay = document.createElement('div');
    overlay.id = 'idsConfirmOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99998;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
        '<div style="background:#fff;border-radius:16px;padding:26px 22px;max-width:380px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
            '<div style="font-size:30px;margin-bottom:6px;">🎙️</div>' +
            '<h3 style="margin:0 0 12px;font-size:16px;color:#1a1a1a;">이 파일로 제출할까요?</h3>' +
            '<div style="font-size:13px;color:#16a34a;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;margin:0 0 10px;word-break:break-all;">📎 ' + _idsEscapeHtml(file.name) + '</div>' +
            '<audio controls src="' + objUrl + '" style="width:100%;margin:0 0 12px;"></audio>' +
            '<p style="font-size:12.5px;color:#ef4444;line-height:1.5;margin:0 0 18px;">제출 후에는 <strong>수정할 수 없어요.</strong> 한 번 들어보고 올려주세요.</p>' +
            '<div style="display:flex;gap:10px;">' +
                '<button id="idsConfirmCancel" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid #ddd;background:#fff;color:#666;font-size:14px;font-weight:600;cursor:pointer;">다시 고르기</button>' +
                '<button id="idsConfirmOk" style="flex:1;padding:12px;border-radius:10px;border:none;background:#5B4A9E;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">제출</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(overlay);

    document.getElementById('idsConfirmCancel').onclick = function() { URL.revokeObjectURL(objUrl); overlay.remove(); };
    document.getElementById('idsConfirmOk').onclick = function() { URL.revokeObjectURL(objUrl); overlay.remove(); if (onConfirm) onConfirm(); };
}

// 파일 없이 제출 시 경고 팝업
function _idsShowNoFileWarning(onConfirm) {
    var existing = document.getElementById('idsNoFileOverlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'idsNoFileOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99998;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
        '<div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:360px;width:88%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
            '<div style="font-size:32px;margin-bottom:10px;">🎙️</div>' +
            '<h3 style="margin:0 0 10px;font-size:16px;color:#1a1a1a;">녹음 파일이 없어요</h3>' +
            '<p style="font-size:13.5px;color:#666;line-height:1.6;margin:0 0 20px;">파일을 올리지 않았어요.<br>지금 제출하면 인증되지 않습니다.</p>' +
            '<div style="display:flex;gap:10px;">' +
                '<button id="idsNoFilePickBtn" style="flex:1;padding:12px;border-radius:10px;border:none;background:#5B4A9E;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">파일 올리기</button>' +
                '<button id="idsNoFileSubmitBtn" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid #ddd;background:#fff;color:#888;font-size:14px;font-weight:600;cursor:pointer;">그래도 제출</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(overlay);

    document.getElementById('idsNoFilePickBtn').onclick = function() { overlay.remove(); };
    document.getElementById('idsNoFileSubmitBtn').onclick = function() { overlay.remove(); if (onConfirm) onConfirm(); };
}

function _idsDoSubmit() {
    var mod = window.currentIndSpkModule;
    if (!mod || mod._destroyed) return;

    var container = document.getElementById('indSpkContent');
    container.innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:320px;gap:14px;">' +
            '<style>@keyframes idsSpin{to{transform:rotate(360deg)}}</style>' +
            '<div style="width:40px;height:40px;border:4px solid #e2e8f0;border-top-color:#5B4A9E;border-radius:50%;animation:idsSpin 0.8s linear infinite;"></div>' +
            '<p style="font-size:14px;color:#718096;">처리 중...</p>' +
        '</div>';

    _idsSaveAnswer().then(function() {
        if (mod._destroyed) return;
        _showIndSpkComplete();
    });
}

// 녹음 저장 (호주 라이팅 최종 모델 — 답안=녹음파일)
//  - 마감 전 + 파일 있음 + 첫 제출 → 파일 업로드 + initial_record 박제 = 인증
//  - 마감 후 / 파일 없음 / 재시도 → 저장 안 함. current_record 안 씀.
async function _idsSaveAnswer() {
    var mod = window.currentIndSpkModule;
    if (!mod) return;
    mod._certResult = null;

    if (!mod.collect) return;
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user || !user.id || user.id === 'dev-user-001') return;
    if (typeof upsertInitialRecord !== 'function') return;

    var passed = (typeof isTaskDeadlinePassed === 'function') ? isTaskDeadlinePassed() : false;
    if (passed) { mod._certResult = 'deadline'; console.log('[IndSpk] 마감 후 — 저장 안 함'); return; }
    if (mod._hasInitial) { mod._certResult = 'redo'; console.log('[IndSpk] 이미 제출됨 — 저장 안 함'); return; }
    if (!mod._selectedFile) { mod._certResult = 'blank'; console.log('[IndSpk] 파일 없음 — 저장 안 함'); return; }

    try {
        var file = mod._selectedFile;
        var rawExt = file.name.indexOf('.') >= 0 ? file.name.split('.').pop().toLowerCase() : '';
        var ext = (/^[a-z0-9]+$/.test(rawExt)) ? rawExt : 'bin';
        var storagePath = user.id + '/aus_ind-spk_' + mod.topicNumber + '_' + Date.now() + '.' + ext;

        var filePath = (typeof supabaseStorageUpload === 'function')
            ? await supabaseStorageUpload('speaking-files', storagePath, file)
            : null;
        if (!filePath) { mod._certResult = 'error'; console.error('[IndSpk] 파일 업로드 실패'); return; }

        mod._submitFileName = file.name;
        var recordJson = { audioPath: filePath, fileName: file.name, completedAt: new Date().toISOString() };
        await upsertInitialRecord(user.id, 'ind-spk', mod.topicNumber, mod.week, mod.day, recordJson, {
            locked_auth_rate: 100
        });
        mod._hasInitial = true;
        mod._certResult = 'certified';
        if (typeof ProgressTracker !== 'undefined' && ProgressTracker.markCompleted) ProgressTracker.markCompleted('ind-spk', mod.topicNumber);
        console.log('[IndSpk] 박제 완료: certified ' + file.name);
    } catch (e) {
        console.error('[IndSpk] 저장 실패:', e);
        mod._certResult = 'error';
    }
}

// ============================================================
// 완료 화면
// ============================================================

function _showIndSpkComplete() {
    var mod = window.currentIndSpkModule;
    if (!mod || mod._destroyed) return;

    var r = mod._certResult;
    var descHtml;
    if (!mod.collect || !r) {
        descHtml = '<p class="ids-complete-desc">독립형 스피킹을 마쳤습니다.</p>';
    } else if (r === 'certified') {
        descHtml = '<p class="ids-complete-desc" style="color:#16a34a;font-weight:600;">🎉 TOPIC ' + mod.topicNumber + ' 인증 완료! 녹음이 제출됐어요.</p>';
    } else if (r === 'redo') {
        descHtml = '<p class="ids-complete-desc">이미 제출한 과제예요. 다시 한 건 저장되지 않아요.</p>';
    } else if (r === 'deadline') {
        descHtml = '<p class="ids-complete-desc">마감이 지난 과제예요. 인증에는 반영되지 않습니다.</p>';
    } else if (r === 'error') {
        descHtml = '<p class="ids-complete-desc" style="color:#ef4444;">업로드 중 문제가 생겼어요. 다시 시도해 주세요.</p>';
    } else { // blank
        descHtml = '<p class="ids-complete-desc">녹음 파일이 없어 인증되지 않았어요. 다시 제출할 수 있어요.</p>';
    }

    var container = document.getElementById('indSpkContent');
    container.innerHTML =
        '<div class="ids-complete-screen">' +
            '<div class="ids-complete-card">' +
                '<div class="ids-complete-check">' +
                    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#48bb78" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                        '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
                        '<polyline points="22 4 12 14.01 9 11.01"/>' +
                    '</svg>' +
                '</div>' +
                '<h2 class="ids-complete-title">TOPIC ' + mod.topicNumber + ' 완료!</h2>' +
                descHtml +
                '<button class="ids-complete-btn" id="idsDoneBtn">확인</button>' +
            '</div>' +
        '</div>';

    document.getElementById('idsDoneBtn').onclick = function() {
        cleanupIndSpkModule();
        backToAusTaskSelect();
    };
}

// ============================================================
// 뒤로가기 / 정리
// ============================================================

function cleanupIndSpkModule() {
    var mod = window.currentIndSpkModule;
    if (!mod) return;

    mod._destroyed = true;

    if (mod.timer) {
        clearInterval(mod.timer);
        mod.timer = null;
    }

    if (mod.audioPlayer) {
        mod.audioPlayer.stop();
        mod.audioPlayer.destroy();
    }

    window.currentIndSpkModule = null;
    console.log('[IndSpk] cleanup 완료');
}

// ============================================================
// 유틸
// ============================================================

function _idsFormatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
}

function _idsEscapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================
// 토픽 번호 추출 유틸 (main.js에서 사용)
// ============================================================

function _getAusIndSpkNumber(taskName) {
    var match = taskName.match(/독스\s*(?:TOPIC\s*)?(\d+)/i);
    return match ? parseInt(match[1]) : null;
}

window.startIndSpkModule = startIndSpkModule;
window.cleanupIndSpkModule = cleanupIndSpkModule;
window._getAusIndSpkNumber = _getAusIndSpkNumber;

console.log('[IndSpk] ind-spk-component.js 로드 완료');
