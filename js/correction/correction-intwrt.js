/**
 * ================================================
 * correction-intwrt.js
 * 호주첨삭 INT WRT (통합형 라이팅) 제출 화면
 * ================================================
 *
 * 정규 호주과정의 intwrt-component.js를 첨삭용으로 복사한 것.
 * 정규 컴포넌트를 직접 쓰지 않는 이유는 correction-indspk.js와 동일
 * (정규 진도/저장소/복귀 화면에 묶여 있음).
 *
 * DOM ID 접두사: corrIw (정규 intwrt의 iw* 와 충돌 방지)
 *
 * 플로우:
 *   1차 — 지문 3분(Next로 조기 종료 가능) → 강의 음성 → 에디터 20분 → 제출
 *          시간이 끝나면 잠기기만 하고 자동 제출은 하지 않는다.
 *          (정규는 자동 제출이지만, 첨삭은 유료 서비스라 학생이 직접 누르게 한다)
 *   2차 — 시간 제한 없이 지문을 계속 보고 강의를 다시 들으며 고쳐 쓴다 + 1차 첨삭 표시
 */

var CORR_IW_DIRECTIONS = 'You have 20 minutes to plan and write your response. Your response will be judged on the basis of the quality of your writing and on how well your response presents the points in the lecture and their relationship to the reading passage. Typically an effective response will be 150 to 225 words.';

var CORR_IW_QUESTION = 'Summarize the points made in the lecture, being sure to explain how they cast doubt on specific points made in the reading passage.';

var CORR_IW_CONFIG = {
    readingTime: 180,    // 3분
    writingTime: 1200    // 20분
};

window._correctionIntWrtState = null;

// ============================================================
// 1. 데이터 로더 — aus_intwrt에서 id로 직접 조회
// ============================================================
// 정규과정은 "몇 번째 줄"로 찾지만, 첨삭은 2000번대 id로 직접 찾는다.

var _cachedCorrIntWrtData = null;

async function _loadCorrectionIntWrtSet(setNumber) {
    if (!_cachedCorrIntWrtData) {
        var rows = await supabaseSelect('aus_intwrt', 'select=*&order=id.asc');
        if (!rows || rows.length === 0) {
            console.error('❌ [Correction IntWrt] 데이터 없음');
            return null;
        }
        _cachedCorrIntWrtData = rows.map(function(row) {
            return {
                setId: Number(row.id),
                passage: row.passage || '',
                lectureAudioUrl: row.lecture_audio_url || '',
                lectureImageUrl: row.lecture_image_url || ''
            };
        });
        console.log('✅ [Correction IntWrt] ' + _cachedCorrIntWrtData.length + '세트 로드');
    }

    var found = _cachedCorrIntWrtData.find(function(s) { return s.setId === Number(setNumber); });
    if (!found) {
        console.error('❌ [Correction IntWrt] 세트 없음: id=' + setNumber);
        return null;
    }
    return found;
}

// ============================================================
// 2. 진입점
// ============================================================

async function startCorrectionIntWrt(session, scheduleData, submission) {
    console.log('\n✍️ [Correction IntWrt] 시작 — Session', session.session);

    var meta = getCorrTaskMeta(session, 'writing');
    var isDraft2 = !!(submission && submission.status === 'feedback1_ready' && submission.released_1);

    if (isDraft2 && submission && !submission.feedback_1) {
        var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
        if (u && u.id) {
            var fullSub = await getCorrectionSubmission(u.id, session.session, meta.taskType);
            if (fullSub) submission = fullSub;
        }
    }

    window._correctionIntWrtState = {
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
        timerExpired: false,
        timeHidden: false,
        wordCountHidden: false,
        undoStack: [],
        redoStack: [],
        lastText: '',
        _destroyed: false
    };

    var state = window._correctionIntWrtState;

    var titleEl = document.getElementById('corrIwTitle');
    if (titleEl) {
        titleEl.textContent = '첨삭 세션 ' + String(session.session).padStart(2, '0') +
            ' · ' + meta.label + (isDraft2 ? ' (2차 작성)' : '');
    }

    showScreen('correctionIntWrtScreen');
    _corrIwShowLoading();

    var item = await _loadCorrectionIntWrtSet(meta.number);
    if (!item) {
        alert('문제를 불러올 수 없습니다.');
        backFromCorrectionIntWrt(true);
        return;
    }
    state.item = item;

    if (isDraft2) {
        _showCorrIwEditor(true);
    } else {
        _showCorrIwReading();
    }
}

function _corrIwShowLoading() {
    var container = document.getElementById('corrIwContent');
    if (container) {
        container.innerHTML = '<div class="iw-loading-screen"><p style="color:#3e484f;font-size:16px;">데이터 로딩 중...</p></div>';
    }
}

// ============================================================
// 3. 1차 — 지문 화면 (3분, Next로 조기 종료 가능)
// ============================================================

function _showCorrIwReading() {
    var state = window._correctionIntWrtState;
    if (!state || state._destroyed) return;

    var readingTime = CORR_IW_CONFIG.readingTime;

    var container = document.getElementById('corrIwContent');
    container.innerHTML =
        '<div class="iw-reading-screen">' +
            '<div class="iw-reading-topbar">' +
                '<div class="iw-topbar-left"></div>' +
                '<div class="iw-topbar-right">' +
                    '<span class="iw-timer" id="corrIwReadingTimer">' + _corrIwFormatTime(readingTime) + '</span>' +
                    '<button class="iw-hide-time-btn" id="corrIwHideTimeBtn1" onclick="_corrIwToggleTime(\'corrIwReadingTimer\', \'corrIwHideTimeBtn1\')">' +
                        '<i class="fas fa-eye"></i> Hide Time' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="iw-reading-split">' +
                '<div class="iw-reading-left">' +
                    '<div class="iw-passage-scroll">' +
                        '<div class="iw-passage-text">' + _corrIwEscape(state.item.passage) + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="iw-reading-right"></div>' +
            '</div>' +
        '</div>';

    var nextBtn = document.getElementById('corrIwNextBtn');
    if (nextBtn) {
        nextBtn.style.display = 'inline-block';
        nextBtn.textContent = 'Next';
        nextBtn.onclick = function() {
            _clearCorrIwTimer();
            _showCorrIwLecture();
        };
    }

    var timeLeft = readingTime;
    var timerEl = document.getElementById('corrIwReadingTimer');

    state.timer = setInterval(function() {
        timeLeft--;
        if (timerEl && !state.timeHidden) timerEl.textContent = _corrIwFormatTime(timeLeft);
        if (timeLeft <= 0) {
            _clearCorrIwTimer();
            _showCorrIwLecture();
        }
    }, 1000);
}

// ============================================================
// 4. 1차 — 강의 음성 화면
// ============================================================

function _showCorrIwLecture() {
    var state = window._correctionIntWrtState;
    if (!state || state._destroyed) return;

    state.timeHidden = false;

    var nextBtn = document.getElementById('corrIwNextBtn');
    if (nextBtn) nextBtn.style.display = 'none';

    var item = state.item;
    var container = document.getElementById('corrIwContent');
    container.innerHTML =
        '<div class="iw-audio-screen">' +
            (item.lectureImageUrl
                ? '<div class="iw-audio-image"><img src="' + item.lectureImageUrl + '" alt=""></div>'
                : '<div class="iw-audio-icon"><i class="fas fa-volume-up"></i></div>') +
        '</div>';

    if (!item.lectureAudioUrl) {
        console.warn('[Correction IntWrt] 강의 음성 없음 — 2초 후 에디터');
        setTimeout(function() {
            if (!state._destroyed) _showCorrIwEditor(false);
        }, 2000);
        return;
    }

    state.audioPlayer.play(item.lectureAudioUrl, function() {
        if (!state._destroyed) _showCorrIwEditor(false);
    });
}

// ============================================================
// 5. 에디터 (1차: 20분 / 2차: 시간 제한 없음)
// ============================================================

function _showCorrIwEditor(isDraft2) {
    var state = window._correctionIntWrtState;
    if (!state || state._destroyed) return;

    var item = state.item;
    var writingTime = CORR_IW_CONFIG.writingTime;

    var nextBtn = document.getElementById('corrIwNextBtn');
    if (nextBtn) {
        nextBtn.style.display = 'inline-block';
        nextBtn.textContent = isDraft2 ? '2차 제출' : 'Submit';
        nextBtn.onclick = function() { _corrIwTrySubmit(); };
    }

    // 2차: 타이머 대신 "강의 다시 듣기" 버튼 + 1차 첨삭 패널
    var topRight = isDraft2
        ? (item.lectureAudioUrl
            ? '<button class="iw-hide-time-btn" id="corrIwReplayBtn"><i class="fas fa-volume-up"></i> 강의 다시 듣기</button>'
            : '')
        : '<span class="iw-timer" id="corrIwWritingTimer">' + _corrIwFormatTime(writingTime) + '</span>' +
          '<button class="iw-hide-time-btn" id="corrIwHideTimeBtn3" onclick="_corrIwToggleTime(\'corrIwWritingTimer\', \'corrIwHideTimeBtn3\')">' +
              '<i class="fas fa-eye"></i> Hide Time' +
          '</button>';

    var container = document.getElementById('corrIwContent');
    container.innerHTML =
        '<div class="iw-writing-screen">' +
            '<div class="iw-writing-topbar">' +
                '<div class="iw-topbar-left"></div>' +
                '<div class="iw-topbar-right">' + topRight + '</div>' +
            '</div>' +
            '<div class="iw-directions-bar">' +
                '<p class="iw-directions-text"><strong>Directions:</strong> ' + CORR_IW_DIRECTIONS + '</p>' +
            '</div>' +
            '<div class="iw-question-bar">' +
                '<p class="iw-question-text"><strong>Question:</strong> ' + CORR_IW_QUESTION + '</p>' +
            '</div>' +
            '<div class="iw-editor-split">' +
                '<div class="iw-editor-left">' +
                    '<div class="iw-passage-scroll">' +
                        '<div class="iw-passage-text">' + _corrIwEscape(item.passage) + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="iw-editor-right">' +
                    '<div class="iw-toolbar">' +
                        '<div class="iw-toolbar-buttons">' +
                            '<button class="iw-tool-btn" onclick="_corrIwCut()">Cut</button>' +
                            '<button class="iw-tool-btn" onclick="_corrIwPaste()">Paste</button>' +
                            '<button class="iw-tool-btn" onclick="_corrIwUndo()">Undo</button>' +
                            '<button class="iw-tool-btn" onclick="_corrIwRedo()">Redo</button>' +
                        '</div>' +
                        '<div class="iw-toolbar-right">' +
                            '<button class="iw-tool-btn iw-hide-wc-btn" id="corrIwHideWcBtn" onclick="_corrIwToggleWordCount()">Hide Word Count</button>' +
                            '<span class="iw-word-count" id="corrIwWordCount">Word Count: 0</span>' +
                        '</div>' +
                    '</div>' +
                    '<textarea class="iw-textarea" id="corrIwTextarea" placeholder="Type your response here..."></textarea>' +
                '</div>' +
            '</div>' +
        '</div>';

    var textarea = document.getElementById('corrIwTextarea');
    if (textarea) {
        // 2차는 1차 답안을 불러와 그 위에서 고쳐 쓴다
        if (isDraft2 && state.submission && state.submission.draft_1_text) {
            textarea.value = state.submission.draft_1_text;
        }
        state.lastText = textarea.value;
        state.undoStack = [textarea.value];
        state.redoStack = [];

        textarea.addEventListener('input', function() {
            _corrIwUpdateWordCount();
            _corrIwPushUndo();
        });

        _corrIwUpdateWordCount();
        textarea.focus();
    }

    if (isDraft2) {
        _corrIwInsertFeedbackPanel();

        var replayBtn = document.getElementById('corrIwReplayBtn');
        if (replayBtn) {
            replayBtn.onclick = function() {
                state.audioPlayer.stop();
                state.audioPlayer.play(item.lectureAudioUrl, function() {});
            };
        }
        return;
    }

    // 1차: 20분 카운트다운 — 시간이 끝나면 잠그기만 (자동 제출 안 함)
    var timeLeft = writingTime;
    var timerEl = document.getElementById('corrIwWritingTimer');

    state.timer = setInterval(function() {
        timeLeft--;
        if (timerEl && !state.timeHidden) timerEl.textContent = _corrIwFormatTime(timeLeft);
        if (timeLeft <= 0) {
            _clearCorrIwTimer();
            state.timerExpired = true;
            var ta = document.getElementById('corrIwTextarea');
            if (ta) ta.readOnly = true;
            if (timerEl) timerEl.textContent = '시간 종료';
            alert('작성 시간이 끝났습니다. 지금까지 쓴 내용을 제출해주세요.');
        }
    }, 1000);
}

/** 2차 화면 — 1차 첨삭 패널을 지문 위에 얹는다 */
function _corrIwInsertFeedbackPanel() {
    var state = window._correctionIntWrtState;
    if (!state) return;

    var left = document.querySelector('#corrIwContent .iw-editor-left');
    if (!left) return;

    var fb = _corrIwParseFeedback(state.submission && state.submission.feedback_1);

    var html = '<div class="corr-iw-fb-tabs">' +
        '<button class="corr-iw-fb-tab active" id="corrIwTabPassage">지문</button>' +
        '<button class="corr-iw-fb-tab" id="corrIwTabFeedback">1차 첨삭</button>' +
    '</div>';

    var fbBody = '<p class="corr-ids-d2-nofb">1차 첨삭 내용을 불러오지 못했습니다.</p>';
    if (fb) {
        fbBody = '';
        if (fb.annotated_html && typeof renderAnnotatedHtml === 'function') {
            fbBody += renderAnnotatedHtml(fb.annotated_html);
        }
        if (fb.summary && typeof renderFeedbackSummary === 'function') {
            fbBody += renderFeedbackSummary(fb);
        }
        if (!fbBody) fbBody = '<p class="corr-ids-d2-nofb">표시할 첨삭 내용이 없습니다.</p>';
    }

    var panel = document.createElement('div');
    panel.className = 'corr-iw-left-wrap';
    panel.innerHTML = html +
        '<div class="corr-iw-fb-panel" id="corrIwFbPanel" style="display:none;">' + fbBody + '</div>';

    left.insertBefore(panel, left.firstChild);

    var scroll = left.querySelector('.iw-passage-scroll');
    var fbPanel = document.getElementById('corrIwFbPanel');
    var tabP = document.getElementById('corrIwTabPassage');
    var tabF = document.getElementById('corrIwTabFeedback');

    tabP.onclick = function() {
        tabP.classList.add('active');
        tabF.classList.remove('active');
        if (scroll) scroll.style.display = '';
        if (fbPanel) fbPanel.style.display = 'none';
    };
    tabF.onclick = function() {
        tabF.classList.add('active');
        tabP.classList.remove('active');
        if (scroll) scroll.style.display = 'none';
        if (fbPanel) fbPanel.style.display = 'block';
    };
}

function _corrIwParseFeedback(raw) {
    if (!raw) return null;
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch (e) { return null; }
    }
    return raw;
}

// ============================================================
// 6. 에디터 도구 (Cut / Paste / Undo / Redo / Word Count / Hide)
// ============================================================

function _corrIwCut() {
    var ta = document.getElementById('corrIwTextarea');
    if (!ta || ta.readOnly) return;

    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    if (start === end) return;

    navigator.clipboard.writeText(ta.value.substring(start, end)).catch(function() {});
    ta.value = ta.value.substring(0, start) + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start;
    ta.focus();

    _corrIwUpdateWordCount();
    _corrIwPushUndo();
}

function _corrIwPaste() {
    var ta = document.getElementById('corrIwTextarea');
    if (!ta || ta.readOnly) return;

    navigator.clipboard.readText().then(function(text) {
        var start = ta.selectionStart;
        var end = ta.selectionEnd;
        ta.value = ta.value.substring(0, start) + text + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = start + text.length;
        ta.focus();
        _corrIwUpdateWordCount();
        _corrIwPushUndo();
    }).catch(function() {});
}

function _corrIwPushUndo() {
    var state = window._correctionIntWrtState;
    var ta = document.getElementById('corrIwTextarea');
    if (!state || !ta) return;
    if (ta.value === state.lastText) return;

    state.undoStack.push(ta.value);
    if (state.undoStack.length > 100) state.undoStack.shift();
    state.redoStack = [];
    state.lastText = ta.value;
}

function _corrIwUndo() {
    var state = window._correctionIntWrtState;
    var ta = document.getElementById('corrIwTextarea');
    if (!state || !ta || ta.readOnly) return;
    if (state.undoStack.length <= 1) return;

    state.redoStack.push(state.undoStack.pop());
    ta.value = state.undoStack[state.undoStack.length - 1];
    state.lastText = ta.value;
    _corrIwUpdateWordCount();
}

function _corrIwRedo() {
    var state = window._correctionIntWrtState;
    var ta = document.getElementById('corrIwTextarea');
    if (!state || !ta || ta.readOnly) return;
    if (!state.redoStack.length) return;

    var text = state.redoStack.pop();
    state.undoStack.push(text);
    ta.value = text;
    state.lastText = text;
    _corrIwUpdateWordCount();
}

function _corrIwCountWords(text) {
    var t = (text || '').trim();
    if (!t) return 0;
    return t.split(/\s+/).length;
}

function _corrIwUpdateWordCount() {
    var state = window._correctionIntWrtState;
    var ta = document.getElementById('corrIwTextarea');
    var el = document.getElementById('corrIwWordCount');
    if (!ta || !el || !state) return;
    if (state.wordCountHidden) return;
    el.textContent = 'Word Count: ' + _corrIwCountWords(ta.value);
}

function _corrIwToggleWordCount() {
    var state = window._correctionIntWrtState;
    var el = document.getElementById('corrIwWordCount');
    var btn = document.getElementById('corrIwHideWcBtn');
    if (!state || !el || !btn) return;

    state.wordCountHidden = !state.wordCountHidden;
    if (state.wordCountHidden) {
        el.textContent = 'Word Count: --';
        btn.textContent = 'Show Word Count';
    } else {
        btn.textContent = 'Hide Word Count';
        _corrIwUpdateWordCount();
    }
}

function _corrIwToggleTime(timerId, btnId) {
    var state = window._correctionIntWrtState;
    var timerEl = document.getElementById(timerId);
    var btn = document.getElementById(btnId);
    if (!state || !timerEl || !btn) return;

    state.timeHidden = !state.timeHidden;
    if (state.timeHidden) {
        timerEl.textContent = '--:--';
        btn.innerHTML = '<i class="fas fa-eye-slash"></i> Show Time';
    } else {
        btn.innerHTML = '<i class="fas fa-eye"></i> Hide Time';
    }
}

// ============================================================
// 7. 제출
// ============================================================

function _corrIwTrySubmit() {
    var state = window._correctionIntWrtState;
    var ta = document.getElementById('corrIwTextarea');
    if (!state || !ta) return;

    var text = ta.value.trim();
    if (!text) {
        alert('답안을 작성해주세요.');
        return;
    }
    if (!confirm('제출할까요?\n제출 후에는 수정할 수 없습니다.')) return;

    _corrIwDoSubmit(text, _corrIwCountWords(text));
}

async function _corrIwDoSubmit(text, wordCount) {
    var state = window._correctionIntWrtState;
    if (!state || state._destroyed) return;

    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    if (!user || !user.id) {
        alert('로그인 정보를 확인할 수 없습니다.');
        return;
    }

    var overlay = document.getElementById('submitLoadingOverlay');
    if (overlay) overlay.style.display = 'flex';

    try {
        if (state.isDraft2) {
            await updateCorrectionSubmission(state.submission.id, {
                draft_2_text: text,
                draft_2_word_count: wordCount,
                status: 'draft2_submitted',
                draft_2_submitted_at: new Date().toISOString()
            });
        } else {
            await insertCorrectionSubmission({
                user_id: user.id,
                session_number: state.session.session,
                task_type: state.taskType,
                task_number: state.setNumber,
                draft_1_text: text,
                draft_1_word_count: wordCount,
                status: 'draft1_submitted',
                draft_1_submitted_at: new Date().toISOString()
            });
        }

        // 호주첨삭은 채점 워크플로우(n8n) 미연결 — webhook 전송 안 함

        if (overlay) overlay.style.display = 'none';
        alert(state.isDraft2 ? '2차 답안이 제출되었습니다.' : '답안이 제출되었습니다.');

        cleanupCorrectionIntWrt();
        _returnToCorrIwSession();

    } catch (err) {
        console.error('❌ [Correction IntWrt] 제출 실패:', err);
        if (overlay) overlay.style.display = 'none';
        alert('제출에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');
    }
}

async function _returnToCorrIwSession() {
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
            console.warn('⚠️ [Correction IntWrt] 제출 내역 재조회 실패:', e);
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

function backFromCorrectionIntWrt(skipConfirm) {
    if (!skipConfirm && !confirm('나가면 작성 중인 답안이 저장되지 않습니다. 나가시겠습니까?')) return;
    cleanupCorrectionIntWrt();
    _returnToCorrIwSession();
}

function _clearCorrIwTimer() {
    var state = window._correctionIntWrtState;
    if (state && state.timer) {
        clearInterval(state.timer);
        state.timer = null;
    }
}

function cleanupCorrectionIntWrt() {
    var state = window._correctionIntWrtState;
    if (!state) return;

    state._destroyed = true;
    _clearCorrIwTimer();

    if (state.audioPlayer) {
        state.audioPlayer.stop();
        state.audioPlayer.destroy();
    }
    window._correctionIntWrtState = null;
    console.log('[Correction IntWrt] cleanup 완료');
}

// ============================================================
// 9. 유틸
// ============================================================

function _corrIwFormatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
}

function _corrIwEscape(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

window.startCorrectionIntWrt = startCorrectionIntWrt;
window.backFromCorrectionIntWrt = backFromCorrectionIntWrt;
window.cleanupCorrectionIntWrt = cleanupCorrectionIntWrt;
window._corrIwCut = _corrIwCut;
window._corrIwPaste = _corrIwPaste;
window._corrIwUndo = _corrIwUndo;
window._corrIwRedo = _corrIwRedo;
window._corrIwToggleTime = _corrIwToggleTime;
window._corrIwToggleWordCount = _corrIwToggleWordCount;
window._loadCorrectionIntWrtSet = _loadCorrectionIntWrtSet;

console.log('✅ correction-intwrt.js 로드 완료');
