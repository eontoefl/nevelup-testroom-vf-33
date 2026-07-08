/**
 * timezone-utils.js
 * 학생별 타임존 기반 데드라인 계산 유틸리티
 *
 * 모든 데드라인/시간 판정은 이 파일의 함수를 통해 수행.
 * DB에 저장된 학생의 IANA 타임존(예: "Europe/London")을 기준으로
 * 04:00 데드라인을 계산. 타임존 미설정 시 Asia/Seoul 폴백.
 */

/**
 * 현재 유저의 타임존 반환
 * @returns {string} IANA timezone (예: "Asia/Seoul", "Europe/London")
 */
function getUserTimezone() {
    try {
        var user = JSON.parse(sessionStorage.getItem('currentUser'));
        if (user && user.timezone) return user.timezone;
    } catch (e) {}
    return 'Asia/Seoul';
}

/**
 * 특정 타임존에서 "지금 몇 시인지" 반환
 * @param {string} timezone - IANA timezone
 * @returns {object} { year, month, date, hours, minutes, day(요일0-6) }
 */
function getNowInTimezone(timezone) {
    var now = new Date();
    var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(now);

    var obj = {};
    parts.forEach(function(p) {
        if (p.type === 'year') obj.year = parseInt(p.value);
        if (p.type === 'month') obj.month = parseInt(p.value) - 1;
        if (p.type === 'day') obj.date = parseInt(p.value);
        if (p.type === 'hour') obj.hours = parseInt(p.value) === 24 ? 0 : parseInt(p.value);
        if (p.type === 'minute') obj.minutes = parseInt(p.value);
        if (p.type === 'second') obj.seconds = parseInt(p.value);
    });

    // 요일 계산
    var tempDate = new Date(obj.year, obj.month, obj.date);
    obj.day = tempDate.getDay();

    return obj;
}

/**
 * 특정 타임존의 특정 날짜 HH:MM을 UTC Date 객체로 변환
 * @param {number} year
 * @param {number} month - 0-based (JS Date 기준)
 * @param {number} date
 * @param {number} hours
 * @param {number} minutes
 * @param {string} timezone - IANA timezone
 * @returns {Date} UTC 기준 Date 객체
 */
function dateInTimezone(year, month, date, hours, minutes, timezone) {
    // 해당 타임존의 날짜/시간을 ISO 문자열로 만들고 offset 계산
    var target = new Date(Date.UTC(year, month, date, hours, minutes, 0));

    // target을 해당 timezone으로 해석했을 때의 실제 시각을 구함
    var formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });

    // 이진 탐색으로 정확한 UTC 시각 찾기
    // 원리: UTC 시각을 조정해서 해당 timezone으로 변환했을 때 원하는 날짜/시간이 나오게 함
    var low = target.getTime() - 24 * 60 * 60 * 1000;
    var high = target.getTime() + 24 * 60 * 60 * 1000;

    for (var i = 0; i < 30; i++) {
        var mid = Math.floor((low + high) / 2);
        var midDate = new Date(mid);
        var parts = formatter.formatToParts(midDate);
        var p = {};
        parts.forEach(function(part) {
            if (part.type === 'year') p.year = parseInt(part.value);
            if (part.type === 'month') p.month = parseInt(part.value);
            if (part.type === 'day') p.day = parseInt(part.value);
            if (part.type === 'hour') p.hour = parseInt(part.value) === 24 ? 0 : parseInt(part.value);
            if (part.type === 'minute') p.minute = parseInt(part.value);
        });

        var targetVal = year * 100000000 + (month + 1) * 1000000 + date * 10000 + hours * 100 + minutes;
        var midVal = p.year * 100000000 + p.month * 1000000 + p.day * 10000 + p.hour * 100 + p.minute;

        if (midVal === targetVal) return midDate;
        if (midVal < targetVal) low = mid;
        else high = mid;
    }

    return new Date(Math.floor((low + high) / 2));
}

/**
 * 과제 날짜(YYYY-MM-DD or Date)에 대한 데드라인(다음날 04:00) 계산
 * 학생의 타임존 기준으로 계산됨
 *
 * @param {Date|string} taskDate - 과제 날짜
 * @param {string} [timezone] - IANA timezone (생략 시 현재 유저 타임존)
 * @returns {Date} 데드라인 (UTC Date 객체, 비교 가능)
 */
function getTaskDeadline(taskDate, timezone) {
    var tz = timezone || getUserTimezone();

    var td;
    if (typeof taskDate === 'string') {
        var parts = taskDate.split('-');
        td = { year: parseInt(parts[0]), month: parseInt(parts[1]) - 1, date: parseInt(parts[2]) };
    } else {
        // Date 객체 → 타임존 무관하게 날짜 부분만 추출
        // taskDate는 startDate 기준으로 setDate()로 만들어진 로컬 Date이므로 그대로 사용
        td = { year: taskDate.getFullYear(), month: taskDate.getMonth(), date: taskDate.getDate() };
    }

    // 다음날 04:00
    var nextDay = new Date(td.year, td.month, td.date + 1);
    return dateInTimezone(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate(), 4, 0, tz);
}

/**
 * "오늘의 유효 날짜" 계산 (새벽 4시 전이면 전날로 취급)
 * 학생의 타임존 기준
 *
 * @param {string} [timezone] - IANA timezone (생략 시 현재 유저 타임존)
 * @returns {Date} effectiveToday (시분초는 00:00:00, 로컬 Date 객체)
 */
function getEffectiveToday(timezone) {
    var tz = timezone || getUserTimezone();
    var nowTz = getNowInTimezone(tz);

    var y = nowTz.year;
    var m = nowTz.month;
    var d = nowTz.date;

    // 04시 전이면 전날로 취급
    if (nowTz.hours < 4) {
        var prev = new Date(y, m, d - 1);
        y = prev.getFullYear();
        m = prev.getMonth();
        d = prev.getDate();
    }

    var result = new Date(y, m, d);
    result.setHours(0, 0, 0, 0);
    return result;
}

/**
 * 현재 시각이 데드라인을 지났는지 판정
 * @param {Date} deadline - getTaskDeadline() 반환값
 * @returns {boolean}
 */
function isDeadlinePassed(deadline) {
    return new Date() > deadline;
}

/**
 * 자기주도 학생이 "마지막으로 풀 수 있는 날" (표시용 날짜)
 * = 시작일 + N주(self_paced_weeks), 시작 요일과 동일. 이 날은 하루 종일 풀이 가능.
 *   예) 금요일 시작 + 2주 → 마지막 풀이일 = 2주 뒤 금요일
 * 실제 잠금은 이 날 "다음날 04:00" → getSelfPacedExpiry() 참고.
 * @param {object} user - selfPaced / selfPacedWeeks / startDate 보유한 유저 객체
 * @returns {Date|null} 마지막 풀이 가능일(로컬 00:00), 정보 부족 시 null
 */
function getSelfPacedDeadlineDay(user) {
    if (!user || !user.selfPaced || !user.startDate) return null;
    // v2(압축+매일마감): 종료일이 직접 지정돼 있으면 그 날짜가 마지막 풀이 가능일.
    if (user.selfPacedEndDate) {
        var end = new Date(user.selfPacedEndDate + 'T00:00:00');
        return isNaN(end.getTime()) ? null : end;
    }
    // v1(구 무마감): 시작일 + N주.
    if (!user.selfPacedWeeks) return null;
    var start = new Date(user.startDate + 'T00:00:00');
    if (isNaN(start.getTime())) return null;
    var lastDay = new Date(start);
    lastDay.setDate(lastDay.getDate() + (user.selfPacedWeeks * 7));
    return lastDay;
}

/**
 * 자기주도(self-paced) 학생의 완료 기한(만료=잠금) 시점 계산
 * 잠금 = "마지막 풀이 가능일"의 다음날 04:00 (과제 마감과 동일 규칙).
 *   예) 금요일 시작 + 2주 → 마지막 풀이일 = 2주 뒤 금요일, 잠금 = 그 다음날(토) 04:00
 *   → 마지막 풀이일 하루 종일 풀이·기록 가능.
 * @param {object} user - selfPaced / selfPacedWeeks / startDate 보유한 유저 객체
 * @param {string} [timezone] - IANA timezone
 * @returns {Date|null} 만료(잠금) 시점, 자기주도 아니거나 정보 부족 시 null
 */
function getSelfPacedExpiry(user, timezone) {
    var tz = timezone || getUserTimezone();
    var lastDay = getSelfPacedDeadlineDay(user);
    if (!lastDay) return null;
    return getTaskDeadline(lastDay, tz);
}

/**
 * 자기주도 학생의 완료 기한이 지났는지 판정 (만료 후 = 인증 마감, 복습만 가능)
 * @param {object} user
 * @param {string} [timezone]
 * @returns {boolean}
 */
function isSelfPacedExpired(user, timezone) {
    var expiry = getSelfPacedExpiry(user, timezone);
    if (!expiry) return false;
    return new Date() >= expiry;
}

// ================================================================
// 자기주도 v2 — 압축 일정 계산기 (Set → 배정 날짜)
// gate = 종료일(selfPacedEndDate)이 있으면 v2. 없으면 구(무마감) 방식.
// 자기주도는 항상 fast 24세트 고정. 슬롯 순서 = 주1~4 × [일,월,화,수,목,금].
// 이 계산기가 카드 날짜 / 오늘 강조 / 세트별 마감 / 인증률 동결의 단일 진실원.
// ================================================================

var SELF_PACED_SET_COUNT = 24;
var SELF_PACED_DAYS_PER_WEEK = 6;

/**
 * v2(압축+매일마감) 모드 여부 = 자기주도 + 종료일 + 시작일이 모두 있을 때.
 * @param {object} user
 * @returns {boolean}
 */
function isSelfPacedV2(user) {
    return !!(user && user.selfPaced && user.selfPacedEndDate && user.startDate);
}

/** 요일 표기(한글/영문/숫자)를 0(일)~5(금) 인덱스로 정규화. 알 수 없으면 null. */
function _selfPacedDayIndex(day) {
    if (typeof day === 'number') return (day >= 0 && day <= 5) ? day : null;
    var kr = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5 };
    var en = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 };
    if (day == null) return null;
    if (kr[day] != null) return kr[day];
    var low = String(day).toLowerCase();
    return (en[low] != null) ? en[low] : null;
}

/** N개 세트를 D일에 균등 분배한 하루별 세트 수 배열. 무거운 날은 앞쪽에 흩뿌려 마지막 날을 가볍게. */
function _distributeSetCounts(N, D) {
    var base = Math.floor(N / D);
    var extra = N - base * D; // (base+1)개인 날 수
    var counts = [];
    for (var i = 0; i < D; i++) counts.push(base);
    if (extra > 0) {
        var span = (extra <= D - 1) ? (D - 1) : D;
        for (var k = 0; k < extra; k++) {
            var idx = Math.floor((k + 0.5) * span / extra);
            if (idx > D - 1) idx = D - 1;
            counts[idx] += 1;
        }
    }
    return counts;
}

/** 하루별 세트 수(counts)를 start부터 이어붙여 세트별 배정 날짜(Date[]) 생성. */
function _datesFromCounts(start, counts, N) {
    var dates = [];
    var c = 0;
    for (var i = 0; i < counts.length && c < N; i++) {
        var d = new Date(start);
        d.setDate(d.getDate() + i);
        for (var j = 0; j < counts[i] && c < N; j++) { dates.push(d); c++; }
    }
    return dates;
}

/** 저장된 확정 일정표(문자열/객체) 정규화. 유효(24개 날짜)하면 {end, dates[]} 반환, 아니면 null. */
function _parseStoredSelfPacedSchedule(raw) {
    if (!raw) return null;
    var obj = raw;
    if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch (e) { return null; } }
    if (!obj || !Array.isArray(obj.dates) || obj.dates.length !== SELF_PACED_SET_COUNT) return null;
    return obj;
}

/**
 * v2 자기주도 일정표 (세트 → 배정 날짜).
 * ★ 저장된 확정 일정표(user.selfPacedSchedule)가 있으면 그걸 단일 진실원으로 사용 → 화면이 흔들리지 않음.
 *   없으면 시작~종료일로 실시간 계산(fallback) → 미저장/기존 학생도 안전.
 * 실시간 계산: 24개 세트를 양끝 포함 일수에 균등 분배, 마지막 날은 가볍게. 종료일<시작일이면 null.
 * @param {object} user - selfPaced / selfPacedEndDate / startDate (+ 선택: selfPacedSchedule)
 * @returns {{dates: Date[], counts: number[]|null, start: Date, end: Date, days: number, materialized?: boolean}|null}
 */
function getSelfPacedSchedule(user) {
    if (!isSelfPacedV2(user)) return null;
    var start = new Date(user.startDate + 'T00:00:00');
    var end = new Date(user.selfPacedEndDate + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

    // 1) 저장된 확정 일정표 우선
    var stored = _parseStoredSelfPacedSchedule(user.selfPacedSchedule);
    if (stored) {
        var sdates = [];
        var ok = true;
        for (var si = 0; si < stored.dates.length; si++) {
            var pd = new Date(stored.dates[si] + 'T00:00:00');
            if (isNaN(pd.getTime())) { ok = false; break; }
            sdates.push(pd);
        }
        if (ok) {
            var sEnd = new Date((stored.end || user.selfPacedEndDate) + 'T00:00:00');
            if (isNaN(sEnd.getTime())) sEnd = end;
            var sStart = sdates[0];
            var sDays = Math.floor((sEnd - sStart) / 86400000) + 1;
            return { dates: sdates, counts: null, start: sStart, end: sEnd, days: sDays, materialized: true };
        }
        // 저장표 손상 시 아래 실시간 계산으로 폴백
    }

    // 2) 실시간 계산 (fallback)
    var D = Math.floor((end - start) / 86400000) + 1; // 양끝 포함 일수
    if (D < 1) return null; // 종료일 < 시작일 → 방어
    var counts = _distributeSetCounts(SELF_PACED_SET_COUNT, D);
    var dates = _datesFromCounts(start, counts, SELF_PACED_SET_COUNT);
    return { dates: dates, counts: counts, start: start, end: end, days: D };
}

/**
 * 확정 일정표 생성/갱신(materialize). 로그인 시 auth.js가 호출해 DB에 저장.
 * - 이전 일정표 없음(첫 생성): 시작~종료 전체에 24세트 균등 분배.
 * - 이전 일정표 있음(종료일 변경): boundary(오늘) 이전 세트는 그대로 보존, 나머지만 [오늘~종료]에 재분배.
 *   → "과거 불변, 미래만 재분배"를 구조로 보장.
 * @param {object} user
 * @param {string[]|null} prevDates - 이전 저장 dates (YYYY-MM-DD 24개) 또는 null
 * @param {Date} boundary - 오늘 00:00 (유효 오늘)
 * @returns {{end:string, dates:string[]}|null}
 */
function buildMaterializedSelfPacedSchedule(user, prevDates, boundary) {
    if (!isSelfPacedV2(user)) return null;
    var start = new Date(user.startDate + 'T00:00:00');
    var end = new Date(user.selfPacedEndDate + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    var N = SELF_PACED_SET_COUNT;
    var fmt = function(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };

    // 첫 생성: 전체 균등 분배
    if (!prevDates || prevDates.length !== N) {
        var D = Math.floor((end - start) / 86400000) + 1;
        if (D < 1) return null;
        var counts = _distributeSetCounts(N, D);
        return { end: fmt(end), dates: _datesFromCounts(start, counts, N).map(fmt) };
    }

    // 종료일 변경: 과거(오늘 이전) 세트 보존 + 나머지 재분배.
    // dates는 오름차순이므로 과거는 항상 접두구간 → 첫 미래 세트에서 멈춤.
    var P = 0;
    for (var p = 0; p < prevDates.length; p++) {
        var ppd = new Date(prevDates[p] + 'T00:00:00');
        if (!isNaN(ppd.getTime()) && ppd.getTime() < boundary.getTime()) P++;
        else break;
    }
    if (P >= N) return { end: fmt(end), dates: prevDates.slice() }; // 전부 과거 → 보존만
    var R = N - P;
    var wStart = new Date(boundary);
    var D2 = Math.floor((end - wStart) / 86400000) + 1;
    var remDates;
    if (D2 < 1) {
        // 창 붕괴(종료일이 오늘 이전) → 남은 세트를 종료일에 몰아 배치(방어)
        remDates = [];
        for (var r = 0; r < R; r++) remDates.push(fmt(end));
    } else {
        remDates = _datesFromCounts(wStart, _distributeSetCounts(R, D2), R).map(fmt);
    }
    return { end: fmt(end), dates: prevDates.slice(0, P).concat(remDates) };
}

/**
 * 특정 세트(주,요일)의 배정 날짜. v2가 아니거나 정보 부족 시 null.
 * @param {object} user
 * @param {number} week - 1~4
 * @param {string|number} day - 한글/영문 요일 또는 0~5
 * @returns {Date|null}
 */
function getSelfPacedSetDate(user, week, day) {
    var sched = getSelfPacedSchedule(user);
    if (!sched || !week) return null;
    var di = _selfPacedDayIndex(day);
    if (di == null) return null;
    var setIndex = (week - 1) * SELF_PACED_DAYS_PER_WEEK + di; // 0-based
    if (setIndex < 0 || setIndex >= sched.dates.length) return null;
    return sched.dates[setIndex];
}

/**
 * 자기주도 v2 — 특정 세트(주,요일)의 "연장까지 반영한 최종 마감시각".
 * 세트→배정날짜→기본마감(다음날 04:00)→연장 적용을 한 곳에서 처리하는 단일 진실원.
 * 마감 판정(task-router)·인증률 동결(auth)·잔디 빨간칸(mypage)이 모두 이 함수를 사용한다.
 * 연장정보는 호출 컨텍스트마다 저장 위치가 다르므로(window._deadlineExtensions / mpDeadlineExtensions)
 * 전역을 직접 읽지 않고 "받아서" 쓴다 → 어느 페이지에서든 동일하게 동작.
 * @param {object} user - selfPaced / selfPacedEndDate / startDate 보유
 * @param {number} week - 1~4
 * @param {string|number} day - 한글/영문 요일 또는 0~5
 * @param {Array} [extensions] - tr_deadline_extensions 목록 (호출자가 보유한 배열)
 * @param {string} [timezone] - IANA timezone (미지정 시 getUserTimezone())
 * @returns {Date|null} 연장 반영 마감 Date, 계산 불가 시 null
 */
function getSelfPacedSetDeadline(user, week, day, extensions, timezone) {
    var setDate = getSelfPacedSetDate(user, week, day);
    if (!setDate) return null;
    var tz = timezone || ((typeof getUserTimezone === 'function') ? getUserTimezone() : undefined);
    var deadline = getTaskDeadline(setDate, tz);
    var dStr = setDate.getFullYear() + '-' +
        String(setDate.getMonth() + 1).padStart(2, '0') + '-' +
        String(setDate.getDate()).padStart(2, '0');
    var ext = (extensions || []).find(function(e) { return e.original_date === dStr; });
    if (ext) {
        deadline = new Date(deadline.getTime() + (ext.extra_days || 1) * 24 * 60 * 60 * 1000);
    }
    return deadline;
}

/**
 * 오늘(유효 오늘) 배정된 세트들의 1-based 인덱스 목록 (오늘 카드 강조용).
 * @param {object} user
 * @param {string} [timezone]
 * @returns {number[]}
 */
function getSelfPacedTodaySets(user, timezone) {
    var sched = getSelfPacedSchedule(user);
    if (!sched) return [];
    var tz = timezone || getUserTimezone();
    var today = getEffectiveToday(tz);
    today.setHours(0, 0, 0, 0);
    var todayMs = today.getTime();
    var out = [];
    for (var s = 0; s < sched.dates.length; s++) {
        var dd = new Date(sched.dates[s]);
        dd.setHours(0, 0, 0, 0);
        if (dd.getTime() === todayMs) out.push(s + 1);
    }
    return out;
}

/**
 * 첨삭 활성화 판정용: 유효한 오늘이 특정 날짜 이후인지 확인
 * @param {string} targetDateStr - 비교 날짜 (YYYY-MM-DD)
 * @param {string} [timezone] - IANA timezone
 * @returns {boolean}
 */
function isEffectiveTodayOnOrAfter(targetDateStr, timezone) {
    var tz = timezone || getUserTimezone();
    var effective = getEffectiveToday(tz);
    var target = new Date(targetDateStr + 'T00:00:00');
    target.setHours(0, 0, 0, 0);
    return effective >= target;
}

console.log('✅ timezone-utils.js 로드 완료');
