// ============================================
// Reading - Daily1 결과(해설) 화면
// ============================================

/**
 * 번역 수에 맞춰 원문을 문장 단위로 분리하는 공통 함수
 */
function splitToMatchTranslations(cleanContent, translationCount) {
    if (cleanContent.includes('##') || cleanContent.includes('#|#')) {
        return cleanContent.replace(/#\|\|#/g, '##').replace(/#\|#/g, '##').split('##');
    }
    
    if (translationCount <= 0) {
        return cleanContent.split(/\n\n+/).filter(s => s.trim());
    }
    
    const paragraphs = cleanContent.split(/\n\n+/).filter(s => s.trim());
    if (paragraphs.length === translationCount) return paragraphs;
    
    const allText = cleanContent.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const sentenceSplit = allText.split(/(?<=[.!?])(?<!\w\.\w)(?<![A-Z])(?:\s*\([A-Z]\))?\s+(?=[A-Z\("])/).filter(s => s.trim());
    if (sentenceSplit.length === translationCount) return sentenceSplit;
    
    const simpleSplit = allText.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.trim());
    if (simpleSplit.length === translationCount) return simpleSplit;
    
    const diffs = [
        { s: paragraphs, d: Math.abs(paragraphs.length - translationCount) },
        { s: sentenceSplit, d: Math.abs(sentenceSplit.length - translationCount) },
        { s: simpleSplit, d: Math.abs(simpleSplit.length - translationCount) }
    ];
    diffs.sort((a, b) => a.d - b.d);
    return diffs[0].s;
}

// 정답채점 화면 표시
function showDaily1Results() {
    const results = JSON.parse(sessionStorage.getItem('daily1Results'));
    
    let totalCorrect = 0;
    let totalQuestions = 0;
    
    results.forEach(setResult => {
        setResult.answers.forEach(answer => {
            totalQuestions++;
            if (answer.isCorrect) totalCorrect++;
        });
    });
    
    const totalScore = Math.round((totalCorrect / totalQuestions) * 100);
    const totalIncorrect = totalQuestions - totalCorrect;
    
    document.getElementById('daily1ResultScoreValue').textContent = `${totalScore}%`;
    document.getElementById('daily1ResultCorrectCount').textContent = totalCorrect;
    document.getElementById('daily1ResultIncorrectCount').textContent = totalIncorrect;
    document.getElementById('daily1ResultTotalCount').textContent = totalQuestions;
    
    const week = currentTest.currentWeek || 1;
    const day = currentTest.currentDay || '월';
    document.getElementById('daily1ResultDayTitle').textContent = `Week ${week} - ${getDayName(day)}`;
    
    const detailsContainer = document.getElementById('daily1ResultDetails');
    let detailsHTML = '';
    
    results.forEach((setResult, setIndex) => {
        detailsHTML += renderDaily1SetResult(setResult, setIndex);
    });
    
    detailsContainer.innerHTML = detailsHTML;
    bindDaily1ToggleEvents();
    showScreen('daily1ExplainScreen');
    saveResultJsonToSupabase('reading', results);
    sessionStorage.removeItem('daily1Results');
}

// 세트별 결과 렌더링
function renderDaily1SetResult(setResult, setIndex) {
    const passage = setResult.passage;
    const translations = passage.translations || [];
    const interactiveWords = passage.interactiveWords || [];
    
    const cleanContent = passage.content
        .replace(/\\n/g, '\n')
        .replace(/\r\n/g, '\n');
    
    const sentences = splitToMatchTranslations(cleanContent, translations.length);
    
    let sentencesHTML = '';
    sentences.forEach((sentence, idx) => {
        const translation = translations[idx] || '';
        
        let sentenceHTML = escapeHtml(sentence).replace(/\n/g, '<br>');
        interactiveWords.forEach(wordData => {
            const regex = new RegExp(`(?<![\\w-])${wordData.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'gi');
            sentenceHTML = sentenceHTML.replace(regex, (match) => `<span class="interactive-word" data-translation="${escapeHtml(wordData.translation)}" data-explanation="${escapeHtml(wordData.explanation)}">${match}</span>`);
        });
        
        sentencesHTML += `
            <div class="sentence-pair">
                <div class="sentence-original">${sentenceHTML}</div>
                ${translation && translation.trim() ? `<div class="sentence-translation">${escapeHtml(translation)}</div>` : ''}
            </div>
        `;
    });
    
    return `
        <div class="result-set-section">
            <h3 class="result-section-title">
                <i class="fas fa-book-open"></i> Set ${setIndex + 1}: ${escapeHtml(setResult.mainTitle)}
            </h3>
            
            <div class="daily1-passage-panel-result">
                <h4 class="result-passage-title">${escapeHtml(passage.title)}</h4>
                <div class="sentence-translations">
                    ${sentencesHTML}
                </div>
            </div>
            
            ${renderDaily1Answers(setResult)}
        </div>
    `;
}

// 문제별 답안 렌더링
function renderDaily1Answers(setResult) {
    let html = '';
    
    setResult.answers.forEach((answer, answerIndex) => {
        const resultClass = answer.isCorrect ? 'correct' : 'incorrect';
        const icon = answer.isCorrect ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>';
        const userAnswerIndex = answer.userAnswer;
        const correctAnswerIndex = answer.correctAnswer;
        
        let userAnswerOption = null;
        let correctAnswerOption = null;
        
        if (Array.isArray(answer.options) && answer.options.length > 0 && answer.options[0].label) {
            userAnswerOption = answer.options.find(opt => opt.label === getLabelFromIndex(userAnswerIndex));
            correctAnswerOption = answer.options.find(opt => opt.label === getLabelFromIndex(correctAnswerIndex));
        } else {
            userAnswerOption = { label: getLabelFromIndex(userAnswerIndex), text: answer.options[userAnswerIndex - 1] || '미응답', translation: '', explanation: '' };
            correctAnswerOption = { label: getLabelFromIndex(correctAnswerIndex), text: answer.options[correctAnswerIndex - 1] || '', translation: '', explanation: '' };
        }
        
        const userAnswerText = userAnswerOption ? `${userAnswerOption.label}) ${userAnswerOption.text}` : '미응답';
        const correctAnswerText = correctAnswerOption ? `${correctAnswerOption.label}) ${correctAnswerOption.text}` : '';
        
        html += `
            <div class="daily1-result-item ${resultClass}">
                <div class="daily1-result-icon">${icon}</div>
                <div class="daily1-result-content">
                    <div class="daily1-question-text">
                        <strong>${answer.questionNum}.</strong> ${escapeHtml(answer.question)}
                    </div>
                    ${answer.questionTranslation ? `
                    <div class="question-translation">
                        <i class="fas fa-comment-dots"></i> 문제 해석: ${escapeHtml(answer.questionTranslation)}
                    </div>
                    ` : ''}
                    
                    <div class="daily1-answer-row">
                        <span class="daily1-answer-label">${answer.isCorrect ? '✓ 내 답변:' : '✗ 내 답변:'}</span>
                        <span class="daily1-answer-value ${resultClass}">${escapeHtml(userAnswerText)}</span>
                    </div>
                    ${!answer.isCorrect ? `
                    <div class="daily1-answer-row">
                        <span class="daily1-answer-label">✓ 정답:</span>
                        <span class="daily1-answer-value correct">${escapeHtml(correctAnswerText)}</span>
                    </div>
                    ` : ''}
                    
                    ${renderDaily1OptionsExplanation(answer, setResult.setId, answerIndex)}
                </div>
            </div>
        `;
    });
    
    return html;
}

// 보기 상세 해설 렌더링
function renderDaily1OptionsExplanation(answer, setId, answerIndex) {
    if (!answer.options || answer.options.length === 0 || !answer.options[0].label) {
        return '';
    }
    
    const toggleId = `daily1-options-${setId}-${answerIndex}`;
    const userAnswerLabel = getLabelFromIndex(answer.userAnswer);
    const correctAnswerLabel = getLabelFromIndex(answer.correctAnswer);
    
    let optionsHTML = answer.options.map(option => {
        const isUserAnswer = option.label === userAnswerLabel;
        const isCorrectAnswer = option.label === correctAnswerLabel;
        
        let badge = '';
        if (isCorrectAnswer) {
            badge = '<span class="option-badge correct-badge">✓ 정답</span>';
        } else if (isUserAnswer) {
            badge = '<span class="option-badge incorrect-badge">✗ 내가 선택한 오답</span>';
        }
        
        const explanationClass = isCorrectAnswer ? 'correct' : 'incorrect';
        const explanationIcon = isCorrectAnswer ? '💡' : '⚠️';
        const explanationLabel = isCorrectAnswer ? '정답 이유:' : '오답 이유:';
        
        return `
            <div class="option-item">
                <div class="option-header">
                    <span class="option-label">${option.label})</span>
                    <span class="option-text">${escapeHtml(option.text)}</span>
                    ${badge}
                </div>
                ${option.translation ? `
                <div class="option-translation">
                    └─ ${escapeHtml(option.translation)}
                </div>
                ` : ''}
                ${option.explanation ? `
                <div class="option-explanation ${explanationClass}">
                    <strong>${explanationIcon} ${explanationLabel}</strong><br>
                    ${escapeHtml(option.explanation)}
                </div>
                ` : ''}
            </div>
        `;
    }).join('');
    
    return `
        <div class="options-explanation-container">
            <button class="btn-toggle-options" onclick="toggleDaily1Options('${toggleId}')">
                <span class="toggle-text">보기 상세 해설 펼치기</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div id="${toggleId}" class="options-explanation-content" style="display: none;">
                ${optionsHTML}
            </div>
        </div>
    `;
}

// 탭 전환
function switchDaily1Tab(setIndex, tabType) {
    const originalPane = document.getElementById(`daily1-original-${setIndex}`);
    const translationPane = document.getElementById(`daily1-translation-${setIndex}`);
    const tabs = document.querySelectorAll(`#daily1ResultDetails .result-set-section:nth-child(${setIndex + 1}) .passage-tab`);
    
    if (tabType === 'original') {
        originalPane.style.display = 'block';
        translationPane.style.display = 'none';
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
    } else {
        originalPane.style.display = 'none';
        translationPane.style.display = 'block';
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
    }
}

// 보기 해설 펼치기/접기
function toggleDaily1Options(toggleId) {
    const content = document.getElementById(toggleId);
    const button = content.previousElementSibling;
    const icon = button.querySelector('i');
    const text = button.querySelector('.toggle-text');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
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

// 이벤트 바인딩
function bindDaily1ToggleEvents() {
    const interactiveWords = document.querySelectorAll('.interactive-word');
    interactiveWords.forEach(word => {
        word.addEventListener('mouseenter', showDaily1Tooltip);
        word.addEventListener('mouseleave', hideDaily1Tooltip);
    });
}

// 툴팁 표시
function showDaily1Tooltip(event) {
    const word = event.target;
    const translation = word.getAttribute('data-translation');
    const explanation = word.getAttribute('data-explanation');
    
    const existingTooltip = document.querySelector('.daily1-tooltip');
    if (existingTooltip) existingTooltip.remove();
    
    const tooltip = document.createElement('div');
    tooltip.className = 'daily1-tooltip';
    tooltip.innerHTML = `
        <div class="tooltip-translation">${escapeHtml(translation)}</div>
        ${explanation ? `<div class="tooltip-explanation">${escapeHtml(explanation)}</div>` : ''}
    `;
    
    document.body.appendChild(tooltip);
    
    const rect = word.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
}

// 툴팁 숨기기
function hideDaily1Tooltip() {
    const tooltip = document.querySelector('.daily1-tooltip');
    if (tooltip) tooltip.remove();
}

// 전역 노출
window.showDaily1Results = showDaily1Results;
window.renderDaily1SetResult = renderDaily1SetResult;
window.renderDaily1Answers = renderDaily1Answers;
window.renderDaily1OptionsExplanation = renderDaily1OptionsExplanation;
window.switchDaily1Tab = switchDaily1Tab;
window.toggleDaily1Options = toggleDaily1Options;
window.bindDaily1ToggleEvents = bindDaily1ToggleEvents;

console.log('✅ [Reading] daily1-result.js 로드 완료');
