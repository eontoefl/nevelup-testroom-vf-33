// ============================================
// Reading - Daily2 결과(해설) 화면
// ============================================

/**
 * 번역 수에 맞춰 원문을 문장 단위로 분리 (daily2 전용)
 */
function splitToMatchTranslations_d2(cleanContent, translationCount) {
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

// 결과 화면 표시
function showDaily2Results() {
    console.log('📊 [일상리딩2] 결과 화면 표시');
    
    const daily2ResultsStr = sessionStorage.getItem('daily2Results');
    if (!daily2ResultsStr) {
        console.error('❌ 결과 데이터가 없습니다');
        return;
    }
    
    const daily2Results = JSON.parse(daily2ResultsStr);
    
    let totalCorrect = 0;
    let totalQuestions = 0;
    
    daily2Results.forEach(setResult => {
        setResult.answers.forEach(answer => {
            totalQuestions++;
            if (answer.isCorrect) totalCorrect++;
        });
    });
    
    const totalIncorrect = totalQuestions - totalCorrect;
    const totalScore = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    
    document.getElementById('daily2ResultScoreValue').textContent = totalScore + '%';
    document.getElementById('daily2ResultCorrectCount').textContent = totalCorrect;
    document.getElementById('daily2ResultIncorrectCount').textContent = totalIncorrect;
    document.getElementById('daily2ResultTotalCount').textContent = totalQuestions;
    
    const currentTest = JSON.parse(sessionStorage.getItem('currentTest') || '{"week":"Week 1","day":"월"}');
    const dayTitle = `${currentTest.week || 'Week 1'}, ${currentTest.day || '월'}요일 - 일상리딩2`;
    document.getElementById('daily2ResultDayTitle').textContent = dayTitle;
    
    const detailsContainer = document.getElementById('daily2ResultDetails');
    let detailsHTML = '';
    
    daily2Results.forEach((setResult, setIdx) => {
        detailsHTML += renderDaily2SetResult(setResult, setIdx);
    });
    
    detailsContainer.innerHTML = detailsHTML;
    bindDaily2ToggleEvents();
    sessionStorage.removeItem('daily2Results');
}

// 세트별 결과 렌더링
function renderDaily2SetResult(setResult, setIdx) {
    let html = `
        <div class="result-set-section">
            <div class="result-set-header">
                <h3>Set ${setIdx + 1}: ${setResult.mainTitle}</h3>
            </div>
            
            <div class="passage-section">
                <h4 class="passage-title">${setResult.passage.title}</h4>
                <div class="passage-content-bilingual">
    `;
    
    const cleanContent = setResult.passage.content.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
    const translations = setResult.passage.translations || [];
    const sentences = splitToMatchTranslations_d2(cleanContent, translations.length);
    
    sentences.forEach((sentence, idx) => {
        const translation = translations[idx] || '';
        
        let highlightedSentence = sentence.trim().replace(/\n/g, '<br>');
        if (setResult.passage.interactiveWords) {
            setResult.passage.interactiveWords.forEach(wordObj => {
                const regex = new RegExp(`(?<![\w-])${wordObj.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\w-])`, 'gi');
                highlightedSentence = highlightedSentence.replace(regex, 
                    (match) => `<span class="interactive-word" data-word="${wordObj.word}" data-translation="${wordObj.translation}" data-explanation="${wordObj.explanation}">${match}</span>`
                );
            });
        }
        
        html += `
            <div class="sentence-pair">
                <div class="sentence-original">${highlightedSentence}</div>
                ${translation && translation.trim() ? `<div class="sentence-translation">${translation}</div>` : ''}
            </div>
        `;
    });
    
    html += `
                </div>
            </div>
            
            <div class="questions-section">
    `;
    
    setResult.answers.forEach((answer, qIdx) => {
        html += renderDaily2Answers(answer, qIdx);
    });
    
    html += `
            </div>
        </div>
    `;
    
    return html;
}

// 문제별 결과 렌더링
function renderDaily2Answers(answer, qIdx) {
    const isCorrect = answer.isCorrect;
    const correctIcon = isCorrect 
        ? '<i class="fas fa-check-circle" style="color: var(--success-color);"></i>' 
        : '<i class="fas fa-times-circle" style="color: var(--danger-color);"></i>';
    
    const toggleId = `daily2-toggle-${qIdx}`;
    
    let html = `
        <div class="daily2-result-item ${isCorrect ? 'correct' : 'incorrect'}">
            <div class="question-header">
                <span class="question-number">${answer.questionNum}</span>
                <span class="result-status">${correctIcon}</span>
            </div>
            
            <div class="question-text">${answer.question}</div>
            <div class="question-translation">${answer.questionTranslation}</div>
            
            <div class="answer-summary">
                <div class="daily2-answer-row">
                    <span class="daily2-answer-label">내 답변:</span>
                    <span class="daily2-answer-value ${isCorrect ? 'correct' : 'incorrect'}">
                        ${answer.userAnswer ? answer.options[answer.userAnswer - 1].label + ') ' + answer.options[answer.userAnswer - 1].text : '미응답'}
                    </span>
                </div>
                ${!isCorrect ? `
                <div class="daily2-answer-row">
                    <span class="daily2-answer-label">정답:</span>
                    <span class="daily2-answer-value correct">
                        ${answer.correctAnswer ? answer.options[answer.correctAnswer - 1].label + ') ' + answer.options[answer.correctAnswer - 1].text : ''}
                    </span>
                </div>
                ` : ''}
            </div>
            
            ${renderDaily2OptionsExplanation(answer, toggleId)}
        </div>
    `;
    
    return html;
}

// 보기 상세 해설 렌더링
function renderDaily2OptionsExplanation(answer, toggleId) {
    const userAnswerLabel = getLabelFromIndex(answer.userAnswer);
    const correctAnswerLabel = getLabelFromIndex(answer.correctAnswer);
    
    let html = `
        <div class="options-explanation-section">
            <button class="toggle-explanation-btn" onclick="toggleDaily2Options('${toggleId}')">
                <span class="toggle-text">보기 상세 해설 펼치기</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            
            <div id="${toggleId}" class="options-details" style="display: none;">
    `;
    
    answer.options.forEach((option, idx) => {
        const isCorrect = (idx + 1) === answer.correctAnswer;
        const isUserAnswer = option.label === userAnswerLabel;
        const isCorrectAnswer = option.label === correctAnswerLabel;
        
        let badge = '';
        if (isCorrectAnswer) {
            badge = '<span class="option-badge correct-badge">✓ 정답</span>';
        } else if (isUserAnswer) {
            badge = '<span class="option-badge incorrect-badge">✗ 내가 선택한 오답</span>';
        }
        
        html += `
            <div class="option-detail ${isCorrect ? 'correct' : 'incorrect'}">
                <div class="option-text">${option.label}) ${option.text} ${badge}</div>
                <div class="option-translation">${option.translation}</div>
                <div class="option-explanation ${isCorrect ? 'correct' : 'incorrect'}">
                    <strong>${isCorrect ? '정답 이유:' : '오답 이유:'}</strong>${option.explanation}
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    return html;
}

// 보기 해설 토글
function toggleDaily2Options(toggleId) {
    const content = document.getElementById(toggleId);
    const btn = content.previousElementSibling;
    const icon = btn.querySelector('i');
    const text = btn.querySelector('.toggle-text');
    
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

// 인터랙티브 단어 툴팁 이벤트 바인딩
function bindDaily2ToggleEvents() {
    const interactiveWords = document.querySelectorAll('.interactive-word');
    interactiveWords.forEach(word => {
        word.addEventListener('mouseenter', showDaily2Tooltip);
        word.addEventListener('mouseleave', hideDaily2Tooltip);
    });
}

// 툴팁 표시
function showDaily2Tooltip(event) {
    const word = event.target;
    const translation = word.getAttribute('data-translation');
    const explanation = word.getAttribute('data-explanation');
    
    const existingTooltip = document.querySelector('.daily2-tooltip');
    if (existingTooltip) existingTooltip.remove();
    
    const tooltip = document.createElement('div');
    tooltip.className = 'daily2-tooltip';
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
function hideDaily2Tooltip() {
    const tooltip = document.querySelector('.daily2-tooltip');
    if (tooltip) tooltip.remove();
}

// 전역 노출
window.showDaily2Results = showDaily2Results;
window.renderDaily2SetResult = renderDaily2SetResult;
window.renderDaily2Answers = renderDaily2Answers;
window.renderDaily2OptionsExplanation = renderDaily2OptionsExplanation;
window.toggleDaily2Options = toggleDaily2Options;
window.bindDaily2ToggleEvents = bindDaily2ToggleEvents;

console.log('✅ [Reading] daily2-result.js 로드 완료');
