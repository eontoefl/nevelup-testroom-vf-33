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

/**
 * 리스닝 오디오 URL 유효성 판정 (4개 유형 공통 기준)
 * - 빈 값 / 'PLACEHOLDER' / 더미 드라이브 ID 포함 → 오디오 없음으로 취급
 */
function isValidListeningAudioUrl(url) {
    if (!url || typeof url !== 'string') return false;
    var trimmed = url.trim();
    if (trimmed === '' || trimmed === 'PLACEHOLDER') return false;
    if (trimmed.includes('1ABC123DEF456')) return false;
    return true;
}
window.isValidListeningAudioUrl = isValidListeningAudioUrl;

// ============================================
// 공용 실패 UI — 리스닝 모듈 안의 모든 실패는 이 하나의 문법을 쓴다
// (오디오 재생 실패 / 세트 데이터 로드 실패 공통)
//
// 규칙:
//   - 실패 1회차: [다시 시도]만 표시
//   - 재시도도 실패(2회차)부터: [건너뛰고 계속하기] 추가 표시
//   - 실패 횟수는 호출 측이 오디오/세트 1개 단위로 관리 (성공·다음 문제 이동 시 리셋)
// ============================================

/**
 * 실패 UI 렌더링
 * @param {object} opts
 *   - containerId: UI를 붙일 컨테이너 요소 id
 *   - uiId:        이 UI의 고유 id (중복 방지 + 제거용)
 *   - message:     실패 안내 문구
 *   - failCount:   현재까지의 실패 횟수 (2 이상이면 건너뛰기 노출)
 *   - onRetry:     [다시 시도] 클릭 콜백
 *   - onSkip:      [건너뛰고 계속하기] 클릭 콜백
 */
function showListeningFailureUI(opts) {
    var container = document.getElementById(opts.containerId);
    if (!container) return;

    var existing = document.getElementById(opts.uiId);
    if (existing) existing.remove();

    var div = document.createElement('div');
    div.id = opts.uiId;
    div.className = 'listening-failure-ui';

    var html =
        '<p class="lf-msg"><i class="fas fa-exclamation-circle"></i> ' + opts.message + '</p>' +
        '<button type="button" class="lf-retry-btn"><i class="fas fa-redo"></i>다시 시도</button>';
    if (opts.failCount >= 2 && typeof opts.onSkip === 'function') {
        html += '<button type="button" class="lf-skip-btn">건너뛰고 계속하기</button>';
    }
    div.innerHTML = html;

    div.querySelector('.lf-retry-btn').onclick = function() {
        div.remove();
        opts.onRetry();
    };
    var skipBtn = div.querySelector('.lf-skip-btn');
    if (skipBtn) {
        skipBtn.onclick = function() {
            div.remove();
            opts.onSkip();
        };
    }

    container.appendChild(div);
}
window.showListeningFailureUI = showListeningFailureUI;

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
