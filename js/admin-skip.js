/**
 * ================================================
 * admin-skip.js
 * 관리자(test@me.com) 전용 오디오/영상 Skip 버튼
 * ================================================
 * 
 * 동작 방식:
 * - test@me.com 로그인 시에만 활성화
 * - Audio/Video 재생 감지 → Skip 버튼 자동 표시
 * - Skip 클릭 → 미디어 정지 + ended 이벤트 강제 발생
 * - 타이머 감지 → Skip 버튼으로 즉시 완료
 * 
 * ★ 다른 계정에서는 일체 동작하지 않음
 */

(function() {
    'use strict';
    
    const ADMIN_EMAIL = 'test@me.com';
    
    // ========================================
    // 관리자 감지
    // ========================================
    function isAdmin() {
        return window.__isAdmin === true;
    }
    
    function checkAndSetAdmin() {
        try {
            const userStr = sessionStorage.getItem('currentUser');
            if (userStr) {
                const user = JSON.parse(userStr);
                if (user.email === ADMIN_EMAIL) {
                    window.__isAdmin = true;
                    console.log('🔧 [Admin] 관리자 모드 활성화');
                    initAdminSkip();
                    return;
                }
            }
        } catch(e) {}
        window.__isAdmin = false;
    }
    
    // ========================================
    // Skip 버튼 UI
    // ========================================
    let skipBtn = null;
    let currentMediaElement = null;
    
    function createSkipButton() {
        if (skipBtn) return;
        
        skipBtn = document.createElement('button');
        skipBtn.id = 'adminSkipBtn';
        skipBtn.innerHTML = '⏭ SKIP';
        skipBtn.style.cssText = 
            'position:fixed;bottom:80px;left:20px;z-index:99999;' +
            'background:#ff4444;color:#fff;border:none;border-radius:8px;' +
            'padding:10px 20px;font-size:14px;font-weight:bold;cursor:pointer;' +
            'box-shadow:0 4px 12px rgba(255,0,0,0.4);display:none;' +
            'transition:transform 0.1s;';
        
        skipBtn.addEventListener('mousedown', function() {
            skipBtn.style.transform = 'scale(0.95)';
        });
        skipBtn.addEventListener('mouseup', function() {
            skipBtn.style.transform = 'scale(1)';
        });
        
        skipBtn.addEventListener('click', function() {
            doSkip();
        });
        
        document.body.appendChild(skipBtn);
    }
    
    function showSkip(label) {
        if (!skipBtn) createSkipButton();
        skipBtn.innerHTML = '⏭ ' + (label || 'SKIP');
        skipBtn.style.display = 'block';
    }
    
    function hideSkip() {
        if (skipBtn) skipBtn.style.display = 'none';
        currentMediaElement = null;
    }
    
    // ========================================
    // Skip 실행
    // ========================================
    function doSkip() {
        console.log('⏭ [Admin] Skip 실행');
        
        // ★ skipMode 켜기 - 이후 setTimeout 딜레이를 0으로
        window.__skipMode = true;
        setTimeout(function() { window.__skipMode = false; }, 3000);
        
        // 1. 현재 재생 중인 미디어 정지 + ended 이벤트 발생
        if (currentMediaElement) {
            try {
                currentMediaElement.pause();
                currentMediaElement.currentTime = currentMediaElement.duration || 0;
                currentMediaElement.dispatchEvent(new Event('ended'));
                console.log('  → 미디어 ended 이벤트 발생');
            } catch(e) {
                console.log('  → 미디어 이벤트 발생 실패:', e.message);
            }
            currentMediaElement = null;
        }
        
        // 2. 페이지 내 모든 재생 중인 Audio/Video 정지
        document.querySelectorAll('audio, video').forEach(function(el) {
            if (!el.paused) {
                try {
                    el.pause();
                    el.currentTime = el.duration || 0;
                    el.dispatchEvent(new Event('ended'));
                } catch(e) {}
            }
        });
        
        // 3. ★ 스피킹 타이머 강제 스킵 (Repeat + Interview만)
        skipSpeakingTimers();
        
        hideSkip();
    }
    
    // ========================================
    // 스피킹 타이머 강제 스킵
    // ========================================
    function skipSpeakingTimers() {
        // Repeat 컴포넌트 타이머
        var repeatComp = window.currentRepeatComponent;
        if (repeatComp && repeatComp.repeatTimer) {
            console.log('⏭ [Admin] Repeat 타이머 스킵');
            clearInterval(repeatComp.repeatTimer);
            repeatComp.repeatTimer = null;
            if (typeof repeatComp.stopRepeatRecording === 'function' && repeatComp._currentRecordingSet) {
                try {
                    repeatComp.stopRepeatRecording(repeatComp._currentRecordingSet, repeatComp._currentRecordingAudioIndex || 0);
                } catch(e) {
                    console.log('  → Repeat 녹음 중지 실패:', e.message);
                }
            }
        }
        
        // Interview 컴포넌트 타이머
        var interviewComp = window.currentInterviewComponent;
        if (interviewComp && interviewComp.interviewTimer) {
            console.log('⏭ [Admin] Interview 타이머 스킵');
            clearInterval(interviewComp.interviewTimer);
            interviewComp.interviewTimer = null;
            if (typeof interviewComp.stopInterviewRecording === 'function' && interviewComp._currentRecordingSet) {
                try {
                    interviewComp.stopInterviewRecording(interviewComp._currentRecordingSet, interviewComp._currentRecordingQuestionIndex || 0);
                } catch(e) {
                    console.log('  → Interview 녹음 중지 실패:', e.message);
                }
            }
        }
        
        // 첨삭 Speaking 카운트다운 타이머
        var corrSpkState = window._correctionSpeakingState;
        if (corrSpkState && corrSpkState.countdownTimer) {
            console.log('⏭ [Admin] 첨삭 Speaking 카운트다운 스킵');
            clearInterval(corrSpkState.countdownTimer);
            corrSpkState.countdownTimer = null;
            corrSpkState.countdownRemaining = 0;
            if (typeof _onCorrSpkCountdownEnd === 'function') {
                _onCorrSpkCountdownEnd(corrSpkState.currentQuestion);
            }
        }
    }
    
    // ========================================
    // Audio/Video play() 감시 (Monkey Patch)
    // ========================================
    function initAdminSkip() {
        createSkipButton();
        
        // ★ setTimeout 래핑 - admin Skip 후 딜레이를 즉시 실행
        const originalSetTimeout = window.setTimeout;
        window.__skipMode = false;
        window.setTimeout = function(fn, delay) {
            if (isAdmin() && window.__skipMode && typeof fn === 'function' && delay > 200) {
                console.log('⏭ [Admin] setTimeout ' + delay + 'ms → 즉시 실행');
                return originalSetTimeout.call(window, fn, 0);
            }
            return originalSetTimeout.apply(window, arguments);
        };
        
        // Audio.prototype.play 래핑
        const originalAudioPlay = Audio.prototype.play;
        Audio.prototype.play = function() {
            if (isAdmin()) {
                currentMediaElement = this;
                var self = this;
                
                // ended 시 자동 숨김
                this.addEventListener('ended', function() {
                    if (currentMediaElement === self) hideSkip();
                }, { once: true });
                
                this.addEventListener('error', function() {
                    if (currentMediaElement === self) hideSkip();
                }, { once: true });
                
                showSkip('SKIP Audio');
            }
            return originalAudioPlay.apply(this, arguments);
        };
        
        // HTMLMediaElement (video) play() 래핑
        const originalVideoPlay = HTMLVideoElement.prototype.play;
        HTMLVideoElement.prototype.play = function() {
            if (isAdmin()) {
                currentMediaElement = this;
                var self = this;
                
                this.addEventListener('ended', function() {
                    if (currentMediaElement === self) hideSkip();
                }, { once: true });
                
                this.addEventListener('error', function() {
                    if (currentMediaElement === self) hideSkip();
                }, { once: true });
                
                showSkip('SKIP Video');
            }
            return originalVideoPlay.apply(this, arguments);
        };
        
        // ★ 스피킹 녹음 타이머 감지 (녹음 UI가 보이면 Skip 표시)
        const origSetInterval = window.setInterval;
        window.setInterval = function(fn, delay) {
            var id = origSetInterval.apply(window, arguments);
            if (isAdmin() && delay === 1000) {
                // 스피킹 타이머 (1초 간격)인지 체크
                setTimeout(function() {
                    var repeatUI = document.getElementById('repeatRecordingUI');
                    var interviewUI = document.getElementById('interviewRecordingUI');
                    var corrSpkUI = document.getElementById('corrSpkRecordingUI');
                    if ((repeatUI && repeatUI.style.display === 'flex') || 
                        (interviewUI && interviewUI.style.display === 'flex') ||
                        (corrSpkUI && corrSpkUI.style.display === 'flex')) {
                        showSkip('SKIP Timer');
                    }
                }, 100);
            }
            return id;
        };
        
        console.log('🔧 [Admin] Skip 버튼 초기화 완료');
    }
    
    // ========================================
    // 로그인 시점 감지
    // ========================================
    
    // 페이지 로드 시 체크
    checkAndSetAdmin();
    
    // sessionStorage 변경 감시 (로그인 시점 감지)
    const originalSetItem = sessionStorage.setItem;
    sessionStorage.setItem = function(key, value) {
        originalSetItem.apply(this, arguments);
        if (key === 'currentUser') {
            setTimeout(checkAndSetAdmin, 100);
        }
    };
    
    console.log('✅ admin-skip.js 로드 완료');
})();
