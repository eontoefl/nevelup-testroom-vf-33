var INTWRT_DIRECTIONS = 'You have 20 minutes to plan and write your response. Your response will be judged on the basis of the quality of your writing and on how well your response presents the points in the lecture and their relationship to the reading passage. Typically an effective response will be 150 to 225 words.';

var INTWRT_QUESTION = 'Summarize the points made in the lecture, being sure to explain how they cast doubt on specific points made in the reading passage.';

var INTWRT_CONFIG = {
    readingTime: 180,
    writingTime: 1200
};

window.currentIntwrtModule = null;

// ============================================================
// 진입점
// ============================================================

async function startIntwrtModule(itemNumber) {
    console.log('\n============================');
    console.log('IntWrt ' + itemNumber + ' 시작');
    console.log('============================\n');

    var audioPlayer = new AudioPlayer();

    window.currentIntwrtModule = {
        itemNumber: itemNumber,
        audioPlayer: audioPlayer,
        data: null,
        item: null,
        timer: null,
        _destroyed: false,
        _timeHidden: false,
        _wordCountHidden: false,
        _undoStack: [],
        _redoStack: [],
        _lastText: ''
    };

    var titleEl = document.getElementById('intwrtTitle');
    if (titleEl) titleEl.textContent = '통라 ' + itemNumber;

    showScreen('intwrtScreen');
    _showIntwrtLoading();

    try {
        var result = await loadIntwrtData();
        if (!result) throw new Error('데이터 없음');
        window.currentIntwrtModule.data = result;

        var item = result.items[itemNumber - 1];
        if (!item) throw new Error('통라 ' + itemNumber + ' 데이터 없음');
        window.currentIntwrtModule.item = item;

        console.log('[IntWrt] 데이터 로드 완료');
    } catch (e) {
        console.error('[IntWrt] 데이터 로드 실패:', e);
        alert('데이터를 불러올 수 없습니다.');
        _backFromIntwrt();
        return;
    }

    _showIntwrtReadingScreen();
}

function _showIntwrtLoading() {
    var container = document.getElementById('intwrtContent');
    container.innerHTML =
        '<div class="iw-loading-screen">' +
            '<p style="color:#3e484f;font-size:16px;">데이터 로딩 중...</p>' +
        '</div>';
}

// ============================================================
// 화면1: 리딩 (3분 타이머)
// ============================================================

function _showIntwrtReadingScreen() {
    var mod = window.currentIntwrtModule;
    if (!mod || mod._destroyed) return;

    var item = mod.item;
    var readingTime = INTWRT_CONFIG.readingTime;

    var container = document.getElementById('intwrtContent');
    container.innerHTML =
        '<div class="iw-reading-screen">' +
            '<div class="iw-reading-topbar">' +
                '<div class="iw-topbar-left"></div>' +
                '<div class="iw-topbar-right">' +
                    '<span class="iw-timer" id="iwReadingTimer">' + _iwFormatTime(readingTime) + '</span>' +
                    '<button class="iw-hide-time-btn" id="iwHideTimeBtn1" onclick="_iwToggleTime(\'iwReadingTimer\', \'iwHideTimeBtn1\')">' +
                        '<i class="fas fa-eye"></i> Hide Time' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="iw-reading-split">' +
                '<div class="iw-reading-left">' +
                    '<div class="iw-passage-scroll">' +
                        '<div class="iw-passage-text">' + _iwEscapeHtml(item.passage) + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="iw-reading-right"></div>' +
            '</div>' +
        '</div>';

    var nextBtn = document.getElementById('intwrtNextBtn');
    if (nextBtn) {
        nextBtn.style.display = 'inline-block';
        nextBtn.onclick = function() {
            _clearIntwrtTimer();
            _showIntwrtAudioScreen();
        };
    }

    _runIntwrtReadingCountdown(readingTime);
}

function _runIntwrtReadingCountdown(seconds) {
    var mod = window.currentIntwrtModule;
    if (!mod || mod._destroyed) return;

    var timeLeft = seconds;
    var timerEl = document.getElementById('iwReadingTimer');

    mod.timer = setInterval(function() {
        timeLeft--;
        if (timerEl && !mod._timeHidden) timerEl.textContent = _iwFormatTime(timeLeft);

        if (timeLeft <= 0) {
            _clearIntwrtTimer();
            _showIntwrtAudioScreen();
        }
    }, 1000);
}

// ============================================================
// 화면2: 오디오 재생
// ============================================================

function _showIntwrtAudioScreen() {
    var mod = window.currentIntwrtModule;
    if (!mod || mod._destroyed) return;

    mod._timeHidden = false;

    var nextBtn = document.getElementById('intwrtNextBtn');
    if (nextBtn) nextBtn.style.display = 'none';

    var item = mod.item;
    var container = document.getElementById('intwrtContent');
    container.innerHTML =
        '<div class="iw-audio-screen">' +
            (item.lectureImageUrl
                ? '<div class="iw-audio-image"><img src="' + item.lectureImageUrl + '" alt=""></div>'
                : '<div class="iw-audio-icon"><i class="fas fa-volume-up"></i></div>') +
        '</div>';

    var url = item.lectureAudioUrl;
    if (!url || url.trim() === '') {
        console.warn('[IntWrt] 메인 오디오 없음 — 2초 후 에디터 단계 진행');
        setTimeout(function() {
            if (mod._destroyed) return;
            _showIntwrtWritingScreen();
        }, 2000);
        return;
    }

    mod.audioPlayer.play(url, function() {
        if (mod._destroyed) return;
        _showIntwrtWritingScreen();
    });
}

// ============================================================
// 화면3: 에디터 (20분 타이머)
// ============================================================

function _showIntwrtWritingScreen() {
    var mod = window.currentIntwrtModule;
    if (!mod || mod._destroyed) return;

    var item = mod.item;
    var writingTime = INTWRT_CONFIG.writingTime;

    var nextBtn = document.getElementById('intwrtNextBtn');
    if (nextBtn) {
        nextBtn.style.display = 'inline-block';
        nextBtn.onclick = function() {
            _clearIntwrtTimer();
            _showIntwrtTransition();
        };
    }

    var container = document.getElementById('intwrtContent');
    container.innerHTML =
        '<div class="iw-writing-screen">' +
            '<div class="iw-writing-topbar">' +
                '<div class="iw-topbar-left"></div>' +
                '<div class="iw-topbar-right">' +
                    '<span class="iw-timer" id="iwWritingTimer">' + _iwFormatTime(writingTime) + '</span>' +
                    '<button class="iw-hide-time-btn" id="iwHideTimeBtn3" onclick="_iwToggleTime(\'iwWritingTimer\', \'iwHideTimeBtn3\')">' +
                        '<i class="fas fa-eye"></i> Hide Time' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="iw-directions-bar">' +
                '<p class="iw-directions-text"><strong>Directions:</strong> ' + INTWRT_DIRECTIONS + '</p>' +
            '</div>' +
            '<div class="iw-question-bar">' +
                '<p class="iw-question-text"><strong>Question:</strong> ' + INTWRT_QUESTION + '</p>' +
            '</div>' +
            '<div class="iw-editor-split">' +
                '<div class="iw-editor-left">' +
                    '<div class="iw-passage-scroll">' +
                        '<div class="iw-passage-text">' + _iwEscapeHtml(item.passage) + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="iw-editor-right">' +
                    '<div class="iw-toolbar">' +
                        '<div class="iw-toolbar-buttons">' +
                            '<button class="iw-tool-btn" onclick="_iwCut()" title="Cut">Cut</button>' +
                            '<button class="iw-tool-btn" onclick="_iwPaste()" title="Paste">Paste</button>' +
                            '<button class="iw-tool-btn" onclick="_iwUndo()" title="Undo">Undo</button>' +
                            '<button class="iw-tool-btn" onclick="_iwRedo()" title="Redo">Redo</button>' +
                        '</div>' +
                        '<div class="iw-toolbar-right">' +
                            '<button class="iw-tool-btn iw-hide-wc-btn" id="iwHideWcBtn" onclick="_iwToggleWordCount()">Hide Word Count</button>' +
                            '<span class="iw-word-count" id="iwWordCount">Word Count: 0</span>' +
                        '</div>' +
                    '</div>' +
                    '<textarea class="iw-textarea" id="iwTextarea" placeholder="Type your response here..."></textarea>' +
                '</div>' +
            '</div>' +
        '</div>';

    var textarea = document.getElementById('iwTextarea');
    if (textarea) {
        mod._lastText = '';
        mod._undoStack = [''];
        mod._redoStack = [];

        textarea.addEventListener('input', function() {
            _iwUpdateWordCount();
            _iwPushUndo();
        });

        textarea.focus();
    }

    _runIntwrtWritingCountdown(writingTime);
}

function _runIntwrtWritingCountdown(seconds) {
    var mod = window.currentIntwrtModule;
    if (!mod || mod._destroyed) return;

    var timeLeft = seconds;
    var timerEl = document.getElementById('iwWritingTimer');

    mod.timer = setInterval(function() {
        timeLeft--;
        if (timerEl && !mod._timeHidden) timerEl.textContent = _iwFormatTime(timeLeft);

        if (timeLeft <= 0) {
            _clearIntwrtTimer();
            _showIntwrtTransition();
        }
    }, 1000);
}

// ============================================================
// 에디터 기능: Cut, Paste, Undo, Redo, Word Count
// ============================================================

function _iwCut() {
    var textarea = document.getElementById('iwTextarea');
    if (!textarea) return;

    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    if (start === end) return;

    var selected = textarea.value.substring(start, end);
    navigator.clipboard.writeText(selected).catch(function() {});

    textarea.value = textarea.value.substring(0, start) + textarea.value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start;
    textarea.focus();

    _iwUpdateWordCount();
    _iwPushUndo();
}

function _iwPaste() {
    var textarea = document.getElementById('iwTextarea');
    if (!textarea) return;

    navigator.clipboard.readText().then(function(text) {
        if (!text) return;
        var start = textarea.selectionStart;
        var end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        textarea.focus();

        _iwUpdateWordCount();
        _iwPushUndo();
    }).catch(function() {
        textarea.focus();
        document.execCommand('paste');
    });
}

function _iwUndo() {
    var mod = window.currentIntwrtModule;
    if (!mod) return;
    var textarea = document.getElementById('iwTextarea');
    if (!textarea) return;

    if (mod._undoStack.length <= 1) return;

    var current = mod._undoStack.pop();
    mod._redoStack.push(current);
    textarea.value = mod._undoStack[mod._undoStack.length - 1];
    mod._lastText = textarea.value;
    textarea.focus();
    _iwUpdateWordCount();
}

function _iwRedo() {
    var mod = window.currentIntwrtModule;
    if (!mod) return;
    var textarea = document.getElementById('iwTextarea');
    if (!textarea) return;

    if (mod._redoStack.length === 0) return;

    var text = mod._redoStack.pop();
    mod._undoStack.push(text);
    textarea.value = text;
    mod._lastText = text;
    textarea.focus();
    _iwUpdateWordCount();
}

function _iwPushUndo() {
    var mod = window.currentIntwrtModule;
    if (!mod) return;
    var textarea = document.getElementById('iwTextarea');
    if (!textarea) return;

    var text = textarea.value;
    if (text === mod._lastText) return;

    mod._undoStack.push(text);
    mod._redoStack = [];
    mod._lastText = text;
}

function _iwUpdateWordCount() {
    var textarea = document.getElementById('iwTextarea');
    var wcEl = document.getElementById('iwWordCount');
    if (!textarea || !wcEl) return;

    var text = textarea.value.trim();
    var count = 0;
    if (text.length > 0) {
        count = text.split(/\s+/).length;
    }
    wcEl.textContent = 'Word Count: ' + count;
}

function _iwToggleWordCount() {
    var mod = window.currentIntwrtModule;
    if (!mod) return;

    mod._wordCountHidden = !mod._wordCountHidden;
    var wcEl = document.getElementById('iwWordCount');
    var btn = document.getElementById('iwHideWcBtn');

    if (wcEl) wcEl.style.display = mod._wordCountHidden ? 'none' : '';
    if (btn) btn.textContent = mod._wordCountHidden ? 'Show Word Count' : 'Hide Word Count';
}

// ============================================================
// Hide Time 토글
// ============================================================

function _iwToggleTime(timerId, btnId) {
    var mod = window.currentIntwrtModule;
    if (!mod) return;

    mod._timeHidden = !mod._timeHidden;
    var timerEl = document.getElementById(timerId);
    var btn = document.getElementById(btnId);

    if (timerEl) timerEl.style.visibility = mod._timeHidden ? 'hidden' : 'visible';
    if (btn) {
        btn.innerHTML = mod._timeHidden
            ? '<i class="fas fa-eye-slash"></i> Show Time'
            : '<i class="fas fa-eye"></i> Hide Time';
    }
}

// ============================================================
// 전환 스피너 → 완료
// ============================================================

function _showIntwrtTransition() {
    var mod = window.currentIntwrtModule;
    if (!mod || mod._destroyed) return;

    var nextBtn = document.getElementById('intwrtNextBtn');
    if (nextBtn) nextBtn.style.display = 'none';

    var container = document.getElementById('intwrtContent');
    container.innerHTML =
        '<div class="iw-spinner-wrap">' +
            '<div class="iw-spinner"></div>' +
        '</div>';

    setTimeout(function() {
        if (mod._destroyed) return;
        _showIntwrtComplete();
    }, 1500);
}

function _showIntwrtComplete() {
    var mod = window.currentIntwrtModule;
    if (!mod || mod._destroyed) return;

    var container = document.getElementById('intwrtContent');
    container.innerHTML =
        '<div class="iw-complete-screen">' +
            '<div class="iw-complete-card">' +
                '<div class="iw-complete-check">' +
                    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#48bb78" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                        '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
                        '<polyline points="22 4 12 14.01 9 11.01"/>' +
                    '</svg>' +
                '</div>' +
                '<h2 class="iw-complete-title">통라 ' + mod.itemNumber + ' 완료!</h2>' +
                '<p class="iw-complete-desc">통합형 라이팅 연습을 마쳤습니다.</p>' +
                '<button class="iw-complete-btn" id="iwCompleteBtn">확인</button>' +
            '</div>' +
        '</div>';

    document.getElementById('iwCompleteBtn').onclick = function() {
        cleanupIntwrtModule();
        _backFromIntwrt();
    };
}

// ============================================================
// 뒤로가기 / 정리
// ============================================================

function _backFromIntwrt() {
    showScreen('ausTaskSelectScreen');
}

function cleanupIntwrtModule() {
    var mod = window.currentIntwrtModule;
    if (!mod) return;

    mod._destroyed = true;
    _clearIntwrtTimer();

    if (mod.audioPlayer) {
        mod.audioPlayer.stop();
        mod.audioPlayer.destroy();
    }

    window.currentIntwrtModule = null;
    console.log('[IntWrt] cleanup 완료');
}

function _clearIntwrtTimer() {
    var mod = window.currentIntwrtModule;
    if (!mod) return;
    if (mod.timer) {
        clearInterval(mod.timer);
        mod.timer = null;
    }
}

// ============================================================
// 유틸
// ============================================================

function _iwFormatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
}

function _iwEscapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function _getAusIntwrtNumber(taskName) {
    var match = taskName.match(/^통라\s*(\d+)$/);
    return match ? parseInt(match[1]) : null;
}

window.startIntwrtModule = startIntwrtModule;
window.cleanupIntwrtModule = cleanupIntwrtModule;
window._getAusIntwrtNumber = _getAusIntwrtNumber;
window._backFromIntwrt = _backFromIntwrt;
window._iwToggleTime = _iwToggleTime;
window._iwCut = _iwCut;
window._iwPaste = _iwPaste;
window._iwUndo = _iwUndo;
window._iwRedo = _iwRedo;
window._iwToggleWordCount = _iwToggleWordCount;

console.log('[IntWrt] intwrt-component.js 로드 완료');
