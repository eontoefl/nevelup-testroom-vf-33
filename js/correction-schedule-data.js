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
    // Week 1
    { session: 1,  week: 1, writing: { type: 'email',      number: 1 }, speaking: { number: 1  }, dayOffset: 0 },
    { session: 2,  week: 1, writing: { type: 'discussion',  number: 1 }, speaking: { number: 2  }, dayOffset: 2 },
    { session: 3,  week: 1, writing: { type: 'email',      number: 2 }, speaking: { number: 3  }, dayOffset: 4 },
    // Week 2
    { session: 4,  week: 2, writing: { type: 'discussion',  number: 2 }, speaking: { number: 4  }, dayOffset: 0 },
    { session: 5,  week: 2, writing: { type: 'email',      number: 3 }, speaking: { number: 5  }, dayOffset: 2 },
    { session: 6,  week: 2, writing: { type: 'discussion',  number: 3 }, speaking: { number: 6  }, dayOffset: 4 },
    // Week 3
    { session: 7,  week: 3, writing: { type: 'email',      number: 4 }, speaking: { number: 7  }, dayOffset: 0 },
    { session: 8,  week: 3, writing: { type: 'discussion',  number: 4 }, speaking: { number: 8  }, dayOffset: 2 },
    { session: 9,  week: 3, writing: { type: 'email',      number: 5 }, speaking: { number: 9  }, dayOffset: 4 },
    // Week 4
    { session: 10, week: 4, writing: { type: 'discussion',  number: 5 }, speaking: { number: 10 }, dayOffset: 0 },
    { session: 11, week: 4, writing: { type: 'email',      number: 6 }, speaking: { number: 11 }, dayOffset: 2 },
    { session: 12, week: 4, writing: { type: 'discussion',  number: 6 }, speaking: { number: 12 }, dayOffset: 4 },
];

console.log('✅ correction-schedule-data.js 로드 완료 (' + window.CORRECTION_SCHEDULE.length + '세션)');
