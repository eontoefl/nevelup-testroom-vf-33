/**
 * correction-schedule-data.js
 * AI 첨삭 스케줄 하드코딩 데이터
 * 
 * 4주 × 3세션 = 12세션
 * dayOffset: start_date(일요일) 기준 오프셋
 *   - 1차 draft: dayOffset 당일 ~ 다음날 04:00
 *   - 2차 draft: dayOffset+1일 ~ 그 다음날 04:00
 */

window.CORRECTION_SCHEDULE = [
    // Week 1 (start_date 기준 0~6일)
    { session: 1,  week: 1, writing: { type: 'email',      number: 901 }, speaking: { number: 901 }, dayOffset: 0  },
    { session: 2,  week: 1, writing: { type: 'discussion',  number: 901 }, speaking: { number: 902 }, dayOffset: 2  },
    { session: 3,  week: 1, writing: { type: 'email',      number: 902 }, speaking: { number: 903 }, dayOffset: 4  },
    // Week 2 (start_date 기준 7~13일)
    { session: 4,  week: 2, writing: { type: 'discussion',  number: 902 }, speaking: { number: 904 }, dayOffset: 7  },
    { session: 5,  week: 2, writing: { type: 'email',      number: 903 }, speaking: { number: 905 }, dayOffset: 9  },
    { session: 6,  week: 2, writing: { type: 'discussion',  number: 903 }, speaking: { number: 906 }, dayOffset: 11 },
    // Week 3 (start_date 기준 14~20일)
    { session: 7,  week: 3, writing: { type: 'email',      number: 904 }, speaking: { number: 907 }, dayOffset: 14 },
    { session: 8,  week: 3, writing: { type: 'discussion',  number: 904 }, speaking: { number: 908 }, dayOffset: 16 },
    { session: 9,  week: 3, writing: { type: 'email',      number: 905 }, speaking: { number: 909 }, dayOffset: 18 },
    // Week 4 (start_date 기준 21~27일)
    { session: 10, week: 4, writing: { type: 'discussion',  number: 905 }, speaking: { number: 910 }, dayOffset: 21 },
    { session: 11, week: 4, writing: { type: 'email',      number: 906 }, speaking: { number: 911 }, dayOffset: 23 },
    { session: 12, week: 4, writing: { type: 'discussion',  number: 906 }, speaking: { number: 912 }, dayOffset: 25 },
];

console.log('✅ correction-schedule-data.js 로드 완료 (' + window.CORRECTION_SCHEDULE.length + '세션)');
