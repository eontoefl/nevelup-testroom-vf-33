/**
 * Australia 학습 스케줄 데이터
 * Fast 프로그램: 4주 과정
 * Standard 프로그램: 8주 과정
 * 
 * DB 연결 없이 하드코딩 데이터만 사용
 * 단어(내벨업보카)는 정규과정과 동일
 */

const AUS_SCHEDULE_DATA = {
    // Fast 프로그램 (4주)
    fast: {
        week1: {
            sunday: [
                "내벨업보카 5, 6, 7pg",
                "입문서 정독 1/3",
                "리딩1"
            ],
            monday: [
                "내벨업보카 8, 9pg",
                "입문서 정독 2/3",
                "리스닝1",
                "리스닝2",
                "리스닝3"
            ],
            tuesday: [
                "내벨업보카 10, 11, 12pg",
                "입문서 정독 3/3",
                "리딩2"
            ],
            wednesday: [
                "내벨업보카 13, 14pg",
                "리딩3",
                "리딩4",
                "리스닝4",
                "리스닝5",
                "브레인스토밍 Day 1"
            ],
            thursday: [
                "내벨업보카 15, 16, 17pg",
                "리딩5",
                "리스닝6",
                "리스닝7",
                "리스닝8",
                "브레인스토밍 Day 2",
                "브레인스토밍 Day 3"
            ],
            friday: [
                "내벨업보카 18, 19pg",
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
                "내벨업보카 20, 21, 22pg",
                "리딩8",
                "리딩9",
                "리스닝11",
                "리스닝12",
                "리스닝13",
                "브레인스토밍 Day 5"
            ],
            monday: [
                "내벨업보카 23, 24pg",
                "리딩10",
                "리스닝14",
                "리스닝15",
                "브레인스토밍 Day 6",
                "브레인스토밍 Day 7"
            ],
            tuesday: [
                "내벨업보카 25, 26, 27pg",
                "리스닝16",
                "리스닝17",
                "리스닝18",
                "통스1",
                "통라1",
                "브레인스토밍 Day 8"
            ],
            wednesday: [
                "내벨업보카 28, 29pg",
                "리스닝19",
                "리스닝20",
                "통스2",
                "통라2",
                "브레인스토밍 Day 9",
                "브레인스토밍 Day 10"
            ],
            thursday: [
                "내벨업보카 30, 31, 32pg",
                "리스닝21",
                "리스닝22",
                "리스닝23",
                "통스3",
                "통라3",
                "브레인스토밍 Day 11"
            ],
            friday: [
                "내벨업보카 33, 34pg",
                "독스 TOPIC 1",
                "독스 TOPIC 2",
                "통스4",
                "통라4",
                "브레인스토밍 Day 12",
                "브레인스토밍 Day 13"
            ],
            saturday: []
        },
        week3: {
            sunday: [
                "내벨업보카 35, 36, 37pg",
                "독스 TOPIC 3",
                "독스 TOPIC 4",
                "통스5",
                "통라5",
                "브레인스토밍 Day 14",
                "브레인스토밍 Day 15"
            ],
            monday: [
                "내벨업보카 38, 39pg",
                "리딩11",
                "리스닝24",
                "리스닝25",
                "토라1",
                "브레인스토밍 Day 16",
                "브레인스토밍 Day 17"
            ],
            tuesday: [
                "내벨업보카 40, 41, 42pg",
                "독스 TOPIC 5",
                "독스 TOPIC 6",
                "통스6",
                "브레인스토밍 Day 18",
                "브레인스토밍 Day 19"
            ],
            wednesday: [
                "내벨업보카 43, 44pg",
                "리딩12",
                "통라6",
                "브레인스토밍 Day 20"
            ],
            thursday: [
                "내벨업보카 45, 46, 47pg",
                "독스 TOPIC 7",
                "독스 TOPIC 8",
                "토라2",
                "토라3",
                "브레인스토밍 Day 21"
            ],
            friday: [
                "내벨업보카 48, 49pg",
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
                "내벨업보카 50, 51, 52pg",
                "리딩14",
                "독스 TOPIC 9",
                "토라4",
                "토라5",
                "브레인스토밍 Day 23"
            ],
            monday: [
                "내벨업보카 53, 54pg",
                "독스 TOPIC 10",
                "독스 TOPIC 11",
                "리스닝29",
                "리스닝30",
                "브레인스토밍 Day 24"
            ],
            tuesday: [
                "내벨업보카 55, 56, 57pg",
                "독스 TOPIC 12",
                "토라6",
                "리스닝31",
                "리스닝32",
                "리스닝33",
                "브레인스토밍 Day 25"
            ],
            wednesday: [
                "내벨업보카 58, 59pg",
                "리딩15",
                "리스닝34",
                "리스닝35",
                "통스7",
                "독스 TOPIC 13",
                "브레인스토밍 Day 26",
                "브레인스토밍 Day 27"
            ],
            thursday: [
                "내벨업보카 60, 61pg",
                "리딩16",
                "토라7",
                "독스 TOPIC 14",
                "통라7",
                "브레인스토밍 Day 28",
                "브레인스토밍 Day 29"
            ],
            friday: [
                "독스 TOPIC 15",
                "통스8",
                "통라8",
                "브레인스토밍 Day 30"
            ],
            saturday: []
        }
    },

    // Standard 프로그램 (8주)
    standard: {
        week1: {
            sunday: ["내벨업보카 5, 6, 7pg", "입문서 정독 1/6"],
            monday: ["내벨업보카 8, 9pg", "입문서 정독 2/6"],
            tuesday: ["내벨업보카 10, 11pg", "입문서 정독 3/6"],
            wednesday: ["내벨업보카 12, 13, 14pg", "입문서 정독 4/6"],
            thursday: ["내벨업보카 15, 16pg", "입문서 정독 5/6"],
            friday: ["내벨업보카 17, 18, 19pg", "입문서 정독 6/6"],
            saturday: []
        },
        week2: {
            sunday: ["내벨업보카 20, 21pg", "리딩1"],
            monday: ["내벨업보카 22, 23pg", "리스닝1"],
            tuesday: ["내벨업보카 24, 25, 26pg", "리딩2"],
            wednesday: ["내벨업보카 27, 28pg", "리스닝2"],
            thursday: ["내벨업보카 29, 30, 31pg", "리딩3"],
            friday: ["내벨업보카 32, 33pg", "리스닝3"],
            saturday: []
        },
        week3: {
            sunday: ["내벨업보카 34, 35pg", "리딩4"],
            monday: ["내벨업보카 36, 37, 38pg", "리스닝4", "리스닝5"],
            tuesday: ["내벨업보카 39, 40pg", "리딩5"],
            wednesday: ["내벨업보카 41, 42pg", "리스닝6", "리스닝7", "리스닝8"],
            thursday: ["내벨업보카 43, 44, 45pg", "리딩6"],
            friday: ["내벨업보카 46, 47pg", "리스닝9", "리스닝10"],
            saturday: []
        },
        week4: {
            sunday: ["내벨업보카 48, 49, 50pg", "리딩7", "리스닝11", "리스닝12", "리스닝13", "브레인스토밍 Day 1"],
            monday: ["내벨업보카 51, 52pg", "통스1", "통라1", "브레인스토밍 Day 2"],
            tuesday: ["내벨업보카 53, 54pg", "리딩8", "리스닝14", "리스닝15", "브레인스토밍 Day 3"],
            wednesday: ["내벨업보카 55, 56, 57pg", "통스2", "통라2", "브레인스토밍 Day 4"],
            thursday: ["내벨업보카 58, 59pg", "리딩9", "리스닝16", "리스닝17", "리스닝18", "브레인스토밍 Day 5"],
            friday: ["내벨업보카 60, 61pg", "통스3", "통라3", "브레인스토밍 Day 6"],
            saturday: []
        },
        week5: {
            sunday: ["내벨업보카 5, 6, 7pg", "리딩10", "독스 TOPIC 1", "브레인스토밍 Day 7"],
            monday: ["내벨업보카 8, 9pg", "통스4", "통라4", "브레인스토밍 Day 8"],
            tuesday: ["내벨업보카 10, 11, 12pg", "리딩11", "리스닝19", "리스닝20", "브레인스토밍 Day 9"],
            wednesday: ["내벨업보카 13, 14pg", "독스 TOPIC 2", "독스 TOPIC 3", "브레인스토밍 Day 10"],
            thursday: ["내벨업보카 15, 16pg", "리딩12", "리스닝21", "리스닝22", "리스닝23", "브레인스토밍 Day 11"],
            friday: ["내벨업보카 17, 18, 19pg", "통스5", "통라5", "브레인스토밍 Day 12"],
            saturday: []
        },
        week6: {
            sunday: ["내벨업보카 20, 21pg", "리딩13", "브레인스토밍 Day 13"],
            monday: ["내벨업보카 22, 23, 24pg", "리스닝24", "리스닝25", "독스 TOPIC 4", "브레인스토밍 Day 14"],
            tuesday: ["내벨업보카 25, 26pg", "통스6", "통라6", "브레인스토밍 Day 15"],
            wednesday: ["내벨업보카 27, 28pg", "리딩14", "독스 TOPIC 5", "브레인스토밍 Day 16"],
            thursday: ["내벨업보카 29, 30, 31pg", "독스 TOPIC 6", "리스닝26", "리스닝27", "리스닝28", "브레인스토밍 Day 17"],
            friday: ["내벨업보카 32, 33pg", "통스7", "통라7", "브레인스토밍 Day 18"],
            saturday: []
        },
        week7: {
            sunday: ["내벨업보카 34, 35pg", "리딩15", "독스 TOPIC 7", "브레인스토밍 Day 19"],
            monday: ["내벨업보카 36, 37, 38pg", "리스닝29", "리스닝30", "독스 TOPIC 8", "브레인스토밍 Day 20"],
            tuesday: ["내벨업보카 39, 40pg", "통스8", "통라8", "브레인스토밍 Day 21"],
            wednesday: ["내벨업보카 41, 42, 43pg", "리딩16", "독스 TOPIC 9", "브레인스토밍 Day 22"],
            thursday: ["내벨업보카 44, 45pg", "리스닝31", "리스닝32", "리스닝33", "독스 TOPIC 10", "브레인스토밍 Day 23"],
            friday: ["내벨업보카 46, 47pg", "독스 TOPIC 11", "토라1", "브레인스토밍 Day 24"],
            saturday: []
        },
        week8: {
            sunday: ["내벨업보카 48, 49, 50pg", "토라2", "브레인스토밍 Day 25"],
            monday: ["내벨업보카 51, 52pg", "독스 TOPIC 12", "토라3", "브레인스토밍 Day 26"],
            tuesday: ["내벨업보카 53, 54, 55pg", "리스닝34", "리스닝35", "토라4", "브레인스토밍 Day 27"],
            wednesday: ["내벨업보카 56, 57pg", "독스 TOPIC 13", "토라5", "브레인스토밍 Day 28"],
            thursday: ["내벨업보카 58, 59pg", "독스 TOPIC 14", "토라6", "브레인스토밍 Day 29"],
            friday: ["내벨업보카 60, 61pg", "독스 TOPIC 15", "토라7", "브레인스토밍 Day 30"],
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
