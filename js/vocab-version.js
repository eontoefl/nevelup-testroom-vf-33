/**
 * ================================================
 * vocab-version.js — 내벨업보카(단어장) v1 / v2 분리 운영 (2026-11-13)
 * ================================================
 * 학생마다 단어장 버전을 하나로 정한다.
 *   - 시작일(currentUser.startDate) >= 기준일  → v2 (새 책: 차례 2쪽 추가, 단어 7~63쪽, 동의어 42개 수정)
 *   - 그 밖 (기준일 이전 시작, 기준일 비어 있음, 시작일 없음, 설정을 못 읽음) → v1 (지금 그대로)
 *   - 예외: force_v1 / force_v2 에 applicationId 가 있으면 시작일 규칙보다 먼저 따른다
 *
 * 설정 위치: DB tr_app_settings 의 key='vocab_version' 줄, value(JSON)
 *   { "v2_start_from": "2026-12-07" | null, "force_v1": [applicationId...], "force_v2": [applicationId...] }
 *   v2_start_from 이 null 이면 전원 v1 → 코드를 먼저 배포해도 학생 화면은 바뀌지 않는다.
 *
 * v2 학생에게 달라지는 것
 *   1) 단어 시험 정답표: tr_vocab → tr_vocab_v2
 *   2) 일정표의 단어 과제 쪽번호: v1 쪽 + 2 ("내벨업보카 5, 6, 7pg" → "내벨업보카 7, 8, 9pg")
 *      정규·호주·연습코스 일정표 모두. 과제 기록은 쪽이 아니라 주차·요일(또는 연습 번호)로 저장되므로 영향 없음.
 *   3) 내 서재: v1 단어장 책 대신 v2 단어장 책
 *
 * v1 폐쇄: v1 해당 학생이 0명이 되면 v1 책·tr_vocab 은 지우지 말고 숨기기만 하면 된다(되돌릴 수 있게).
 * ================================================
 */
(function () {
  var SETTING_KEY = 'vocab_version';
  var CACHE_KEY = 'vocabVersionCfg';
  var V1_BOOK = '07f6cd4e-c737-40a1-b537-6e07af3d1aa5';
  var V2_BOOK = '47282479-f8f6-4062-aa33-6c027d488d1a';
  var V2_PAGE_SHIFT = 2;             // v2 책은 경고문 뒤에 차례 2쪽이 들어가 단어 쪽이 2쪽씩 밀림
  var TABLES = { v1: 'tr_vocab', v2: 'tr_vocab_v2' };

  var cfg = readCache();
  var loading = null;

  // 마지막으로 읽은 설정을 기기에 남겨 둔다. 네트워크 오류 때 v2 학생이 잠깐 v1 쪽번호를 보는 일을 막기 위함.
  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { return null; }
  }
  function writeCache(v) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch (_) {}
  }
  function sessionUser() {
    try { return JSON.parse(sessionStorage.getItem('currentUser') || 'null'); } catch (_) { return null; }
  }
  function ymd(v) {
    var s = String(v || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }

  /** DB 설정 읽기. 실패하면 이전 값(없으면 빈 설정 = 전원 v1) 유지. 여러 번 불러도 한 번만 읽는다. */
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

  /** 이 학생의 단어장 버전 'v1' | 'v2' */
  function versionFor(user) {
    user = user || sessionUser();
    var c = cfg || {};
    if (!user) return 'v1';
    var aid = user.applicationId;
    if (aid && Array.isArray(c.force_v2) && c.force_v2.indexOf(aid) !== -1) return 'v2';
    if (aid && Array.isArray(c.force_v1) && c.force_v1.indexOf(aid) !== -1) return 'v1';
    var cut = ymd(c.v2_start_from);
    var start = ymd(user.startDate);
    if (!cut || !start) return 'v1';
    return start >= cut ? 'v2' : 'v1';
  }

  /** 일정표 과제명 변환: v2 학생이면 "내벨업보카 …pg" 의 쪽번호에 +2. 그 밖은 그대로. */
  function taskName(name, user) {
    if (typeof name !== 'string' || name.indexOf('내벨업보카') !== 0) return name;
    if (versionFor(user) !== 'v2') return name;
    return name.replace(/^(내벨업보카\s+)([\d,\s]+)(pg)/, function (_, head, nums, tail) {
      var out = nums.split(',').map(function (n) {
        n = n.trim();
        return n ? String(parseInt(n, 10) + V2_PAGE_SHIFT) : n;
      }).filter(Boolean).join(', ');
      return head + out + tail;
    });
  }
  function taskList(tasks, user) {
    if (!Array.isArray(tasks)) return tasks;
    if (versionFor(user) !== 'v2') return tasks;
    return tasks.map(function (t) { return taskName(t, user); });
  }

  /** 단어 시험 정답표 이름 */
  function vocabTable(user) { return TABLES[versionFor(user)]; }

  /** 내 서재에서 숨길 단어장 책 id (이 학생 버전이 아닌 쪽) */
  function hiddenBookId(user) { return versionFor(user) === 'v2' ? V1_BOOK : V2_BOOK; }

  window.VocabVersion = {
    load: load,
    versionFor: versionFor,
    taskName: taskName,
    taskList: taskList,
    vocabTable: vocabTable,
    hiddenBookId: hiddenBookId,
    V1_BOOK: V1_BOOK,
    V2_BOOK: V2_BOOK,
    _cfg: function () { return cfg; }
  };
})();
