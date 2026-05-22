/**
 * aus-discussion-component.js
 * 호주버전 토론형 라이팅(토라) 컴포넌트
 *
 * - 정규과정 Discussion 레이아웃 동일
 * - 학생 이름 고정: Claire / Andrew
 * - 교수 남/녀 랜덤
 * - 에디터 전체 유지 (Cut/Paste/Undo/Redo/WordCount)
 * - 답안 DB 저장 없음, TXT 다운로드 지원
 */

var AUS_DISC_CONFIG = {
    writingTime: 600
};

var AUS_DISC_STUDENT1 = {
    name: 'Claire',
    image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_F1.png'
};

var AUS_DISC_STUDENT2 = {
    name: 'Andrew',
    image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_M1.png'
};

var AUS_DISC_PROFESSORS = {
    male: {
        name: 'Dr. Gupta',
        image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_prof_M.png'
    },
    female: {
        name: 'Dr. Samantha',
        image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_prof_F.png'
    }
};

window.currentAusDiscModule = null;

// ============================================================
// 진입점
// ============================================================

async function startAusDiscussionModule(itemNumber) {
    console.log('\n============================');
    console.log('AusDisc ' + itemNumber + ' 시작');
    console.log('============================\n');

    var profGender = Math.random() < 0.5 ? 'male' : 'female';

    window.currentAusDiscModule = {
        itemNumber: itemNumber,
        data: null,
        item: null,
        professor: AUS_DISC_PROFESSORS[profGender],
        timer: null,
        _destroyed: false,
        _wordCountHidden: false,
        _undoStack: [],
        _redoStack: [],
        _lastText: '',
        _savedAnswer: ''
    };

    var titleEl = document.getElementById('ausDiscTitle');
    if (titleEl) titleEl.textContent = '토라 ' + itemNumber;

    var headerRight = document.getElementById('ausDiscHeaderRight');
    if (headerRight) headerRight.style.display = '';

    showScreen('ausDiscussionScreen');
    _showAusDiscLoading();

    try {
        var result = await loadAusDiscussionData();
        if (!result) throw new Error('데이터 없음');
        window.currentAusDiscModule.data = result;

        var item = result.items[itemNumber - 1];
        if (!item) throw new Error('토라 ' + itemNumber + ' 데이터 없음');
        window.currentAusDiscModule.item = item;

        console.log('[AusDisc] 데이터 로드 완료');
    } catch (e) {
        console.error('[AusDisc] 데이터 로드 실패:', e);
        alert('데이터를 불러올 수 없습니다.');
        _backFromAusDisc();
        return;
    }

    _showAusDiscScreen();
}

// ============================================================
// 로딩 화면
// ============================================================

function _showAusDiscLoading() {
    var container = document.getElementById('ausDiscContent');
    container.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;">' +
            '<p style="color:#3e484f;font-size:16px;">데이터 로딩 중...</p>' +
        '</div>';
}

// ============================================================
// 메인 화면: 문제 + 에디터
// ============================================================

function _showAusDiscScreen() {
    var mod = window.currentAusDiscModule;
    if (!mod || mod._destroyed) return;

    var item = mod.item;
    var prof = mod.professor;
    var writingTime = AUS_DISC_CONFIG.writingTime;

    var s1Opinion = _adReplaceNames(item.student1Opinion);
    var s2Opinion = _adReplaceNames(item.student2Opinion);
    var topic = _adReplaceNames(item.topic);
    var context = _adReplaceNames(item.classContext);

    var container = document.getElementById('ausDiscContent');
    container.innerHTML =
        '<div class="discussion-layout" style="flex:1;min-height:0;overflow-y:auto;">' +
            '<div class="discussion-task-panel">' +
                '<div class="discussion-task-box">' +
                    '<p class="discussion-context">' + _adEscapeHtml(context) + '</p>' +
                    '<div class="discussion-instruction">' +
                        '<p class="discussion-instruction-title">In your response, you should do the following.</p>' +
                        '<ul class="discussion-instructions">' +
                            '<li>Express and support your opinion.</li>' +
                            '<li>Make a contribution to the discussion in your own words.</li>' +
                        '</ul>' +
                        '<p class="discussion-note">An effective response will contain at least 100 words.</p>' +
                    '</div>' +
                    '<div class="professor-section">' +
                        '<img src="' + prof.image + '" alt="Professor" class="professor-image">' +
                        '<p style="font-weight:bold;margin:0 0 8px 0;font-size:15px;">' + _adEscapeHtml(prof.name) + '</p>' +
                        '<p class="discussion-topic">' + _adEscapeHtml(topic) + '</p>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="discussion-response-panel">' +
                '<div class="student-opinions">' +
                    '<div class="student-opinion">' +
                        '<img src="' + AUS_DISC_STUDENT1.image + '" alt="Claire" class="student-image">' +
                        '<div style="flex:1;">' +
                            '<div class="student-name" style="margin-bottom:5px;">Claire</div>' +
                            '<p class="student-text">' + _adEscapeHtml(s1Opinion) + '</p>' +
                        '</div>' +
                    '</div>' +
                    '<div class="student-opinion">' +
                        '<img src="' + AUS_DISC_STUDENT2.image + '" alt="Andrew" class="student-image">' +
                        '<div style="flex:1;">' +
                            '<div class="student-name" style="margin-bottom:5px;">Andrew</div>' +
                            '<p class="student-text">' + _adEscapeHtml(s2Opinion) + '</p>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="discussion-editor-box">' +
                    '<div class="discussion-editor-toolbar">' +
                        '<div class="toolbar-left">' +
                            '<button class="toolbar-btn" onclick="_adCut()" title="Cut"><i class="fas fa-cut"></i> Cut</button>' +
                            '<button class="toolbar-btn" onclick="_adPaste()" title="Paste"><i class="fas fa-paste"></i> Paste</button>' +
                            '<button class="toolbar-btn" onclick="_adUndo()" title="Undo"><i class="fas fa-undo"></i> Undo</button>' +
                            '<button class="toolbar-btn" onclick="_adRedo()" title="Redo"><i class="fas fa-redo"></i> Redo</button>' +
                        '</div>' +
                        '<div class="toolbar-right">' +
                            '<button id="adHideWcBtn" class="toolbar-btn-link" onclick="_adToggleWordCount()"><i class="fas fa-eye-slash"></i> Hide Word Count</button>' +
                            '<span class="word-count"><span id="adWordCount">0</span></span>' +
                        '</div>' +
                    '</div>' +
                    '<textarea id="adTextarea" class="discussion-textarea" placeholder="Write your response here..." oninput="_adOnInput()"></textarea>' +
                '</div>' +
            '</div>' +
        '</div>';

    var textarea = document.getElementById('adTextarea');
    if (textarea) {
        mod._lastText = '';
        mod._undoStack = [''];
        mod._redoStack = [];
        textarea.focus();
    }

    var timerEl = document.getElementById('ausDiscTimer');
    if (timerEl) timerEl.innerHTML = '<i class="fas fa-clock"></i> ' + _adFormatTime(writingTime);

    _runAusDiscCountdown(writingTime);
}

// ============================================================
// 타이머
// ============================================================

function _runAusDiscCountdown(seconds) {
    var mod = window.currentAusDiscModule;
    if (!mod || mod._destroyed) return;

    var timeLeft = seconds;
    var timerEl = document.getElementById('ausDiscTimer');

    mod.timer = setInterval(function() {
        timeLeft--;
        if (timerEl) timerEl.innerHTML = '<i class="fas fa-clock"></i> ' + _adFormatTime(timeLeft);

        if (timeLeft <= 0) {
            _clearAusDiscTimer();
            _adFinish();
        }
    }, 1000);
}

// ============================================================
// 에디터 기능
// ============================================================

function _adOnInput() {
    _adUpdateWordCount();
    _adPushUndo();
}

function _adCut() {
    var textarea = document.getElementById('adTextarea');
    if (!textarea) return;

    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    if (start === end) return;

    var selected = textarea.value.substring(start, end);
    navigator.clipboard.writeText(selected).catch(function() {});

    textarea.value = textarea.value.substring(0, start) + textarea.value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start;
    textarea.focus();

    _adUpdateWordCount();
    _adPushUndo();
}

function _adPaste() {
    var textarea = document.getElementById('adTextarea');
    if (!textarea) return;

    navigator.clipboard.readText().then(function(text) {
        if (!text) return;
        var start = textarea.selectionStart;
        var end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        textarea.focus();

        _adUpdateWordCount();
        _adPushUndo();
    }).catch(function() {
        textarea.focus();
        document.execCommand('paste');
    });
}

function _adUndo() {
    var mod = window.currentAusDiscModule;
    if (!mod) return;
    var textarea = document.getElementById('adTextarea');
    if (!textarea) return;

    if (mod._undoStack.length <= 1) return;

    var current = mod._undoStack.pop();
    mod._redoStack.push(current);
    textarea.value = mod._undoStack[mod._undoStack.length - 1];
    mod._lastText = textarea.value;
    textarea.focus();
    _adUpdateWordCount();
}

function _adRedo() {
    var mod = window.currentAusDiscModule;
    if (!mod) return;
    var textarea = document.getElementById('adTextarea');
    if (!textarea) return;

    if (mod._redoStack.length === 0) return;

    var text = mod._redoStack.pop();
    mod._undoStack.push(text);
    textarea.value = text;
    mod._lastText = text;
    textarea.focus();
    _adUpdateWordCount();
}

function _adPushUndo() {
    var mod = window.currentAusDiscModule;
    if (!mod) return;
    var textarea = document.getElementById('adTextarea');
    if (!textarea) return;

    var text = textarea.value;
    if (text === mod._lastText) return;

    mod._undoStack.push(text);
    mod._redoStack = [];
    mod._lastText = text;
}

function _adUpdateWordCount() {
    var textarea = document.getElementById('adTextarea');
    var wcEl = document.getElementById('adWordCount');
    if (!textarea || !wcEl) return;

    var text = textarea.value.trim();
    var count = 0;
    if (text.length > 0) {
        count = text.split(/\s+/).length;
    }
    wcEl.textContent = count;
}

function _adToggleWordCount() {
    var mod = window.currentAusDiscModule;
    if (!mod) return;

    mod._wordCountHidden = !mod._wordCountHidden;
    var wcEl = document.getElementById('adWordCount');
    var btn = document.getElementById('adHideWcBtn');

    if (wcEl) wcEl.parentElement.style.display = mod._wordCountHidden ? 'none' : '';
    if (btn) btn.innerHTML = mod._wordCountHidden
        ? '<i class="fas fa-eye"></i> Show Word Count'
        : '<i class="fas fa-eye-slash"></i> Hide Word Count';
}

// ============================================================
// 이름 치환
// ============================================================

function _adReplaceNames(text) {
    if (!text) return text;
    return text
        .replace(/\{name1\}/g, AUS_DISC_STUDENT1.name)
        .replace(/\{name2\}/g, AUS_DISC_STUDENT2.name);
}

// ============================================================
// 완료 흐름
// ============================================================

function _adFinish() {
    var mod = window.currentAusDiscModule;
    if (!mod || mod._destroyed) return;

    var textarea = document.getElementById('adTextarea');
    if (textarea) mod._savedAnswer = textarea.value;

    _clearAusDiscTimer();

    var headerRight = document.getElementById('ausDiscHeaderRight');
    if (headerRight) headerRight.style.display = 'none';

    _showAusDiscTransition();
}

function _showAusDiscTransition() {
    var mod = window.currentAusDiscModule;
    if (!mod || mod._destroyed) return;

    var container = document.getElementById('ausDiscContent');
    container.innerHTML =
        '<style>@keyframes adSpin{to{transform:rotate(360deg)}}</style>' +
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;">' +
            '<div style="width:40px;height:40px;border:4px solid #e2e8f0;border-top-color:#4A90D9;border-radius:50%;animation:adSpin 0.8s linear infinite;"></div>' +
        '</div>';

    setTimeout(function() {
        if (mod._destroyed) return;
        _showAusDiscComplete();
    }, 1500);
}

function _showAusDiscComplete() {
    var mod = window.currentAusDiscModule;
    if (!mod || mod._destroyed) return;

    var container = document.getElementById('ausDiscContent');
    container.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;">' +
            '<div style="background:#fff;border-radius:16px;padding:40px 36px;text-align:center;max-width:400px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,0.08);">' +
                '<div style="margin-bottom:16px;">' +
                    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#48bb78" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                        '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
                        '<polyline points="22 4 12 14.01 9 11.01"/>' +
                    '</svg>' +
                '</div>' +
                '<h2 style="margin:0 0 8px;font-size:20px;color:#2d3748;">토라 ' + mod.itemNumber + ' 완료!</h2>' +
                '<p style="margin:0 0 24px;font-size:14px;color:#718096;">토론형 라이팅 연습을 마쳤습니다.</p>' +
                '<div style="display:flex;gap:12px;justify-content:center;">' +
                    '<button onclick="_adDownloadTxt()" style="background:#f7fafc;color:#4A90D9;border:1px solid #e2e8f0;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer;">' +
                        '<i class="fas fa-download"></i> 답안 저장' +
                    '</button>' +
                    '<button id="adCompleteBtn" style="background:#4A90D9;color:#fff;border:none;border-radius:8px;padding:10px 28px;font-size:15px;cursor:pointer;">확인</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    document.getElementById('adCompleteBtn').onclick = function() {
        cleanupAusDiscModule();
        _backFromAusDisc();
    };
}

// ============================================================
// TXT 다운로드
// ============================================================

function _adDownloadTxt() {
    var mod = window.currentAusDiscModule;
    if (!mod || !mod.item) return;

    var item = mod.item;
    var userAnswer = mod._savedAnswer || '';
    var wordCount = userAnswer.trim() ? userAnswer.trim().split(/\s+/).length : 0;

    var now = new Date();
    var dateStr = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') + '_' +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');

    var filename = 'AUS_Discussion_' + mod.itemNumber + '_' + dateStr + '.txt';

    var s1Opinion = _adReplaceNames(item.student1Opinion);
    var s2Opinion = _adReplaceNames(item.student2Opinion);
    var topic = _adReplaceNames(item.topic);

    var content = '='.repeat(60) + '\n';
    content += '토론형 라이팅 (토라 ' + mod.itemNumber + ')\n';
    content += '='.repeat(60) + '\n\n';
    content += '작성일시: ' + now.toLocaleString('ko-KR') + '\n';
    content += '단어 수: ' + wordCount + '\n\n';
    content += '-'.repeat(60) + '\n';
    content += '수업 정보\n';
    content += '-'.repeat(60) + '\n';
    content += item.classContext + '\n\n';
    content += '토론 주제: ' + topic + '\n\n';
    content += '-'.repeat(60) + '\n';
    content += '학생 의견\n';
    content += '-'.repeat(60) + '\n';
    content += 'Claire: ' + s1Opinion + '\n\n';
    content += 'Andrew: ' + s2Opinion + '\n\n';
    content += '-'.repeat(60) + '\n';
    content += '내 답안\n';
    content += '-'.repeat(60) + '\n';
    content += userAnswer + '\n\n';
    content += '='.repeat(60) + '\n';

    var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log('[AusDisc] 파일 다운로드: ' + filename);
}

// ============================================================
// 정리
// ============================================================

function cleanupAusDiscModule() {
    var mod = window.currentAusDiscModule;
    if (!mod) return;

    mod._destroyed = true;
    _clearAusDiscTimer();

    window.currentAusDiscModule = null;
    console.log('[AusDisc] cleanup 완료');
}

function _backFromAusDisc() {
    showScreen('ausTaskSelectScreen');
}

function _clearAusDiscTimer() {
    var mod = window.currentAusDiscModule;
    if (!mod) return;
    if (mod.timer) {
        clearInterval(mod.timer);
        mod.timer = null;
    }
}

// ============================================================
// 유틸
// ============================================================

function _adFormatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
}

function _adEscapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function _getAusToraNumber(taskName) {
    var match = taskName.match(/^토라\s*(\d+)$/);
    return match ? parseInt(match[1]) : null;
}

// ============================================================
// 전역 노출
// ============================================================

window.startAusDiscussionModule = startAusDiscussionModule;
window.cleanupAusDiscModule = cleanupAusDiscModule;
window._getAusToraNumber = _getAusToraNumber;
window._backFromAusDisc = _backFromAusDisc;
window._adFinish = _adFinish;
window._adOnInput = _adOnInput;
window._adCut = _adCut;
window._adPaste = _adPaste;
window._adUndo = _adUndo;
window._adRedo = _adRedo;
window._adToggleWordCount = _adToggleWordCount;
window._adDownloadTxt = _adDownloadTxt;

console.log('[AusDisc] aus-discussion-component.js 로드 완료');
