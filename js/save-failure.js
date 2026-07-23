/**
 * ================================================
 * save-failure.js — 연습코스 저장 실패 대응 (SaveGuard)
 * ================================================
 *
 * 흐름 (연습코스 전용 — 정규코스는 기존 동작 유지):
 *  1. 저장 시도 → 실패하면 간격을 두고 자동 재시도 (즉시 → 3초 → 10초)
 *     재시도 중에는 상단 토스트로 "다시 시도하고 있어요 (n/3)" 안내
 *  2. 최종 실패 → 팝업: "저장에 실패했어요" + [관리자에게 보고하기]
 *  3. 보고 → n8n 웹훅 → 관리자 이메일 (푼 기록 원본 첨부)
 *     성공: "전달 완료" 팝업 (관리자가 복구·수정 약속)
 *     실패: 브라우저(localStorage)에 보관 → 다음 접속 때 자동 재전송
 *
 * 의존: getCurrentUser(), window._sgLastError(supabase-client.js가 기록)
 */

var SaveGuard = {
    WEBHOOK_URL: 'https://eontoefl.app.n8n.cloud/webhook/save-failure-report',
    RETRY_DELAYS: [0, 3000, 10000],   // 1차 즉시, 2차 3초 뒤, 3차 10초 뒤
    STASH_KEY: 'sg_pending_reports',

    // ========================================
    // 1. 재시도 래퍼
    // ========================================
    /**
     * saveFn(저장 함수, 성공 시 truthy 반환)을 간격을 두고 최대 3회 시도.
     * @returns 저장 결과 또는 null(최종 실패)
     */
    attempt: async function(saveFn) {
        for (var i = 0; i < this.RETRY_DELAYS.length; i++) {
            if (this.RETRY_DELAYS[i] > 0) {
                this._showRetryToast(i + 1, this.RETRY_DELAYS.length);
                await new Promise(function(r) { setTimeout(r, SaveGuard.RETRY_DELAYS[i]); });
            }
            try {
                var result = await saveFn();
                if (result) {
                    this._hideRetryToast();
                    return result;
                }
            } catch (e) {
                console.warn('⚠️ [SaveGuard] 시도 ' + (i + 1) + ' 실패:', e);
            }
            console.warn('⚠️ [SaveGuard] 저장 시도 ' + (i + 1) + '/' + this.RETRY_DELAYS.length + ' 실패');
        }
        this._hideRetryToast();
        return null;
    },

    // ========================================
    // 2. 실패 팝업
    // ========================================
    /**
     * @param {object} ctx
     *   sectionType, moduleNumber, practiceNumber, taskLabel, record(저장하려던 JSON),
     *   onDone(선택 — 보고/보관 완료 후 실행. 보통 backToTaskDashboard)
     */
    showFailurePopup: function(ctx) {
        this._injectStyles();
        this._removePopup();

        var overlay = document.createElement('div');
        overlay.id = 'sgOverlay';
        overlay.innerHTML =
            '<div class="sg-popup">' +
            '  <div class="sg-icon">⚠️</div>' +
            '  <h3 class="sg-title">저장에 실패했어요</h3>' +
            '  <p class="sg-body">인터넷 연결 문제로 풀이 기록이 저장되지 못했어요.<br>' +
            '     여러 번 다시 시도했지만 전송이 되지 않았습니다.<br><br>' +
            '     아래 버튼을 누르면 <b>지금 푼 기록 전체가 관리자에게 안전하게 전달</b>됩니다.</p>' +
            '  <button class="sg-btn sg-btn-primary" id="sgReportBtn">관리자에게 보고하기</button>' +
            '</div>';
        document.body.appendChild(overlay);

        var btn = document.getElementById('sgReportBtn');
        btn.onclick = async function() {
            btn.disabled = true;
            btn.textContent = '전달 중...';

            var payload = SaveGuard._buildPayload(ctx);
            var sent = await SaveGuard._sendReport(payload);

            if (sent) {
                SaveGuard._swapPopup('✅', '전달 완료!',
                    '푼 기록이 관리자에게 잘 전달되었어요.<br>' +
                    '관리자가 기록을 <b>복구</b>하고, 오류가 있다면 <b>고칠게요</b>.<br>' +
                    '불편을 드려 죄송합니다. 이용해 주셔서 감사해요!', ctx);
            } else {
                SaveGuard._stash(payload);
                SaveGuard._swapPopup('📦', '기기에 안전하게 보관했어요',
                    '지금은 연결이 어려워서 푼 기록을 이 기기(브라우저)에 보관해 두었어요.<br>' +
                    '<b>다음에 접속하면 자동으로 관리자에게 전송</b>됩니다.<br>' +
                    '같은 브라우저로 다시 접속해 주세요!', ctx);
            }
        };
    },

    _swapPopup: function(icon, title, bodyHtml, ctx) {
        var overlay = document.getElementById('sgOverlay');
        if (!overlay) return;
        overlay.innerHTML =
            '<div class="sg-popup">' +
            '  <div class="sg-icon">' + icon + '</div>' +
            '  <h3 class="sg-title">' + title + '</h3>' +
            '  <p class="sg-body">' + bodyHtml + '</p>' +
            '  <button class="sg-btn sg-btn-primary" id="sgCloseBtn">확인</button>' +
            '</div>';
        document.getElementById('sgCloseBtn').onclick = function() {
            SaveGuard._removePopup();
            if (ctx && typeof ctx.onDone === 'function') ctx.onDone();
        };
    },

    _removePopup: function() {
        var el = document.getElementById('sgOverlay');
        if (el) el.remove();
    },

    // ========================================
    // 3. 보고 전송 (n8n 웹훅 → 관리자 이메일)
    // ========================================
    _buildPayload: function(ctx) {
        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : (window.currentUser || {});
        var err = window._sgLastError || {};
        var failReason, failDetail;
        if (err.kind === 'server') {
            failReason = '서버 거절 (HTTP ' + err.status + ')';
            failDetail = err.body || '';
        } else if (err.kind === 'network') {
            failReason = '네트워크 차단/끊김 (요청이 서버에 도달하지 못함)';
            failDetail = err.message || '';
        } else {
            failReason = '알 수 없음';
            failDetail = '';
        }
        return {
            studentName: user.name || '?',
            studentEmail: user.email || '?',
            userId: user.id || '?',
            taskLabel: ctx.taskLabel || (ctx.sectionType + ' M' + ctx.moduleNumber),
            sectionType: ctx.sectionType,
            moduleNumber: ctx.moduleNumber,
            practiceNumber: ctx.practiceNumber,
            failReason: failReason,
            failDetail: String(failDetail).slice(0, 800),
            retries: this.RETRY_DELAYS.length,
            browser: this._browserInfo(),
            payloadSize: JSON.stringify(ctx.record || {}).length,
            occurredAt: new Date().toISOString(),
            record: ctx.record || {}
        };
    },

    _sendReport: async function(payload) {
        try {
            var res = await fetch(this.WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            return res.ok;
        } catch (e) {
            console.error('❌ [SaveGuard] 보고 전송 실패:', e);
            return false;
        }
    },

    // ========================================
    // 4. 보관 + 다음 접속 시 자동 재전송
    // ========================================
    _stash: function(payload) {
        try {
            var list = JSON.parse(localStorage.getItem(this.STASH_KEY) || '[]');
            list.push(payload);
            // 브라우저 저장 한도 보호: 최근 5건만 유지
            if (list.length > 5) list = list.slice(-5);
            localStorage.setItem(this.STASH_KEY, JSON.stringify(list));
            console.log('📦 [SaveGuard] 보고 보관됨 (' + list.length + '건 대기)');
        } catch (e) {
            console.error('❌ [SaveGuard] 보관 실패:', e);
        }
    },

    resendStashed: async function() {
        var list;
        try {
            list = JSON.parse(localStorage.getItem(this.STASH_KEY) || '[]');
        } catch (e) { return; }
        if (!list.length) return;

        console.log('📦 [SaveGuard] 보관된 보고 ' + list.length + '건 재전송 시도...');
        var remaining = [];
        for (var i = 0; i < list.length; i++) {
            var ok = await this._sendReport(list[i]);
            if (!ok) remaining.push(list[i]);
        }
        localStorage.setItem(this.STASH_KEY, JSON.stringify(remaining));

        var sentCount = list.length - remaining.length;
        if (sentCount > 0) {
            this._showToast('보관 중이던 학습 기록 ' + sentCount + '건이 관리자에게 전송되었어요 ✅', 5000);
        }
    },

    // ========================================
    // 5. 토스트/스타일 (내부용)
    // ========================================
    _showRetryToast: function(tryNum, total) {
        this._showToast('연결이 불안정해서 다시 시도하고 있어요 (' + tryNum + '/' + total + ')...<br>창을 닫지 말아 주세요', 0);
    },

    _hideRetryToast: function() {
        var el = document.getElementById('sgToast');
        if (el) el.remove();
    },

    _showToast: function(html, autoHideMs) {
        this._injectStyles();
        var el = document.getElementById('sgToast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'sgToast';
            document.body.appendChild(el);
        }
        el.innerHTML = html;
        if (autoHideMs > 0) {
            setTimeout(function() {
                var t = document.getElementById('sgToast');
                if (t) t.remove();
            }, autoHideMs);
        }
    },

    _browserInfo: function() {
        var ua = navigator.userAgent;
        var browser = 'Unknown';
        if (ua.indexOf('Edg/') >= 0) browser = 'Edge ' + (ua.match(/Edg\/([\d.]+)/) || [])[1];
        else if (ua.indexOf('Chrome/') >= 0) browser = 'Chrome ' + (ua.match(/Chrome\/([\d.]+)/) || [])[1];
        else if (ua.indexOf('Safari/') >= 0) browser = 'Safari';
        var os = 'Unknown';
        if (ua.indexOf('Windows') >= 0) os = 'Windows';
        else if (ua.indexOf('Mac') >= 0) os = 'Mac';
        else if (ua.indexOf('Android') >= 0) os = 'Android';
        else if (ua.indexOf('iPhone') >= 0 || ua.indexOf('iPad') >= 0) os = 'iOS';
        return browser + ' / ' + os;
    },

    _stylesInjected: false,
    _injectStyles: function() {
        if (this._stylesInjected) return;
        this._stylesInjected = true;
        var css =
            '#sgOverlay { position: fixed; inset: 0; background: rgba(15,15,30,0.55); z-index: 99999;' +
            '  display: flex; align-items: center; justify-content: center; padding: 20px; }' +
            '.sg-popup { background: #fff; border-radius: 16px; max-width: 420px; width: 100%;' +
            '  padding: 28px 24px; text-align: center; box-shadow: 0 12px 40px rgba(0,0,0,0.25);' +
            '  font-family: inherit; }' +
            '.sg-icon { font-size: 2.4rem; margin-bottom: 10px; }' +
            '.sg-title { font-size: 1.2rem; font-weight: 700; color: #1e1b2e; margin: 0 0 12px; }' +
            '.sg-body { font-size: 0.92rem; color: #4a5568; line-height: 1.65; margin: 0 0 20px; }' +
            '.sg-btn { border: none; border-radius: 10px; padding: 13px 22px; font-size: 0.95rem;' +
            '  font-weight: 600; cursor: pointer; width: 100%; }' +
            '.sg-btn-primary { background: #6c5ce7; color: #fff; }' +
            '.sg-btn-primary:disabled { background: #a99ee8; cursor: default; }' +
            '#sgToast { position: fixed; top: 18px; left: 50%; transform: translateX(-50%);' +
            '  background: #1e1b2e; color: #fff; padding: 12px 20px; border-radius: 10px;' +
            '  font-size: 0.88rem; line-height: 1.5; text-align: center; z-index: 100000;' +
            '  box-shadow: 0 6px 20px rgba(0,0,0,0.3); }';
        var style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }
};

window.SaveGuard = SaveGuard;

// 접속 시: 보관된 보고가 있으면 자동 재전송 (5초 뒤 — 초기 로딩 방해 금지)
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() { SaveGuard.resendStashed(); }, 5000);
    });
}

console.log('✅ save-failure.js (SaveGuard) 로드 완료');
