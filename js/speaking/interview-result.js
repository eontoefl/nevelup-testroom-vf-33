/**
 * interview-result.js
 * 스피킹 - 인터뷰 채점(결과) 화면
 * 
 * 완전 독립형: 컴포넌트 없이 데이터만으로 채점 화면을 표시합니다.
 * 오디오 재생을 자체적으로 처리합니다.
 */

// 내부 상태
let _interviewResultData = null;
let _interviewPlayingAudio = null;
let _interviewPlayingIndex = null;

/**
 * 채점 화면 표시
 * @param {Object} data - { set: { contextText, contextTranslation, videos: [...] } }
 */
function showInterviewResult(data) {
    console.log('📊 [interview-result] 채점화면 표시');
    
    _interviewResultData = data;
    const set = data.set;
    
    // 데이터 렌더링
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
    
    // 문제보기 섹션
    html += _renderQuestionsSection(set);
    
    // 모범답안 섹션 (1~4)
    for (let i = 0; i < set.videos.length; i++) {
        html += _renderModelAnswerSection(set, i);
    }
    
    container.innerHTML = html;
    
    console.log('🔗 [interview-result] 이벤트 리스너 등록 완료');
}

/**
 * 문제보기 섹션 렌더링
 * @private
 */
function _renderQuestionsSection(set) {
    let html = `
        <div class="interview-result-section">
            <div class="interview-result-toggle active" onclick="toggleInterviewQuestions()">
                <i class="fas fa-chevron-down" id="questionsToggleIcon"></i>
                <span>문제 보기</span>
            </div>
            <div id="questionsContent" class="interview-result-content" style="display: block;">
                <div class="interview-question-block">
                    <div class="interview-scenario">
                        <strong>Scenario</strong>
                        <div class="interview-scenario-text">${set.contextText}</div>
                        <span class="interview-translation">${set.contextTranslation || ''}</span>
                    </div>
                </div>
    `;
    
    // 문제 1~4
    for (let i = 0; i < set.videos.length; i++) {
        const video = set.videos[i];
        html += `
                <div class="interview-question-block">
                    <strong>Question ${i + 1}</strong>
                    <span class="interview-question-text">${video.script}</span>
                    <span class="interview-translation">${video.translation}</span>
                </div>
        `;
    }
    
    html += `
            </div>
        </div>
    `;
    
    return html;
}

/**
 * 모범답안 섹션 렌더링
 * @private
 */
function _renderModelAnswerSection(set, index) {
    const video = set.videos[index];
    const answerId = `answer${index}`;
    
    let html = `
        <div class="interview-result-section">
            <div class="interview-result-toggle" onclick="toggleInterviewModelAnswer(${index})">
                <i class="fas fa-chevron-down" id="${answerId}ToggleIcon"></i>
                <span>Model Answer ${index + 1}</span>
            </div>
            <div id="${answerId}Content" class="interview-result-content" style="display: none;">
                <div class="interview-audio-button">
                    <button onclick="playInterviewModelAnswerAudio(${index})" class="interview-play-button">
                        <i class="fas fa-volume-up"></i> 모범답안 듣기
                    </button>
                </div>
                <div class="interview-model-answer">
    `;
    
    // 모범답안 전체 텍스트 (줄바꿈 제거, 한 문단으로)
    const fullAnswer = video.modelAnswer.replace(/\n/g, ' ').trim();
    const fullTranslation = video.modelAnswerTranslation.replace(/\n/g, ' ').trim();
    
    // 전체 텍스트에서 하이라이트 부분 찾기
    const segments = _parseLineWithHighlights(fullAnswer, video.highlights);
    
    // 모범답안 전체 (하이라이트 포함)
    let answerHtml = '';
    for (const segment of segments) {
        if (segment.isHighlight) {
            const safeKey = segment.key.replace(/'/g, '&#39;');
            answerHtml += `<span class="interview-highlight" data-highlight="${safeKey}" onclick="showInterviewFeedback(${index}, '${safeKey}')">${segment.text}</span>`;
        } else {
            answerHtml += segment.text;
        }
    }
    
    html += `
                    <div class="interview-answer-full">
                        <p class="interview-script">${answerHtml}</p>
                        
                        <!-- 해석 펼치기/접기 -->
                        <div class="interview-translation-toggle" onclick="toggleInterviewTranslation(${index})">
                            <i class="fas fa-chevron-down" id="translation${index}ToggleIcon"></i>
                            <span>해석 보기</span>
                        </div>
                        <div id="translation${index}Content" class="interview-script-translation" style="display: none;">
                            ${fullTranslation}
                        </div>
                    </div>
    `;
    
    html += `
                </div>
                <div id="${answerId}Feedback" class="interview-feedback" style="display: none;">
                    <!-- 피드백이 여기 표시됨 -->
                </div>
            </div>
        </div>
    `;
    
    return html;
}

/**
 * 한 라인에서 여러 하이라이트를 찾아 세그먼트로 분리
 * @private
 */
function _parseLineWithHighlights(line, highlights) {
    if (!highlights || typeof highlights !== 'object') {
        return [{ text: line, isHighlight: false }];
    }
    
    // 긴 키부터 먼저 매칭
    const keys = Object.keys(highlights).sort((a, b) => b.length - a.length);
    
    const segments = [];
    let remainingText = line;
    
    // 각 하이라이트 키의 위치 찾기
    const matches = [];
    for (const key of keys) {
        const index = remainingText.indexOf(key);
        if (index !== -1) {
            matches.push({ key, index, length: key.length });
        }
    }
    
    // 위치 순서로 정렬
    matches.sort((a, b) => a.index - b.index);
    
    // 겹치는 매칭 제거
    const validMatches = [];
    let lastEnd = 0;
    for (const match of matches) {
        if (match.index >= lastEnd) {
            validMatches.push(match);
            lastEnd = match.index + match.length;
        }
    }
    
    // 세그먼트 생성
    let lastIndex = 0;
    for (const match of validMatches) {
        // 하이라이트 이전 텍스트
        if (match.index > lastIndex) {
            segments.push({
                text: remainingText.substring(lastIndex, match.index),
                isHighlight: false
            });
        }
        
        // 하이라이트 텍스트
        segments.push({
            text: match.key,
            key: match.key,
            isHighlight: true
        });
        
        lastIndex = match.index + match.length;
    }
    
    // 남은 텍스트
    if (lastIndex < remainingText.length) {
        segments.push({
            text: remainingText.substring(lastIndex),
            isHighlight: false
        });
    }
    
    // 매칭이 없으면 전체를 일반 텍스트로
    if (segments.length === 0) {
        segments.push({ text: line, isHighlight: false });
    }
    
    return segments;
}

// ============================================
// UI 토글 함수들
// ============================================

/**
 * 문제보기 토글
 */
function toggleInterviewQuestions() {
    const content = document.getElementById('questionsContent');
    const icon = document.getElementById('questionsToggleIcon');
    const toggle = icon.closest('.interview-result-toggle');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
        if (toggle) toggle.classList.add('active');
    } else {
        content.style.display = 'none';
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
        if (toggle) toggle.classList.remove('active');
    }
}

/**
 * 모범답안 토글
 */
function toggleInterviewModelAnswer(index) {
    const answerId = `answer${index}`;
    const content = document.getElementById(`${answerId}Content`);
    const icon = document.getElementById(`${answerId}ToggleIcon`);
    const toggle = icon.closest('.interview-result-toggle');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
        if (toggle) toggle.classList.add('active');
    } else {
        content.style.display = 'none';
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
        if (toggle) toggle.classList.remove('active');
    }
}

/**
 * 해석 토글
 */
function toggleInterviewTranslation(index) {
    const content = document.getElementById(`translation${index}Content`);
    const icon = document.getElementById(`translation${index}ToggleIcon`);
    const toggle = icon.closest('.interview-translation-toggle');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
        if (toggle) toggle.classList.add('active');
    } else {
        content.style.display = 'none';
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
        if (toggle) toggle.classList.remove('active');
    }
}

// ============================================
// 오디오 재생 (독립)
// ============================================

/**
 * 모범답안 오디오 재생/일시정지
 */
function playInterviewModelAnswerAudio(index) {
    if (!_interviewResultData) return;
    
    const set = _interviewResultData.set;
    const video = set.videos[index];
    const button = document.querySelector(`#answer${index}Content .interview-play-button`);
    if (!button) return;
    const icon = button.querySelector('i');
    const text = button.childNodes[button.childNodes.length - 1];
    
    // 현재 재생 중인 오디오가 같은 것이면 일시정지/재생 토글
    if (_interviewPlayingIndex === index && _interviewPlayingAudio) {
        if (_interviewPlayingAudio.paused) {
            _interviewPlayingAudio.play();
            icon.className = 'fas fa-pause';
            text.textContent = ' 일시정지';
            console.log(`▶️ [interview-result] 모범답안 ${index + 1} 재생 재개`);
        } else {
            _interviewPlayingAudio.pause();
            icon.className = 'fas fa-volume-up';
            text.textContent = ' 모범답안 듣기';
            console.log(`⏸️ [interview-result] 모범답안 ${index + 1} 일시정지`);
        }
        return;
    }
    
    // 다른 오디오가 재생 중이면 중지
    if (_interviewPlayingAudio) {
        _interviewPlayingAudio.pause();
        _interviewPlayingAudio.currentTime = 0;
        
        // 이전 버튼 아이콘 복원
        if (_interviewPlayingIndex !== null) {
            const prevButton = document.querySelector(`#answer${_interviewPlayingIndex}Content .interview-play-button`);
            if (prevButton) {
                const prevIcon = prevButton.querySelector('i');
                const prevText = prevButton.childNodes[prevButton.childNodes.length - 1];
                prevIcon.className = 'fas fa-volume-up';
                prevText.textContent = ' 모범답안 듣기';
            }
        }
    }
    
    // 새 오디오 재생
    if (video.modelAnswerAudio && video.modelAnswerAudio !== 'PLACEHOLDER') {
        console.log(`🔊 [interview-result] 모범답안 ${index + 1} 오디오 재생`);
        
        _interviewPlayingAudio = new Audio(video.modelAnswerAudio);
        _interviewPlayingIndex = index;
        
        // 재생 시작
        _interviewPlayingAudio.play();
        icon.className = 'fas fa-pause';
        text.textContent = ' 일시정지';
        
        // 재생 종료 시
        _interviewPlayingAudio.onended = () => {
            icon.className = 'fas fa-volume-up';
            text.textContent = ' 모범답안 듣기';
            _interviewPlayingAudio = null;
            _interviewPlayingIndex = null;
            console.log(`✅ [interview-result] 모범답안 ${index + 1} 재생 완료`);
        };
        
        // 에러 처리
        _interviewPlayingAudio.onerror = () => {
            console.error(`❌ [interview-result] 모범답안 ${index + 1} 재생 실패`);
            icon.className = 'fas fa-volume-up';
            text.textContent = ' 모범답안 듣기';
            _interviewPlayingAudio = null;
            _interviewPlayingIndex = null;
        };
    } else {
        console.log('⚠️ [interview-result] 모범답안 오디오 없음');
    }
}

/**
 * 피드백 표시 (하이라이트 클릭 시)
 */
function showInterviewFeedback(answerIndex, highlightKey) {
    if (!highlightKey) return;
    if (!_interviewResultData) return;
    
    const set = _interviewResultData.set;
    const video = set.videos[answerIndex];
    const highlights = video.highlights;
    
    // ʼ(U+02BC)와 '(일반 아포스트로피) 양쪽 다 대응
    let feedback = highlights[highlightKey];
    if (!feedback) {
        const altKey = highlightKey.replace(/'/g, 'ʼ');
        feedback = highlights[altKey];
    }
    if (!feedback) {
        const altKey2 = highlightKey.replace(/ʼ/g, "'");
        feedback = highlights[altKey2];
    }
    if (!highlights || !feedback) return;
    
    const feedbackDiv = document.getElementById(`answer${answerIndex}Feedback`);
    if (!feedbackDiv) return;
    
    // 피드백 HTML 생성
    feedbackDiv.innerHTML = `
        <span class="interview-feedback-badge">${feedback.title}</span>
        <div class="interview-feedback-content">
            <p class="interview-feedback-description">${feedback.description}</p>
        </div>
    `;
    
    feedbackDiv.style.display = 'block';
    
    console.log(`💡 [interview-result] 피드백 표시: ${feedback.title}`);
}

/**
 * 채점 완료
 */
function completeInterviewResult() {
    console.log('✅ [interview-result] 채점 완료');
    
    // 오디오 정지
    if (_interviewPlayingAudio) {
        _interviewPlayingAudio.pause();
        _interviewPlayingAudio = null;
    }
    
    _interviewResultData = null;
    _interviewPlayingIndex = null;
    
    // backToSchedule는 Module이 제공
    return true;
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
    _interviewResultData = null;
    _interviewPlayingIndex = null;
}

// 전역 노출
window.showInterviewResult = showInterviewResult;
window.renderInterviewResult = renderInterviewResult;
window.toggleInterviewQuestions = toggleInterviewQuestions;
window.toggleInterviewModelAnswer = toggleInterviewModelAnswer;
window.toggleInterviewTranslation = toggleInterviewTranslation;
window.playInterviewModelAnswerAudio = playInterviewModelAnswerAudio;
window.showInterviewFeedback = showInterviewFeedback;
window.completeInterviewResult = completeInterviewResult;
window.cleanupInterviewResult = cleanupInterviewResult;

console.log('✅ [interview-result] 로드 완료');
