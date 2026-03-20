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

console.log('✅ [Listening] listening-utils.js 로드 완료');
