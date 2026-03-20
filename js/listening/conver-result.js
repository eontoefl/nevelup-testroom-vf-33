// Listening - 컨버 결과/해설 화면

// 결과 화면 표시
// @param {Array} data - 세트별 결과 배열 (explain-viewer.js에서 전달)
function showConverResults(data) {
    console.log('📊 [컨버] 결과 화면 표시');
    
    if (!data) {
        console.error('❌ 결과 데이터가 없습니다');
        return;
    }
    
    const converResults = data;
    
    // 전체 정답/오답 계산
    let totalCorrect = 0;
    let totalQuestions = 0;
    
    converResults.forEach(setResult => {
        setResult.answers.forEach(answer => {
            totalQuestions++;
            if (answer.isCorrect) {
                totalCorrect++;
            }
        });
    });
    
    const totalIncorrect = totalQuestions - totalCorrect;
    const totalScore = Math.round((totalCorrect / totalQuestions) * 100);
    
    console.log('📊 총 문제:', totalQuestions);
    console.log('✅ 정답:', totalCorrect);
    console.log('❌ 오답:', totalIncorrect);
    console.log('💯 점수:', totalScore + '%');
    
    // 결과 UI 업데이트
    document.getElementById('converResultScoreValue').textContent = totalScore + '%';
    document.getElementById('converResultCorrectCount').textContent = totalCorrect;
    document.getElementById('converResultIncorrectCount').textContent = totalIncorrect;
    document.getElementById('converResultTotalCount').textContent = totalQuestions;
    
    // 세부 결과 렌더링
    const detailsContainer = document.getElementById('converResultDetails');
    let detailsHTML = '';
    
    converResults.forEach((setResult, setIdx) => {
        detailsHTML += renderConverSetResult(setResult, setIdx);
    });
    
    detailsContainer.innerHTML = detailsHTML;
    
    // 오디오 리스너 초기화 (DOM 렌더링 직후)
    console.log('🔧 오디오 리스너 초기화 시작...');
    initConverResultAudioListeners();
    console.log('✅ 오디오 리스너 초기화 완료');
    
    // 툴팁 이벤트 리스너 추가
    const highlightedWords = document.querySelectorAll('.conver-keyword');
    highlightedWords.forEach(word => {
        word.addEventListener('mouseenter', showConverTooltip);
        word.addEventListener('mouseleave', hideConverTooltip);
    });
    console.log(`✅ 툴팁 이벤트 리스너 추가 완료: ${highlightedWords.length}개`);
    
    // 초기화 후 결과 데이터 정리 완료
}

// 세트별 결과 렌더링
function renderConverSetResult(setResult, setIdx) {
    const audioId = `conver-main-audio-${setIdx}`;
    
    const setNumber = setIdx + 1;
    const questionCount = setResult.answers.length;
    const setMeta = setResult.setDescription || `대화 듣기 · ${questionCount}문제`;
    
    let html = `
        <div class="conver-set">
            <!-- 세트 헤더 -->
            <div class="conver-set-header">
                <span class="conver-set-badge">
                    <i class="fas fa-comments"></i>
                    Conversation Set ${setNumber}
                </span>
                <span class="conver-set-meta">${setMeta}</span>
            </div>
            
            <!-- 전체 대화 오디오 -->
            ${setResult.answers[0].audioUrl ? `
            <div class="conver-audio-section">
                <div class="conver-audio-title">
                    <i class="fas fa-volume-up"></i>
                    <span>전체 대화 다시 듣기</span>
                </div>
                <div class="conver-audio-player">
                    <button class="conver-play-btn" onclick="toggleConverAudio('${audioId}')">
                        <i class="fas fa-play" id="${audioId}-icon"></i>
                    </button>
                    <div class="conver-seek-container">
                        <div class="conver-seek-bar" id="${audioId}-seek" onclick="seekConverAudio('${audioId}', event)">
                            <div class="conver-seek-progress" id="${audioId}-progress" style="width: 0%">
                                <div class="conver-seek-handle"></div>
                            </div>
                        </div>
                        <div class="conver-audio-time">
                            <span id="${audioId}-current">0:00</span> <span id="${audioId}-duration">0:00</span>
                        </div>
                    </div>
                    <audio id="${audioId}" src="${setResult.answers[0].audioUrl || ''}"></audio>
                </div>
            </div>
            ` : ''}
            
            <!-- 전체 스크립트 -->
            ${setResult.answers[0].script ? `
            <div class="conver-script-section">
                <button class="conver-script-toggle" onclick="toggleConverScriptSection('conver-script-${setIdx}')">
                    <i class="fas fa-file-alt"></i>
                    <span class="toggle-text">전체 대화 스크립트 보기</span>
                    <i class="fas fa-chevron-down" id="conver-script-${setIdx}-icon"></i>
                </button>
                <div id="conver-script-${setIdx}" class="conver-script-body" style="display: none;">
                    ${renderConverScript(setResult.answers[0].script, setResult.answers[0].scriptTrans, setResult.answers[0].scriptHighlights || [])}
                </div>
            </div>
            ` : ''}
            
            <!-- 구분선: 문제 영역 -->
            <div class="conver-questions-divider">
                <span>문제 해설</span>
            </div>
    `;
    
    // 각 문제 렌더링
    setResult.answers.forEach((answer, qIdx) => {
        html += renderConverAnswer(answer, qIdx, setIdx);
    });
    
    // 대화 요약
    if (setResult.summaryText) {
        html += `
            <div class="conver-summary-section">
                <div class="conver-summary-title">
                    <i class="fas fa-lightbulb"></i>
                    <span>대화 핵심 포인트</span>
                </div>
                <div class="conver-summary-text">${setResult.summaryText}</div>
                ${setResult.keyPoints ? `
                <div class="conver-key-points">
                    ${setResult.keyPoints.map(point => `<div class="conver-key-point">${point}</div>`).join('')}
                </div>
                ` : ''}
            </div>
        `;
    }
    
    html += `
        </div>
    `;
    
    return html;
}

// 스크립트 렌더링 (화자별)
function renderConverScript(script, scriptTrans, scriptHighlights = []) {
    if (!script) return '';
    
    const speakerPattern = /(Man:|Woman:)/g;
    const scriptParts = script.split(speakerPattern).filter(part => part.trim());
    const transParts = scriptTrans ? scriptTrans.split(/(남자:|여자:)/g).filter(part => part.trim()) : [];
    
    let html = '';
    let transIndex = 0;
    
    for (let i = 0; i < scriptParts.length; i += 2) {
        if (i + 1 >= scriptParts.length) break;
        
        const speaker = scriptParts[i].trim();
        const text = scriptParts[i + 1].trim();
        
        let translation = '';
        const koreanSpeaker = speaker === 'Man:' ? '남자:' : '여자:';
        
        for (let j = transIndex; j < transParts.length; j += 2) {
            if (transParts[j] === koreanSpeaker && j + 1 < transParts.length) {
                translation = transParts[j + 1].trim();
                transIndex = j + 2;
                break;
            }
        }
        
        const speakerName = speaker.replace(':', '').trim();
        const speakerBClass = speaker === 'Woman:' ? ' speaker-b' : '';
        
        html += `
            <div class="script-line">
                <span class="script-speaker${speakerBClass}">${speakerName}</span>
                <div class="script-text">
                    ${highlightConverScript(text, scriptHighlights)}
                    ${translation ? `<span class="translation">${translation}</span>` : ''}
                </div>
            </div>
        `;
    }
    
    return html;
}

// 스크립트 하이라이트
function highlightConverScript(scriptText, highlights) {
    if (!highlights || highlights.length === 0) {
        return escapeHtml_listening(scriptText);
    }
    
    let highlightedText = escapeHtml_listening(scriptText);
    
    highlights.forEach(highlight => {
        const word = highlight.word || '';
        const translation = highlight.translation || '';
        const explanation = highlight.explanation || '';
        
        if (!word) return;
        
        const regex = new RegExp(`\\b(${escapeRegex_listening(word)})\\b`, 'gi');
        highlightedText = highlightedText.replace(regex, (match) => {
            return `<span class="conver-keyword" data-translation="${escapeHtml_listening(translation)}" data-explanation="${escapeHtml_listening(explanation)}">${match}</span>`;
        });
    });
    
    return highlightedText;
}



// 툴팁 표시
function showConverTooltip(event) {
    const word = event.target;
    const translation = word.getAttribute('data-translation');
    const explanation = word.getAttribute('data-explanation');
    
    const existingTooltip = document.querySelector('.conver-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    
    const tooltip = document.createElement('div');
    tooltip.className = 'conver-tooltip';
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
function hideConverTooltip() {
    const tooltip = document.querySelector('.conver-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

// 문제별 결과 렌더링
function renderConverAnswer(answer, qIdx, setIdx) {
    const isCorrect = answer.isCorrect;
    const correctIcon = isCorrect 
        ? '<i class="fas fa-check-circle" style="color: var(--success-color);"></i>' 
        : '<i class="fas fa-times-circle" style="color: var(--danger-color);"></i>';
    
    let html = `
        <div class="conver-question">
            <div class="conver-question-header">
                <span class="conver-q-number">Question ${answer.questionNum}</span>
                <span class="conver-q-status">${correctIcon}</span>
            </div>
            <div class="conver-q-text">${answer.questionText}</div>
            ${answer.questionTrans ? `<div class="conver-q-translation">${answer.questionTrans}</div>` : ''}
            
            <div class="conver-answer-summary">
                <div class="conver-answer-row">
                    <span class="conver-answer-label">내 답변:</span>
                    <span class="conver-answer-value ${isCorrect ? 'correct' : 'incorrect'}">
                        ${answer.userAnswer ? `${answer.options[answer.userAnswer - 1]}` : '미응답'}
                    </span>
                </div>
                <div class="conver-answer-row">
                    <span class="conver-answer-label">정답:</span>
                    <span class="conver-answer-value correct">
                        ${answer.options[answer.correctAnswer - 1]}
                    </span>
                </div>
            </div>
            
            ${renderConverOptionsExplanation(answer, qIdx, setIdx)}
        </div>
    `;
    
    return html;
}

// 보기 해설 렌더링
function renderConverOptionsExplanation(answer, qIdx, setIdx) {
    if (!answer.optionExplanations || answer.optionExplanations.length === 0) {
        return '';
    }
    
    const hasExplanations = answer.optionExplanations.some(exp => exp && exp.trim());
    if (!hasExplanations) {
        return '';
    }
    
    const toggleId = `conver-toggle-q${setIdx}-${qIdx}`;
    
    let html = `
            <button class="conver-toggle-btn" onclick="toggleConverExplanation('${toggleId}')">
                <span class="toggle-text">보기 상세 해설 펼치기</span>
                <i class="fas fa-chevron-down" id="${toggleId}-icon"></i>
            </button>
            <div id="${toggleId}" class="conver-options-details" style="display: none;">
    `;
    
    answer.options.forEach((option, idx) => {
        const optionLetter = String.fromCharCode(65 + idx);
        const isCorrectOption = (idx + 1) === answer.correctAnswer;
        const translation = answer.optionTranslations && answer.optionTranslations[idx] ? answer.optionTranslations[idx] : '';
        const explanation = answer.optionExplanations && answer.optionExplanations[idx] ? answer.optionExplanations[idx] : '';
        
        html += `
            <div class="conver-option ${isCorrectOption ? 'correct' : ''}">
                <div class="conver-option-text"><span class="conver-option-marker">${optionLetter}</span>${option}</div>
                ${translation ? `<div class="conver-option-translation">${translation}</div>` : ''}
                ${explanation ? `
                <div class="conver-option-explanation ${isCorrectOption ? 'correct' : 'incorrect'}">
                    <strong>${isCorrectOption ? '정답 이유:' : '오답 이유:'}</strong> ${explanation}
                </div>
                ` : ''}
            </div>
        `;
    });
    
    html += `
            </div>
    `;
    
    return html;
}

// 스크립트 토글
function toggleConverScriptSection(scriptId) {
    const content = document.getElementById(scriptId);
    const icon = document.getElementById(scriptId + '-icon');
    const btn = content.previousElementSibling;
    const text = btn.querySelector('.toggle-text');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
        text.textContent = '전체 대화 스크립트 접기';
    } else {
        content.style.display = 'none';
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
        text.textContent = '전체 대화 스크립트 보기';
    }
}

// 해설 토글
function toggleConverExplanation(toggleId) {
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

// 오디오 재생/정지
function toggleConverAudio(audioId) {
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

// 시간 포맷
function formatConverTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 오디오 시크바
function seekConverAudio(audioId, event) {
    const audio = document.getElementById(audioId);
    const seekBar = document.getElementById(audioId + '-seek');
    
    if (!audio || !seekBar) return;
    
    const rect = seekBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    
    audio.currentTime = audio.duration * percentage;
}

// 오디오 리스너 설정
const setupConverAudioListeners = (() => {
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
                durationEl.textContent = formatConverTime(audio.duration);
            }
        });
        
        audio.addEventListener('canplay', () => {
            if (durationEl && audio.duration) {
                durationEl.textContent = formatConverTime(audio.duration);
            }
        });
        
        audio.addEventListener('timeupdate', () => {
            if (currentTimeEl) {
                currentTimeEl.textContent = formatConverTime(audio.currentTime);
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

// 모든 오디오 리스너 초기화
function initConverResultAudioListeners() {
    document.querySelectorAll('audio[id^="conver-main-audio-"]').forEach(audio => {
        setupConverAudioListeners(audio.id);
    });
}

console.log('✅ [Listening] conver-result.js 로드 완료');
