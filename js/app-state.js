/**
 * data.js — V3 앱 상태 변수
 * 
 * 남은 항목:
 * - currentTest: 현재 진행 중인 과제 상태 (전역)
 * - currentPractice: 연습코스 현재 위치 (전역)
 * - courseMode: 현재 코스 모드 ('regular' | 'practice')
 * - daysOfWeek: 요일 목록 (스케줄 렌더링용)
 */

// 현재 과제 상태 (학습 일정 관련 — 정규코스)
let currentTest = {
    currentWeek: null,
    currentDay: null
};
window.currentTest = currentTest;

// 연습코스 현재 위치 (정규코스의 currentTest와 별도)
let currentPractice = {
    practiceNumber: null
};
window.currentPractice = currentPractice;

// 코스 모드 ('regular' | 'practice')
// sessionStorage에서 복원, 없으면 'regular' 기본
let courseMode = sessionStorage.getItem('courseMode') || 'regular';
window.courseMode = courseMode;

/**
 * 코스 모드 변경
 * @param {string} mode - 'regular' | 'practice'
 */
function setCourseMode(mode) {
    courseMode = mode;
    window.courseMode = mode;
    sessionStorage.setItem('courseMode', mode);
    console.log('🔄 [코스모드] 변경:', mode);
}
window.setCourseMode = setCourseMode;

/**
 * 현재 연습코스 모드인지 확인
 * @returns {boolean}
 */
function isPracticeMode() {
    return window.courseMode === 'practice';
}
window.isPracticeMode = isPracticeMode;

// 요일 목록 (토요일 제외)
const daysOfWeek = ['일', '월', '화', '수', '목', '금'];

// 요일 영문 약어 매핑
const dayEnShort = {
    '일': 'SUN', '월': 'MON', '화': 'TUE',
    '수': 'WED', '목': 'THU', '금': 'FRI'
};
