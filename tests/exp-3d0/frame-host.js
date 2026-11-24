// [실험 3D-0 ③ — (가) 살아 있는 문서] 첫 화면(index.html) 쪽. 제품 코드가 아니다 — 시험 서버가 내주는 사본에만 끼운다.
// 첫 화면 문서가 그대로 남아 로그인의 확인·갱신을 계속 맡고, 마이페이지를 같은 출처의 iframe 으로 연다.
// 자식 화면은 인증 클라이언트를 만들지 않는다. 자식이 필요한 것은 아래의 "허용된 업무 이름"으로만 청한다.
//   display_user : 확인된 사람의 표시 값(이 문서가 지금 확인한 로그인의 것일 때만. 자격은 주지 않는다)
//   close        : 자식 화면을 닫고 첫 화면으로 돌아간다
// ★ 같은 출처의 iframe 은 자격을 가두는 경계가 아니다. 자식의 스크립트는 부모의 탭 단위 저장소를 그대로 읽을 수 있다.
//   여기서 지키는 것은 "자식이 확인·갱신·로그인 요청을 보내지 않는다"와 "자식의 표시는 부모가 확인한 사람의 것이다"뿐이다.
(function () {
    'use strict';
    if (window.TR_AUTH_PAGE !== 'on' || !window.EonAuth || window.EonAuth.isOn() !== true) return;
    if (window.top !== window) return;                       // 첫 화면이 다른 문서 안에 들어가 있으면 아무것도 하지 않는다

    var CHILD_PAGES = { '#mypage': 'mypage.html' };          // 자식으로 여는 화면(이 실험에서는 하나)
    var NAMES = ['display_user', 'close'];
    var frame = null;            // 자식 화면의 iframe
    var frameFor = null;         // 그 자식을 연 로그인 기록(바뀌면 자식을 버린다 — 앞사람이 적던 것이 남지 않게)
    var frameHash = null;
    var asks = [];               // 자식이 청한 것의 기록(이름과 받아들였는가만)

    function signedInAs() {
        try { return window.EonAuth.state() === 'signed_in' ? window.EonAuth.attempt() : null; } catch (e) { return null; }
    }
    function entered() {
        try { return !!window.trLoginV2 && window.trLoginV2.ready() === true; } catch (e) { return false; }
    }
    function destroy() {
        if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
        frame = null;
        frameFor = null;
        frameHash = null;
        document.documentElement.classList.remove('tr-child-open');
    }
    function hide() {
        if (frame) frame.style.display = 'none';
        document.documentElement.classList.remove('tr-child-open');
    }
    function show(hash) {
        var who = signedInAs();
        if (!who || !entered() || !CHILD_PAGES[hash]) return false;
        if (frame && (frameFor !== who || frameHash !== hash)) destroy();        // 다른 사람·다른 화면의 자식은 다시 쓰지 않는다
        if (!frame) {
            frame = document.createElement('iframe');
            frame.id = 'trChildFrame';
            frame.setAttribute('title', '마이페이지');
            frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483000;background:#fff;';
            frame.src = CHILD_PAGES[hash];
            frameFor = who;
            frameHash = hash;
            document.body.appendChild(frame);
        }
        frame.style.display = 'block';
        document.documentElement.classList.add('tr-child-open');
        return true;
    }
    // 주소의 # 에 맞춰 자식을 보이거나 감춘다(뒤로·앞으로·새로 고침·직접 주소)
    function sync() {
        var hash = window.location.hash;
        if (CHILD_PAGES[hash]) { if (!show(hash)) hide(); } else hide();
    }

    // 첫 화면의 "마이페이지" 단추: 문서를 떠나지 않고 자식을 연다
    var goElsewhere = window.goToMyPage;
    window.goToMyPage = function () {
        if (!signedInAs() || !entered()) return;
        var practice = typeof window.isPracticeMode === 'function' && window.isPracticeMode();
        if (practice || window.courseMode === 'australia') { if (typeof goElsewhere === 'function') goElsewhere(); return; }   // 이 실험은 마이페이지 하나만
        if (window.location.hash !== '#mypage') window.history.pushState({ trChild: '#mypage' }, '', '#mypage');
        sync();
    };
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);

    // 로그인 상태가 바뀔 때: 확인된 사람이 아니게 되면 자식을 가리고, 끝났거나 다른 사람이 되면 자식을 버린다
    window.EonAuth.onChange(function () {
        var st = window.EonAuth.state();
        var who = signedInAs();
        if (frame && st === 'restoring') { hide(); return; }
        if (frame && (!who || who !== frameFor)) destroy();
        if (who) setTimeout(sync, 0);
    });
    // 새로 고침·직접 주소(#mypage): 다시 확인되고 수강 조회가 끝난 뒤에 연다
    var tries = 0;
    var timer = setInterval(function () {
        tries++;
        if (signedInAs() && entered()) { sync(); if (frame || !CHILD_PAGES[window.location.hash]) clearInterval(timer); }
        if (tries > 600) clearInterval(timer);
    }, 100);

    // 자식이 부르는 곳. from 은 부르는 창 — 이 문서가 연 그 자식일 때만 받는다
    window.TrHost = Object.freeze({
        request: function (name, from) {
            var mine = !!frame && from === frame.contentWindow;
            var ok = mine && NAMES.indexOf(name) >= 0;
            asks.push({ name: NAMES.indexOf(name) >= 0 ? name : 'other', ok: ok });
            if (!ok) return null;
            if (name === 'display_user') {
                var who = signedInAs();
                return who && who === frameFor ? window.EonAuth.displayUserRaw() : null;
            }
            if (name === 'close') {
                if (window.history.state && window.history.state.trChild) window.history.back();
                else { window.history.replaceState(null, '', window.location.pathname + window.location.search); sync(); }
                return true;
            }
            return null;
        },
        asks: function () { return asks.slice(); },
        childOpen: function () { return !!frame && frame.style.display !== 'none'; }
    });
})();
