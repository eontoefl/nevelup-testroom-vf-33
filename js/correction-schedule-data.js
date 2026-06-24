/**
 * correction-schedule-data.js
 * AI 첨삭 스케줄 하드코딩 데이터
 *
 * [1학기] phase 1 — 4주 × 3세션 = 세션 1~12
 *   dayOffset: start_date(일요일) 기준 오프셋
 * [2학기/연장] phase 2 — 4주 × 3세션 = 세션 13~24
 *   dayOffset: extension_start_date(일요일) 기준 오프셋 (다시 0부터 시작)
 *   extension_enabled = true 일 때만 노출됨
 *
 *   - 1차 draft: dayOffset 당일 ~ 다음날 04:00
 *   - 2차 draft: dayOffset+1일 ~ 그 다음날 04:00
 */

window.CORRECTION_SCHEDULE = [
    // ===== 1학기 (phase 1, start_date 기준) =====
    // Week 1 (start_date 기준 0~6일)
    { session: 1,  phase: 1, week: 1, writing: { type: 'email',      number: 901 }, speaking: { number: 901 }, dayOffset: 0  },
    { session: 2,  phase: 1, week: 1, writing: { type: 'discussion',  number: 901 }, speaking: { number: 902 }, dayOffset: 2  },
    { session: 3,  phase: 1, week: 1, writing: { type: 'email',      number: 902 }, speaking: { number: 903 }, dayOffset: 4  },
    // Week 2 (start_date 기준 7~13일)
    { session: 4,  phase: 1, week: 2, writing: { type: 'discussion',  number: 902 }, speaking: { number: 904 }, dayOffset: 7  },
    { session: 5,  phase: 1, week: 2, writing: { type: 'email',      number: 903 }, speaking: { number: 905 }, dayOffset: 9  },
    { session: 6,  phase: 1, week: 2, writing: { type: 'discussion',  number: 903 }, speaking: { number: 906 }, dayOffset: 11 },
    // Week 3 (start_date 기준 14~20일)
    { session: 7,  phase: 1, week: 3, writing: { type: 'email',      number: 904 }, speaking: { number: 907 }, dayOffset: 14 },
    { session: 8,  phase: 1, week: 3, writing: { type: 'discussion',  number: 904 }, speaking: { number: 908 }, dayOffset: 16 },
    { session: 9,  phase: 1, week: 3, writing: { type: 'email',      number: 905 }, speaking: { number: 909 }, dayOffset: 18 },
    // Week 4 (start_date 기준 21~27일)
    { session: 10, phase: 1, week: 4, writing: { type: 'discussion',  number: 905 }, speaking: { number: 910 }, dayOffset: 21 },
    { session: 11, phase: 1, week: 4, writing: { type: 'email',      number: 906 }, speaking: { number: 911 }, dayOffset: 23 },
    { session: 12, phase: 1, week: 4, writing: { type: 'discussion',  number: 906 }, speaking: { number: 912 }, dayOffset: 25 },

    // ===== 2학기 / 연장 (phase 2, extension_start_date 기준 — dayOffset 다시 0부터) =====
    // Week 5 (extension_start_date 기준 0~6일)
    { session: 13, phase: 2, week: 5, writing: { type: 'email',      number: 907 }, speaking: { number: 913 }, dayOffset: 0  },
    { session: 14, phase: 2, week: 5, writing: { type: 'discussion',  number: 907 }, speaking: { number: 914 }, dayOffset: 2  },
    { session: 15, phase: 2, week: 5, writing: { type: 'email',      number: 908 }, speaking: { number: 915 }, dayOffset: 4  },
    // Week 6 (extension_start_date 기준 7~13일)
    { session: 16, phase: 2, week: 6, writing: { type: 'discussion',  number: 908 }, speaking: { number: 916 }, dayOffset: 7  },
    { session: 17, phase: 2, week: 6, writing: { type: 'email',      number: 909 }, speaking: { number: 917 }, dayOffset: 9  },
    { session: 18, phase: 2, week: 6, writing: { type: 'discussion',  number: 909 }, speaking: { number: 918 }, dayOffset: 11 },
    // Week 7 (extension_start_date 기준 14~20일)
    { session: 19, phase: 2, week: 7, writing: { type: 'email',      number: 910 }, speaking: { number: 919 }, dayOffset: 14 },
    { session: 20, phase: 2, week: 7, writing: { type: 'discussion',  number: 910 }, speaking: { number: 920 }, dayOffset: 16 },
    { session: 21, phase: 2, week: 7, writing: { type: 'email',      number: 911 }, speaking: { number: 921 }, dayOffset: 18 },
    // Week 8 (extension_start_date 기준 21~27일)
    { session: 22, phase: 2, week: 8, writing: { type: 'discussion',  number: 911 }, speaking: { number: 922 }, dayOffset: 21 },
    { session: 23, phase: 2, week: 8, writing: { type: 'email',      number: 912 }, speaking: { number: 923 }, dayOffset: 23 },
    { session: 24, phase: 2, week: 8, writing: { type: 'discussion',  number: 912 }, speaking: { number: 924 }, dayOffset: 25 },
];

console.log('✅ correction-schedule-data.js 로드 완료 (' + window.CORRECTION_SCHEDULE.length + '세션)');
