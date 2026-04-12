/**
 * ================================================
 * correction-speaking.js
 * 첨삭 Speaking 제출 화면 (Interview 카운트다운 + 파일 업로드)
 * ================================================
 * 
 * 흐름:
 *   Phase 1: 인터뷰 카운트다운 (4문제 × 45초) — 영상 재생 + 카운트다운만, 실시간 녹음 없음
 *   Phase 2: 카운트다운 완료 → 파일 업로드 화면 (Q1~Q4 × 4개 파일 선택 버튼)
 *   제출: Storage 업로드 + DB INSERT/UPDATE + webhook
 * 
 * DOM ID 접두사: corrSpk (기존 interviewXxx와 충돌 방지)
 */

// ============================================================
// 전역 상태
// ============================================================

window._correctionSpeakingState = null;

// ============================================================
// 1. 데이터 로더 (tr_speaking_interview 테이블 재사용)
// ============================================================

var _cachedCorrInterviewData = null;

async function _loadCorrectionInterviewSet(setNumber) {
    if (!_cachedCorrInterviewData) {
        var rows = await supabaseSelect('tr_speaking_interview', 'select=*&order=id.asc');
        if (!rows || rows.length === 0) {
            console.error('❌ [Correction Speaking] 데이터 없음');
            return null;
        }
        _cachedCorrInterviewData = rows.map(function(row) {
            var videos = [];
            for (var v = 1; v <= 4; v++) {
                videos.push({
                    video: row['v' + v + '_video'] || '',
                    script: row['v' + v + '_script'] || ''
                });
            }
            return {
                setId: row.id,
                contextText: row.context_text || '',
                contextAudio: row.context_audio || '',
                contextImage: row.context_image || '',
                noddingVideo: row.nodding_video || '',
                videos: videos
            };
        });
        console.log('✅ [Correction Speaking] ' + _cachedCorrInterviewData.length + '세트 로드');
    }

    var setId = 'interview_set_' + String(setNumber).padStart(4, '0');
    var found = _cachedCorrInterviewData.find(function(s) { return s.setId === setId; });
    if (!found) {
        console.error('❌ [Correction Speaking] 세트 없음:', setId);
        return null;
    }
    return found;
}

// ============================================================
// 2. 진입점
// ============================================================

/**
 * 첨삭 Speaking 시작 (correction-session.js에서 호출)
 */
async function startCorrectionSpeaking(session, scheduleData, submission) {
    console.log('\n🎙️ [Correction Speaking] 시작 — Session', session.session);

    var setNumber = session.speaking.number;
    var isDraft2 = !!(submission && submission.status === 'feedback1_ready' && submission.released_1);

    // 2차인데 feedback_1이 없으면 단일 행 다시 조회 (목록 조회는 feedback JSONB 미포함)
    if (isDraft2 && submission && !submission.feedback_1) {
        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
        if (user && user.id) {
            var fullSub = await getCorrectionSubmission(user.id, session.session, 'speaking_interview');
            if (fullSub) submission = fullSub;
        }
    }

    window._correctionSpeakingState = {
        session: session,
        scheduleData: scheduleData,
        submission: submission,
        setNumber: setNumber,
        setData: null,
        isDraft2: isDraft2,
        // 카운트다운 상태
        currentQuestion: 0,
        totalQuestions: 4,
        countdownTimer: null,
        countdownRemaining: 0,
        phase: 'loading',  // loading → countdown → upload
        // 파일 업로드 상태
        uploadFiles: { q1: null, q2: null, q3: null, q4: null },
        destroyed: false
    };

    showScreen('correctionSpeakingScreen');

    // 데이터 로드
    var setData = await _loadCorrectionInterviewSet(setNumber);
    if (!setData) {
        alert('인터뷰 데이터를 불러올 수 없습니다.');
        backFromCorrectionSpeaking();
        return;
    }
    window._correctionSpeakingState.setData = setData;

    // 헤더
    var headerEl = document.getElementById('corrSpkHeader');
    if (headerEl) {
        headerEl.textContent = 'SESSION ' + String(session.session).padStart(2, '0') +
            ' · Interview ' + session.session + (isDraft2 ? ' (2차)' : '');
    }

    if (isDraft2) {
        // ── 2차: Phase 1 건너뛰고 2차 전용 페이지 렌더링 ──
        _showCorrSpkDraft2Page();
    } else {
        // ── 1차: 기존 동작 100% 유지 ──
        _showCorrSpkReadyScreen();
    }
}

// ============================================================
// 3. 준비 화면
// ============================================================

function _showCorrSpkReadyScreen() {
    _corrSpkShowSection('corrSpkReadySection');

    var statusEl = document.getElementById('corrSpkReadyStatus');
    if (statusEl) statusEl.textContent = '준비 완료! 시작 버튼을 눌러주세요.';

    var startBtn = document.getElementById('corrSpkStartBtn');
    if (startBtn) {
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
    }
}

/**
 * "시작" 버튼 클릭 (HTML onclick)
 */
function onCorrSpkStartTap() {
    var state = window._correctionSpeakingState;
    if (!state || !state.setData) return;

    console.log('🎙️ [Correction Speaking] 시작 버튼 탭');
    state.phase = 'countdown';

    // 상황 설명 화면 표시
    _showCorrSpkContext();
}

// ============================================================
// 4. 상황 설명 화면
// ============================================================

function _showCorrSpkContext() {
    var state = window._correctionSpeakingState;
    if (!state || state.destroyed) return;

    _corrSpkShowSection('corrSpkContextSection');

    var contextText = document.getElementById('corrSpkContextText');
    if (contextText) contextText.textContent = state.setData.contextText || '';

    var contextImg = document.getElementById('corrSpkContextImage');
    if (contextImg && state.setData.contextImage && state.setData.contextImage !== 'PLACEHOLDER') {
        contextImg.src = state.setData.contextImage;
        contextImg.style.display = 'block';
    } else if (contextImg) {
        contextImg.style.display = 'none';
    }

    // 상황 오디오 재생
    if (state.setData.contextAudio && state.setData.contextAudio !== 'PLACEHOLDER') {
        _corrSpkPlayAudio(state.setData.contextAudio, function() {
            if (state.destroyed) return;
            setTimeout(function() {
                if (state.destroyed) return;
                _startCorrSpkQuestion(0);
            }, 1500);
        });
    } else {
        setTimeout(function() {
            if (state.destroyed) return;
            _startCorrSpkQuestion(0);
        }, 3000);
    }
}

// ============================================================
// 5. 질문 카운트다운 (4문제 × 45초)
// ============================================================

function _startCorrSpkQuestion(qIndex) {
    var state = window._correctionSpeakingState;
    if (!state || state.destroyed) return;

    if (qIndex >= state.totalQuestions) {
        // 모든 질문 완료 → 파일 업로드 전환
        _showCorrSpkUploadPhase();
        return;
    }

    state.currentQuestion = qIndex;
    _corrSpkShowSection('corrSpkQuestionSection');

    // 문제 번호 업데이트
    var progressEl = document.getElementById('corrSpkProgress');
    if (progressEl) progressEl.textContent = 'Question ' + (qIndex + 1) + ' of ' + state.totalQuestions;

    // 안내 텍스트
    var instructEl = document.getElementById('corrSpkInstruction');
    if (instructEl) instructEl.textContent = '질문 영상을 보고 별도 기기로 답변을 녹음하세요.';

    // 녹음 UI 숨기고, 영상 영역 표시
    var recordingUI = document.getElementById('corrSpkRecordingUI');
    if (recordingUI) recordingUI.style.display = 'none';

    var videoEl = document.getElementById('corrSpkVideo');
    var videoPlaceholder = document.getElementById('corrSpkVideoPlaceholder');

    // 질문 영상 재생
    var videoData = state.setData.videos[qIndex];
    if (videoData && videoData.video && videoData.video !== 'PLACEHOLDER') {
        if (videoPlaceholder) videoPlaceholder.style.display = 'none';
        if (videoEl) {
            videoEl.src = videoData.video;
            videoEl.style.display = 'block';
            videoEl.loop = false;
            videoEl.play().catch(function(e) {
                console.warn('⚠️ 질문 영상 재생 실패:', e);
            });
            videoEl.onended = function() {
                if (state.destroyed) return;
                setTimeout(function() {
                    if (state.destroyed) return;
                    _startCorrSpkCountdown(qIndex);
                }, 700);
            };
            videoEl.onerror = function() {
                if (state.destroyed) return;
                setTimeout(function() {
                    if (state.destroyed) return;
                    _startCorrSpkCountdown(qIndex);
                }, 1000);
            };
        }
    } else {
        // 영상 없으면 플레이스홀더 표시 후 카운트다운
        if (videoEl) videoEl.style.display = 'none';
        if (videoPlaceholder) videoPlaceholder.style.display = 'block';
        setTimeout(function() {
            if (state.destroyed) return;
            if (videoPlaceholder) videoPlaceholder.style.display = 'none';
            _startCorrSpkCountdown(qIndex);
        }, 2000);
    }
}

function _startCorrSpkCountdown(qIndex) {
    var state = window._correctionSpeakingState;
    if (!state || state.destroyed) return;

    console.log('⏱️ [Correction Speaking] Q' + (qIndex + 1) + ' 카운트다운 시작 (45초)');

    // 플레이스홀더 숨김
    var videoPlaceholder = document.getElementById('corrSpkVideoPlaceholder');
    if (videoPlaceholder) videoPlaceholder.style.display = 'none';

    // Nodding 비디오 반복 재생
    var videoEl = document.getElementById('corrSpkVideo');
    if (videoEl && state.setData.noddingVideo && state.setData.noddingVideo !== 'PLACEHOLDER') {
        videoEl.src = state.setData.noddingVideo;
        videoEl.loop = true;
        videoEl.style.display = 'block';
        videoEl.play().catch(function(e) { console.warn('⚠️ Nodding video 재생 실패:', e); });
    }

    // 녹음 UI 표시 (카운트다운 + 안내)
    var recordingUI = document.getElementById('corrSpkRecordingUI');
    if (recordingUI) recordingUI.style.display = 'flex';

    var instructEl = document.getElementById('corrSpkInstruction');
    if (instructEl) instructEl.textContent = 'Q' + (qIndex + 1) + ' 답변 시간 — 별도 기기로 녹음하세요.';

    // 카운트다운
    state.countdownRemaining = 45;
    _updateCorrSpkTimerDisplay();

    // 프로그레스 서클 초기화
    var circle = document.getElementById('corrSpkProgressCircle');
    var circumference = 2 * Math.PI * 20; // radius=20
    if (circle) {
        circle.style.strokeDasharray = circumference;
        circle.style.strokeDashoffset = circumference;
    }

    state.countdownTimer = setInterval(function() {
        state.countdownRemaining--;
        _updateCorrSpkTimerDisplay();

        // 프로그레스 서클 업데이트
        if (circle) {
            var elapsed = 45 - state.countdownRemaining;
            var offset = circumference - (elapsed / 45 * circumference);
            circle.style.strokeDashoffset = offset;
        }

        if (state.countdownRemaining <= 0) {
            clearInterval(state.countdownTimer);
            state.countdownTimer = null;
            _onCorrSpkCountdownEnd(qIndex);
        }
    }, 1000);
}

function _updateCorrSpkTimerDisplay() {
    var state = window._correctionSpeakingState;
    if (!state) return;
    var sec = Math.max(0, state.countdownRemaining);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    var el = document.getElementById('corrSpkTimer');
    if (el) el.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function _onCorrSpkCountdownEnd(qIndex) {
    var state = window._correctionSpeakingState;
    if (!state || state.destroyed) return;

    console.log('⏰ [Correction Speaking] Q' + (qIndex + 1) + ' 카운트다운 종료');

    // Nodding 비디오 정지
    var videoEl = document.getElementById('corrSpkVideo');
    if (videoEl) { videoEl.pause(); videoEl.loop = false; }

    // 녹음 UI 숨김
    var recordingUI = document.getElementById('corrSpkRecordingUI');
    if (recordingUI) recordingUI.style.display = 'none';

    // 잠시 대기 후 다음 질문 또는 업로드 전환
    var instructEl = document.getElementById('corrSpkInstruction');
    if (instructEl) {
        instructEl.textContent = (qIndex + 1 >= state.totalQuestions)
            ? '모든 질문이 완료되었습니다. 파일 업로드로 이동합니다...'
            : '다음 질문으로 이동합니다...';
    }

    setTimeout(function() {
        if (state.destroyed) return;
        _startCorrSpkQuestion(qIndex + 1);
    }, 2000);
}

// ============================================================
// 6. 파일 업로드 Phase
// ============================================================

function _showCorrSpkUploadPhase() {
    var state = window._correctionSpeakingState;
    if (!state) return;

    console.log('📤 [Correction Speaking] 파일 업로드 Phase 전환');
    state.phase = 'upload';

    _corrSpkShowSection('corrSpkUploadSection');

    // 파일 상태 초기화
    state.uploadFiles = { q1: null, q2: null, q3: null, q4: null };
    for (var i = 1; i <= 4; i++) {
        var input = document.getElementById('corrSpkFileQ' + i);
        if (input) input.value = '';
        var label = document.getElementById('corrSpkFileLabelQ' + i);
        if (label) label.textContent = '파일 선택';
        var status = document.getElementById('corrSpkFileStatusQ' + i);
        if (status) { status.textContent = ''; status.className = 'corr-spk-file-status'; }
    }

    _updateCorrSpkSubmitBtn();
}

var CORR_SPK_ALLOWED_TYPES = [
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
    'audio/wav', 'audio/wave', 'audio/x-wav',
    'audio/webm', 'audio/ogg', 'audio/aac',
    'video/mp4', 'video/webm'
];
var CORR_SPK_ALLOWED_EXT = ['mp3', 'm4a', 'wav', 'webm', 'mp4', 'ogg', 'aac'];
var CORR_SPK_MAX_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * 파일 선택 시 (HTML onchange)
 */
function onCorrSpkFileChange(qNum) {
    var state = window._correctionSpeakingState;
    if (!state) return;

    var input = document.getElementById('corrSpkFileQ' + qNum);
    var label = document.getElementById('corrSpkFileLabelQ' + qNum);
    var status = document.getElementById('corrSpkFileStatusQ' + qNum);
    if (!input || !input.files || input.files.length === 0) {
        state.uploadFiles['q' + qNum] = null;
        if (label) label.textContent = '파일 선택';
        if (status) { status.textContent = ''; status.className = 'corr-spk-file-status'; }
        _updateCorrSpkSubmitBtn();
        return;
    }

    var file = input.files[0];
    var ext = file.name.split('.').pop().toLowerCase();

    // 확장자 검증
    if (CORR_SPK_ALLOWED_EXT.indexOf(ext) < 0) {
        input.value = '';
        state.uploadFiles['q' + qNum] = null;
        if (label) label.textContent = '파일 선택';
        if (status) {
            status.textContent = '허용되지 않는 형식입니다 (mp3, m4a, wav, webm, mp4, ogg, aac)';
            status.className = 'corr-spk-file-status error';
        }
        _updateCorrSpkSubmitBtn();
        return;
    }

    // 용량 검증
    if (file.size > CORR_SPK_MAX_SIZE) {
        input.value = '';
        state.uploadFiles['q' + qNum] = null;
        if (label) label.textContent = '파일 선택';
        if (status) {
            status.textContent = '파일이 너무 큽니다 (최대 25MB)';
            status.className = 'corr-spk-file-status error';
        }
        _updateCorrSpkSubmitBtn();
        return;
    }

    // 성공
    state.uploadFiles['q' + qNum] = file;
    if (label) label.textContent = file.name;
    if (status) {
        var sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        status.textContent = sizeMB + 'MB · ' + ext.toUpperCase();
        status.className = 'corr-spk-file-status success';
    }
    _updateCorrSpkSubmitBtn();
}

function _updateCorrSpkSubmitBtn() {
    var state = window._correctionSpeakingState;
    var btn = document.getElementById('corrSpkSubmitBtn');
    if (!state || !btn) return;

    var allSelected = state.uploadFiles.q1 && state.uploadFiles.q2 &&
                      state.uploadFiles.q3 && state.uploadFiles.q4;
    btn.disabled = !allSelected;
    btn.style.opacity = allSelected ? '1' : '0.5';
}

// ============================================================
// 7. 제출 (Storage 업로드 + DB INSERT/UPDATE + webhook)
// ============================================================

async function submitCorrectionSpeaking() {
    var state = window._correctionSpeakingState;
    if (!state) return;

    var files = state.uploadFiles;
    if (!files.q1 || !files.q2 || !files.q3 || !files.q4) {
        alert('Q1~Q4 모든 파일을 선택해주세요.');
        return;
    }

    console.log('📤 [Correction Speaking] 제출 시작');

    var overlay = document.getElementById('submitLoadingOverlay');
    if (overlay) overlay.style.display = 'flex';

    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    if (!user || !user.id) {
        alert('로그인 정보를 확인할 수 없습니다.');
        if (overlay) overlay.style.display = 'none';
        return;
    }

    var draftNum = state.isDraft2 ? 2 : 1;
    var taskType = 'speaking_interview';
    var audioPaths = {};

    try {
        // Q1~Q4 파일 순차 업로드
        for (var q = 1; q <= 4; q++) {
            var file = files['q' + q];
            var ext = file.name.split('.').pop().toLowerCase();
            var storagePath = user.id + '/' + taskType + '_' + state.setNumber +
                '_draft' + draftNum + '_q' + q + '.' + ext;

            console.log('📤 Q' + q + ' 업로드:', storagePath);
            var result = await supabaseStorageUpload('correction-audio', storagePath, file);
            if (!result) {
                throw new Error('Q' + q + ' 파일 업로드 실패');
            }
            audioPaths['q' + q] = storagePath;
        }

        console.log('✅ [Correction Speaking] 4개 파일 업로드 완료');

        // DB INSERT/UPDATE
        if (state.isDraft2) {
            await updateCorrectionSubmission(state.submission.id, {
                draft_2_audio_q1: audioPaths.q1,
                draft_2_audio_q2: audioPaths.q2,
                draft_2_audio_q3: audioPaths.q3,
                draft_2_audio_q4: audioPaths.q4,
                status: 'draft2_submitted',
                draft_2_submitted_at: new Date().toISOString()
            });
            console.log('✅ [Correction Speaking] 2차 제출 완료');
        } else {
            await insertCorrectionSubmission({
                user_id: user.id,
                session_number: state.session.session,
                task_type: taskType,
                task_number: state.setNumber,
                draft_1_audio_q1: audioPaths.q1,
                draft_1_audio_q2: audioPaths.q2,
                draft_1_audio_q3: audioPaths.q3,
                draft_1_audio_q4: audioPaths.q4,
                status: 'draft1_submitted',
                draft_1_submitted_at: new Date().toISOString()
            });
            console.log('✅ [Correction Speaking] 1차 제출 완료');
        }

        // Webhook (비동기)
        _sendCorrSpkWebhook(state.isDraft2, {
            event: state.isDraft2 ? 'draft2_submitted' : 'draft1_submitted',
            user_id: user.id,
            user_name: user.name,
            user_email: user.email,
            session_number: state.session.session,
            task_type: taskType,
            task_number: state.setNumber,
            audio_paths: audioPaths,
            submitted_at: new Date().toISOString()
        });

        if (overlay) overlay.style.display = 'none';
        alert(state.isDraft2 ? '2차 답안이 제출되었습니다.' : '답안이 제출되었습니다.');

        _cleanupCorrectionSpeaking();
        _returnToCorrectionSessionFromSpeaking();

    } catch (err) {
        console.error('❌ [Correction Speaking] 제출 실패:', err);
        if (overlay) overlay.style.display = 'none';
        alert('제출에 실패했습니다: ' + err.message);
    }
}

function _sendCorrSpkWebhook(isDraft2, payload) {
    var config = window.CORRECTION_CONFIG;
    if (!config) return;

    var webhookUrl = isDraft2 ? config.speakingWebhookDraft2 : config.speakingWebhookDraft1;
    if (!webhookUrl || webhookUrl.indexOf('placeholder') >= 0) {
        console.log('📡 [Correction Speaking] Webhook 스킵 (placeholder URL)');
        return;
    }
    fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(function(res) {
        console.log('📡 [Correction Speaking] Webhook 응답:', res.status);
    }).catch(function(err) {
        console.warn('⚠️ [Correction Speaking] Webhook 실패 (무시):', err);
    });
}

// ============================================================
// 8. 오디오 재생 (상황 설명용)
// ============================================================

var _corrSpkCurrentAudio = null;

function _corrSpkPlayAudio(url, onEnded) {
    if (_corrSpkCurrentAudio) {
        _corrSpkCurrentAudio.pause();
        _corrSpkCurrentAudio = null;
    }
    if (!url || url === 'PLACEHOLDER') {
        if (onEnded) setTimeout(onEnded, 500);
        return;
    }
    _corrSpkCurrentAudio = new Audio(url);
    _corrSpkCurrentAudio.addEventListener('ended', function() {
        _corrSpkCurrentAudio = null;
        if (onEnded) onEnded();
    }, { once: true });
    _corrSpkCurrentAudio.addEventListener('error', function() {
        _corrSpkCurrentAudio = null;
        if (onEnded) setTimeout(onEnded, 1000);
    }, { once: true });
    _corrSpkCurrentAudio.play().catch(function() {
        _corrSpkCurrentAudio = null;
        if (onEnded) setTimeout(onEnded, 1000);
    });
}

// ============================================================
// 9. 뒤로가기 + 정리
// ============================================================

function backFromCorrectionSpeaking() {
    var state = window._correctionSpeakingState;
    if (state && state.phase === 'countdown') {
        if (!confirm('진행을 취소하시겠습니까? 처음부터 다시 시작해야 합니다.')) {
            return;
        }
    } else if (state && (state.phase === 'upload' || state.phase === 'draft2')) {
        var hasFile = state.uploadFiles.q1 || state.uploadFiles.q2 ||
                      state.uploadFiles.q3 || state.uploadFiles.q4;
        if (hasFile && !confirm('선택한 파일이 있습니다. 나가시겠습니까?')) {
            return;
        }
    }

    _cleanupCorrectionSpeaking();
    backToCorrectionSession();
}

function _returnToCorrectionSessionFromSpeaking() {
    var sessionState = window._correctionSessionState;
    if (!sessionState) { showScreen('scheduleScreen'); return; }

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

// ============================================================
// 9-B. 2차 전용 페이지 UI
// ============================================================

function _showCorrSpkDraft2Page() {
    var state = window._correctionSpeakingState;
    if (!state || !state.setData) return;

    state.phase = 'draft2';

    // 기존 1차 섹션 모두 숨김 (DOM 수정/삭제 없음)
    var hide = ['corrSpkReadySection', 'corrSpkContextSection', 'corrSpkQuestionSection', 'corrSpkUploadSection'];
    hide.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Question 1 of 4 숨김
    var progressEl = document.getElementById('corrSpkProgress');
    if (progressEl) progressEl.style.display = 'none';

    // 기존 2차 섹션 제거 (재진입 방지)
    var old = document.getElementById('corrSpkDraft2Section');
    if (old) old.remove();

    var screen = document.getElementById('correctionSpeakingScreen');
    if (!screen) return;
    screen.classList.add('draft2-bg');
    var testContent = screen.querySelector('.test-content');
    if (!testContent) return;

    // ── 2차 전용 섹션 ──
    var section = document.createElement('div');
    section.id = 'corrSpkDraft2Section';
    section.className = 'corr-spk-d2-section';

    // ── 좌우 스플릿 래퍼 ──
    var splitWrap = document.createElement('div');
    splitWrap.className = 'corr-spk-d2-split';

    // ══════ 왼쪽: 탭 + 영상 + 타이머 + 업로드 + 제출 ══════
    var leftCol = document.createElement('div');
    leftCol.className = 'corr-spk-d2-left';

    // ── 탭 ──
    var tabWrap = document.createElement('div');
    tabWrap.className = 'corr-spk-d2-tabs';
    for (var t = 1; t <= 4; t++) {
        var tab = document.createElement('button');
        tab.className = 'corr-spk-d2-tab' + (t === 1 ? ' active' : '');
        tab.textContent = 'Q' + t;
        tab.setAttribute('data-q', t);
        tabWrap.appendChild(tab);
    }
    leftCol.appendChild(tabWrap);

    // ── 비디오 플레이어 ──
    var videoWrap = document.createElement('div');
    videoWrap.className = 'corr-spk-d2-video-wrap';

    var videoEl = document.createElement('video');
    videoEl.id = 'corrSpkD2Video';
    videoEl.className = 'corr-spk-d2-video';
    videoEl.setAttribute('controls', '');
    videoEl.setAttribute('playsinline', '');
    videoEl.preload = 'metadata';

    var noVideoMsg = document.createElement('div');
    noVideoMsg.id = 'corrSpkD2NoVideo';
    noVideoMsg.className = 'corr-spk-d2-no-video';
    noVideoMsg.textContent = '영상 없음';
    noVideoMsg.style.display = 'none';

    videoWrap.appendChild(videoEl);
    videoWrap.appendChild(noVideoMsg);
    leftCol.appendChild(videoWrap);

    // ── 45초 타이머 ──
    var timerWrap = document.createElement('div');
    timerWrap.className = 'corr-spk-d2-timer-wrap';
    timerWrap.innerHTML =
        '<span class="corr-spk-d2-timer-display" id="corrSpkD2TimerDisplay">00:45</span>' +
        '<div class="corr-spk-d2-timer-btns">' +
        '  <button class="corr-spk-d2-timer-btn start" id="corrSpkD2TimerStart">시작</button>' +
        '  <button class="corr-spk-d2-timer-btn pause" id="corrSpkD2TimerPause">멈춤</button>' +
        '  <button class="corr-spk-d2-timer-btn reset" id="corrSpkD2TimerReset">리셋</button>' +
        '</div>';
    leftCol.appendChild(timerWrap);

    // ── 파일 업로드 Q1~Q4 ──
    var uploadWrap = document.createElement('div');
    uploadWrap.className = 'corr-spk-d2-upload-wrap';
    for (var q = 1; q <= 4; q++) {
        var row = document.createElement('div');
        row.className = 'corr-spk-d2-upload-row';
        row.innerHTML =
            '<span class="corr-spk-d2-upload-label">Q' + q + '</span>' +
            '<label class="corr-spk-d2-upload-btn" for="corrSpkD2FileQ' + q + '">' +
            '  <i class="fas fa-file-audio"></i> <span id="corrSpkD2FileLabelQ' + q + '">파일 선택</span>' +
            '</label>' +
            '<input type="file" id="corrSpkD2FileQ' + q + '" accept="audio/*,video/mp4,video/webm" style="display:none;" data-q="' + q + '">' +
            '<span class="corr-spk-d2-upload-status" id="corrSpkD2FileStatusQ' + q + '"></span>';
        uploadWrap.appendChild(row);
    }
    leftCol.appendChild(uploadWrap);

    // ── 제출 버튼 ──
    var submitBtn = document.createElement('button');
    submitBtn.id = 'corrSpkD2SubmitBtn';
    submitBtn.className = 'corr-spk-d2-submit-btn';
    submitBtn.textContent = '제출하기';
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.5';
    leftCol.appendChild(submitBtn);

    splitWrap.appendChild(leftCol);

    // ══════ 가운데: 1차 피드백 본문 (annotated_html) ══════
    var fb1 = state.submission ? state.submission.feedback_1 : null;
    if (fb1 && typeof fb1 === 'string') {
        try { fb1 = JSON.parse(fb1); } catch(e) { fb1 = null; }
    }

    var midCol = document.createElement('div');
    midCol.className = 'corr-spk-d2-mid';

    var midHeader = document.createElement('div');
    midHeader.className = 'corr-spk-d2-mid-header';
    midHeader.innerHTML = '<i class="fas fa-lightbulb"></i> 1차 피드백';
    midCol.appendChild(midHeader);

    if (fb1) {
        var fbText = document.createElement('div');
        fbText.className = 'corr-spk-d2-fb-text';
        fbText.id = 'corrSpkD2FbText';

        if (fb1.per_question && fb1.per_question.length > 0) {
            for (var pq = 0; pq < fb1.per_question.length; pq++) {
                var qItem = fb1.per_question[pq];
                var qDiv = document.createElement('div');
                qDiv.className = 'corr-spk-d2-fb-q';
                var qLabel = '<div class="corr-spk-d2-fb-q-label">Q' + (pq + 1) + '</div>';
                var qBody = '';
                if (qItem.annotated_html) {
                    qBody += '<div class="corr-spk-d2-fb-annotated">' + qItem.annotated_html + '</div>';
                }
                if (qItem.comment) {
                    qBody += '<div class="corr-spk-d2-fb-comment">' + (typeof _escapeHtml === 'function' ? _escapeHtml(qItem.comment) : qItem.comment) + '</div>';
                }
                qDiv.innerHTML = qLabel + qBody;
                fbText.appendChild(qDiv);
            }
        } else if (fb1.annotated_html) {
            var annotDiv = document.createElement('div');
            annotDiv.className = 'corr-spk-d2-fb-annotated';
            annotDiv.innerHTML = fb1.annotated_html;
            fbText.appendChild(annotDiv);
        }

        // summary를 Q카드 바로 아래에 (mid 컬럼 안)
        if (fb1.summary) {
            var sumDiv = document.createElement('div');
            sumDiv.className = 'corr-spk-d2-fb-summary';
            sumDiv.innerHTML = '<div class="corr-spk-d2-fb-summary-label"><i class="fas fa-comment-dots"></i> 총평</div>' +
                '<div class="corr-spk-d2-fb-summary-text">' + (typeof _escapeHtml === 'function' ? _escapeHtml(fb1.summary) : fb1.summary) + '</div>';
            fbText.appendChild(sumDiv);
        }

        midCol.appendChild(fbText);
    } else {
        var noFb = document.createElement('div');
        noFb.className = 'corr-spk-d2-fb-empty';
        noFb.textContent = '1차 피드백이 없습니다.';
        midCol.appendChild(noFb);
    }

    splitWrap.appendChild(midCol);

    // ══════ 오른쪽: 메모 카드 패널 ══════
    var rightCol = document.createElement('div');
    rightCol.className = 'corr-spk-d2-right';

    var memoPanel = document.createElement('div');
    memoPanel.className = 'corr-spk-d2-memo-panel';
    memoPanel.id = 'corrSpkD2MemoPanel';
    memoPanel.innerHTML = '<div class="corr-spk-d2-memo-header">교정 메모</div>';
    rightCol.appendChild(memoPanel);

    splitWrap.appendChild(rightCol);
    section.appendChild(splitWrap);

    testContent.appendChild(section);

    // DOM 삽입 후 메모 카드 생성 + 양방향 클릭 연동
    if (fb1) {
        _corrSpkD2BuildMemoCards(section);
    }

    // DOM 삽입 후 초기 영상 로드 (Q1)
    _corrSpkD2LoadVideo(1);

    // ── 이벤트 바인딩 ──
    _corrSpkD2BindEvents();
}

// ── 메모 카드 생성 + 양방향 클릭 연동 (Writing _buildMemoPanel 동일 패턴) ──
function _corrSpkD2BuildMemoCards(wrap) {
    var textEl = document.getElementById('corrSpkD2FbText');
    var memoEl = document.getElementById('corrSpkD2MemoPanel');
    if (!textEl || !memoEl) return;

    var marks = textEl.querySelectorAll('.correction-mark[data-comment]');
    if (marks.length === 0) {
        memoEl.innerHTML = '<div class="corr-spk-d2-memo-header">교정 메모</div>' +
            '<div class="corr-spk-d2-memo-empty">교정 코멘트가 없습니다.</div>';
        return;
    }

    for (var i = 0; i < marks.length; i++) {
        var mark = marks[i];
        var comment = mark.getAttribute('data-comment');
        var uid = 'spkd2_' + i;

        mark.setAttribute('data-memo-id', uid);

        var card = document.createElement('div');
        card.className = 'corr-spk-d2-memo-card';
        card.setAttribute('data-memo-id', uid);
        card.textContent = comment;
        memoEl.appendChild(card);
    }

    // 양방향 클릭: 마크 → 메모 카드
    for (var i = 0; i < marks.length; i++) {
        (function(mark) {
            mark.addEventListener('click', function(e) {
                e.stopPropagation();
                _corrSpkD2ActivatePair(wrap, mark.getAttribute('data-memo-id'));
            });
        })(marks[i]);
    }

    // 양방향 클릭: 메모 카드 → 마크
    var cards = memoEl.querySelectorAll('.corr-spk-d2-memo-card');
    for (var i = 0; i < cards.length; i++) {
        (function(card) {
            card.addEventListener('click', function(e) {
                e.stopPropagation();
                _corrSpkD2ActivatePair(wrap, card.getAttribute('data-memo-id'));
            });
        })(cards[i]);
    }

    // 빈 곳 클릭 → 모든 활성 해제
    wrap.addEventListener('click', function(e) {
        if (!e.target.closest('.correction-mark') && !e.target.closest('.corr-spk-d2-memo-card')) {
            _corrSpkD2DeactivateAll(wrap);
        }
    });
}

function _corrSpkD2ActivatePair(wrap, memoId) {
    var alreadyActive = wrap.querySelector('.correction-mark.memo-active[data-memo-id="' + memoId + '"]');
    _corrSpkD2DeactivateAll(wrap);
    if (alreadyActive) return;

    var mark = wrap.querySelector('.correction-mark[data-memo-id="' + memoId + '"]');
    if (mark) {
        mark.classList.add('memo-active');
        mark.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    var card = wrap.querySelector('.corr-spk-d2-memo-card[data-memo-id="' + memoId + '"]');
    if (card) {
        card.classList.add('memo-active');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function _corrSpkD2DeactivateAll(wrap) {
    var actives = wrap.querySelectorAll('.memo-active');
    for (var i = 0; i < actives.length; i++) {
        actives[i].classList.remove('memo-active');
    }
}

// ── 비디오 소스 전환 ──
function _corrSpkD2LoadVideo(qNum) {
    var state = window._correctionSpeakingState;
    if (!state || !state.setData) return;

    var videoEl = document.getElementById('corrSpkD2Video');
    var noVideoMsg = document.getElementById('corrSpkD2NoVideo');
    if (!videoEl || !noVideoMsg) return;

    var videoData = state.setData.videos[qNum - 1];
    var src = videoData ? videoData.video : '';

    if (src && src !== '' && src !== 'PLACEHOLDER') {
        videoEl.src = src;
        videoEl.style.display = 'block';
        noVideoMsg.style.display = 'none';
        videoEl.pause();
        videoEl.currentTime = 0;
    } else {
        videoEl.removeAttribute('src');
        videoEl.style.display = 'none';
        noVideoMsg.style.display = 'flex';
    }
}

// ── 이벤트 바인딩 ──
function _corrSpkD2BindEvents() {
    var state = window._correctionSpeakingState;
    if (!state) return;

    // 탭 클릭
    var tabs = document.querySelectorAll('.corr-spk-d2-tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener('click', function() {
            for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
            this.classList.add('active');
            _corrSpkD2LoadVideo(parseInt(this.getAttribute('data-q')));
        });
    }

    // 45초 타이머
    var timerState = { remaining: 45, interval: null, running: false };
    var display = document.getElementById('corrSpkD2TimerDisplay');
    var startBtn = document.getElementById('corrSpkD2TimerStart');
    var pauseBtn = document.getElementById('corrSpkD2TimerPause');
    var resetBtn = document.getElementById('corrSpkD2TimerReset');

    function updateTimerDisplay() {
        if (!display) return;
        var m = Math.floor(timerState.remaining / 60);
        var s = timerState.remaining % 60;
        display.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        display.style.color = timerState.remaining <= 10 ? 'var(--danger-color, #e74c3c)' : '';
    }

    if (startBtn) startBtn.addEventListener('click', function() {
        if (timerState.running || timerState.remaining <= 0) return;
        timerState.running = true;
        timerState.interval = setInterval(function() {
            timerState.remaining--;
            updateTimerDisplay();
            if (timerState.remaining <= 0) {
                clearInterval(timerState.interval);
                timerState.interval = null;
                timerState.running = false;
            }
        }, 1000);
    });

    if (pauseBtn) pauseBtn.addEventListener('click', function() {
        if (!timerState.running) return;
        clearInterval(timerState.interval);
        timerState.interval = null;
        timerState.running = false;
    });

    if (resetBtn) resetBtn.addEventListener('click', function() {
        if (timerState.interval) clearInterval(timerState.interval);
        timerState.interval = null;
        timerState.running = false;
        timerState.remaining = 45;
        updateTimerDisplay();
    });

    // 타이머 정리를 cleanup에서 할 수 있도록 state에 저장
    state._d2TimerState = timerState;

    // 파일 업로드
    for (var q = 1; q <= 4; q++) {
        var input = document.getElementById('corrSpkD2FileQ' + q);
        if (input) {
            input.addEventListener('change', function() {
                var qNum = parseInt(this.getAttribute('data-q'));
                _corrSpkD2FileChange(qNum, this);
            });
        }
    }

    // 제출 버튼
    var submitBtn = document.getElementById('corrSpkD2SubmitBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', function() {
            submitCorrectionSpeaking();
        });
    }
}

// ── 파일 변경 핸들러 (검증 로직 재사용) ──
function _corrSpkD2FileChange(qNum, input) {
    var state = window._correctionSpeakingState;
    if (!state) return;

    var label = document.getElementById('corrSpkD2FileLabelQ' + qNum);
    var status = document.getElementById('corrSpkD2FileStatusQ' + qNum);

    if (!input.files || input.files.length === 0) {
        state.uploadFiles['q' + qNum] = null;
        if (label) label.textContent = '파일 선택';
        if (status) { status.textContent = ''; status.className = 'corr-spk-d2-upload-status'; }
        _corrSpkD2UpdateSubmitBtn();
        return;
    }

    var file = input.files[0];
    var ext = file.name.split('.').pop().toLowerCase();

    // 확장자 검증 (기존 상수 재사용)
    if (CORR_SPK_ALLOWED_EXT.indexOf(ext) < 0) {
        input.value = '';
        state.uploadFiles['q' + qNum] = null;
        if (label) label.textContent = '파일 선택';
        if (status) {
            status.textContent = '허용되지 않는 형식 (mp3, m4a, wav, webm, mp4, ogg, aac)';
            status.className = 'corr-spk-d2-upload-status error';
        }
        _corrSpkD2UpdateSubmitBtn();
        return;
    }

    // 용량 검증 (기존 상수 재사용)
    if (file.size > CORR_SPK_MAX_SIZE) {
        input.value = '';
        state.uploadFiles['q' + qNum] = null;
        if (label) label.textContent = '파일 선택';
        if (status) {
            status.textContent = '파일이 너무 큽니다 (최대 25MB)';
            status.className = 'corr-spk-d2-upload-status error';
        }
        _corrSpkD2UpdateSubmitBtn();
        return;
    }

    // 성공
    state.uploadFiles['q' + qNum] = file;
    if (label) label.textContent = file.name;
    if (status) {
        var sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        status.textContent = sizeMB + 'MB · ' + ext.toUpperCase();
        status.className = 'corr-spk-d2-upload-status success';
    }
    _corrSpkD2UpdateSubmitBtn();
}

function _corrSpkD2UpdateSubmitBtn() {
    var state = window._correctionSpeakingState;
    var btn = document.getElementById('corrSpkD2SubmitBtn');
    if (!state || !btn) return;

    var allSelected = state.uploadFiles.q1 && state.uploadFiles.q2 &&
                      state.uploadFiles.q3 && state.uploadFiles.q4;
    btn.disabled = !allSelected;
    btn.style.opacity = allSelected ? '1' : '0.5';
}

function _cleanupCorrectionSpeaking() {
    var state = window._correctionSpeakingState;
    if (!state) return;

    state.destroyed = true;

    if (state.countdownTimer) {
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
    }

    // 2차 타이머 정리
    if (state._d2TimerState && state._d2TimerState.interval) {
        clearInterval(state._d2TimerState.interval);
    }

    if (_corrSpkCurrentAudio) {
        _corrSpkCurrentAudio.pause();
        _corrSpkCurrentAudio = null;
    }

    var videoEl = document.getElementById('corrSpkVideo');
    if (videoEl) {
        videoEl.pause();
        videoEl.loop = false;
        videoEl.removeAttribute('src');
        videoEl.load();
    }

    // 2차 페이지 video 정리
    var d2Video = document.getElementById('corrSpkD2Video');
    if (d2Video) {
        d2Video.pause();
        d2Video.removeAttribute('src');
        d2Video.load();
    }

    // 2차 전용 섹션 DOM 제거
    var d2Section = document.getElementById('corrSpkDraft2Section');
    if (d2Section) d2Section.remove();

    // 2차 진입 시 변경한 UI 복원
    var screen = document.getElementById('correctionSpeakingScreen');
    if (screen) screen.classList.remove('draft2-bg');
    var progressEl = document.getElementById('corrSpkProgress');
    if (progressEl) progressEl.style.display = '';

    window._correctionSpeakingState = null;
    console.log('🧹 [Correction Speaking] 정리 완료');
}

// ============================================================
// 10. 유틸리티
// ============================================================

function _corrSpkShowSection(sectionId) {
    var sections = ['corrSpkReadySection', 'corrSpkContextSection', 'corrSpkQuestionSection', 'corrSpkUploadSection'];
    // interview-question-screen은 CSS에서 text-align:center를 block으로 사용
    var displayMap = {
        corrSpkReadySection: 'flex',
        corrSpkContextSection: 'flex',
        corrSpkQuestionSection: 'block',
        corrSpkUploadSection: 'flex'
    };
    sections.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = (id === sectionId) ? (displayMap[id] || 'flex') : 'none';
    });
}

console.log('✅ correction-speaking.js 로드 완료');
