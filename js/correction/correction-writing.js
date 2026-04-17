/**
 * ================================================
 * correction-writing.js
 * 첨삭 Writing 제출 화면 (Email / Discussion)
 * ================================================
 * 
 * 역할:
 *   - correction_writing_email / correction_writing_discussion 테이블에서 문제 로드
 *   - 기존 EmailComponent/DiscussionComponent의 동일한 UI 제공 (별도 DOM ID 사용)
 *   - 타이머: Email 7분(420초), Discussion 10분(600초)
 *   - 1차/2차 제출 → correction_submissions INSERT/UPDATE + webhook 호출
 * 
 * DOM ID 접두사: corr (corrEmailTextarea, corrDiscussionTextarea 등)
 * 기존 일반코스 HTML과 ID 충돌 방지를 위해 별도 ID 사용.
 */

// ============================================================
// 전역 상태
// ============================================================

window._correctionWritingState = null;

// ============================================================
// 1. 데이터 로더
// ============================================================

var _cachedCorrEmailData = null;
var _cachedCorrDiscussionData = null;

/**
 * 첨삭 Email 데이터 로드
 * @param {number} setNumber - 문제 번호
 * @returns {Promise<object|null>} 세트 데이터
 */
async function _loadCorrectionEmailSet(setNumber) {
    // 기존 테이블(tr_writing_email)을 재사용
    // (추후 correction_writing_email 전용 테이블로 전환 가능)
    if (!_cachedCorrEmailData) {
        var rows = await supabaseSelect('tr_writing_email', 'select=*&order=id.asc');
        if (!rows || rows.length === 0) {
            console.error('❌ [Correction Email] 데이터 없음');
            return null;
        }
        _cachedCorrEmailData = rows.map(function(row) {
            return {
                setId: row.id,
                scenario: row.scenario || '',
                task: row.task || '',
                instruction1: row.instruction1 || '',
                instruction2: row.instruction2 || '',
                instruction3: row.instruction3 || '',
                to: row.to_recipient || '',
                subject: row.subject || '',
                sampleAnswer: row.sample_answer || ''
            };
        });
        console.log('✅ [Correction Email] ' + _cachedCorrEmailData.length + '세트 로드');
    }

    var setId = 'email_set_' + String(setNumber).padStart(4, '0');
    var found = _cachedCorrEmailData.find(function(s) { return s.setId === setId; });
    if (!found) {
        console.error('❌ [Correction Email] 세트 없음:', setId);
        return null;
    }
    return found;
}

/**
 * 첨삭 Discussion 데이터 로드
 * @param {number} setNumber - 문제 번호
 * @returns {Promise<object|null>} 세트 데이터
 */
async function _loadCorrectionDiscussionSet(setNumber) {
    if (!_cachedCorrDiscussionData) {
        var rows = await supabaseSelect('tr_writing_discussion', 'select=*&order=id.asc');
        if (!rows || rows.length === 0) {
            console.error('❌ [Correction Discussion] 데이터 없음');
            return null;
        }
        _cachedCorrDiscussionData = rows.map(function(row) {
            return {
                setId: row.id,
                classContext: row.class_context || '',
                topic: row.topic || '',
                student1Opinion: row.student1_opinion || '',
                student2Opinion: row.student2_opinion || '',
                sampleAnswer: row.sample_answer || ''
            };
        });
        console.log('✅ [Correction Discussion] ' + _cachedCorrDiscussionData.length + '세트 로드');
    }

    var setId = 'discussion_set_' + String(setNumber).padStart(4, '0');
    var found = _cachedCorrDiscussionData.find(function(s) { return s.setId === setId; });
    if (!found) {
        console.error('❌ [Correction Discussion] 세트 없음:', setId);
        return null;
    }
    return found;
}

// ============================================================
// 2. Discussion 프로필 (기존 DiscussionComponent 로직 동일)
// ============================================================

var CORR_PROFESSOR_PROFILES = {
    male: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_prof_M.png',
    female: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_prof_F.png'
};

var CORR_FEMALE_STUDENTS = [
    { name: 'Amy',   image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_F1.png' },
    { name: 'Emma',  image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_F2.png' },
    { name: 'Anna',  image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_F3.png' },
    { name: 'Lucy',  image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_F4.png' },
    { name: 'Mia',   image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_F5.png' },
    { name: 'Lily',  image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_F6.png' },
    { name: 'Sarah', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_F7.png' }
];

var CORR_MALE_STUDENTS = [
    { name: 'Tom',  image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_M1.png' },
    { name: 'Jack', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_M2.png' },
    { name: 'Ben',  image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_M3.png' },
    { name: 'Sam',  image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_M4.png' },
    { name: 'John', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_M5.png' },
    { name: 'Paul', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_M6.png' },
    { name: 'Mark', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_M7.png' }
];

function _getCorrRandomProfiles() {
    var profGender = Math.random() < 0.5 ? 'male' : 'female';
    var f = CORR_FEMALE_STUDENTS[Math.floor(Math.random() * CORR_FEMALE_STUDENTS.length)];
    var m = CORR_MALE_STUDENTS[Math.floor(Math.random() * CORR_MALE_STUDENTS.length)];
    var students = [f, m]; // student1 = 여학생, student2 = 남학생 고정
    return {
        professor: {
            image: CORR_PROFESSOR_PROFILES[profGender],
            name: profGender === 'male' ? 'Dr. Gupta' : 'Dr. Samantha'
        },
        student1: students[0],
        student2: students[1]
    };
}

function _corrReplaceNames(text, profiles) {
    if (!text || !profiles) return text;
    return text
        .replace(/\{name1\}/g, profiles.student1.name)
        .replace(/\{name2\}/g, profiles.student2.name);
}

// ============================================================
// 3. 진입점 — startCorrectionWriting
// ============================================================

/**
 * 첨삭 Writing 시작 (correction-session.js에서 호출)
 * @param {object} session - CORRECTION_SCHEDULE 항목
 * @param {object} scheduleData - correction_schedules 행
 * @param {object|null} submission - 기존 제출 행 (2차 작성 시 사용)
 */
async function startCorrectionWriting(session, scheduleData, submission) {
    console.log('\n✍️ [Correction Writing] 시작 — Session', session.session);

    var writingType = session.writing.type;   // 'email' | 'discussion'
    var setNumber = session.writing.number;
    var isDraft2 = !!(submission && submission.status === 'feedback1_ready' && submission.released_1);

    // 2차 작성인데 feedback_1이 없으면 단일 행 다시 조회 (목록 조회는 feedback JSONB 미포함)
    if (isDraft2 && submission && !submission.feedback_1) {
        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
        if (user && user.id) {
            var fullTaskType = (writingType === 'email') ? 'writing_email' : 'writing_discussion';
            var fullSub = await getCorrectionSubmission(user.id, session.session, fullTaskType);
            if (fullSub) submission = fullSub;
        }
    }

    window._correctionWritingState = {
        session: session,
        scheduleData: scheduleData,
        submission: submission,
        writingType: writingType,
        setNumber: setNumber,
        setData: null,
        profiles: null,     // discussion 전용
        isDraft2: isDraft2,
        timerInterval: null,
        timerRemaining: 0,
        timerExpired: false
    };

    // 화면 전환
    if (writingType === 'email') {
        showScreen('correctionWritingEmailScreen');
        await _initCorrectionEmail(setNumber);
    } else {
        showScreen('correctionWritingDiscussionScreen');
        await _initCorrectionDiscussion(setNumber);
    }
}

// ============================================================
// 4. Email 초기화 + 렌더링
// ============================================================

async function _initCorrectionEmail(setNumber) {
    var state = window._correctionWritingState;
    if (!state) return;

    var setData = await _loadCorrectionEmailSet(setNumber);
    if (!setData) {
        alert('이메일 문제를 불러올 수 없습니다.');
        backToCorrectionSession();
        return;
    }
    state.setData = setData;

    // 헤더 설정
    var headerEl = document.getElementById('corrEmailHeader');
    if (headerEl) {
        headerEl.textContent = 'SESSION ' + String(state.session.session).padStart(2, '0') +
            ' · Email ' + state.session.session + (state.isDraft2 ? ' (2차 작성)' : '');
    }

    // 문제 렌더링
    _setTextContent('corrEmailSituation', setData.scenario);
    _setTextContent('corrEmailTask', setData.task);
    _setTextContent('corrEmailInstruction1', setData.instruction1);
    _setTextContent('corrEmailInstruction2', setData.instruction2);
    _setTextContent('corrEmailInstruction3', setData.instruction3);
    _setTextContent('corrEmailTo', setData.to);
    _setTextContent('corrEmailSubject', setData.subject);

    // 1차 피드백 토글 패널 (2차 작성 시에만)
    _insertFeedbackTogglePanel('corrEmailTextarea');

    // Textarea 초기화
    var textarea = document.getElementById('corrEmailTextarea');
    if (textarea) {
        textarea.value = '';
        textarea.disabled = false;
        textarea.style.opacity = '1';
    }
    _corrUpdateEmailWordCount();

    // 타이머 시작 (420초 = 7분)
    _startCorrectionWritingTimer(420);
}

// ============================================================
// 5. Discussion 초기화 + 렌더링
// ============================================================

async function _initCorrectionDiscussion(setNumber) {
    var state = window._correctionWritingState;
    if (!state) return;

    var setData = await _loadCorrectionDiscussionSet(setNumber);
    if (!setData) {
        alert('토론 문제를 불러올 수 없습니다.');
        backToCorrectionSession();
        return;
    }
    state.setData = setData;

    // 프로필 선택
    state.profiles = _getCorrRandomProfiles();

    // 헤더 설정
    var headerEl = document.getElementById('corrDiscussionHeader');
    if (headerEl) {
        headerEl.textContent = 'SESSION ' + String(state.session.session).padStart(2, '0') +
            ' · Discussion ' + state.session.session + (state.isDraft2 ? ' (2차 작성)' : '');
    }

    // 문제 렌더링
    _setTextContent('corrDiscussionClassContext', setData.classContext);
    _setTextContent('corrDiscussionTopic', setData.topic);

    // 교수
    var profImg = document.getElementById('corrDiscussionProfessorImage');
    var profName = document.getElementById('corrDiscussionProfessorName');
    if (profImg) profImg.src = state.profiles.professor.image;
    if (profName) profName.textContent = state.profiles.professor.name;

    // 학생 1
    var s1Img = document.getElementById('corrDiscussionStudent1Image');
    var s1Name = document.getElementById('corrDiscussionStudent1Name');
    var s1Op = document.getElementById('corrDiscussionStudent1Opinion');
    if (s1Img) s1Img.src = state.profiles.student1.image;
    if (s1Name) s1Name.textContent = state.profiles.student1.name;
    if (s1Op) s1Op.textContent = _corrReplaceNames(setData.student1Opinion, state.profiles);

    // 학생 2
    var s2Img = document.getElementById('corrDiscussionStudent2Image');
    var s2Name = document.getElementById('corrDiscussionStudent2Name');
    var s2Op = document.getElementById('corrDiscussionStudent2Opinion');
    if (s2Img) s2Img.src = state.profiles.student2.image;
    if (s2Name) s2Name.textContent = state.profiles.student2.name;
    if (s2Op) s2Op.textContent = _corrReplaceNames(setData.student2Opinion, state.profiles);

    // 1차 피드백 토글 패널 (2차 작성 시에만)
    _insertFeedbackTogglePanel('corrDiscussionTextarea');

    // Textarea 초기화
    var textarea = document.getElementById('corrDiscussionTextarea');
    if (textarea) {
        textarea.value = '';
        textarea.disabled = false;
        textarea.style.opacity = '1';
    }
    _corrUpdateDiscussionWordCount();

    // 타이머 시작 (600초 = 10분)
    _startCorrectionWritingTimer(600);
}

// ============================================================
// 6. 타이머
// ============================================================

function _startCorrectionWritingTimer(seconds) {
    _stopCorrectionWritingTimer();

    var state = window._correctionWritingState;
    if (!state) return;

    state.timerRemaining = seconds;
    state.timerExpired = false;
    _updateCorrectionWritingTimerDisplay();

    // 2차 전용 안내 문구
    _insertDraft2TimerHint();

    console.log('⏱️ [Correction Writing] 타이머 시작:', seconds + '초');

    state.timerInterval = setInterval(function() {
        state.timerRemaining--;
        _updateCorrectionWritingTimerDisplay();

        if (state.timerRemaining <= 0) {
            _stopCorrectionWritingTimer();
            state.timerExpired = true;
            _onCorrectionWritingTimerExpired();
        }
    }, 1000);
}

function _stopCorrectionWritingTimer() {
    var state = window._correctionWritingState;
    if (state && state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

function _updateCorrectionWritingTimerDisplay() {
    var state = window._correctionWritingState;
    if (!state) return;

    var sec = Math.max(0, state.timerRemaining);
    var min = Math.floor(sec / 60);
    var s = sec % 60;
    var text = min + ':' + (s < 10 ? '0' : '') + s;

    var timerId = state.writingType === 'email' ? 'corrEmailTimer' : 'corrDiscussionTimer';
    var el = document.getElementById(timerId);
    if (el) {
        el.textContent = text;
        el.style.color = sec < 60 ? '#ef4444' : '';
    }
}

function _onCorrectionWritingTimerExpired() {
    var state = window._correctionWritingState;
    if (!state) return;

    console.log('⏰ [Correction Writing] 시간 만료');

    if (state.isDraft2) {
        // ── 2차: textarea 비활성화 안 함, 인라인 메시지만 ──
        var timerId = state.writingType === 'email' ? 'corrEmailTimer' : 'corrDiscussionTimer';
        var timerEl = document.getElementById(timerId);
        if (timerEl) {
            var msg = document.createElement('span');
            msg.className = 'corr-timer-expired-msg';
            msg.textContent = '⏰ 제한 시간이 지났습니다. 마무리 후 제출해주세요.';
            timerEl.parentNode.insertBefore(msg, timerEl.nextSibling);
        }
    } else {
        // ── 1차: 기존 동작 유지 ──
        var textareaId = state.writingType === 'email' ? 'corrEmailTextarea' : 'corrDiscussionTextarea';
        var textarea = document.getElementById(textareaId);
        if (textarea) {
            textarea.disabled = true;
            textarea.style.opacity = '0.7';
        }
        alert('시간이 종료되었습니다. Submit 버튼을 눌러 제출해주세요.');
    }
}

// ============================================================
// 7. 단어 수 카운트
// ============================================================

function _corrCountWords(text) {
    var trimmed = (text || '').trim();
    return trimmed ? trimmed.split(/\s+/).filter(function(w) { return w.length > 0; }).length : 0;
}

function _corrUpdateEmailWordCount() {
    var textarea = document.getElementById('corrEmailTextarea');
    var countEl = document.getElementById('corrEmailWordCount');
    if (textarea && countEl) {
        countEl.textContent = _corrCountWords(textarea.value);
    }
}

function _corrUpdateDiscussionWordCount() {
    var textarea = document.getElementById('corrDiscussionTextarea');
    var countEl = document.getElementById('corrDiscussionWordCount');
    if (textarea && countEl) {
        countEl.textContent = _corrCountWords(textarea.value);
    }
}

// HTML onclick 전역 함수
function onCorrEmailTextInput() {
    _corrUpdateEmailWordCount();
}

function onCorrDiscussionTextInput() {
    _corrUpdateDiscussionWordCount();
}

// ============================================================
// 8. 편집 도구 (Cut, Paste, Undo, Redo)
// ============================================================

function corrEmailCut() {
    _corrCut('corrEmailTextarea');
}
function corrEmailPaste() {
    _corrPaste('corrEmailTextarea');
}
function corrEmailUndo() {
    var textarea = document.getElementById('corrEmailTextarea');
    if (textarea) document.execCommand('undo');
    _corrUpdateEmailWordCount();
}
function corrEmailRedo() {
    var textarea = document.getElementById('corrEmailTextarea');
    if (textarea) document.execCommand('redo');
    _corrUpdateEmailWordCount();
}

function corrDiscussionCut() {
    _corrCut('corrDiscussionTextarea');
}
function corrDiscussionPaste() {
    _corrPaste('corrDiscussionTextarea');
}
function corrDiscussionUndo() {
    var textarea = document.getElementById('corrDiscussionTextarea');
    if (textarea) document.execCommand('undo');
    _corrUpdateDiscussionWordCount();
}
function corrDiscussionRedo() {
    var textarea = document.getElementById('corrDiscussionTextarea');
    if (textarea) document.execCommand('redo');
    _corrUpdateDiscussionWordCount();
}

function _corrCut(textareaId) {
    var textarea = document.getElementById(textareaId);
    if (!textarea) return;
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    if (start === end) return;
    var selected = textarea.value.substring(start, end);
    navigator.clipboard.writeText(selected).then(function() {
        textarea.value = textarea.value.substring(0, start) + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start;
        textarea.dispatchEvent(new Event('input'));
    });
}

function _corrPaste(textareaId) {
    var textarea = document.getElementById(textareaId);
    if (!textarea) return;
    navigator.clipboard.readText().then(function(text) {
        var start = textarea.selectionStart;
        var end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        textarea.dispatchEvent(new Event('input'));
    });
}

// ============================================================
// 9. 제출 처리
// ============================================================

/**
 * 첨삭 Writing Submit (HTML onclick에서 호출)
 */
async function submitCorrectionWriting() {
    var state = window._correctionWritingState;
    if (!state) return;

    // 타이머 정지
    _stopCorrectionWritingTimer();

    // 답안 수집
    var textareaId = state.writingType === 'email' ? 'corrEmailTextarea' : 'corrDiscussionTextarea';
    var textarea = document.getElementById(textareaId);
    var userAnswer = textarea ? textarea.value.trim() : '';
    var wordCount = _corrCountWords(userAnswer);

    console.log('📤 [Correction Writing] 제출 — ' + state.writingType + ', 단어수:', wordCount);

    if (wordCount === 0) {
        if (!confirm('답안이 비어있습니다. 그래도 제출하시겠습니까?')) {
            // 타이머가 만료되지 않았으면 재개
            if (!state.timerExpired && state.timerRemaining > 0) {
                _startCorrectionWritingTimer(state.timerRemaining);
            }
            return;
        }
    }

    // 로딩 표시
    var overlay = document.getElementById('submitLoadingOverlay');
    if (overlay) overlay.style.display = 'flex';

    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    if (!user || !user.id) {
        alert('로그인 정보를 확인할 수 없습니다.');
        if (overlay) overlay.style.display = 'none';
        return;
    }

    var taskType = state.writingType === 'email' ? 'writing_email' : 'writing_discussion';

    try {
        if (state.isDraft2) {
            // ── 2차 제출 (UPDATE) ──
            await updateCorrectionSubmission(state.submission.id, {
                draft_2_text: userAnswer,
                draft_2_word_count: wordCount,
                status: 'draft2_submitted',
                draft_2_submitted_at: new Date().toISOString()
            });
            console.log('✅ [Correction Writing] 2차 제출 완료');
        } else {
            // ── 1차 제출 (INSERT) ──
            await insertCorrectionSubmission({
                user_id: user.id,
                session_number: state.session.session,
                task_type: taskType,
                task_number: state.setNumber,
                draft_1_text: userAnswer,
                draft_1_word_count: wordCount,
                status: 'draft1_submitted',
                draft_1_submitted_at: new Date().toISOString()
            });
            console.log('✅ [Correction Writing] 1차 제출 완료');
        }

        // Webhook 호출 (비동기, 실패해도 제출은 성공)
        _sendCorrectionWebhook(state.isDraft2, {
            event: state.isDraft2 ? 'draft2_submitted' : 'draft1_submitted',
            user_id: user.id,
            user_name: user.name,
            user_email: user.email,
            session_number: state.session.session,
            task_type: taskType,
            task_number: state.setNumber,
            word_count: wordCount,
            submitted_at: new Date().toISOString()
        });

        if (overlay) overlay.style.display = 'none';

        alert(state.isDraft2 ? '2차 답안이 제출되었습니다.' : '답안이 제출되었습니다.');

        // 정리 + 세션 상세로 복귀
        _cleanupCorrectionWriting();
        _returnToCorrectionSession();

    } catch (err) {
        console.error('❌ [Correction Writing] 제출 실패:', err);
        if (overlay) overlay.style.display = 'none';
        alert('제출에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');
    }
}

// ============================================================
// 10. Webhook 호출
// ============================================================

function _sendCorrectionWebhook(isDraft2, payload) {
    var config = window.CORRECTION_CONFIG;
    if (!config) return;

    var webhookUrl = isDraft2 ? config.writingWebhookDraft2 : config.writingWebhookDraft1;
    if (!webhookUrl || webhookUrl.indexOf('placeholder') >= 0) {
        console.log('📡 [Correction] Webhook 스킵 (placeholder URL)');
        return;
    }

    fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(function(res) {
        console.log('📡 [Correction] Webhook 응답:', res.status);
        if (res.status !== 200) {
            _onWebhookFailed(webhookUrl, payload, 'HTTP ' + res.status);
        }
    }).catch(function(err) {
        console.warn('⚠️ [Correction] Webhook 실패 (무시):', err);
        _onWebhookFailed(webhookUrl, payload, err.message || String(err));
    });
}

// ============================================================
// 10-A. Webhook 실패 시 텔레그램 알림 (공통 유틸리티)
// ============================================================

/**
 * task_type → 사람이 읽을 수 있는 라벨로 변환
 */
var _TASK_TYPE_LABELS = {
    writing_email: 'Writing Email',
    writing_discussion: 'Writing Discussion',
    speaking_interview: 'Speaking Interview'
};

/**
 * 중복 알림 방지 — localStorage 기반, 동일 webhook URL 기준 5분 쿨다운
 * @param {string} webhookUrl - 실패한 webhook URL
 * @returns {boolean} true면 알림 전송 가능, false면 쿨다운 중
 */
function _canSendAlert(webhookUrl) {
    var config = window.CORRECTION_CONFIG;
    var cooldownMs = (config && config.telegramAlertCooldownMs) ? config.telegramAlertCooldownMs : 300000;

    // webhook URL에서 고유 키 생성 (예: correction_alert_writing_draft1)
    var keyPart = webhookUrl.replace(/^.*\/webhook\//, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    var storageKey = 'correction_alert_' + keyPart;

    try {
        var lastSent = localStorage.getItem(storageKey);
        if (lastSent) {
            var elapsed = Date.now() - parseInt(lastSent, 10);
            if (elapsed < cooldownMs) {
                console.warn('⏳ [Alert] 쿨다운 중 (' + Math.round((cooldownMs - elapsed) / 1000) + '초 남음), 알림 생략:', storageKey);
                return false;
            }
        }
        localStorage.setItem(storageKey, String(Date.now()));
        return true;
    } catch (e) {
        // localStorage 접근 불가 시 알림 전송 허용 (안전 우선)
        return true;
    }
}

/**
 * Webhook 실패 시 텔레그램 알림 전송
 * — 알림 실패가 학생 제출 흐름을 막지 않도록 try-catch로 감쌈
 * @param {string} webhookUrl - 실패한 webhook URL
 * @param {object} payload - webhook에 전송하려던 payload
 * @param {string} errorDetail - 에러 메시지 또는 HTTP status
 */
function _onWebhookFailed(webhookUrl, payload, errorDetail) {
    try {
        // 중복 알림 방지
        if (!_canSendAlert(webhookUrl)) return;

        var config = window.CORRECTION_CONFIG;
        if (!config || !config.telegramAlertRpcName || !config.telegramAlertSecret) {
            console.warn('⚠️ [Alert] 텔레그램 알림 설정 없음, 생략');
            return;
        }

        var taskTypeLabel = _TASK_TYPE_LABELS[payload.task_type] || payload.task_type || 'Unknown';
        var draftNum = payload.event && payload.event.indexOf('draft2') >= 0 ? '2' : '1';
        var sessionNum = payload.session_number || '?';
        var userName = payload.user_name || '알 수 없음';
        var nowKST = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });

        var message = '\ud83d\udea8 첨삭 Webhook 실패\n\n'
            + '학생: ' + userName + '\n'
            + '과제: ' + taskTypeLabel + ' ' + draftNum + '차\n'
            + '세션: ' + sessionNum + '\n'
            + '시각: ' + nowKST + '\n'
            + '에러: ' + errorDetail + '\n\n'
            + '→ 관리자 대시보드에서 재실행해주세요.';

        // Supabase RPC 호출 (send_telegram_alert 함수)
        var rpcUrl = SUPABASE_CONFIG.url + '/rest/v1/rpc/' + config.telegramAlertRpcName;
        fetch(rpcUrl, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': 'Bearer ' + SUPABASE_CONFIG.anonKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message_text: message,
                alert_secret: config.telegramAlertSecret
            })
        }).then(function(res) {
            if (res.ok) {
                console.log('📨 [Alert] 텔레그램 알림 전송 성공');
            } else {
                console.warn('⚠️ [Alert] 텔레그램 알림 응답:', res.status);
            }
        }).catch(function(alertErr) {
            console.warn('⚠️ [Alert] 텔레그램 알림 전송 실패 (무시):', alertErr);
        });
    } catch (e) {
        // 알림 실패가 학생 제출 흐름을 절대 막지 않음
        console.warn('⚠️ [Alert] 알림 처리 중 예외 (무시):', e);
    }
}

// ============================================================
// 11. 뒤로가기 + 정리
// ============================================================

function backFromCorrectionWriting() {
    var state = window._correctionWritingState;
    if (!state) {
        backToCorrectionSession();
        return;
    }

    // 작성 중이면 확인
    var textareaId = state.writingType === 'email' ? 'corrEmailTextarea' : 'corrDiscussionTextarea';
    var textarea = document.getElementById(textareaId);
    var hasContent = textarea && textarea.value.trim().length > 0;

    if (hasContent) {
        if (!confirm('작성 중인 답안이 있습니다. 나가시겠습니까?\n(답안은 저장되지 않습니다)')) {
            return;
        }
    }

    _cleanupCorrectionWriting();
    backToCorrectionSession();
}

function backToCorrectionSession() {
    var sessionState = window._correctionSessionState;
    if (sessionState) {
        openCorrectionSession(
            sessionState.session,
            sessionState.scheduleData,
            sessionState.submissionMap
        );
    } else {
        showScreen('scheduleScreen');
    }
}

function _returnToCorrectionSession() {
    // 세션 상세로 복귀하되, 최신 submissionMap을 다시 로드
    var sessionState = window._correctionSessionState;
    if (!sessionState) {
        showScreen('scheduleScreen');
        return;
    }

    // submissionMap 갱신 후 세션 화면 재렌더링
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    if (user && user.id) {
        getCorrectionSubmissions(user.id).then(function(submissions) {
            var newMap = {};
            submissions.forEach(function(sub) {
                newMap[sub.session_number + '_' + sub.task_type] = sub;
                var category = sub.task_type.indexOf('writing') === 0 ? 'writing' : 'speaking';
                newMap[sub.session_number + '_' + category] = sub;
            });
            sessionState.submissionMap = newMap;
            openCorrectionSession(sessionState.session, sessionState.scheduleData, newMap);
        }).catch(function() {
            openCorrectionSession(sessionState.session, sessionState.scheduleData, sessionState.submissionMap);
        });
    } else {
        openCorrectionSession(sessionState.session, sessionState.scheduleData, sessionState.submissionMap);
    }
}

function _cleanupCorrectionWriting() {
    _stopCorrectionWritingTimer();
    window._correctionWritingState = null;
    console.log('🧹 [Correction Writing] 정리 완료');
}

// ============================================================
// 12. 유틸리티
// ============================================================

function _setTextContent(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text || '';
}

// ============================================================
// 13. 1차 피드백 토글 패널 (2차 작성 전용)
// ============================================================

/**
 * 2차 작성 시 textarea 위에 1차 피드백 참고 토글 패널을 동적 삽입
 * — 좌우 스플릿 레이아웃(본문 + 교정 메모) + 총평
 * @param {string} textareaId - 'corrEmailTextarea' | 'corrDiscussionTextarea'
 */
function _insertFeedbackTogglePanel(textareaId) {
    // 기존 토글 패널 제거 (재진입 시 중복 방지)
    var existing = document.getElementById('corrFbToggleWrap_' + textareaId);
    if (existing) existing.remove();

    var state = window._correctionWritingState;
    if (!state || !state.isDraft2) return;

    var submission = state.submission;
    if (!submission || !submission.feedback_1) return;

    // feedback_1이 문자열(이중 직렬화)일 수 있으므로 파싱
    var fb = submission.feedback_1;
    if (typeof fb === 'string') {
        try { fb = JSON.parse(fb); } catch (e) { return; }
    }

    var scopeId = 'toggle_' + textareaId;

    // 토글 wrapper 생성
    var wrap = document.createElement('div');
    wrap.id = 'corrFbToggleWrap_' + textareaId;
    wrap.className = 'corr-fb-toggle-wrap';

    // 토글 버튼
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'corr-fb-toggle-btn';
    btn.innerHTML = '<i class="fas fa-lightbulb"></i> 1차 피드백 참고';
    wrap.appendChild(btn);

    // 패널 (기본 닫힘)
    var panel = document.createElement('div');
    panel.className = 'corr-fb-toggle-panel';

    // ── 좌우 스플릿 레이아웃 ──
    var splitWrap = document.createElement('div');
    splitWrap.className = 'corr-fb-split-wrap';
    splitWrap.setAttribute('data-fb-scope', scopeId);

    var splitRow = document.createElement('div');
    splitRow.className = 'corr-fb-split';

    // 왼쪽: annotated_html 본문
    var splitLeft = document.createElement('div');
    splitLeft.className = 'corr-fb-split-left';
    var annotDiv = document.createElement('div');
    annotDiv.className = 'corr-feedback-annotated';
    annotDiv.id = 'corrFb_' + scopeId;
    splitLeft.appendChild(annotDiv);
    splitRow.appendChild(splitLeft);

    // 오른쪽: 교정 메모 패널
    var splitRight = document.createElement('div');
    splitRight.className = 'corr-fb-split-right';
    splitRight.id = 'corrFbMemo_' + scopeId;
    splitRow.appendChild(splitRight);

    splitWrap.appendChild(splitRow);
    panel.appendChild(splitWrap);

    // ── 총평 (스플릿 아래) ──
    if (fb.summary) {
        var summDiv = document.createElement('div');
        summDiv.className = 'corr-fb-toggle-summary';
        summDiv.innerHTML = '<div class="corr-fb-toggle-summary-title"><i class="fas fa-comment-dots"></i> 총평</div>' +
            '<div class="corr-fb-toggle-summary-text">' + _escapeHtmlForToggle(fb.summary) + '</div>';
        panel.appendChild(summDiv);
    }

    wrap.appendChild(panel);

    // 토글 동작
    btn.addEventListener('click', function() {
        var isOpen = wrap.classList.toggle('open');
        btn.innerHTML = isOpen
            ? '<i class="fas fa-lightbulb"></i> 1차 피드백 닫기'
            : '<i class="fas fa-lightbulb"></i> 1차 피드백 참고';

        // 최초 열림 시 annotated_html 렌더링 + 메모 패널 빌드
        if (isOpen && !wrap._rendered) {
            wrap._rendered = true;
            var annotEl = document.getElementById('corrFb_' + scopeId);
            if (annotEl && fb.annotated_html) {
                renderAnnotatedHtml(annotEl, fb.annotated_html);
                _buildMemoPanel(scopeId);
            }
        }
    });

    // DOM 삽입: editor-box 바로 앞
    var textarea = document.getElementById(textareaId);
    if (!textarea) return;
    var editorBox = textarea.closest('.email-editor-box') || textarea.closest('.discussion-editor-box');
    if (editorBox && editorBox.parentNode) {
        editorBox.parentNode.insertBefore(wrap, editorBox);
    }
}

function _escapeHtmlForToggle(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
// 14. 2차 전용 타이머 안내 문구
// ============================================================

function _insertDraft2TimerHint() {
    // 기존 힌트 제거
    var oldHints = document.querySelectorAll('.corr-timer-draft2-hint');
    for (var i = 0; i < oldHints.length; i++) oldHints[i].remove();

    // 기존 만료 메시지도 제거
    var oldMsgs = document.querySelectorAll('.corr-timer-expired-msg');
    for (var i = 0; i < oldMsgs.length; i++) oldMsgs[i].remove();

    var state = window._correctionWritingState;
    if (!state || !state.isDraft2) return;

    var timerId = state.writingType === 'email' ? 'corrEmailTimer' : 'corrDiscussionTimer';
    var timerEl = document.getElementById(timerId);
    if (!timerEl) return;

    var hint = document.createElement('span');
    hint.className = 'corr-timer-draft2-hint';
    hint.textContent = '2차 작성은 시간이 지나도 계속 쓸 수 있어요. 실전 감각 유지용 타이머입니다.';
    timerEl.parentNode.insertBefore(hint, timerEl.nextSibling);
}

console.log('✅ correction-writing.js 로드 완료');
