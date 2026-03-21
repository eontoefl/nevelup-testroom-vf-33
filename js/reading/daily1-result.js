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

// 현재 해설 모드 저장 (재풀이 판정용)
var _daily1ExplainMode = null;

// 정답채점 화면 표시
// @param {Array} data - 세트별 결과 배열 (explain-viewer.js에서 전달)
// @param {string} mode - 'initial' | 'current' (explain-viewer.js에서 전달)
function showDaily1Results(data, mode) {
    const results = data;
    if (!results) {
        console.error('❌ 결과 데이터가 없습니다');
        return;
    }
    
    // 모드 저장
    _daily1ExplainMode = mode || null;
    
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
    
    const detailsContainer = document.getElementById('daily1ResultDetails');
    let detailsHTML = '';
    
    results.forEach((setResult, setIndex) => {
        detailsHTML += renderDaily1SetResult(setResult, setIndex, mode);
    });
    
    detailsContainer.innerHTML = detailsHTML;
    bindDaily1ToggleEvents();
}

// 세트별 결과 렌더링
function renderDaily1SetResult(setResult, setIndex, mode) {
    const passage = setResult.passage;
    const translations = passage.translations || [];
    
    const cleanContent = passage.content
        .replace(/\\n/g, '\n')
        .replace(/\r\n/g, '\n');
    
    const sentences = splitToMatchTranslations(cleanContent, translations.length);
    
    let sentencesHTML = '';
    sentences.forEach((sentence, idx) => {
        const translation = translations[idx] || '';
        
        let sentenceHTML = escapeHtml(sentence).replace(/\n/g, '<br>');
        if (passage.interactiveWords) {
            passage.interactiveWords.forEach(wordData => {
                const regex = new RegExp(`(?<![\\w-])${wordData.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'gi');
                sentenceHTML = sentenceHTML.replace(regex, (match) => `<span class="interactive-word" data-word="${wordData.word}" data-translation="${escapeHtml(wordData.translation)}" data-explanation="${escapeHtml(wordData.explanation)}">${match}</span>`);
            });
        }
        
        sentencesHTML += `
            <div class="sentence-pair">
                <div class="sentence-original">${sentenceHTML}</div>
                ${translation && translation.trim() ? `<div class="sentence-translation">${escapeHtml(translation)}</div>` : ''}
            </div>
        `;
    });
    
    let answersHTML = '';
    setResult.answers.forEach((answer, qIdx) => {
        answersHTML += renderDaily1Answers(answer, qIdx, setResult.setId, mode);
    });
    
    return `
        <div class="result-set-section">
            <h3 class="result-section-title">
                <i class="fas fa-book-open"></i> Set ${setIndex + 1}: ${escapeHtml(setResult.mainTitle)}
            </h3>
            
            <div class="rd-passage-panel">
                <h4 class="result-passage-title">${escapeHtml(passage.title)}</h4>
                <div class="sentence-translations">
                    ${sentencesHTML}
                </div>
            </div>
            
            ${answersHTML}
        </div>
    `;
}

// 문제별 답안 렌더링
function renderDaily1Answers(answer, qIdx, setId, mode) {
    const isCorrect = answer.isCorrect;
    const isRetryTarget = (mode === 'initial' && !isCorrect);
    
    // ── 재풀이 대상: 정답/해설 잠금 + 보기 선택 UI ──
    if (isRetryTarget) {
        return _renderDaily1RetryQuestion(answer, qIdx, setId);
    }
    
    // ── 기존 로직 (맞은 문제 or current 모드) ──
    const correctIcon = isCorrect 
        ? '<i class="fas fa-check-circle"></i>' 
        : '<i class="fas fa-times-circle"></i>';
    
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
    
    const toggleId = `rd-options-${setId}-${qIdx}`;
    
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
                ${renderDaily1OptionsExplanation(answer, toggleId)}
            </div>
        </div>
    `;
}

// ============================================
// 재풀이 UI 렌더링 (틀린 문제 전용)
// ============================================

function _renderDaily1RetryQuestion(answer, qIdx, setId) {
    const retryId = `retry-${setId}-${qIdx}`;
    const userAnswerIndex = answer.userAnswer;
    const userAnswerLabel = getLabelFromIndex(userAnswerIndex);
    
    let userAnswerOption = null;
    if (Array.isArray(answer.options) && answer.options.length > 0 && answer.options[0].label) {
        userAnswerOption = answer.options.find(opt => opt.label === userAnswerLabel);
    } else {
        userAnswerOption = { label: userAnswerLabel, text: answer.options[userAnswerIndex - 1] || '미응답' };
    }
    const userAnswerText = userAnswerOption ? `${userAnswerOption.label}) ${userAnswerOption.text}` : '미응답';
    
    // 보기 버튼 렌더링
    let optionBtnsHTML = '';
    if (Array.isArray(answer.options) && answer.options.length > 0) {
        answer.options.forEach(function(option, idx) {
            var label = option.label || getLabelFromIndex(idx + 1);
            var text = option.text || option;
            optionBtnsHTML += `
                <button class="retry-option-btn" 
                        data-retry-id="${retryId}" 
                        data-selected-index="${idx + 1}"
                        data-correct-answer="${answer.correctAnswer}"
                        onclick="handleDaily1RetrySelect(this)">
                    <span class="retry-option-label">${label})</span>
                    <span class="retry-option-text">${escapeHtml(typeof text === 'string' ? text : text)}</span>
                </button>
            `;
        });
    }
    
    // 정답 맞추면 교체될 해설 HTML (숨김)
    var toggleId = `rd-options-${setId}-${qIdx}`;
    var hiddenExplanation = renderDaily1OptionsExplanation(answer, toggleId);
    
    return `
        <div class="rd-result-item incorrect" id="${retryId}-container">
            <div class="rd-result-icon"><i class="fas fa-times-circle"></i></div>
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
                    <span class="rd-answer-label">✗ 1차 답변:</span>
                    <span class="rd-answer-value incorrect">${escapeHtml(userAnswerText)}</span>
                </div>
                
                <!-- 재풀이 영역 -->
                <div class="retry-section" id="${retryId}">
                    <div class="retry-header">
                        <i class="fas fa-redo"></i> 다시 풀어보기
                    </div>
                    <div class="retry-feedback" id="${retryId}-feedback"></div>
                    <div class="retry-options">
                        ${optionBtnsHTML}
                    </div>
                </div>
                
                <!-- 정답/해설 (잠김 → 정답 맞추면 표시) -->
                <div class="retry-locked-area" id="${retryId}-locked">
                    <div class="rd-answer-row" id="${retryId}-correct-row" style="display:none;">
                        <span class="rd-answer-label">✓ 정답:</span>
                        <span class="rd-answer-value correct" id="${retryId}-correct-text"></span>
                    </div>
                    <div id="${retryId}-explanation" style="display:none;">
                        ${hiddenExplanation}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// 재풀이 보기 클릭 핸들러
// ============================================

function handleDaily1RetrySelect(btn) {
    var retryId = btn.getAttribute('data-retry-id');
    var selectedIndex = parseInt(btn.getAttribute('data-selected-index'));
    var correctAnswer = parseInt(btn.getAttribute('data-correct-answer'));
    var feedbackEl = document.getElementById(retryId + '-feedback');
    
    if (selectedIndex === correctAnswer) {
        // ── 정답! ──
        console.log('✅ [Daily1 재풀이] 정답! retryId:', retryId);
        
        // 피드백
        if (feedbackEl) {
            feedbackEl.innerHTML = '<span class="retry-feedback-correct"><i class="fas fa-check-circle"></i> 정답입니다!</span>';
        }
        
        // 모든 버튼 비활성
        var allBtns = document.querySelectorAll('[data-retry-id="' + retryId + '"]');
        allBtns.forEach(function(b) {
            b.disabled = true;
            b.classList.add('retry-disabled');
            if (parseInt(b.getAttribute('data-selected-index')) === correctAnswer) {
                b.classList.add('retry-correct-selected');
            }
        });
        
        // 컨테이너 스타일 변경 (오답 → 정답)
        var container = document.getElementById(retryId + '-container');
        if (container) {
            container.classList.remove('incorrect');
            container.classList.add('correct');
            // 아이콘 변경
            var iconEl = container.querySelector('.rd-result-icon');
            if (iconEl) iconEl.innerHTML = '<i class="fas fa-check-circle"></i>';
        }
        
        // 2차 답변 표시
        var selectedBtn = btn;
        var selectedLabel = selectedBtn.querySelector('.retry-option-label').textContent;
        var selectedText = selectedBtn.querySelector('.retry-option-text').textContent;
        var retrySection = document.getElementById(retryId);
        if (retrySection) {
            // 재풀이 헤더 앞에 2차 답변 추가
            var answerRow = document.createElement('div');
            answerRow.className = 'rd-answer-row';
            answerRow.innerHTML = '<span class="rd-answer-label">✓ 2차 답변:</span>' +
                '<span class="rd-answer-value correct">' + escapeHtml(selectedLabel + ' ' + selectedText) + '</span>';
            retrySection.parentNode.insertBefore(answerRow, retrySection);
        }
        
        // 정답 행 + 해설 공개
        var correctRow = document.getElementById(retryId + '-correct-row');
        var correctText = document.getElementById(retryId + '-correct-text');
        var explanationArea = document.getElementById(retryId + '-explanation');
        
        if (correctRow && correctText) {
            // 정답 텍스트 찾기
            var correctBtn = null;
            allBtns.forEach(function(b) {
                if (parseInt(b.getAttribute('data-selected-index')) === correctAnswer) correctBtn = b;
            });
            if (correctBtn) {
                correctText.textContent = correctBtn.querySelector('.retry-option-label').textContent + ' ' + correctBtn.querySelector('.retry-option-text').textContent;
            }
            correctRow.style.display = '';
        }
        if (explanationArea) {
            explanationArea.style.display = '';
        }
        
        // 재풀이 섹션 숨기기 (부드럽게)
        var retrySec = document.getElementById(retryId);
        if (retrySec) {
            retrySec.style.opacity = '0.5';
            retrySec.style.pointerEvents = 'none';
        }
        
    } else {
        // ── 오답 ──
        console.log('❌ [Daily1 재풀이] 오답:', selectedIndex, '정답:', correctAnswer);
        
        // 피드백
        if (feedbackEl) {
            feedbackEl.innerHTML = '<span class="retry-feedback-wrong"><i class="fas fa-times-circle"></i> 다시 생각해보세요</span>';
        }
        
        // 선택한 버튼 비활성
        btn.disabled = true;
        btn.classList.add('retry-disabled', 'retry-wrong-selected');
    }
}

// 보기 상세 해설 렌더링
function renderDaily1OptionsExplanation(answer, toggleId) {
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
            <button class="btn-toggle-options" onclick="toggleDaily1Options('${toggleId}')">
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
window.showDaily1Results = showDaily1Results;
window.renderDaily1SetResult = renderDaily1SetResult;
window.renderDaily1Answers = renderDaily1Answers;
window.renderDaily1OptionsExplanation = renderDaily1OptionsExplanation;
window.handleDaily1RetrySelect = handleDaily1RetrySelect;

console.log('✅ [Reading] daily1-result.js 로드 완료');
