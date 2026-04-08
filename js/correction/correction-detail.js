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
async function openCorrectionDetail(taskType, session, submission) {
    console.log('📋 [Correction Detail] 열기:', taskType, 'Session', session.session);

    // 전체 데이터가 필요하므로 단일 행 다시 조회 (feedback JSONB 포함)
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    if (user && user.id && submission) {
        var fullTaskType = (taskType === 'writing')
            ? (session.writing.type === 'email' ? 'writing_email' : 'writing_discussion')
            : 'speaking_interview';
        var fullSub = await getCorrectionSubmission(user.id, session.session, fullTaskType);
        if (fullSub) submission = fullSub;
    }

    showScreen('correctionDetailScreen');

    // 헤더
    var headerEl = document.getElementById('corrDetailHeader');
    var taskLabel = (taskType === 'writing')
        ? (session.writing.type === 'email' ? 'Email ' : 'Discussion ') + session.writing.number
        : 'Interview ' + session.speaking.number;
    if (headerEl) headerEl.textContent = 'SESSION ' + String(session.session).padStart(2, '0') + ' · ' + taskLabel;

    // 아코디언 렌더링
    var accordionEl = document.getElementById('corrDetailAccordion');
    if (!accordionEl) return;
    accordionEl.innerHTML = '';

    var status = submission ? submission.status : '';
    var isWriting = (taskType === 'writing');

    // --- Section 1: Draft 1 ---
    if (submission) {
        var draft1Content = _renderDraft1Content(isWriting, submission);
        var draft1Open = (status === 'draft1_submitted');
        _addAccordionItem(accordionEl, '1차 작성본', draft1Content, draft1Open, 'draft1');
    }

    // --- Section 2: 1차 피드백 ---
    if (submission && submission.released_1 && submission.feedback_1) {
        var fb1Content = _renderFeedbackContent(isWriting, submission.feedback_1, false);
        var fb1Open = (status === 'feedback1_ready');
        _addAccordionItem(accordionEl, '1차 피드백', fb1Content, fb1Open, 'feedback1');
    }

    // --- Section 3: Draft 2 ---
    if (submission && submission.released_1) {
        var draft2Content = _renderDraft2Content(isWriting, submission, taskType, session);
        var draft2Open = (status === 'feedback1_ready' && !submission.draft_2_text && !submission.draft_2_audio_q1);
        _addAccordionItem(accordionEl, '2차 수정본', draft2Content, draft2Open, 'draft2');
    }

    // --- Section 4: 최종 피드백 ---
    if (submission && submission.released_2 && submission.feedback_2) {
        var fb2Content = _renderFeedbackContent(isWriting, submission.feedback_2, true);
        var fb2Open = (status === 'feedback2_ready');
        _addAccordionItem(accordionEl, '최종 피드백', fb2Content, fb2Open, 'feedback2');
    }

    // --- Section 5: 모범답안 ---
    if (status === 'complete' || status === 'expired' || status === 'skipped') {
        var modelContent = _renderModelAnswer(isWriting, submission);
        _addAccordionItem(accordionEl, '모범답안', modelContent, true, 'model');
    }

    // 아코디언이 비어있으면 상태 메시지
    if (accordionEl.children.length === 0) {
        accordionEl.innerHTML = '<div style="text-align:center; padding:40px; color:#888;">과제 정보가 없습니다.</div>';
    }
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
        // Speaking: 오디오 파일 목록
        html += '<div class="corr-detail-meta">';
        if (sub.draft_1_submitted_at) {
            html += '<span>' + _formatDate(sub.draft_1_submitted_at) + ' 제출</span>';
        }
        html += '</div>';
        for (var q = 1; q <= 4; q++) {
            var path = sub['draft_1_audio_q' + q];
            html += _renderAudioRow('Q' + q, path);
        }
    }
    return html;
}

// ============================================================
// 3. Draft 2 렌더링
// ============================================================

function _renderDraft2Content(isWriting, sub, taskType, session) {
    var hasDraft2 = isWriting ? !!sub.draft_2_text : !!sub.draft_2_audio_q1;

    if (!hasDraft2) {
        // 2차 미제출 → "수정하기" 버튼
        var html = '<div style="text-align:center; padding:20px;">';
        html += '<p style="color:#666; margin-bottom:16px;">1차 피드백을 참고하여 수정본을 작성하세요.</p>';
        html += '<button class="corr-detail-action-btn" onclick="onCorrDetailDraft2Click(\'' + taskType + '\')">';
        html += '<i class="fas fa-edit"></i> 수정하기</button>';
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
        for (var q = 1; q <= 4; q++) {
            var path = sub['draft_2_audio_q' + q];
            html += _renderAudioRow('Q' + q, path);
        }
    }
    return html;
}

// ============================================================
// 4. 피드백 렌더링
// ============================================================

function _renderFeedbackContent(isWriting, feedback, isFinal) {
    if (!feedback) return '<div style="padding:20px; color:#888;">피드백 데이터가 없습니다.</div>';

    var html = '';

    // annotated_html 영역
    html += '<div class="corr-feedback-annotated" id="corrFb_' + (isFinal ? 'final' : 'first') + '"></div>';

    // summary 영역
    html += '<div class="corr-feedback-summary" id="corrFbSummary_' + (isFinal ? 'final' : 'first') + '"></div>';

    // 렌더링은 DOM에 삽입된 후 실행해야 하므로 setTimeout 사용
    var feedbackData = feedback;
    var writing = isWriting;
    setTimeout(function() {
        var annotatedEl = document.getElementById('corrFb_' + (isFinal ? 'final' : 'first'));
        var summaryEl = document.getElementById('corrFbSummary_' + (isFinal ? 'final' : 'first'));

        if (annotatedEl) {
            if (writing) {
                renderAnnotatedHtml(annotatedEl, feedbackData.annotated_html || '');
            } else {
                renderSpeakingFeedback(annotatedEl, feedbackData);
            }
        }
        if (summaryEl) {
            renderFeedbackSummary(summaryEl, feedbackData);
        }
    }, 50);

    return html;
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
        // Speaking 모범답안
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
    }

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

    if (taskType === 'writing') {
        startCorrectionWriting(session, scheduleData, submission);
    } else {
        startCorrectionSpeaking(session, scheduleData, submission);
    }
}

// ============================================================
// 8. 뒤로가기
// ============================================================

function backFromCorrectionDetail() {
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
            openCorrectionSession(sessionState.session, sessionState.scheduleData, newMap);
        }).catch(function() {
            openCorrectionSession(sessionState.session, sessionState.scheduleData, sessionState.submissionMap);
        });
    } else {
        openCorrectionSession(sessionState.session, sessionState.scheduleData, sessionState.submissionMap);
    }
}

// ============================================================
// 9. 유틸리티
// ============================================================

function _renderAudioRow(label, path) {
    if (!path) {
        return '<div class="corr-detail-audio-row"><span class="corr-detail-audio-label">' + label + '</span><span style="color:#aaa;">파일 없음</span></div>';
    }
    // Supabase Storage 공개 URL 구성
    var url = (path.indexOf('http') === 0) ? path : (window.SUPABASE_CONFIG ? window.SUPABASE_CONFIG.url + '/storage/v1/object/public/correction-audio/' + path : path);
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

function _escapeAndNl2br(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>');
}

console.log('✅ correction-detail.js 로드 완료');
