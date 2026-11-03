/**
 * training-data.js — 유형별 트레이닝: 문제·기록 불러오기, 저장, 진도 계산
 * 계획서: C:\기능구현\유형별 트레이닝\IMPLEMENTATION_PLAN.md (v2)
 *
 * 표 두 개 (기존 정규·연습·호주 기록 표와 따로 — 인증률·주간체크·관리자 화면에 섞이지 않게)
 *   tr_training_items    : 문제 (학생은 읽기만)
 *   tr_training_attempts : 학생 기록. 지우거나 고치지 않고 일어난 일을 한 줄씩 쌓는다(추가만).
 *       event 'check'  = 정답 확인을 누름 (is_correct)
 *       event 'reveal' = 정답·해설 보기를 누름
 *
 * 진도 규칙 (계획서 5장·17장)
 *   - 카드 숫자 = 그 단위 자기 문제 중 "한 번이라도 정답 확인을 누른 서로 다른 문제" 수. 줄어들지 않는다.
 *     그래서 100%를 한 번 채우면 카드 상태가 바뀌지 않는다.
 *   - 80% 이상이면 "풀어 본 단위" → 다른 단위에 섞여 나온다.
 *   - 첫 풀이(1회차): 아직 한 번도 정답 확인을 안 누른 자기 문제가 남은 문제다(이어 풀기).
 *   - 100% 뒤 "다시 풀기": 2회차, 3회차 … 그 회차 안에서 안 푼 자기 문제가 남은 문제다.
 *   - 섞는 수 = 남은 자기 문제 수의 30%(반올림). 들어올 때마다 새로 뽑는다.
 */
(function () {
    'use strict';

    var ITEMS_TABLE = 'tr_training_items';
    var ATTEMPTS_TABLE = 'tr_training_attempts';
    var MIX_RATIO = 0.3;        // 다른 단위에서 섞는 비율 (이 숫자 하나로 조정)
    var ELIGIBLE_RATIO = 0.8;   // "풀어 본 단위" 기준

    // 유형 목록 — 다른 유형이 생기면 여기에 한 줄 추가 (계획서 확정 6·25번)
    var TYPES = [
        { key: 'build_sentence', area: 'Writing', name: 'Build a Sentence', desc: '외운 표현으로 문장 배열 연습', icon: 'fa-pen' }
    ];

    function _arr(v) {
        if (Array.isArray(v)) return v;
        if (typeof v === 'string') {
            var s = v.trim();
            if (s.charAt(0) === '[') { try { return JSON.parse(s); } catch (e) { /* 아래로 */ } }
            return s ? s.split('|') : [];
        }
        return [];
    }

    /** DB 줄 → 화면용 문제 (실전 W1 문제와 같은 모양 + 트레이닝 칸) */
    function toQuestion(row) {
        return {
            itemId: row.item_id,
            type: row.type,
            unitNo: Number(row.unit_no),
            orderNo: Number(row.order_no) || 0,
            groupNo: row.group_no == null ? null : Number(row.group_no),
            givenSentence: row.prompt || '',
            givenTranslation: row.prompt_ko || '',
            presentedWords: _arr(row.presented),
            optionWords: _arr(row.chunks),
            endPunctuation: row.end_punct || '.',
            answerSets: [{ answer: _arr(row.answer), translation: row.answer_ko || '', explanation: row.explanation || '' }],
            highlight: row.highlight || '',
            answerKo: row.answer_ko || '',
            explanation: row.explanation || ''
        };
    }

    async function loadItems(type) {
        var rows = await supabaseSelect(ITEMS_TABLE,
            'type=eq.' + encodeURIComponent(type) + '&order=unit_no.asc,order_no.asc&select=*');
        return (rows || []).map(toQuestion);
    }

    async function loadAttempts(userId, type) {
        var rows = await supabaseSelect(ATTEMPTS_TABLE,
            'user_id=eq.' + encodeURIComponent(userId) + '&type=eq.' + encodeURIComponent(type)
            + '&order=created_at.asc&select=item_id,item_unit_no,session_unit_no,session_pass,event,is_correct,within_time,timer_sec,created_at');
        return rows || [];
    }

    /** 기록 한 줄 추가. 실패하면 한 번 더 시도. 둘 다 실패하면 false */
    async function saveEvent(row) {
        var r = await supabaseInsert(ATTEMPTS_TABLE, row);
        if (r) return true;
        await new Promise(function (res) { setTimeout(res, 800); });
        r = await supabaseInsert(ATTEMPTS_TABLE, row);
        return !!r;
    }

    /** 단위별 진도 계산 */
    function summarize(items, attempts) {
        var units = {};
        items.forEach(function (q) {
            if (!units[q.unitNo]) units[q.unitNo] = { unitNo: q.unitNo, items: [], answered: {}, passes: {} };
            units[q.unitNo].items.push(q);
        });
        var itemUnit = {};
        items.forEach(function (q) { itemUnit[q.itemId] = q.unitNo; });

        attempts.forEach(function (a) {
            if (a.event !== 'check') return;
            var u = units[itemUnit[a.item_id]];
            if (!u) return;  // 지워진 문제의 옛 기록
            u.answered[a.item_id] = true;
            if (Number(a.session_unit_no) === u.unitNo) {
                var p = Number(a.session_pass) || 1;
                if (!u.passes[p]) u.passes[p] = {};
                u.passes[p][a.item_id] = true;
            }
        });

        Object.keys(units).forEach(function (k) {
            var u = units[k];
            u.total = u.items.length;
            u.answeredCount = u.items.filter(function (q) { return u.answered[q.itemId]; }).length;
            u.done = u.total > 0 && u.answeredCount >= u.total;
            u.eligible = u.total > 0 && u.answeredCount >= u.total * ELIGIBLE_RATIO;
            // 회차: 1회차는 "한 번이라도 답한 문제" 기준, 2회차부터는 그 회차 안에서 답한 문제 기준
            var passNos = Object.keys(u.passes).map(Number).filter(function (n) { return n >= 2; });
            u.currentPass = passNos.length ? Math.max.apply(null, passNos) : 1;
            if (u.currentPass === 1) {
                u.remaining = u.items.filter(function (q) { return !u.answered[q.itemId]; });
            } else {
                var inPass = u.passes[u.currentPass] || {};
                u.remaining = u.items.filter(function (q) { return !inPass[q.itemId]; });
            }
            u.passComplete = u.remaining.length === 0;
            // 마지막으로 끝까지 간 회차 (결과 화면용)
            u.lastCompletedPass = u.passComplete ? u.currentPass : (u.currentPass > 1 ? u.currentPass - 1 : (u.done ? 1 : 0));
        });
        return units;
    }

    function _shuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    /** 이번에 풀 문제 목록: 남은 자기 문제 + 풀어 본 다른 단위에서 30% → 함께 섞음 */
    function buildQueue(units, unitNo, ownList) {
        var pool = [];
        Object.keys(units).forEach(function (k) {
            var u = units[k];
            if (u.unitNo !== unitNo && u.eligible) pool = pool.concat(u.items);
        });
        var mixCount = Math.min(pool.length, Math.round(ownList.length * MIX_RATIO));
        var mixed = _shuffle(pool).slice(0, mixCount);
        return _shuffle(ownList.concat(mixed));
    }

    window.TrainingData = {
        TYPES: TYPES,
        MIX_RATIO: MIX_RATIO,
        ELIGIBLE_RATIO: ELIGIBLE_RATIO,
        loadItems: loadItems,
        loadAttempts: loadAttempts,
        saveEvent: saveEvent,
        summarize: summarize,
        buildQueue: buildQueue,
        shuffle: _shuffle,
        toQuestion: toQuestion
    };
})();
