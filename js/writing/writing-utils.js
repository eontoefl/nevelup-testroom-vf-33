/**
 * writing-utils.js
 * 라이팅 모듈 공용 유틸리티 함수
 */

// HTML 이스케이프
function escapeHtml_writing(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

console.log('✅ [Writing] writing-utils.js 로드 완료');
