/**
 * ================================================
 * book-view-confirm.js — 책마다 "처음 열 때 확인" (2026-10-28 단어장 디지털 전달)
 * ================================================
 * 켜는 곳: 공홈 관리자 책 목록의 [처음 열 때 확인] 스위치 → tr_book_documents.view_confirm
 * 기록:    학생이 [열어보기]를 누른 시각 → tr_book_progress.view_confirmed_at
 *          (진도 표는 학생·책마다 한 줄: UNIQUE(user_id, book_id) → upsert로 같은 줄에 시각만 더함)
 * 쓰는 곳: 마이페이지 내 서재(mylibrary.js), 책 화면(book-v2-viewer.js)
 *
 * 저장 실패는 supabase-client가 오류를 던지지 않고 null을 돌려주므로, 반드시 결과를 확인한다.
 * ================================================
 */
(function (global) {
  "use strict";

  function needsConfirm(book) {
    return !!(book && book.view_confirm);
  }

  // { book_id: view_confirmed_at } — 아직 안 연 책은 들어가지 않음
  async function getConfirmedMap(userId, bookIds) {
    var map = {};
    if (!userId || !bookIds || !bookIds.length) return map;
    var rows = await supabaseSelect(
      "tr_book_progress",
      "user_id=eq." + encodeURIComponent(userId) + "&book_id=in.(" + bookIds.join(",") + ")&select=book_id,view_confirmed_at"
    );
    (rows || []).forEach(function (r) { if (r.view_confirmed_at) map[r.book_id] = r.view_confirmed_at; });
    return map;
  }

  async function getConfirmedAt(userId, bookId) {
    var m = await getConfirmedMap(userId, [bookId]);
    return m[bookId] || null;
  }

  // 처음 연 시각 저장. 성공하면 저장된 시각(문자열), 실패하면 null
  async function saveConfirm(userId, bookId) {
    if (!userId || !bookId) return null;
    var at = new Date().toISOString();
    var row = await supabaseUpsert(
      "tr_book_progress",
      { user_id: String(userId), book_id: bookId, view_confirmed_at: at },
      "user_id,book_id"
    );
    return row && row.view_confirmed_at ? row.view_confirmed_at : null;
  }

  // "10월 27일 오후 3:40"
  function formatAt(at) {
    try {
      return new Date(at).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
    } catch (_) { return ""; }
  }

  // "10월 27일" (내 서재 카드용, 날짜만)
  function formatDate(at) {
    try { return new Date(at).toLocaleDateString("ko-KR", { month: "long", day: "numeric" }); }
    catch (_) { return ""; }
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  /**
   * 확인 창 띄우기
   *  opts.title      : 크게 보여줄 책 제목
   *  opts.onConfirm  : [열어보기] 클릭 시. 클릭 순간에 바로(동기) 호출됨 → 새 창 열기는 여기서 먼저.
   *                    Promise<boolean> 반환. true면 창 닫힘, false면 실패 안내 후 창 유지
   *  opts.onCancel   : [다음에 볼게요] 클릭 시 (창은 닫힘)
   */
  function open(opts) {
    opts = opts || {};
    close();
    var ov = document.createElement("div");
    ov.className = "bvc-overlay";
    ov.id = "bvcOverlay";
    ov.innerHTML =
      '<div class="bvc-box" role="dialog" aria-modal="true" aria-labelledby="bvcTitle">' +
        '<div class="bvc-icon"><i class="fa-solid fa-book-open"></i></div>' +
        '<div class="bvc-title" id="bvcTitle">' + esc(opts.title || "자료") + '</div>' +
        '<p class="bvc-desc">한 번 열면 다음부터는 바로 열 수 있어요.</p>' +
        '<p class="bvc-err" id="bvcErr" hidden>저장하지 못했어요. 잠시 후 다시 눌러주세요.</p>' +
        '<div class="bvc-actions">' +
          '<button type="button" class="bvc-cancel" id="bvcCancel">다음에 볼게요</button>' +
          '<button type="button" class="bvc-ok" id="bvcOk">열어보기</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(ov);

    var ok = ov.querySelector("#bvcOk");
    var cancel = ov.querySelector("#bvcCancel");
    var err = ov.querySelector("#bvcErr");

    cancel.addEventListener("click", function () {
      close();
      if (opts.onCancel) opts.onCancel();
    });

    ok.addEventListener("click", function () {
      if (ok.disabled) return;
      err.hidden = true;
      ok.disabled = true; cancel.disabled = true;
      ok.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      // 클릭 처리 안에서 바로 호출 (팝업 차단을 피하려면 새 창은 onConfirm 첫 줄에서 열어야 함)
      var p = opts.onConfirm ? opts.onConfirm() : Promise.resolve(true);
      Promise.resolve(p).then(function (done) {
        if (done) { close(); return; }
        err.hidden = false;
        ok.disabled = false; cancel.disabled = false;
        ok.textContent = "열어보기";
      }, function () {
        err.hidden = false;
        ok.disabled = false; cancel.disabled = false;
        ok.textContent = "열어보기";
      });
    });

    requestAnimationFrame(function () { ov.classList.add("open"); });
    return ov;
  }

  function close() {
    var ov = document.getElementById("bvcOverlay");
    if (ov) ov.remove();
  }

  global.BookViewConfirm = Object.freeze({ needsConfirm: needsConfirm, getConfirmedMap: getConfirmedMap, getConfirmedAt: getConfirmedAt, saveConfirm: saveConfirm, formatAt: formatAt, formatDate: formatDate, open: open, close: close });
})(typeof window !== "undefined" ? window : globalThis);
