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

// ============================================================
// 전역 상태
// ============================================================
window.currentIndSpkModule = null;

// ============================================================
// 진입점
// ============================================================

async function startIndSpkModule(topicNumber) {
    console.log('\n============================');
    console.log('Independent Speaking TOPIC ' + topicNumber + ' 시작');
    console.log('============================\n');

    var audioPlayer = new AudioPlayer();

    window.currentIndSpkModule = {
        topicNumber: topicNumber,
        audioPlayer: audioPlayer,
        data: null,
        timer: null,
        _destroyed: false
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

    _playIndSpkIntroNarration();
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
        _runIndSpkCountdown(15, function() {
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
        _runIndSpkCountdown(45, function() {
            _showIndSpkComplete();
        });
    });
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
// 완료 화면
// ============================================================

function _showIndSpkComplete() {
    var mod = window.currentIndSpkModule;
    if (!mod || mod._destroyed) return;

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
                '<p class="ids-complete-desc">독립형 스피킹을 마쳤습니다.</p>' +
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
