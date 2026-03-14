/**
 * data.js — V3 앱 상태 변수
 * 
 * 남은 항목:
 * - currentTest: 현재 진행 중인 과제 상태 (전역)
 * - daysOfWeek: 요일 목록 (스케줄 렌더링용)
 */

// 현재 과제 상태 (학습 일정 관련)
let currentTest = {
    currentWeek: null,
    currentDay: null
};
window.currentTest = currentTest;

// 요일 목록 (토요일 제외)
const daysOfWeek = ['일', '월', '화', '수', '목', '금'];
