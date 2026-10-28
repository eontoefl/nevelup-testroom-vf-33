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
const ZOOM_MIN = 13, ZOOM_MAX = 29, ZOOM_STEP = 2, ZOOM_BASE = 17;

document.addEventListener("DOMContentLoaded", init);

async function init() {
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

  try { const z = parseInt(localStorage.getItem("bookv2_zoom"), 10); if (z) V2.zoom = z; } catch (_) {}

  try {
    await loadBook();
  } catch (e) {
    const l = document.getElementById("loading");
    l.querySelector("p").textContent = "불러오기 실패: " + e.message;
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
  if (!blocked && !needConfirm) {
    try { await loadProgress(); await loadMemos(); } catch (e) { console.warn("진도/메모 로드 실패:", e); }
  }

  applyZoom();
  render();
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

  V2.pages = await supabaseSelect(
    "tr_book_pages",
    "book_id=eq." + V2.book.id + "&order=sort_order.asc&select=id,sort_order,html"
  );
  if (!V2.pages || V2.pages.length === 0) throw new Error("페이지가 없어요.");
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

function render() {
  const p = V2.pages[V2.idx];
  document.getElementById("content").innerHTML = p ? p.html || "" : "";
  window.BookPageFooter?.decorateReader(document.getElementById("content"));
  applyBookTheme(document.getElementById("content"));
  enableMedia();
  document.getElementById("curPage").textContent = V2.idx + 1;

  const pct = V2.pages.length ? Math.round(((V2.idx + 1) / V2.pages.length) * 100) : 0;
  document.getElementById("progressFill").style.width = pct + "%";

  document.getElementById("btnPrev").disabled = V2.idx <= 0;
  document.getElementById("btnNext").disabled = V2.idx >= V2.pages.length - 1;
  updateBookmarkBtn();
  updateMemoDot();
  updateTocCurrent();
  if (isMemoOpen()) refreshMemoPanel();
  debounceSaveProgress();

  // 페이지 넘기면 맨 위로
  window.scrollTo({ top: 0, behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
  const paper = document.getElementById("paper");
  if (paper) paper.scrollTop = 0;
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
  const n = V2.idx + delta;
  if (n >= 0 && n < V2.pages.length) {
    V2.idx = n;
    render();
  }
}

// ===== 확대/축소 =====
function applyZoom() {
  V2.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, V2.zoom));
  const content = document.getElementById("content");
  // 이온토플 디자인 책(단어장·입문서 편집본)은 글자 크기가 px로 고정돼 있어 font-size로는 안 커진다
  // → 종이째(프레임 포함) 배율로 키운다. PDF 뷰어처럼 종이 폭도 같이 커지고, 화면보다 커지면 옆으로 밀어서 본다 (2026-10-29)
  const themed = !!(window.BookTheme && V2.book && window.BookTheme.isThemed(V2.book.id));
  const paper = document.getElementById("paper");
  content.style.zoom = "";
  if (themed) {
    content.style.fontSize = ZOOM_BASE + "px";
    document.body.classList.add("bookv2-paperzoom");
    // 100%일 때 종이 폭을 재서 그 폭에 배율을 곱한다
    paper.style.zoom = ""; paper.style.width = ""; paper.style.maxWidth = "";
    const base = paper.getBoundingClientRect().width;
    paper.style.width = Math.round(base) + "px";
    paper.style.maxWidth = "none";
    paper.style.zoom = (V2.zoom / ZOOM_BASE).toFixed(3);
  } else {
    document.body.classList.remove("bookv2-paperzoom");
    paper.style.zoom = ""; paper.style.width = ""; paper.style.maxWidth = "";
    content.style.fontSize = V2.zoom + "px";
  }
  document.getElementById("zoomLevel").textContent = Math.round((V2.zoom / ZOOM_BASE) * 100) + "%";
  try { localStorage.setItem("bookv2_zoom", String(V2.zoom)); } catch (_) {}
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
function curUid() { return V2.pages[V2.idx] ? V2.pages[V2.idx].id : null; }
function isBookmarked() { return V2.bookmarks.indexOf(curUid()) !== -1; }

function updateBookmarkBtn() {
  const btn = document.getElementById("btnBookmark");
  if (!btn) return;
  const on = isBookmarked();
  btn.classList.toggle("bookmarked", on);
  btn.querySelector("i").className = on ? "fa-solid fa-bookmark" : "fa-regular fa-bookmark";
}

async function toggleBookmark() {
  if (!V2.progress) return;
  const uid = curUid();
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
      '<span><i class="fa-solid fa-bookmark"></i> ' + (it.idx + 1) + '페이지</span>' +
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
  list.innerHTML = V2.toc.map((it) =>
    '<div class="bookv2-toc-item lv' + it.level + (it.idx === V2.idx ? ' current' : '') + '" data-idx="' + it.idx + '">' +
      '<span class="bookv2-toc-title">' + escapeHtml(it.title) + '</span>' +
      '<span class="bookv2-toc-page">' + (it.idx + 1) + '</span>' +
    '</div>'
  ).join("");
  list.querySelectorAll(".bookv2-toc-item").forEach((el) => {
    el.addEventListener("click", () => { V2.idx = parseInt(el.dataset.idx, 10); render(); closeSidebar(); });
  });
}
function updateTocCurrent() {
  document.querySelectorAll("#tocList .bookv2-toc-item").forEach((el) => {
    el.classList.toggle("current", parseInt(el.dataset.idx, 10) === V2.idx);
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
      '<div class="bookv2-memo-item-top"><i class="fa-regular fa-comment-dots"></i> ' + (it.idx + 1) + '페이지</div>' +
      '<div class="bookv2-memo-item-preview">' + escapeHtml(it.content) + '</div>' +
    '</div>'
  ).join("");

  list.querySelectorAll(".bookv2-memo-item").forEach((el) => {
    el.addEventListener("click", () => {
      const i = V2.pages.findIndex((p) => p.id === el.dataset.uid);
      if (i >= 0) { V2.idx = i; render(); closeSidebar(); openMemo(); }
    });
  });
}
function closeSidebar() {
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
  const dot = document.getElementById("memoDot");
  if (dot) dot.classList.toggle("on", hasMemo(curUid()));
}

function refreshMemoPanel() {
  const memo = V2.memos[curUid()];
  document.getElementById("memoPageLabel").textContent = (V2.idx + 1) + "페이지 메모";
  const ta = document.getElementById("memoText");
  ta.value = memo ? (memo.content || "") : "";
  document.getElementById("memoCount").textContent = ta.value.length;
  document.getElementById("btnMemoDelete").classList.toggle("hidden", !memo);
}

function openMemo() {
  closeSidebar();
  refreshMemoPanel();
  document.getElementById("memoPanel").classList.add("open");
  syncOverlay();
  setTimeout(() => document.getElementById("memoText").focus(), 200);
}
function closeMemo() {
  document.getElementById("memoPanel").classList.remove("open");
  syncOverlay();
}

async function saveMemo() {
  const uid = curUid();
  const content = document.getElementById("memoText").value.trim();
  if (!content) { showToast("메모 내용을 입력해주세요."); return; }

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
    if (res) { V2.memos[uid] = res; updateMemoDot(); renderMemoList(); closeMemo(); showToast("메모가 저장되었습니다."); }
    else showToast("저장 실패. 다시 시도해주세요.");
  } catch (e) {
    console.warn(e); showToast("저장 실패. 다시 시도해주세요.");
  } finally { btn.disabled = false; }
}

async function deleteMemo() {
  const uid = curUid();
  const existing = V2.memos[uid];
  if (!existing) return;
  if (!confirm("이 메모를 삭제할까요?")) return;
  const ok = await supabaseDelete("tr_book_memos", "id=eq." + existing.id);
  if (ok) { delete V2.memos[uid]; updateMemoDot(); renderMemoList(); closeMemo(); showToast("메모가 삭제되었습니다."); }
}

// ===== 진도(이어보기) + 완독 =====
function debounceSaveProgress() {
  clearTimeout(progressTimer);
  progressTimer = setTimeout(saveProgress, 1000);
}
async function saveProgress() {
  if (!V2.progress) return;
  const maxReached = Math.max(V2.progress.max_page_reached || 1, V2.idx + 1);
  const isCompleted = maxReached >= V2.pages.length;
  const wasCompleted = V2.progress.is_completed;
  const res = await supabaseUpdate("tr_book_progress", "id=eq." + V2.progress.id, {
    last_page: V2.idx + 1, max_page_reached: maxReached, is_completed: isCompleted, updated_at: new Date().toISOString()
  });
  if (res) {
    V2.progress.last_page = V2.idx + 1;
    V2.progress.max_page_reached = maxReached;
    V2.progress.is_completed = isCompleted;
    if (isCompleted && !wasCompleted) showDone();
  }
}
function showDone() { document.getElementById("doneOverlay").classList.add("open"); }

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
  document.getElementById("btnPrev").addEventListener("click", () => go(-1));
  document.getElementById("btnNext").addEventListener("click", () => go(1));
  document.getElementById("btnBack").addEventListener("click", () => history.back());
  document.getElementById("maintBack").addEventListener("click", () => {
    if (!V2.user) { location.href = "index.html"; return; }   // 로그인 안내 → 테스트룸 첫 화면(로그인)
    if (history.length > 1) history.back(); else location.href = "index.html";
  });

  // PDF 저장·인쇄
  document.getElementById("btnPrint").addEventListener("click", printBook);
  window.addEventListener("beforeprint", () => { if (canPrint()) buildPrintRoot(); });

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
  document.getElementById("doneClose").addEventListener("click", () => document.getElementById("doneOverlay").classList.remove("open"));

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
function updatePrintButton() {
  const ok = canPrint();
  const b = document.getElementById("btnPrint");
  if (b) b.hidden = !ok;
  document.body.classList.toggle("bookv2-print-ok", ok);
  if (ok) setTimeout(buildPrintRoot, 0);   // 이미지가 미리 받아지도록 먼저 만들어 둔다
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
