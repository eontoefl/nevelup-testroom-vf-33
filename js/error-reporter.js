/**
 * ================================================
 * error-reporter.js v=002
 * 오류 전송 플로팅 버튼 + 콘솔 로그 수집
 * ================================================
 * 
 * 기능:
 * 1. console.log/warn/error를 오버라이드하여 내부 버퍼에 저장 (최근 500줄)
 * 2. 우측 하단 플로팅 버튼 표시 (모든 화면에서)
 * 3. 클릭 시 간단한 메시지 입력 + 콘솔 로그 전체를 Supabase에 저장
 * 
 * 의존: supabase-client.js (supabaseInsert), auth.js (getCurrentUser)
 */

(function() {
    'use strict';

    // ============================================
    // 1. 콘솔 로그 버퍼 (최근 500줄)
    // ============================================
    const LOG_BUFFER_SIZE = 500;
    const logBuffer = [];

    const originalConsole = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        info: console.info.bind(console)
    };

    function addToBuffer(level, args) {
        const timestamp = new Date().toISOString().split('T')[1].substring(0, 12);
        const message = Array.from(args).map(arg => {
            if (typeof arg === 'object') {
                try { return JSON.stringify(arg, null, 0); }
                catch { return String(arg); }
            }
            return String(arg);
        }).join(' ');

        logBuffer.push(`[${timestamp}][${level}] ${message}`);

        // 버퍼 크기 제한
        if (logBuffer.length > LOG_BUFFER_SIZE) {
            logBuffer.splice(0, logBuffer.length - LOG_BUFFER_SIZE);
        }
    }

    // 오버라이드
    console.log = function() {
        addToBuffer('LOG', arguments);
        originalConsole.log.apply(console, arguments);
    };
    console.warn = function() {
        addToBuffer('WARN', arguments);
        originalConsole.warn.apply(console, arguments);
    };
    console.error = function() {
        addToBuffer('ERROR', arguments);
        originalConsole.error.apply(console, arguments);
    };
    console.info = function() {
        addToBuffer('INFO', arguments);
        originalConsole.info.apply(console, arguments);
    };

    // 전역 에러도 캡처
    window.addEventListener('error', function(e) {
        addToBuffer('UNCAUGHT', [`${e.message} at ${e.filename}:${e.lineno}:${e.colno}`]);
    });

    window.addEventListener('unhandledrejection', function(e) {
        addToBuffer('PROMISE', [String(e.reason)]);
    });

    // ============================================
    // 2. 현재 활성 화면 감지
    // ============================================
    function getCurrentScreenId() {
        const screens = document.querySelectorAll('.screen');
        for (const screen of screens) {
            if (screen.style.display === 'block' || screen.classList.contains('active')) {
                return screen.id || 'unknown';
            }
        }
        return 'unknown';
    }

    // ============================================
    // 3. 플로팅 버튼 + 모달 UI 생성
    // ============================================
    function createUI() {
        // CSS
        const style = document.createElement('style');
        style.textContent = `
            #errorReporterBtn {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: #f97c7c;
                border: none;
                cursor: pointer;
                box-shadow: 0 2px 12px rgba(239, 68, 68, 0.25);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                transition: transform 0.2s, box-shadow 0.2s;
            }
            #errorReporterBtn:hover {
                transform: scale(1.1);
                box-shadow: 0 4px 16px rgba(239, 68, 68, 0.5);
            }
            #errorReporterBtn:active {
                transform: scale(0.95);
            }

            #errorReporterOverlay {
                display: none;
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 100000;
                align-items: center;
                justify-content: center;
            }
            #errorReporterOverlay.active {
                display: flex;
            }

            #errorReporterModal {
                background: white;
                border-radius: 16px;
                padding: 28px;
                max-width: 420px;
                width: 90%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                animation: errModalIn 0.25s ease-out;
            }
            @keyframes errModalIn {
                from { opacity: 0; transform: scale(0.9) translateY(20px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
            }

            #errorReporterModal h3 {
                margin: 0 0 6px 0;
                font-size: 18px;
                color: #1a202c;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            #errorReporterModal .err-subtitle {
                font-size: 13px;
                color: #718096;
                margin-bottom: 10px;
            }
            #errorReporterModal .err-privacy-note {
                font-size: 12px;
                color: #94a3b8;
                background: #f8fafc;
                border-radius: 6px;
                padding: 8px 10px;
                margin-bottom: 14px;
                line-height: 1.5;
            }
            #errorReporterModal textarea {
                width: 100%;
                height: 80px;
                border: 2px solid #e2e8f0;
                border-radius: 8px;
                padding: 10px 12px;
                font-size: 14px;
                resize: none;
                outline: none;
                transition: border-color 0.2s;
                box-sizing: border-box;
            }
            #errorReporterModal textarea:focus {
                border-color: #ef4444;
            }
            #errorReporterModal textarea::placeholder {
                color: #a0aec0;
            }
            .err-btn-row {
                display: flex;
                gap: 10px;
                margin-top: 14px;
            }
            .err-btn-cancel {
                flex: 1;
                padding: 10px;
                background: #f1f5f9;
                color: #475569;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            }
            .err-btn-cancel:hover { background: #e2e8f0; }
            .err-btn-submit {
                flex: 1;
                padding: 10px;
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            }
            .err-btn-submit:hover { background: #dc2626; }
            .err-btn-submit:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }

            .err-toast {
                position: fixed;
                bottom: 80px;
                right: 20px;
                background: #1a202c;
                color: white;
                padding: 12px 20px;
                border-radius: 10px;
                font-size: 14px;
                font-weight: 500;
                z-index: 100001;
                animation: errToastIn 0.3s ease-out, errToastOut 0.3s ease-in 2.5s forwards;
            }
            @keyframes errToastIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes errToastOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
        document.head.appendChild(style);

        // 플로팅 버튼
        const btn = document.createElement('button');
        btn.id = 'errorReporterBtn';
        btn.innerHTML = '<img src="https://eontoefl.github.io/neveluptestroom_vf/icon/error_send_icon.png" alt="오류 전송" style="width:28px;height:28px;">';
        btn.title = '오류 전송';
        btn.style.display = 'none'; // 로그인 전에는 숨김
        btn.onclick = openModal;
        document.body.appendChild(btn);

        // 로그인 화면 감지 — 로그인 화면이면 숨기고 아니면 표시
        function updateBtnVisibility() {
            const loginScreen = document.getElementById('loginScreen');
            const isLogin = loginScreen && (loginScreen.style.display === 'block' || loginScreen.style.display === 'flex' || loginScreen.classList.contains('active'));
            btn.style.display = isLogin ? 'none' : 'flex';
        }

        // 화면 전환 감지 (MutationObserver)
        const observer = new MutationObserver(updateBtnVisibility);
        observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
        // 초기 체크 (1초 후 — DOM 렌더링 대기)
        setTimeout(updateBtnVisibility, 1000);

        // 오버레이 + 모달
        const overlay = document.createElement('div');
        overlay.id = 'errorReporterOverlay';
        overlay.innerHTML = `
            <div id="errorReporterModal">
                <h3>⚠️ 오류 전송</h3>
                <p class="err-subtitle">현재 상태와 로그가 자동으로 전송됩니다.</p>
                <p class="err-privacy-note">🔒 우리 사이트 코드 내부에서 자체적으로 찍은 로그만 수집하는 거라 카메라/마이크/위치 같은 민감한 API를 쓰는 게 아니니 걱정마세요.</p>
                <textarea id="errorReporterMessage" placeholder="어떤 문제가 발생했나요? (선택사항)"></textarea>
                <div class="err-btn-row">
                    <button class="err-btn-cancel" id="errorReporterCancel">취소</button>
                    <button class="err-btn-submit" id="errorReporterSubmit">전송하기</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // 오버레이 바깥 클릭 닫기
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeModal();
        });

        document.getElementById('errorReporterCancel').onclick = closeModal;
        document.getElementById('errorReporterSubmit').onclick = submitReport;
    }

    // ============================================
    // 4. 모달 열기/닫기
    // ============================================
    function openModal() {
        document.getElementById('errorReporterOverlay').classList.add('active');
        document.getElementById('errorReporterMessage').value = '';
        document.getElementById('errorReporterMessage').focus();
    }

    function closeModal() {
        document.getElementById('errorReporterOverlay').classList.remove('active');
    }

    function showToast(message) {
        const existing = document.querySelector('.err-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'err-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ============================================
    // 5. 제보 전송
    // ============================================
    async function submitReport() {
        const submitBtn = document.getElementById('errorReporterSubmit');
        submitBtn.disabled = true;
        submitBtn.textContent = '전송 중...';

        try {
            // 사용자 정보
            const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;

            // 콘솔 로그 합치기
            const logsText = logBuffer.join('\n');

            const reportData = {
                user_email: user ? (user.email || '') : '',
                user_name: user ? (user.name || '') : '',
                current_screen: getCurrentScreenId(),
                current_url: window.location.href,
                user_agent: navigator.userAgent,
                console_logs: logsText,
                user_message: document.getElementById('errorReporterMessage').value.trim(),
                reported_at: new Date().toISOString()
            };

            // Supabase에 저장
            if (typeof supabaseInsert === 'function') {
                const result = await supabaseInsert('tr_error_reports', reportData);
                if (result) {
                    originalConsole.log('✅ [ErrorReporter] 오류 전송 성공:', result.id);
                    showToast('✅ 오류 전송이 완료되었습니다. 감사합니다!');
                } else {
                    throw new Error('supabaseInsert 실패');
                }
            } else {
                // supabaseInsert가 아직 로드 안 됐을 때 — 직접 fetch
                originalConsole.warn('⚠️ [ErrorReporter] supabaseInsert 없음, 직접 전송');
                const response = await fetch(`https://qpqjevecjejvbeuogtbx.supabase.co/rest/v1/tr_error_reports`, {
                    method: 'POST',
                    headers: {
                        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwcWpldmVjamVqdmJldW9ndGJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MDAxNDEsImV4cCI6MjA4Njk3NjE0MX0.pJvY4u9oHQYa7IvAjWluHMow_4WIkONDBBasnXxF5Gc',
                        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwcWpldmVjamVqdmJldW9ndGJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MDAxNDEsImV4cCI6MjA4Njk3NjE0MX0.pJvY4u9oHQYa7IvAjWluHMow_4WIkONDBBasnXxF5Gc',
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify(reportData)
                });
                if (response.ok) {
                    originalConsole.log('✅ [ErrorReporter] 직접 전송 성공');
                    showToast('✅ 오류 전송이 완료되었습니다. 감사합니다!');
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            }

            closeModal();

        } catch (error) {
            originalConsole.error('❌ [ErrorReporter] 전송 실패:', error);
            showToast('❌ 전송에 실패했습니다. 다시 시도해주세요.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '전송하기';
        }
    }

    // ============================================
    // 6. 초기화 (DOM 로드 후)
    // ============================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createUI);
    } else {
        createUI();
    }

    originalConsole.log('✅ [ErrorReporter] 오류 전송 시스템 로드 완료 (v=002)');
})();
