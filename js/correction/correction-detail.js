/**
 * ================================================
 * correction-detail.js
 * 과제 상세 화면 (아코디언: Draft / 피드백 / 모범답안)
 * ================================================
 * 
 * 아코디언 섹션 5개:
 *   1. Draft 1 (1차 작성본)
 *   2. 1차 피드백
 *   3. Draft 2 (2차 수정본) + "수정하기" 버튼
 *   4. 최종 피드백
 *   5. 모범답안
 * 
 * 진행된 단계만 표시, 미진행 숨김.
 */

// ============================================================
// 1. 진입점
// ============================================================

/**
 * 과제 상세 화면 열기
 * @param {string} taskType - 'writing' | 'speaking'
 * @param {object} session - CORRECTION_SCHEDULE 항목
 * @param {object} submission - correction_submissions 전체 행 (feedback 포함)
 */
// 문제 데이터 캐시 (openCorrectionDetail에서 로드)
var _corrDetailInterviewData = null;
var _corrDetailQuestionData = null;

async function openCorrectionDetail(taskType, session, submission) {
    console.log('📋 [Correction Detail] 열기:', taskType, 'Session', session.session);

    var meta = getCorrTaskMeta(session, taskType);

    // 전체 데이터가 필요하므로 단일 행 다시 조회 (feedback JSONB 포함)
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    if (user && user.id && submission) {
        var fullSub = await getCorrectionSubmission(user.id, session.session, meta.taskType);
        if (fullSub) submission = fullSub;
    }

    // 문제 데이터 로드 (문제 보기 아코디언 + Speaking 그리드용)
    _corrDetailInterviewData = null;
    _corrDetailQuestionData = null;
    if (taskType === 'speaking' && meta.type === 'interview' && typeof _loadCorrectionInterviewSet === 'function') {
        _corrDetailInterviewData = await _loadCorrectionInterviewSet(meta.number);
    } else if (taskType === 'speaking' && meta.type === 'aus_indspk' && typeof _loadCorrectionIndSpkSet === 'function') {
        _corrDetailQuestionData = await _loadCorrectionIndSpkSet(meta.number);
    } else if (taskType === 'speaking' && meta.type.indexOf('aus_intspk') === 0 && typeof _loadCorrectionIntSpkSet === 'function') {
        _corrDetailQuestionData = await _loadCorrectionIntSpkSet(meta.number);
    } else if (taskType === 'writing') {
        if (meta.type === 'email' && typeof _loadCorrectionEmailSet === 'function') {
            _corrDetailQuestionData = await _loadCorrectionEmailSet(meta.number);
        } else if ((meta.type === 'discussion' || meta.type === 'aus_discussion') && typeof _loadCorrectionDiscussionSet === 'function') {
            _corrDetailQuestionData = await _loadCorrectionDiscussionSet(meta.number);
        } else if (meta.type === 'aus_intwrt' && typeof _loadCorrectionIntWrtSet === 'function') {
            _corrDetailQuestionData = await _loadCorrectionIntWrtSet(meta.number);
        }
    }

    showScreen('correctionDetailScreen');

    // 헤더
    var headerEl = document.getElementById('corrDetailHeader');
    var taskLabel = meta ? meta.label : taskType;
    if (headerEl) headerEl.textContent = 'SESSION ' + String(session.session).padStart(2, '0') + ' · ' + taskLabel;

    // 데드라인 배너 (과제 상세)
    _renderCorrDetailDeadlineBanner(session, submission, taskType);

    // 아코디언 렌더링
    var accordionEl = document.getElementById('corrDetailAccordion');
    if (!accordionEl) return;
    accordionEl.innerHTML = '';

    var status = submission ? submission.status : '';
    var isWriting = (taskType === 'writing');
    var isTerminal = (status === 'expired' || status === 'skipped');

    // --- Section: failed 에러 메시지 ---
    if (status === 'feedback1_failed' || status === 'feedback2_failed') {
        _addAccordionItem(accordionEl, '⚠️ 첨삭 오류', _renderFailedMessage(status), true, 'error');
    }

    // --- Section 0: 문제 보기 ---
    var questionHtml = _renderQuestionPreview(isWriting, session);
    if (questionHtml) {
        _addAccordionItem(accordionEl, '<i class="fas fa-book-open" style="margin-right:6px; font-size:13px;"></i>문제 보기', questionHtml, false, 'question');
    }

    // --- Section 1: Draft 1 ---
    if (submission) {
        var draft1Content = _renderDraft1Content(isWriting, submission);
        var draft1Open = (status === 'draft1_submitted');
        // 스피킹은 쓰는 게 아니라 녹음해서 낸다
        _addAccordionItem(accordionEl, isWriting ? '1차 작성본' : '1차 녹음본', draft1Content, draft1Open, 'draft1');
    }

    // --- Section 2: 1차 피드백 ---
    if (submission && submission.released_1 && submission.feedback_1) {
        var fb1Content = _renderFeedbackContent(isWriting, submission.feedback_1, false);
        var fb1Open = (status === 'feedback1_ready');
        _addAccordionItem(accordionEl, '1차 피드백', fb1Content, fb1Open, 'feedback1');
    }

    // --- Section 3: Draft 2 ---
    // expired/skipped + 2차 미제출 → Draft 2 섹션 생략
    if (submission && submission.released_1) {
        var hasDraft2 = isWriting ? !!submission.draft_2_text : !!submission.draft_2_audio_q1;
        if (!isTerminal || hasDraft2) {
            var draft2Content = _renderDraft2Content(isWriting, submission, taskType, session, isTerminal);
            var draft2Open = (!isTerminal && status === 'feedback1_ready' && !hasDraft2);
            _addAccordionItem(accordionEl, isWriting ? '2차 수정본' : '2차 녹음본', draft2Content, draft2Open, 'draft2');
        }
    }

    // --- Section 4: 최종 피드백 ---
    if (submission && submission.released_2 && submission.feedback_2) {
        var fb2Content = _renderFeedbackContent(isWriting, submission.feedback_2, true);
        var fb2Open = (status === 'feedback2_ready');
        _addAccordionItem(accordionEl, '최종 피드백', fb2Content, fb2Open, 'feedback2');
    }

    // --- Section 5: 모범답안 ---
    if (status === 'complete' || status === 'expired' || status === 'skipped' || (status === 'feedback2_ready' && submission.released_2)) {
        var modelContent = _renderModelAnswer(isWriting, submission);
        _addAccordionItem(accordionEl, '모범답안', modelContent, true, 'model');

        // Speaking 모범답안 번역 토글 이벤트 바인딩 (DOM 삽입 후 실행)
        if (!isWriting) {
            setTimeout(function() {
                _bindModelTransToggle();
            }, 50);
        }
    }

    // 아코디언이 비어있으면 상태 메시지
    if (accordionEl.children.length === 0) {
        accordionEl.innerHTML = '<div style="text-align:center; padding:40px; color:#888;">과제 정보가 없습니다.</div>';
    }
}

// ============================================================
// 1-B. 문제 보기 렌더링
// ============================================================

function _renderQuestionPreview(isWriting, session) {
    if (isWriting) {
        var data = _corrDetailQuestionData;
        if (!data) return '';

        var wType = session.writing.type;
        if (wType === 'email') {
            return _renderEmailQuestionPreview(data);
        } else if (wType === 'aus_intwrt') {
            return _renderIntWrtQuestionPreview(data);
        } else {
            return _renderDiscussionQuestionPreview(data);
        }
    } else {
        // 호주 스피킹(독스·통스)은 인터뷰와 문제 구조가 달라 따로 그린다
        // 일반 스케줄은 스피킹에 type이 없다 (인터뷰 고정)
        var sType = (session.speaking && session.speaking.type) || '';
        if (sType === 'aus_indspk') {
            return _corrDetailQuestionData ? _renderIndSpkQuestionPreview(_corrDetailQuestionData) : '';
        }
        if (sType.indexOf('aus_intspk') === 0) {
            return _corrDetailQuestionData ? _renderIntSpkQuestionPreview(_corrDetailQuestionData) : '';
        }

        var data = _corrDetailInterviewData;
        if (!data) return '';
        return _renderSpeakingQuestionPreview(data);
    }
}

/** 호주첨삭 독스 문제 미리보기 — 토픽 + 문제 음성 */
function _renderIndSpkQuestionPreview(data) {
    var html = '<div class="corr-question-preview">';
    html += '<div class="corr-qp-passage">' + _escapeAndNl2br(data.text) + '</div>';
    if (data.audioUrl) {
        html += _renderAudioPlayer('문제 음성', data.audioUrl);
    }
    html += '</div>';
    return html;
}

/** 호주첨삭 통스 문제 미리보기 — (지문) + 대화·강의 음성 + 문제 */
function _renderIntSpkQuestionPreview(data) {
    var html = '<div class="corr-question-preview">';

    // 통스4는 읽기 지문이 없는 유형이라 passage가 비어 있다
    if (data.passage) {
        if (data.title) {
            html += '<p class="corr-qp-task">' + _escapeAndNl2br(data.title) + '</p>';
        }
        html += '<div class="corr-qp-passage">' + _escapeAndNl2br(data.passage) + '</div>';
    }
    // 듣기 — 음성과 대본은 한 덩어리로 묶는다. 떨어뜨리면 둘의 관계가 안 보인다.
    var listenLabel = (data.type === 2) ? '대화' : '강의';
    html += _renderListenBlock(listenLabel, data.dialogAudioUrl, data.dialogScript);

    // 문제 — 음성은 넣지 않는다. 복습 단계에서 문제를 다시 들을 이유가 없다.
    if (data.problemText) {
        html += '<div class="corr-qp-sub-label">문제</div>';
        html += '<p class="corr-qp-task" style="margin:0;">' + _escapeAndNl2br(data.problemText) + '</p>';
    }

    html += '</div>';
    return html;
}

/**
 * 듣기 블록 — 라벨·재생바·대본 버튼을 한 카드에 묶는다.
 * 대본은 같은 카드 안에서 아래로 펼쳐진다.
 */
function _renderListenBlock(label, audioUrl, script) {
    if (!audioUrl && !script) return '';

    var id = 'corrScript_' + (++_corrScriptSeq);
    var html = '<div class="corr-qp-listen">';

    html += '<div class="corr-qp-listen-head">';
    html += '<span class="corr-qp-listen-label"><i class="fas fa-headphones"></i> ' + _escapeHtml(label) + '</span>';
    if (script) {
        html += '<button type="button" class="corr-qp-script-btn" onclick="_toggleCorrScript(\'' + id + '\', this)">' +
                    '<i class="fas fa-file-lines"></i> 대본 보기' +
                '</button>';
    }
    html += '</div>';

    if (audioUrl) {
        html += '<audio controls preload="none" class="corr-qp-listen-audio"><source src="' + audioUrl + '"></audio>';
    }
    if (script) {
        html += '<div class="corr-qp-script-body" id="' + id + '" style="display:none;">' +
                    _escapeAndNl2br(script) +
                '</div>';
    }

    html += '</div>';
    return html;
}

/** 호주첨삭 INT WRT 문제 미리보기 — 지문 + 강의 음성 + 강의 대본 */
function _renderIntWrtQuestionPreview(data) {
    var html = '<div class="corr-question-preview">';
    html += '<p class="corr-qp-task">' + _escapeAndNl2br(CORR_IW_QUESTION) + '</p>';
    html += '<div class="corr-qp-passage">' + _escapeAndNl2br(data.passage) + '</div>';
    html += _renderListenBlock('강의', data.lectureAudioUrl, data.lectureScript);
    html += '</div>';
    return html;
}

// 듣기 대본은 복습 단계(첨삭 상세)에서만 편다. 작성 화면에서 열어주면 듣기 연습이 무의미해진다.
var _corrScriptSeq = 0;

function _toggleCorrScript(id, btn) {
    var el = document.getElementById(id);
    if (!el) return;

    var open = (el.style.display !== 'none');
    el.style.display = open ? 'none' : 'block';

    btn.classList.toggle('open', !open);
    btn.innerHTML = '<i class="fas fa-file-lines"></i> ' + (open ? '대본 보기' : '대본 숨기기');
}
window._toggleCorrScript = _toggleCorrScript;

function _renderEmailQuestionPreview(data) {
    var html = '<div class="corr-question-preview">';
    html += '<p class="corr-qp-situation">' + _escapeAndNl2br(data.scenario) + '</p>';
    html += '<p class="corr-qp-task">' + _escapeAndNl2br(data.task) + '</p>';
    html += '<ul class="corr-qp-instructions">';
    if (data.instruction1) html += '<li>' + _escapeAndNl2br(data.instruction1) + '</li>';
    if (data.instruction2) html += '<li>' + _escapeAndNl2br(data.instruction2) + '</li>';
    if (data.instruction3) html += '<li>' + _escapeAndNl2br(data.instruction3) + '</li>';
    html += '</ul>';
    html += '<p class="corr-qp-note">Write as much as you can and in complete sentences.</p>';
    html += '<div class="corr-qp-email-meta">';
    html += '<p><strong>To:</strong> ' + _escapeAndNl2br(data.to) + '</p>';
    html += '<p><strong>Subject:</strong> ' + _escapeAndNl2br(data.subject) + '</p>';
    html += '</div>';
    html += '</div>';
    return html;
}

function _renderDiscussionQuestionPreview(data) {
    var replaceName = function(text) {
        if (!text) return '';
        return text.replace(/\{name1\}/g, 'Claire').replace(/\{name2\}/g, 'Andrew');
    };

    var html = '<div class="corr-question-preview">';
    html += '<p class="corr-qp-situation">' + _escapeAndNl2br(data.classContext) + '</p>';
    html += '<div class="corr-qp-disc-instruction">';
    html += '<p class="corr-qp-disc-instruction-title">In your response, you should do the following.</p>';
    html += '<ul><li>Express and support your opinion.</li>';
    html += '<li>Make a contribution to the discussion in your own words.</li></ul>';
    html += '<p class="corr-qp-note">An effective response will contain at least 100 words.</p>';
    html += '</div>';
    html += '<div class="corr-qp-disc-topic">';
    html += '<p class="corr-qp-disc-topic-label">Professor:</p>';
    html += '<p>' + _escapeAndNl2br(data.topic) + '</p>';
    html += '</div>';
    html += '<div class="corr-qp-disc-opinions">';
    html += '<div class="corr-qp-disc-opinion">';
    html += '<span class="corr-qp-disc-name">Claire</span>';
    html += '<p>' + _escapeAndNl2br(replaceName(data.student1Opinion)) + '</p>';
    html += '</div>';
    html += '<div class="corr-qp-disc-opinion">';
    html += '<span class="corr-qp-disc-name">Andrew</span>';
    html += '<p>' + _escapeAndNl2br(replaceName(data.student2Opinion)) + '</p>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
    return html;
}

function _renderSpeakingQuestionPreview(data) {
    var html = '<div class="corr-question-preview">';
    if (data.contextText) {
        html += '<div class="corr-qp-spk-context">';
        html += '<p class="corr-qp-disc-topic-label">Interview Context</p>';
        html += '<p>' + _escapeAndNl2br(data.contextText) + '</p>';
        html += '</div>';
    }
    html += '<div class="corr-qp-spk-questions">';
    for (var q = 0; q < data.videos.length; q++) {
        var script = data.videos[q].script;
        if (!script) continue;
        html += '<div class="corr-qp-spk-q">';
        html += '<span class="corr-qp-spk-badge">Q' + (q + 1) + '</span>';
        html += '<p>' + _escapeAndNl2br(script) + '</p>';
        html += '</div>';
    }
    html += '</div>';
    html += '</div>';
    return html;
}

// ============================================================
// 2. Draft 1 렌더링
// ============================================================

function _renderDraft1Content(isWriting, sub) {
    var html = '';
    if (isWriting) {
        var text = sub.draft_1_text || '(작성 내용 없음)';
        var wordCount = sub.draft_1_word_count || _countWords(text);
        html += '<div class="corr-detail-meta">';
        html += '<span>단어 수: ' + wordCount + '</span>';
        if (sub.draft_1_submitted_at) {
            html += '<span>' + _formatDate(sub.draft_1_submitted_at) + ' 제출</span>';
        }
        html += '</div>';
        html += '<div class="corr-detail-text">' + _escapeAndNl2br(text) + '</div>';
    } else {
        // Speaking: 2×2 그리드 카드
        html += '<div class="corr-detail-meta">';
        if (sub.draft_1_submitted_at) {
            html += '<span>' + _formatDate(sub.draft_1_submitted_at) + ' 제출</span>';
        }
        html += '</div>';
        html += _renderSpeakingGrid(sub, 'draft_1_audio_q');
    }
    return html;
}

// ============================================================
// 3. Draft 2 렌더링
// ============================================================

function _renderDraft2Content(isWriting, sub, taskType, session, isTerminal) {
    var hasDraft2 = isWriting ? !!sub.draft_2_text : !!sub.draft_2_audio_q1;

    if (!hasDraft2) {
        // 2차 미제출 → "수정하기" 버튼 (스피킹은 쓰는 게 아니라 다시 녹음한다)
        var guide = isWriting
            ? '1차 피드백을 참고하여 수정본을 작성하세요.'
            : '1차 피드백을 참고하여 다시 녹음해 주세요.';
        var btnLabel = isWriting ? '수정하기' : '다시 녹음하기';
        var btnIcon = isWriting ? 'fa-edit' : 'fa-microphone';

        var html = '<div style="text-align:center; padding:20px;">';
        html += '<p style="color:#666; margin-bottom:16px;">' + guide + '</p>';
        html += '<button class="corr-detail-action-btn" onclick="onCorrDetailDraft2Click(\'' + taskType + '\')">';
        html += '<i class="fas ' + btnIcon + '"></i> ' + btnLabel + '</button>';
        html += '</div>';
        return html;
    }

    // 2차 제출 완료 → 읽기전용
    var html = '';
    if (isWriting) {
        var text = sub.draft_2_text || '(작성 내용 없음)';
        var wordCount = sub.draft_2_word_count || _countWords(text);
        html += '<div class="corr-detail-meta">';
        html += '<span>단어 수: ' + wordCount + '</span>';
        if (sub.draft_2_submitted_at) {
            html += '<span>' + _formatDate(sub.draft_2_submitted_at) + ' 제출</span>';
        }
        html += '</div>';
        html += '<div class="corr-detail-text">' + _escapeAndNl2br(text) + '</div>';
    } else {
        html += '<div class="corr-detail-meta">';
        if (sub.draft_2_submitted_at) {
            html += '<span>' + _formatDate(sub.draft_2_submitted_at) + ' 제출</span>';
        }
        html += '</div>';
        html += _renderSpeakingGrid(sub, 'draft_2_audio_q');
    }
    return html;
}

// ============================================================
// 4. 피드백 렌더링
// ============================================================

function _renderFeedbackContent(isWriting, feedback, isFinal) {
    if (!feedback) return '<div style="padding:20px; color:#888;">피드백 데이터가 없습니다.</div>';

    // feedback이 문자열(이중 직렬화)일 수 있으므로 파싱
    if (typeof feedback === 'string') {
        try { feedback = JSON.parse(feedback); } catch (e) {
            return '<div style="padding:20px; color:#888;">피드백 데이터를 읽을 수 없습니다.</div>';
        }
    }

    var suffix = isFinal ? 'final' : 'first';
    var html = '';

    if (isWriting) {
        // ── Writing: 좌우 스플릿 레이아웃 ──
        html += '<div class="corr-fb-split-wrap" data-fb-scope="' + suffix + '">';
        html += '  <div class="corr-fb-split">';
        html += '    <div class="corr-fb-split-left">';
        html += '      <div class="corr-feedback-annotated" id="corrFb_' + suffix + '"></div>';
        html += '    </div>';
        html += '    <div class="corr-fb-split-right" id="corrFbMemo_' + suffix + '"></div>';
        html += '  </div>';
        html += '  <div class="corr-feedback-summary" id="corrFbSummary_' + suffix + '"></div>';
        html += '</div>';
    } else {
        // ── Speaking: 동일 스플릿 레이아웃 ──
        html += '<div class="corr-fb-split-wrap" data-fb-scope="' + suffix + '">';
        html += '  <div class="corr-fb-split">';
        html += '    <div class="corr-fb-split-left">';
        html += '      <div class="corr-feedback-annotated" id="corrFb_' + suffix + '"></div>';
        html += '    </div>';
        html += '    <div class="corr-fb-split-right" id="corrFbMemo_' + suffix + '"></div>';
        html += '  </div>';
        html += '  <div class="corr-feedback-summary" id="corrFbSummary_' + suffix + '"></div>';
        html += '</div>';
    }

    // 렌더링은 DOM에 삽입된 후 실행해야 하므로 setTimeout 사용
    var feedbackData = feedback;
    var writing = isWriting;
    setTimeout(function() {
        var annotatedEl = document.getElementById('corrFb_' + suffix);
        var summaryEl = document.getElementById('corrFbSummary_' + suffix);

        if (annotatedEl) {
            if (writing) {
                renderAnnotatedHtml(annotatedEl, feedbackData.annotated_html || '');
                // 메모 패널 동적 생성 + 양방향 클릭 연동
                _buildMemoPanel(suffix);
            } else {
                renderSpeakingFeedback(annotatedEl, feedbackData);
                // Speaking도 메모 패널 동적 생성 + 양방향 클릭 연동
                _buildMemoPanel(suffix);
            }
        }
        if (summaryEl) {
            // 호주 스피킹만 4점 만점, 나머지는 5점 만점
            var scoreMax = (!writing && getCorrectionTrack() === 'aus') ? 4 : 5;
            renderFeedbackSummary(summaryEl, feedbackData, scoreMax);
        }
    }, 50);

    return html;
}

// ============================================================
// 4-B. 메모 패널 생성 + 양방향 하이라이트
// ============================================================

/**
 * 왼쪽 본문의 .correction-mark[data-comment] 를 순회하여
 * 오른쪽 메모 패널에 카드를 동적으로 생성하고 클릭 연동을 바인딩한다.
 * @param {string} suffix - 'first' | 'final'
 */
function _buildMemoPanel(suffix) {
    var wrap = document.querySelector('.corr-fb-split-wrap[data-fb-scope="' + suffix + '"]');
    if (!wrap) return;

    var annotatedEl = document.getElementById('corrFb_' + suffix);
    var memoEl = document.getElementById('corrFbMemo_' + suffix);
    if (!annotatedEl || !memoEl) return;

    var marks = annotatedEl.querySelectorAll('.correction-mark[data-comment]');
    if (marks.length === 0) {
        memoEl.innerHTML = '<div class="corr-memo-empty">교정 코멘트가 없습니다.</div>';
        return;
    }

    memoEl.innerHTML = '<div class="corr-memo-header">교정 메모</div>';

    for (var i = 0; i < marks.length; i++) {
        var mark = marks[i];
        var comment = mark.getAttribute('data-comment');
        var uid = suffix + '_' + i;

        // 마크에 uid 부여
        mark.setAttribute('data-memo-id', uid);

        // 메모 카드 생성
        var card = document.createElement('div');
        card.className = 'corr-memo-card';
        card.setAttribute('data-memo-id', uid);
        card.textContent = comment;
        memoEl.appendChild(card);
    }

    // ── 양방향 클릭 이벤트 ──
    // 왼쪽 마크 클릭 → 오른쪽 메모 활성 + 스크롤
    for (var i = 0; i < marks.length; i++) {
        (function(mark) {
            mark.addEventListener('click', function(e) {
                e.stopPropagation();
                var id = mark.getAttribute('data-memo-id');
                _activatePair(wrap, id);
            });
        })(marks[i]);
    }

    // 오른쪽 메모 카드 클릭 → 왼쪽 마크 활성 + 스크롤
    var cards = memoEl.querySelectorAll('.corr-memo-card');
    for (var i = 0; i < cards.length; i++) {
        (function(card) {
            card.addEventListener('click', function(e) {
                e.stopPropagation();
                var id = card.getAttribute('data-memo-id');
                _activatePair(wrap, id);
            });
        })(cards[i]);
    }

    // 빈 곳 클릭 → 모든 활성 해제 (wrap 범위)
    wrap.addEventListener('click', function(e) {
        if (!e.target.closest('.correction-mark') && !e.target.closest('.corr-memo-card')) {
            _deactivateAll(wrap);
        }
    });
}

/**
 * 특정 memo-id 쌍을 활성화하고 나머지 해제
 */
function _activatePair(wrap, memoId) {
    // 이미 활성인 같은 쌍이면 토글(해제)
    var alreadyActive = wrap.querySelector('.correction-mark.memo-active[data-memo-id="' + memoId + '"]');
    _deactivateAll(wrap);
    if (alreadyActive) return;

    // 마크 활성
    var mark = wrap.querySelector('.correction-mark[data-memo-id="' + memoId + '"]');
    if (mark) {
        mark.classList.add('memo-active');
        mark.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // 메모 카드 활성
    var card = wrap.querySelector('.corr-memo-card[data-memo-id="' + memoId + '"]');
    if (card) {
        card.classList.add('memo-active');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/**
 * wrap 내 모든 활성 해제
 */
function _deactivateAll(wrap) {
    var actives = wrap.querySelectorAll('.memo-active');
    for (var i = 0; i < actives.length; i++) {
        actives[i].classList.remove('memo-active');
    }
}

// ============================================================
// 5. 모범답안 렌더링
// ============================================================

function _renderModelAnswer(isWriting, sub) {
    var html = '';

    if (isWriting) {
        var modelText = sub.model_answer_text || '';
        if (modelText) {
            html += '<div class="corr-detail-text">' + _escapeAndNl2br(modelText) + '</div>';
        }
        var modelAudio = sub.model_answer_audio_url || '';
        if (modelAudio) {
            html += _renderAudioPlayer('모범답안 오디오', modelAudio);
        }
        if (!modelText && !modelAudio) {
            html += '<div style="padding:20px; color:#888; text-align:center;">모범답안이 준비되지 않았습니다.</div>';
        }
    } else {
        // Speaking 모범답안 — JSON Q1~Q4 카드
        html += _renderSpeakingModelAnswer(sub);
    }

    return html;
}

/**
 * Speaking 모범답안 2×2 그리드 카드 렌더링
 * model_answer_text:      { q1:{text,trans}, q2:{...}, q3:{...}, q4:{...} }
 * model_answer_audio_url: { q1:"url", q2:"url", q3:"url", q4:"url" }
 */
function _renderSpeakingModelAnswer(sub) {
    var raw = sub.model_answer_text;
    if (!raw || (typeof raw === 'string' && !raw.trim())) {
        return '<div style="padding:20px; color:#888; text-align:center;">모범답안이 준비되지 않았습니다.</div>';
    }

    // 텍스트 파싱: 객체이면 그대로, 문자열이면 JSON.parse 시도
    var data = null;
    if (typeof raw === 'object') {
        data = raw;
    } else {
        try { data = JSON.parse(raw); } catch (e) { data = null; }
    }

    // 파싱 실패 → 단순 텍스트 fallback
    if (!data || typeof data !== 'object') {
        return '<div class="corr-detail-text">' + _escapeAndNl2br(String(raw)) + '</div>';
    }

    // 오디오 파싱: 별도 컬럼 (model_answer_audio_url)
    var rawAudio = sub.model_answer_audio_url;
    var audioData = null;
    if (rawAudio) {
        if (typeof rawAudio === 'object') {
            audioData = rawAudio;
        } else if (typeof rawAudio === 'string' && rawAudio.trim()) {
            try { audioData = JSON.parse(rawAudio); } catch (e) { audioData = null; }
        }
    }

    // 호주첨삭 스피킹은 답변이 1개 → 카드 1장 (일반 인터뷰는 4문항)
    var isAus = (getCorrectionTrack() === 'aus');
    var qCount = isAus ? 1 : 4;

    var html = '<div class="corr-model-grid' + (isAus ? ' is-single' : '') + '">';
    for (var q = 1; q <= qCount; q++) {
        // 소문자 키 우선, 대문자 fallback
        var key = 'q' + q;
        var item = data[key] || data['Q' + q] || null;

        html += '<div class="corr-model-card">';

        // Q 배지 — 답변이 4개일 때만. 1개뿐이면 위에 이미 "모범답안"이라 써 있어 중복이다.
        if (!isAus) {
            html += '<div class="corr-model-card-header">';
            html += '<span class="corr-model-card-badge">Q' + q + '</span>';
            html += '</div>';
        }

        if (item && item.text) {
            if (isAus && item.trans) {
                // 답변이 하나뿐이라 가로 공간이 남는다 → 영어와 해석을 나란히 둔다.
                // 토글을 누를 필요 없이 바로 대조해 읽을 수 있다.
                html += '<div class="corr-model-split">';
                html += '  <div class="corr-model-split-col">';
                html += '    <div class="corr-model-col-label">영어</div>';
                html += '    <p class="corr-model-card-text">' + _escapeAndNl2br(item.text) + '</p>';
                html += '  </div>';
                html += '  <div class="corr-model-split-col">';
                html += '    <div class="corr-model-col-label">해석</div>';
                html += '    <p class="corr-model-card-trans">' + _escapeAndNl2br(item.trans) + '</p>';
                html += '  </div>';
                html += '</div>';
            } else {
                html += '<p class="corr-model-card-text">' + _escapeAndNl2br(item.text) + '</p>';
                if (item.trans) {
                    html += '<button class="corr-model-trans-btn" data-model-q="' + q + '" type="button">번역 보기</button>';
                    html += '<div class="corr-model-trans" id="corrModelTrans_' + q + '" style="display:none;">' + _escapeAndNl2br(item.trans) + '</div>';
                }
            }

            // 오디오 플레이어 — model_answer_audio_url에서 읽기 (호주는 아직 음성 없음)
            var audioPath = audioData ? (audioData[key] || audioData['Q' + q] || '') : '';
            if (audioPath) {
                var audioUrl = (audioPath.indexOf('http') === 0) ? audioPath : supabaseStorageUrl('correction-audio', audioPath);
                html += '<div class="corr-model-card-player">';
                html += '<audio controls preload="none"><source src="' + audioUrl + '"></audio>';
                html += '</div>';
            }
        } else {
            html += '<div class="corr-model-card-empty">모범답안 없음</div>';
        }

        html += '</div>';
    }
    html += '</div>';
    return html;
}

// ============================================================
// 6. 아코디언 UI
// ============================================================

function _addAccordionItem(container, title, bodyHtml, isOpen, sectionId) {
    var item = document.createElement('div');
    item.className = 'corr-accordion-item' + (isOpen ? ' open' : '');
    item.setAttribute('data-section', sectionId);

    var header = document.createElement('div');
    header.className = 'corr-accordion-header';
    header.innerHTML = '<span>' + title + '</span><i class="fas fa-chevron-down corr-accordion-arrow"></i>';
    header.onclick = function() {
        item.classList.toggle('open');
    };

    var body = document.createElement('div');
    body.className = 'corr-accordion-body';
    body.innerHTML = bodyHtml;

    item.appendChild(header);
    item.appendChild(body);
    container.appendChild(item);
}

// ============================================================
// 7. 2차 제출 진입
// ============================================================

/**
 * "수정하기" 버튼 클릭 (HTML onclick)
 */
function onCorrDetailDraft2Click(taskType) {
    var sessionState = window._correctionSessionState;
    if (!sessionState) return;

    var session = sessionState.session;
    var scheduleData = sessionState.scheduleData;
    var submissionMap = sessionState.submissionMap;

    // submission 찾기
    var subKey = session.session + '_' + taskType;
    var submission = submissionMap[subKey] || null;

    // 2차 데드라인 초과 체크 — 공개시각 + 24h(+연장). 앵커가 없으면(null) 차단하지 않는다.
    if (submission) {
        var ext = _corrExt(sessionState.extensionMap, session.session, taskType);
        var dl2 = getCorrDraft2DeadlineFromRelease(submission.released_1_at, submission.feedback_1_at, ext);
        if (dl2 && new Date() > dl2) {
            alert('2차 수정 마감이 지났습니다.');
            return;
        }
    }

    if (taskType === 'writing') {
        _startCorrectionWritingByType(session, scheduleData, submission);
    } else {
        _startCorrectionSpeakingByType(session, scheduleData, submission);
    }
}

// ============================================================
// 8. 뒤로가기
// ============================================================

function backFromCorrectionDetail() {
    _stopCorrDeadlineTimer();
    var sessionState = window._correctionSessionState;
    if (!sessionState) {
        showScreen('scheduleScreen');
        return;
    }

    // submission 데이터 갱신 후 세션 상세로 복귀
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
            openCorrectionSession(sessionState.session, sessionState.scheduleData, newMap, sessionState.extensionMap);
        }).catch(function() {
            openCorrectionSession(sessionState.session, sessionState.scheduleData, sessionState.submissionMap, sessionState.extensionMap);
        });
    } else {
        openCorrectionSession(sessionState.session, sessionState.scheduleData, sessionState.submissionMap, sessionState.extensionMap);
    }
}

// ============================================================
// 9. 데드라인 배너 + 에러 메시지
// ============================================================

/**
 * 과제 상세 데드라인 배너 렌더링
 * correction-session.js의 renderDeadlineBanner, getCorrDraft1/2Deadline 재사용
 */
function _renderCorrDetailDeadlineBanner(session, submission, taskType) {
    var bannerEl = document.getElementById('corrDetailDeadlineBanner');
    if (!bannerEl) return;

    var status = submission ? submission.status : '';

    // complete/expired/skipped면 배너 숨김
    if (['complete', 'expired', 'skipped'].indexOf(status) >= 0) {
        bannerEl.style.display = 'none';
        return;
    }

    var sessionState = window._correctionSessionState;
    if (!sessionState || !sessionState.scheduleData) {
        bannerEl.style.display = 'none';
        return;
    }

    var scheduleData = sessionState.scheduleData;
    var ext = _corrExt(sessionState.extensionMap, session.session, taskType);

    // 배너는 카드별 마감으로 이전돼 숨김(renderDeadlineBanner는 no-op). 2차 마감 계산은 2026-08-31 제거 — 카드/차단이 정본.
    var dl1 = getCorrDraft1Deadline(getCorrSessionStartDate(scheduleData, session), session.dayOffset, ext);
    renderDeadlineBanner(bannerEl, '1차 마감', dl1);
}

/**
 * failed 상태 에러 메시지 렌더링
 */
function _renderFailedMessage(status) {
    var round = (status === 'feedback2_failed') ? '최종' : '1차';
    return '<div class="corr-detail-error-msg">' +
        '<i class="fas fa-exclamation-triangle"></i>' +
        '<p>' + round + ' 첨삭 준비 중 문제가 발생했습니다.<br>잠시 후 다시 확인해주세요.</p>' +
        '<p class="corr-detail-error-sub">문제가 지속되면 담당자에게 문의해주세요.</p>' +
        '</div>';
}

// ============================================================
// 10. 유틸리티
// ============================================================

// ============================================================
// Speaking 2×2 그리드 카드
// ============================================================

function _renderSpeakingGrid(sub, audioPrefix) {
    var interviewData = _corrDetailInterviewData;

    // 호주첨삭 스피킹은 답변이 1개 → q1만 렌더 (일반첨삭 인터뷰는 4개)
    var qCount = (getCorrectionTrack() === 'aus') ? 1 : 4;

    var html = '<div class="corr-spk-grid">';
    for (var q = 1; q <= qCount; q++) {
        var path = sub[audioPrefix + q];
        var questionText = '';
        if (interviewData && interviewData.videos && interviewData.videos[q - 1]) {
            questionText = interviewData.videos[q - 1].script || '';
        }
        var url = '';
        if (path) {
            url = (path.indexOf('http') === 0) ? path : supabaseStorageUrl('correction-audio', path);
        }

        html += '<div class="corr-spk-card">';
        html += '<div class="corr-spk-card-header">';
        html += '<span class="corr-spk-card-badge">Q' + q + '</span>';
        html += '</div>';
        if (questionText) {
            html += '<p class="corr-spk-card-text">' + _escapeAndNl2br(questionText) + '</p>';
        }
        if (url) {
            html += '<div class="corr-spk-card-player">';
            html += '<audio controls preload="none"><source src="' + url + '"></audio>';
            html += '</div>';
        } else {
            html += '<div class="corr-spk-card-empty">파일 없음</div>';
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}

function _renderAudioRow(label, path) {
    if (!path) {
        return '<div class="corr-detail-audio-row"><span class="corr-detail-audio-label">' + label + '</span><span style="color:#aaa;">파일 없음</span></div>';
    }
    // Supabase Storage 공개 URL 구성
    var url = (path.indexOf('http') === 0) ? path : supabaseStorageUrl('correction-audio', path);
    return '<div class="corr-detail-audio-row">' +
        '<span class="corr-detail-audio-label">' + label + '</span>' +
        '<audio controls preload="none" style="height:36px; flex:1;"><source src="' + url + '"></audio>' +
        '</div>';
}

function _renderAudioPlayer(label, url) {
    if (!url) return '';
    return '<div class="corr-detail-audio-row" style="margin-top:12px;">' +
        '<span class="corr-detail-audio-label">' + label + '</span>' +
        '<audio controls preload="none" style="height:36px; flex:1;"><source src="' + url + '"></audio>' +
        '</div>';
}

function _countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(function(w) { return w.length > 0; }).length;
}

function _formatDate(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    var h = d.getHours();
    var min = d.getMinutes();
    return m + '/' + day + ' ' + (h < 10 ? '0' : '') + h + ':' + (min < 10 ? '0' : '') + min;
}

/**
 * Speaking 모범답안 번역 토글 버튼 이벤트 바인딩
 * 카드별 독립 동작 — Q1 열어도 Q2~Q4는 닫힌 상태 유지
 */
function _bindModelTransToggle() {
    var btns = document.querySelectorAll('.corr-model-trans-btn');
    for (var i = 0; i < btns.length; i++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                var qNum = btn.getAttribute('data-model-q');
                var transEl = document.getElementById('corrModelTrans_' + qNum);
                if (!transEl) return;
                var isHidden = transEl.style.display === 'none';
                transEl.style.display = isHidden ? 'block' : 'none';
                btn.textContent = isHidden ? '번역 숨기기' : '번역 보기';
            });
        })(btns[i]);
    }
}

function _escapeAndNl2br(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

console.log('✅ correction-detail.js 로드 완료');
