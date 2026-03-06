/**
 * data.js — V3 앱 상태 변수
 * 
 * [V3] toeflData, userAnswers, programSchedule, demoTasks 삭제됨
 * — V1 프로토타입 하드코딩 데이터, Supabase 데이터로 완전 대체
 * 
 * 남은 항목:
 * - currentTest: 현재 진행 중인 과제 상태 (전역)
 * - daysOfWeek: 요일 목록 (스케줄 렌더링용)
 */

// 현재 시험 상태
let currentTest = {
    section: null,
    currentQuestion: 0,
    currentPassage: 0,
    currentTask: 0,
    startTime: null,
    answers: {},
    // 학습 일정 관련
    currentWeek: null,
    currentDay: null
};
window.currentTest = currentTest;

// 요일 목록 (토요일 제외)
const daysOfWeek = ['일', '월', '화', '수', '목', '금'];
