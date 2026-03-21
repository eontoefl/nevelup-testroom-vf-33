// ============================================
// Reading - 공통 유틸리티 함수
// ============================================

/**
 * HTML 특수문자 이스케이프
 * @param {string} text - 이스케이프할 텍스트
 * @returns {string} 이스케이프된 HTML 문자열
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 숫자 인덱스 → 알파벳 변환 (1=A, 2=B, 3=C, 4=D)
 * @param {number} index - 1부터 시작하는 인덱스
 * @returns {string} 알파벳 라벨
 */
function getLabelFromIndex(index) {
    if (!index) return '';
    return String.fromCharCode(64 + index); // 1=A, 2=B, 3=C, 4=D
}

/**
 * 보기 해설 펼치기/접기 (Reading 공통)
 * @param {string} id - 토글 대상 요소의 ID
 */
function toggleRdOptions(id) {
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

/**
 * 인터랙티브 단어 툴팁 표시 (Reading 공통)
 * @param {Event} event - mouseenter 이벤트
 */
function showRdTooltip(event) {
    const word = event.target;
    const translation = word.getAttribute('data-translation');
    const explanation = word.getAttribute('data-explanation');
    
    const existingTooltip = document.querySelector('.rd-tooltip');
    if (existingTooltip) existingTooltip.remove();
    
    const tooltip = document.createElement('div');
    tooltip.className = 'rd-tooltip';
    tooltip.innerHTML = `
        <div class="tooltip-translation">${escapeHtml(translation)}</div>
        ${explanation ? `<div class="tooltip-explanation">${escapeHtml(explanation)}</div>` : ''}
    `;
    
    document.body.appendChild(tooltip);
    
    const rect = word.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
}

/**
 * 인터랙티브 단어 툴팁 숨기기 (Reading 공통)
 */
function hideRdTooltip() {
    const tooltip = document.querySelector('.rd-tooltip');
    if (tooltip) tooltip.remove();
}

/**
 * 인터랙티브 단어 이벤트 바인딩 (Reading 공통)
 */
function bindRdWordEvents() {
    const interactiveWords = document.querySelectorAll('.interactive-word');
    interactiveWords.forEach(word => {
        word.addEventListener('mouseenter', showRdTooltip);
        word.addEventListener('mouseleave', hideRdTooltip);
    });
}

// ============================================
// 재풀이 (Retry) 공용 클릭 핸들러
// 모든 객관식 result 화면에서 공유
// ============================================

/**
 * 재풀이 보기 클릭 핸들러 (공용)
 * data-retry-id, data-selected-index, data-correct-answer 속성 기반 동작
 * @param {HTMLElement} btn - 클릭된 보기 버튼
 */
function handleRetrySelect(btn) {
    var retryId = btn.getAttribute('data-retry-id');
    var selectedIndex = parseInt(btn.getAttribute('data-selected-index'));
    var correctAnswer = parseInt(btn.getAttribute('data-correct-answer'));
    var feedbackEl = document.getElementById(retryId + '-feedback');

    if (selectedIndex === correctAnswer) {
        // ── 정답 ──
        console.log('✅ [재풀이] 정답! retryId:', retryId);

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

        // 컨테이너 스타일 변경
        var container = document.getElementById(retryId + '-container');
        if (container) {
            container.classList.remove('incorrect');
            container.classList.add('correct');
            var iconEl = container.querySelector('.retry-result-icon, .rd-result-icon');
            if (iconEl) iconEl.innerHTML = '<i class="fas fa-check-circle"></i>';
        }

        // 2차 답변 표시
        var selectedLabel = btn.querySelector('.retry-option-label').textContent;
        var selectedText = btn.querySelector('.retry-option-text').textContent;
        var retrySection = document.getElementById(retryId);
        if (retrySection) {
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

        // 재풀이 섹션 비활성
        if (retrySection) {
            retrySection.style.opacity = '0.5';
            retrySection.style.pointerEvents = 'none';
        }

    } else {
        // ── 오답 ──
        console.log('❌ [재풀이] 오답:', selectedIndex, '정답:', correctAnswer);

        if (feedbackEl) {
            feedbackEl.innerHTML = '<span class="retry-feedback-wrong"><i class="fas fa-times-circle"></i> 다시 생각해보세요</span>';
        }

        btn.disabled = true;
        btn.classList.add('retry-disabled', 'retry-wrong-selected');
    }
}

// 전역 노출 — 기본
window.escapeHtml = escapeHtml;
window.getLabelFromIndex = getLabelFromIndex;
window.handleRetrySelect = handleRetrySelect;
window.toggleRdOptions = toggleRdOptions;
window.showRdTooltip = showRdTooltip;
window.hideRdTooltip = hideRdTooltip;
window.bindRdWordEvents = bindRdWordEvents;

// 전역 노출 — 레거시 별칭 (MIGRATION-PLAN.md + validate-migration.sh 호환)
window.toggleDaily1Options = toggleRdOptions;
window.toggleDaily2Options = toggleRdOptions;
window.toggleAcademicOptions = toggleRdOptions;
window.bindDaily1ToggleEvents = bindRdWordEvents;
window.bindDaily2ToggleEvents = bindRdWordEvents;
window.bindAcademicToggleEvents = bindRdWordEvents;

console.log('✅ [Reading] utils.js 로드 완료');
