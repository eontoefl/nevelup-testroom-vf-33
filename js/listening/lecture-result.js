/**
 * lecture-result.js
 * 리스닝 - 렉쳐 결과/해설 화면
 */

console.log('[lecture-result] 로드 시작');

var _lectureExplainMode = null;

/**
 * 렉처 결과 화면 표시
 * @param {Array} data - 세트별 결과 배열 (explain-viewer.js에서 전달)
 * @param {string} mode - 'initial' | 'current' (explain-viewer.js에서 전달)
 */
function showLectureResults(data, mode) {
    console.log('🎯 [결과 화면] showLectureResults() 시작');
    
    _lectureExplainMode = mode || null;
    
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
    
    const score = Math.round((totalCorrect / totalQuestions) * 100);
    
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
            allHtml += renderLectureSetResult(normalizedSet, setIdx, mode);
        });
        detailsContainer.innerHTML = allHtml;
    }
    
    // 오디오 리스너 초기화 (DOM 렌더링 직후)
    initLectureResultAudioListeners();
    if (typeof bindRdWordEvents === 'function') bindRdWordEvents();
    
    console.log('✅ [결과 화면] 표시 완료');
}

/**
 * 세트 결과 렌더링 (Announcement와 동일한 구조)
 */
function renderLectureSetResult(resultData, setIdx, mode) {
    console.log(`🖼️ [세트 결과] renderLectureSetResult 시작 - 세트 ${setIdx + 1}`);
    
    const audioUrl = resultData.audioUrl || '';
    const script = resultData.script || '';
    const scriptTrans = resultData.scriptTrans || '';
    const scriptHighlights = resultData.scriptHighlights || [];
    const results = resultData.results || [];
    
    const audioId = `lecture-main-audio-${setIdx}`;
    
    const setNumber = setIdx + 1;
    const questionCount = results.length;
    const setMeta = resultData.setDescription || `학술강의 · ${questionCount}문제`;
    
    let html = `
        <div class="lecture-set">
            <!-- 세트 헤더 -->
            <div class="lecture-set-header">
                <span class="lecture-set-badge">
                    <i class="fas fa-graduation-cap"></i>
                    Academic Set ${setNumber}
                </span>
                <span class="lecture-set-meta">${setMeta}</span>
            </div>
            
            <!-- 강의 오디오 -->
            ${audioUrl ? `
            <div class="lecture-audio-section">
                <div class="lecture-audio-title">
                    <i class="fas fa-volume-up"></i>
                    <span>강의 다시 듣기</span>
                </div>
                <div class="lecture-audio-player">
                    <button class="lecture-play-btn" onclick="toggleLectureAudio('${audioId}')">
                        <i class="fas fa-play" id="${audioId}-icon"></i>
                    </button>
                    <div class="lecture-seek-container">
                        <div class="lecture-seek-bar" id="${audioId}-seek" onclick="seekLectureAudio('${audioId}', event)">
                            <div class="lecture-seek-progress" id="${audioId}-progress" style="width: 0%">
                                <div class="lecture-seek-handle"></div>
                            </div>
                        </div>
                        <div class="lecture-audio-time">
                            <span id="${audioId}-current">0:00</span> <span id="${audioId}-duration">0:00</span>
                        </div>
                    </div>
                    <audio id="${audioId}" src="${audioUrl}"></audio>
                </div>
            </div>
            ` : ''}
            
            <!-- 전체 스크립트 -->
            ${script ? `
            <div class="lecture-script-section">
                <button class="lecture-script-toggle" onclick="toggleLectureScriptSection('lecture-script-fixed-${setIdx}')">
                    <i class="fas fa-file-alt"></i>
                    <span class="toggle-text">강의 전체 스크립트 보기</span>
                    <i class="fas fa-chevron-down" id="lecture-script-fixed-${setIdx}-icon"></i>
                </button>
                <div id="lecture-script-fixed-${setIdx}" class="lecture-script-body" style="display: none;">
                    ${renderLectureScript(script, scriptTrans, scriptHighlights)}
                </div>
            </div>
            ` : ''}
            
            <!-- 구분선: 문제 영역 -->
            <div class="lecture-questions-divider">
                <span>문제 해설</span>
            </div>
    `;
    
    // 각 문제 렌더링
    results.forEach((result, index) => {
        html += renderLectureAnswer(result, index, setIdx, mode);
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
            <div class="lecture-paragraph">
                <div class="lecture-paragraph-text">
                    ${highlightLectureScript(sentence.replace(/\n/g, '<br>'), scriptHighlights)}
                </div>
                ${translation ? `<span class="lecture-paragraph-translation">${translation.replace(/\n/g, '<br>')}</span>` : ''}
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
        return escapeHtml_listening(scriptText);
    }
    
    let highlightedText = escapeHtml_listening(scriptText);
    
    highlights.forEach((highlight) => {
        const word = highlight.word || '';
        const translation = highlight.translation || '';
        const explanation = highlight.explanation || '';
        
        if (!word) return;
        
        const regex = new RegExp(`\\b(${escapeRegex_listening(word)})\\b`, 'gi');
        highlightedText = highlightedText.replace(regex, (match) => {
            return `<span class="interactive-word" data-translation="${escapeHtml_listening(translation)}" data-explanation="${escapeHtml_listening(explanation)}">${match}</span>`;
        });
    });
    
    return highlightedText;
}

/**
 * 문제별 답안 렌더링 (Announcement와 유사한 구조)
 */
function renderLectureAnswer(result, index, setIdx, mode) {
    
    const questionNum = index + 1;
    const questionText = result.questionText || '';
    const questionTrans = result.questionTrans || '';
    const userAnswer = result.userAnswer;
    const correctAnswer = result.correctAnswer;
    const isCorrect = result.isCorrect;
    const isRetryTarget = (mode === 'initial' && !isCorrect);
    const options = result.options || [];
    const optionTranslations = result.optionTranslations || [];
    const optionExplanations = result.optionExplanations || [];
    
    const correctIcon = isCorrect 
        ? '<i class="fas fa-check-circle" style="color: #77bf7e;"></i>' 
        : '<i class="fas fa-times-circle" style="color: #e74c5e;"></i>';
    
    const userAnswerText = userAnswer !== undefined && options[userAnswer - 1] ? options[userAnswer - 1] : '미응답';
    const correctAnswerText = options[(correctAnswer || 1) - 1] || '';
    
    const toggleId = `lecture-fixed-toggle-q${setIdx || 0}-${index}`;
    const retryId = 'retry-lec-' + (setIdx || 0) + '-' + index;
    
    // 보기 해설 HTML
    let optionsHtml = '';
    options.forEach((option, optIdx) => {
        const optionLetter = String.fromCharCode(65 + optIdx);
        const isCorrectOpt = correctAnswer === (optIdx + 1);
        const translation = optionTranslations[optIdx] || '';
        const explanation = optionExplanations[optIdx] || '';
        
        optionsHtml += `
            <div class="lecture-option ${isCorrectOpt ? 'correct' : ''}">
                <div class="lecture-option-text"><span class="lecture-option-marker">${optionLetter}</span>${option}</div>
                ${translation ? `<div class="lecture-option-translation">${translation}</div>` : ''}
                ${explanation ? `
                <div class="lecture-option-explanation ${isCorrectOpt ? 'correct' : 'incorrect'}">
                    <strong>${isCorrectOpt ? '정답 이유:' : '오답 이유:'}</strong> ${explanation}
                </div>
                ` : ''}
            </div>
        `;
    });
    
    var explanationBlock = `
            <button class="lecture-toggle-btn" onclick="toggleLectureExplanation('${toggleId}')">
                <span class="toggle-text">보기 상세 해설 펼치기</span>
                <i class="fas fa-chevron-down" id="${toggleId}-icon"></i>
            </button>
            <div id="${toggleId}" class="lecture-options-details" style="display: none;">
                ${optionsHtml}
            </div>
    `;
    
    if (isRetryTarget) {
        return `
        <div class="lecture-question" id="${retryId}-container">
            <div class="lecture-question-header">
                <span class="lecture-q-number">Question ${questionNum}</span>
                <span class="lecture-q-status">${correctIcon}</span>
            </div>
            <div class="lecture-q-text">${questionText}</div>
            ${questionTrans ? `<div class="lecture-q-translation">${questionTrans}</div>` : ''}
            
            <div class="lecture-answer-summary">
                <div class="lecture-answer-row">
                    <span class="lecture-answer-label">✗ 1차 답변:</span>
                    <span class="lecture-answer-value incorrect">${userAnswerText}</span>
                </div>
            </div>
            
            ${renderListeningRetryQuestion(result, retryId, function() { return explanationBlock; }, index, setIdx)}
        </div>
        `;
    }
    
    return `
        <div class="lecture-question">
            <div class="lecture-question-header">
                <span class="lecture-q-number">Question ${questionNum}</span>
                <span class="lecture-q-status">${correctIcon}</span>
            </div>
            <div class="lecture-q-text">${questionText}</div>
            ${questionTrans ? `<div class="lecture-q-translation">${questionTrans}</div>` : ''}
            
            <div class="lecture-answer-summary">
                <div class="lecture-answer-row">
                    <span class="lecture-answer-label">내 답변:</span>
                    <span class="lecture-answer-value ${isCorrect ? 'correct' : 'incorrect'}">${userAnswerText}</span>
                </div>
                <div class="lecture-answer-row">
                    <span class="lecture-answer-label">정답:</span>
                    <span class="lecture-answer-value correct">${correctAnswerText}</span>
                </div>
            </div>
            
            ${explanationBlock}
        </div>
    `;
}

// 렉쳐 해설 토글
function toggleLectureExplanation(toggleId) {
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

// 렉쳐 스크립트 토글
function toggleLectureScriptSection(scriptId) {
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
        // 모든 오디오 정지
        document.querySelectorAll('audio').forEach(a => {
            if (a.id !== audioId && !a.paused) {
                a.pause();
                const otherIcon = document.getElementById(`${a.id}-icon`);
                if (otherIcon) {
                    otherIcon.classList.remove('fa-pause');
                    otherIcon.classList.add('fa-play');
                }
            }
        });
        
        audio.play();
        if (icon) {
            icon.classList.remove('fa-play');
            icon.classList.add('fa-pause');
        }
    } else {
        audio.pause();
        if (icon) {
            icon.classList.remove('fa-pause');
            icon.classList.add('fa-play');
        }
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

// 오디오 이벤트 리스너 초기화 (다른 3개 모듈과 동일 패턴)
function initLectureResultAudioListeners() {
    const audios = document.querySelectorAll('audio[id^="lecture-main-audio-"]');
    
    audios.forEach((audio) => {
        const audioId = audio.id;
        const progressBar = document.getElementById(`${audioId}-progress`);
        const currentTimeSpan = document.getElementById(`${audioId}-current`);
        const durationSpan = document.getElementById(`${audioId}-duration`);
        const icon = document.getElementById(`${audioId}-icon`);
        
        audio.addEventListener('timeupdate', () => {
            if (audio.duration) {
                const progress = (audio.currentTime / audio.duration) * 100;
                if (progressBar) progressBar.style.width = progress + '%';
                if (currentTimeSpan) currentTimeSpan.textContent = formatLectureTime(audio.currentTime);
            }
        });
        
        audio.addEventListener('loadedmetadata', () => {
            if (durationSpan) durationSpan.textContent = formatLectureTime(audio.duration);
        });
        
        // 이미 로드된 경우 즉시 duration 표시
        if (audio.readyState >= 1 && audio.duration) {
            if (durationSpan) durationSpan.textContent = formatLectureTime(audio.duration);
        } else {
            audio.load();
        }
        
        audio.addEventListener('ended', () => {
            if (icon) {
                icon.classList.remove('fa-pause');
                icon.classList.add('fa-play');
            }
        });
    });
}




console.log('✅ [Listening] lecture-result.js 로드 완료');
