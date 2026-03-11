/**
 * lecture-result.js
 * 리스닝 - 렉쳐 결과/해설 화면
 */

console.log('[lecture-result] 로드 시작');

/**
 * 렉처 결과 화면 표시
 * @param {Array} data - 세트별 결과 배열 (explain-viewer.js에서 전달)
 */
function showLectureResults(data) {
    console.log('🎯 [결과 화면] showLectureResults() 시작');
    
    if (!data) {
        console.error('❌ [결과 화면] 결과 데이터가 없습니다');
        return;
    }
    
    // 데이터를 배열로 통일
    let setsArray;
    if (Array.isArray(data)) {
        setsArray = data;
    } else {
        setsArray = [data];
    }
    
    console.log(`📊 [결과 화면] 총 ${setsArray.length}개 세트`);
    
    // 전체 통계 계산
    let totalCorrect = 0;
    let totalIncorrect = 0;
    let totalQuestions = 0;
    
    setsArray.forEach(setData => {
        const answers = setData.answers || setData.results || [];
        answers.forEach(answer => {
            totalQuestions++;
            if (answer.isCorrect) {
                totalCorrect++;
            } else {
                totalIncorrect++;
            }
        });
    });
    
    const score = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    
    console.log(`📊 [결과 화면] 점수: ${score}% (정답: ${totalCorrect}, 오답: ${totalIncorrect}, 총: ${totalQuestions})`);
    
    // 점수 표시
    const scoreValueEl = document.getElementById('lectureResultScoreValue');
    if (scoreValueEl) scoreValueEl.textContent = `${score}%`;
    
    const correctCountEl = document.getElementById('lectureResultCorrectCount');
    if (correctCountEl) correctCountEl.textContent = totalCorrect;
    
    const incorrectCountEl = document.getElementById('lectureResultIncorrectCount');
    if (incorrectCountEl) incorrectCountEl.textContent = totalIncorrect;
    
    const totalCountEl = document.getElementById('lectureResultTotalCount');
    if (totalCountEl) totalCountEl.textContent = totalQuestions;
    
    // 세트별 결과 렌더링
    const detailsContainer = document.getElementById('lectureResultDetails');
    if (detailsContainer) {
        let allHtml = '';
        setsArray.forEach((setData, setIdx) => {
            // answers/results 통일
            const normalizedSet = {
                ...setData,
                results: setData.answers || setData.results || []
            };
            allHtml += renderLectureSetResult(normalizedSet, setIdx);
        });
        detailsContainer.innerHTML = allHtml;
    }
    
    console.log('✅ [결과 화면] 표시 완료');
}

/**
 * 세트 결과 렌더링 (Announcement와 동일한 구조)
 */
function renderLectureSetResult(resultData, setIdx = 0) {
    console.log(`🖼️ [세트 결과] renderLectureSetResult 시작 - 세트 ${setIdx + 1}`);
    
    const audioUrl = resultData.audioUrl || '';
    const script = resultData.script || '';
    const scriptTrans = resultData.scriptTrans || '';
    const scriptHighlights = resultData.scriptHighlights || [];
    const results = resultData.results || [];
    const setTitle = resultData.lectureTitle || resultData.setId || `세트 ${setIdx + 1}`;
    
    const audioId = `lecture-main-audio-${setIdx}`;
    
    const setNumber = setIdx + 1;
    const questionCount = results.length;
    const setMeta = resultData.setDescription || `학술강의 · ${questionCount}문제`;
    
    let html = `
        <div class="academic-set">
            <!-- 세트 헤더 -->
            <div class="academic-set-header">
                <span class="academic-set-badge">
                    <i class="fas fa-graduation-cap"></i>
                    Academic Set ${setNumber}
                </span>
                <span class="academic-set-meta">${setMeta}</span>
            </div>
            
            <!-- 강의 오디오 -->
            ${audioUrl ? `
            <div class="academic-audio-section">
                <div class="academic-audio-title">
                    <i class="fas fa-volume-up"></i>
                    <span>강의 다시 듣기</span>
                </div>
                <div class="academic-audio-player">
                    <button class="academic-play-btn" onclick="toggleLectureAudio('${audioId}')">
                        <i class="fas fa-play" id="${audioId}-icon"></i>
                    </button>
                    <div class="academic-seek-container">
                        <div class="academic-seek-bar" id="${audioId}-seek" onclick="seekLectureAudio('${audioId}', event)">
                            <div class="academic-seek-progress" id="${audioId}-progress" style="width: 0%">
                                <div class="academic-seek-handle"></div>
                            </div>
                        </div>
                        <div class="academic-audio-time">
                            <span id="${audioId}-current">0:00</span> <span id="${audioId}-duration">0:00</span>
                        </div>
                    </div>
                    <audio id="${audioId}" src="${audioUrl}"></audio>
                </div>
            </div>
            ` : ''}
            
            <!-- 전체 스크립트 -->
            ${script ? `
            <div class="academic-script-section">
                <button class="academic-script-toggle" onclick="toggleAcademicScriptSection('academic-script-fixed-${setIdx}')">
                    <i class="fas fa-file-alt"></i>
                    <span class="toggle-text">강의 전체 스크립트 보기</span>
                    <i class="fas fa-chevron-down" id="academic-script-fixed-${setIdx}-icon"></i>
                </button>
                <div id="academic-script-fixed-${setIdx}" class="academic-script-body" style="display: none;">
                    ${renderLectureScript(script, scriptTrans, scriptHighlights)}
                </div>
            </div>
            ` : ''}
            
            <!-- 구분선: 문제 영역 -->
            <div class="academic-questions-divider">
                <span>문제 해설</span>
            </div>
    `;
    
    // 각 문제 렌더링
    results.forEach((result, index) => {
        html += renderLectureAnswer(result, index, setIdx);
    });
    
    html += `
        </div>
    `;
    
    return html;
}

/**
 * 스크립트 렌더링 (Announcement와 동일)
 */
function renderLectureScript(script, scriptTrans, scriptHighlights = []) {
    if (!script) return '';
    
    // "Professor:" 제거 + \n 처리
    let cleanScript = script.replace(/^(Professor|Woman|Man):\s*/i, '').trim()
        .replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
    
    let cleanTrans = scriptTrans ? scriptTrans.replace(/^(Professor|Woman|Man):\s*/i, '')
        .replace(/\\n/g, '\n').replace(/\r\n/g, '\n') : '';
    
    let sentences = cleanScript.split(/\n\n+/).filter(s => s.trim());
    let translations = cleanTrans ? cleanTrans.split(/\n\n+/).filter(s => s.trim()) : [];
    
    if (sentences.length <= 1) {
        sentences = cleanScript.split(/(?<=[.!?])(?:\s*\n|\s{2,})/).filter(s => s.trim());
        translations = cleanTrans ? cleanTrans.split(/(?<=[.!?])(?:\s*\n|\s{2,})/).filter(s => s.trim()) : [];
    }
    if (sentences.length <= 1) {
        sentences = cleanScript.split(/(?<=[.!?])\s+/).filter(s => s.trim());
        translations = cleanTrans ? cleanTrans.split(/(?<=[.!?])\s+/).filter(s => s.trim()) : [];
    }
    
    let html = '';
    
    sentences.forEach((sentence, index) => {
        const translation = translations[index] || '';
        
        html += `
            <div class="academic-paragraph">
                <div class="academic-paragraph-text">
                    ${highlightLectureScript(sentence.replace(/\n/g, '<br>'), scriptHighlights)}
                </div>
                ${translation ? `<span class="academic-paragraph-translation">${translation.replace(/\n/g, '<br>')}</span>` : ''}
            </div>
        `;
    });
    return html;
}

/**
 * 스크립트 하이라이트 (Announcement와 동일)
 */
function highlightLectureScript(scriptText, highlights) {
    if (!highlights || highlights.length === 0) {
        return escapeHtml_lecture(scriptText);
    }
    
    let highlightedText = escapeHtml_lecture(scriptText);
    
    highlights.forEach((highlight) => {
        const word = highlight.word || '';
        const translation = highlight.translation || '';
        const explanation = highlight.explanation || '';
        
        if (!word) return;
        
        const regex = new RegExp(`\\b(${escapeRegex_lecture(word)})\\b`, 'gi');
        highlightedText = highlightedText.replace(regex, (match) => {
            return `<span class="academic-keyword" data-translation="${escapeHtml_lecture(translation)}" data-explanation="${escapeHtml_lecture(explanation)}">${match}</span>`;
        });
    });
    
    return highlightedText;
}

/**
 * 문제별 답안 렌더링 (Announcement와 유사한 구조)
 */
function renderLectureAnswer(result, index, setIdx) {
    
    const questionNum = index + 1;
    const questionText = result.questionText || result.question || '';
    const questionTrans = result.questionTrans || '';
    const userAnswer = result.userAnswer;
    const correctAnswer = result.correctAnswer;
    const isCorrect = result.isCorrect;
    const options = result.options || [];
    const translations = result.translations || result.optionTranslations || [];
    const explanations = result.explanations || result.optionExplanations || [];
    
    const correctIcon = isCorrect 
        ? '<i class="fas fa-check-circle" style="color: #77bf7e;"></i>' 
        : '<i class="fas fa-times-circle" style="color: #e74c5e;"></i>';
    
    const userAnswerText = userAnswer !== undefined && options[userAnswer - 1] ? options[userAnswer - 1] : '미응답';
    const correctAnswerText = options[(correctAnswer || 1) - 1] || '';
    
    const toggleId = `academic-fixed-toggle-q${setIdx || 0}-${index}`;
    
    // 보기 해설
    let optionsHtml = '';
    options.forEach((option, optIdx) => {
        const optionLetter = String.fromCharCode(65 + optIdx);
        const isCorrectOpt = correctAnswer === (optIdx + 1);
        const translation = translations[optIdx] || '';
        const explanation = explanations[optIdx] || '';
        
        optionsHtml += `
            <div class="academic-option ${isCorrectOpt ? 'correct' : ''}">
                <div class="academic-option-text"><span class="academic-option-marker">${optionLetter}</span>${option}</div>
                ${translation ? `<div class="academic-option-translation">${translation}</div>` : ''}
                ${explanation ? `
                <div class="academic-option-explanation ${isCorrectOpt ? 'correct' : 'incorrect'}">
                    <strong>${isCorrectOpt ? '정답 이유:' : '오답 이유:'}</strong> ${explanation}
                </div>
                ` : ''}
            </div>
        `;
    });
    
    return `
        <div class="academic-question">
            <div class="academic-question-header">
                <span class="academic-q-number">Question ${questionNum}</span>
                <span class="academic-q-status">${correctIcon}</span>
            </div>
            <div class="academic-q-text">${questionText}</div>
            ${questionTrans ? `<div class="academic-q-translation">${questionTrans}</div>` : ''}
            
            <div class="academic-answer-summary">
                <div class="academic-answer-row">
                    <span class="academic-answer-label">내 답변:</span>
                    <span class="academic-answer-value ${isCorrect ? 'correct' : 'incorrect'}">${userAnswerText}</span>
                </div>
                <div class="academic-answer-row">
                    <span class="academic-answer-label">정답:</span>
                    <span class="academic-answer-value correct">${correctAnswerText}</span>
                </div>
            </div>
            
            <button class="academic-toggle-btn" onclick="toggleAcademicExplanationFixed('${toggleId}')">
                <span class="toggle-text">보기 상세 해설 펼치기</span>
                <i class="fas fa-chevron-down" id="${toggleId}-icon"></i>
            </button>
            <div id="${toggleId}" class="academic-options-details" style="display: none;">
                ${optionsHtml}
            </div>
        </div>
    `;
}

/**
 * 선택지 상세 해설 렌더링
 */
// Academic 해설 토글 (fixed 버전)
function toggleAcademicExplanationFixed(toggleId) {
    const content = document.getElementById(toggleId);
    if (!content) return;
    const icon = document.getElementById(toggleId + '-icon');
    const btn = content.previousElementSibling;
    const text = btn ? btn.querySelector('.toggle-text') : null;
    
    if (content.style.display === 'none') {
        content.style.display = 'flex';
        if (icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
        if (text) text.textContent = '보기 상세 해설 접기';
    } else {
        content.style.display = 'none';
        if (icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
        if (text) text.textContent = '보기 상세 해설 펼치기';
    }
}

// Academic 스크립트 토글 (fixed 버전)
function toggleAcademicScriptSection(scriptId) {
    const content = document.getElementById(scriptId);
    if (!content) return;
    const icon = document.getElementById(scriptId + '-icon');
    const btn = content.previousElementSibling;
    const text = btn ? btn.querySelector('.toggle-text') : null;
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        if (icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
        if (text) text.textContent = '강의 전체 스크립트 접기';
    } else {
        content.style.display = 'none';
        if (icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
        if (text) text.textContent = '강의 전체 스크립트 보기';
    }
}

/**
 * 오디오 플레이어 컨트롤 함수들
 */
function toggleLectureAudio(audioId) {
    const audio = document.getElementById(audioId);
    const icon = document.getElementById(`${audioId}-icon`);
    if (!audio) return;
    
    if (audio.paused) {
        audio.play();
        if (icon) icon.className = 'fas fa-pause';
    } else {
        audio.pause();
        if (icon) icon.className = 'fas fa-play';
    }
    
    // 최초 재생 시 timeupdate 리스너 등록
    if (!audio._lectureListenerAdded) {
        audio._lectureListenerAdded = true;
        
        audio.addEventListener('loadedmetadata', function() {
            const durationEl = document.getElementById(`${audioId}-duration`);
            if (durationEl) durationEl.textContent = formatLectureTime(audio.duration);
        });
        
        audio.addEventListener('timeupdate', function() {
            const progress = document.getElementById(`${audioId}-progress`);
            const currentEl = document.getElementById(`${audioId}-current`);
            
            if (progress && audio.duration) {
                progress.style.width = (audio.currentTime / audio.duration * 100) + '%';
            }
            if (currentEl) currentEl.textContent = formatLectureTime(audio.currentTime);
        });
        
        audio.addEventListener('ended', function() {
            if (icon) icon.className = 'fas fa-play';
        });
    }
}

function seekLectureAudio(audioId, event) {
    const audio = document.getElementById(audioId);
    const seekBar = document.getElementById(`${audioId}-seek`);
    if (!audio || !seekBar) return;
    const rect = seekBar.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    if (audio.duration) {
        audio.currentTime = percent * audio.duration;
    }
}

function formatLectureTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * HTML 이스케이프
 */
function escapeHtml_lecture(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 정규식 이스케이프
 */
function escapeRegex_lecture(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


console.log('[lecture-result] 로드 완료');
