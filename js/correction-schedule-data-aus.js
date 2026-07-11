/**
 * correction-schedule-data-aus.js
 * 호주첨삭 스케줄 하드코딩 데이터 (12세션)
 *
 * 일반첨삭(correction-schedule-data.js)과 뼈대는 동일:
 *   - 세션당 Writing 1 + Speaking 1
 *   - dayOffset: start_date(일요일) 기준 오프셋 0,2,4 / 7,9,11 / 14,16,18 / 21,23,25
 *   - 1차 draft: dayOffset 당일 ~ 다음날 04:00
 *   - 2차 draft: dayOffset+1일 ~ 그 다음날 04:00
 *
 * 유형만 다름:
 *   Writing  — 토라(aus_discussion) / 통라(aus_intwrt)
 *   Speaking — 독스(aus_indspk) / 통스2·3·4(aus_intspk)
 *
 * ready:false = 문제 화면 미구현 → 카드가 "준비 중"으로 잠김.
 *
 * 문항 번호 구역 (전 과정 공통 규칙):
 *   0001~0899  정규
 *   0901~1999  일반첨삭
 *   2000~2999  호주첨삭  ← 여기
 * DISCUSSION은 2001~2006 제작 완료. 나머지 유형은 문항 제작 대기 중.
 */

// 유형 정의 (라벨 · task_type)
var AUS_CORR_TYPES = {
    torah:  { key: 'aus_discussion', taskType: 'writing_aus_discussion',   label: 'DISCUSSION', ready: true  },
    tongra: { key: 'aus_intwrt',     taskType: 'writing_aus_integrated',   label: 'INT WRT',    ready: true  },
    doks:   { key: 'aus_indspk',     taskType: 'speaking_aus_independent', label: 'IND SPK',    ready: true  },
    ts2:    { key: 'aus_intspk2',    taskType: 'speaking_aus_int2',        label: 'INT SPK 2',  ready: true  },
    ts3:    { key: 'aus_intspk3',    taskType: 'speaking_aus_int3',        label: 'INT SPK 3',  ready: true  },
    ts4:    { key: 'aus_intspk4',    taskType: 'speaking_aus_int4',        label: 'INT SPK 4',  ready: true  }
};

function _ausCorrTask(typeKey, number) {
    var t = AUS_CORR_TYPES[typeKey];
    return {
        type: t.key,
        taskType: t.taskType,
        label: t.label,
        ready: t.ready,
        number: number
    };
}

// INT SPK 2·3·4는 aus_intspk 한 테이블을 공유한다 (유형은 type 컬럼이 구분).
// 번호가 겹치면 안 되므로 유형별로 시작점을 벌려 둔다:
//   INT SPK 2 → 2001, 2002, 2003 ...
//   INT SPK 3 → 2101, 2102, 2103 ...
//   INT SPK 4 → 2201, 2202, 2203 ...
// 독스(aus_indspk) · 통라(aus_intwrt) · 토라(tr_writing_discussion)는
// 각각 다른 테이블이라 2001부터 그대로 쓴다.

window.CORRECTION_SCHEDULE_AUS = [
    // Week 1
    { session: 1,  phase: 1, week: 1, dayOffset: 0,  speaking: _ausCorrTask('doks',   2001), writing: _ausCorrTask('torah',  2001) },
    { session: 2,  phase: 1, week: 1, dayOffset: 2,  speaking: _ausCorrTask('ts2',    2001), writing: _ausCorrTask('tongra', 2001) },
    { session: 3,  phase: 1, week: 1, dayOffset: 4,  speaking: _ausCorrTask('ts3',    2101), writing: _ausCorrTask('torah',  2002) },
    // Week 2
    { session: 4,  phase: 1, week: 2, dayOffset: 7,  speaking: _ausCorrTask('ts4',    2201), writing: _ausCorrTask('tongra', 2002) },
    { session: 5,  phase: 1, week: 2, dayOffset: 9,  speaking: _ausCorrTask('doks',   2002), writing: _ausCorrTask('torah',  2003) },
    { session: 6,  phase: 1, week: 2, dayOffset: 11, speaking: _ausCorrTask('ts2',    2002), writing: _ausCorrTask('tongra', 2003) },
    // Week 3
    { session: 7,  phase: 1, week: 3, dayOffset: 14, speaking: _ausCorrTask('ts3',    2102), writing: _ausCorrTask('torah',  2004) },
    { session: 8,  phase: 1, week: 3, dayOffset: 16, speaking: _ausCorrTask('ts4',    2202), writing: _ausCorrTask('tongra', 2004) },
    { session: 9,  phase: 1, week: 3, dayOffset: 18, speaking: _ausCorrTask('doks',   2003), writing: _ausCorrTask('torah',  2005) },
    // Week 4
    { session: 10, phase: 1, week: 4, dayOffset: 21, speaking: _ausCorrTask('ts2',    2003), writing: _ausCorrTask('tongra', 2005) },
    { session: 11, phase: 1, week: 4, dayOffset: 23, speaking: _ausCorrTask('ts3',    2103), writing: _ausCorrTask('torah',  2006) },
    { session: 12, phase: 1, week: 4, dayOffset: 25, speaking: _ausCorrTask('ts4',    2203), writing: _ausCorrTask('tongra', 2006) }
];

console.log('✅ correction-schedule-data-aus.js 로드 완료 (' + window.CORRECTION_SCHEDULE_AUS.length + '세션)');
