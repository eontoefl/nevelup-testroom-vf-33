/**
 * listening-utils.js
 * 리스닝 모듈 공용 유틸리티 함수
 */

// HTML 이스케이프
function escapeHtml_listening(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 정규표현식 이스케이프
function escapeRegex_listening(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================
// 재풀이 (Retry) 공용 렌더링 — 리스닝 전용
// options: ['텍스트', '텍스트', ...] 구조
// ============================================

/**
 * 리스닝 틀린 문제 재풀이 UI 렌더링
 * @param {object} answer - answer 객체 (isCorrect, userAnswer, correctAnswer, options[], optionTranslations[], optionExplanations[], questionNum, questionText, questionTrans)
 * @param {string} retryId - 고유 retry ID
 * @param {function} renderExplanationFn - 해당 유형의 보기 해설 렌더링 함수 (answer, qIdx, setIdx 인자)
 * @param {number} qIdx - 문제 인덱스
 * @param {number} setIdx - 세트 인덱스
 * @returns {string} HTML 문자열
 */
function renderListeningRetryQuestion(answer, retryId, renderExplanationFn, qIdx, setIdx) {
    var options = answer.options || [];
    var userAnswerText = answer.userAnswer ? options[answer.userAnswer - 1] || '미응답' : '미응답';

    var optionBtnsHTML = '';
    options.forEach(function(option, idx) {
        var label = String.fromCharCode(65 + idx); // A, B, C, D
        optionBtnsHTML += '<button class="retry-option-btn" ' +
            'data-retry-id="' + retryId + '" ' +
            'data-selected-index="' + (idx + 1) + '" ' +
            'data-correct-answer="' + answer.correctAnswer + '" ' +
            'onclick="handleRetrySelect(this)">' +
            '<span class="retry-option-label">' + label + ')</span>' +
            '<span class="retry-option-text">' + escapeHtml_listening(option) + '</span>' +
            '</button>';
    });

    var hiddenExplanation = renderExplanationFn ? renderExplanationFn(answer, qIdx, setIdx) : '';

    return '<div class="retry-section" id="' + retryId + '">' +
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
        '</div>';
}

window.renderListeningRetryQuestion = renderListeningRetryQuestion;

console.log('✅ [Listening] listening-utils.js 로드 완료');
