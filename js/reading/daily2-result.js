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

// 현재 해설 모드 저장 (재풀이 판정용)
var _daily2ExplainMode = null;

// 결과 화면 표시
// @param {Array} data - 세트별 결과 배열 (explain-viewer.js에서 전달)
// @param {string} mode - 'initial' | 'current' (explain-viewer.js에서 전달)
function showDaily2Results(data, mode) {
    console.log('📊 [일상리딩2] 결과 화면 표시');
    
    if (!data) {
        console.error('❌ 결과 데이터가 없습니다');
        return;
    }
    
    _daily2ExplainMode = mode || null;
    const daily2Results = data;
    
    let totalCorrect = 0;
    let totalQuestions = 0;
    
    daily2Results.forEach(setResult => {
        setResult.answers.forEach(answer => {
            totalQuestions++;
            if (answer.isCorrect) totalCorrect++;
        });
    });
    
    const totalIncorrect = totalQuestions - totalCorrect;
    const totalScore = Math.round((totalCorrect / totalQuestions) * 100);
    
    document.getElementById('daily2ResultScoreValue').textContent = totalScore + '%';
    document.getElementById('daily2ResultCorrectCount').textContent = totalCorrect;
    document.getElementById('daily2ResultIncorrectCount').textContent = totalIncorrect;
    document.getElementById('daily2ResultTotalCount').textContent = totalQuestions;
    
    const detailsContainer = document.getElementById('daily2ResultDetails');
    let detailsHTML = '';
    
    daily2Results.forEach((setResult, setIdx) => {
        detailsHTML += renderDaily2SetResult(setResult, setIdx, mode);
    });
    
    detailsContainer.innerHTML = detailsHTML;
    bindDaily2ToggleEvents();
}

// 세트별 결과 렌더링
function renderDaily2SetResult(setResult, setIdx, mode) {
    const cleanContent = setResult.passage.content.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
    const translations = setResult.passage.translations || [];
    const sentences = splitToMatchTranslations_d2(cleanContent, translations.length);
    
    let sentencesHTML = '';
    sentences.forEach((sentence, idx) => {
        const translation = translations[idx] || '';
        
        let highlightedSentence = escapeHtml(sentence).replace(/\n/g, '<br>');
        if (setResult.passage.interactiveWords) {
            setResult.passage.interactiveWords.forEach(wordObj => {
                const regex = new RegExp(`(?<![\w-])${wordObj.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\w-])`, 'gi');
                highlightedSentence = highlightedSentence.replace(regex, 
                    (match) => `<span class="interactive-word" data-word="${wordObj.word}" data-translation="${escapeHtml(wordObj.translation)}" data-explanation="${escapeHtml(wordObj.explanation)}">${match}</span>`
                );
            });
        }
        
        sentencesHTML += `
            <div class="sentence-pair">
                <div class="sentence-original">${highlightedSentence}</div>
                ${translation && translation.trim() ? `<div class="sentence-translation">${escapeHtml(translation)}</div>` : ''}
            </div>
        `;
    });
    
    let answersHTML = '';
    setResult.answers.forEach((answer, qIdx) => {
        answersHTML += renderDaily2Answers(answer, qIdx, setResult.setId || setIdx, mode);
    });
    
    return `
        <div class="result-set-section">
            <h3 class="result-section-title">
                <i class="fas fa-book-open"></i> Set ${setIdx + 1}: ${escapeHtml(setResult.mainTitle)}
            </h3>
            
            <div class="rd-passage-panel">
                <h4 class="result-passage-title">${escapeHtml(setResult.passage.title)}</h4>
                <div class="sentence-translations">
                    ${sentencesHTML}
                </div>
            </div>
            
            ${answersHTML}
        </div>
    `;
}

// 문제별 결과 렌더링
function renderDaily2Answers(answer, qIdx, setId, mode) {
    const isCorrect = answer.isCorrect;
    const isRetryTarget = (mode === 'initial' && !isCorrect);
    
    // ── 재풀이 대상: 정답/해설 잠금 + 보기 선택 UI ──
    if (isRetryTarget) {
        return _renderDaily2RetryQuestion(answer, qIdx, setId);
    }
    
    // ── 기존 로직 (맞은 문제 or current 모드) ──
    const correctIcon = isCorrect 
        ? '<i class="fas fa-check-circle"></i>' 
        : '<i class="fas fa-times-circle"></i>';
    
    const toggleId = `rd-toggle-${setId}-${qIdx}`;
    
    const userAnswerText = answer.userAnswer && answer.options && answer.options[answer.userAnswer - 1]
        ? answer.options[answer.userAnswer - 1].label + ') ' + answer.options[answer.userAnswer - 1].text
        : '미응답';
    
    const correctAnswerText = answer.correctAnswer && answer.options && answer.options[answer.correctAnswer - 1]
        ? answer.options[answer.correctAnswer - 1].label + ') ' + answer.options[answer.correctAnswer - 1].text
        : '';
    
    return `
        <div class="rd-result-item ${isCorrect ? 'correct' : 'incorrect'}">
            <div class="rd-result-icon">${correctIcon}</div>
            <div class="rd-result-content">
                <div class="rd-question-text">
                    <strong>${answer.questionNum}.</strong> ${escapeHtml(answer.question)}
                </div>
                ${answer.questionTranslation ? `
                <div class="question-translation">
                    <i class="fas fa-comment-dots"></i> 문제 해석: ${escapeHtml(answer.questionTranslation)}
                </div>
                ` : ''}
                <div class="rd-answer-row">
                    <span class="rd-answer-label">${isCorrect ? '✓' : '✗'} 내 답변:</span>
                    <span class="rd-answer-value ${isCorrect ? 'correct' : 'incorrect'}">${escapeHtml(userAnswerText)}</span>
                </div>
                ${!isCorrect ? `
                <div class="rd-answer-row">
                    <span class="rd-answer-label">✓ 정답:</span>
                    <span class="rd-answer-value correct">${escapeHtml(correctAnswerText)}</span>
                </div>
                ` : ''}
                ${renderDaily2OptionsExplanation(answer, toggleId)}
            </div>
        </div>
    `;
}

// ── 재풀이 UI 렌더링 (틀린 문제 전용) ──
function _renderDaily2RetryQuestion(answer, qIdx, setId) {
    var retryId = 'retry-d2-' + setId + '-' + qIdx;
    var userAnswerIndex = answer.userAnswer;
    var userOpt = answer.options && answer.options[userAnswerIndex - 1];
    var userAnswerText = userOpt ? userOpt.label + ') ' + userOpt.text : '미응답';
    
    var optionBtnsHTML = '';
    if (Array.isArray(answer.options)) {
        answer.options.forEach(function(option, idx) {
            var label = option.label || getLabelFromIndex(idx + 1);
            var text = option.text || option;
            optionBtnsHTML += '<button class="retry-option-btn" ' +
                'data-retry-id="' + retryId + '" ' +
                'data-selected-index="' + (idx + 1) + '" ' +
                'data-correct-answer="' + answer.correctAnswer + '" ' +
                'onclick="handleRetrySelect(this)">' +
                '<span class="retry-option-label">' + label + ')</span>' +
                '<span class="retry-option-text">' + escapeHtml(typeof text === 'string' ? text : text) + '</span>' +
                '</button>';
        });
    }
    
    var toggleId = 'rd-toggle-' + setId + '-' + qIdx;
    var hiddenExplanation = renderDaily2OptionsExplanation(answer, toggleId);
    
    return '<div class="rd-result-item incorrect" id="' + retryId + '-container">' +
        '<div class="rd-result-icon"><i class="fas fa-times-circle"></i></div>' +
        '<div class="rd-result-content">' +
            '<div class="rd-question-text"><strong>' + answer.questionNum + '.</strong> ' + escapeHtml(answer.question) + '</div>' +
            (answer.questionTranslation ? '<div class="question-translation"><i class="fas fa-comment-dots"></i> 문제 해석: ' + escapeHtml(answer.questionTranslation) + '</div>' : '') +
            '<div class="rd-answer-row">' +
                '<span class="rd-answer-label">✗ 1차 답변:</span>' +
                '<span class="rd-answer-value incorrect">' + escapeHtml(userAnswerText) + '</span>' +
            '</div>' +
            '<div class="retry-section" id="' + retryId + '">' +
                '<div class="retry-header"><i class="fas fa-redo"></i> 다시 풀어보기</div>' +
                '<div class="retry-feedback" id="' + retryId + '-feedback"></div>' +
                '<div class="retry-options">' + optionBtnsHTML + '</div>' +
            '</div>' +
            '<div class="retry-locked-area" id="' + retryId + '-locked">' +
                '<div class="rd-answer-row" id="' + retryId + '-correct-row" style="display:none;">' +
                    '<span class="rd-answer-label">✓ 정답:</span>' +
                    '<span class="rd-answer-value correct" id="' + retryId + '-correct-text"></span>' +
                '</div>' +
                '<div id="' + retryId + '-explanation" style="display:none;">' + hiddenExplanation + '</div>' +
            '</div>' +
        '</div>' +
    '</div>';
}

// 보기 상세 해설 렌더링
function renderDaily2OptionsExplanation(answer, toggleId) {
    if (!answer.options || answer.options.length === 0 || !answer.options[0].label) {
        return '';
    }
    
    const userAnswerLabel = getLabelFromIndex(answer.userAnswer);
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
                    <span class="option-text">${escapeHtml(option.text)}</span>
                    ${badge}
                </div>
                ${option.translation ? `<div class="option-translation">${escapeHtml(option.translation)}</div>` : ''}
                ${option.explanation ? `
                <div class="option-explanation ${isCorrectOption ? 'correct' : 'incorrect'}">
                    <strong><i class="fas ${isCorrectOption ? 'fa-lightbulb' : 'fa-circle-exclamation'}"></i> ${isCorrectOption ? '정답 이유:' : '오답 이유:'}</strong><br>${escapeHtml(option.explanation)}
                </div>
                ` : ''}
            </div>
        `;
    });
    
    return `
        <div class="options-explanation-container">
            <button class="btn-toggle-options" onclick="toggleDaily2Options('${toggleId}')">
                <span class="toggle-text">보기 상세 해설 펼치기</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="options-explanation-content" id="${toggleId}" style="display: none;">
                ${optionsHTML}
            </div>
        </div>
    `;
}

// 전역 노출
window.showDaily2Results = showDaily2Results;
window.renderDaily2SetResult = renderDaily2SetResult;
window.renderDaily2Answers = renderDaily2Answers;
window.renderDaily2OptionsExplanation = renderDaily2OptionsExplanation;

console.log('✅ [Reading] daily2-result.js 로드 완료');
