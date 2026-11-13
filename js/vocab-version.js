/**
 * ================================================
 * vocab-version.js — 내벨업보카(단어장) v1 / v2 분리 운영 (2026-11-13)
 * ================================================
 * 학생이 손에 든 단어장과 테스트룸 화면(내 서재 책, 단어 시험 정답, 일정표 쪽번호)을 같은 버전으로 맞춘다.
 * 계획서: C:\기능구현\단어장_v1v2분리\IMPLEMENTATION_PLAN.md (2절 판정 규칙)
 *
 * 설정: DB tr_app_settings, key='vocab_version', value(JSON)
 *   { "new_book_date": "YYYY-MM-DD" | null,   // 새 책(v2) 도착일. 이날부터 보내는 택배는 모두 v2
 *     "v1_closed": false,                      // 수강 중 v1 학생 0명이 되면 true → 전원 v2
 *     "force_v1": [applicationId...], "force_v2": [applicationId...] }   // 예외
 *
 * 판정 (위에서부터 먼저 맞는 것)
 *   1. 설정 없음 / new_book_date 비어 있음 → v1   (코드를 먼저 배포해도 학생 화면 변화 없음)
 *   2. v1_closed → v2
 *   3. force_v2 / force_v1
 *   4. 발송 정보를 아직 못 읽은 세션(배포 전 로그인) → v1   (잘못 v2로 보이는 것 방지, 새로고침하면 채워짐)
 *   5. 재시작(수강 2 이상)인데 재시작 교재에 '단어장'이 없음 → v1 (지난 수강의 옛 책을 씀)
 *   6. 발송 완료 시각 있음 → 그 날짜(한국 시간) >= new_book_date 이면 v2, 아니면 v1
 *   7. 발송 면제 또는 아직 발송 전 → 시작일 >= new_book_date 이면 v2, 아니면 v1
 *   8. 그 밖(시작일도 없음) → v1
 *
 * v2 학생에게 달라지는 것
 *   - 단어 시험 정답표: tr_vocab → tr_vocab_v2
 *   - 일정표 단어 과제 쪽번호 +2 ("내벨업보카 5, 6, 7pg" → "7, 8, 9pg"). 정규·자기주도·호주·연습코스.
 *     과제 기록은 주차·요일(연습은 번호)로 저장되므로 영향 없음.
 *   - 내 서재: 자기 버전 단어장 책만 보임
 *   - 마이페이지 잔디 칸 설명 "Voca 30-32pg" → "Voca 32-34pg"
 * ================================================
 */
(function () {
  var SETTING_KEY = 'vocab_version';
  var CACHE_KEY = 'vocabVersionCfg';
  var V1_BOOK = '07f6cd4e-c737-40a1-b537-6e07af3d1aa5';
  var V2_BOOK = '47282479-f8f6-4062-aa33-6c027d488d1a';
  var V2_PAGE_SHIFT = 2;             // v2 책은 경고문 뒤에 차례 2쪽이 들어가 단어 쪽이 2쪽씩 밀림
  var TABLES = { v1: 'tr_vocab', v2: 'tr_vocab_v2' };

  // 마지막으로 읽은 설정을 기기에 남겨 둔다. 설정을 못 읽을 때 v2 학생이 잠깐 v1 쪽번호를 보는 일을 줄이기 위함.
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { return null; }
  }
  function writeCache(v) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch (_) {}
  }
  var cfg = readCache();
  var loading = null;

  function sessionUser() {
    try { return JSON.parse(sessionStorage.getItem('currentUser') || 'null'); } catch (_) { return null; }
  }
  function ymd(v) {
    var s = String(v || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }
  /** 발송 시각(ms 숫자 또는 날짜 글자) → 한국 날짜 'YYYY-MM-DD' */
  function kstDay(v) {
    if (v === null || v === undefined || v === '') return '';
    var d = (typeof v === 'number' || /^\d+$/.test(String(v))) ? new Date(Number(v)) : new Date(v);
    if (isNaN(d.getTime())) return '';
    return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }

  /** DB 설정 읽기. 실패하면 마지막 값(없으면 빈 설정 = 전원 v1). 한 화면에서 여러 번 불러도 한 번만 읽는다. */
  function load(force) {
    if (loading && !force) return loading;
    loading = (async function () {
      try {
        // supabaseSelect 는 오류와 '줄 없음'을 구분하지 못해서 직접 읽는다.
        if (typeof SUPABASE_CONFIG === 'undefined') throw new Error('SUPABASE_CONFIG 없음');
        var res = await fetch(SUPABASE_CONFIG.url + '/rest/v1/tr_app_settings?key=eq.' + SETTING_KEY + '&select=value', {
          headers: { apikey: SUPABASE_CONFIG.anonKey, Authorization: 'Bearer ' + SUPABASE_CONFIG.anonKey }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var rows = await res.json();
        var v = (Array.isArray(rows) && rows[0] && rows[0].value) || {};   // 줄이 없으면 빈 설정 = 전원 v1
        if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) { v = {}; } }
        cfg = v;
        writeCache(cfg);
      } catch (e) {
        console.warn('📚 [VocabVersion] 설정 읽기 실패 → 마지막으로 읽은 값(없으면 v1) 사용:', e && e.message);
        cfg = cfg || {};
      }
      return cfg;
    })();
    return loading;
  }

  /** 이 학생의 단어장 버전 'v1' | 'v2' (+ 이유, 확인용) */
  function decide(user) {
    user = user || sessionUser();
    var c = cfg || {};
    var cut = ymd(c.new_book_date);
    if (!cut) return { v: 'v1', why: '새 책 도착일 없음' };
    if (c.v1_closed === true) return { v: 'v2', why: 'v1 닫음' };
    if (!user) return { v: 'v1', why: '학생 정보 없음' };
    var aid = user.applicationId;
    if (aid && Array.isArray(c.force_v2) && c.force_v2.indexOf(aid) !== -1) return { v: 'v2', why: '예외 v2' };
    if (aid && Array.isArray(c.force_v1) && c.force_v1.indexOf(aid) !== -1) return { v: 'v1', why: '예외 v1' };
    if (!aid) return { v: 'v1', why: '신청서 없음' };
    if (!user.shipInfoLoaded) return { v: 'v1', why: '발송 정보 아직 안 읽음' };
    if (Number(user.enrollmentNo || 1) >= 2) {
      var mats = Array.isArray(user.restartMaterials) ? user.restartMaterials : [];
      if (mats.indexOf('단어장') === -1) return { v: 'v1', why: '재시작, 단어장 다시 안 받음' };
    }
    var shipDay = kstDay(user.shippingCompletedAt);
    if (shipDay) return shipDay >= cut ? { v: 'v2', why: '발송 ' + shipDay } : { v: 'v1', why: '발송 ' + shipDay };
    var start = ymd(user.startDate);
    if (!start) return { v: 'v1', why: '발송 전, 시작일 없음' };
    var tag = user.shippingWaived ? '발송 면제, 시작 ' : '발송 전, 시작 ';
    return start >= cut ? { v: 'v2', why: tag + start } : { v: 'v1', why: tag + start };
  }
  function versionFor(user) { return decide(user).v; }

  function shiftPages(nums) {
    return nums.split(',').map(function (n) {
      n = n.trim();
      return n ? String(parseInt(n, 10) + V2_PAGE_SHIFT) : n;
    }).filter(Boolean).join(', ');
  }

  /** 일정표 과제명 변환: v2 학생이면 "내벨업보카 …pg" 의 쪽번호에 +2. 그 밖은 그대로. */
  function taskName(name, user) {
    if (typeof name !== 'string' || name.indexOf('내벨업보카') !== 0) return name;
    if (versionFor(user) !== 'v2') return name;
    return name.replace(/^(내벨업보카\s+)([\d,\s]+)(pg)/, function (_, head, nums, tail) {
      return head + shiftPages(nums) + tail;
    });
  }
  function taskList(tasks, user) {
    if (!Array.isArray(tasks)) return tasks;
    if (versionFor(user) !== 'v2') return tasks;
    return tasks.map(function (t) { return taskName(t, user); });
  }

  /** 마이페이지 잔디 칸 설명(title "Voca 30-32pg" / "Voca 34-35pg") 을 v2 쪽으로. v1이면 아무것도 안 함. */
  function applyGrassTitles(root, user) {
    if (versionFor(user) !== 'v2') return 0;
    var n = 0;
    (root || document).querySelectorAll('.g[data-type="voca_test"][title]').forEach(function (el) {
      if (el.dataset.vocaV1Title) return;   // 두 번 바꾸지 않음
      var t = el.getAttribute('title');
      var m = t.match(/^Voca\s+(\d+)\s*-\s*(\d+)pg$/);
      if (!m) return;
      el.dataset.vocaV1Title = t;
      el.setAttribute('title', 'Voca ' + (parseInt(m[1], 10) + V2_PAGE_SHIFT) + '-' + (parseInt(m[2], 10) + V2_PAGE_SHIFT) + 'pg');
      n++;
    });
    return n;
  }

  /** 단어 시험 정답표 이름 */
  function vocabTable(user) { return TABLES[versionFor(user)]; }

  /** 내 서재에서 숨길 단어장 책 id (이 학생 버전이 아닌 쪽) */
  function hiddenBookId(user) { return versionFor(user) === 'v2' ? V1_BOOK : V2_BOOK; }

  window.VocabVersion = {
    load: load,
    decide: decide,
    versionFor: versionFor,
    taskName: taskName,
    taskList: taskList,
    applyGrassTitles: applyGrassTitles,
    vocabTable: vocabTable,
    hiddenBookId: hiddenBookId,
    V1_BOOK: V1_BOOK,
    V2_BOOK: V2_BOOK,
    _kstDay: kstDay,
    _cfg: function () { return cfg; }
  };
})();
