/**
 * ================================================
 * correction-feedback.js
 * 피드백 렌더러 (annotated_html + tooltip + summary)
 * ================================================
 * 
 * - annotated_html 내 <mark class="correction-mark" data-comment="..."> 렌더링
 * - PC: hover tooltip, 모바일: tap tooltip
 * - summary 카드, level 배지, encouragement 카드
 */

// ============================================================
// 1. annotated_html 렌더링
// ============================================================

/**
 * annotated_html을 컨테이너에 렌더링하고 tooltip 이벤트 바인딩
 * @param {HTMLElement} container - 렌더링 대상
 * @param {string} html - annotated_html 문자열
 */
function renderAnnotatedHtml(container, html) {
    if (!container || !html) return;
    container.innerHTML = html;
    _bindTooltipEvents(container);
}

/**
 * Speaking 피드백: 질문별 annotated_html 렌더링
 * @param {HTMLElement} container - 렌더링 대상
 * @param {object} feedback - feedback_1 또는 feedback_2 JSONB
 */
function renderSpeakingFeedback(container, feedback) {
    if (!container || !feedback) return;

    var html = '';

    // per_question 배열이 있는 경우
    if (feedback.per_question && feedback.per_question.length > 0) {
        for (var i = 0; i < feedback.per_question.length; i++) {
            var pq = feedback.per_question[i];
            html += '<div class="corr-feedback-question">';
            html += '<div class="corr-feedback-q-label">Q' + (pq.q || (i + 1)) + '</div>';
            if (pq.annotated_html) {
                html += '<div class="corr-feedback-q-body">' + pq.annotated_html + '</div>';
            }
            if (pq.comment) {
                html += '<div class="corr-feedback-q-comment">' + _escapeHtml(pq.comment) + '</div>';
            }
            html += '</div>';
        }
    } else if (feedback.annotated_html) {
        // fallback: 단일 annotated_html
        html = feedback.annotated_html;
    }

    container.innerHTML = html;
    _bindTooltipEvents(container);
}

// ============================================================
// 2. Summary / Level / Encouragement 카드
// ============================================================

/**
 * summary 카드 HTML 생성
 */
function renderFeedbackSummary(container, feedback) {
    if (!container || !feedback) return;

    var html = '';

    // Summary
    if (feedback.summary) {
        html += '<div class="corr-feedback-summary-card">';
        html += '<div class="corr-feedback-summary-title"><i class="fas fa-comment-dots"></i> 총평</div>';
        html += '<div class="corr-feedback-summary-text">' + _escapeHtml(feedback.summary) + '</div>';
        html += '</div>';
    }

    // Hint count
    if (feedback.hint_count !== undefined && feedback.hint_count !== null) {
        html += '<div class="corr-feedback-hint">교정 포인트: <strong>' + feedback.hint_count + '</strong>개</div>';
    }

    // Level (2차 피드백)
    if (feedback.level !== undefined && feedback.level !== null) {
        html += '<div class="corr-feedback-level-card">';
        html += '<div class="corr-feedback-level-badge">' + Number(feedback.level).toFixed(1) + '</div>';
        html += '<div class="corr-feedback-level-label">Level Score</div>';
        html += '</div>';
    }

    // Encouragement (2차 피드백)
    if (feedback.encouragement) {
        html += '<div class="corr-feedback-encouragement-card">';
        html += '<div class="corr-feedback-encouragement-title"><i class="fas fa-star"></i> 격려 메시지</div>';
        html += '<div class="corr-feedback-encouragement-text">' + _escapeHtml(feedback.encouragement) + '</div>';
        html += '</div>';
    }

    container.innerHTML = html;
}

// ============================================================
// 3. Tooltip 이벤트 바인딩 (PC: hover, 모바일: tap)
// ============================================================

function _bindTooltipEvents(container) {
    var marks = container.querySelectorAll('.correction-mark[data-comment]');
    for (var i = 0; i < marks.length; i++) {
        _attachTooltip(marks[i]);
    }
}

function _attachTooltip(mark) {
    var comment = mark.getAttribute('data-comment');
    if (!comment) return;

    // tooltip 엘리먼트 생성하지 않음 (메모 패널로 대체)
    // 클릭 이벤트: 스플릿 메모 패널 연동은 _buildMemoPanel에서 처리
    // 스플릿 외부(Speaking 등)에서 호출될 경우를 위한 기본 active 토글만 유지
    mark.addEventListener('click', function(e) {
        e.stopPropagation();
        // 스플릿 wrap 안이면 _buildMemoPanel 이벤트가 처리하므로 여기서는 무시
        if (mark.closest('.corr-fb-split-wrap')) return;
        var allActive = document.querySelectorAll('.correction-mark.active');
        for (var j = 0; j < allActive.length; j++) {
            if (allActive[j] !== mark) allActive[j].classList.remove('active');
        }
        mark.classList.toggle('active');
    });
}

// 문서 클릭 시 모든 active 해제 (스플릿 밖의 Speaking 등)
document.addEventListener('click', function() {
    var allActive = document.querySelectorAll('.correction-mark.active');
    for (var i = 0; i < allActive.length; i++) {
        allActive[i].classList.remove('active');
    }
});

// ============================================================
// 4. 유틸리티
// ============================================================

function _escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

console.log('✅ correction-feedback.js 로드 완료');
