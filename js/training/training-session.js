/**
 * training-session.js — 유형별 트레이닝: 문제 풀이 화면 (#trainingScreen)과 마지막 결과 화면
 * 계획서: C:\기능구현\유형별 트레이닝\IMPLEMENTATION_PLAN.md (v2) 4-4~4-7, 5장, 16-6, 17장
 *
 * - 조각 놓기·빼기·채점·화면 HTML은 실전 W1과 같은 arrange-core.js를 쓴다.
 * - 실전 W1과 다른 점: 타이머 기본 꺼짐(원하면 40초/1분), 한 문제마다 정답 확인 → 바로 결과·해설,
 *   정답은 하나, 조각 순서는 문제를 보여줄 때마다 섞음, 다시 풀기 횟수 제한 없음.
 * - 정답 확인·정답 보기를 누를 때마다 바로 기록을 저장한다(이어 풀기·80% 판정에 필요).
 */
(function () {
    'use strict';

    var TIMER_OPTIONS = { off: 0, '40': 40, '60': 60 };

    var S = null;          // 지금 풀이 상태
    var timerTick = null;

    function _user() {
        return (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    }
    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function _pad2(n) { return String(n).padStart(2, '0'); }
    function $(id) { return document.getElementById(id); }

    // ---------- 타이머 설정 기억 (브라우저, 학생별) ----------
    function _timerKey() { var u = _user(); return 'trTimer:' + (u ? u.id : 'guest'); }
    function _loadTimerMode() {
        try { var v = localStorage.getItem(_timerKey()); return TIMER_OPTIONS.hasOwnProperty(v) ? v : 'off'; } catch (e) { return 'off'; }
    }
    function _saveTimerMode(v) { try { localStorage.setItem(_timerKey(), v); } catch (e) { /* 무시 */ } }

    // ---------- 시작 ----------
    /**
     * @param {{type, unitNo, pass, own:Array, units:Object}} opts
     */
    function start(opts) {
        var queue = TrainingData.buildQueue(opts.units, opts.unitNo, opts.own || []);
        if (!queue.length) {
            alert('이 단위에 풀 문제가 없어요.');
            return;
        }
        S = {
            type: opts.type,
            unitNo: opts.unitNo,
            pass: opts.pass || 1,
            queue: queue,
            idx: 0,
            timerMode: _loadTimerMode(),
            local: []      // 이번 풀이에서 일어난 일 (저장 실패해도 결과 화면에 쓰기 위해)
        };
        _stopTimer();
        if (typeof showScreen === 'function') showScreen('trainingScreen');
        $('trainingEndContent').style.display = 'none';
        $('trainingSolveArea').style.display = '';
        _syncTimerSeg();
        _loadQuestion();
    }

    function _loadQuestion() {
        var q = S.queue[S.idx];
        S.q = q;
        S.answers = {};
        S.phase = 'solving';        // solving | wrong | correct | revealed
        S.checkedOnce = false;
        S.retried = false;
        S.firstTiming = null;
        S.optionOrder = TrainingData.shuffle(q.optionWords);
        S.pair = ArrangeCore.randomGenderPair();
        S.lastGrade = null;
        S.saveFailed = false;
        _startTimer();
        _render();
    }

    // ---------- 그리기 ----------
    function _render() {
        var q = S.q;
        $('trainingProgress').textContent = 'Question ' + (S.idx + 1) + ' of ' + S.queue.length;

        var content = $('trainingQuestionContent');
        content.innerHTML = ArrangeCore.buildQuestionHtml(q, S.answers, S.pair, 'window.TrainingSession', S.optionOrder);
        content.classList.toggle('tr-locked', S.phase !== 'solving');
        if (S.phase !== 'solving' && S.lastGrade) {
            S.lastGrade.wrongBlankIndexes.forEach(function (i) {
                var b = content.querySelector('.arrange-blank[data-index="' + i + '"]');
                if (b && S.phase === 'wrong') b.classList.add('tr-wrong');
                else if (b && S.phase === 'revealed') b.classList.add('tr-wrong');
            });
        }

        // 버튼
        var checkBtn = $('trainingCheckBtn');
        var nextBtn = $('trainingNextBtn');
        checkBtn.style.display = S.phase === 'solving' ? '' : 'none';
        checkBtn.disabled = !ArrangeCore.isComplete(q, S.answers);
        nextBtn.style.display = (S.phase === 'correct' || S.phase === 'revealed') ? '' : 'none';
        nextBtn.innerHTML = (S.idx + 1 >= S.queue.length) ? 'Finish <i class="fas fa-flag-checkered"></i>' : 'Next <i class="fas fa-arrow-right"></i>';

        // 결과 안내
        var fb = $('trainingFeedback');
        var saveNote = S.saveFailed ? '<div class="tr-save-fail"><i class="fas fa-exclamation-circle"></i> 기록 저장에 실패했어요. 이 문제는 안 푼 것으로 남을 수 있어요.</div>' : '';
        if (S.phase === 'wrong') {
            fb.innerHTML = '<div class="tr-feedback wrong"><i class="fas fa-times-circle"></i> 아쉬워요. 빨간 부분의 순서를 다시 생각해 보세요.</div>'
                + '<div class="tr-actions"><button class="tr-btn ghost" onclick="TrainingSession.retry()"><i class="fas fa-rotate-left"></i> 다시 풀기</button>'
                + '<button class="tr-btn primary" onclick="TrainingSession.reveal()">정답·해설 보기</button></div>' + saveNote;
        } else if (S.phase === 'correct') {
            fb.innerHTML = '<div class="tr-feedback right"><i class="fas fa-check-circle"></i> ' + (S.retried ? '정답이에요! 다시 풀어서 맞혔어요.' : '정답이에요!') + '</div>' + saveNote;
        } else {
            fb.innerHTML = saveNote;
        }

        // 해설 (맞혔거나 정답을 본 뒤)
        var ex = $('trainingExplain');
        ex.innerHTML = (S.phase === 'correct' || S.phase === 'revealed') ? _explainHtml() : '';

        _renderClock();
    }

    function _fullSentence(q, words) {
        var blanks = 0;
        var parts = q.presentedWords.map(function (w) {
            if (w === '_') { return words[blanks++] || '___'; }
            return w;
        });
        return parts.join(' ') + q.endPunctuation;
    }

    function _highlight(sentence, hl) {
        var safe = _esc(sentence);
        if (!hl) return safe;
        var idx = sentence.toLowerCase().indexOf(String(hl).toLowerCase());
        if (idx < 0) return safe;
        return _esc(sentence.slice(0, idx)) + '<mark class="tr-hl">' + _esc(sentence.slice(idx, idx + hl.length)) + '</mark>' + _esc(sentence.slice(idx + hl.length));
    }

    function _explainHtml() {
        var q = S.q;
        var correct = _fullSentence(q, q.answerSets[0].answer);
        var mine = S.lastGrade ? S.lastGrade.userFullAnswer.join(' ') + q.endPunctuation : '';
        var mineWrong = S.phase === 'revealed';
        var html = '<div class="tr-explain">';
        html += '<div class="tr-row"><div class="tr-label">내 답</div><div><div class="tr-sent ' + (mineWrong ? 'mine' : '') + '">' + _esc(mine) + '</div></div></div>';
        html += '<div class="tr-row"><div class="tr-label">정답</div><div><div class="tr-sent">' + _highlight(correct, q.highlight) + '</div>'
            + (q.answerKo ? '<div class="tr-ko">' + _esc(q.answerKo) + '</div>' : '') + '</div></div>';
        html += '<div class="tr-row"><div class="tr-label">앞 발화</div><div><div class="tr-sent tr-sent-prompt">' + _esc(q.givenSentence) + '</div>'
            + (q.givenTranslation ? '<div class="tr-ko">' + _esc(q.givenTranslation) + '</div>' : '') + '</div></div>';
        if (q.explanation) {
            html += '<div class="tr-div"></div><div class="tr-ex-title"><i class="fas fa-lightbulb"></i> 해설</div>'
                + '<div class="tr-ex">' + _esc(q.explanation).replace(/\n/g, '<br>') + '</div>';
        }
        return html + '</div>';
    }

    // ---------- 끌어다 놓기 (arrange-core HTML이 부르는 이름: window.TrainingSession.*) ----------
    function dragStart(event) {
        if (!S || S.phase !== 'solving') return;
        S.dragged = event.target.dataset.word;
        try { event.dataTransfer.effectAllowed = 'move'; } catch (e) { /* 무시 */ }
    }
    function dragEnd() { if (S) S.dragged = null; }
    function dropWord(event) {
        event.preventDefault();
        if (!S || S.phase !== 'solving' || !S.dragged) return;
        var blank = event.target.closest('.arrange-blank');
        if (!blank) { S.dragged = null; return; }
        ArrangeCore.placeWord(S.answers, parseInt(blank.dataset.index, 10), S.dragged);
        S.dragged = null;
        _render();
    }
    function removeWord(index) {
        if (!S || S.phase !== 'solving') return;
        if (ArrangeCore.removeWord(S.answers, index)) _render();
    }

    // ---------- 정답 확인 / 다시 풀기 / 정답 보기 / 다음 ----------
    async function check() {
        if (!S || S.phase !== 'solving' || !ArrangeCore.isComplete(S.q, S.answers)) return;
        var g = ArrangeCore.gradeQuestion(S.q, S.answers);
        S.lastGrade = g;
        var timing = null;
        if (!S.checkedOnce) {
            timing = _stopTimer();
            S.firstTiming = timing;
        }
        S.checkedOnce = true;
        S.phase = g.isCorrect ? 'correct' : 'wrong';
        _render();
        await _save('check', g.isCorrect, g.userFullAnswer.join(' ') + S.q.endPunctuation, timing);
    }

    function retry() {
        if (!S || S.phase !== 'wrong') return;
        S.retried = true;
        S.answers = {};
        S.phase = 'solving';
        _render();
    }

    async function reveal() {
        if (!S || S.phase !== 'wrong') return;
        S.phase = 'revealed';
        _render();
        await _save('reveal', null, null, null);
    }

    function next() {
        if (!S) return;
        if (S.phase !== 'correct' && S.phase !== 'revealed') return;
        S.idx++;
        if (S.idx >= S.queue.length) { finish(); return; }
        _loadQuestion();
    }

    async function _save(event, isCorrect, userAnswer, timing) {
        var user = _user();
        var row = {
            user_id: user ? user.id : null,
            type: S.type,
            item_id: S.q.itemId,
            item_unit_no: S.q.unitNo,
            session_unit_no: S.unitNo,
            session_pass: S.pass,
            event: event,
            is_correct: isCorrect,
            user_answer: userAnswer,
            timer_sec: timing ? timing.limit : null,
            elapsed_ms: timing ? timing.elapsedMs : null,
            within_time: timing ? timing.within : null
        };
        S.local.push(Object.assign({ created_at: new Date().toISOString() }, row));
        var ok = await TrainingData.saveEvent(row);
        if (!ok) {
            S.saveFailed = true;
            _render();
        }
    }

    // ---------- 타이머 ----------
    function _startTimer() {
        _stopTimer(true);
        var limit = TIMER_OPTIONS[S.timerMode] || 0;
        if (!limit || S.checkedOnce) { S.timer = null; _renderClock(); return; }
        S.timer = { limit: limit, startedAt: Date.now() };
        timerTick = setInterval(_renderClock, 250);
        _renderClock();
    }
    /** 멈추고 이번 문제 시간 결과를 돌려준다. 타이머가 꺼져 있었으면 null */
    function _stopTimer(silent) {
        if (timerTick) { clearInterval(timerTick); timerTick = null; }
        if (!S || !S.timer) return null;
        var elapsedMs = Date.now() - S.timer.startedAt;
        var res = { limit: S.timer.limit, elapsedMs: elapsedMs, within: elapsedMs <= S.timer.limit * 1000 };
        S.timer.stoppedAt = Date.now();
        S.timer.frozen = res;
        if (!silent) _renderClock();
        return res;
    }
    function _renderClock() {
        var el = $('trainingTimerClock');
        if (!el || !S) return;
        if (!S.timer) { el.style.display = 'none'; el.innerHTML = ''; return; }
        var elapsed = S.timer.frozen ? S.timer.frozen.elapsedMs : (Date.now() - S.timer.startedAt);
        var remain = Math.max(0, S.timer.limit * 1000 - elapsed);
        var sec = Math.ceil(remain / 1000);
        var over = elapsed > S.timer.limit * 1000;
        el.style.display = '';
        el.classList.toggle('over', over);
        el.innerHTML = '<i class="fas fa-clock"></i>' + Math.floor(sec / 60) + ':' + _pad2(sec % 60) + (over ? '<small>시간 초과</small>' : '');
    }
    function setTimer(mode) {
        if (!S || !TIMER_OPTIONS.hasOwnProperty(mode)) return;
        S.timerMode = mode;
        _saveTimerMode(mode);
        _syncTimerSeg();
        // 아직 정답 확인을 안 누른 문제면 지금부터 새 시간으로 시작 (끄면 멈춤)
        if (S.phase === 'solving' && !S.checkedOnce && !$('trainingEndContent').offsetParent) {
            _startTimer();
        }
    }
    function _syncTimerSeg() {
        var seg = $('trainingTimerSeg');
        if (!seg || !S) return;
        seg.querySelectorAll('button[data-timer]').forEach(function (b) {
            b.classList.toggle('on', b.getAttribute('data-timer') === S.timerMode);
        });
    }

    // ---------- 끝 ----------
    async function finish() {
        _stopTimer(true);
        var user = _user();
        var items = await TrainingData.loadItems(S.type);
        var attempts = user ? await TrainingData.loadAttempts(user.id, S.type) : [];
        // 저장에 실패한 줄은 DB에 없으므로, 이번 풀이 결과 화면에만 합쳐서 보여준다
        var have = {};
        attempts.forEach(function (a) { have[a.item_id + '|' + a.event + '|' + a.session_pass + '|' + a.session_unit_no] = (have[a.item_id + '|' + a.event + '|' + a.session_pass + '|' + a.session_unit_no] || 0) + 1; });
        var merged = attempts.slice();
        S.local.forEach(function (r) {
            var k = r.item_id + '|' + r.event + '|' + r.session_pass + '|' + r.session_unit_no;
            if (have[k]) have[k]--; else merged.push(r);
        });
        var units = TrainingData.summarize(items, attempts);
        var u = units[S.unitNo];
        if (u && u.passComplete && u.currentPass === S.pass || (u && S.pass === 1 && u.done)) {
            showEnd({ type: S.type, unitNo: S.unitNo, pass: S.pass, units: units, items: items, attempts: merged });
        } else {
            exit();
        }
    }

    /** 그 회차의 결과 계산 */
    function _passResult(items, attempts, unitNo, pass) {
        var byItem = {};
        var itemMap = {};
        items.forEach(function (q) { itemMap[q.itemId] = q; });
        attempts.forEach(function (a) {
            if (Number(a.session_unit_no) !== unitNo || (Number(a.session_pass) || 1) !== pass) return;
            if (!itemMap[a.item_id]) return;
            (byItem[a.item_id] = byItem[a.item_id] || []).push(a);
        });
        var res = { first: 0, retry: 0, revealed: 0, total: 0, timed: 0, within: 0, chips: [] };
        var chipMap = {};
        Object.keys(byItem).forEach(function (id) {
            var evs = byItem[id];
            var checks = evs.filter(function (e) { return e.event === 'check'; });
            if (!checks.length) return;
            res.total++;
            var kind;
            if (checks[0].is_correct) kind = 'first';
            else if (checks.some(function (e) { return e.is_correct; })) kind = 'retry';
            else kind = 'revealed';   // 정답을 봤거나 맞히지 못하고 넘어감
            res[kind]++;
            if (checks[0].timer_sec) { res.timed++; if (checks[0].within_time) res.within++; }
            var q = itemMap[id];
            var label = (q.highlight || '').trim();
            if (label) {
                if (!chipMap[label]) { chipMap[label] = { label: label, bad: false }; res.chips.push(chipMap[label]); }
                if (kind !== 'first') chipMap[label].bad = true;
            }
        });
        return res;
    }

    /**
     * 마지막 결과 화면 (시안 17: 원형 그래프 + 표현 알약)
     * @param {{type, unitNo, pass, units, items, attempts}} opts
     */
    function showEnd(opts) {
        _stopTimer(true);
        S = S && S.unitNo === opts.unitNo ? S : { type: opts.type, unitNo: opts.unitNo, pass: opts.pass, queue: [], idx: 0, timerMode: _loadTimerMode(), local: [] };
        S.type = opts.type;
        S.unitNo = opts.unitNo;
        S.pass = opts.pass;
        S.endUnits = opts.units;
        S.endItems = opts.items;
        if (typeof showScreen === 'function') showScreen('trainingScreen');
        var r = _passResult(opts.items, opts.attempts, opts.unitNo, opts.pass);

        $('trainingProgress').textContent = 'Unit ' + _pad2(opts.unitNo);
        $('trainingSolveArea').style.display = 'none';
        $('trainingCheckBtn').style.display = 'none';
        $('trainingNextBtn').style.display = 'none';
        $('trainingTimerSeg').style.display = 'none';
        $('trainingTimerClock').style.display = 'none';

        var C = 2 * Math.PI * 50;
        var ratio = r.total ? r.first / r.total : 0;
        var statLine = '한 번에 맞힌 문제 ' + r.first + '개 · 다시 풀어서 맞힘 ' + r.retry + '개 · 정답 보고 넘어감 ' + r.revealed + '개'
            + (r.timed ? ' · 시간 안에 푼 문제 ' + r.within + '개' : '');
        var end = $('trainingEndContent');
        end.style.display = '';
        end.innerHTML = '<div class="tr-end2"><div class="tr-card">'
            + '<div class="tr-ring"><svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">'
            + '<circle cx="60" cy="60" r="50" fill="none" class="tr-ring-bg" stroke-width="12"/>'
            + '<circle cx="60" cy="60" r="50" fill="none" class="tr-ring-fg" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + (C * ratio).toFixed(1) + ' 999" transform="rotate(-90 60 60)"/>'
            + '<text x="60" y="58" text-anchor="middle" class="tr-ring-num">' + r.first + '</text>'
            + '<text x="60" y="80" text-anchor="middle" class="tr-ring-tot">/ ' + r.total + '</text></svg>'
            + '<div><h2 class="tr-h">Unit ' + _pad2(opts.unitNo) + ' Complete</h2><div class="tr-s">' + _esc(statLine) + '</div></div></div>'
            + (r.chips.length ? '<div class="tr-sec"><div class="tr-sec-t">이번에 나온 표현 <span class="tr-sec-note">· 빨간 테두리는 틀린 표현</span></div><div class="tr-chips">'
                + r.chips.map(function (c) { return '<span class="tr-chip ' + (c.bad ? 'x' : '') + '">' + _esc(c.label) + '</span>'; }).join('') + '</div></div>' : '')
            + '<div class="tr-btns2"><button class="tr-btn ghost" onclick="TrainingSession.restartUnit()"><i class="fas fa-rotate-left"></i> 이 단위 다시 풀기</button>'
            + '<button class="tr-btn primary" onclick="TrainingSession.exit()">단위 목록으로</button></div>'
            + '</div></div>';
    }

    /** 결과 화면의 "이 단위 다시 풀기" — 하다 만 회차가 있으면 이어서, 없으면 새 회차로 처음부터 */
    async function restartUnit() {
        var user = _user();
        var items = await TrainingData.loadItems(S.type);
        var attempts = user ? await TrainingData.loadAttempts(user.id, S.type) : [];
        var units = TrainingData.summarize(items, attempts);
        var u = units[S.unitNo];
        if (!u) { exit(); return; }
        var pass, own;
        if (u.currentPass >= 2 && !u.passComplete) {
            pass = u.currentPass; own = u.remaining;
        } else {
            pass = u.currentPass + 1; own = u.items.slice();
        }
        _restoreSolveUi();
        start({ type: S.type, unitNo: S.unitNo, pass: pass, own: own, units: units });
    }

    function _restoreSolveUi() {
        $('trainingSolveArea').style.display = '';
        $('trainingEndContent').style.display = 'none';
        $('trainingTimerSeg').style.display = '';
    }

    /** 단위 목록으로 */
    function exit() {
        _stopTimer(true);
        _restoreSolveUi();
        if (window.TrainingMain) TrainingMain.backToUnits();
    }

    window.TrainingSession = {
        start: start,
        showEnd: showEnd,
        restartUnit: restartUnit,
        check: check,
        retry: retry,
        reveal: reveal,
        next: next,
        exit: exit,
        setTimer: setTimer,
        dragStart: dragStart,
        dragEnd: dragEnd,
        dropWord: dropWord,
        removeWord: removeWord,
        _passResult: _passResult,
        _state: function () { return S; }
    };
})();
