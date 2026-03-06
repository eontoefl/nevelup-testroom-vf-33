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
 * 요일 약어 → 전체 이름 변환
 * @param {string} day - 요일 약어 ('일', '월', '화', '수', '목', '금')
 * @returns {string} 전체 요일 이름
 */
function getDayName(day) {
    const dayNames = {
        '일': '일요일',
        '월': '월요일',
        '화': '화요일',
        '수': '수요일',
        '목': '목요일',
        '금': '금요일'
    };
    return dayNames[day] || day;
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

// 전역 노출
window.escapeHtml = escapeHtml;
window.getDayName = getDayName;
window.getLabelFromIndex = getLabelFromIndex;

console.log('✅ [Reading] utils.js 로드 완료');
