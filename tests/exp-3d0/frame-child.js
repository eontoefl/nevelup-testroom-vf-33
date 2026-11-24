// [실험 3D-0 ③ — (가) 살아 있는 문서] 자식 화면(mypage.html) 쪽. 제품 코드가 아니다 — 시험 서버가 내주는 사본의 head 맨 앞에만 끼운다.
// 자식은 인증 모듈을 싣지 않고, 인증 클라이언트를 만들지 않고, 확인·갱신·로그인 요청을 보내지 않는다.
// "확인된 사람의 표시 값"은 저장소에서 스스로 읽지 않고 부모(첫 화면)에게 이름(display_user)으로 청한다.
// ★ 이것은 규약일 뿐 경계가 아니다: 같은 출처라 자식의 스크립트는 부모의 탭 단위 저장소를 직접 읽을 수 있다.
(function () {
    'use strict';
    var host = null;
    try { if (window.parent !== window && window.parent.TrHost && typeof window.parent.TrHost.request === 'function') host = window.parent.TrHost; } catch (e) { host = null; }
    if (!host) {
        // 살아 있는 첫 화면 없이 이 주소가 직접 열렸다(주소창·새 탭·복제·되살리기): 이 화면은 아무것도 그리지 않고 첫 화면으로 보낸다.
        // (첫 화면이 로그인을 확인한 뒤 이 화면을 자식으로 연다)
        try { document.documentElement.style.visibility = 'hidden'; } catch (e) {}
        window.__trChild = { hosted: false, asks: 0, writesDropped: 0 };
        window.location.replace('index.html#mypage');
        return;
    }
    var state = window.__trChild = { hosted: true, asks: 0, writesDropped: 0 };
    var rawGet = Storage.prototype.getItem;
    var rawSet = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
        if (this === window.sessionStorage && String(key) === 'currentUser') { state.asks++; return host.request('display_user', window); }
        return rawGet.apply(this, arguments);
    };
    // 자식은 로그인에 딸린 값을 고쳐 쓰지 않는다(지금의 화면은 일정 맞추기 뒤에 currentUser 를 다시 쓴다 — 그 쓰기는 버린다)
    Storage.prototype.setItem = function (key) {
        if (this === window.sessionStorage && String(key) === 'currentUser') { state.writesDropped++; return undefined; }
        return rawSet.apply(this, arguments);
    };
    // "테스트룸으로" 단추: 자식 안에서 첫 화면을 다시 여는 대신 부모에게 닫아 달라고 청한다
    document.addEventListener('DOMContentLoaded', function () {
        window.goBackToTestroom = function () { host.request('close', window); };
    });
})();
