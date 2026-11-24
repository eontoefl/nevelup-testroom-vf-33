/**
 * ================================================
 * auth.js v2 — Supabase 로그인 시스템
 * ================================================
 * 
 * 변경 내역:
 * - Google Sheets 인증 → Supabase users 테이블 조회
 * - 이름+전화번호 → 이메일+비밀번호
 * - 로그인 성공 시 applications에서 4주/8주 자동 판별
 * - 세션 정보에 user_id, 프로그램 타입 포함
 */

// 현재 로그인한 사용자 정보
let currentUser = null;

// 첨삭 D-1 새벽 4시 기준 활성화 판정 (학생 타임존 기반)
function isCorrectionActiveNow(programInfo, timezone) {
    if (!programInfo.correctionEnabled) return false;
    if (!programInfo.correctionStartDate) return false;

    // 시작일 하루 전 — 'YYYY-MM-DD'를 로컬 자정으로 해석(timezone-utils.js). 예전 new Date(문자열)은 UTC 자정이라
    // 미주 시간대 브라우저에서 하루 빨리 열리던 버그가 있었다(2026-10-06 수정).
    var startStr = (typeof addDaysYmd === 'function') ? addDaysYmd(programInfo.correctionStartDate, -1) : null;
    if (!startStr) return false;

    return isEffectiveTodayOnOrAfter(startStr, timezone || 'Asia/Seoul');
}

// 로그인 처리
async function handleLogin(event) {
    if (_trAuthOn()) return _trHandleLogin(event);   // 새 로그인(스위치가 켜졌을 때만). 꺼짐이면 아래 그대로
    event.preventDefault();
    
    console.log('🔐 handleLogin 호출됨');
    
    const emailInput = document.getElementById('studentEmail');
    const passwordInput = document.getElementById('studentPassword');
    const loginBtn = document.getElementById('loginBtn');
    
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    
    console.log('입력값 - 이메일:', email);
    
    // 🔧 개발 모드: 빈 값으로 로그인 시 바로 접속
    if (!email && !password) {
        console.log('🔧 [개발 모드] 빈 값 로그인');
        currentUser = {
            id: 'dev-user-001',
            name: '개발자',
            email: 'dev@test.com',
            phone: '01000000000',
            program: '내벨업챌린지 - Standard',
            programType: 'standard',
            applicationId: null
        };
        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        showScreen('scheduleScreen');
        return;
    }
    
    // 입력값 검증
    if (!email) {
        showLoginError('이메일을 입력해주세요.');
        return;
    }
    if (!password) {
        showLoginError('비밀번호를 입력해주세요.');
        return;
    }
    
    // 버튼 비활성화 및 로딩 표시
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 로그인 중...';
    hideLoginMessage();
    
    try {
        // 1. Supabase에서 이메일+비밀번호 확인
        const user = await loginWithCredentials(email, password);
        
        if (!user) {
            showLoginError('이메일 또는 비밀번호가 올바르지 않습니다.');
            resetLoginBtn();
            return;
        }
        
        if (user.error === 'blocked') {
            showLoginError('차단된 계정입니다. 관리자에게 문의하세요.');
            resetLoginBtn();
            return;
        }
        
        // 2. 프로그램 정보 조회 (4주/8주) + 입금 확인 체크 + practice_enabled
        const programInfo = await getStudentProgram(email);
        
        // 수강신청 없음
        if (programInfo.error === 'no_application') {
            showLoginError('수강 신청 내역이 없습니다. 공식 홈페이지에서 먼저 수강 신청을 해주세요.');
            resetLoginBtn();
            return;
        }
        
        // 입금 미확인
        if (programInfo.error === 'not_confirmed') {
            showLoginError('수강 등록이 아직 확인되지 않았습니다. 관리자에게 문의해주세요.');
            resetLoginBtn();
            return;
        }
        
        // 3. 세션에 저장할 사용자 정보 구성
        const programType = programInfo.program.includes('Fast') ? 'fast' : 'standard';
        
        const userTimezone = user.timezone || 'Asia/Seoul';

        currentUser = {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone || '',
            program: programInfo.program,
            programType: programType,  // 'fast' = 4주, 'standard' = 8주
            applicationId: programInfo.applicationId,
            enrollmentNo: programInfo.enrollmentNo || 1,   // 수강 번호(2=재시작). 기록 꼬리표는 applicationId
            // 단어장 v1/v2 판정용(2026-11-13, js/vocab-version.js)
            shippingCompletedAt: programInfo.shippingCompletedAt || null,
            shippingWaived: !!programInfo.shippingWaived,
            restartMaterials: programInfo.restartMaterials || [],
            shipInfoLoaded: !!programInfo.shipInfoLoaded,
            startDate: programInfo.startDate,
            australiaStartDate: programInfo.australiaStartDate || null,  // 호주과정 시작일 (별도)
            practiceEnabled: !!programInfo.practiceEnabled,  // 연습코스 활성화 여부
            correctionEnabled: isCorrectionActiveNow(programInfo, userTimezone),  // 첨삭(FEEDBACK): D-1 새벽4시부터 활성화
            selfPaced: !!programInfo.selfPaced,  // 자기주도 모드
            selfPacedWeeks: programInfo.selfPacedWeeks || null,  // (구) 완료 기한(주). 시작일+N주 = 만료일
            selfPacedEndDate: programInfo.selfPacedEndDate || null,  // (v2) 종료일. 있으면 압축+매일마감 모드
            selfPacedSchedule: programInfo.selfPacedSchedule || null,  // (v2) 저장된 확정 일정표(JSON/객체)
            challengePauses: programInfo.challengePauses || [],   // 내챌 일시정지 이력
            correctionPauses: programInfo.correctionPauses || [], // 첨삭 일시정지 이력
            serviceStops: programInfo.serviceStops || [],         // 환불·중도포기 기록(2026-10-12)
            appStatus: programInfo.appStatus || null,             // 옛 방식 환불 표시
            refundAt: programInfo.refundAt || null,
            correctionStartDate: programInfo.correctionStartDate || null,
            deadlineExtensions: programInfo.deadlineExtensions || [],   // 내챌 마감 연장(이 수강)
            scheduleSyncOk: programInfo.deadlineExtensions !== null,    // 일정 재료를 모두 받아왔는가(고정 조건)
            timezone: userTimezone  // 학생별 타임존 (IANA)
        };

        // v2 확정 일정표 생성/갱신(materialize): 없거나 종료일이 바뀌었으면 다시 만들어 저장.
        // → 화면 날짜가 매번 흔들리지 않게 하고, 종료일 변경 시 과거는 보존·미래만 재분배.
        await _ensureSelfPacedSchedule(currentUser, programInfo.applicationId, userTimezone);

        // 세션에 저장 (새로고침 시에도 유지)
        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        // 매핑 테이블에 저장 (이메일 → UUID 조회용)
        try {
            if (typeof supabaseUpsert === 'function') {
                await supabaseUpsert('tr_user_map', {
                    user_id: user.id,
                    email: user.email,
                    name: user.name,
                    updated_at: new Date().toISOString()
                }, 'user_id');
                console.log('✅ [UserMap] 매핑 저장 완료:', user.email);
            }
        } catch (mapErr) {
            console.warn('⚠️ [UserMap] 매핑 저장 실패 (무시):', mapErr);
        }
        
        console.log('✅ 로그인 성공:', currentUser.name, '(' + programType + ')');
        
        // Sentry에 사용자 정보 연동 (에러 발생 시 누구인지 식별)
        if (typeof Sentry !== 'undefined' && Sentry.setUser) {
            Sentry.setUser({ id: user.id, email: user.email, username: user.name });
        }
        
        const programLabel = programType === 'fast' ? '4주 Fast' : '8주 Standard';
        showLoginSuccess(`환영합니다, ${currentUser.name}님! (${programLabel})`);
        
        // 밀린 인증률 일괄 확정 (로그인 대기 시간 동안 백그라운드 처리) — 일정 재료를 모두 받아왔을 때만.
        // 로그인 때 못 받았으면 새로고침과 같은 동기화(refreshPauseState)를 한 번 더 거친 뒤 확정한다.
        var _loginSync = (currentUser.scheduleSyncOk || typeof refreshPauseState !== 'function')
            ? Promise.resolve()
            : refreshPauseState(currentUser).catch(function (e) { console.warn('⚠️ 로그인 동기화 재시도 실패:', e); });
        _loginSync.then(function () { if (currentUser.scheduleSyncOk) _fillMissingAuthRates(user.id); });
        
        setTimeout(() => {
            showScreen('scheduleScreen');
            // 첫 로그인 시 온보딩 튜토리얼 표시 (임시 비활성화)
            // setTimeout(() => {
            //     if (typeof TutorialSystem !== 'undefined') TutorialSystem.show();
            // }, 800);
        }, 1200);
        
    } catch (error) {
        console.error('로그인 에러:', error);
        showLoginError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
        resetLoginBtn();
    }
}

// 로그인 버튼 초기화
function resetLoginBtn() {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> <span>로그인</span>';
    }
}

// 로그인 성공 메시지 표시
function showLoginSuccess(message) {
    const messageDiv = document.getElementById('loginMessage');
    messageDiv.className = 'login-message success';
    messageDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    messageDiv.style.display = 'block';
}

// 로그인 에러 메시지 표시
function showLoginError(message) {
    const messageDiv = document.getElementById('loginMessage');
    messageDiv.className = 'login-message error';
    messageDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    messageDiv.style.display = 'block';
}

// 로그인 메시지 숨기기
function hideLoginMessage() {
    const messageDiv = document.getElementById('loginMessage');
    if (messageDiv) {
        messageDiv.style.display = 'none';
    }
}

// 페이지 로드 시 세션 확인
window.addEventListener('DOMContentLoaded', async () => {
    const isBookPage = window.location.pathname.includes('book.html') || window.location.pathname.includes('commentary.html');

    // ── 수정 1: book.html + auth_token 파라미터 → 토큰 기반 자동 인증 ──
    if (isBookPage) {
        const urlParams = new URLSearchParams(window.location.search);
        const authToken = urlParams.get('auth_token');

        if (authToken && !_trBookConflict()) {
            console.log('🔑 [TokenAuth] 토큰 기반 인증 시도');
            try {
                // 1) tr_auth_tokens에서 토큰 조회 (만료 전인 것만)
                const now = new Date().toISOString();
                const tokens = await supabaseSelect(
                    'tr_auth_tokens',
                    'token=eq.' + encodeURIComponent(authToken)
                    + '&expires_at=gt.' + encodeURIComponent(now)
                    + '&limit=1'
                );

                if (!tokens || tokens.length === 0) {
                    console.log('❌ [TokenAuth] 토큰 무효 또는 만료');
                    window.location.href = 'https://eonfl.com';
                    return;
                }

                const tokenRow = tokens[0];

                // 2) users 테이블에서 사용자 정보 조회
                const users = await supabaseSelect(
                    'users',
                    'id=eq.' + tokenRow.user_id + '&select=id,name,email,phone&limit=1'
                );

                if (!users || users.length === 0) {
                    console.log('❌ [TokenAuth] 사용자를 찾을 수 없음');
                    window.location.href = 'https://eonfl.com';
                    return;
                }

                const user = users[0];

                // 홈페이지 대시보드에서 들어온 입문서 세션이어도,
                // 본인의 실제 challenge 신청에서 관리자 입금 확인이 끝났는지 구분한다.
                const confirmedChallengeApps = await supabaseSelect(
                    'applications',
                    'user_id=eq.' + encodeURIComponent(user.id)
                    + '&application_type=eq.challenge'
                    + '&deposit_confirmed_by_admin=eq.true'
                    + '&deleted=neq.true'
                    + '&withdrawn_at=is.null'
                    + '&select=id'
                    + '&limit=1'
                );

                // 3) sessionStorage에 사용자 정보 저장
                currentUser = {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone || '',
                    program: '입문서 무료 신청',
                    programType: 'book_only',
                    applicationId: null,
                    challengeDepositConfirmed: confirmedChallengeApps.length > 0
                };
                sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
                console.log('✅ [TokenAuth] 인증 성공:', currentUser.name);

                // 4) 사용한 토큰 삭제 (일회용)
                await supabaseDelete('tr_auth_tokens', 'id=eq.' + tokenRow.id);
                console.log('🗑️ [TokenAuth] 토큰 삭제 완료');

                // 5) URL에서 auth_token 파라미터 제거
                urlParams.delete('auth_token');
                const cleanSearch = urlParams.toString();
                const cleanUrl = window.location.pathname + (cleanSearch ? '?' + cleanSearch : '');
                window.history.replaceState({}, document.title, cleanUrl);

                // Sentry 사용자 연동
                if (typeof Sentry !== 'undefined' && Sentry.setUser) {
                    Sentry.setUser({ id: user.id, email: user.email, username: user.name });
                }

                // book-viewer.js에 인증 완료를 알림
                window.dispatchEvent(new Event('authReady'));
                return;

            } catch (err) {
                console.error('❌ [TokenAuth] 인증 처리 오류:', err);
                window.location.href = 'https://eonfl.com';
                return;
            }
        }
    }

    // 새 로그인(스위치가 켜졌을 때만, 책 화면·책 전용 상태 제외): 저장된 currentUser 만 보고 화면을 열지 않는다
    if (_trAuthOn() && !_trBookOnlySaved()) { _trStart(); return; }

    const savedUser = sessionStorage.getItem('currentUser');
    
    if (savedUser) {
        // 이미 로그인되어 있으면
        currentUser = JSON.parse(savedUser);
        console.log('📋 세션 복원:', currentUser.name);

        // ── 수정 2: book_only 사용자 페이지 접근 제어 ──
        if (currentUser.programType === 'book_only') {
            if (!isBookPage) {
                // book.html이 아닌 페이지 → book.html로 강제 이동
                console.log('🚫 [BookOnly] book.html 외 접근 차단 → 리다이렉트');
                window.location.href = 'book.html';
                return;
            }
            // book.html이면 Sentry 연동만 하고 뷰어 초기화에 맡김 (showScreen 호출 안 함)
            if (typeof Sentry !== 'undefined' && Sentry.setUser) {
                Sentry.setUser({ id: currentUser.id, email: currentUser.email, username: currentUser.name });
            }
            window.dispatchEvent(new Event('authReady'));
            return;
        }

        // Sentry 사용자 정보 복원
        if (typeof Sentry !== 'undefined' && Sentry.setUser) {
            Sentry.setUser({ id: currentUser.id, email: currentUser.email, username: currentUser.name });
        }
        // 시작일·정지 이력·첨삭 상태·마감 연장 최신값 동기화(DB 변경 반영). 2026-10-06: 동기화가 끝난 뒤에 인증률 확정을 돌린다
        // (옛 세션 정보로 정지 기간 과제를 확정하지 않도록). 2026-11-08: 일정 재료를 실제로 받아온 때만 확정한다
        // (받지 못했으면 화면은 세션 값으로 돌고, 확정은 다음 접속으로 미룬다).
        currentUser.scheduleSyncOk = false;
        var _restoreSync = (currentUser.applicationId && typeof refreshPauseState === 'function')
            ? refreshPauseState(currentUser).then(function (u) {
                console.log('📋 세션 동기화 완료:', u.startDate, '/ australia:', u.australiaStartDate,
                    '/ 정지 이력:', (u.challengePauses || []).length, (u.correctionPauses || []).length);
                // 정지·첨삭 상태가 바뀌었을 수 있으니 탭·일정 화면을 다시 그린다(index.html에서만 존재)
                if (typeof _initSegmentControl === 'function') { try { _initSegmentControl(); } catch (e) {} }
                if (typeof initScheduleScreen === 'function' && document.getElementById('scheduleScreen')) { try { initScheduleScreen(); } catch (e) {} }
            }).catch(function (e) { console.warn('⚠️ 세션 동기화 실패(기존 값 유지):', e); })
            : Promise.resolve();
        // 밀린 인증률 일괄 확정 (백그라운드 처리) — 동기화 뒤에
        _restoreSync.then(function () { if (currentUser.scheduleSyncOk) _fillMissingAuthRates(currentUser.id); });
        // book.html에서 일반 사용자 → authReady 발행 (뷰어 초기화용)
        if (isBookPage) {
            window.dispatchEvent(new Event('authReady'));
        }
        // book.html에서 일반 사용자는 showScreen이 없으므로 안전하게 처리
        if (typeof showScreen === 'function') {
            showScreen('scheduleScreen');
        }
    } else {
        // book.html인데 세션도 없고 토큰도 없으면 → 공홈으로
        if (isBookPage) {
            window.location.href = 'https://eonfl.com';
            return;
        }
        // 로그인 화면 표시
        if (typeof showScreen === 'function') {
            showScreen('loginScreen');
        }
    }
});

// 로그아웃 함수
function logout() {
    if (_trAuthOn()) { _trLogout(); return; }   // 새 로그인(스위치가 켜졌을 때만). 꺼짐이면 아래 그대로
    if (confirm('로그아웃 하시겠습니까?')) {
        currentUser = null;
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('courseMode');
        
        // Sentry 사용자 정보 초기화
        if (typeof Sentry !== 'undefined' && Sentry.setUser) {
            Sentry.setUser(null);
        }
        
        // 과제 상태 초기화
        if (typeof currentTest !== 'undefined') {
            currentTest.currentWeek = null;
            currentTest.currentDay = null;
        }
        // 연습코스 상태 초기화
        if (typeof currentPractice !== 'undefined') {
            currentPractice.practiceNumber = null;
        }
        if (typeof setCourseMode === 'function') {
            setCourseMode('regular');
        }
        
        // 첨삭(FEEDBACK) 상태 초기화
        if (typeof _stopCorrDeadlineTimer === 'function') _stopCorrDeadlineTimer();
        if (typeof _cleanupCorrectionWriting === 'function') _cleanupCorrectionWriting();
        if (typeof _cleanupCorrectionSpeaking === 'function') _cleanupCorrectionSpeaking();
        // 호주첨삭 화면 3종 — 정리하지 않으면 작성 타이머와 오디오가 로그인 화면에서도 계속 돈다
        if (typeof cleanupCorrectionIntWrt === 'function') cleanupCorrectionIntWrt();
        if (typeof cleanupCorrectionIndSpk === 'function') cleanupCorrectionIndSpk();
        if (typeof cleanupCorrectionIntSpk === 'function') cleanupCorrectionIntSpk();
        window._correctionSessionState = null;
        window.__isAdmin = false;
        
        // 2차 풀이 플로팅 UI 제거
        const retakeFloating = document.getElementById('retakeFloatingUI');
        if (retakeFloating) retakeFloating.remove();
        
        showScreen('loginScreen');
        
        // 폼 초기화
        const form = document.getElementById('loginForm');
        if (form) form.reset();
        hideLoginMessage();
    }
}

// 현재 사용자 정보 가져오기
function getCurrentUser() {
    return currentUser;
}

// 현재 사용자 ID 가져오기 (Supabase 연동용)
function getCurrentUserId() {
    return currentUser ? currentUser.id : null;
}

/**
 * v2 자기주도 확정 일정표(materialized schedule) 생성/갱신.
 * - 저장표가 없으면: 시작~종료일로 24세트를 만들어 저장.
 * - 종료일이 저장표의 종료일과 다르면: 과거(오늘 이전) 세트는 보존하고 나머지만 재분배해 저장.
 * - 그 외(이미 최신): 아무것도 안 함(멱등).
 * currentUser.selfPacedSchedule을 최신 객체로 갱신하고 applications 컬럼에 JSON 저장.
 * 저장 실패해도 로그인은 계속 — getSelfPacedSchedule이 실시간 계산으로 대체하므로 안전.
 */
async function _ensureSelfPacedSchedule(user, applicationId, timezone) {
    try {
        if (!user || typeof isSelfPacedV2 !== 'function' || !isSelfPacedV2(user)) return;
        if (typeof buildMaterializedSelfPacedSchedule !== 'function') return;

        // 현재 저장표 파싱 (문자열/객체 모두 허용)
        var stored = user.selfPacedSchedule;
        if (typeof stored === 'string') { try { stored = JSON.parse(stored); } catch (e) { stored = null; } }
        var hasValid = stored && Array.isArray(stored.dates) && stored.dates.length === 24;
        var upToDate = hasValid && stored.end === user.selfPacedEndDate;
        if (upToDate) return; // 이미 최신 → 그대로

        // 오늘 경계 (유효 오늘 00:00) — 과거/미래 구분 기준
        var boundary = (typeof getEffectiveToday === 'function') ? getEffectiveToday(timezone) : new Date();
        boundary.setHours(0, 0, 0, 0);

        var prevDates = hasValid ? stored.dates : null;
        var built = buildMaterializedSelfPacedSchedule(user, prevDates, boundary);
        if (!built) return;

        user.selfPacedSchedule = built; // 세션/화면에서 즉시 사용
        if (typeof supabaseUpdate === 'function' && applicationId) {
            await supabaseUpdate('applications', 'id=eq.' + applicationId, {
                self_paced_schedule: JSON.stringify(built)
            });
            console.log('🗓️ [자기주도] 확정 일정표 ' + (prevDates ? '갱신' : '생성') + ' 저장 완료 (종료일 ' + built.end + ')');
        }
    } catch (e) {
        console.warn('⚠️ [자기주도] 확정 일정표 저장 실패 (무시 — 실시간 계산으로 대체):', e);
    }
}

/**
 * 정규(fast/standard) 과제 행의 마감(다음날 04:00, 연장 반영) 계산.
 *   week/day + 학생 시작일(currentUser.startDate)로 배정 날짜를 구하고 getTaskDeadline 적용.
 *   계산 불가(시작일/요일 매핑 실패)면 null → 호출부에서 '동결 안 함'으로 안전 처리.
 */
function _rowTaskDeadlineNormal(row, tz) {
    try {
        var startStr = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.startDate : null;
        if (!startStr) return null;
        var w = parseInt(row.week, 10);
        var dayIdx = ['일', '월', '화', '수', '목', '금'].indexOf(row.day);
        if (isNaN(w) || dayIdx < 0) return null;
        // 과제 마감(다음날 04:00 + 연장) — 일정 계산 단일 출처(timezone-utils.js). 없으면(book.html 등) 동결 안 함.
        if (typeof getChallengeTaskDeadline !== 'function') return null;
        var exts = currentUser.deadlineExtensions || [];
        // 정지 이력 반영: 무기한 정지 구간 과제는 마감 null → 호출부가 '동결 안 함'(조기 동결 금지)
        return getChallengeTaskDeadline(startStr, w, dayIdx, exts, tz, currentUser.challengePauses || []);
    } catch (e) {
        return null;
    }
}

/**
 * 밀린 인증률(locked_auth_rate) 일괄 확정
 *
 * locked_auth_rate가 null인 행 = 마감이 지났는데 대시보드 미방문으로 기록 안 된 것
 * - initial_record 없음 → 0%
 * - initial_record 있음 + error_note_submitted false → 50%
 * - initial_record 있음 + error_note_submitted true → 100%
 * 
 * 로그인/세션복원 시 백그라운드로 실행 (화면 전환에 영향 없음)
 */
async function _fillMissingAuthRates(userId) {
    try {
        var isSp = (typeof currentUser !== 'undefined' && currentUser && currentUser.selfPaced);
        var isSpV2gate = isSp && (typeof isSelfPacedV2 === 'function') && isSelfPacedV2(currentUser);

        // 자기주도(구 무마감): 만료 전엔 자동 확정 생략(에러노트를 나중에 해도 100% 가능),
        // 만료 후에는 정규과정과 동일하게 일괄 확정.
        if (isSp && !isSpV2gate) {
            var spExpired = (typeof isSelfPacedExpired === 'function') && isSelfPacedExpired(currentUser);
            if (!spExpired) {
                console.log('🔒 [인증률] 자기주도(구, 기한 내) — 자동 확정 생략');
                return;
            }
            console.log('🔒 [인증률] 자기주도(구, 기한 만료) — 일괄 확정 진행');
        }

        // 마감 가드의 연장정보는 currentUser.deadlineExtensions(로그인·동기화에서 받은 값). 이 함수는 받아온 뒤에만 불린다.
        var selectCols = 'id,initial_record,error_note_submitted,week,day';

        var rows = await supabaseSelect(
            'study_results_v3',
            'user_id=eq.' + userId
            + '&locked_auth_rate=is.null'
            + '&completed_at=not.is.null'
            + ((typeof enrollmentQuery === 'function') ? enrollmentQuery(currentUser && currentUser.applicationId) : '')   // 재시작: 지금 수강의 기록만 확정
            + '&select=' + selectCols
        );

        if (!rows || rows.length === 0) return;

        console.log('🔒 [인증률] 미확정 ' + rows.length + '건 발견 → 확정 검토');

        var tz = (typeof getUserTimezone === 'function') ? getUserTimezone() : undefined;
        var now = new Date();
        var frozen = 0;

        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];

            // ★ 마감 가드(유형 무관): 그 행의 배정 날짜 마감이 실제로 지났을 때만 동결.
            //   아직 마감 전 행은 절대 건드리지 않음 → 조기 동결 방지(핵심 안전장치).
            //   (정규 과정에 이 가드가 빠져 있어, 마감 전 재로그인 시 50%로 조기 동결되던 버그 수정 2026-09-04)
            var rowDl = null;
            if (isSpV2gate) {
                // 자기주도 v2: 세트 마감(연장 반영) — timezone-utils 단일 진실원.
                rowDl = (typeof getSelfPacedSetDeadline === 'function')
                    ? getSelfPacedSetDeadline(currentUser, row.week, row.day, currentUser.deadlineExtensions || [], tz)
                    : null;
                if (!rowDl) continue; // 매핑 실패 → 건너뜀
            } else if (!isSp) {
                // 정규(fast/standard): week/day + 시작일 → 다음날 04:00(연장 반영).
                rowDl = _rowTaskDeadlineNormal(row, tz);
                if (!rowDl) continue; // 계산 불가 → 안전하게 동결 안 함(조기 동결 금지)
            }
            // (구 자기주도 만료분은 rowDl=null → 아래 통과, 전량 동결 = 기존 동작 유지)
            if (rowDl && now <= rowDl) continue; // 아직 마감 전 → 동결 안 함

            var hasInitial = row.initial_record != null;
            var rate = 0;
            if (hasInitial && row.error_note_submitted) {
                rate = 100;
            } else if (hasInitial) {
                rate = 50;
            }

            await supabaseUpdate('study_results_v3', 'id=eq.' + row.id, {
                locked_auth_rate: rate
            });
            frozen++;
        }

        console.log('🔒 [인증률] 확정 완료 (' + frozen + '/' + rows.length + '건)');
    } catch (e) {
        console.warn('⚠️ [인증률] 일괄 확정 실패 (무시):', e);
    }
}

console.log('✅ auth.js v2 (Supabase) 로드 완료');

// =====================================================================
// 새 로그인(인증 모듈 js/auth-session.js) — 스위치가 켜졌을 때만 타는 길 (보안작업 묶음2 계약 3B)
//   꺼짐이면 위의 코드가 그대로 돈다. 아래의 함수는 켜졌을 때만 불린다(_trAuthOn 만 예외 — 스위치를 가른다).
//   책 화면(book.html·commentary.html)·답안 카드 창은 이 길을 타지 않는다(인증 모듈을 싣지 않는다).
//   흐름: 인증 모듈 로그인 → signed_in(같은 로그인 기록의 my_profile ok + my_site_access.allowed 참)
//         → 수강 조회(기존 선택 규칙 그대로, 실패와 "없음"을 구분) → currentUser → 일정 화면.
//   로그인에 딸린 쓰기 셋(자기주도 일정표·tr_user_map·밀린 인증률 확정)은 "저장 계획"까지만 계산하고 보내지 않는다(저장의 연결은 3D).
// =====================================================================
var _trV2 = {
    seq: 0,              // 시도 차례(늦게 온 응답·타이머는 차례가 그대로일 때만 반영한다)
    ready: false,        // 준비 신호: 로그인 확인 + 수강 조회가 끝나 이 탭의 표시가 준비됐는가
    result: null,        // 마지막 결과 이름(ready / no_application / not_confirmed / check_failed / …)
    attempt: null,       // 준비된 표시가 묶인 로그인 기록 번호
    plan: null,          // 저장 계획(보내지 않는다)
    entering: null,      // 지금 수강 조회 중인 로그인 기록 번호
    loginInFlight: false,
    bound: false
};

function _trIsBookPage() {
    var p = window.location.pathname;
    return p.includes('book.html') || p.includes('commentary.html');
}

// 새 로그인 스위치가 켜진 화면인가(인증 모듈이 실려 있고 켜짐이라고 답할 때만. 책 화면 제외)
function _trAuthOn() {
    try {
        return !!window.EonAuth && typeof window.EonAuth.isOn === 'function' && window.EonAuth.isOn() === true && !_trIsBookPage();
    } catch (e) { return false; }
}

// 이 탭에 저장된 값이 책 전용 상태인가(그 길은 켜짐에서도 기준 그대로 돈다)
function _trBookOnlySaved() {
    try {
        var u = JSON.parse(sessionStorage.getItem('currentUser'));
        return !!u && u.programType === 'book_only';
    } catch (e) { return false; }
}

// (책 화면) 이 탭에 새 로그인이 만든 일반 로그인 상태가 이미 있는가 — 있으면 책 연결로 덮지 않고 기존 값을 보존한다.
// 표식(tr_auth_v1:user)은 새 로그인만 만든다 — 스위치가 꺼진 곳에서는 언제나 거짓이다.
function _trBookConflict() {
    try {
        var mark = JSON.parse(sessionStorage.getItem('tr_auth_v1:user'));
        var u = JSON.parse(sessionStorage.getItem('currentUser'));
        if (!mark || !u || mark.v !== 1 || u.id !== mark.id || u.programType === 'book_only') return false;
    } catch (e) { return false; }
    try { alert('이 탭에는 이미 테스트룸 로그인 상태가 있어 책 연결 주소를 적용하지 않았습니다. 책 연결은 새 탭에서 열어 주세요.'); } catch (e) {}
    return true;
}

// 읽기 하나: 그 요청의 결과로 실패를 가린다(전역 _sgLastError 에 기대지 않는다). 유효한 0건은 { ok: true, rows: [] }
async function _trReadRows(endpoint) {
    var r = await supabaseRequest(endpoint);
    return Array.isArray(r) ? { ok: true, rows: r } : { ok: false };
}

/**
 * 수강 조회(새 길용). 선택 규칙과 결과 객체는 getStudentProgram(js/supabase-client.js)과 같다:
 *   입금 확인된 것 중 최신 1건 → 없으면 최신 1건으로 "신청 없음 / 입금 미확인".
 * 다른 것은 하나: 조회 실패를 "없음"·"정지 없음"·"연장 없음"으로 삼지 않는다 → { error: 'check_failed' }.
 *   (첫 조회가 실패했으면 "0건"으로 보고 두 번째 조회로 넘어가지 않는다.)
 */
async function _trGetStudentProgram(userEmail) {
    const _appCols = 'id,preferred_program,assigned_program,preferred_start_date,schedule_start,australia_schedule_start,current_step,status,deposit_confirmed_by_admin,practice_enabled,correction_enabled,correction_start_date,enrollment_no,shipping_completed_at,shipping_waived,restart_materials';
    const failed = { error: 'check_failed' };

    const confirmed = await _trReadRows(`/rest/v1/applications?email=eq.${encodeURIComponent(userEmail)}&deposit_confirmed_by_admin=eq.true&order=created_at.desc&limit=1&select=${_appCols}`);
    if (!confirmed.ok) return failed;
    let apps = confirmed.rows;
    if (apps.length === 0) {
        const latest = await _trReadRows(`/rest/v1/applications?email=eq.${encodeURIComponent(userEmail)}&order=created_at.desc&limit=1&select=${_appCols}`);
        if (!latest.ok) return failed;
        apps = latest.rows;
    }
    if (apps.length === 0) return { error: 'no_application' };

    const app = apps[0];
    if (!app.deposit_confirmed_by_admin) return { error: 'not_confirmed' };

    let selfPaced = false, selfPacedWeeks = null, selfPacedEndDate = null, selfPacedSchedule = null;
    const sp = await _trReadRows(`/rest/v1/applications?id=eq.${app.id}&select=self_paced,self_paced_weeks`);
    if (!sp.ok) return failed;
    if (sp.rows[0]) {
        selfPaced = !!sp.rows[0].self_paced;
        selfPacedWeeks = sp.rows[0].self_paced_weeks || null;
    }
    if (selfPaced) {
        const end = await _trReadRows(`/rest/v1/applications?id=eq.${app.id}&select=self_paced_end_date`);
        if (!end.ok) return failed;
        if (end.rows[0]) selfPacedEndDate = end.rows[0].self_paced_end_date || null;
        const sch = await _trReadRows(`/rest/v1/applications?id=eq.${app.id}&select=self_paced_schedule`);
        if (!sch.ok) return failed;
        if (sch.rows[0]) selfPacedSchedule = sch.rows[0].self_paced_schedule || null;
    }

    let challengePauses = [], correctionPauses = [];
    const pz = await _trReadRows(`/rest/v1/applications?id=eq.${app.id}&select=challenge_pauses,correction_pauses`);
    if (!pz.ok) return failed;
    if (pz.rows[0]) {
        challengePauses = _pauseEntriesOf(pz.rows[0].challenge_pauses);
        correctionPauses = _pauseEntriesOf(pz.rows[0].correction_pauses);
    }

    const deadlineExtensions = await _fetchDeadlineExtensions(app.id);
    if (deadlineExtensions === null) return failed;

    let serviceStops = [], appStatus = null, refundAt = null;
    const stp = await _trReadRows(`/rest/v1/applications?id=eq.${app.id}&select=service_stops,app_status,refund_at`);
    if (!stp.ok) return failed;
    if (stp.rows[0]) {
        serviceStops = _stopEntriesOf(stp.rows[0].service_stops);
        appStatus = stp.rows[0].app_status || null;
        refundAt = stp.rows[0].refund_at || null;
    }

    return {
        program: app.assigned_program || app.preferred_program || '내벨업챌린지 - Standard',
        startDate: app.schedule_start || app.preferred_start_date,
        australiaStartDate: app.australia_schedule_start || null,
        applicationId: app.id,
        enrollmentNo: app.enrollment_no || 1,
        currentStep: app.current_step,
        status: app.status,
        practiceEnabled: !!app.practice_enabled,
        correctionEnabled: !!app.correction_enabled,
        correctionStartDate: app.correction_start_date || null,
        selfPaced: selfPaced,
        selfPacedWeeks: selfPacedWeeks,
        selfPacedEndDate: selfPacedEndDate,
        selfPacedSchedule: selfPacedSchedule,
        challengePauses: challengePauses,
        correctionPauses: correctionPauses,
        deadlineExtensions: deadlineExtensions,
        serviceStops: serviceStops,
        appStatus: appStatus,
        refundAt: refundAt,
        shippingCompletedAt: app.shipping_completed_at || null,
        shippingWaived: !!app.shipping_waived,
        restartMaterials: Array.isArray(app.restart_materials) ? app.restart_materials : [],
        shipInfoLoaded: true
    };
}

// currentUser 구성(위 handleLogin 의 "3. 세션에 저장할 사용자 정보 구성"과 같은 키·값). user = my_profile 의 본인 정보
function _trComposeUser(user, programInfo) {
    const programType = programInfo.program.includes('Fast') ? 'fast' : 'standard';
    const userTimezone = user.timezone || 'Asia/Seoul';
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        program: programInfo.program,
        programType: programType,
        applicationId: programInfo.applicationId,
        enrollmentNo: programInfo.enrollmentNo || 1,
        shippingCompletedAt: programInfo.shippingCompletedAt || null,
        shippingWaived: !!programInfo.shippingWaived,
        restartMaterials: programInfo.restartMaterials || [],
        shipInfoLoaded: !!programInfo.shipInfoLoaded,
        startDate: programInfo.startDate,
        australiaStartDate: programInfo.australiaStartDate || null,
        practiceEnabled: !!programInfo.practiceEnabled,
        correctionEnabled: isCorrectionActiveNow(programInfo, userTimezone),
        selfPaced: !!programInfo.selfPaced,
        selfPacedWeeks: programInfo.selfPacedWeeks || null,
        selfPacedEndDate: programInfo.selfPacedEndDate || null,
        selfPacedSchedule: programInfo.selfPacedSchedule || null,
        challengePauses: programInfo.challengePauses || [],
        correctionPauses: programInfo.correctionPauses || [],
        serviceStops: programInfo.serviceStops || [],
        appStatus: programInfo.appStatus || null,
        refundAt: programInfo.refundAt || null,
        correctionStartDate: programInfo.correctionStartDate || null,
        deadlineExtensions: programInfo.deadlineExtensions || [],
        scheduleSyncOk: programInfo.deadlineExtensions !== null,
        timezone: userTimezone
    };
}

// 자기주도 확정 일정표: _ensureSelfPacedSchedule 과 같은 계산. 저장하지 않고 "저장할 것"만 돌려준다(없으면 null).
// 화면 표시에 필요한 계산 결과(user.selfPacedSchedule)는 지금처럼 메모리에 반영한다.
function _trPlanSelfPacedSchedule(user, applicationId, timezone) {
    try {
        if (!user || typeof isSelfPacedV2 !== 'function' || !isSelfPacedV2(user)) return null;
        if (typeof buildMaterializedSelfPacedSchedule !== 'function') return null;

        var stored = user.selfPacedSchedule;
        if (typeof stored === 'string') { try { stored = JSON.parse(stored); } catch (e) { stored = null; } }
        var hasValid = stored && Array.isArray(stored.dates) && stored.dates.length === 24;
        var upToDate = hasValid && stored.end === user.selfPacedEndDate;
        if (upToDate) return null;

        var boundary = (typeof getEffectiveToday === 'function') ? getEffectiveToday(timezone) : new Date();
        boundary.setHours(0, 0, 0, 0);

        var prevDates = hasValid ? stored.dates : null;
        var built = buildMaterializedSelfPacedSchedule(user, prevDates, boundary);
        if (!built) return null;

        user.selfPacedSchedule = built;
        if (!applicationId) return null;
        return { table: 'applications', method: 'PATCH', match: 'id=eq.' + applicationId, values: { self_paced_schedule: JSON.stringify(built) } };
    } catch (e) {
        console.warn('⚠️ [자기주도] 확정 일정표 계산 실패 (무시 — 실시간 계산으로 대체):', e);
        return null;
    }
}

// 밀린 인증률 확정: _fillMissingAuthRates 와 같은 계산. 미확정 행을 읽기만 하고(지금 자격 그대로), 확정 값은 저장 계획에만 담는다.
// 돌려주는 값: { ok: true, items: [...] } / { ok: false }(읽지 못함 — "밀린 것 없음"으로 삼지 않는다)
async function _trPlanAuthRates(userId) {
    var items = [];
    try {
        var isSp = (typeof currentUser !== 'undefined' && currentUser && currentUser.selfPaced);
        var isSpV2gate = isSp && (typeof isSelfPacedV2 === 'function') && isSelfPacedV2(currentUser);

        if (isSp && !isSpV2gate) {
            var spExpired = (typeof isSelfPacedExpired === 'function') && isSelfPacedExpired(currentUser);
            if (!spExpired) return { ok: true, items: items };
        }

        var selectCols = 'id,initial_record,error_note_submitted,week,day';

        var read = await _trReadRows(
            '/rest/v1/study_results_v3?'
            + 'user_id=eq.' + userId
            + '&locked_auth_rate=is.null'
            + '&completed_at=not.is.null'
            + ((typeof enrollmentQuery === 'function') ? enrollmentQuery(currentUser && currentUser.applicationId) : '')
            + '&select=' + selectCols
        );
        if (!read.ok) return { ok: false };
        var rows = read.rows;
        if (rows.length === 0) return { ok: true, items: items };

        var tz = (typeof getUserTimezone === 'function') ? getUserTimezone() : undefined;
        var now = new Date();

        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var rowDl = null;
            if (isSpV2gate) {
                rowDl = (typeof getSelfPacedSetDeadline === 'function')
                    ? getSelfPacedSetDeadline(currentUser, row.week, row.day, currentUser.deadlineExtensions || [], tz)
                    : null;
                if (!rowDl) continue;
            } else if (!isSp) {
                rowDl = _rowTaskDeadlineNormal(row, tz);
                if (!rowDl) continue;
            }
            if (rowDl && now <= rowDl) continue;

            var hasInitial = row.initial_record != null;
            var rate = 0;
            if (hasInitial && row.error_note_submitted) {
                rate = 100;
            } else if (hasInitial) {
                rate = 50;
            }
            items.push({ table: 'study_results_v3', method: 'PATCH', match: 'id=eq.' + row.id, values: { locked_auth_rate: rate } });
        }
        return { ok: true, items: items };
    } catch (e) {
        console.warn('⚠️ [인증률] 확정 계산 실패 (무시):', e);
        return { ok: false };
    }
}

// 그 시도(차례·로그인 기록)의 결과를 지금도 반영해도 되는가
function _trStill(seq, attempt) {
    try { return seq === _trV2.seq && window.EonAuth.isCurrent(attempt) === true; } catch (e) { return false; }
}

// 확인된 로그인(attempt)으로 수강을 조회해 이 탭의 표시를 준비한다. 돌려주는 값: 결과 이름('stale' = 반영하지 않음)
async function _trEnter(attempt) {
    var seq = ++_trV2.seq;
    _trV2.ready = false;
    _trV2.result = null;
    _trV2.attempt = null;
    _trV2.plan = null;
    _trV2.entering = attempt;
    try {
        var profile = window.EonAuth.profile();
        if (!profile || !_trStill(seq, attempt)) return 'stale';

        var programInfo = await _trGetStudentProgram(profile.email);
        if (!_trStill(seq, attempt)) return 'stale';
        if (programInfo.error) { _trV2.result = programInfo.error; return programInfo.error; }

        var user = _trComposeUser(profile, programInfo);
        var plan = { attempt: attempt, memberId: user.id, applicationId: programInfo.applicationId, items: [], authRates: 'pending' };

        // 자기주도 일정표: 계산해 메모리에 반영하고, 저장은 계획에만
        var schedItem = _trPlanSelfPacedSchedule(user, programInfo.applicationId, user.timezone);
        if (schedItem) plan.items.push(schedItem);

        // 이 탭에 둔다 — 인증 모듈이 "그 로그인이 지금도 확인된 로그인이고, 덮어써도 되는 자리"일 때만 쓴다
        var put = window.EonAuth.putUser(attempt, JSON.stringify(user));
        if (!put.ok) { _trV2.result = put.why; return put.why; }
        currentUser = user;

        // tr_user_map: 저장은 계획에만
        plan.items.push({
            table: 'tr_user_map', method: 'POST', onConflict: 'user_id',
            values: { user_id: user.id, email: user.email, name: user.name, updated_at: new Date().toISOString() }
        });

        _trV2.plan = plan;
        _trV2.attempt = attempt;
        _trV2.result = 'ready';
        _trV2.ready = true;

        if (typeof Sentry !== 'undefined' && Sentry.setUser) {
            Sentry.setUser({ id: user.id, email: user.email, username: user.name });
        }

        // 밀린 인증률 확정: 일정 재료를 모두 받아온 뒤에만(새 길은 받지 못하면 여기까지 오지 않는다). 계산만 — 저장은 계획에
        _trPlanAuthRates(user.id).then(function (r) {
            if (!_trStill(seq, attempt) || _trV2.plan !== plan || !currentUser || currentUser.applicationId !== plan.applicationId) return;
            if (!r.ok) { plan.authRates = 'failed'; return; }
            for (var i = 0; i < r.items.length; i++) plan.items.push(r.items[i]);
            plan.authRates = 'done';
        });
        return 'ready';
    } finally {
        if (_trV2.entering === attempt) _trV2.entering = null;
    }
}

// 화면 상태 정리(위 logout 의 정리와 같은 차례). 이 탭의 값만 다룬다 — 다른 탭의 책 상태·보관된 답안은 건드리지 않는다.
// (currentUser 저장값은 인증 모듈이 "새 로그인이 만든 값"일 때만 지운다 — 여기서는 지우지 않는다.)
function _trClearScreenState() {
    _trV2.seq++;
    _trV2.ready = false;
    _trV2.attempt = null;
    _trV2.plan = null;
    currentUser = null;
    sessionStorage.removeItem('courseMode');

    // Sentry 사용자 정보 초기화
    if (typeof Sentry !== 'undefined' && Sentry.setUser) {
        Sentry.setUser(null);
    }

    // 과제 상태 초기화
    if (typeof currentTest !== 'undefined') {
        currentTest.currentWeek = null;
        currentTest.currentDay = null;
    }
    // 연습코스 상태 초기화
    if (typeof currentPractice !== 'undefined') {
        currentPractice.practiceNumber = null;
    }
    if (typeof setCourseMode === 'function') {
        setCourseMode('regular');
    }

    // 첨삭(FEEDBACK) 상태 초기화
    if (typeof _stopCorrDeadlineTimer === 'function') _stopCorrDeadlineTimer();
    if (typeof _cleanupCorrectionWriting === 'function') _cleanupCorrectionWriting();
    if (typeof _cleanupCorrectionSpeaking === 'function') _cleanupCorrectionSpeaking();
    // 호주첨삭 화면 3종 — 정리하지 않으면 작성 타이머와 오디오가 로그인 화면에서도 계속 돈다
    if (typeof cleanupCorrectionIntWrt === 'function') cleanupCorrectionIntWrt();
    if (typeof cleanupCorrectionIndSpk === 'function') cleanupCorrectionIndSpk();
    if (typeof cleanupCorrectionIntSpk === 'function') cleanupCorrectionIntSpk();
    window._correctionSessionState = null;
    window.__isAdmin = false;

    // 2차 풀이 플로팅 UI 제거
    const retakeFloating = document.getElementById('retakeFloatingUI');
    if (retakeFloating) retakeFloating.remove();

    if (typeof showScreen === 'function') showScreen('loginScreen');
}

var _TR_MSG = {
    invalid: '이메일 또는 비밀번호가 올바르지 않습니다.',
    blocked: '차단된 계정입니다. 관리자에게 문의하세요.',
    withdrawal_pending: '탈퇴 처리 중인 계정입니다.',
    maintenance: '지금은 점검 중입니다. 잠시 뒤 다시 시도해주세요.',
    rate_limited: '요청이 많습니다. 잠시 뒤 다시 시도해주세요.',
    no_application: '수강 신청 내역이 없습니다. 공식 홈페이지에서 먼저 수강 신청을 해주세요.',
    not_confirmed: '수강 등록이 아직 확인되지 않았습니다. 관리자에게 문의해주세요.',
    check_failed: '수강 정보를 확인하지 못했습니다. 잠시 뒤 다시 시도해주세요.',
    legacy_present: '이 탭에 다른 방식의 로그인 상태가 남아 있습니다. 이 탭을 닫고 새 탭에서 다시 로그인해 주세요.',
    previous_unknown: '이전 로그인을 끝내지 못했습니다. 잠시 뒤 다시 시도해주세요.',
    session_changed: '로그인 상태가 바뀌었습니다. 다시 로그인해 주세요.',
    ended: '로그인이 끝났습니다. 다시 로그인해 주세요.',
    unknown_state: '로그인 상태를 확인하지 못했습니다. 잠시 뒤 새로 고침해 주세요.',
    logout_unknown: '로그아웃을 확인하지 못했습니다. 잠시 뒤 다시 시도해주세요.',
    foreign_window: '이 창에서는 다른 창의 로그인 상태를 쓰지 않습니다. 새로 고침한 뒤 다시 로그인해 주세요.',
    unavailable: '로그인 기능을 불러오지 못했습니다. 새로 고침해 주세요.',
    error: '로그인 중 오류가 발생했습니다. 다시 시도해주세요.'
};

// 결과 이름 → 안내 문구
function _trMessageFor(name) {
    if (name === 'invalid_credentials' || name === 'no_member') return _TR_MSG.invalid;
    if (name === 'expired') return _TR_MSG.ended;
    if (name === 'network' || name === 'unreadable') return _TR_MSG.unknown_state;
    if (name === 'off') return _TR_MSG.foreign_window;
    return Object.prototype.hasOwnProperty.call(_TR_MSG, name) ? _TR_MSG[name] : _TR_MSG.error;
}

// 로그인 흐름 밖에서(새로 고침·뒤로 가기·갱신 뒤) 인증 모듈의 상태가 정해졌을 때의 안내
function _trNoticeForState(state, reason) {
    if (state === 'signed_out' && !reason) return;                  // 로그인 전: 지금처럼 로그인 화면만
    if (state === 'signed_out') { showLoginError(_trMessageFor(reason)); return; }
    if (state === 'off') { showLoginError(_trMessageFor(reason === 'foreign_window' ? 'foreign_window' : 'error')); return; }
    if (state === 'rejected') showLoginError(_trMessageFor(reason || 'error'));
}

// 수강 조회의 결과를 화면에 반영한다
function _trApplyEnterResult(result, origin, seq, attempt) {
    if (result === 'stale') return;
    if (result === 'ready') {
        if (origin === 'login') {
            const programLabel = currentUser.programType === 'fast' ? '4주 Fast' : '8주 Standard';
            showLoginSuccess(`환영합니다, ${currentUser.name}님! (${programLabel})`);
            setTimeout(() => {
                if (_trV2.ready && _trStill(seq, attempt)) showScreen('scheduleScreen');
            }, 1200);
        } else if (typeof showScreen === 'function') {
            showScreen('scheduleScreen');
        }
        return;
    }
    // 신청 없음 / 입금 미확인 / 확인 실패(다시 시도) / 그 밖: currentUser 를 만들지 않고 화면을 열지 않는다
    if (typeof showScreen === 'function' && origin !== 'login') showScreen('loginScreen');
    showLoginError(_trMessageFor(result));
    resetLoginBtn();
}

// 새로 고침·뒤로 가기·다시 확인 뒤: 확인된 로그인으로 수강을 다시 조회해 화면을 연다
async function _trRestore() {
    var attempt = null;
    try { attempt = window.EonAuth.attempt(); } catch (e) { attempt = null; }
    if (!attempt || _trV2.entering === attempt) return;
    if (window.EonAuth.reason() === 'legacy_present') { showLoginError(_TR_MSG.legacy_present); return; }
    var result;
    try { result = await _trEnter(attempt); } catch (e) { console.error('수강 확인 오류:', e); result = 'check_failed'; }
    _trApplyEnterResult(result, 'restore', _trV2.seq, attempt);
}

// 인증 모듈의 상태가 바뀔 때마다: 확인된 로그인이 아니게 되면 이 탭의 표시를 거둔다
function _trOnAuthState() {
    var state = window.EonAuth.state();
    if (state === 'signed_in') {
        if (!_trV2.loginInFlight && !_trV2.ready) _trRestore();
        return;
    }
    if (_trV2.ready || currentUser) _trClearScreenState();
    else _trV2.seq++;
    if (_trV2.loginInFlight) return;                      // 로그인 버튼의 흐름이 스스로 안내한다
    if (state === 'restoring') return;
    resetLoginBtn();
    _trNoticeForState(state, window.EonAuth.reason());
}

function _trBind() {
    if (_trV2.bound) return;
    _trV2.bound = true;
    window.EonAuth.onChange(function () { _trOnAuthState(); });
    // 뒤로 가기로 보관된 화면이 되살아나면: 다시 확인하기 전에 이 탭의 표시부터 거둔다
    window.addEventListener('pageshow', function (ev) {
        if (ev && ev.persisted && (_trV2.ready || currentUser)) _trClearScreenState();
    });
}

// 화면이 열릴 때(DOMContentLoaded): 저장된 currentUser 만 보고 화면을 열지 않는다. 인증 모듈이 다시 확인한 뒤에만.
async function _trStart() {
    _trBind();
    if (typeof showScreen === 'function') showScreen('loginScreen');
    var state;
    try { state = await window.EonAuth.ready(); } catch (e) { state = 'signed_out'; }
    if (state === 'signed_in') { if (!_trV2.ready) await _trRestore(); return; }
    _trNoticeForState(state, window.EonAuth.reason());
}

// 로그인 버튼(켜짐): 빈 값 로그인·999999·회원 표 조회·비밀번호 열 조회를 타지 않는다
async function _trHandleLogin(event) {
    event.preventDefault();
    _trBind();

    const emailInput = document.getElementById('studentEmail');
    const passwordInput = document.getElementById('studentPassword');
    const loginBtn = document.getElementById('loginBtn');

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email) {
        showLoginError('이메일을 입력해주세요.');
        return;
    }
    if (!password) {
        showLoginError('비밀번호를 입력해주세요.');
        return;
    }
    if (_trV2.loginInFlight) return;

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 로그인 중...';
    hideLoginMessage();

    _trV2.loginInFlight = true;
    try {
        const r = await window.EonAuth.signIn(email, password);
        if (r.outcome !== 'signed_in') {
            showLoginError(_trMessageFor(r.outcome));
            resetLoginBtn();
            return;
        }
        const result = await _trEnter(r.attempt);
        _trApplyEnterResult(result === 'stale' ? 'session_changed' : result, 'login', _trV2.seq, r.attempt);
    } catch (error) {
        console.error('로그인 에러:', error);
        showLoginError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
        resetLoginBtn();
    } finally {
        _trV2.loginInFlight = false;
    }
}

// 로그아웃(켜짐): 인증 모듈의 로그아웃(이 로그인만) + 지금 하는 화면 상태 정리. 서버가 끝났다고 답했을 때만 끝낸 것으로 본다
async function _trLogout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    var r;
    try { r = await window.EonAuth.signOut(); } catch (e) { r = { outcome: 'error' }; }
    if (currentUser || _trV2.ready) _trClearScreenState();

    // 폼 초기화
    const form = document.getElementById('loginForm');
    if (form) form.reset();
    if (r && r.outcome === 'signed_out') { hideLoginMessage(); return; }
    // 실패·모름: 끝냈다고 하지 않는다(다시 보내지도 않는다). 표시는 이미 거뒀다
    showLoginError(_trMessageFor(r && r.outcome === 'changed' ? 'session_changed' : 'logout_unknown'));
}

// 시험이 읽는 값(화면에 보이지 않는다): 준비 신호와 저장 계획. 켜졌을 때만 둔다
if (_trAuthOn()) {
    window.trLoginV2 = {
        ready: function () { return _trV2.ready === true; },
        result: function () { return _trV2.result; },
        plan: function () { return _trV2.plan ? JSON.parse(JSON.stringify(_trV2.plan)) : null; }
    };
}
