/**
 * interview-result.js
 * 스피킹 - 인터뷰 채점(결과) 화면
 * 
 * 완전 독립형: 컴포넌트 없이 데이터만으로 채점 화면을 표시합니다.
 * 오디오 재생을 자체적으로 처리합니다.
 * 
 * 모드:
 *   - initial: 문제보기만 열람 가능, Model Answer 잠금,
 *              "45초 타이머 시작하기" + 리셋 버튼 제공,
 *              "모범답안 보기" 버튼으로 전체 공개
 *   - current (또는 미지정): 기존 방식 — 전부 표시
 */

// 내부 상태
let _interviewResultData = null;
let _interviewPlayingAudio = null;
let _interviewPlayingIndex = null;
let _interviewMode = null;           // 'initial' | 'current'
let _interviewAnswersRevealed = false;
let _interviewTimerInterval = null;

/**
 * 채점 화면 표시
 * @param {Object} data - { set: { contextText, contextTranslation, videos: [...] } }
 * @param {string} mode - 'initial' | 'current'
 */
function showInterviewResult(data, mode) {
    console.log('📊 [interview-result] 채점화면 표시, mode=' + mode);
    
    if (!data || !data.set) {
        console.error('❌ [interview-result] 채점 데이터 없음');
        return;
    }
    
    _interviewResultData = data;
    _interviewMode = mode || 'current';
    _interviewAnswersRevealed = false;
    _clearInterviewTimer();
    
    const set = data.set;
    renderInterviewResult(set);
}

/**
 * 채점 화면 렌더링
 */
function renderInterviewResult(set) {
    console.log('🎨 [interview-result] 채점화면 렌더링');
    
    const container = document.getElementById('interviewResultContainer');
    if (!container) return;
    
    let html = '';
    
    // 문제보기 섹션 (항상 표시)
    html += _renderQuestionsSection(set);
    
    if (_interviewMode === 'initial') {
        // initial 모드: 안내문구 + 타이머 버튼 + 모범답안 보기 버튼
        html += _renderInitialRetrySection(set);
    }
    
    // 모범답안 섹션 (1~4)
    for (let i = 0; i < set.videos.length; i++) {
        html += _renderModelAnswerSection(set, i);
    }
    
    container.innerHTML = html;
    
    // initial 모드: 모범답안 섹션 숨김
    if (_interviewMode === 'initial') {
        _hideModelAnswerSections();
    }
    
    console.log('🔗 [interview-result] 렌더링 완료');
}

/**
 * initial 모드 — 안내문구 + 타이머 + 모범답안 보기 영역
 * @private
 */
function _renderInitialRetrySection(set) {
    return '<div class="interview-result-section interview-retry-section" id="interviewRetrySection">' +
        '<div class="interview-retry-guide">' +
            '<i class="fas fa-comments"></i>' +
            '<span>문제를 보고 45초 동안 재답변을 해보세요</span>' +
        '</div>' +
        '<div class="interview-retry-actions">' +
            '<button class="interview-timer-btn" id="interviewTimerBtn" onclick="startInterviewTimer()">' +
                '<i class="fas fa-stopwatch"></i> 45초 타이머 시작하기' +
            '</button>' +
            '<div class="interview-timer-display" id="interviewTimerDisplay" style="display:none;">' +
                '<span class="interview-timer-count" id="interviewTimerCount">45</span>' +
                '<span class="interview-timer-label">초 남음</span>' +
                '<button class="interview-timer-reset-btn" id="interviewTimerResetBtn" onclick="resetInterviewTimer()">' +
                    '<i class="fas fa-redo-alt"></i>' +
                '</button>' +
            '</div>' +
        '</div>' +
        '<button class="interview-reveal-btn" id="interviewRevealBtn" onclick="revealInterviewAnswers()">' +
            '<i class="fas fa-eye"></i> 모범답안 보기' +
        '</button>' +
    '</div>';
}

/**
 * 문제보기 섹션 렌더링
 * @private
 */
function _renderQuestionsSection(set) {
    let html = '<div class="interview-result-section">' +
        '<div class="interview-result-toggle active" onclick="toggleInterviewQuestions()">' +
            '<i class="fas fa-chevron-down" id="questionsToggleIcon"></i>' +
            '<span>문제 보기</span>' +
        '</div>' +
        '<div id="questionsContent" class="interview-result-content" style="display: block;">' +
            '<div class="interview-question-block">' +
                '<div class="interview-scenario">' +
                    '<strong>Scenario</strong>' +
                    '<div class="interview-scenario-text">' + set.contextText + '</div>' +
                    '<span class="interview-translation">' + (set.contextTranslation || '') + '</span>' +
                '</div>' +
            '</div>';
    
    for (let i = 0; i < set.videos.length; i++) {
        var video = set.videos[i];
        html += '<div class="interview-question-block">' +
                    '<strong>Question ' + (i + 1) + '</strong>' +
                    '<span class="interview-question-text">' + video.script + '</span>' +
                    '<span class="interview-translation">' + video.translation + '</span>' +
                '</div>';
    }
    
    html += '</div></div>';
    return html;
}

/**
 * 모범답안 섹션 렌더링
 * @private
 */
function _renderModelAnswerSection(set, index) {
    var video = set.videos[index];
    var answerId = 'answer' + index;
    
    var html = '<div class="interview-result-section interview-model-section" data-answer-index="' + index + '">' +
        '<div class="interview-result-toggle" onclick="toggleInterviewModelAnswer(' + index + ')">' +
            '<i class="fas fa-chevron-down" id="' + answerId + 'ToggleIcon"></i>' +
            '<span>Model Answer ' + (index + 1) + '</span>' +
        '</div>' +
        '<div id="' + answerId + 'Content" class="interview-result-content" style="display: none;">' +
            '<div class="interview-audio-button">' +
                '<button onclick="playInterviewModelAnswerAudio(' + index + ')" class="interview-play-button">' +
                    '<i class="fas fa-volume-up"></i> 모범답안 듣기' +
                '</button>' +
            '</div>' +
            '<div class="interview-model-answer">';
    
    // 모범답안 전체 텍스트
    var fullAnswer = video.modelAnswer.replace(/\n/g, ' ').trim();
    var fullTranslation = video.modelAnswerTranslation.replace(/\n/g, ' ').trim();
    
    // 하이라이트 파싱
    var segments = _parseLineWithHighlights(fullAnswer, video.highlights);
    
    var answerHtml = '';
    for (var s = 0; s < segments.length; s++) {
        var segment = segments[s];
        if (segment.isHighlight) {
            var safeKey = segment.key.replace(/'/g, '&#39;');
            answerHtml += '<span class="interview-highlight" data-highlight="' + safeKey + '" onclick="showInterviewFeedback(' + index + ', \'' + safeKey + '\')">' + segment.text + '</span>';
        } else {
            answerHtml += segment.text;
        }
    }
    
    html += '<div class="interview-answer-full">' +
                '<p class="interview-script">' + answerHtml + '</p>' +
                '<div class="interview-translation-toggle" onclick="toggleInterviewTranslation(' + index + ')">' +
                    '<i class="fas fa-chevron-down" id="translation' + index + 'ToggleIcon"></i>' +
                    '<span>해석 보기</span>' +
                '</div>' +
                '<div id="translation' + index + 'Content" class="interview-script-translation" style="display: none;">' +
                    fullTranslation +
                '</div>' +
            '</div>';
    
    html += '</div>' +
            '<div id="' + answerId + 'Feedback" class="interview-feedback" style="display: none;"></div>' +
        '</div>' +
    '</div>';
    
    return html;
}

/**
 * initial 모드: 모범답안 섹션 숨김
 * @private
 */
function _hideModelAnswerSections() {
    var sections = document.querySelectorAll('.interview-model-section');
    for (var i = 0; i < sections.length; i++) {
        sections[i].style.display = 'none';
    }
}

/**
 * 모범답안 전체 공개
 */
function revealInterviewAnswers() {
    _interviewAnswersRevealed = true;
    _clearInterviewTimer();

    // retry 섹션 제거
    var retrySection = document.getElementById('interviewRetrySection');
    if (retrySection) retrySection.remove();

    // 모범답안 섹션 표시
    var sections = document.querySelectorAll('.interview-model-section');
    for (var i = 0; i < sections.length; i++) {
        sections[i].style.display = '';
    }

    console.log('📖 [interview-result] 모범답안 전체 공개');
}

/**
 * 45초 타이머 시작
 */
function startInterviewTimer() {
    var btn = document.getElementById('interviewTimerBtn');
    var display = document.getElementById('interviewTimerDisplay');
    var countEl = document.getElementById('interviewTimerCount');
    if (!btn || !display || !countEl) return;

    // 이미 진행 중이면 무시
    if (_interviewTimerInterval) return;

    btn.style.display = 'none';
    display.style.display = 'flex';

    var remaining = 45;
    countEl.textContent = remaining;

    _interviewTimerInterval = setInterval(function() {
        remaining--;
        countEl.textContent = remaining;

        if (remaining <= 0) {
            _clearInterviewTimer();
            display.innerHTML = '<i class="fas fa-check-circle"></i> <span class="interview-timer-label">시간 종료! 모범답안을 확인해보세요</span>' +
                '<button class="interview-timer-reset-btn" id="interviewTimerResetBtn" onclick="resetInterviewTimer()">' +
                    '<i class="fas fa-redo-alt"></i>' +
                '</button>';
        }
    }, 1000);
}

/**
 * 타이머 리셋
 */
function resetInterviewTimer() {
    _clearInterviewTimer();

    var btn = document.getElementById('interviewTimerBtn');
    var display = document.getElementById('interviewTimerDisplay');

    // display가 종료 상태로 innerHTML이 바뀌었을 수 있으므로 복원
    if (display) {
        display.innerHTML = '<span class="interview-timer-count" id="interviewTimerCount">45</span>' +
            '<span class="interview-timer-label">초 남음</span>' +
            '<button class="interview-timer-reset-btn" id="interviewTimerResetBtn" onclick="resetInterviewTimer()">' +
                '<i class="fas fa-redo-alt"></i>' +
            '</button>';
        display.style.display = 'none';
    }

    if (btn) btn.style.display = '';
}

/**
 * 타이머 정리
 * @private
 */
function _clearInterviewTimer() {
    if (_interviewTimerInterval) {
        clearInterval(_interviewTimerInterval);
        _interviewTimerInterval = null;
    }
}

/**
 * 한 라인에서 여러 하이라이트를 찾아 세그먼트로 분리
 * @private
 */
function _parseLineWithHighlights(line, highlights) {
    if (!highlights || typeof highlights !== 'object') {
        return [{ text: line, isHighlight: false }];
    }
    
    var keys = Object.keys(highlights).sort(function(a, b) { return b.length - a.length; });
    
    var matches = [];
    for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        var idx = line.indexOf(key);
        if (idx !== -1) {
            matches.push({ key: key, index: idx, length: key.length });
        }
    }
    
    matches.sort(function(a, b) { return a.index - b.index; });
    
    var validMatches = [];
    var lastEnd = 0;
    for (var m = 0; m < matches.length; m++) {
        if (matches[m].index >= lastEnd) {
            validMatches.push(matches[m]);
            lastEnd = matches[m].index + matches[m].length;
        }
    }
    
    var segments = [];
    var lastIndex = 0;
    for (var v = 0; v < validMatches.length; v++) {
        var match = validMatches[v];
        if (match.index > lastIndex) {
            segments.push({ text: line.substring(lastIndex, match.index), isHighlight: false });
        }
        segments.push({ text: match.key, key: match.key, isHighlight: true });
        lastIndex = match.index + match.length;
    }
    
    if (lastIndex < line.length) {
        segments.push({ text: line.substring(lastIndex), isHighlight: false });
    }
    
    if (segments.length === 0) {
        segments.push({ text: line, isHighlight: false });
    }
    
    return segments;
}

// ============================================
// UI 토글 함수들
// ============================================

function toggleInterviewQuestions() {
    var content = document.getElementById('questionsContent');
    var icon = document.getElementById('questionsToggleIcon');
    var toggle = icon ? icon.closest('.interview-result-toggle') : null;
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        if (icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
        if (toggle) toggle.classList.add('active');
    } else {
        content.style.display = 'none';
        if (icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
        if (toggle) toggle.classList.remove('active');
    }
}

function toggleInterviewModelAnswer(index) {
    var answerId = 'answer' + index;
    var content = document.getElementById(answerId + 'Content');
    var icon = document.getElementById(answerId + 'ToggleIcon');
    var toggle = icon ? icon.closest('.interview-result-toggle') : null;
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        if (icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
        if (toggle) toggle.classList.add('active');
    } else {
        content.style.display = 'none';
        if (icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
        if (toggle) toggle.classList.remove('active');
    }
}

function toggleInterviewTranslation(index) {
    var content = document.getElementById('translation' + index + 'Content');
    var icon = document.getElementById('translation' + index + 'ToggleIcon');
    var toggle = icon ? icon.closest('.interview-translation-toggle') : null;
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        if (icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
        if (toggle) toggle.classList.add('active');
    } else {
        content.style.display = 'none';
        if (icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
        if (toggle) toggle.classList.remove('active');
    }
}

// ============================================
// 오디오 재생
// ============================================

function playInterviewModelAnswerAudio(index) {
    if (!_interviewResultData) return;
    
    var set = _interviewResultData.set;
    var video = set.videos[index];
    var button = document.querySelector('#answer' + index + 'Content .interview-play-button');
    if (!button) return;
    var icon = button.querySelector('i');
    var text = button.childNodes[button.childNodes.length - 1];
    
    if (_interviewPlayingIndex === index && _interviewPlayingAudio) {
        if (_interviewPlayingAudio.paused) {
            _interviewPlayingAudio.play();
            icon.className = 'fas fa-pause';
            text.textContent = ' 일시정지';
        } else {
            _interviewPlayingAudio.pause();
            icon.className = 'fas fa-volume-up';
            text.textContent = ' 모범답안 듣기';
        }
        return;
    }
    
    if (_interviewPlayingAudio) {
        _interviewPlayingAudio.pause();
        _interviewPlayingAudio.currentTime = 0;
        if (_interviewPlayingIndex !== null) {
            var prevButton = document.querySelector('#answer' + _interviewPlayingIndex + 'Content .interview-play-button');
            if (prevButton) {
                var prevIcon = prevButton.querySelector('i');
                var prevText = prevButton.childNodes[prevButton.childNodes.length - 1];
                prevIcon.className = 'fas fa-volume-up';
                prevText.textContent = ' 모범답안 듣기';
            }
        }
    }
    
    if (video.modelAnswerAudio && video.modelAnswerAudio !== 'PLACEHOLDER') {
        _interviewPlayingAudio = new Audio(video.modelAnswerAudio);
        _interviewPlayingIndex = index;
        
        _interviewPlayingAudio.play();
        icon.className = 'fas fa-pause';
        text.textContent = ' 일시정지';
        
        _interviewPlayingAudio.onended = function() {
            icon.className = 'fas fa-volume-up';
            text.textContent = ' 모범답안 듣기';
            _interviewPlayingAudio = null;
            _interviewPlayingIndex = null;
        };
        
        _interviewPlayingAudio.onerror = function() {
            console.error('❌ [interview-result] 모범답안 재생 실패');
            icon.className = 'fas fa-volume-up';
            text.textContent = ' 모범답안 듣기';
            _interviewPlayingAudio = null;
            _interviewPlayingIndex = null;
        };
    }
}

/**
 * 피드백 표시 (하이라이트 클릭 시)
 */
function showInterviewFeedback(answerIndex, highlightKey) {
    if (!highlightKey || !_interviewResultData) return;
    
    var set = _interviewResultData.set;
    var video = set.videos[answerIndex];
    var highlights = video.highlights;
    
    var feedback = highlights[highlightKey];
    if (!feedback) {
        var altKey = highlightKey.replace(/'/g, '\u02BC');
        feedback = highlights[altKey];
    }
    if (!feedback) {
        var altKey2 = highlightKey.replace(/\u02BC/g, "'");
        feedback = highlights[altKey2];
    }
    if (!highlights || !feedback) return;
    
    var feedbackDiv = document.getElementById('answer' + answerIndex + 'Feedback');
    if (!feedbackDiv) return;
    
    feedbackDiv.innerHTML = '<span class="interview-feedback-badge">' + feedback.title + '</span>' +
        '<div class="interview-feedback-content">' +
            '<p class="interview-feedback-description">' + feedback.description + '</p>' +
        '</div>';
    
    feedbackDiv.style.display = 'block';
}

/**
 * Cleanup (화면 전환 시 호출)
 */
function cleanupInterviewResult() {
    console.log('🧹 [interview-result] Cleanup');
    if (_interviewPlayingAudio) {
        _interviewPlayingAudio.pause();
        _interviewPlayingAudio = null;
    }
    _clearInterviewTimer();
    _interviewResultData = null;
    _interviewPlayingIndex = null;
    _interviewMode = null;
    _interviewAnswersRevealed = false;
}

// 전역 노출
window.showInterviewResult = showInterviewResult;
window.toggleInterviewQuestions = toggleInterviewQuestions;
window.toggleInterviewModelAnswer = toggleInterviewModelAnswer;
window.toggleInterviewTranslation = toggleInterviewTranslation;
window.playInterviewModelAnswerAudio = playInterviewModelAnswerAudio;
window.showInterviewFeedback = showInterviewFeedback;
window.startInterviewTimer = startInterviewTimer;
window.resetInterviewTimer = resetInterviewTimer;
window.revealInterviewAnswers = revealInterviewAnswers;

console.log('✅ [Speaking] interview-result.js 로드 완료');
