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

// 전역 노출 — 기본
window.escapeHtml = escapeHtml;
window.getLabelFromIndex = getLabelFromIndex;
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
