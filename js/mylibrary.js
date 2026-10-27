/**
 * ================================================
 * mylibrary.js — 마이페이지 "내 서재"
 * ================================================
 * 학생이 볼 수 있는 자료를 카드로 보여준다. 클릭하면 새 창으로 열림.
 *   - 추가 자료(에디터 책) : 공개 + (전체공개 또는 나에게 지정된 것)
 *
 * 대상 판정:
 *   audience_mode='all'      → 결제자 전원(=이 사이트 접속자) 공개
 *   audience_mode='selected' → tr_book_access 에 내 user_id 있을 때만
 *   (컬럼/테이블이 아직 없으면(SQL 미적용) 'all'로 간주 + selected는 숨김)
 * ================================================
 */
(function () {
  var SEEN_KEY = "";           // 사용자별 '이미 본 자료' 저장 키
  var pagesIds = [];           // 현재 볼 수 있는 추가자료 book id 목록 (점 판정용)

  document.addEventListener("DOMContentLoaded", initLibrary);

  async function initLibrary() {
    var user = null;
    try { user = JSON.parse(sessionStorage.getItem("currentUser") || "null"); } catch (_) {}
    if (!user || !user.id) return; // 로그인 안 됐으면 서재 숨김 유지
    SEEN_KEY = "lib_seen_" + user.id;

    var cards = [];

    // 2) 추가 자료 (에디터로 만든 'pages' 책들)
    try {
      // select=* : audience_mode 컬럼이 아직 없어도(SQL 미적용) 400 안 나게 (있으면 포함됨)
      var books = await supabaseSelect(
        "tr_book_documents",
        "kind=eq.pages&is_active=eq.true&order=sort_order.asc&select=*"
      );
      books = (books || []).filter(function (b) { return !b.deleted_at; });

      // 내게 지정된 책 id 목록 (selected 판정용). 테이블 없으면 빈 집합.
      var mine = {};
      try {
        var access = await supabaseSelect(
          "tr_book_access",
          "user_id=eq." + user.id + "&select=book_id"
        );
        (access || []).forEach(function (a) { mine[a.book_id] = true; });
      } catch (_) { /* SQL 미적용 → selected 책은 안 보임 */ }

      books.forEach(function (b) {
        var mode = b.audience_mode === "selected" ? "selected" : "all";
        var allowed = mode === "all" || mine[b.id];
        if (!allowed) return;
        pagesIds.push(b.id);
        cards.push({
          title: b.title || "(제목 없음)",
          meta: (b.total_pages || 0) + "페이지",
          icon: "fa-file-lines",
          kind: "pages",
          url: "book-v2.html?book=" + b.id,
        });
      });
    } catch (e) {
      console.warn("📚 [Library] 추가 자료 로드 실패:", e);
    }

    renderLibrary(cards);
    updateNewDot();
  }

  // 처음 보는 추가자료가 있으면 탭에 점(●) 표시
  function updateNewDot() {
    var dot = document.getElementById("libTabDot");
    if (!dot) return;
    var seen = readSeen();
    var hasNew = pagesIds.some(function (id) { return seen.indexOf(id) === -1; });
    // 지금 서재 탭이 이미 열려 있으면(직접 진입 등) 바로 본 것으로 처리
    var libTabActive = document.querySelector('.mp-tab[data-panel="panel-library"].active');
    if (hasNew && !libTabActive) dot.style.display = "";
    else { dot.style.display = "none"; if (hasNew) markSeen(); }
  }

  function readSeen() {
    try { var a = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); return Array.isArray(a) ? a : []; }
    catch (_) { return []; }
  }
  function markSeen() {
    var seen = readSeen();
    pagesIds.forEach(function (id) { if (seen.indexOf(id) === -1) seen.push(id); });
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch (_) {}
  }

  // 서재 탭을 누르면 호출됨(mypage.html onclick) → 점 끄고 본 것으로 기록
  window.markLibrarySeen = function () {
    var dot = document.getElementById("libTabDot");
    if (dot) dot.style.display = "none";
    markSeen();
  };

  function renderLibrary(cards) {
    var grid = document.getElementById("libGrid");
    var section = document.getElementById("libSection");
    if (!grid || !section) return;

    grid.innerHTML = "";
    cards.forEach(function (c) {
      var el = document.createElement("button");
      el.className = "lib-card";
      el.type = "button";
      el.innerHTML =
        '<span class="lib-card-icon"><i class="fa-solid ' + c.icon + '"></i></span>' +
        '<span class="lib-card-body">' +
          '<span class="lib-card-title"></span>' +
          '<span class="lib-card-meta"></span>' +
        "</span>" +
        '<span class="lib-card-go"><i class="fa-solid fa-arrow-up-right-from-square"></i></span>';
      el.querySelector(".lib-card-title").textContent = c.title;
      el.querySelector(".lib-card-meta").textContent = c.meta;
      el.addEventListener("click", function () { window.open(c.url, "_blank"); });
      grid.appendChild(el);
    });

    // 받은 자료가 없으면 안내 한 줄
    if (!cards.length) {
      var empty = document.createElement("p");
      empty.className = "lib-empty";
      empty.textContent = "아직 받은 자료가 없어요";
      grid.appendChild(empty);
    }
    section.style.display = "";
  }
})();
