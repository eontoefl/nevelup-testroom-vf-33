/**
 * book-v2-viewer.js — 에디터(BlockNote)로 만든 입문서 렌더 뷰어
 *  - tr_book_documents(kind='pages') + tr_book_pages 에서 로드
 *  - 페이지별 저장된 html 을 그대로 렌더 (책장 넘기기)
 *  - 학생 이름+이메일 옅은 워터마크
 *  - 다운로드/우클릭 차단
 *
 * ※ 인증(auth.js)은 정식 통합 시 추가. 지금은 localhost 미리보기용으로
 *   세션 없으면 데모 사용자로 표시.
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

  // 진도/북마크/메모는 실패해도 읽기는 계속 (숨김 책은 추적 생략)
  if (!hiddenForStudent) {
    try { await loadProgress(); await loadMemos(); } catch (e) { console.warn("진도/메모 로드 실패:", e); }
  }

  applyZoom();
  render();
  document.getElementById("loading").style.display = "none";

  if (hiddenForStudent) {
    V2.locked = true;     // 페이지 넘기기/조작 잠금
    showMaintenance();
  }
}

function isPreview() {
  return new URLSearchParams(location.search).get("dev") === "1";
}
function showMaintenance() {
  document.getElementById("loading").style.display = "none";
  document.getElementById("maintOverlay").classList.add("open");
}

// 로그인 사용자(없으면 미리보기용 데모)
function resolveUser() {
  let u = null;
  try { u = JSON.parse(sessionStorage.getItem("currentUser") || "null"); } catch (_) {}
  if (!u || !u.id) u = { id: "demo-preview", name: "데모 학생", email: "demo@eontoefl.com" };
  V2.user = u;
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
  const books = await supabaseSelect(
    "tr_book_documents",
    "kind=eq.pages&order=sort_order.asc&limit=1"
  );
  if (!books || books.length === 0) throw new Error("편집된 입문서가 아직 없어요.");
  V2.book = books[0];
  document.getElementById("bookTitle").textContent = V2.book.title || "입문서";

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
  V2.pages.forEach((p, idx) => {
    const doc = parser.parseFromString(p.html || "", "text/html");
    doc.querySelectorAll("h1, h2").forEach((h) => {
      const title = (h.textContent || "").trim();
      if (title) V2.toc.push({ title: title, level: h.tagName === "H1" ? 1 : 2, idx: idx });
    });
  });
}

function render() {
  const p = V2.pages[V2.idx];
  document.getElementById("content").innerHTML = p ? p.html || "" : "";
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
  document.getElementById("content").style.fontSize = V2.zoom + "px";
  document.getElementById("zoomLevel").textContent = Math.round((V2.zoom / ZOOM_BASE) * 100) + "%";
  try { localStorage.setItem("bookv2_zoom", String(V2.zoom)); } catch (_) {}
}
function zoomBy(d) { V2.zoom += d; applyZoom(); }

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
    if (history.length > 1) history.back(); else location.href = "index.html";
  });

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
    if ((e.ctrlKey || e.metaKey) && ["s", "p", "u", "c", "a"].indexOf(k) !== -1 && !inField(e.target)) e.preventDefault();
  });
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
