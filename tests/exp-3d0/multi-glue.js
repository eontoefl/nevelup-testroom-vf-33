// [실험 3D-0 ③ — (나) 여러 문서 이동(비교군)] 마이페이지 쪽. 제품 코드가 아니다 — 시험 서버가 내주는 사본의 head 에만 끼운다.
// 이 화면도 인증 모듈을 싣는다(이 줄보다 앞에서). 화면의 스크립트는 로그인이 (다시) 확인되기 전에는 currentUser 를 읽지 못하고,
// 화면의 시작(DOMContentLoaded 리스너)은 확인이 끝난 뒤로 미룬다.
(function () {
    'use strict';
    if (window.TR_AUTH_PAGE !== 'on') return;
    var auth = (window.EonAuth && typeof window.EonAuth.isOn === 'function' && window.EonAuth.isOn() === true) ? window.EonAuth : null;
    var rawGet = Storage.prototype.getItem;
    var rawSet = Storage.prototype.setItem;
    var shownFor = null;         // 이 문서가 화면을 그릴 때 확인돼 있던 로그인 기록
    var state = window.__trMulti = { module: !!auth, started: false, writesDropped: 0 };

    var inside = false;          // 모듈이 그 값을 읽는 중인가(모듈은 저장된 그대로 읽어야 한다)
    function verifiedUser() {
        inside = true;
        try { return auth && auth.state() === 'signed_in' ? auth.displayUserRaw() : null; } catch (e) { return null; } finally { inside = false; }
    }
    // 화면의 스크립트가 읽는 currentUser: 모듈이 확인한 사람의 것일 때만(모듈이 없으면 언제나 없음 — 닫는 쪽)
    Storage.prototype.getItem = function (key) {
        if (!inside && this === window.sessionStorage && String(key) === 'currentUser') return verifiedUser();
        return rawGet.apply(this, arguments);
    };
    Storage.prototype.setItem = function (key) {
        if (this === window.sessionStorage && String(key) === 'currentUser') { state.writesDropped++; return undefined; }
        return rawSet.apply(this, arguments);
    };

    // 화면의 시작을 확인 뒤로 미룬다
    var waiting = [];
    var released = false;
    var rawAdd = document.addEventListener;
    document.addEventListener = function (type, fn, opts) {
        if (type === 'DOMContentLoaded' && !released && typeof fn === 'function') { waiting.push(fn); return undefined; }
        return rawAdd.call(document, type, fn, opts);
    };
    function release() {
        if (released) return;
        released = true;
        state.started = true;
        try { shownFor = auth && auth.state() === 'signed_in' ? auth.attempt() : null; } catch (e) { shownFor = null; }
        waiting.forEach(function (fn) { try { fn.call(document, new Event('DOMContentLoaded')); } catch (e) { /* 화면의 오류는 화면의 것 */ } });
        waiting = [];
    }
    function whenDomReady(fn) {
        if (document.readyState === 'loading') rawAdd.call(document, 'DOMContentLoaded', fn);
        else fn();
    }
    if (!auth) { whenDomReady(release); return; }                     // 모듈을 받지 못했다: 로그인 안 된 화면으로(자격·저장값을 쓰지 않는다)
    whenDomReady(function () {
        var p;
        try { p = auth.ready(); } catch (e) { p = Promise.resolve('error'); }
        Promise.resolve(p).then(release, release);
    });

    // 그린 뒤에 사람이 달라지면(로그아웃·다른 계정·되살아난 화면): 이 문서를 가리고 다시 읽는다 — 앞사람이 적던 것을 남기지 않는다
    function conceal() { try { document.documentElement.style.visibility = 'hidden'; } catch (e) {} }
    function reveal() { try { document.documentElement.style.visibility = ''; } catch (e) {} }
    var reloading = false;
    function check() {
        if (!released || reloading) return;
        var st = auth.state();
        if (st === 'restoring') { conceal(); return; }
        var now = st === 'signed_in' ? auth.attempt() : null;
        if (now === shownFor) { reveal(); return; }
        conceal();
        reloading = true;
        window.location.reload();
    }
    auth.onChange(check);
    // 보관되는 화면은 가린 채 보관하고, 되살아나면 다시 확인된 뒤에만 보인다
    window.addEventListener('pagehide', function (ev) { if (ev && ev.persisted) conceal(); });
    // (되살아난 직후에는 모듈의 상태가 아직 앞의 것이다 — 모듈이 다시 가리고 다시 확인을 끝내 표시 값을 내줄 때까지 기다린다)
    window.addEventListener('pageshow', function (ev) {
        if (!ev || !ev.persisted) return;
        conceal();
        var until = Date.now() + 20000;
        (function poll() {
            var st = auth.state();
            var settled = (st === 'signed_in' && auth.displayUserRaw() !== null) || st === 'signed_out' || st === 'rejected' || st === 'off';
            if (!settled && Date.now() < until) { setTimeout(poll, 50); return; }
            if (!settled) { reloading = true; window.location.reload(); return; }
            check();
        })();
    });
})();
