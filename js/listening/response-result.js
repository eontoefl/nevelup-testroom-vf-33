// Listening - 응답고르기 결과/해설 화면

// 결과 화면 표시
// @param {Array} data - 세트별 결과 배열 (explain-viewer.js에서 전달)
function showResponseResults(data) {
    console.log('📊 [응답고르기] 결과 화면 표시');
    
    if (!data) {
        console.error('❌ 결과 데이터가 없습니다');
        return;
    }
    
    const responseResults = data;
    
    // 전체 정답/오답 계산
    let totalCorrect = 0;
    let totalQuestions = 0;
    
    responseResults.forEach(setResult => {
        setResult.answers.forEach(answer => {
            totalQuestions++;
            if (answer.isCorrect) {
                totalCorrect++;
            }
        });
    });
    
    const totalIncorrect = totalQuestions - totalCorrect;
    const totalScore = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    
    console.log('📊 총 문제:', totalQuestions);
    console.log('✅ 정답:', totalCorrect);
    console.log('❌ 오답:', totalIncorrect);
    console.log('💯 점수:', totalScore + '%');
    
    // 결과 UI 업데이트
    document.getElementById('responseResultScoreValue').textContent = totalScore + '%';
    document.getElementById('responseResultCorrectCount').textContent = totalCorrect;
    document.getElementById('responseResultIncorrectCount').textContent = totalIncorrect;
    document.getElementById('responseResultTotalCount').textContent = totalQuestions;
    
    // 세부 결과 렌더링
    const detailsContainer = document.getElementById('responseResultDetails');
    let detailsHTML = '';
    
    responseResults.forEach((setResult, setIdx) => {
        detailsHTML += renderResponseSetResult(setResult, setIdx);
    });
    
    detailsContainer.innerHTML = detailsHTML;
    
    // 오디오 리스너 설정
    setTimeout(() => {
        responseResults.forEach((setResult, setIdx) => {
            setResult.answers.forEach((answer, qIdx) => {
                const audioId = `result-audio-${qIdx}`;
                setupResponseAudioListeners(audioId);
            });
        });
        console.log('✅ 응답고르기 오디오 리스너 설정 완료');
    }, 100);
    
    // 툴팁 이벤트 리스너 추가
    setTimeout(() => {
        const highlightedWords = document.querySelectorAll('.response-keyword-highlight');
        highlightedWords.forEach(word => {
            word.addEventListener('mouseenter', showResponseTooltip);
            word.addEventListener('mouseleave', hideResponseTooltip);
        });
        console.log(`✅ 툴팁 이벤트 리스너 추가 완료: ${highlightedWords.length}개`);
    }, 100);
    
    // 결과 데이터 정리 완료
}

// 세트별 결과 렌더링
function renderResponseSetResult(setResult, setIdx) {
    const setNum = setIdx + 1;
    const questionCount = setResult.answers ? setResult.answers.length : 0;
    
    let html = `
        <div class="response-set-header">
            <span class="response-set-badge">
                <i class="fas fa-headphones"></i>
                Response Set ${setNum}
            </span>
            <span class="response-set-meta">응답고르기 · ${questionCount}문제</span>
        </div>
        <div class="questions-section">
    `;
    
    // 각 문제 렌더링
    setResult.answers.forEach((answer, qIdx) => {
        html += renderResponseAnswer(answer, qIdx);
    });
    
    html += `
        </div>
    `;
    
    return html;
}

// 문제별 결과 렌더링
function renderResponseAnswer(answer, qIdx) {
    const isCorrect = answer.isCorrect;
    const correctIcon = isCorrect 
        ? '<i class="fas fa-check-circle" style="color: var(--success-color);"></i>' 
        : '<i class="fas fa-times-circle" style="color: var(--danger-color);"></i>';
    
    const audioId = `result-audio-${qIdx}`;
    
    let html = `
        <div class="response-result-item ${isCorrect ? 'correct' : 'incorrect'}">
            <div class="question-header">
                <span class="question-number">Question ${answer.questionNum}</span>
                <span class="result-status">${correctIcon}</span>
            </div>
            
            <!-- 오디오 섹션 -->
            <div class="audio-section">
                <div class="audio-title">
                    <i class="fas fa-volume-up"></i>
                    <span>오디오 다시 듣기</span>
                </div>
                <div class="audio-player-container">
                    <button class="audio-play-btn" onclick="toggleResponseAudio('${audioId}')">
                        <i class="fas fa-play" id="${audioId}-icon"></i>
                    </button>
                    <div class="audio-seek-container">
                        <div class="audio-seek-bar" id="${audioId}-seek" onclick="seekResponseAudio('${audioId}', event)">
                            <div class="audio-seek-progress" id="${audioId}-progress" style="width: 0%">
                                <div class="audio-seek-handle"></div>
                            </div>
                        </div>
                        <div class="audio-time">
                            <span id="${audioId}-current">0:00</span> / <span id="${audioId}-duration">0:00</span>
                        </div>
                    </div>
                    <audio id="${audioId}" src="${answer.audioUrl || ''}"></audio>
                </div>
                ${answer.script ? `
                <div class="audio-script">
                    <strong>Script:</strong> ${highlightResponseScript(answer.script, answer.scriptHighlights || [])}
                    ${answer.scriptTrans ? `<br><strong>해석:</strong> ${answer.scriptTrans}` : ''}
                </div>
                ` : ''}
            </div>
            
            <div class="answer-summary">
                <div class="response-answer-row">
                    <span class="response-answer-label">내 답변:</span>
                    <span class="response-answer-value ${isCorrect ? 'correct' : 'incorrect'}">
                        ${answer.userAnswer ? answer.options[answer.userAnswer - 1] : '미응답'}
                    </span>
                </div>
                ${!isCorrect ? `
                <div class="response-answer-row">
                    <span class="response-answer-label">정답:</span>
                    <span class="response-answer-value correct">
                        ${answer.options[answer.correctAnswer - 1]}
                    </span>
                </div>
                ` : ''}
            </div>
            
            ${renderResponseOptionsExplanation(answer)}
        </div>
    `;
    
    return html;
}

// 보기 상세 해설 렌더링
function renderResponseOptionsExplanation(answer) {
    const toggleId = `response-toggle-q${answer.questionNum}`;
    
    let html = `
        <div class="options-explanation-section">
            <button class="toggle-explanation-btn" onclick="toggleResponseOptions('${toggleId}')">
                <span class="toggle-text">보기 상세 해설 펼치기</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            
            <div id="${toggleId}" class="options-details" style="display: none;">
    `;
    
    answer.options.forEach((option, idx) => {
        const isCorrect = (idx + 1) === answer.correctAnswer;
        const translation = answer.optionTranslations && answer.optionTranslations[idx] ? answer.optionTranslations[idx] : '';
        const explanation = answer.optionExplanations && answer.optionExplanations[idx] ? answer.optionExplanations[idx] : '';
        
        const optionLabel = String.fromCharCode(65 + idx); // A, B, C, D
        html += `
            <div class="option-detail ${isCorrect ? 'correct' : 'incorrect'}">
                <div class="option-text"><span class="option-marker">${optionLabel}</span>${option}</div>
                ${translation ? `<div class="option-translation">${translation}</div>` : ''}
                ${explanation ? `
                <div class="option-explanation ${isCorrect ? 'correct' : 'incorrect'}">
                    <strong>${isCorrect ? '정답 이유:' : '오답 이유:'}</strong>${explanation}
                </div>
                ` : ''}
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    return html;
}

// Script에 툴팁 추가
function highlightResponseScript(scriptText, highlights) {
    if (!highlights || highlights.length === 0) {
        return escapeHtml_response(scriptText);
    }
    
    let highlightedText = escapeHtml_response(scriptText);
    
    highlights.forEach(highlight => {
        const word = highlight.word || '';
        const translation = highlight.translation || '';
        const explanation = highlight.explanation || '';
        
        if (!word) return;
        
        const regex = new RegExp(`\\b(${escapeRegex_response(word)})\\b`, 'gi');
        highlightedText = highlightedText.replace(regex, (match) => {
            return `<span class="response-keyword-highlight" data-translation="${escapeHtml_response(translation)}" data-explanation="${escapeHtml_response(explanation)}">${match}</span>`;
        });
    });
    
    return highlightedText;
}

// 정규식 특수문자 이스케이프
function escapeRegex_response(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// HTML 이스케이프 함수
function escapeHtml_response(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 툴팁 표시
function showResponseTooltip(event) {
    const word = event.target;
    const translation = word.getAttribute('data-translation');
    const explanation = word.getAttribute('data-explanation');
    
    const existingTooltip = document.querySelector('.response-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    
    const tooltip = document.createElement('div');
    tooltip.className = 'response-tooltip';
    tooltip.innerHTML = `
        <div class="tooltip-translation">${translation}</div>
        ${explanation ? `<div class="tooltip-explanation">${explanation}</div>` : ''}
    `;
    
    document.body.appendChild(tooltip);
    
    const rect = word.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
}

// 툴팁 숨기기
function hideResponseTooltip() {
    const tooltip = document.querySelector('.response-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

// 보기 해설 토글
function toggleResponseOptions(toggleId) {
    const content = document.getElementById(toggleId);
    const btn = content.previousElementSibling;
    const icon = btn.querySelector('i');
    const text = btn.querySelector('.toggle-text');
    
    if (content.style.display === 'none') {
        content.style.display = 'flex';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
        text.textContent = '보기 상세 해설 접기';
    } else {
        content.style.display = 'none';
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
        text.textContent = '보기 상세 해설 펼치기';
    }
}

// 응답고르기 오디오 컨트롤 함수들
function toggleResponseAudio(audioId) {
    const audio = document.getElementById(audioId);
    const icon = document.getElementById(audioId + '-icon');
    
    if (!audio) {
        console.error('❌ 오디오 요소를 찾을 수 없음:', audioId);
        return;
    }
    
    if (audio.paused) {
        document.querySelectorAll('audio').forEach(a => {
            if (a.id !== audioId && !a.paused) {
                a.pause();
            }
        });
        
        document.querySelectorAll('.audio-play-btn').forEach(btn => {
            const btnIcon = btn.querySelector('i');
            if (btnIcon) {
                btnIcon.classList.remove('fa-pause');
                btnIcon.classList.add('fa-play');
            }
        });
        
        audio.play();
        icon.classList.remove('fa-play');
        icon.classList.add('fa-pause');
    } else {
        audio.pause();
        icon.classList.remove('fa-pause');
        icon.classList.add('fa-play');
    }
}

// 시간 포맷 함수 (초 → 분:초)
function formatResponseTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 오디오 시크바 클릭 시 이동
function seekResponseAudio(audioId, event) {
    const audio = document.getElementById(audioId);
    const seekBar = document.getElementById(audioId + '-seek');
    
    if (!audio || !seekBar) return;
    
    const rect = seekBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    
    audio.currentTime = audio.duration * percentage;
}

// 오디오 이벤트 리스너 설정
const setupResponseAudioListeners = (() => {
    const setupFlags = {};
    
    return function(audioId) {
        const audio = document.getElementById(audioId);
        const progress = document.getElementById(audioId + '-progress');
        const currentTimeEl = document.getElementById(audioId + '-current');
        const durationEl = document.getElementById(audioId + '-duration');
        const icon = document.getElementById(audioId + '-icon');
        
        if (!audio) return;
        if (setupFlags[audioId]) return;
        
        audio.addEventListener('loadedmetadata', () => {
            if (durationEl) {
                durationEl.textContent = formatResponseTime(audio.duration);
            }
        });
        
        audio.addEventListener('canplay', () => {
            if (durationEl && audio.duration) {
                durationEl.textContent = formatResponseTime(audio.duration);
            }
        });
        
        audio.addEventListener('timeupdate', () => {
            if (currentTimeEl) {
                currentTimeEl.textContent = formatResponseTime(audio.currentTime);
            }
            if (progress && audio.duration) {
                const percentage = (audio.currentTime / audio.duration) * 100;
                progress.style.width = percentage + '%';
            }
        });
        
        audio.addEventListener('ended', () => {
            if (icon) {
                icon.classList.remove('fa-pause');
                icon.classList.add('fa-play');
            }
            if (progress) {
                progress.style.width = '0%';
            }
            if (currentTimeEl) {
                currentTimeEl.textContent = '0:00';
            }
        });
        
        setupFlags[audioId] = true;
    };
})();

console.log('✅ [Listening] response-result.js 로드 완료');
