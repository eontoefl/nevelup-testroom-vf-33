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
    const rawContent = setResult.passage.contentRaw || setResult.passage.content;
    const cleanContent = rawContent.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
    const translations = setResult.passage.translations || [];
    const sentences = splitToMatchTranslations_ac(cleanContent, translations.length);
    
    let sentencesHTML = '';
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
        
        sentencesHTML += `
            <div class="sentence-pair">
                <div class="sentence-original">${highlightedSentence}</div>
                ${translation && translation.trim() ? `<div class="sentence-translation">${translation}</div>` : ''}
            </div>
        `;
    });
    
    let answersHTML = '';
    setResult.answers.forEach((answer, qIdx) => {
        answersHTML += renderAcademicAnswers(answer, qIdx, setResult.setId || setIdx);
    });
    
    return `
        <div class="result-set-section">
            <h3 class="result-section-title">
                <i class="fas fa-book-open"></i> Set ${setIdx + 1}: ${setResult.mainTitle}
            </h3>
            
            <div class="rd-passage-panel">
                <h4 class="result-passage-title">${setResult.passage.title}</h4>
                <div class="sentence-translations">
                    ${sentencesHTML}
                </div>
            </div>
            
            ${answersHTML}
        </div>
    `;
}

// 문제별 결과 렌더링
function renderAcademicAnswers(answer, qIdx, setId) {
    const isCorrect = answer.isCorrect;
    const correctIcon = isCorrect 
        ? '<i class="fas fa-check-circle"></i>' 
        : '<i class="fas fa-times-circle"></i>';
    
    const questionNum = answer.questionNum || `Q${qIdx + 1}`;
    const toggleId = `rd-toggle-${setId}-${qIdx}`;
    
    // userAnswer를 숫자로 변환
    let userAnswerIndex = answer.userAnswer;
    if (typeof userAnswerIndex === 'string') {
        const label = userAnswerIndex.toUpperCase();
        userAnswerIndex = label.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
    }
    
    const userAnswerText = userAnswerIndex && answer.options && answer.options[userAnswerIndex - 1]
        ? answer.options[userAnswerIndex - 1].label + ') ' + answer.options[userAnswerIndex - 1].text
        : '미응답';
    
    const correctAnswerText = answer.options && answer.options[answer.correctAnswer - 1]
        ? answer.options[answer.correctAnswer - 1].label + ') ' + answer.options[answer.correctAnswer - 1].text
        : '정답 없음';
    
    return `
        <div class="rd-result-item ${isCorrect ? 'correct' : 'incorrect'}">
            <div class="rd-result-icon">${correctIcon}</div>
            <div class="rd-result-content">
                <div class="rd-question-text">
                    <strong>${questionNum}.</strong> ${answer.question}
                </div>
                ${answer.questionTranslation ? `
                <div class="question-translation">
                    <i class="fas fa-comment-dots"></i> 문제 해석: ${answer.questionTranslation}
                </div>
                ` : ''}
                <div class="rd-answer-row">
                    <span class="rd-answer-label">${isCorrect ? '✓' : '✗'} 내 답변:</span>
                    <span class="rd-answer-value ${isCorrect ? 'correct' : 'incorrect'}">${userAnswerText}</span>
                </div>
                ${!isCorrect ? `
                <div class="rd-answer-row">
                    <span class="rd-answer-label">✓ 정답:</span>
                    <span class="rd-answer-value correct">${correctAnswerText}</span>
                </div>
                ` : ''}
                ${renderAcademicOptionsExplanation(answer, toggleId, userAnswerIndex)}
            </div>
        </div>
    `;
}

// 보기 상세 해설 렌더링
function renderAcademicOptionsExplanation(answer, toggleId, userAnswerIndex) {
    if (!answer.options || answer.options.length === 0 || !answer.options[0].label) {
        return '';
    }
    
    const userAnswerLabel = getLabelFromIndex(userAnswerIndex);
    const correctAnswerLabel = getLabelFromIndex(answer.correctAnswer);
    
    let optionsHTML = '';
    answer.options.forEach((option) => {
        const isCorrectOption = option.label === correctAnswerLabel;
        const isUserAnswer = option.label === userAnswerLabel;
        
        let badge = '';
        if (isCorrectOption) {
            badge = '<span class="option-badge correct-badge">✓ 정답</span>';
        } else if (isUserAnswer) {
            badge = '<span class="option-badge incorrect-badge">✗ 내가 선택한 오답</span>';
        }
        
        optionsHTML += `
            <div class="option-item">
                <div class="option-header">
                    <span class="option-label">${option.label})</span>
                    <span class="option-text">${option.text}</span>
                    ${badge}
                </div>
                ${option.translation ? `<div class="option-translation">${option.translation}</div>` : ''}
                ${option.explanation ? `
                <div class="option-explanation ${isCorrectOption ? 'correct' : 'incorrect'}">
                    <strong><i class="fas ${isCorrectOption ? 'fa-lightbulb' : 'fa-circle-exclamation'}"></i> ${isCorrectOption ? '정답 이유:' : '오답 이유:'}</strong><br>${option.explanation}
                </div>
                ` : ''}
            </div>
        `;
    });
    
    return `
        <div class="options-explanation-container">
            <button class="btn-toggle-options" onclick="toggleAcademicOptions('${toggleId}')">
                <span class="toggle-text">보기 상세 해설 펼치기</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="options-explanation-content" id="${toggleId}" style="display: none;">
                ${optionsHTML}
            </div>
        </div>
    `;
}

// 보기 해설 토글
function toggleAcademicOptions(id) {
    const content = document.getElementById(id);
    const button = content.previousElementSibling;
    const icon = button.querySelector('i');
    const text = button.querySelector('.toggle-text');
    
    if (content.style.display === 'none' || content.style.display === '') {
        content.style.display = 'block';
        button.classList.add('is-active');
        icon.className = 'fas fa-chevron-up';
        text.innerText = '보기 상세 해설 접기';
    } else {
        content.style.display = 'none';
        button.classList.remove('is-active');
        icon.className = 'fas fa-chevron-down';
        text.innerText = '보기 상세 해설 펼치기';
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
    
    const existingTooltip = document.querySelector('.rd-tooltip');
    if (existingTooltip) existingTooltip.remove();
    
    const tooltip = document.createElement('div');
    tooltip.className = 'rd-tooltip';
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
    const tooltip = document.querySelector('.rd-tooltip');
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
