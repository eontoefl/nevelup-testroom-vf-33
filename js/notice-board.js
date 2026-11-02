/**
 * notice-board.js — 공지 카드의 단일 정의 (테스트룸 + 공홈 관리자 미리보기 공용)
 *
 * 이 파일 하나가 정한다:
 *   - 공지 종류별 모양(STYLES) · 등록일 표시(formatDate) · 카드 HTML(renderItem)
 *   - 카드 동작(펼치기 · 닫기 · 다시 보지 않기 · N 뱃지 읽음 처리)
 *   - 게시 기간 규칙: 게시 종료 시각(active_until)이 지금보다 뒤인 공지만 보인다.
 *     관리자 화면에서 게시를 켜면 종료 일시 입력칸에 기본값(지금부터 ACTIVE_DAYS일 뒤)이 채워지고,
 *     관리자가 더 짧게·길게 바꿀 수 있다.
 *
 * 테스트룸 index.html과 공홈 admin-settings.html(공지 탭)이 같은 파일을 불러 쓴다.
 * 전역 이름 충돌을 막기 위해 window.NoticeBoard 하나만 노출한다.
 */
(function () {
    'use strict';

    // 공지 종류 → 모양 (label은 관리자 선택 목록·목록 뱃지용)
    var STYLES = {
        urgent:   { emoji: '🚨', label: '긴급 공지',   bg: '#fef2f2', titleColor: '#dc2626', textColor: '#991b1b', glow: true },
        notice:   { emoji: '📢', label: '일반 공지',   bg: '#eff6ff', titleColor: '#1d4ed8', textColor: '#1e3a5f', glow: false },
        deadline: { emoji: '⏰', label: '마감 안내',   bg: '#fff7ed', titleColor: '#c2410c', textColor: '#9a3412', glow: false },
        tip:      { emoji: '💡', label: '팁 / 도움말', bg: '#f0fdf4', titleColor: '#16a34a', textColor: '#14532d', glow: false },
        update:   { emoji: '🔄', label: '업데이트',    bg: '#fefce8', titleColor: '#a16207', textColor: '#78350f', glow: false },
        event:    { emoji: '🎉', label: '이벤트',      bg: '#faf5ff', titleColor: '#7c3aed', textColor: '#5b21b6', glow: false },
        warning:  { emoji: '⚠️', label: '주의사항',    bg: '#fff7ed', titleColor: '#ea580c', textColor: '#9a3412', glow: false },
        check:    { emoji: '✅', label: '완료 / 확인', bg: '#f0fdf4', titleColor: '#16a34a', textColor: '#166534', glow: false }
    };

    // 게시 기간 기본값 (일) — 관리자 종료 일시 입력칸에 처음 채워지는 값
    var ACTIVE_DAYS = 7;

    function styleOf(type) {
        return STYLES[type] || STYLES.notice;
    }

    // 등록 시각 → KST "2026.07.06 16:27"
    function formatDate(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            if (isNaN(d)) return '';
            var p = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: false
            }).formatToParts(d);
            var g = function (t) { return (p.find(function (x) { return x.type === t; }) || {}).value || ''; };
            return g('year') + '.' + g('month') + '.' + g('day') + ' ' + g('hour') + ':' + g('minute');
        } catch (e) { return ''; }
    }

    // ── 게시 기간 규칙 (한 곳에서만 정의) ──
    // 지금 학생에게 보이는 공지인가
    function isLive(n, now) {
        if (!n || !n.active_until) return false;
        return new Date(n.active_until).getTime() > (now || new Date()).getTime();
    }
    // 테스트룸 조회 조건 (isLive와 같은 규칙을 서버 조회로 표현)
    function liveFilter(now) {
        return 'active_until=gt.' + encodeURIComponent((now || new Date()).toISOString());
    }
    // 게시를 켤 때 채워지는 기본 종료 시각
    function newActiveUntil(now) {
        return new Date((now || new Date()).getTime() + ACTIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    }

    // ── 브라우저 기록 (테스트룸 학생 기기) ──
    function getHidden() {
        try { return JSON.parse(localStorage.getItem('tr_hidden_notices') || '[]'); }
        catch (e) { return []; }
    }
    function getSeen() {
        try { return JSON.parse(localStorage.getItem('tr_seen_notices') || '[]'); }
        catch (e) { return []; }
    }
    function markSeen(id) {
        var seen = getSeen();
        if (seen.indexOf(id) === -1) {
            seen.push(id);
            try { localStorage.setItem('tr_seen_notices', JSON.stringify(seen)); } catch (e) {}
        }
    }

    // 카드를 지운 뒤 목록이 비면 바깥 상자째 숨김
    function removeItem(item) {
        if (!item) return;
        var list = item.parentElement;
        item.remove();
        if (list && list.children.length === 0) {
            var box = list.closest('#noticeContainer');
            if (box) box.style.display = 'none';
        }
    }

    // ── 카드 HTML ──
    // opts.isNew: N 뱃지 표시 / opts.collapsed: 접힌 상태로 시작(기본 true)
    function renderItem(n, opts) {
        opts = opts || {};
        var s = styleOf(n.type);
        var glowStyle = s.glow ? 'animation:noticeGlow 2s ease-in-out infinite;' : '';
        var collapsed = opts.collapsed !== false;
        var dateStr = formatDate(n.created_at);
        return '\n' +
            '                        <div class="notice-item' + (collapsed ? ' collapsed' : '') + '" data-notice-id="' + n.id + '" style="background:' + s.bg + '; ' + glowStyle + '">\n' +
            '                            <div class="notice-item-head" onclick="NoticeBoard.toggle(this)">\n' +
            '                                <div class="notice-item-tag" style="color:' + s.titleColor + ';">\n' +
            '                                    ' + s.emoji + ' ' + n.title + '\n' +
            '                                    ' + (opts.isNew ? '<span class="notice-badge">N</span>' : '') + '\n' +
            '                                </div>\n' +
            '                                <div class="notice-head-right">\n' +
            '                                    ' + (dateStr ? '<span class="notice-date" style="color:' + s.titleColor + ';">' + dateStr + '</span>' : '') + '\n' +
            '                                    <span class="notice-chevron" style="color:' + s.titleColor + ';">' + (collapsed ? '▾' : '▴') + '</span>\n' +
            '                                    <button class="notice-close-x" title="닫기" onclick="NoticeBoard.close(event, this)" style="color:' + s.titleColor + ';">&times;</button>\n' +
            '                                </div>\n' +
            '                            </div>\n' +
            '                            <div class="notice-item-body">\n' +
            '                                <div class="notice-item-content" style="color:' + s.textColor + ';">' + n.content + '</div>\n' +
            '                                <div class="notice-item-actions">\n' +
            '                                    <button class="notice-action-btn" onclick="NoticeBoard.dismiss(this, \'' + n.id + '\')" style="color:' + s.textColor + ';">다시 보지 않기</button>\n' +
            '                                </div>\n' +
            '                            </div>\n' +
            '                        </div>\n' +
            '                    ';
    }

    // ── 카드 동작 ──
    // 제목 줄 클릭 — 펼치기/접기, 펼치면 읽음 처리(N 뱃지 제거)
    function toggle(headEl) {
        var item = headEl.closest('.notice-item');
        if (!item) return;
        item.classList.toggle('collapsed');
        var collapsed = item.classList.contains('collapsed');
        var chev = item.querySelector('.notice-chevron');
        if (chev) chev.textContent = collapsed ? '▾' : '▴';
        if (!collapsed) {
            markSeen(item.getAttribute('data-notice-id'));
            var badge = item.querySelector('.notice-badge');
            if (badge) badge.remove();
        }
    }
    // 닫기(×) — 이번만 숨김 (새로고침하면 다시 보임)
    function close(ev, btn) {
        if (ev) ev.stopPropagation();   // 제목 클릭(토글)으로 전파 방지
        removeItem(btn.closest('.notice-item'));
    }
    // 다시 보지 않기 — 이 기기에서 영구 숨김
    function dismiss(btn, id) {
        var hidden = getHidden();
        if (hidden.indexOf(id) === -1) {
            hidden.push(id);
            try { localStorage.setItem('tr_hidden_notices', JSON.stringify(hidden)); } catch (e) {}
        }
        removeItem(btn.closest('.notice-item'));
    }

    window.NoticeBoard = {
        STYLES: STYLES,
        ACTIVE_DAYS: ACTIVE_DAYS,
        styleOf: styleOf,
        formatDate: formatDate,
        isLive: isLive,
        liveFilter: liveFilter,
        newActiveUntil: newActiveUntil,
        getHidden: getHidden,
        getSeen: getSeen,
        renderItem: renderItem,
        toggle: toggle,
        close: close,
        dismiss: dismiss
    };
})();
