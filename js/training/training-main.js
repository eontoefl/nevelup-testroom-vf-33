/**
 * training-main.js — 유형별 트레이닝: 유형 선택 화면, 단위 목록 화면 (상단 TRAINING 모드)
 * 계획서: C:\기능구현\유형별 트레이닝\IMPLEMENTATION_PLAN.md (v2) 4-2·4-3장
 *
 * 일정 화면(#scheduleScreen)의 #trainingScheduleContainer 안에 그린다.
 * 문제 풀이 화면은 training-session.js.
 */
(function () {
    'use strict';

    var state = {
        view: 'types',     // 'types' | 'units'
        type: null,        // 지금 고른 유형 key
        items: {},         // type → 문제 배열
        attempts: null,    // 지금 학생 기록 (type별)
        loadingToken: 0
    };

    function _user() {
        return (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    }

    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function _pad2(n) { return String(n).padStart(2, '0'); }

    function _setHeader(title, desc, icon) {
        var h = document.querySelector('#scheduleScreen .schedule-header');
        if (!h) return;
        h.querySelector('h1').textContent = title;
        h.querySelector('p').textContent = desc;
        var i = h.querySelector('.calendar-icon-box i');
        if (i) i.className = 'fas ' + icon;
    }

    function _container() { return document.getElementById('trainingScheduleContainer'); }

    function _backBtn(show) {
        var b = document.getElementById('trainingBackBtn');
        if (b) b.style.display = show ? '' : 'none';
    }

    /** 유형·학생 기록을 불러온다 (매번 새로 — 다른 기기에서 푼 것도 반영) */
    async function _load(type) {
        var user = _user();
        if (!state.items[type]) state.items[type] = await TrainingData.loadItems(type);
        var attempts = user ? await TrainingData.loadAttempts(user.id, type) : [];
        return { items: state.items[type], attempts: attempts };
    }

    /** 상단 TRAINING 모드가 켜질 때 main.js가 부른다 */
    function render() {
        if (state.view === 'units' && state.type) {
            renderUnits(state.type);
        } else {
            renderTypes();
        }
    }

    // ---------- 유형 선택 ----------
    async function renderTypes() {
        state.view = 'types';
        var token = ++state.loadingToken;
        _setHeader('TRAINING', 'Select a type.', 'fa-dumbbell');
        _backBtn(false);
        var box = _container();
        if (!box) return;

        // 영역(Writing 등)별로 묶어서 카드
        var areas = [];
        TrainingData.TYPES.forEach(function (t) {
            var a = areas.find(function (x) { return x.name === t.area; });
            if (!a) { a = { name: t.area, types: [] }; areas.push(a); }
            a.types.push(t);
        });

        box.innerHTML = areas.map(function (a) {
            return '<div class="week-block">'
                + '<div class="week-header"><h2 class="week-title">' + _esc(a.name) + '</h2><div class="week-divider"></div></div>'
                + a.types.map(function (t) {
                    return '<div class="tr-type" data-type="' + _esc(t.key) + '" role="button" tabindex="0">'
                        + '<div class="tr-type-icon"><i class="fas ' + _esc(t.icon) + '"></i></div>'
                        + '<div class="tr-type-main"><div class="tr-type-name">' + _esc(t.name) + '</div><div class="tr-type-desc">' + _esc(t.desc) + '</div></div>'
                        + '<div class="tr-type-prog"><div class="tr-type-prog-top"><span>Units</span><span class="tr-type-count">… </span></div><div class="tr-bar"><i style="width:0%"></i></div></div>'
                        + '<i class="fas fa-chevron-right tr-type-arrow"></i>'
                        + '</div>';
                }).join('')
                + '</div>';
        }).join('');

        box.querySelectorAll('.tr-type').forEach(function (card) {
            var go = function () { renderUnits(card.getAttribute('data-type')); };
            card.onclick = go;
            card.onkeydown = function (e) { if (e.key === 'Enter') go(); };
        });

        // 진도 막대 채우기 (다 푼 단위 수 / 전체 단위 수)
        for (var i = 0; i < TrainingData.TYPES.length; i++) {
            var t = TrainingData.TYPES[i];
            try {
                var data = await _load(t.key);
                if (token !== state.loadingToken) return;
                var units = TrainingData.summarize(data.items, data.attempts);
                var list = Object.keys(units).map(function (k) { return units[k]; });
                var doneN = list.filter(function (u) { return u.done; }).length;
                var card = box.querySelector('.tr-type[data-type="' + t.key + '"]');
                if (card) {
                    card.querySelector('.tr-type-count').innerHTML = '<b>' + doneN + '</b> / ' + list.length;
                    card.querySelector('.tr-bar i').style.width = (list.length ? Math.round(doneN / list.length * 100) : 0) + '%';
                }
            } catch (e) {
                console.warn('[Training] 진도 불러오기 실패:', e);
            }
        }
    }

    // ---------- 단위 목록 ----------
    async function renderUnits(type) {
        state.view = 'units';
        state.type = type;
        var token = ++state.loadingToken;
        var t = TrainingData.TYPES.find(function (x) { return x.key === type; }) || TrainingData.TYPES[0];
        _setHeader(t.name, 'Select the unit you memorized.', t.icon);
        _backBtn(true);
        var box = _container();
        if (!box) return;
        box.innerHTML = '<div class="tr-loading">Loading…</div>';

        var data;
        try {
            data = await _load(type);
        } catch (e) {
            data = null;
        }
        if (token !== state.loadingToken) return;
        if (!data) {
            box.innerHTML = '<div class="tr-empty">트레이닝 문제를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.</div>';
            return;
        }
        state.attempts = data.attempts;
        var units = TrainingData.summarize(data.items, data.attempts);
        var list = Object.keys(units).map(function (k) { return units[k]; }).sort(function (a, b) { return a.unitNo - b.unitNo; });

        if (list.length === 0) {
            box.innerHTML = '<div class="tr-empty">아직 준비된 트레이닝 문제가 없어요.</div>';
            return;
        }

        box.innerHTML = '<div class="week-block">'
            + '<div class="week-header"><h2 class="week-title">Units</h2><div class="week-divider"></div></div>'
            + '<div class="days-grid practice-days-grid tr-units-grid">'
            + list.map(function (u) {
                var st = u.done ? 'full' : (u.eligible ? 'done' : (u.answeredCount > 0 ? 'part' : 'none'));
                var mark = st === 'full'
                    ? '<span class="tr-check"><i class="fas fa-check"></i></span>'
                    : '<div class="progress-dot ' + (st === 'done' ? 'dot-done' : st === 'part' ? 'tr-dot-part' : 'dot-none') + '"></div>';
                var count = st === 'none' ? '&nbsp;' : '<span class="tr-count ' + (st !== 'part' ? 'done' : '') + '">' + u.answeredCount + ' / ' + u.total + '</span>';
                return '<button class="day-button ' + (st === 'full' ? 'tr-full' : '') + '" data-unit="' + u.unitNo + '">'
                    + '<span class="day-name">' + _pad2(u.unitNo) + '</span>' + mark
                    + '<span class="day-tasks">' + count + '</span></button>';
            }).join('')
            + '</div></div>';

        box.querySelectorAll('.day-button[data-unit]').forEach(function (btn) {
            btn.onclick = function () {
                var u = units[Number(btn.getAttribute('data-unit'))];
                if (!u) return;
                if (u.done) {
                    // 다 푼 단위 → 마지막 결과 화면 먼저 (17장 3번)
                    TrainingSession.showEnd({ type: type, unitNo: u.unitNo, pass: u.lastCompletedPass, units: units, items: data.items, attempts: data.attempts });
                } else {
                    TrainingSession.start({ type: type, unitNo: u.unitNo, pass: 1, own: u.remaining, units: units });
                }
            };
        });
    }

    /** 단위 목록 → 유형 선택 */
    function back() {
        renderTypes();
    }

    /** 문제 화면에서 돌아올 때 */
    function backToUnits() {
        state.view = 'units';
        if (typeof showScreen === 'function') showScreen('scheduleScreen');
    }

    window.TrainingMain = {
        render: render,
        renderTypes: renderTypes,
        renderUnits: renderUnits,
        back: back,
        backToUnits: backToUnits,
        _state: state
    };
})();
