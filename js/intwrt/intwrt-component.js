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

async function startIntwrtModule(itemNumber, week, day, reviewLink) {
    console.log('\n============================');
    console.log('IntWrt ' + itemNumber + ' 시작 (W' + week + ' ' + day + ')');
    console.log('============================\n');

    var audioPlayer = new AudioPlayer();

    var collect = (typeof isAusCollectEnabled === 'function') && isAusCollectEnabled();

    // 마감 판정을 위해 스케줄 정보 세팅 (리딩/리스닝과 동일 패턴)
    if (week && day) {
        window.currentTest = window.currentTest || {};
        window.currentTest.currentWeek = week;
        window.currentTest.currentDay = day;
    }

    window.currentIntwrtModule = {
        itemNumber: itemNumber,
        week: week || null,
        day: day || null,
        reviewLink: reviewLink || '',
        collect: collect,
        audioPlayer: audioPlayer,
        data: null,
        item: null,
        timer: null,
        _destroyed: false,
        _timeHidden: false,
        _wordCountHidden: false,
        _undoStack: [],
        _redoStack: [],
        _lastText: '',
        _savedAnswer: '',
        _autoSubmit: false,
        _certResult: null,
        _submitWordCount: 0,
        _hasInitial: false   // 이미 실전 제출(박제)했는지
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

    // 이미 실전 제출(박제)했는지 확인 — 그렇다면 이번 시도는 다운로드 전용
    if (collect) {
        await _iwLoadStatus();
    }

    _showIntwrtReadingScreen();
}

// 이미 initial_record(실전 제출)가 있는지 조회
async function _iwLoadStatus() {
    var mod = window.currentIntwrtModule;
    if (!mod || !mod.collect) return;
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user || !user.id || user.id === 'dev-user-001') return;
    if (typeof getStudyResultV3 !== 'function') return;
    try {
        var rec = await getStudyResultV3(user.id, 'intwrt', mod.itemNumber, mod.week, mod.day);
        mod._hasInitial = !!(rec && rec.initial_record != null);
        console.log('[IntWrt] 기존 제출 여부:', mod._hasInitial);
    } catch (e) {
        console.warn('[IntWrt] 제출 여부 조회 실패:', e);
    }
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
            _iwTrySubmit();
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
        // 작성 중 임시저장(draft) 복원 — 유실 방지 (수집 코호트만)
        if (mod.collect) {
            var draft = _iwLoadDraft();
            if (draft) textarea.value = draft;
        }

        mod._lastText = textarea.value;
        mod._undoStack = [textarea.value];
        mod._redoStack = [];

        textarea.addEventListener('input', function() {
            _iwUpdateWordCount();
            _iwPushUndo();
            _iwSaveDraft();
        });

        _iwUpdateWordCount();
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
            _showIntwrtTransition(true); // 시간 종료 → 자동 제출
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

function _showIntwrtTransition(isAuto) {
    var mod = window.currentIntwrtModule;
    if (!mod || mod._destroyed) return;

    mod._autoSubmit = !!isAuto;

    var textarea = document.getElementById('iwTextarea');
    if (textarea) mod._savedAnswer = textarea.value;

    var nextBtn = document.getElementById('intwrtNextBtn');
    if (nextBtn) nextBtn.style.display = 'none';

    var container = document.getElementById('intwrtContent');
    container.innerHTML =
        '<div class="iw-spinner-wrap">' +
            '<div class="iw-spinner"></div>' +
        '</div>';

    // 서버 저장·인증 판정 후 완료 화면 (저장이 끝나야 결과 문구를 정확히 표시)
    _iwSaveAnswer().then(function() {
        if (mod._destroyed) return;
        _showIntwrtComplete();
    });
}

function _showIntwrtComplete() {
    var mod = window.currentIntwrtModule;
    if (!mod || mod._destroyed) return;

    var wc = mod._submitWordCount || 0;
    var r = mod._certResult;
    var descHtml;
    if (!mod.collect || !r) {
        descHtml = '<p class="iw-complete-desc">통합형 라이팅 연습을 마쳤습니다.</p>';
    } else if (r === 'certified') {
        descHtml = '<p class="iw-complete-desc" style="color:#16a34a;font-weight:600;">🎉 통라 ' + mod.itemNumber + ' 인증 완료! (' + wc + '단어 제출)</p>';
    } else if (r === 'redo') {
        descHtml = '<p class="iw-complete-desc">이미 제출한 과제예요. 다시 쓴 답안은 저장되지 않으니<br>필요하면 아래 \'답안 저장\'으로 받으세요.</p>';
    } else if (r === 'deadline') {
        descHtml = '<p class="iw-complete-desc">마감이 지난 과제예요.<br>작성한 답안은 아래 \'답안 저장\'으로 받으세요.</p>';
    } else { // blank
        descHtml = '<p class="iw-complete-desc">답안이 비어 있어 인증되지 않았어요. 다시 제출할 수 있어요.</p>';
    }

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
                descHtml +
                '<div style="display:flex;gap:12px;justify-content:center;">' +
                    '<button onclick="_iwDownloadTxt()" style="background:#f7fafc;color:#4A90D9;border:1px solid #e2e8f0;border-radius:8px;padding:10px 20px;font-size:14px;cursor:pointer;">' +
                        '<i class="fas fa-download"></i> 답안 저장' +
                    '</button>' +
                    '<button class="iw-complete-btn" id="iwCompleteBtn">확인</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    document.getElementById('iwCompleteBtn').onclick = function() {
        cleanupIntwrtModule();
        _backFromIntwrt();
    };
}

// ============================================================
// TXT 다운로드
// ============================================================

function _iwDownloadTxt() {
    var mod = window.currentIntwrtModule;
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

    var filename = 'AUS_Integrated_' + mod.itemNumber + '_' + dateStr + '.txt';

    var content = '='.repeat(60) + '\n';
    content += '통합형 라이팅 (통라 ' + mod.itemNumber + ')\n';
    content += '='.repeat(60) + '\n\n';
    content += '작성일시: ' + now.toLocaleString('ko-KR') + '\n';
    content += '단어 수: ' + wordCount + '\n';
    if (mod.reviewLink) {
        content += '다시풀기 링크: ' + mod.reviewLink + '\n';
    }
    content += '\n';
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

    console.log('[IntWrt] 파일 다운로드: ' + filename);
}

// ============================================================
// 제출 · 저장 · 인증 (수집 코호트)
// ============================================================

function _iwCountWords(text) {
    var t = (text || '').trim();
    return t ? t.split(/\s+/).length : 0;
}

// 수동 제출: 빈 답안이면 경고 팝업 (더 쓸지/끝낼지)
function _iwTrySubmit() {
    var mod = window.currentIntwrtModule;
    if (!mod) return;
    var ta = document.getElementById('iwTextarea');
    var text = ta ? ta.value : '';

    // 빈칸 경고는 "인증이 걸린 경우"에만 — 마감 전 + 첫 제출 + 수집 코호트.
    // 마감 후나 이미 제출한 뒤(재시도)엔 어차피 다운로드만이라 팝업 불필요.
    var passed = (typeof isTaskDeadlinePassed === 'function') ? isTaskDeadlinePassed() : false;
    if (mod.collect && !passed && !mod._hasInitial && text.trim().length === 0) {
        _iwShowBlankWarning(function() {
            _clearIntwrtTimer();
            _showIntwrtTransition(false);
        });
        return;
    }
    _clearIntwrtTimer();
    _showIntwrtTransition(false);
}

function _iwShowBlankWarning(onConfirm) {
    var existing = document.getElementById('iwBlankWarnOverlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'iwBlankWarnOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99998;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
        '<div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:360px;width:88%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
            '<div style="font-size:32px;margin-bottom:10px;">✍️</div>' +
            '<h3 style="margin:0 0 10px;font-size:16px;color:#1a1a1a;">답안이 비어 있어요</h3>' +
            '<p style="font-size:13.5px;color:#666;line-height:1.6;margin:0 0 20px;">아무것도 작성하지 않았어요.<br>지금 제출하면 인증되지 않습니다.</p>' +
            '<div style="display:flex;gap:10px;">' +
                '<button id="iwBlankWriteMoreBtn" style="flex:1;padding:12px;border-radius:10px;border:none;background:#4A90D9;color:#fff;font-size:14px;font-weight:700;cursor:pointer;">더 쓸게요</button>' +
                '<button id="iwBlankEndBtn" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid #ddd;background:#fff;color:#888;font-size:14px;font-weight:600;cursor:pointer;">그래도 제출</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(overlay);

    document.getElementById('iwBlankWriteMoreBtn').onclick = function() { overlay.remove(); };
    document.getElementById('iwBlankEndBtn').onclick = function() {
        overlay.remove();
        if (onConfirm) onConfirm();
    };
}

// 제출 답안 저장 (호주 라이팅 최종 모델)
//  - DB 저장(initial 박제)은 "마감 전 + 답안 있음 + 첫 제출" 한 경우뿐 → 그게 곧 인증.
//  - 마감 후 / 빈 답안 / 재시도(이미 박제)는 DB 저장 안 함 → 답안저장(다운로드)만.
//  - current_record 안 씀.
async function _iwSaveAnswer() {
    var mod = window.currentIntwrtModule;
    if (!mod) return;
    mod._certResult = null;

    var text = mod._savedAnswer || '';
    mod._submitWordCount = _iwCountWords(text);
    _iwClearDraft();

    if (!mod.collect) return; // 코호트 게이트 — 기존 학생은 저장 안 함
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user || !user.id || user.id === 'dev-user-001') return;
    if (typeof upsertInitialRecord !== 'function') return;

    // 마감 후 → 저장 안 함, 다운로드만 (제출 이력과 무관하게 마감 안내 우선)
    var passed = (typeof isTaskDeadlinePassed === 'function') ? isTaskDeadlinePassed() : false;
    if (passed) {
        mod._certResult = 'deadline';
        console.log('[IntWrt] 마감 후 — 저장 안 함, 다운로드만');
        return;
    }
    // 마감 전인데 이미 제출됨 → 재시도는 DB 저장 안 함 (다운로드 전용)
    if (mod._hasInitial) {
        mod._certResult = 'redo';
        console.log('[IntWrt] 이미 제출됨 — 재시도는 다운로드 전용');
        return;
    }
    if (text.trim().length === 0) {
        // 빈 답안 → 저장 안 함, 재도전 가능
        mod._certResult = 'blank';
        console.log('[IntWrt] 빈 답안 — 저장 안 함');
        return;
    }

    var recordJson = { answer: text, wordCount: mod._submitWordCount, completedAt: new Date().toISOString() };
    try {
        // 마감 전 + 답안 있음 → initial 박제 + 인증
        await upsertInitialRecord(user.id, 'intwrt', mod.itemNumber, mod.week, mod.day, recordJson, {
            locked_auth_rate: 100
        });
        mod._hasInitial = true;
        mod._certResult = 'certified';
        if (typeof ProgressTracker !== 'undefined' && ProgressTracker.markCompleted) ProgressTracker.markCompleted('intwrt', mod.itemNumber);
        console.log('[IntWrt] 박제 완료: certified ' + mod._submitWordCount + '단어');
    } catch (e) {
        console.error('[IntWrt] 저장 실패:', e);
    }
}

// 작성 중 임시저장(draft) — localStorage, 유실 방지
function _iwDraftKey() {
    var mod = window.currentIntwrtModule;
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    var uid = (user && user.id) ? user.id : 'anon';
    return 'iwdraft_' + uid + '_' + (mod ? mod.itemNumber : '0');
}
function _iwSaveDraft() {
    var mod = window.currentIntwrtModule;
    if (!mod || !mod.collect) return;
    var ta = document.getElementById('iwTextarea');
    if (!ta) return;
    try { localStorage.setItem(_iwDraftKey(), ta.value); } catch (e) {}
}
function _iwLoadDraft() {
    try { return localStorage.getItem(_iwDraftKey()) || ''; } catch (e) { return ''; }
}
function _iwClearDraft() {
    try { localStorage.removeItem(_iwDraftKey()); } catch (e) {}
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
window._iwDownloadTxt = _iwDownloadTxt;

console.log('[IntWrt] intwrt-component.js 로드 완료');
