// ============================================
// Reading - Academic 결과(해설) 화면
// ============================================

/**
 * 번역 수에 맞춰 원문을 문장 단위로 분리 (academic 전용)
 */
function splitToMatchTranslations_ac(cleanContent, translationCount) {
    if (translationCount <= 0) {
        return cleanContent.split(/\n\n+/).filter(s => s.trim());
    }
    
    if (cleanContent.includes('#|#') || cleanContent.includes('##')) {
        let raw = cleanContent.replace(/<<([^>]+)>>/g, '$1');
        const sentences = raw.split(/(?:##|#\|\|#|#\|#)/).map(s => s.trim()).filter(s => s);
        if (sentences.length === translationCount) return sentences;
    }
    
    const paragraphs = cleanContent.split(/\n\n+/).filter(s => s.trim());
    if (paragraphs.length === translationCount) return paragraphs;
    
    const allText = cleanContent.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    const rawSplit = allText.split(/(?<=[.!?](?:\s*\([A-Z]\))?)\s+(?=[A-Z\("])/).filter(s => s.trim());
    const merged = [];
    rawSplit.forEach(s => {
        if (/^\([A-Z]\)$/.test(s.trim()) && merged.length > 0) {
            merged[merged.length - 1] += ' ' + s.trim();
        } else {
            merged.push(s);
        }
    });
    if (merged.length === translationCount) return merged;
    
    const simpleSplit = allText.split(/(?<=[.!?])\s+(?=[A-Z\("])/).filter(s => s.trim());
    const merged2 = [];
    simpleSplit.forEach(s => {
        if (/^\([A-Z]\)$/.test(s.trim()) && merged2.length > 0) {
            merged2[merged2.length - 1] += ' ' + s.trim();
        } else {
            merged2.push(s);
        }
    });
    if (merged2.length === translationCount) return merged2;
    
    const diffs = [
        { s: paragraphs, d: Math.abs(paragraphs.length - translationCount) },
        { s: merged, d: Math.abs(merged.length - translationCount) },
        { s: merged2, d: Math.abs(merged2.length - translationCount) }
    ];
    diffs.sort((a, b) => a.d - b.d);
    return diffs[0].s;
}

// 결과 화면 표시
// @param {Array} data - 세트별 결과 배열 (explain-viewer.js에서 전달)
function showAcademicResults(data) {
    console.log('📊 [아카데믹리딩] 결과 화면 표시');
    
    if (!data) {
        console.error('❌ 결과 데이터가 없습니다');
        return;
    }
    
    const academicResults = data;
    
    let totalCorrect = 0;
    let totalQuestions = 0;
    
    academicResults.forEach(setResult => {
        setResult.answers.forEach(answer => {
            totalQuestions++;
            if (answer.isCorrect) totalCorrect++;
        });
    });
    
    const totalIncorrect = totalQuestions - totalCorrect;
    const totalScore = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    
    document.getElementById('academicResultScoreValue').textContent = totalScore + '%';
    document.getElementById('academicResultCorrectCount').textContent = totalCorrect;
    document.getElementById('academicResultIncorrectCount').textContent = totalIncorrect;
    document.getElementById('academicResultTotalCount').textContent = totalQuestions;
    
    const week = window.currentTest ? window.currentTest.currentWeek : 1;
    const day = window.currentTest ? window.currentTest.currentDay : '월';
    const dayTitle = `Week ${week}, ${day}요일 - 아카데믹리딩`;
    document.getElementById('academicResultDayTitle').textContent = dayTitle;
    
    const detailsContainer = document.getElementById('academicResultDetails');
    let detailsHTML = '';
    
    academicResults.forEach((setResult, setIdx) => {
        detailsHTML += renderAcademicSetResult(setResult, setIdx);
    });
    
    detailsContainer.innerHTML = detailsHTML;
    bindAcademicToggleEvents();
}

// 세트별 결과 렌더링
function renderAcademicSetResult(setResult, setIdx) {
    let html = `
        <div class="result-set-section">
            <div class="result-set-header">
                <h3>Set ${setIdx + 1}: ${setResult.mainTitle}</h3>
            </div>
            
            <div class="passage-section">
                <h4 class="passage-title">${setResult.passage.title}</h4>
                <div class="passage-content-bilingual">
    `;
    
    const rawContent = setResult.passage.contentRaw || setResult.passage.content;
    const cleanContent = rawContent.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
    const translations = setResult.passage.translations || [];
    const sentences = splitToMatchTranslations_ac(cleanContent, translations.length);
    
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
        html += renderAcademicAnswers(answer, qIdx);
    });
    
    html += `
            </div>
        </div>
    `;
    
    return html;
}

// 문제별 결과 렌더링
function renderAcademicAnswers(answer, qIdx) {
    const isCorrect = answer.isCorrect;
    const correctIcon = isCorrect 
        ? '<i class="fas fa-check-circle" style="color: var(--success-color);"></i>' 
        : '<i class="fas fa-times-circle" style="color: var(--danger-color);"></i>';
    
    const questionNum = answer.questionNum || `Q${qIdx + 1}`;
    const toggleId = `academic-toggle-${qIdx}`;
    
    // userAnswer를 숫자로 변환
    let userAnswerIndex = answer.userAnswer;
    if (typeof userAnswerIndex === 'string') {
        const label = userAnswerIndex.toUpperCase();
        userAnswerIndex = label.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
    }
    
    let html = `
        <div class="academic-result-item ${isCorrect ? 'correct' : 'incorrect'}">
            <div class="question-header">
                <span class="question-number">${questionNum}</span>
                <span class="result-status">${correctIcon}</span>
            </div>
            
            <div class="question-text">${answer.question}</div>
            <div class="question-translation">${answer.questionTranslation}</div>
            
            <div class="answer-summary">
                <div class="academic-answer-row">
                    <span class="academic-answer-label">내 답변:</span>
                    <span class="academic-answer-value ${isCorrect ? 'correct' : 'incorrect'}">
                        ${userAnswerIndex && answer.options && answer.options[userAnswerIndex - 1] 
                            ? answer.options[userAnswerIndex - 1].label + ') ' + answer.options[userAnswerIndex - 1].text 
                            : '미응답'}
                    </span>
                </div>
                ${!isCorrect ? `
                <div class="academic-answer-row">
                    <span class="academic-answer-label">정답:</span>
                    <span class="academic-answer-value correct">
                        ${answer.options && answer.options[answer.correctAnswer - 1] 
                            ? answer.options[answer.correctAnswer - 1].label + ') ' + answer.options[answer.correctAnswer - 1].text
                            : '정답 없음'}
                    </span>
                </div>
                ` : ''}
            </div>
            
            ${renderAcademicOptionsExplanation(answer, toggleId)}
        </div>
    `;
    
    return html;
}

// 보기 상세 해설 렌더링
function renderAcademicOptionsExplanation(answer, toggleId) {
    let userAnswerIndex = answer.userAnswer;
    if (typeof userAnswerIndex === 'string') {
        const label = userAnswerIndex.toUpperCase();
        userAnswerIndex = label.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
    }
    
    const userAnswerLabel = getLabelFromIndex(userAnswerIndex);
    const correctAnswerLabel = getLabelFromIndex(answer.correctAnswer);
    
    let html = `
        <div class="options-explanation-section">
            <button class="toggle-explanation-btn" onclick="toggleAcademicOptions('${toggleId}')">
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
function toggleAcademicOptions(toggleId) {
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
function bindAcademicToggleEvents() {
    const interactiveWords = document.querySelectorAll('.interactive-word');
    interactiveWords.forEach(word => {
        word.addEventListener('mouseenter', showAcademicTooltip);
        word.addEventListener('mouseleave', hideAcademicTooltip);
    });
}

// 툴팁 표시
function showAcademicTooltip(event) {
    const word = event.target;
    const translation = word.getAttribute('data-translation');
    const explanation = word.getAttribute('data-explanation');
    
    const existingTooltip = document.querySelector('.academic-tooltip');
    if (existingTooltip) existingTooltip.remove();
    
    const tooltip = document.createElement('div');
    tooltip.className = 'academic-tooltip';
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
function hideAcademicTooltip() {
    const tooltip = document.querySelector('.academic-tooltip');
    if (tooltip) tooltip.remove();
}

// 전역 노출
window.showAcademicResults = showAcademicResults;
window.renderAcademicSetResult = renderAcademicSetResult;
window.renderAcademicAnswers = renderAcademicAnswers;
window.renderAcademicOptionsExplanation = renderAcademicOptionsExplanation;
window.toggleAcademicOptions = toggleAcademicOptions;
window.bindAcademicToggleEvents = bindAcademicToggleEvents;

console.log('✅ [Reading] academic-result.js 로드 완료');
