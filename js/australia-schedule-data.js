/**
 * Australia 학습 스케줄 데이터
 * Fast 프로그램: 4주 과정
 * Standard 프로그램: 8주 과정
 * 
 * DB 연결 없이 하드코딩 데이터만 사용
 */

const AUS_SCHEDULE_DATA = {
    // Fast 프로그램 (4주)
    fast: {
        week1: {
            sunday: [
                "단어 2페이지",
                "일문서 정독 1/3",
                "리딩1"
            ],
            monday: [
                "단어 2페이지",
                "일문서 정독 2/3",
                "리스닝1",
                "리스닝2",
                "리스닝3"
            ],
            tuesday: [
                "단어 2페이지",
                "일문서 정독 3/3",
                "리딩2"
            ],
            wednesday: [
                "단어 2페이지",
                "리딩3",
                "리딩4",
                "리스닝4",
                "리스닝5",
                "브레인스토밍 Day 1"
            ],
            thursday: [
                "단어 2페이지",
                "리딩5",
                "리스닝6",
                "리스닝7",
                "리스닝8",
                "브레인스토밍 Day 2",
                "브레인스토밍 Day 3"
            ],
            friday: [
                "단어 2페이지",
                "리딩6",
                "리딩7",
                "리스닝9",
                "리스닝10",
                "브레인스토밍 Day 4"
            ],
            saturday: []
        },
        week2: {
            sunday: [
                "단어 2페이지",
                "리딩8",
                "리딩9",
                "리스닝11",
                "리스닝12",
                "리스닝13",
                "브레인스토밍 Day 5"
            ],
            monday: [
                "단어 2페이지",
                "리딩10",
                "리스닝14",
                "리스닝15",
                "브레인스토밍 Day 6",
                "브레인스토밍 Day 7"
            ],
            tuesday: [
                "단어 2페이지",
                "리스닝16",
                "리스닝17",
                "리스닝18",
                "통스1",
                "토라1",
                "브레인스토밍 Day 8"
            ],
            wednesday: [
                "단어 2페이지",
                "리스닝19",
                "리스닝20",
                "통스2",
                "토라2",
                "브레인스토밍 Day 9",
                "브레인스토밍 Day 10"
            ],
            thursday: [
                "단어 2페이지",
                "리스닝21",
                "리스닝22",
                "리스닝23",
                "통스3",
                "토라3",
                "브레인스토밍 Day 11"
            ],
            friday: [
                "단어 2페이지",
                "통스 TOPIC 1",
                "통스 TOPIC 2",
                "통스4",
                "토라4",
                "브레인스토밍 Day 12",
                "브레인스토밍 Day 13"
            ],
            saturday: []
        },
        week3: {
            sunday: [
                "단어 2페이지",
                "통스 TOPIC 3",
                "통스 TOPIC 4",
                "통스5",
                "토라5",
                "브레인스토밍 Day 14",
                "브레인스토밍 Day 15"
            ],
            monday: [
                "단어 2페이지",
                "리딩11",
                "리스닝24",
                "리스닝25",
                "토라 1",
                "브레인스토밍 Day 16",
                "브레인스토밍 Day 17"
            ],
            tuesday: [
                "단어 2페이지",
                "통스 TOPIC 5",
                "통스 TOPIC 6",
                "통스6",
                "브레인스토밍 Day 18",
                "브레인스토밍 Day 19"
            ],
            wednesday: [
                "단어 2페이지",
                "리딩12",
                "토라6",
                "브레인스토밍 Day 20"
            ],
            thursday: [
                "단어 2페이지",
                "통스 TOPIC 7",
                "통스 TOPIC 8",
                "토라 2",
                "토라 3",
                "브레인스토밍 Day 21"
            ],
            friday: [
                "단어 2페이지",
                "리딩13",
                "리스닝26",
                "리스닝27",
                "리스닝28",
                "브레인스토밍 Day 22"
            ],
            saturday: []
        },
        week4: {
            sunday: [
                "단어 2페이지",
                "리딩14",
                "통스 TOPIC 9",
                "토라 4",
                "토라 5",
                "브레인스토밍 Day 23"
            ],
            monday: [
                "단어 2페이지",
                "통스 TOPIC 10",
                "통스 TOPIC 11",
                "리스닝29",
                "리스닝30",
                "브레인스토밍 Day 24"
            ],
            tuesday: [
                "단어 2페이지",
                "통스 TOPIC 12",
                "토라 6",
                "리스닝31",
                "리스닝32",
                "리스닝33",
                "브레인스토밍 Day 25"
            ],
            wednesday: [
                "단어 2페이지",
                "리딩15",
                "리스닝34",
                "리스닝35",
                "통스7",
                "통스 TOPIC 13",
                "브레인스토밍 Day 26",
                "브레인스토밍 Day 27"
            ],
            thursday: [
                "단어 2페이지",
                "리딩16",
                "토라 7",
                "통스 TOPIC 14",
                "토라7",
                "브레인스토밍 Day 28",
                "브레인스토밍 Day 29"
            ],
            friday: [
                "단어 2페이지",
                "리딩17",
                "통스 TOPIC 15",
                "통스8",
                "토라8",
                "브레인스토밍 Day 30"
            ],
            saturday: []
        }
    },

    // Standard 프로그램 (8주)
    standard: {
        week1: {
            sunday: ["단어 2페이지", "입문서 정독 1/6"],
            monday: ["단어 2페이지", "입문서 정독 2/6"],
            tuesday: ["단어 2페이지", "입문서 정독 3/6"],
            wednesday: ["단어 2페이지", "입문서 정독 4/6"],
            thursday: ["단어 2페이지", "입문서 정독 5/6"],
            friday: ["단어 2페이지", "입문서 정독 6/6"],
            saturday: []
        },
        week2: {
            sunday: ["단어 2페이지", "리딩1"],
            monday: ["단어 2페이지", "리스닝1"],
            tuesday: ["단어 2페이지", "리딩2"],
            wednesday: ["단어 2페이지", "리스닝2"],
            thursday: ["단어 2페이지", "리딩3"],
            friday: ["단어 2페이지", "리스닝3"],
            saturday: []
        },
        week3: {
            sunday: ["단어 2페이지", "리딩4"],
            monday: ["단어 2페이지", "리스닝4", "리스닝5"],
            tuesday: ["단어 2페이지", "리딩5"],
            wednesday: ["단어 2페이지", "리스닝6", "리스닝7", "리스닝8"],
            thursday: ["단어 2페이지", "리딩6"],
            friday: ["단어 2페이지", "리스닝9", "리스닝10"],
            saturday: []
        },
        week4: {
            sunday: ["단어 2페이지", "리딩7", "리스닝11", "리스닝12", "리스닝13", "브레인스토밍 Day 1"],
            monday: ["단어 2페이지", "통스1", "토라1", "브레인스토밍 Day 2"],
            tuesday: ["단어 2페이지", "리딩8", "리스닝14", "리스닝15", "브레인스토밍 Day 3"],
            wednesday: ["단어 2페이지", "통스2", "토라2", "브레인스토밍 Day 4"],
            thursday: ["단어 2페이지", "리딩9", "리스닝16", "리스닝17", "리스닝18", "브레인스토밍 Day 5"],
            friday: ["단어 2페이지", "통스3", "토라3", "브레인스토밍 Day 6"],
            saturday: []
        },
        week5: {
            sunday: ["단어 2페이지", "리딩10", "통스 TOPIC 1", "브레인스토밍 Day 7"],
            monday: ["단어 2페이지", "통스4", "토라4", "브레인스토밍 Day 8"],
            tuesday: ["단어 2페이지", "리딩11", "리스닝19", "리스닝20", "브레인스토밍 Day 9"],
            wednesday: ["단어 2페이지", "통스 TOPIC 2", "통스 TOPIC 3", "브레인스토밍 Day 10"],
            thursday: ["단어 2페이지", "리딩12", "리스닝21", "리스닝22", "리스닝23", "브레인스토밍 Day 11"],
            friday: ["단어 2페이지", "통스5", "토라5", "브레인스토밍 Day 12"],
            saturday: []
        },
        week6: {
            sunday: ["단어 2페이지", "리딩13", "브레인스토밍 Day 13"],
            monday: ["단어 2페이지", "리스닝24", "리스닝25", "통스 TOPIC 4", "브레인스토밍 Day 14"],
            tuesday: ["단어 2페이지", "통스6", "토라6", "브레인스토밍 Day 15"],
            wednesday: ["단어 2페이지", "리딩14", "통스 TOPIC 5", "브레인스토밍 Day 16"],
            thursday: ["단어 2페이지", "통스 TOPIC 6", "리스닝26", "리스닝27", "리스닝28", "브레인스토밍 Day 17"],
            friday: ["단어 2페이지", "통스7", "토라7", "브레인스토밍 Day 18"],
            saturday: []
        },
        week7: {
            sunday: ["단어 2페이지", "리딩15", "통스 TOPIC 7", "브레인스토밍 Day 19"],
            monday: ["단어 2페이지", "리스닝29", "리스닝30", "통스 TOPIC 8", "브레인스토밍 Day 20"],
            tuesday: ["단어 2페이지", "통스8", "토라8", "브레인스토밍 Day 21"],
            wednesday: ["단어 2페이지", "리딩16", "통스 TOPIC 9", "브레인스토밍 Day 22"],
            thursday: ["단어 2페이지", "리스닝31", "리스닝32", "리스닝33", "통스 TOPIC 10", "브레인스토밍 Day 23"],
            friday: ["단어 2페이지", "통스 TOPIC 11", "토라 1", "브레인스토밍 Day 24"],
            saturday: []
        },
        week8: {
            sunday: ["단어 2페이지", "리딩17", "토라 2", "브레인스토밍 Day 25"],
            monday: ["단어 2페이지", "통스 TOPIC 12", "토라 3", "브레인스토밍 Day 26"],
            tuesday: ["단어 2페이지", "리스닝34", "리스닝35", "토라 4", "브레인스토밍 Day 27"],
            wednesday: ["단어 2페이지", "통스 TOPIC 13", "토라 5", "브레인스토밍 Day 28"],
            thursday: ["단어 2페이지", "통스 TOPIC 14", "토라 6", "브레인스토밍 Day 29"],
            friday: ["단어 2페이지", "통스 TOPIC 15", "토라 7", "브레인스토밍 Day 30"],
            saturday: []
        }
    }
};

/**
 * Australia 프로그램과 주차에 해당하는 스케줄 가져오기
 * @param {string} program - 'fast' 또는 'standard'
 * @param {number} week - 주차 번호 (1-4 또는 1-8)
 * @returns {Object} - 해당 주차의 스케줄
 */
function getAusWeekSchedule(program, week) {
    const programData = AUS_SCHEDULE_DATA[program];
    if (!programData) return null;
    const weekKey = `week${week}`;
    return programData[weekKey] || null;
}

/**
 * Australia 특정 날짜의 과제 목록 가져오기
 * @param {string} program - 'fast' 또는 'standard'
 * @param {number} week - 주차 번호
 * @param {string} day - 요일 영문명 (sunday, monday, ...)
 * @returns {Array} - 과제명 배열
 */
function getAusDayTasks(program, week, day) {
    const weekSchedule = getAusWeekSchedule(program, week);
    if (!weekSchedule) return [];
    return weekSchedule[day] || [];
}
