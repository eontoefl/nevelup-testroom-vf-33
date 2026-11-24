// [실험 3D-0 ③ — (나) 여러 문서 이동(비교군)] 인증 모듈(js/auth-session.js)의 "새 문서가 이어받는 규칙"을 넓힌 사본을 만든다.
// 제품 코드가 아니다 — 저장소의 js/auth-session.js 는 고치지 않는다. 시험 서버가 (나)의 화면에 내줄 때만 이 함수로 바꾼 사본을 내준다.
// 바꿀 자리는 전부 "정확히 1곳" 있어야 한다(아니면 멈춘다 — 기준 90738c8 의 모듈이 아니면 이 실험은 뜻이 없다).
//
// 넓힌 규칙(3B 의 새로 고침 규칙은 그대로 두고 더한 것): 새 문서·되살아난 문서는 아래가 **전부** 맞을 때만 이어받는다.
//   1. 떠나는 문서(지금 쥔 문서)가 브라우저의 navigate 이벤트에서 "의도"를 적어 둔다 — 브라우저가 알려 준 정확한 목적지 주소
//      (뒤로·앞으로면 그 목적지 항목의 key 까지), 탐색 종류(push·traverse), 자기 항목의 id, 한 번만 쓰는 글자(nonce).
//      nonce 는 브라우저 단위의 차례표에도 적는다(승계가 한 번임을 보이려고).
//      주소창으로 간 이동·새 탭·복제·되살리기에는 이 이벤트가 오지 않는다 → 의도가 없다 → 이어받지 않는다.
//   2. 도착한 문서: 브라우저가 준 navigation.activation 이 그 의도와 맞는다 —
//      activation.navigationType = 의도의 종류, activation.from(이 문서가 갈아 낀 바로 앞 항목)의 id·주소 = 의도를 적은 문서의 것,
//      이 문서의 주소 = 의도의 목적지(뒤로·앞으로면 이 항목의 key 도), 탐색 종류(performance)도 그에 맞는다.
//   3. 쥠 표식이 "놓음"이고, 놓은 문서가 의도를 적은 그 문서이고, 놓은 시각이 이 문서의 탐색 시작 뒤다(되살아난 문서는 의도를 적은 시각 뒤).
//   4. 연 창이 아니다, 창 이름이 같다, 잠금 안에서 차례표의 차례와 nonce 가 둘 다 맞을 때 차례를 새로 뽑고 nonce 를 지운다(한 번의 승계).
// 이어받은 뒤에는 3B 와 같이 서버에 다시 확인한다(본인 확인·접근 확인).

function once(text, from, to, what) {
    const n = text.split(from).length - 1;
    if (n !== 1) throw new Error(`(나)의 모듈 사본: 바꿀 자리를 정확히 1곳 찾지 못함(${n}곳) — ${what}`);
    return text.replace(from, () => to);
}

const ADDED = `
    // ===== [실험 3D-0 (나)] 화면 사이의 승계 =====
    const INTENT_KEY = 'tr_auth_v1:intent';      // 떠나는 문서가 적는 의도(탭 단위 — 복사될 수 있다. 이것만으로는 증거가 아니다)
    const HANDOFF_PAGES = ['/index.html', '/mypage.html'];
    let hiddenAt = null;                          // 이 문서가 마지막으로 물러난 시각(메모리)
    // 진단: 왜 이어받지 않았는가(정해 둔 이름만 — 값은 남기지 않는다)
    const why = function (name) { try { if (!Array.isArray(window.__trHandoffWhy)) window.__trHandoffWhy = []; window.__trHandoffWhy.push(String(name)); } catch (e) { /* 진단일 뿐 */ } return null; };
    function readIntent() {
        try {
            const it = JSON.parse(window.sessionStorage.getItem(INTENT_KEY));
            if (it && it.v === 1 && typeof it.sid === 'string' && typeof it.nonce === 'string' && typeof it.to === 'string' && typeof it.doc === 'string' &&
                (it.type === 'push' || it.type === 'traverse') && typeof it.fromId === 'string' && typeof it.fromUrl === 'string' && typeof it.at === 'number') return it;
        } catch (e) { /* 아래 */ }
        return null;
    }
    // 떠나는 문서: 브라우저가 알려 준 목적지를 적는다(이 문서가 지금 쥐고 있을 때만)
    function noteDeparture(e) {
        try {
            if (!e || e.hashChange || e.downloadRequest || !e.destination || e.destination.sameDocument) return;
            if (!iHold()) { why('depart:not_holding'); return; }
            const type = e.navigationType;
            if (type !== 'push' && type !== 'traverse') return;                    // reload 는 3B 의 규칙 그대로
            const u = new URL(e.destination.url);
            if (u.origin !== window.location.origin || HANDOFF_PAGES.indexOf(u.pathname) < 0) { why('depart:other_page'); return; }
            const h = readHolder();
            const reg = readRegistry();
            const cur = window.navigation.currentEntry;
            if (!h || !reg || !reg[h.sid] || reg[h.sid].claim !== h.claim || !cur) { why('depart:no_turn'); return; }
            const nonce = randomId();
            window.sessionStorage.setItem(INTENT_KEY, JSON.stringify({ v: 1, sid: h.sid, nonce: nonce, to: e.destination.url, type: type, doc: DOC_ID,
                fromId: cur.id, fromUrl: cur.url, toKey: type === 'traverse' ? String(e.destination.key) : null, at: Date.now() }));
            reg[h.sid] = { claim: h.claim, at: reg[h.sid].at, handoff: nonce };
            writeRegistry(reg);
            why('depart:noted_' + type);
            // 이동이 일어나지 않았으면(취소·실패) 의도를 거둔다
            setTimeout(function () {
                try {
                    if (!iHold()) return;
                    const it = readIntent();
                    if (it && it.nonce === nonce) window.sessionStorage.removeItem(INTENT_KEY);
                    const r2 = readRegistry();
                    if (r2 && r2[h.sid] && r2[h.sid].handoff === nonce) { r2[h.sid] = { claim: r2[h.sid].claim, at: r2[h.sid].at }; writeRegistry(r2); }
                } catch (err) { /* 남아도 쥔 문서가 살아 있으면 표식이 "쥠"이라 쓰이지 않는다 */ }
            }, 5000);
        } catch (err) { why('depart:threw'); /* 적지 못하면 다음 문서는 이어받지 못한다(쓰지 않는 쪽) */ }
    }
    // 도착한 문서: 브라우저가 준 activation 이 의도와 맞는가. 맞으면 그 의도를, 아니면 null
    function arrivalIntent(c, restored) {
        try {
            const nav = window.navigation;
            const act = nav && nav.activation;
            const it = readIntent();
            if (!act) return why('arrive:no_activation');
            if (!it) return why('arrive:no_intent');
            if (!c || it.sid !== c.sid) return why('arrive:other_login');
            if (act.navigationType !== it.type) return why('arrive:other_kind');
            const from = act.from;
            if (!from) return why('arrive:no_from');
            if (from.id !== it.fromId) return why('arrive:other_from');
            // 앞 항목의 주소는 그 문서의 Referrer-Policy 가 no-referrer 면 브라우저가 가린다(null) — 보일 때만 견준다. 항목의 id 는 가려지지 않는다
            if (from.url !== null && from.url !== it.fromUrl) return why('arrive:other_from_url');
            if (from.url === null) why('arrive:from_url_hidden');
            if (window.location.href !== it.to) return why('arrive:other_destination');
            if (it.type === 'traverse' && (!nav.currentEntry || String(nav.currentEntry.key) !== it.toKey)) return why('arrive:other_entry');
            if (!restored && navType() !== (it.type === 'push' ? 'navigate' : 'back_forward')) return why('arrive:other_navtype');
            return it;
        } catch (e) { return why('arrive:threw'); }
    }
    // 잠금 안에서: 차례와 nonce 가 둘 다 맞을 때만 차례를 새로 뽑는다(nonce 는 이때 없어진다)
    function takeOver(c, h, it, name) {
        if (!hasLocks()) { why('take:no_locks'); return Promise.resolve('foreign'); }
        let locked = null;
        try {
            locked = window.navigator.locks.request('tr_auth_v1:claims', function () {
                const reg = readRegistry();
                if (!reg || !reg[c.sid] || reg[c.sid].claim !== h.claim) { why('take:turn_taken'); return 'foreign'; }
                if (reg[c.sid].handoff !== it.nonce) { why('take:nonce_used'); return 'foreign'; }
                const cur = readHolder();
                if (!cur || cur.state !== 'released' || cur.claim !== h.claim || cur.doc !== it.doc) { why('take:holder_changed'); return 'foreign'; }
                const mineClaim = randomId();
                reg[c.sid] = { claim: mineClaim, at: Date.now() };
                writeRegistry(reg);
                const wrote = readRegistry();
                if (!wrote || !wrote[c.sid] || wrote[c.sid].claim !== mineClaim || wrote[c.sid].handoff) return 'foreign';
                if (!same(heldClaims(), c)) return 'foreign';
                writeHolder({ v: 1, sid: c.sid, claim: mineClaim, state: 'held', doc: DOC_ID, name: name });
                window.sessionStorage.removeItem(INTENT_KEY);
                holding = true;
                lastHeld = null;
                why('take:mine');
                return 'mine';
            });
        } catch (e) { return Promise.resolve('foreign'); }
        return Promise.resolve(locked).then(function (v) { return v === 'mine' ? 'mine' : 'foreign'; }, function () { return 'foreign'; });
    }
    // 새로 읽힌 문서(새로 고침이 아닌 읽기)
    function claimByIntent(c, h, name) {
        const it = arrivalIntent(c, false);
        if (!it) return Promise.resolve('foreign');
        if (h.doc !== it.doc) { why('new:other_releaser'); return Promise.resolve('foreign'); }
        const began = navStart();
        let nowMs = null;
        try { nowMs = Date.now(); } catch (e) { nowMs = null; }
        if (began === null || typeof nowMs !== 'number' || !(h.at >= began && h.at <= nowMs && it.at <= h.at)) { why('new:release_time'); return Promise.resolve('foreign'); }
        return takeOver(c, h, it, name);
    }
    // 되살아난 문서(브라우저가 보관해 둔 화면)가 뒤로·앞으로의 정확한 목적지인가.
    // 되살아나는 문서의 pageshow 는 떠나는 문서의 pagehide 보다 먼저 온다 — 떠나는 문서가 놓을 때까지 잠깐 기다린다(1.5초까지)
    function claimRestored() {
        const started = Date.now();
        return new Promise(function (resolve) {
            (function attempt() {
                let c = null; let h = null; let name = null; let opened = true;
                try { c = heldClaims(); h = readHolder(); name = String(window.name); opened = !!window.opener; } catch (e) { resolve('foreign'); return; }
                const it = arrivalIntent(c, true);
                if (!it) { resolve('foreign'); return; }
                if (!c || !h || h.sid !== c.sid || it.type !== 'traverse' || opened || !h.name || h.name !== name || typeof hiddenAt !== 'number' || it.at < hiddenAt) { why('restored:not_this_document'); resolve('foreign'); return; }
                if (h.state === 'held' && h.doc === it.doc && Date.now() - started < 1500) { setTimeout(attempt, 20); return; }
                if (h.state !== 'released' || h.doc !== it.doc || !(h.at >= it.at && h.at <= Date.now())) { why('restored:not_released'); resolve('foreign'); return; }
                takeOver(c, h, it, name).then(resolve, function () { resolve('foreign'); });
            })();
        });
    }
    try { if (window.navigation && typeof window.navigation.addEventListener === 'function') window.navigation.addEventListener('navigate', noteDeparture); } catch (e) { /* 이 브라우저에서는 화면 사이의 승계가 없다 */ }
    window.addEventListener('pagehide', function () { hiddenAt = Date.now(); });
    // ===== [실험 3D-0 (나)] 끝 =====
`;

export function patchModuleForMulti(source) {
    let t = String(source).replace(/\r\n/g, '\n');
    // 차례표에 한 번만 쓰는 글자(nonce)를 함께 둔다
    t = once(t, "        keys.forEach(function (k) { out[k] = { claim: reg[k].claim, at: reg[k].at }; });",
        "        keys.forEach(function (k) { out[k] = { claim: reg[k].claim, at: reg[k].at }; if (typeof reg[k].handoff === 'string') out[k].handoff = reg[k].handoff; });", '차례표 쓰기');
    // 모듈은 화면의 값(currentUser)을 저장된 그대로 읽는다(마이페이지에서는 화면 스크립트의 읽기를 연결 조각이 가린다 — 모듈까지 가려지면 남은 값을 지우지 못한다)
    t = once(t, "        const user = store.getItem(COMPAT_USER);\n        let mark = null;",
        "        const user = (typeof window.__trRawGetItem === 'function' ? window.__trRawGetItem : store.getItem).call(store, COMPAT_USER);      // [실험 (나)]\n        let mark = null;", '화면의 값 읽기');
    // 진단: 창 이름·쥠 표식에서 멈췄을 때, 나머지 근거(의도·activation)는 맞았는가를 이름으로 남긴다(판정은 바꾸지 않는다)
    t = once(t, "        if (h.state !== 'released') return Promise.resolve('foreign');\n        if (!h.name || h.name !== name) return Promise.resolve('foreign');\n",
        "        if (h.state !== 'released') { why('new:holder_not_released'); return Promise.resolve('foreign'); }\n        if (!h.name || h.name !== name) { why('new:window_name'); if (navType() !== 'reload' && arrivalIntent(c, false)) why('diag:only_window_name_stopped_it'); return Promise.resolve('foreign'); }\n", '진단');
    // 새로 읽힌 문서: 새로 고침이 아니면 의도로 가린다
    t = once(t, "        if (navType() !== 'reload') return Promise.resolve('foreign');\n",
        "        if (navType() !== 'reload') return claimByIntent(c, h, name);          // [실험 (나)] 새로 고침이 아닌 읽기: 의도·activation·놓은 시각·한 번의 승계\n", '탐색 종류');
    // 되살아난 문서: 메모리로 보일 수 없으면(그 사이 다른 문서가 이어받았다) 의도로 가린다
    t = once(t, "            try { own = await reclaimAlive(); } catch (e) { own = 'foreign'; }\n            if (own === 'foreign') { closeWindow(); return; }\n",
        "            try { own = await reclaimAlive(); } catch (e) { own = 'foreign'; }\n            if (own === 'foreign') { try { own = await claimRestored(); } catch (e) { own = 'foreign'; } }      // [실험 (나)]\n            if (own === 'foreign') { closeWindow(); return; }\n", '되살아난 문서');
    // 보일 수 없는 값을 버릴 때: 새 로그인이 만든 currentUser 와 의도도 함께 버린다(첫 화면이 아닌 화면에는 머리의 치우기가 없다)
    t = once(t, "            store.removeItem(HOLDER_KEY);\n            store.removeItem(MARK_KEY);\n            gone = store.getItem(STORAGE_KEY) === null && store.getItem(HOLDER_KEY) === null;",
        "            store.removeItem(HOLDER_KEY);\n            try { if (readSlot().kind === 'ours') store.removeItem(COMPAT_USER); } catch (e2) { /* 아래에서 표식을 지운다 */ }      // [실험 (나)]\n            store.removeItem('tr_auth_v1:intent');\n            store.removeItem(MARK_KEY);\n            gone = store.getItem(STORAGE_KEY) === null && store.getItem(HOLDER_KEY) === null;", '사본 버리기');
    // 첫 화면이 아닌 화면에서는 다시 확인하기 전에 currentUser 를 치우지 않는다(다시 만들 화면 코드가 없다 — 대신 화면이 확인 전에는 읽지 못하게 가린다: multi-glue.js)
    t = once(t, "        if (readSlot().kind === 'ours') window.sessionStorage.removeItem(COMPAT_USER);\n    } catch (e) { /* 읽지 못하면 그대로 둔다 — 화면은 확인된 뒤에만 연다 */ }",
        "        if (window.TR_KEEP_USER !== true && readSlot().kind === 'ours') window.sessionStorage.removeItem(COMPAT_USER);      // [실험 (나)]\n    } catch (e) { /* 읽지 못하면 그대로 둔다 — 화면은 확인된 뒤에만 연다 */ }", '시작할 때 치우기');
    // 더한 함수들: 떠날 때 쥔 것을 놓는 리스너 앞에 둔다
    t = once(t, "    // 이 문서가 떠난다(새로 고침·다른 화면으로 이동·탭 닫기·보관): 쥔 것을 놓는다\n    window.addEventListener('pagehide', function () { releaseHold(); });\n",
        ADDED + "\n    // 이 문서가 떠난다(새로 고침·다른 화면으로 이동·탭 닫기·보관): 쥔 것을 놓는다\n    window.addEventListener('pagehide', function () { releaseHold(); });\n", '더한 함수');
    return t;
}
