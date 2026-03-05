/**
 * notification.js — 학생 알림 시스템
 * 
 * Supabase tr_notifications 테이블에서 알림을 로드하고
 * 🔔 벨 버튼, 드롭다운 리스트, 상세 팝업을 동적으로 렌더링합니다.
 * 
 * 의존성: supabase-client.js (supabaseSelect, supabaseUpdate), auth.js (getCurrentUserId)
 * 삽입 위치: index_v2.html에서 supabase-client.js, auth.js 다음
 */

(function () {
    'use strict';

    // =============================================
    // 내부 상태
    // =============================================
    let notifications = [];      // 전체 알림 배열 (최신순)
    let isDropdownOpen = false;

    // =============================================
    // 유틸: 시간 표시 (예: "3시간 전", "2일 전")
    // =============================================
    function timeAgo(dateStr) {
        const now = new Date();
        const date = new Date(dateStr);
        const diffMs = now - date;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMs / 3600000);
        const diffDay = Math.floor(diffMs / 86400000);

        if (diffMin < 1) return '방금 전';
        if (diffMin < 60) return diffMin + '분 전';
        if (diffHr < 24) return diffHr + '시간 전';
        if (diffDay < 30) return diffDay + '일 전';
        // 30일 이상이면 날짜 표시
        return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    }

    // =============================================
    // Supabase에서 알림 로드
    // user_id가 본인이거나 NULL(전체 공지)인 것만
    // =============================================
    async function loadNotifications() {
        try {
            const userId = (typeof getCurrentUserId === 'function') ? getCurrentUserId() : null;
            if (!userId) {
                console.warn('🔔 [알림] 로그인 사용자 없음 — 알림 로드 건너뜀');
                renderEmpty();
                return;
            }

            // 개인 알림만 조회 (전체 공지는 tr_notices에서 별도 관리)
            const query = `user_id=eq.${userId}&order=created_at.desc&limit=20`;
            const data = await supabaseSelect('tr_notifications', query);

            notifications = Array.isArray(data) ? data : [];
            console.log(`🔔 [알림] ${notifications.length}개 로드 완료`);

            renderDropdownList();
            updateBadge();
        } catch (err) {
            console.error('🔔 [알림] 로드 실패:', err);
            renderEmpty();
        }
    }

    // =============================================
    // 뱃지 업데이트
    // =============================================
    function updateBadge() {
        const badge = document.getElementById('notifBadge');
        const countEl = document.getElementById('notifDropdownCount');
        if (!badge) return;

        const unreadCount = notifications.filter(n => !n.is_read).length;

        if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }

        if (countEl) {
            countEl.textContent = unreadCount > 0 ? `${unreadCount}개 읽지 않음` : '모두 읽음';
        }
    }

    // =============================================
    // 드롭다운 리스트 렌더링
    // =============================================
    function renderDropdownList() {
        const listEl = document.getElementById('notifDropdownList');
        if (!listEl) return;

        if (notifications.length === 0) {
            listEl.innerHTML = '<div class="notif-empty">알림이 없습니다</div>';
            return;
        }

        listEl.innerHTML = notifications.map((n, i) => {
            const isUnread = !n.is_read;
            return `
                <div class="notif-item ${isUnread ? 'notif-unread' : ''}" onclick="NotificationSystem.openDetail(${i})">
                    <div class="notif-item-dot" ${isUnread ? '' : 'style="opacity:0;"'}></div>
                    <div class="notif-item-content">
                        <div class="notif-item-title">${escapeHtml(n.title)}</div>
                        <div class="notif-item-time">${timeAgo(n.created_at)}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // =============================================
    // 알림이 없을 때
    // =============================================
    function renderEmpty() {
        notifications = [];
        const listEl = document.getElementById('notifDropdownList');
        if (listEl) {
            listEl.innerHTML = '<div class="notif-empty">알림이 없습니다</div>';
        }
        updateBadge();
    }

    // =============================================
    // 드롭다운 토글
    // =============================================
    function toggleDropdown() {
        const dd = document.getElementById('notifDropdown');
        if (!dd) return;

        isDropdownOpen = !isDropdownOpen;
        if (isDropdownOpen) {
            dd.classList.add('show');
        } else {
            dd.classList.remove('show');
        }
    }

    function closeDropdown() {
        const dd = document.getElementById('notifDropdown');
        if (dd) dd.classList.remove('show');
        isDropdownOpen = false;
    }

    // =============================================
    // 상세 팝업 열기 (+ 읽음 처리)
    // =============================================
    async function openDetail(index) {
        const n = notifications[index];
        if (!n) return;

        // 드롭다운 닫기
        closeDropdown();

        // 팝업 내용 채우기
        const titleEl = document.getElementById('notifPopupTitle');
        const metaEl = document.getElementById('notifPopupMeta');
        const bodyEl = document.getElementById('notifPopupBody');

        if (titleEl) titleEl.textContent = n.title;
        if (metaEl) metaEl.textContent = (n.created_by || '') + ' · ' + timeAgo(n.created_at);
        if (bodyEl) bodyEl.innerHTML = escapeHtml(n.message).replace(/\n/g, '<br>');

        // 팝업 표시
        const overlay = document.getElementById('notifPopupOverlay');
        if (overlay) overlay.classList.add('show');

        // 읽음 처리 (아직 안 읽은 경우만)
        if (!n.is_read) {
            n.is_read = true;
            renderDropdownList();
            updateBadge();

            // Supabase 업데이트 (비동기, 실패해도 UI는 유지)
            try {
                await supabaseUpdate('tr_notifications', `id=eq.${n.id}`, { is_read: true });
                console.log(`🔔 [알림] 읽음 처리 완료: ${n.id}`);
            } catch (err) {
                console.warn('🔔 [알림] 읽음 처리 실패 (UI는 정상):', err);
            }
        }
    }

    // =============================================
    // 상세 팝업 닫기
    // =============================================
    function closeDetail() {
        const overlay = document.getElementById('notifPopupOverlay');
        if (overlay) overlay.classList.remove('show');
    }

    // =============================================
    // 외부 클릭 시 드롭다운 닫기
    // =============================================
    document.addEventListener('click', function (e) {
        const wrapper = document.getElementById('notifWrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            closeDropdown();
        }
    });

    // =============================================
    // HTML 이스케이프
    // =============================================
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // =============================================
    // 전역 공개 API
    // =============================================
    window.NotificationSystem = {
        load: loadNotifications,
        toggleDropdown: toggleDropdown,
        openDetail: openDetail,
        closeDetail: closeDetail,
        refresh: loadNotifications       // 외부에서 새로고침용
    };

    // 기존 HTML onclick 호환용 전역 함수
    window.toggleNotifDropdown = toggleDropdown;
    window.openNotifDetail = openDetail;
    window.closeNotifDetail = closeDetail;

    console.log('🔔 notification.js 로드 완료');
})();
