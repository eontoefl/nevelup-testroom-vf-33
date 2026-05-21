/**
 * brainstorming-component.js
 * 브레인스토밍 컴포넌트
 *
 * 플로우:
 *   인트로(나레이션) → [주제 표시 + 토픽 오디오] → 준비 15초 → 응답 45초 → 완료 확인 → 반복
 *   Day 1개 = 주제 2개
 */

// ============================================================
// 오디오 URL
// ============================================================
var BRAINSTORM_AUDIO = {
    introNarration: 'https://eontoefl.github.io/toefl-audio/australia/audio/intro_audio/indspk_brainstorm_intro.mp3',
    prepareBeep: 'https://eontoefl.github.io/toefl-audio/australia/audio/fixed_audio/prepare_beep.mp3',
    speakBeep: 'https://eontoefl.github.io/toefl-audio/australia/audio/fixed_audio/begin_beep.mp3'
};

// ============================================================
// 전역 상태
// ============================================================
window.currentBrainstormModule = null;

// ============================================================
// 진입점
// ============================================================

async function startBrainstormModule(dayNumber) {
    console.log('\n============================');
    console.log('Brainstorming Day ' + dayNumber + ' 시작');
    console.log('============================\n');

    var audioPlayer = new AudioPlayer();

    window.currentBrainstormModule = {
        dayNumber: dayNumber,
        audioPlayer: audioPlayer,
        data: null,
        currentTopicIndex: 0,
        timer: null,
        _destroyed: false
    };

    // 헤더 타이틀 업데이트
    var titleEl = document.getElementById('brainstormTitle');
    if (titleEl) titleEl.textContent = 'Brainstorming Day ' + dayNumber;

    showScreen('brainstormScreen');
    _showBrainstormIntroScreen();

    try {
        var result = await loadBrainstormData();
        if (!result) throw new Error('데이터 없음');
        window.currentBrainstormModule.data = result;
        console.log('[Brainstorm] 데이터 로드 완료');
    } catch (e) {
        console.error('[Brainstorm] 데이터 로드 실패:', e);
        alert('데이터를 불러올 수 없습니다.');
        backToAusTaskSelect();
        return;
    }

    _playIntroNarration();
}

// ============================================================
// 인트로 화면
// ============================================================

function _showBrainstormIntroScreen() {
    var container = document.getElementById('brainstormContent');

    container.innerHTML =
        '<div class="bs-intro-screen">' +
            '<div class="bs-intro-card">' +
                '<div class="bs-intro-icon">' +
                    '<i class="fas fa-brain"></i>' +
                '</div>' +
                '<h1 class="bs-intro-title">Brainstorming</h1>' +
                '<div class="bs-intro-text">' +
                    '<p>In this question, you will be asked to talk about a familiar topic.</p>' +
                    '<p>After you hear the question, you will have <strong>15 seconds</strong> to prepare your response, and <strong>45 seconds</strong> to speak.</p>' +
                '</div>' +
                '<div class="bs-intro-note">' +
                    'Please listen carefully.' +
                '</div>' +
            '</div>' +
        '</div>';

    var continueBtn = document.getElementById('brainstormContinueBtn');
    continueBtn.style.display = 'inline-block';
    continueBtn.disabled = false;
    continueBtn.style.opacity = '1';
    continueBtn.style.cursor = 'pointer';
    continueBtn.onclick = function() {
        _startTopicPhase();
    };
}

function _playIntroNarration() {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    mod.audioPlayer.play(BRAINSTORM_AUDIO.introNarration, function() {
        if (mod._destroyed) return;
        _enableContinueBtn();
    });
}

function _enableContinueBtn() {
    var btn = document.getElementById('brainstormContinueBtn');
    if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
}

// ============================================================
// 주제 화면
// ============================================================

function _startTopicPhase() {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    var dayIndex = mod.dayNumber - 1;
    var dayData = mod.data.days[dayIndex];
    if (!dayData) {
        alert('Day ' + mod.dayNumber + ' 데이터가 없습니다.');
        backToAusTaskSelect();
        return;
    }

    mod.currentTopicIndex = 0;
    _showTopicScreen(dayData, 0);
}

function _showTopicScreen(dayData, topicIndex) {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    var topic = dayData.topics[topicIndex];
    var label = 'Brainstorming Day ' + mod.dayNumber + '-' + (topicIndex + 1);

    var continueBtn = document.getElementById('brainstormContinueBtn');
    continueBtn.style.display = 'none';

    var container = document.getElementById('brainstormContent');
    container.innerHTML =
        '<div class="bs-topic-wrap">' +
            '<div class="bs-topic-label">' + label + '</div>' +
            '<div class="bs-topic-text">' + _escapeHtml(topic.text) + '</div>' +
            '<div class="bs-timer-section" id="bsTimerSection" style="display:none;">' +
                '<div class="bs-timer-display">' +
                    '<div class="bs-timer-phase-label" id="bsPhaseLabel">PREPARATION TIME</div>' +
                    '<div class="bs-timer-content">' +
                        '<div class="bs-timer-wrapper">' +
                            '<div class="bs-progress-circle">' +
                                '<svg width="50" height="50" viewBox="0 0 50 50">' +
                                    '<circle class="bs-progress-circle-bg" cx="25" cy="25" r="20"></circle>' +
                                    '<circle id="bsProgressCircle" class="bs-progress-circle-fill" cx="25" cy="25" r="20" ' +
                                            'stroke-dasharray="125.6" stroke-dashoffset="125.6"></circle>' +
                                '</svg>' +
                                '<svg class="bs-mic-icon" fill="currentColor" viewBox="0 0 20 20">' +
                                    '<path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"/>' +
                                '</svg>' +
                            '</div>' +
                            '<span id="bsCountdown" class="bs-timer-text">00:15</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

    _playTopicAudio(dayData, topicIndex, topic);
}

function _playTopicAudio(dayData, topicIndex, topic) {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    var url = topic.audioUrl;
    if (!url || url.trim() === '') {
        console.warn('[Brainstorm] 토픽 오디오 없음 — 2초 후 준비 단계 진행');
        setTimeout(function() {
            if (mod._destroyed) return;
            _startPreparePhase(dayData, topicIndex);
        }, 2000);
        return;
    }

    mod.audioPlayer.play(url, function() {
        if (mod._destroyed) return;
        _startPreparePhase(dayData, topicIndex);
    });
}

// ============================================================
// 준비 단계 (15초)
// ============================================================

function _startPreparePhase(dayData, topicIndex) {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    var timerSection = document.getElementById('bsTimerSection');
    if (timerSection) timerSection.style.display = 'block';

    var phaseLabel = document.getElementById('bsPhaseLabel');
    if (phaseLabel) phaseLabel.textContent = 'PREPARATION TIME';

    var countdownEl = document.getElementById('bsCountdown');
    if (countdownEl) countdownEl.textContent = '00:15';

    mod.audioPlayer.play(BRAINSTORM_AUDIO.prepareBeep, function() {
        if (mod._destroyed) return;
        _runCountdown(15, function() {
            _startSpeakPhase(dayData, topicIndex);
        });
    });
}

// ============================================================
// 응답 단계 (45초)
// ============================================================

function _startSpeakPhase(dayData, topicIndex) {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    var phaseLabel = document.getElementById('bsPhaseLabel');
    if (phaseLabel) phaseLabel.textContent = 'RESPONSE TIME';

    var countdownEl = document.getElementById('bsCountdown');
    if (countdownEl) countdownEl.textContent = '00:45';

    var circle = document.getElementById('bsProgressCircle');
    if (circle) circle.style.strokeDashoffset = '125.6';

    mod.audioPlayer.play(BRAINSTORM_AUDIO.speakBeep, function() {
        if (mod._destroyed) return;
        _runCountdown(45, function() {
            _onTopicComplete(dayData, topicIndex);
        });
    });
}

// ============================================================
// 카운트다운 공통
// ============================================================

function _runCountdown(seconds, onDone) {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    var timeLeft = seconds;
    var totalTime = seconds;
    var countdownEl = document.getElementById('bsCountdown');
    var progressCircle = document.getElementById('bsProgressCircle');
    var circumference = 2 * Math.PI * 20; // r=20

    if (countdownEl) countdownEl.textContent = _formatTime(timeLeft);
    if (progressCircle) {
        progressCircle.style.strokeDasharray = circumference;
        progressCircle.style.strokeDashoffset = circumference;
    }

    mod.timer = setInterval(function() {
        timeLeft--;
        if (countdownEl) countdownEl.textContent = _formatTime(timeLeft);

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
// 주제 완료
// ============================================================

function _onTopicComplete(dayData, topicIndex) {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    var currentLabel = mod.dayNumber + '-' + (topicIndex + 1);
    var nextTopicIndex = topicIndex + 1;

    if (nextTopicIndex < dayData.topics.length) {
        var nextLabel = mod.dayNumber + '-' + (nextTopicIndex + 1);
        _showCompletionConfirm(currentLabel, nextLabel, function() {
            mod.currentTopicIndex = nextTopicIndex;
            _showTopicScreen(dayData, nextTopicIndex);
        });
    } else {
        _showDayComplete();
    }
}

function _showCompletionConfirm(currentLabel, nextLabel, onConfirm) {
    var mod = window.currentBrainstormModule;
    var container = document.getElementById('brainstormContent');
    container.innerHTML =
        '<div class="bs-complete-screen">' +
            '<div class="bs-complete-card">' +
                '<div class="bs-complete-check">' +
                    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#48bb78" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                        '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
                        '<polyline points="22 4 12 14.01 9 11.01"/>' +
                    '</svg>' +
                '</div>' +
                '<h2 class="bs-complete-title">Day ' + currentLabel + ' 완료</h2>' +
                '<p class="bs-complete-desc">Day ' + nextLabel + ' 로 넘어가시겠습니까?</p>' +
                '<button class="bs-complete-btn" id="bsConfirmBtn">다음으로</button>' +
            '</div>' +
        '</div>';

    document.getElementById('bsConfirmBtn').onclick = function() {
        if (onConfirm) onConfirm();
    };
}

function _showDayComplete() {
    var mod = window.currentBrainstormModule;
    var container = document.getElementById('brainstormContent');
    container.innerHTML =
        '<div class="bs-complete-screen">' +
            '<div class="bs-complete-card">' +
                '<div class="bs-complete-check">' +
                    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#48bb78" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                        '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
                        '<polyline points="22 4 12 14.01 9 11.01"/>' +
                    '</svg>' +
                '</div>' +
                '<h2 class="bs-complete-title">Day ' + mod.dayNumber + ' 완료!</h2>' +
                '<p class="bs-complete-desc">오늘의 브레인스토밍을 모두 마쳤습니다.</p>' +
                '<button class="bs-complete-btn" id="bsDayDoneBtn">확인</button>' +
            '</div>' +
        '</div>';

    document.getElementById('bsDayDoneBtn').onclick = function() {
        cleanupBrainstormModule();
        backToAusTaskSelect();
    };
}

// ============================================================
// 뒤로가기 / 정리
// ============================================================

function backToAusTaskSelect() {
    showScreen('ausTaskSelectScreen');
}

function cleanupBrainstormModule() {
    var mod = window.currentBrainstormModule;
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

    window.currentBrainstormModule = null;
    console.log('[Brainstorm] cleanup 완료');
}

// ============================================================
// 유틸
// ============================================================

function _formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
}

function _escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================
// Day 번호 추출 유틸 (main.js에서 사용)
// ============================================================

function _getAusBrainstormDay(taskName) {
    var match = taskName.match(/브레인스토밍\s*Day\s*(\d+)/i);
    return match ? parseInt(match[1]) : null;
}

window.startBrainstormModule = startBrainstormModule;
window.cleanupBrainstormModule = cleanupBrainstormModule;
window._getAusBrainstormDay = _getAusBrainstormDay;

console.log('[Brainstorming] brainstorming-component.js 로드 완료');
