// 2026-11-15 펼친 면(두 쪽) 화면: 대표 확정 시안(왼쪽 세로 줄, 위 가운데 "12–13 / 45쪽", 쪽 옆 북마크·메모, 가운데 접힘 그림자).
// 학생 서재 v2 (book-v3) 2026-11-15 — 에디터 정본 화면 통일. book-v2-viewer.js를 복사해 쪽 그리기·확대·PDF 저장만 BookPage(공통 모듈)로 바꿈.
// PC(휴대폰 아님) + HTML 책 = 에디터 v2와 같은 794×1058 종이를 그대로, 확대는 transform 배율. 휴대폰은 다음 단계라 지금 방식 그대로.
/**
 * book-v2-viewer.js — 에디터(BlockNote)로 만든 책(입문서·단어장 등) 렌더 뷰어
 *  - tr_book_documents(kind='pages') + tr_book_pages 에서 로드
 *  - 페이지별 저장된 html 을 그대로 렌더 (책장 넘기기)
 *  - 학생 이름+이메일 옅은 워터마크
 *  - 다운로드/우클릭 차단
 *
 * 로그인: 테스트룸 로그인 세션(sessionStorage currentUser)이 없으면 책을 불러오지 않고 안내만 보여준다.
 *   (localhost ?dev=1 미리보기만 데모 사용자 허용)
 * 처음 열 때 확인(view_confirm), PDF 저장·인쇄(allow_print)는 책마다 켜고 끈다 (2026-10-28, book-view-confirm.js)
 */
const V2 = { book: null, pages: [], idx: 0, zoom: 17, user: null, progress: null, bookmarks: [], memos: {}, toc: [], hasPParam: false, locked: false };
let progressTimer = null;
// 2026-11-17 관리자 "학생 화면으로 보기": 공홈 관리자 화면(eonfl.com) 안에 넣어 열면, 그 화면이 관리자임을 알려 준 경우에만 미리보기 모드
//  (숨긴 책도 보임, 처음 열 때 확인 건너뜀, 진도·북마크·메모 저장 안 함). 다른 사이트에 넣거나 주소만 바꿔서는 켜지지 않는다.
let ADMIN_PREVIEW = false, PREVIEW_PARENT = null;
const PREVIEW_PARENTS = ["https://eonfl.com", "https://www.eonfl.com"];
function adminPreviewHandshake() {
  const q = new URLSearchParams(location.search);
  if (q.get("preview") !== "admin" || window.parent === window) return Promise.resolve(false);
  const isLocal = (h) => ["localhost", "127.0.0.1", "[::1]"].includes(h);
  return new Promise((resolve) => {
    let done = false;
    const onMsg = (e) => {
      if (!e.data || e.data.type !== "bookv3-preview-ok" || e.source !== window.parent) return;
      let ok = PREVIEW_PARENTS.includes(e.origin);
      if (!ok && isLocal(location.hostname)) { try { ok = isLocal(new URL(e.origin).hostname); } catch (_) {} }
      if (!ok) return;
      done = true; window.removeEventListener("message", onMsg);
      ADMIN_PREVIEW = true; PREVIEW_PARENT = e.origin; document.body.classList.add("v3-admin-preview");
      resolve(true);
    };
    window.addEventListener("message", onMsg);
    try { window.parent.postMessage({ type: "bookv3-preview-hello" }, "*"); } catch (_) {}
    setTimeout(() => { if (!done) { window.removeEventListener("message", onMsg); resolve(false); } }, 5000);
  });
}
const ZOOM_MIN = 13, ZOOM_MAX = 29, ZOOM_STEP = 2, ZOOM_BASE = 17;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  await adminPreviewHandshake();
  resolveUser();
  preventDownload();
  setupWatermark();
  bindEvents();

  // 로그인 안 했으면 책 내용을 불러오지 않고 막는다 (2026-10-28)
  if (!V2.user) {
    V2.locked = true;
    showMaintenance("login");
    return;
  }

  try { const z = parseInt(localStorage.getItem("bookv3_zoom"), 10); if (z) V2.zoom = z; } catch (_) {}

  try {
    await loadBook();
  } catch (e) {
    const l = document.getElementById("loading");
    l.querySelector("p").textContent = "불러오지 못했어요: " + e.message;
    return;
  }

  // 숨김(비공개) 책 → 내용을 흐릿하게 깔고 그 위에 "수정 중" 팝업. ?dev=1 미리보기는 그대로.
  const hiddenForStudent = V2.book && !V2.book.is_active && !isPreview();

  // 특정 학생 공개(selected)인데 내가 대상이 아니면 차단. (?dev=1 미리보기는 통과)
  let accessDenied = false;
  if (!hiddenForStudent && !isPreview() && V2.book && V2.book.audience_mode === "selected") {
    accessDenied = !(await userHasAccess(V2.book.id, V2.user && V2.user.id));
  }

  const blocked = hiddenForStudent || accessDenied;

  // 처음 열 때 확인이 켜진 책인데 이 학생이 아직 안 열어봤으면 확인 창부터 (?dev=1 미리보기는 통과)
  let needConfirm = false;
  if (!blocked && !isPreview() && window.BookViewConfirm && BookViewConfirm.needsConfirm(V2.book)) {
    try { needConfirm = !(await BookViewConfirm.getConfirmedAt(V2.user.id, V2.book.id)); }
    catch (_) { needConfirm = true; }
  }

  // 진도/북마크/메모는 실패해도 읽기는 계속 (막힌 책·확인 전 책은 추적 생략)
  if (!blocked && !needConfirm && !isPreview()) {
    try { await loadProgress(); await loadMemos(); } catch (e) { console.warn("진도/메모 로드 실패:", e); }
  }

  render();
  applyZoom();   // 쪽을 그린 뒤에 잔다(세로 스크롤바가 생긴 실제 폭 기준)
  document.getElementById("loading").style.display = "none";

  if (blocked) {
    V2.locked = true;     // 페이지 넘기기/조작 잠금
    showMaintenance(accessDenied ? "denied" : "hidden");
  } else if (needConfirm) {
    V2.locked = true;
    document.body.classList.add("bookv2-confirming");
    BookViewConfirm.open({
      title: V2.book.title || "자료",
      onConfirm: async () => {
        const at = await BookViewConfirm.saveConfirm(V2.user.id, V2.book.id);
        if (!at) return false;
        V2.locked = false;
        document.body.classList.remove("bookv2-confirming");
        try { await loadProgress(); await loadMemos(); } catch (e) { console.warn("진도/메모 로드 실패:", e); }
        render();
        updatePrintButton();
        return true;
      },
      onCancel: leaveViewer,
    });
  }
  updatePrintButton();
}

// 책 화면에서 나가기: 내 서재에서 새 창으로 열렸으면 창을 닫고, 아니면 뒤로/테스트룸 첫 화면
function leaveViewer() {
  if (ADMIN_PREVIEW) { try { window.parent.postMessage({ type: "bookv3-preview-leave" }, PREVIEW_PARENT); } catch (_) {} return; }
  if (window.opener && !window.opener.closed) { window.close(); return; }
  if (history.length > 1) history.back(); else location.href = "index.html";
}

// 이 학생이 이 책(특정공개)의 대상인지
async function userHasAccess(bookId, userId) {
  if (!userId) return false;
  try {
    const rows = await supabaseSelect(
      "tr_book_access",
      "book_id=eq." + bookId + "&user_id=eq." + userId + "&select=id&limit=1"
    );
    return !!(rows && rows.length);
  } catch (_) {
    return false; // 테이블 미적용 등 → 안전하게 접근 불가
  }
}

// ?dev=1 미리보기(숨김·지정 학생·처음 열 때 확인 건너뜀)는 내 컴퓨터(localhost)에서만 (2026-10-28)
function isPreview() {
  if (ADMIN_PREVIEW) return true;
  return new URLSearchParams(location.search).get("dev") === "1" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
}
function showMaintenance(reason) {
  document.getElementById("loading").style.display = "none";
  if (reason === "login") {
    const icon = document.getElementById("maintIcon");
    const title = document.getElementById("maintTitle");
    const desc = document.getElementById("maintDesc");
    const btn = document.getElementById("maintBack");
    if (icon) icon.textContent = "🔐";
    if (title) title.textContent = "로그인이 필요해요";
    if (desc) desc.innerHTML = "테스트룸에 로그인한 뒤<br><b>마이페이지 &gt; 내 서재</b>에서 열어주세요.";
    if (btn) btn.textContent = "테스트룸으로 가기";
  }
  if (reason === "denied") {
    const icon = document.getElementById("maintIcon");
    const title = document.getElementById("maintTitle");
    const desc = document.getElementById("maintDesc");
    if (icon) icon.textContent = "🔒";
    if (title) title.textContent = "아직 열람 권한이 없는 자료예요";
    if (desc) desc.innerHTML = "이 자료는 지정된 학생에게만 공개돼요.<br><b>선생님께 문의해 주세요!</b>";
  }
  document.getElementById("maintOverlay").classList.add("open");
}

// 로그인 사용자. 없으면 null (localhost ?dev=1 미리보기만 데모 사용자)
function resolveUser() {
  let u = null;
  try { u = JSON.parse(sessionStorage.getItem("currentUser") || "null"); } catch (_) {}
  if ((!u || !u.id) && isPreview()) u = { id: "demo-preview", name: "데모 학생", email: "demo@eontoefl.com" };
  if (ADMIN_PREVIEW) u = { id: "demo-preview", name: "예시 학생", email: "student@example.com" };   // 관리자 미리보기: 실제 로그인과 상관없이 예시 학생 (기록 안 남김)
  V2.user = (u && u.id) ? u : null;
}

// 진도/북마크 로드 (tr_book_progress 재사용, 없으면 생성)
async function loadProgress() {
  const rows = await supabaseSelect(
    "tr_book_progress",
    "user_id=eq." + V2.user.id + "&book_id=eq." + V2.book.id + "&limit=1"
  );
  if (rows && rows.length) V2.progress = rows[0];
  else V2.progress = await supabaseInsert("tr_book_progress", {
    user_id: V2.user.id, book_id: V2.book.id,
    last_page: 1, max_page_reached: 1, is_completed: false, bookmarks: []
  });
  V2.bookmarks = (V2.progress && Array.isArray(V2.progress.bookmarks)) ? V2.progress.bookmarks : [];

  // 이어보기: ?p 지정이 없으면 마지막으로 본 페이지로
  // 반복 책을 끝까지 본 뒤(완독 창을 안 닫고 나간 경우 등) 다시 열면 뒷표지가 아니라 1쪽부터 (2026-10-29)
  if (!V2.hasPParam && V2.progress && V2.progress.is_completed && V2.progress.last_page >= (V2.lastInner === undefined ? V2.pages.length : V2.lastInner + 1) && isRepeatBook()) {
    V2.progress.last_page = 1;
  }
  if (!V2.hasPParam && V2.progress && V2.progress.last_page > 1) {
    V2.idx = Math.min(V2.progress.last_page - 1, V2.pages.length - 1);
  }
}

async function loadBook() {
  // ?book=<id> 있으면 그 책, 없으면 (구동작) 첫 'pages' 책
  const bookId = new URLSearchParams(location.search).get("book");
  let books;
  if (bookId) {
    books = await supabaseSelect(
      "tr_book_documents",
      "id=eq." + bookId + "&kind=eq.pages&limit=1"
    );
  } else {
    books = await supabaseSelect(
      "tr_book_documents",
      "kind=eq.pages&order=sort_order.asc&limit=1"
    );
  }
  if (!books || books.length === 0) throw new Error("자료를 찾을 수 없어요.");
  V2.book = books[0];
  document.getElementById("bookTitle").textContent = V2.book.title || "자료";
  document.title = (V2.book.title || "자료") + " – 내벨업 테스트룸";
  const doneTitle = document.getElementById("doneTitle");
  if (doneTitle) doneTitle.textContent = (V2.book.title || "자료") + " 완독!";

  // 버전 협업 책은 삭제된 쪽을 deleted_at으로 남긴다(논리삭제). 그 열이 아직 없는 DB에서는 예전 조회로.
  const pageQuery = "book_id=eq." + V2.book.id + "&order=sort_order.asc&select=id,sort_order,html";
  let livePages = null;
  try { livePages = await supabaseSelect("tr_book_pages", pageQuery + "&deleted_at=is.null"); } catch (_) { livePages = null; }
  V2.pages = livePages && livePages.length ? livePages : await supabaseSelect("tr_book_pages", pageQuery);
  if (!V2.pages || V2.pages.length === 0) throw new Error("페이지가 없어요.");
  // 커버(2026-11-15 대표 결정): 책 쪽 = 인쇄 내지만. 마지막 뒷커버 쪽은 쪽이 아니라 BACK COVER 목업으로,
  // 앞커버는 book-covers/<책 id>.json 의 그림을 FRONT COVER 목업으로 보여준다. (PC 펼친 면 화면에서만)
  V2.covers = { front: null, back: null };
  { const pp = parseInt(new URLSearchParams(location.search).get("p"), 10); V2.hasPParamPending = !!pp; }
  if (V2.pages.length > 1 && V2.pages.every((p) => typeof p.html === "string" && p.html.trim().startsWith('<div class="twp">'))) {
    const lastHtml = V2.pages[V2.pages.length - 1].html || "";
    const lm = lastHtml.match(/class="page([^"]*)"/);
    const isCov = (h) => /data-book-kind="cover"/.test(h || "");
    if (isCov(V2.pages[0].html) && isCov(lastHtml)) {
      // 표지가 쪽 번호 안에 있는 책(내벨업보카): 1쪽 = 앞커버, 마지막 쪽 = 뒷커버를 목업으로만 보이고 쪽 번호는 그대로 둔다
      // (일정표·단어 시험·진도·북마크가 원래 쪽 번호에 묶여 있음, 2026-11-16 대표)
      V2.covers.front = V2.pages[0].html; V2.covers.back = lastHtml;
      V2.firstInner = 1; V2.lastInner = V2.pages.length - 2;
    } else {
      if ((lm && /\b(cover|cvp)\b/.test(lm[1])) || isCov(lastHtml)) { V2.covers.back = lastHtml; V2.pages = V2.pages.slice(0, -1); }
      // 앞커버 그림: Supabase 저장소 guide-images/book/covers/<책 id>.json (2026-11-17, 저장소 파일 book-covers에서 옮김)
      try { const cr = await fetch(SUPABASE_CONFIG.url + "/storage/v1/object/public/guide-images/book/covers/" + V2.book.id + ".json?t=" + Date.now(), { cache: "no-store" }); if (cr.ok) { const cj = await cr.json(); if (cj && cj.front) V2.covers.front = cj.front; } } catch (_) {}
    }
  }
  if (V2.firstInner === undefined) { V2.firstInner = 0; V2.lastInner = V2.pages.length - 1; }
  V2.spiral = !!(V2.covers.front || V2.covers.back);
  if (V2.spiral && !V2.hasPParamPending) V2.idx = V2.covers.front ? V2.firstInner - 1 : V2.firstInner;
  document.getElementById("totPage").textContent = V2.pages.length;
  document.getElementById("jumpMax").textContent = V2.pages.length;

  buildToc();

  // ?p=N 으로 특정 페이지부터 (테스트/딥링크용, 1-기준)
  const pParam = parseInt(new URLSearchParams(location.search).get("p"), 10);
  if (pParam && pParam >= 1 && pParam <= V2.pages.length) { V2.idx = pParam - 1; V2.hasPParam = true; }
}

// 페이지들의 대제목(h1/h2)에서 목차 자동 생성
function buildToc() {
  V2.toc = [];
  const parser = new DOMParser();
  const T = window.BookTheme;
  const jumps = T && T.jumpPages && V2.book ? T.jumpPages(V2.book.id, V2.pages.length) : [];
  V2.pages.forEach((p, idx) => {
    // 쪽 바로가기 (예: 단어장 10쪽)
    if (jumps.includes(idx + 1)) V2.toc.push({ title: (idx + 1) + "쪽", level: 1, idx: idx, page: true });
    const doc = parser.parseFromString(p.html || "", "text/html");
    doc.querySelectorAll("h1, h2").forEach((h) => {
      // 차례 쪽의 항목(제목 전체가 링크)은 목차에 넣지 않는다.
      const linked = Array.from(h.querySelectorAll("a")).map((a) => a.textContent).join("").replace(/\s/g, "");
      if (linked && linked === (h.textContent || "").replace(/\s/g, "")) return;
      const title = (h.textContent || "").trim();
      if (title) V2.toc.push({ title: title, level: h.tagName === "H1" ? 1 : 2, idx: idx });
    });
  });
}

// 이온토플 입문서 테마: 쪽 종류와 장 색을 표시한다(내용은 바꾸지 않음).
function applyBookTheme(el) {
  const T = window.BookTheme;
  if (!T || !V2.book) return;
  if (!T.isThemed(V2.book.id)) { T.applyPage(el, null); return; }
  V2.themeMetas = V2.themeMetas || T.classify(V2.pages, V2.book.id);
  const meta = V2.themeMetas[V2.idx];
  T.applyPage(el, meta);
  T.decorateReader(el, meta);
}

// 종이 그대로 그리기(BookPage)를 쓸지: PC + 모든 쪽이 HTML 쪽인 책
function useBP() { return !!(window.BookPage && !isPhone() && isHtmlBook()); }
// 펼친 면(2026-11-15 대표 확정 시안): 실제 책처럼 두 쪽을 붙여 보여준다.
// 앞표지 = 오른쪽에 혼자, 2·3쪽, 4·5쪽 … 뒤표지 = 왼쪽에 혼자. 창이 좁아 두 쪽이 너무 작아지면 한 쪽씩.
function ensureBP() {
  if (document.getElementById("v3Book")) return;
  const side = (s) => '<div class="v3-side ' + s + '">' +
    '<button class="v3-sbtn" data-act="bm" title="이 쪽 북마크"><i class="fa-regular fa-bookmark"></i></button>' +
    '<button class="v3-sbtn" data-act="memo" title="이 쪽 메모"><i class="fa-regular fa-comment-dots"></i><span class="v3-dot"></span></button></div>';
  const book = document.createElement("div"); book.id = "v3Book"; book.className = "v3-book";
  book.innerHTML =
    '<div class="v3-sheet l" id="v3SheetL">' + side("l") + '<div class="bp-box" id="bpBoxL"><div id="bpHostL"></div></div></div>' +
    '<div class="v3-sheet r" id="v3SheetR">' + side("r") + '<div class="bp-box" id="bpBoxR"><div id="bpHostR"></div></div></div>' +
    '<div class="v3-wm"></div>';
  const paper = document.getElementById("paper");
  paper.appendChild(book);
  const wm = document.getElementById("watermark"); if (wm) book.querySelector(".v3-wm").appendChild(wm);
  document.body.classList.add("bookv3-bp");
  book.querySelectorAll(".v3-sbtn").forEach((b) => b.addEventListener("click", () => {
    const i = parseInt(b.closest(".v3-sheet").dataset.idx, 10);
    if (isNaN(i) || V2.locked) return;
    if (b.dataset.act === "bm") toggleBookmark(i);
    else if (isMemoOpen() && V2.memoIdx === i) closeMemo(); else openMemo(i);
  }));
  // 책 안 링크: "?p=N"(차례 등)은 이 책의 N쪽으로 넘기고, 바깥 주소는 새 창으로 (2026-11-15)
  book.addEventListener("click", (e) => {
    const el = e.composedPath().find((n) => n && n.tagName === "A");
    if (!el) return;
    const href = el.getAttribute("href") || "";
    const m = href.match(/[?&]p=(\d+)/);
    e.preventDefault();
    if (m && !/^https?:/i.test(href)) {
      const n = parseInt(m[1], 10) - 1;
      if (n >= 0 && n < V2.pages.length && !V2.locked) { V2.idx = n; render(); }
      return;
    }
    if (/^https?:/i.test(href)) window.open(href, "_blank", "noopener");
  });
  const bmE = document.getElementById("bmEmpty"); if (bmE) bmE.innerHTML = '아직 북마크가 없어요.<br>쪽 옆 <i class="fa-regular fa-bookmark"></i> 버튼으로 추가할 수 있어요.';
  const mmE = document.getElementById("memoEmpty"); if (mmE) mmE.innerHTML = '아직 메모가 없어요.<br>쪽 옆 <i class="fa-regular fa-comment-dots"></i> 버튼으로 남길 수 있어요.';
}
// 마지막 쪽이 뒤표지면 혼자 보여준다 (W1: page cover back, 단어장 v2: page cvp)
function backAlone() {
  if (V2.backAlone === undefined) {
    const n = V2.pages.length, h = n > 1 ? (V2.pages[n - 1].html || "") : "";
    const m = h.match(/class="page([^"]*)"/);
    V2.backAlone = !!(m && /\b(cover|cvp)\b/.test(m[1]));
  }
  return V2.backAlone;
}
// 지금 보이는 [왼쪽, 오른쪽] 쪽 번호(0부터). 빈 자리는 null. 한 쪽 보기면 [null, i]
function coverLo() { return V2.spiral && V2.covers.front ? V2.firstInner - 1 : V2.firstInner; }
function coverHi() { return V2.spiral && V2.covers.back ? V2.lastInner + 1 : V2.lastInner; }
function isCoverView(i) { return !!V2.spiral && ((!!V2.covers.front && i === V2.firstInner - 1) || (!!V2.covers.back && i === V2.lastInner + 1)); }
function spreadOf(i) {
  const last = V2.pages.length - 1;
  if (isCoverView(i)) return [];
  if (!V2.two) return [null, i];
  if (V2.spiral) {
    // 첫 내지 쪽은 오른쪽에 혼자, 그 뒤로 두 쪽씩. 마지막 내지 쪽이 남으면 왼쪽에 혼자
    const f = V2.firstInner, l = V2.lastInner;
    if (i <= f) return [null, f];
    const L = (i - f) % 2 === 1 ? i : i - 1, R = L + 1;
    return [L, R <= l ? R : null];
  }
  if (i <= 0) return [null, 0];
  if (backAlone() && i === last) return [last, null];
  const L = i % 2 === 1 ? i : i - 1, R = L + 1;
  return [L, R <= last && !(backAlone() && R === last) ? R : null];
}
function visibleIdx() {
  if (!document.getElementById("v3Book")) return isCoverView(V2.idx) ? [] : [V2.idx];
  return spreadOf(V2.idx).filter((x) => x !== null);
}
function lastVisible() { const v = visibleIdx(); if (!v.length) return V2.idx < V2.firstInner ? V2.idx : V2.pages.length - 1; return Math.max.apply(null, v); }
// 넘김 기준: 커버 화면이면 커버 자리(-1 / 쪽 수)를 그대로
function edgeIdx(dir) { const v = visibleIdx(); if (!v.length) return V2.idx; return dir > 0 ? Math.max.apply(null, v) : Math.min.apply(null, v); }
// 화면 맞춤 배율과 두 쪽/한 쪽 판단. 두 쪽 배율이 한 쪽 배율의 85%보다 작아지면 한 쪽씩.
function bpLayout() {
  const stage = document.querySelector(".bookv2-stage");
  const cs = getComputedStyle(stage);
  const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2 * 44;
  const one = Math.min(availH / BookPage.H, availW / BookPage.W);
  const twoS = Math.min(availH / BookPage.H, availW / (2 * BookPage.W));
  const two = twoS >= one * 0.85;
  return { two: two, fit: Math.max(0.2, two ? twoS : one) };
}
function placeBP() {
  if (V2.flip && !V2.flip.busy) V2.flip.end();
  const lay = bpLayout();
  const s = lay.fit * (V2.zoom / ZOOM_BASE);
  V2.bpScale = s;
  ["L", "R"].forEach((k) => BookPage.place(document.getElementById("bpBox" + k), document.getElementById("bpHost" + k), s));
  document.getElementById("zoomLevel").textContent = Math.round((V2.zoom / ZOOM_BASE) * 100) + "%";
  try { localStorage.setItem("bookv3_zoom", String(V2.zoom)); } catch (_) {}
}
function renderSpread() {
  V2.two = bpLayout().two;
  const book = document.getElementById("v3Book");
  book.classList.toggle("spiral", !!V2.spiral);
  const cover = isCoverView(V2.idx) ? (V2.idx < V2.firstInner ? "front" : "back") : "";
  book.classList.toggle("cover-front", cover === "front");
  book.classList.toggle("cover-back", cover === "back");
  if (cover) {
    // 커버 목업: 한 장만 가운데, 스프링은 앞커버 왼쪽 / 뒷커버 오른쪽
    const keep = cover === "front" ? "R" : "L", drop = keep === "R" ? "L" : "R";
    const ks = document.getElementById("v3Sheet" + keep), ds = document.getElementById("v3Sheet" + drop);
    ks.classList.remove("empty", "blank"); ks.classList.add("coverpg"); ks.dataset.idx = "";
    ds.classList.add("empty"); ds.classList.remove("blank", "coverpg"); ds.dataset.idx = "";
    BookPage.render(document.getElementById("bpHost" + keep), cover === "front" ? V2.covers.front : V2.covers.back);
    BookPage.render(document.getElementById("bpHost" + drop), "");
    book.classList.remove("two"); book.classList.toggle("single", !V2.two);
    document.getElementById("btnPageJump").innerHTML = '<span class="v3-cv">' + (cover === "front" ? "FRONT COVER" : "BACK COVER") + '</span>';
    buildCoil(cover === "front" ? "l" : "r");
    placeBP();
    return;
  }
  const sp = spreadOf(V2.idx);
  ["L", "R"].forEach((k) => document.getElementById("v3Sheet" + k).classList.remove("coverpg"));
  book.classList.toggle("two", (sp[0] !== null && sp[1] !== null) || (!!V2.spiral && V2.two));
  book.classList.toggle("single", !V2.two);
  book.classList.toggle("no-l", V2.two && sp[0] === null);
  book.classList.toggle("no-r", V2.two && sp[1] === null);
  [["L", sp[0]], ["R", sp[1]]].forEach(([k, i]) => {
    const sheet = document.getElementById("v3Sheet" + k);
    const empty = i === null;
    // 스프링 책: 1쪽 왼쪽·마지막 쪽 오른쪽은 화면에만 있는 하얀 빈 면 (쪽 아님)
    const blank = empty && !!V2.spiral && V2.two;
    sheet.classList.toggle("blank", blank);
    sheet.classList.toggle("empty", empty && !blank);
    sheet.dataset.idx = empty ? "" : String(i);
    BookPage.render(document.getElementById("bpHost" + k), empty ? "" : (V2.pages[i].html || ""));
  });
  const vis = visibleIdx(), n = V2.pages.length;
  const label = vis.length === 2 ? (vis[0] + 1) + "–" + (vis[1] + 1) : String(vis[0] + 1);
  document.getElementById("btnPageJump").innerHTML = '<span class="v3-pn">' + label + '</span><span class="v3-pt">/ ' + n + '쪽</span>';
  buildCoil(V2.spiral && V2.two ? "c" : "");
  placeBP();
}
// 스프링(대표 확정 (가) 연한 은색 이중 와이어). side: l=앞커버 왼쪽, r=뒷커버 오른쪽, c=펼친 면 가운데, ""=없음
function buildCoil(side) {
  // 2026-11-16 대표 선택 (가) 은색 이중 와이어: 종이 구멍 + 둥근 철사 두 가닥 + 그림자·광택
  const book = document.getElementById("v3Book");
  let c = document.getElementById("v3Coil");
  if (!side) { if (c) c.remove(); return; }
  if (!c) { c = document.createElement("div"); c.id = "v3Coil"; book.appendChild(c); }
  if (c.dataset.side !== side) {
    const cx = 36, hx = 17;
    const hole = (x) => '<rect x="' + (x - 2.6) + '" y="4.6" width="5.2" height="6.8" rx="1.4" fill="url(#v3cHole)"/>';
    const wire = (p) => '<path d="' + p + '" transform="translate(1.2 3.4)" fill="none" stroke="#2E2940" stroke-opacity=".08" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="' + p + '" transform="translate(1.2 3.2)" fill="none" stroke="#2E2940" stroke-opacity=".14" stroke-width="2" stroke-linecap="round"/>' +   // 흐림 필터 대신 겹친 선(넘김 효과 가볍게)
      '<path d="' + p + '" fill="none" stroke="url(#v3cMetal)" stroke-width="1.9" stroke-linecap="round"/>' +
      '<path d="' + p + '" transform="translate(0 -.55)" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width=".6" stroke-linecap="round"/>';
    let loop = "";
    [-1.9, 1.9].forEach((d) => {
      const y = 8 + d;
      if (side === "c") loop += wire("M " + (cx - hx) + " " + y + " C " + (cx - hx + 3) + " " + (y - 7) + ", " + (cx + hx - 3) + " " + (y - 7) + ", " + (cx + hx) + " " + y);
      else if (side === "l") loop += wire("M " + (cx + 14) + " " + y + " C " + (cx + 11) + " " + (y - 7) + ", " + (cx - 3) + " " + (y - 8) + ", " + (cx - 7) + " " + (y - 1));
      else loop += wire("M " + (cx - 14) + " " + y + " C " + (cx - 11) + " " + (y - 7) + ", " + (cx + 3) + " " + (y - 8) + ", " + (cx + 7) + " " + (y - 1));
    });
    const holes = side === "c" ? hole(cx - hx) + hole(cx + hx) : side === "l" ? hole(cx + 14) : hole(cx - 14);
    const one = '<svg viewBox="0 0 72 16" preserveAspectRatio="none">' + holes + loop + '</svg>';
    let s = '<svg class="v3-coil-defs" width="0" height="0" aria-hidden="true"><defs>' +
      '<linearGradient id="v3cMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".35" stop-color="#E9EBF0"/><stop offset=".6" stop-color="#A9AEBA"/><stop offset=".85" stop-color="#7D8290"/><stop offset="1" stop-color="#C9CCD4"/></linearGradient>' +
      '<radialGradient id="v3cHole" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#2E2940" stop-opacity=".75"/><stop offset=".7" stop-color="#4A4560" stop-opacity=".55"/><stop offset="1" stop-color="#8A84A0" stop-opacity=".25"/></radialGradient>' +
      '</defs></svg>';
    if (side === "c") s += '<b class="v3-coil-gut"></b>';
    for (let k = 0; k < 30; k++) s += '<i style="top:' + ((k + 0.5) / 30 * 100).toFixed(3) + '%">' + one + '</i>';
    c.innerHTML = s; c.dataset.side = side;
  }
  c.className = "v3-coil " + side;
  const k = Math.max(0.5, Math.min(3, (book.offsetHeight || 740) / 740));
  c.style.setProperty("--k", k.toFixed(3));
  if (!V2.coilRO && window.ResizeObserver) {
    V2.coilRO = new ResizeObserver(() => { const cc = document.getElementById("v3Coil"), bb = document.getElementById("v3Book"); if (cc && bb && bb.offsetHeight) cc.style.setProperty("--k", Math.max(0.5, Math.min(3, bb.offsetHeight / 740)).toFixed(3)); });
    V2.coilRO.observe(book);
  }
}
// 책장 넘김 효과 (2026-11-15 대표 선택 (가)): 넘어가는 쪽이 가운데 접힘을 축으로 0.4초 동안 돈다.
// 두 쪽 면 → 두 쪽 면일 때만. 표지처럼 한 쪽 면이 끼거나, 한 쪽 보기, 움직임 줄이기 설정이면 바로 넘김.
// 넘어가는 중에 또 누르면 효과를 끝내고 바로 넘어간다(빨리 넘기는 학생).
const FLIP_MS = 400, SLIDE_MS = 240;
function htmlAt(i) { return (i === null || i === undefined || !V2.pages[i]) ? "" : (V2.pages[i].html || ""); }
// 넘김 효과(2026-11-15 대표: 모든 넘김에 효과, 앞커버는 펼치듯, 마지막은 책을 덮듯).
// 넘어가는 중에 또 누르면 효과를 끝내고 바로 넘어간다. 한 쪽 보기·움직임 줄이기 설정이면 바로 넘김.
function flipTo(n, dir) {
  let instant = false;
  if (V2.flip) { V2.flip.end(); instant = true; }
  const fromIdx = V2.idx;
  V2.idx = n;
  const reduce = (() => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } })();
  const book = document.getElementById("v3Book");
  if (instant || reduce || !V2.two || !V2.bpScale || typeof Element.prototype.animate !== "function") { render(); return; }
  const fromCover = isCoverView(fromIdx) ? (fromIdx < V2.firstInner ? "front" : "back") : "";
  const toCover = isCoverView(n) ? (n < V2.firstInner ? "front" : "back") : "";
  const s = V2.bpScale, Wp = BookPage.W * s;
  const sheet = (k) => document.getElementById("v3Sheet" + k), host = (k) => document.getElementById("bpHost" + k);
  const anims = []; let leaf = null, done = false;
  const end = () => {
    if (done) return; done = true;
    anims.forEach((x) => { try { x.cancel(); } catch (_) {} });
    if (leaf) leaf.remove();
    book.style.transform = "";
    ["L", "R"].forEach((k) => { sheet(k).style.opacity = ""; });
    book.classList.remove("flipping", "covering");
    document.body.classList.remove("v3-flipping");
    V2.flip = null;
    render();
  };
  V2.flip = { end: end, busy: false };
  document.body.classList.add("v3-flipping");
  if (fromCover || toCover) book.classList.add("covering");
  const quietRender = () => { V2.flip.busy = true; render(); V2.flip.busy = false; };
  const slide = (from, to) => new Promise((res) => {
    const x = book.animate([{ transform: "translateX(" + from + "px)" }, { transform: "translateX(" + to + "px)" }], { duration: SLIDE_MS, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
    anims.push(x); x.onfinish = res; x.oncancel = res;
  });
  const stopSlides = () => { anims.splice(0).forEach((x) => { try { x.cancel(); } catch (_) {} }); book.style.transform = ""; };
  // side 쪽 종이가 가운데 접힘(스프링)을 축으로 넘어간다. 앞면 = 지금 보이는 것, 뒷면 = 넘어간 뒤 보이는 것
  const turn = (side, frontH, backH) => new Promise((res) => {
    const fwd = side === "R";
    leaf = document.createElement("div");
    leaf.className = "v3-leaf " + (fwd ? "fwd" : "back");
    leaf.style.left = sheet(side).offsetLeft + "px";
    leaf.style.width = Math.round(Wp) + "px";
    leaf.style.height = Math.round(BookPage.H * s) + "px";
    const face = (cls, html) => {
      const f = document.createElement("div"); f.className = "v3-face " + cls;
      const box = document.createElement("div"); box.className = "bp-box";
      const h = document.createElement("div"); box.appendChild(h); f.appendChild(box);
      const sh = document.createElement("div"); sh.className = "v3-shade"; f.appendChild(sh);
      BookPage.render(h, html || ""); BookPage.place(box, h, s);
      return f;
    };
    const fr = face("front", frontH), bk = face("back", backH);
    leaf.append(fr, bk); book.appendChild(leaf); book.classList.add("flipping");
    const x = leaf.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(" + (fwd ? -180 : 180) + "deg)" }], { duration: FLIP_MS, easing: "cubic-bezier(.35,.05,.25,1)" });
    const y = fr.querySelector(".v3-shade").animate([{ opacity: 0 }, { opacity: 0.28 }], { duration: FLIP_MS / 2, easing: "ease-in", fill: "forwards" });
    const z = bk.querySelector(".v3-shade").animate([{ opacity: 0.28 }, { opacity: 0 }], { duration: FLIP_MS / 2, delay: FLIP_MS / 2, easing: "ease-out", fill: "both" });
    anims.push(x, y, z); x.onfinish = res; x.oncancel = res;
  });
  (async () => {
    if (fromCover === "front" && !toCover) {
      // 앞커버 펼치기: 커버가 오른쪽 자리로 옮겨 간 뒤, 왼쪽으로 넘어가며 1쪽이 드러남. 왼쪽 빈 면 = 커버 안쪽
      await slide(0, Wp / 2); if (done) return;
      stopSlides(); quietRender();
      sheet("L").style.opacity = "0"; book.classList.remove("two");
      await turn("R", V2.covers.front, ""); end(); return;
    }
    if (fromCover === "back" && !toCover) {
      // 뒷커버 다시 펼치기
      await slide(0, -Wp / 2); if (done) return;
      stopSlides(); quietRender();
      sheet("R").style.opacity = "0"; book.classList.remove("two");
      await turn("L", V2.covers.back, htmlAt(spreadOf(n)[1])); end(); return;   // 마지막 면 오른쪽에 쪽이 있으면(내벨업보카 60–61) 그 쪽이 드러남
    }
    if (!fromCover && toCover === "back") {
      // 책 덮기: 오른쪽 빈 면(뒷커버 안쪽)이 왼쪽으로 넘어와 마지막 쪽을 덮고, 뒷커버가 가운데로
      sheet("R").style.opacity = "0"; book.classList.remove("two");
      await turn("R", htmlAt(spreadOf(fromIdx)[1]), V2.covers.back); if (done) return;   // 오른쪽에 쪽이 있으면 그 쪽이 넘어가며 뒷커버가 됨
      BookPage.render(host("L"), V2.covers.back); if (leaf) { leaf.remove(); leaf = null; }
      await slide(0, Wp / 2); end(); return;
    }
    if (!fromCover && toCover === "front") {
      // 앞커버 덮기 (1쪽에서 뒤로)
      sheet("L").style.opacity = "0"; book.classList.remove("two");
      await turn("L", "", V2.covers.front); if (done) return;
      BookPage.render(host("R"), V2.covers.front); if (leaf) { leaf.remove(); leaf = null; }
      await slide(0, -Wp / 2); end(); return;
    }
    if (!fromCover && !toCover) {
      const old = spreadOf(fromIdx), nw = spreadOf(n);
      const twoish = (sp) => sp.length === 2 && (V2.spiral || (sp[0] !== null && sp[1] !== null));
      if (!twoish(old) || !twoish(nw)) { end(); return; }
      quietRender();
      // 넘어가는 동안 반대쪽은 옛 쪽(또는 빈 면)을 그대로
      BookPage.render(host(dir > 0 ? "L" : "R"), htmlAt(dir > 0 ? old[0] : old[1]));
      await turn(dir > 0 ? "R" : "L", htmlAt(dir > 0 ? old[1] : old[0]), htmlAt(dir > 0 ? nw[0] : nw[1]));
      end(); return;
    }
    end();
  })();
}

function updateSides() {
  document.querySelectorAll("#v3Book .v3-sheet").forEach((sheet) => {
    const i = parseInt(sheet.dataset.idx, 10);
    if (isNaN(i)) return;
    const uid = V2.pages[i] && V2.pages[i].id;
    const bm = sheet.querySelector('[data-act="bm"]'), mm = sheet.querySelector('[data-act="memo"]');
    const on = V2.bookmarks.indexOf(uid) !== -1;
    bm.classList.toggle("on", on);
    bm.querySelector("i").className = on ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark";
    const can = !!V2.progress || isPreview();   // ?dev=1 미리보기: 버튼은 보이고 저장은 안 함
    bm.hidden = !can; mm.hidden = !can;
    mm.classList.toggle("has", hasMemo(uid));
    mm.classList.toggle("open", isMemoOpen() && V2.memoIdx === i);
  });
}
function render() {
  const p = V2.pages[V2.idx];
  const bp = useBP();
  if (bp) {
    ensureBP();
    renderSpread();
    document.getElementById("content").innerHTML = "";
  } else {
    const cEl = document.getElementById("content");
    const covKind = isCoverView(V2.idx) ? (V2.idx < V2.firstInner ? "front" : "back") : "";
    document.body.classList.toggle("v3-ph-cover-on", !!covKind);
    if (covKind && window.BookPage) {
      // 휴대폰 커버 화면 (2026-11-17 대표: 앞커버·뒷커버 둘 다 보이기)
      cEl.innerHTML = '<div class="v3-ph-cover"><div class="v3-ph-cover-box"><div class="v3-ph-cover-host"></div></div><div class="v3-ph-cover-cap">' + (covKind === "front" ? "FRONT COVER" : "BACK COVER") + "</div></div>";
      const box = cEl.querySelector(".v3-ph-cover-box"), host = cEl.querySelector(".v3-ph-cover-host");
      BookPage.render(host, covKind === "front" ? V2.covers.front : V2.covers.back);
      const w = Math.max(200, (cEl.clientWidth || window.innerWidth - 40));
      BookPage.place(box, host, Math.min(w / BookPage.W, (window.innerHeight - 160) / BookPage.H));
    } else {
      cEl.innerHTML = p ? p.html || "" : "";
      window.BookPageFooter?.decorateReader(cEl);
      applyBookTheme(cEl);
    }
  }
  enableMedia();
  const cur = document.getElementById("curPage"); if (cur) cur.textContent = V2.idx + 1;
  const vis = visibleIdx();
  const pct = V2.pages.length ? Math.round(((lastVisible() + 1) / V2.pages.length) * 100) : 0;
  document.getElementById("progressFill").style.width = Math.max(0, pct) + "%";
  const lo = coverLo(), hi = coverHi();
  document.getElementById("btnPrev").disabled = (vis.length ? Math.min.apply(null, vis) : V2.idx) <= lo;
  document.getElementById("btnNext").disabled = (vis.length ? Math.max.apply(null, vis) : V2.idx) >= hi;
  updateBookmarkBtn();
  updateMemoDot();
  updateTocCurrent();
  if (isMemoOpen()) refreshMemoPanel();
  debounceSaveProgress();

  if (typeof phSync === "function" && PH.on) setTimeout(phSync, 0);   // 휴대폰 바(쪽수·메모 점) 갱신
  // 페이지 넘기면 맨 위로
  window.scrollTo({ top: 0, behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
  if (typeof PH !== "undefined" && PH.on) phToTop();   // 휴대폰: 손가락으로 밀던 관성이 남아 있어도 새 쪽은 맨 위부터 (2026-11-17 실제 아이폰 확인)
  const paper = document.getElementById("paper");
  if (paper) paper.scrollTop = 0;
  if (bp) { const st = document.querySelector(".bookv2-stage"); st.scrollTop = 0; st.scrollLeft = Math.max(0, (st.scrollWidth - st.clientWidth) / 2); }
}

// 영상/음성에 재생 컨트롤 부여 (lossy HTML엔 controls가 없음) + 다운로드 버튼 숨김
function enableMedia() {
  document.querySelectorAll("#content video, #content audio").forEach((el) => {
    el.controls = true;
    el.setAttribute("controlsList", "nodownload noplaybackrate");
    el.setAttribute("playsinline", "");
    el.disablePictureInPicture = true;
    if (!el.preload) el.preload = "metadata";
  });
}

function go(delta) {
  if (V2.locked) return;
  if (document.getElementById("v3Book")) {
    // 펼친 면 단위로 넘김
    const n = edgeIdx(delta) + (delta > 0 ? 1 : -1);
    if (n < coverLo() || n > coverHi()) return;
    if (isMemoOpen()) closeMemo();
    flipTo(n, delta > 0 ? 1 : -1);
    return;
  }
  const n = V2.idx + delta;
  if (n >= coverLo() && n <= coverHi()) {   // 커버 화면(앞커버 = 첫 쪽 앞, 뒷커버 = 끝 쪽 뒤)까지
    if (isMemoOpen()) closeMemo();
    V2.idx = n;
    render();
  }
}

// ===== 확대/축소 =====
// 모든 책을 종이째(프레임 포함) 배율로 키운다. 글자 크기가 고정된 책(꾸밈 책·HTML 책)도 똑같이 커지고,
// PDF 뷰어처럼 종이 폭도 같이 커져 화면보다 커지면 옆으로 밀어서 본다 (2026-10-29 꾸밈 책, 2026-11-13 모든 책으로 통일)
function applyZoom() {
  V2.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, V2.zoom));
  const paper = document.getElementById("paper");
  if (useBP() && document.getElementById("v3Book")) {
    // 100% = 펼친 면이 화면에 꽉 차는 크기. 확대·축소는 그 배율에 곱함(종이째 transform). 창 크기가 바뀌어 두 쪽/한 쪽이 바뀌면 다시 그림.
    if (bpLayout().two !== V2.two) render(); else placeBP();
    return;
  }
  if (false) {
    // 100% = 실제 크기(794px). 창이 좁으면 종이째 줄여 맞춤. 확대·축소는 그 배율에 곱함. 종이 안 배치는 늘 100%로 한 번만 계산(transform).
    const stage = document.querySelector(".bookv2-stage");
    const cs = getComputedStyle(stage);
    const navs = [...stage.querySelectorAll(".bookv2-nav")].reduce((s, b) => s + b.offsetWidth, 0);
    const gap = parseFloat(cs.columnGap || cs.gap) || 0;
    const avail = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - navs - gap * 2;
    const fit = Math.min(1, Math.max(0.2, avail / BookPage.W));
    const s = fit * (V2.zoom / ZOOM_BASE);
    paper.style.zoom = ""; paper.style.maxWidth = "none"; paper.style.flexShrink = "0";
    BookPage.place(document.getElementById("bpBox"), document.getElementById("bpHost"), s);
    paper.style.width = Math.round(BookPage.W * s) + "px";
    document.getElementById("zoomLevel").textContent = Math.round((V2.zoom / ZOOM_BASE) * 100) + "%";
    try { localStorage.setItem("bookv3_zoom", String(V2.zoom)); } catch (_) {}
    return;
  }
  // 100%일 때 종이 폭을 재서 그 폭에 배율을 곱한다. 잴 때만 줄어들 수 있게 해서 양쪽 버튼 자리를 뺨 폭으로 잔다
  // (안 그러면 태블릿 폭에서 100%인데도 옆으로 넘침)
  paper.style.zoom = ""; paper.style.width = ""; paper.style.maxWidth = ""; paper.style.flexShrink = "1";
  const base = paper.getBoundingClientRect().width;
  paper.style.flexShrink = "";
  paper.style.width = Math.round(base) + "px";
  paper.style.maxWidth = "none";
  paper.style.zoom = (V2.zoom / ZOOM_BASE).toFixed(3);
  document.getElementById("zoomLevel").textContent = Math.round((V2.zoom / ZOOM_BASE) * 100) + "%";
  try { localStorage.setItem("bookv3_zoom", String(V2.zoom)); } catch (_) {}
}
function zoomBy(d) { V2.zoom += d; applyZoom(); }
let zoomResizeTimer = null;
window.addEventListener("resize", () => { clearTimeout(zoomResizeTimer); zoomResizeTimer = setTimeout(() => { if (V2.book) applyZoom(); }, 150); });

// ===== 페이지 이동 모달 =====
function openJump() {
  document.getElementById("jumpInput").value = "";
  document.getElementById("jumpOverlay").classList.add("open");
  setTimeout(() => document.getElementById("jumpInput").focus(), 100);
}
function closeJump() {
  document.getElementById("jumpOverlay").classList.remove("open");
}
function confirmJump() {
  const v = parseInt(document.getElementById("jumpInput").value, 10);
  if (!v || v < 1 || v > V2.pages.length) return;
  V2.idx = v - 1;
  render();
  closeJump();
}

// ===== 북마크 ===== (tr_book_progress.bookmarks 에 page_uid 배열로 저장)
function curIdx() { return (typeof V2.memoIdx === "number") ? V2.memoIdx : V2.idx; }
function curUid() { const i = curIdx(); return V2.pages[i] ? V2.pages[i].id : null; }
function isBookmarked() { return V2.bookmarks.indexOf(curUid()) !== -1; }

function updateBookmarkBtn() {
  if (document.getElementById("v3Book")) updateSides();
  const btn = document.getElementById("btnBookmark");
  if (!btn) return;
  const on = isBookmarked();
  btn.classList.toggle("bookmarked", on);
  btn.querySelector("i").className = on ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark";
}

async function toggleBookmark(i) {
  const uid = (typeof i === "number" && V2.pages[i]) ? V2.pages[i].id : curUid();
  if (!V2.progress && isPreview()) {   // 미리보기: 화면에서만 바꿈(저장 안 함)
    V2.bookmarks = V2.bookmarks.indexOf(uid) !== -1 ? V2.bookmarks.filter((x) => x !== uid) : V2.bookmarks.concat([uid]);
    updateBookmarkBtn(); renderBookmarks(); return;
  }
  if (!V2.progress) return;
  let bm = V2.bookmarks.slice();
  if (bm.indexOf(uid) !== -1) bm = bm.filter((x) => x !== uid);
  else bm.push(uid);
  const res = await supabaseUpdate("tr_book_progress", "id=eq." + V2.progress.id, { bookmarks: bm, updated_at: new Date().toISOString() });
  if (res) { V2.bookmarks = bm; updateBookmarkBtn(); renderBookmarks(); }
}

async function removeBookmark(uid) {
  if (!V2.progress) return;
  const bm = V2.bookmarks.filter((x) => x !== uid);
  const res = await supabaseUpdate("tr_book_progress", "id=eq." + V2.progress.id, { bookmarks: bm, updated_at: new Date().toISOString() });
  if (res) { V2.bookmarks = bm; updateBookmarkBtn(); renderBookmarks(); }
}

function renderBookmarks() {
  const list = document.getElementById("bmList");
  const empty = document.getElementById("bmEmpty");
  const items = V2.bookmarks
    .map((uid) => ({ uid, idx: V2.pages.findIndex((p) => p.id === uid) }))
    .filter((x) => x.idx >= 0)
    .sort((a, b) => a.idx - b.idx);

  if (!items.length) { list.innerHTML = ""; empty.style.display = "block"; return; }
  empty.style.display = "none";
  list.innerHTML = items.map((it) =>
    '<div class="bookv2-bm-item" data-uid="' + it.uid + '">' +
      '<span><i class="fa-solid fa-bookmark"></i> ' + (it.idx + 1) + (document.getElementById("v3Book") ? '쪽' : '페이지') + '</span>' +
      '<button class="bookv2-bm-remove" title="삭제"><i class="fa-solid fa-xmark"></i></button>' +
    '</div>'
  ).join("");

  list.querySelectorAll(".bookv2-bm-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".bookv2-bm-remove")) { e.stopPropagation(); removeBookmark(el.dataset.uid); return; }
      const i = V2.pages.findIndex((p) => p.id === el.dataset.uid);
      if (i >= 0) { V2.idx = i; render(); closeSidebar(); }
    });
  });
}

function isSidebarOpen() { return document.getElementById("sidebar").classList.contains("open"); }
function isMemoOpen() { return document.getElementById("memoPanel").classList.contains("open"); }
function syncOverlay() {
  document.getElementById("sidebarOverlay").classList.toggle("open", isSidebarOpen() || isMemoOpen());
}
function openSidebar() {
  closeMemo();
  renderToc();
  renderBookmarks();
  renderMemoList();
  document.getElementById("sidebar").classList.add("open");
  syncOverlay();
}

function switchTab(name) {
  document.getElementById("sidebar").dataset.tab = name;
  document.querySelectorAll(".v3-rail [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  document.querySelectorAll(".bookv2-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.getElementById("tabToc").classList.toggle("hidden", name !== "toc");
  document.getElementById("tabBm").classList.toggle("hidden", name !== "bm");
  document.getElementById("tabMemo").classList.toggle("hidden", name !== "memo");
}

// 목차 렌더
function renderToc() {
  const list = document.getElementById("tocList");
  const empty = document.getElementById("tocEmpty");
  if (!V2.toc.length) { list.innerHTML = ""; empty.style.display = "block"; return; }
  empty.style.display = "none";
  // "07 첫 단어 ~ 끝 단어" 꼴 제목(단어장 v2 단어 쪽): 번호 칩 + 첫 단어 윗줄, 끝 단어 아랫줄
  const RANGE_TITLE = /^(\d{2,3})\s+(.+?)\s+~\s+(.+)$/;
  list.innerHTML = V2.toc.map((it) => {
    const rg = it.title.match(RANGE_TITLE);
    if (rg) return '<div class="bookv2-toc-item lv' + it.level + ' rg' + (visibleIdx().indexOf(it.idx) !== -1 ? ' current' : '') + '" data-idx="' + it.idx + '">' +
      '<span class="bookv2-toc-chip">' + escapeHtml(rg[1]) + '</span>' +
      '<span class="bookv2-toc-rg"><b>' + escapeHtml(rg[2]) + '</b><span>~ ' + escapeHtml(rg[3]) + '</span></span>' +
    '</div>';
    return '<div class="bookv2-toc-item lv' + it.level + (visibleIdx().indexOf(it.idx) !== -1 ? ' current' : '') + '" data-idx="' + it.idx + '">' +
      '<span class="bookv2-toc-title">' + escapeHtml(it.title) + '</span>' +
      '<span class="bookv2-toc-page">' + (it.idx + 1) + '</span>' +
    '</div>';
  }).join("");
  list.querySelectorAll(".bookv2-toc-item").forEach((el) => {
    el.addEventListener("click", () => { V2.idx = parseInt(el.dataset.idx, 10); render(); closeSidebar(); });
  });
}
function updateTocCurrent() {
  document.querySelectorAll("#tocList .bookv2-toc-item").forEach((el) => {
    el.classList.toggle("current", visibleIdx().indexOf(parseInt(el.dataset.idx, 10)) !== -1);
  });
}

// 메모 목록 (메모 단 페이지 + 미리보기)
function renderMemoList() {
  const list = document.getElementById("memoList");
  const empty = document.getElementById("memoEmpty");
  const items = Object.keys(V2.memos)
    .map((uid) => ({ uid, idx: V2.pages.findIndex((p) => p.id === uid), content: V2.memos[uid].content || "" }))
    .filter((x) => x.idx >= 0)
    .sort((a, b) => a.idx - b.idx);

  if (!items.length) { list.innerHTML = ""; empty.style.display = "block"; return; }
  empty.style.display = "none";
  list.innerHTML = items.map((it) =>
    '<div class="bookv2-memo-item" data-uid="' + it.uid + '">' +
      '<div class="bookv2-memo-item-top"><i class="fa-regular fa-comment-dots"></i> ' + (it.idx + 1) + (document.getElementById("v3Book") ? '쪽' : '페이지') + '</div>' +
      '<div class="bookv2-memo-item-preview">' + escapeHtml(it.content) + '</div>' +
    '</div>'
  ).join("");

  list.querySelectorAll(".bookv2-memo-item").forEach((el) => {
    el.addEventListener("click", () => {
      const i = V2.pages.findIndex((p) => p.id === el.dataset.uid);
      if (i >= 0) { V2.idx = i; render(); closeSidebar(); openMemo(document.getElementById("v3Book") ? i : undefined); }
    });
  });
}
function closeSidebar() {
  document.querySelectorAll(".v3-rail [data-tab]").forEach((b) => b.classList.remove("on"));
  document.getElementById("sidebar").classList.remove("open");
  syncOverlay();
}

// ===== 메모 ===== (tr_book_memos 재사용, page_uid 로 저장)
async function loadMemos() {
  const rows = await supabaseSelect(
    "tr_book_memos",
    "user_id=eq." + V2.user.id + "&book_id=eq." + V2.book.id + "&select=id,page_uid,content"
  );
  V2.memos = {};
  if (rows) rows.forEach((m) => { if (m.page_uid) V2.memos[m.page_uid] = m; });
}

function hasMemo(uid) { return !!V2.memos[uid]; }
function updateMemoDot() {
  if (document.getElementById("v3Book")) updateSides();
  const dot = document.getElementById("memoDot");
  if (dot) dot.classList.toggle("on", hasMemo(curUid()));
}

function refreshMemoPanel() {
  const memo = V2.memos[curUid()];
  document.getElementById("memoPageLabel").textContent = (curIdx() + 1) + (document.getElementById("v3Book") ? "쪽 메모" : "페이지 메모");
  const ta = document.getElementById("memoText");
  ta.value = memo ? (memo.content || "") : "";
  document.getElementById("memoCount").textContent = ta.value.length;
  document.getElementById("btnMemoDelete").classList.toggle("hidden", !memo);
}

function openMemo(i) {
  V2.memoIdx = (typeof i === "number") ? i : null;
  closeSidebar();
  refreshMemoPanel();
  // 펼친 면에서 왼쪽 쪽 메모는 오른쪽에서 열어 그 쪽이 가려지지 않게
  const lIdx = document.getElementById("v3SheetL") ? parseInt(document.getElementById("v3SheetL").dataset.idx, 10) : NaN;
  document.getElementById("memoPanel").classList.toggle("at-right", !!(V2.two && V2.memoIdx !== null && V2.memoIdx === lIdx));
  document.getElementById("memoPanel").classList.add("open");
  syncOverlay();
  if (document.getElementById("v3Book")) updateSides();
  setTimeout(() => document.getElementById("memoText").focus(), 200);
}
function closeMemo() {
  document.getElementById("memoPanel").classList.remove("open");
  syncOverlay();
  V2.memoIdx = null;
  if (document.getElementById("v3Book")) updateSides();
}

async function saveMemo() {
  const uid = curUid();
  const content = document.getElementById("memoText").value.trim();
  if (!content) { showToast("메모 내용을 입력해 주세요."); return; }

  if (!V2.progress && isPreview()) {   // 미리보기: 화면에서만(저장 안 함)
    V2.memos[uid] = { id: "preview", page_uid: uid, content: content };
    updateMemoDot(); renderMemoList(); closeMemo(); showToast("미리보기라 저장하지 않았어요."); return;
  }
  const btn = document.getElementById("btnMemoSave");
  btn.disabled = true;
  try {
    const existing = V2.memos[uid];
    let res;
    if (existing) {
      res = await supabaseUpdate("tr_book_memos", "id=eq." + existing.id, { content: content, updated_at: new Date().toISOString() });
    } else {
      res = await supabaseInsert("tr_book_memos", { user_id: V2.user.id, book_id: V2.book.id, page_uid: uid, content: content });
    }
    if (res) { V2.memos[uid] = res; updateMemoDot(); renderMemoList(); closeMemo(); showToast("메모를 저장했어요."); }
    else showToast("저장하지 못했어요. 다시 시도해 주세요.");
  } catch (e) {
    console.warn(e); showToast("저장하지 못했어요. 다시 시도해 주세요.");
  } finally { btn.disabled = false; }
}

async function deleteMemo() {
  const uid = curUid();
  const existing = V2.memos[uid];
  if (!existing) return;
  if (!confirm("이 메모를 삭제할까요?")) return;
  if (existing.id === "preview") { delete V2.memos[uid]; updateMemoDot(); renderMemoList(); closeMemo(); return; }
  const ok = await supabaseDelete("tr_book_memos", "id=eq." + existing.id);
  if (ok) { delete V2.memos[uid]; updateMemoDot(); renderMemoList(); closeMemo(); showToast("메모를 지웠어요."); }
}

// ===== 진도(이어보기) + 완독 =====
function debounceSaveProgress() {
  clearTimeout(progressTimer);
  progressTimer = setTimeout(saveProgress, 1000);
}
async function saveProgress() {
  if (!V2.progress) return;
  if (V2.idx < 0) return;   // 앞커버(쪽이 아닌 경우)는 진도에 넣지 않음
  const seen = Math.min(V2.pages.length, lastVisible() + 1);   // 펼친 면이면 오른쪽 쪽까지 본 것으로
  const maxReached = Math.max(V2.progress.max_page_reached || 1, seen);
  const isCompleted = maxReached >= (V2.lastInner === undefined ? V2.pages.length : V2.lastInner + 1);   // 마지막 내지 쪽까지 보면 완독
  const wasCompleted = V2.progress.is_completed;
  const res = await supabaseUpdate("tr_book_progress", "id=eq." + V2.progress.id, {
    last_page: Math.max(1, seen), max_page_reached: maxReached, is_completed: isCompleted, updated_at: new Date().toISOString()
  });
  if (res) {
    V2.progress.last_page = seen;
    V2.progress.max_page_reached = maxReached;
    V2.progress.is_completed = isCompleted;
    if (isCompleted && !wasCompleted) showDone();
  }
}
// 반복해서 외우는 책(회독 책)인지: 책 안에 '회독'(회독 기록 쪽·회독 안내)이 있으면 반복 책.
// 단어장 v1·v2, W1 문장배열 암기장. 책 모양(꾸밈 책·HTML 책)과 상관없이 내용으로 판단한다 (2026-11-13)
function isRepeatBook() {
  if (V2.isRepeat === undefined) V2.isRepeat = !!(V2.pages && V2.pages.some((p) => typeof p.html === "string" && p.html.includes("회독")));
  return V2.isRepeat;
}
// 완독 창. 반복 책은 "다시 1쪽부터" 안내. 문구는 그 책의 공부법과 같은 말로 한다.
// 기본 = 단어장 4쪽 공부방법 (2026-10-29). 책마다 공부법이 다르면 여기에 책 id로 적는다(없으면 기본 문구).
const REPEAT_DONE_DESC = {
  // W1 문장배열 암기장: 8쪽 공부법(A4로 가리고 조각 순서대로 적기) + 43쪽 회독 기록 (2026-11-14)
  "f2800a43-0fd0-4bd7-81c9-6d9a14407a79": "회독 기록 쪽에 끝낸 날을 적고, UNIT 01부터 다시 외워 봐요.<br>A4 용지를 들춰 보지 않고 모든 조각을 순서대로 맞힐 때까지 반복해요.",
};
function showDone() {
  if (isRepeatBook()) {
    document.getElementById("doneTitle").textContent = (V2.book.title || "자료") + " 1회독 끝!";
    document.querySelector("#doneOverlay .bookv2-done-desc").innerHTML = REPEAT_DONE_DESC[V2.book.id] || "이제 1쪽으로 돌아가 다시 외워볼 차례예요.<br>들춰보지 않고 다 쓸 수 있을 때까지 반복해요.";
    V2.restartOnClose = true;   // [확인] 누르면 1쪽으로
  }
  document.getElementById("doneOverlay").classList.add("open");
}

// 간단 토스트
function showToast(msg) {
  let t = document.querySelector(".bookv2-toast");
  if (t) t.remove();
  t = document.createElement("div");
  t.className = "bookv2-toast";
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2200);
}

function bindEvents() {
  setTimeout(() => { try { setupPhoneUI(); } catch (e) { console.warn("휴대폰 바", e); } }, 0);
  document.getElementById("btnPrev").addEventListener("click", () => go(-1));
  document.getElementById("btnNext").addEventListener("click", () => go(1));
  document.getElementById("btnBack").addEventListener("click", () => { if (ADMIN_PREVIEW) leaveViewer(); else history.back(); });
  document.getElementById("maintBack").addEventListener("click", () => {
    if (!V2.user) { location.href = "index.html"; return; }   // 로그인 안내 → 테스트룸 첫 화면(로그인)
    if (history.length > 1) history.back(); else location.href = "index.html";
  });

  // PDF 저장·인쇄
  document.getElementById("btnPrint").addEventListener("click", printBook);
  window.addEventListener("beforeprint", () => { if (canPrint()) buildPrintRoot(); });

  // 왼쪽 세로 줄(펼친 면 화면)
  const rb = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
  rb("railBack", () => leaveViewer());
  rb("railPrint", printBook);
  ["toc", "bm", "memo"].forEach((t) => rb("rail" + t[0].toUpperCase() + t.slice(1), () => {
    const sb = document.getElementById("sidebar");
    if (isSidebarOpen() && sb.dataset.tab === t) { closeSidebar(); return; }
    openSidebar(); switchTab(t);
  }));

  // 줌
  document.getElementById("btnZoomIn").addEventListener("click", () => zoomBy(ZOOM_STEP));
  document.getElementById("btnZoomOut").addEventListener("click", () => zoomBy(-ZOOM_STEP));

  // 북마크
  document.getElementById("btnBookmark").addEventListener("click", toggleBookmark);
  document.getElementById("btnSidebar").addEventListener("click", openSidebar);
  document.getElementById("btnSidebarClose").addEventListener("click", closeSidebar);
  document.getElementById("sidebarOverlay").addEventListener("click", () => { closeSidebar(); closeMemo(); });
  document.querySelectorAll(".bookv2-tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));

  // 완독 모달 닫기
  document.getElementById("doneClose").addEventListener("click", () => {
    document.getElementById("doneOverlay").classList.remove("open");
    // 단어장: 완독 창을 닫으면 1쪽부터 다시 (2026-10-29)
    if (V2.restartOnClose) { V2.restartOnClose = false; V2.idx = coverLo(); render(); }
  });

  // 메모
  document.getElementById("btnMemo").addEventListener("click", () => { isMemoOpen() ? closeMemo() : openMemo(); });
  document.getElementById("btnMemoClose").addEventListener("click", closeMemo);
  document.getElementById("btnMemoSave").addEventListener("click", saveMemo);
  document.getElementById("btnMemoDelete").addEventListener("click", deleteMemo);
  document.getElementById("memoText").addEventListener("input", () => {
    document.getElementById("memoCount").textContent = document.getElementById("memoText").value.length;
  });

  // 페이지 이동 모달
  document.getElementById("btnPageJump").addEventListener("click", openJump);
  document.getElementById("jumpConfirm").addEventListener("click", confirmJump);
  document.getElementById("jumpCancel").addEventListener("click", closeJump);
  document.getElementById("jumpOverlay").addEventListener("click", (e) => { if (e.target.id === "jumpOverlay") closeJump(); });
  document.getElementById("jumpInput").addEventListener("keydown", (e) => { if (e.key === "Enter") confirmJump(); });

  document.addEventListener("keydown", (e) => {
    if (V2.locked) return; // 수정 중(잠금) 상태면 키 조작 무시
    // 모달 열려있거나 입력창에 포커스면 페이지 넘기기 무시
    if (document.getElementById("jumpOverlay").classList.contains("open")) return;
    if (e.target && e.target.tagName === "INPUT") return;
    if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "+" || e.key === "=") zoomBy(ZOOM_STEP);
    else if (e.key === "-") zoomBy(-ZOOM_STEP);
  });

  // 모바일 스와이프
  let sx = 0, sy = 0, moved = false;
  const stage = document.querySelector(".bookv2-stage");
  stage.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; moved = false; }, { passive: true });
  stage.addEventListener("touchmove", () => { moved = true; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (!moved) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  }, { passive: true });
}

// 학생 이름+이메일 옅은 워터마크 타일 + 하단 보안 띠
function setupWatermark() {
  const u = V2.user || { name: "학생", email: "" };
  const name = u.name || "학생";
  const email = u.email || "";

  // 옅은 타일 (사후 추적 + "코드가 곳곳에" 의 시각적 근거)
  const text = name + "   ·   " + email;
  const wm = document.getElementById("watermark");
  let html = "";
  for (let i = 0; i < 15; i++) html += "<span>" + escapeHtml(text) + "</span>";
  wm.innerHTML = html;

  // 하단 보안 띠 (또렷한 사전 억제)
  const guard = document.getElementById("guardText");
  if (guard) {
    guard.innerHTML =
      "<b>" + escapeHtml(email || name) + "</b> 전용 사본 · 화면 곳곳에 보이지 않는 식별코드가 삽입되어 있어 " +
      "캡처·복사·공유 시 자동으로 추적됩니다";
  }
}

// 다운로드/우클릭/단축키 차단
function preventDownload() {
  const inField = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("dragstart", (e) => e.preventDefault());
  document.addEventListener("copy", (e) => { if (!inField(e.target)) e.preventDefault(); });
  document.addEventListener("keydown", (e) => {
    const k = (e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "p" && canPrint()) { e.preventDefault(); printBook(); return; }
    if ((e.ctrlKey || e.metaKey) && ["s", "p", "u", "c", "a"].indexOf(k) !== -1 && !inField(e.target)) e.preventDefault();
  });
}

// ===== PDF 저장·인쇄 (2026-10-28) =====
// 책마다 allow_print를 켠 경우만. 전체 쪽을 인쇄용 묶음(#printRoot)으로 만들고 쪽마다 학생 이름·이메일을 찍는다.
// 꺼진 책·잠긴 책(숨김/권한 없음/처음 열 때 확인 전)은 인쇄 메뉴로 찍어도 안내 문구만 나온다 (CSS @media print).
function canPrint() {
  return !!(V2.book && V2.book.allow_print && V2.user && !V2.locked && V2.pages && V2.pages.length);
}
// 휴대폰: 터치 화면 + 화면 짧은 쪽이 600px 미만 (아이폰·갤럭시). 태블릿·PC는 해당 안 됨
function isPhone() {
  if (isPreview() && new URLSearchParams(location.search).get("phone") === "1") return true;   // 내 컴퓨터 확인용: 휴대폰 화면 강제 (dev만)
  try { return window.matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) < 600; }
  catch (_) { return false; }
}
function updatePrintButton() {
  const ok = canPrint();
  const phone = isPhone();
  const b = document.getElementById("btnPrint");
  if (b) b.hidden = !ok || phone;
  const rp = document.getElementById("railPrint"); if (rp) rp.hidden = !ok || phone;   // 휴대폰에서는 인쇄 버튼을 보여주지 않음 (2026-10-29)
  document.body.classList.toggle("bookv2-print-ok", ok);
  if (ok && !phone) setTimeout(buildPrintRoot, 0);   // 이미지가 미리 받아지도록 먼저 만들어 둔다 (휴대폰은 생략)
}
function isHtmlBook() {
  return !!(V2.pages && V2.pages.length && V2.pages.every((p) => typeof p.html === "string" && p.html.trim().startsWith('<div class="twp">')));
}
function buildPrintRoot() {
  let root = document.getElementById("printRoot");
  if (root && root.dataset.book === String(V2.book.id)) return root;
  if (!root) {
    root = document.createElement("div");
    root.id = "printRoot";
    root.className = "bookv2-print-root";
    root.setAttribute("aria-hidden", "true");
    document.body.appendChild(root);
  }
  root.dataset.book = String(V2.book.id);
  root.innerHTML = "";
  const T = window.BookTheme;
  const themed = !!(T && T.isThemed(V2.book.id));
  const metas = themed ? (V2.themeMetas = V2.themeMetas || T.classify(V2.pages, V2.book.id)) : null;
  const stampText = (V2.user.name || "학생") + " · " + (V2.user.email || "") + " 전용";
  // HTML 책(모든 쪽이 인쇄 쪽 그대로인 <div class="twp">): 인쇄본과 같은 210×280 종이에 여백·축소 없이 한 쪽씩. 이름·이메일은 위에 겹쳐 찍는다 (2026-11-13)
  if (isHtmlBook()) {
    root.classList.add("is-html");
    let pg = document.getElementById("printPageHtml");
    if (!pg) { pg = document.createElement("style"); pg.id = "printPageHtml"; document.head.appendChild(pg); }
    pg.textContent = "@media print { @page { size: 210mm 280mm; margin: 0; } }";
    V2.pages.forEach((p) => {
      const sheet = document.createElement("section");
      sheet.className = "bookv2-print-html";
      // 에디터 v2·서재와 같은 BookPage 종이 그대로(축소 없음)
      const host = document.createElement("div");
      host.className = "bp-print-host";
      BookPage.render(host, p.html || "");
      host.shadowRoot.querySelectorAll("video, audio, iframe").forEach((m) => m.remove());
      const st = document.createElement("span");
      st.className = "bookv2-print-stamp";
      st.textContent = stampText;
      sheet.append(host, st);
      root.appendChild(sheet);
    });
    return root;
  }
  const old = document.getElementById("printPageHtml"); if (old) old.remove();
  root.classList.remove("is-html");
  // 책 한 쪽 = A4 한 장. 표지·뒷표지는 종이를 꽉 채우고, 나머지 쪽은 여백 안에 들어가도록 쪽마다 크기를 줄인다(fitPrintPages).
  V2.pages.forEach((p, i) => {
    const isCover = !!(themed && metas[i] && metas[i].kind === "cover");
    const sheet = document.createElement("section");
    sheet.className = isCover ? "bookv2-print-cover" : "bookv2-print-sheet";
    const st = document.createElement("span");
    st.className = "bookv2-print-stamp";
    st.textContent = stampText;
    const art = document.createElement("article");
    art.className = "bookv2-content book-content";
    art.innerHTML = p.html || "";
    window.BookPageFooter?.decorateReader(art);
    if (T) {
      if (themed) { T.applyPage(art, metas[i]); T.decorateReader(art, metas[i]); }
      else T.applyPage(art, null);
    }
    art.querySelectorAll("video, audio, iframe").forEach((m) => m.remove());
    if (isCover) { sheet.append(art, st); }
    else {
      const fitBox = document.createElement("div");
      fitBox.className = "bookv2-print-fit";
      fitBox.appendChild(art);
      sheet.append(st, fitBox);
    }
    root.appendChild(sheet);
  });
  fitPrintPages(root);
  return root;
}

// 쪽마다 내용이 칸(A4에서 여백 뺀 높이)에 다 들어가는 가장 큰 배율을 찾아 zoom으로 준다 (최대 1배)
function fitPrintPages(root) {
  root.classList.add("is-measuring");   // 화면 밖에서 인쇄와 같은 폭으로 펼쳐 놓고 잰다
  root.querySelectorAll(".bookv2-print-fit").forEach((box) => {
    const art = box.firstElementChild;
    if (!art) return;
    const avail = box.clientHeight;
    let z = 1;
    art.style.zoom = "1";
    for (let k = 0; k < 4; k++) {
      const h = art.getBoundingClientRect().height;
      if (!h) break;
      if (h <= avail && (z >= 1 || avail - h < avail * 0.01)) break;
      z = Math.min(1, z * (avail / h) * (h > avail ? 0.995 : 1));
      art.style.zoom = String(z);
    }
    // 마지막 확인: 그래도 넘치면 조금씩 더 줄임
    for (let k = 0; k < 10 && art.getBoundingClientRect().height > avail; k++) { z *= 0.97; art.style.zoom = String(z); }
    art.dataset.zoom = z.toFixed(3);
  });
  root.classList.remove("is-measuring");
}

let printing = false;
async function printBook() {
  if (!canPrint() || printing) return;
  printing = true;
  const btn = document.getElementById("btnPrint");
  if (btn) btn.disabled = true;
  showToast("인쇄 준비 중이에요...");
  try {
    const root = buildPrintRoot();
    // 이미지·글꼴이 다 받아진 뒤 인쇄 (최대 8초)
    const imgs = Array.from(root.querySelectorAll("img"));
    imgs.forEach((im) => { im.loading = "eager"; });
    const waitImgs = Promise.all(imgs.map((im) => im.complete ? null : new Promise((r) => { im.addEventListener("load", r, { once: true }); im.addEventListener("error", r, { once: true }); })));
    const waitFonts = document.fonts && document.fonts.ready ? document.fonts.ready : null;
    await Promise.race([Promise.all([waitImgs, waitFonts]), new Promise((r) => setTimeout(r, 8000))]);
    fitPrintPages(root);   // 이미지가 들어온 뒤 높이가 바뀌므로 다시 맞춤
    window.print();
  } finally {
    printing = false;
    if (btn) btn.disabled = false;
  }
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}


// =====================================================================
// 휴대폰 화면 (2026-11-17 대표 선택 (나) 몰입형): 읽을 때는 오른쪽 위 쪽수와 맨 위 진행 막대만.
// 화면을 한 번 누르거나 위로 살짝 밀면 위 바(뒤로·제목·북마크)와 아래 바(이전·목차·메모·글자 크기·다음)가 나온다.
// 쪽 맨 위와 맨 끝에서는 저절로 나온다. 옆으로 밀면 쪽을 넘긴다. 휴대폰(isPhone)에서만 켜진다.
// =====================================================================
const PH = { on: false, ui: true, lastY: 0, size: 1, mute: 0 };   // mute: 쪽 넘김·글자 크기 바꾼 직후 생기는 스크롤은 무시
function phEl(id) { return document.getElementById(id); }
function setupPhoneUI() {
  if (!isPhone() || PH.on) return;
  PH.on = true;
  document.body.classList.add("v3-phone");
  document.documentElement.style.touchAction = "manipulation";   // 빠르게 두 번 눌러도 화면이 확대되지 않게 (두 손가락 확대는 그대로)
  const pill = document.createElement("div"); pill.id = "v3PhPage"; pill.className = "v3-ph-page"; document.body.appendChild(pill);
  const bar = document.createElement("div"); bar.id = "v3PhBar"; bar.className = "v3-ph-bar";
  // 2026-11-17 대표 선택 (다-2) 반투명 유리: 양 끝 동그라미 = 쪽 넘기기(화살표만), 가운데 알약 = 목차(쪽수)·메모·글자 크기
  bar.innerHTML =
    '<button type="button" class="v3-ph-nav v3-ph-glass prev" id="phPrev" aria-label="이전 쪽"><i class="fa-solid fa-arrow-left"></i></button>' +
    '<div class="v3-ph-pill v3-ph-glass">' +
      '<button type="button" class="v3-ph-tool" id="phToc" aria-label="목차"><i class="fa-solid fa-list-ul"></i><span id="phTocTxt">목차</span></button>' +
      '<button type="button" class="v3-ph-tool" id="phMemo" aria-label="메모"><i class="fa-regular fa-comment-dots"></i><span>메모</span><b class="v3-ph-dot" id="phMemoDot"></b></button>' +
      '<button type="button" class="v3-ph-tool" id="phText" aria-label="글자 크기"><i class="fa-solid fa-font"></i><span id="phTextTxt">글자</span></button>' +
    '</div>' +
    '<button type="button" class="v3-ph-nav v3-ph-glass next" id="phNext" aria-label="다음 쪽"><i class="fa-solid fa-arrow-right"></i></button>';
  document.body.appendChild(bar);
  phEl("phPrev").addEventListener("click", (e) => { e.stopPropagation(); go(-1); });
  phEl("phNext").addEventListener("click", (e) => { e.stopPropagation(); go(1); });
  phEl("phToc").addEventListener("click", (e) => { e.stopPropagation(); openSidebar(); try { switchTab("toc"); } catch (_) {} });
  phEl("phMemo").addEventListener("click", (e) => { e.stopPropagation(); isMemoOpen() ? closeMemo() : openMemo(); });
  phEl("phText").addEventListener("click", (e) => { e.stopPropagation(); phTextSize(true); phShow(true); });
  try { PH.size = parseFloat(localStorage.getItem("v3PhText") || "1") || 1; } catch (_) {}
  phTextSize(false);
  // 보이기·숨기기
  PH.lastY = window.scrollY;
  window.addEventListener("scroll", () => {
    const y = window.scrollY, d = y - PH.lastY; PH.lastY = y;
    if (Date.now() < PH.mute) return;
    const atTop = y < 30, atEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 40;
    if (atTop || atEnd) return phShow(true);
    if (d > 6) phShow(false); else if (d < -6) phShow(true);
  }, { passive: true });
  document.addEventListener("click", (e) => {
    if (!PH.on) return;
    if (e.target.closest("a,button,input,textarea,select,label,[role=button],.v3-ph-bar,.bookv2-top,.bookv2-sidebar,.bookv2-memo-panel,.bookv2-modal-overlay,.bookv2-overlay,video,audio")) return;
    if (!e.target.closest("#paper,.bookv2-stage")) return;
    phShow(!PH.ui);
  });
  // 옆으로 밀어 넘기기
  let sx = 0, sy = 0, st = 0;
  document.addEventListener("touchstart", (e) => { if (e.touches.length !== 1) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now(); }, { passive: true });
  document.addEventListener("touchend", (e) => {
    const t = e.changedTouches && e.changedTouches[0]; if (!t || !st) return;
    const dx = t.clientX - sx, dy = t.clientY - sy, dt = Date.now() - st; st = 0;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && dt < 700 && !document.body.classList.contains("bookv2-sidebar-open")) go(dx < 0 ? 1 : -1);
  }, { passive: true });
  // 처음 한 번만 안내
  try { if (!localStorage.getItem("v3PhHint")) { localStorage.setItem("v3PhHint", "1"); const h = document.createElement("div"); h.className = "v3-ph-hint"; h.textContent = "화면을 누르면 메뉴가 나와요"; document.body.appendChild(h); setTimeout(() => h.classList.add("out"), 2600); setTimeout(() => h.remove(), 3200); } } catch (_) {}
  phSync(); phShow(true);
}
function phShow(v) { PH.ui = !!v; document.body.classList.toggle("v3-ui", PH.ui); }
function phTextSize(step) {
  const sizes = [1, 1.15, 1.3];
  if (step) PH.size = sizes[(sizes.indexOf(PH.size) + 1) % sizes.length] || 1;
  PH.mute = Date.now() + 500;
  const c = document.getElementById("content"); if (c) c.style.zoom = PH.size === 1 ? "" : String(PH.size);
  try { localStorage.setItem("v3PhText", String(PH.size)); } catch (_) {}
  const t = phEl("phTextTxt"); if (t) t.textContent = PH.size === 1 ? "글자" : Math.round(PH.size * 100) + "%";
}
function phSync() {
  if (!PH.on) return;
  const tot = V2.pages.length, cov = isCoverView(V2.idx) ? (V2.idx < V2.firstInner ? "앞커버" : "뒷커버") : "";
  const cur = V2.idx + 1;
  const pill = phEl("v3PhPage"); if (pill) pill.innerHTML = cov ? "<b>" + cov + "</b>" : "<b>" + cur + "</b> / " + tot;
  const tt = phEl("phTocTxt"); if (tt) tt.textContent = cov || (cur + " / " + tot);
  const bmb = document.getElementById("btnBookmark"); if (bmb) bmb.disabled = !!cov;
  const mmb = phEl("phMemo"); if (mmb) mmb.disabled = !!cov;
  const md = phEl("phMemoDot"), dot = document.getElementById("memoDot"); if (md) md.classList.toggle("on", !!(dot && dot.classList.contains("on")));
  const pv = phEl("phPrev"), nx = phEl("phNext"), bp = document.getElementById("btnPrev"), bn = document.getElementById("btnNext");
  if (pv && bp) pv.disabled = bp.disabled; if (nx && bn) nx.disabled = bn.disabled;
  phTextSize(false);
  PH.mute = Date.now() + 500; PH.lastY = window.scrollY; phShow(true);
}

// 휴대폰에서 쪽을 넘길 때 맨 위로. 아이폰은 손가락으로 민 뒤 관성이 남아 있으면 scrollTo를 무시해서,
// 잠깐 스크롤을 멈췄다가(overflow hidden) 맨 위로 보내고, 그림·글꼴이 늦게 들어와도 몇 번 더 맞춘다.
function phToTop() {
  const el = document.scrollingElement || document.documentElement;
  const go0 = () => { window.scrollTo(0, 0); el.scrollTop = 0; document.body.scrollTop = 0; PH.lastY = 0; };
  PH.mute = Date.now() + 700;
  el.style.overflow = "hidden"; go0();
  requestAnimationFrame(() => { el.style.overflow = ""; go0(); });
  [60, 180, 400].forEach((t) => setTimeout(() => { if (window.scrollY > 0 && Date.now() < PH.mute) go0(); }, t));
  phShow(true);
}
