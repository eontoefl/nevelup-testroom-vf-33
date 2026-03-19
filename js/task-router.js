/**
 * 입문서 정독 PDF 모달 관련 함수
 */

// ── 데드라인 연장 캐시 (페이지 로드 시 Supabase에서 가져옴) ──
window._deadlineExtensions = [];

/**
 * 데드라인 연장 데이터 로드 (페이지 로드 시 1회 호출)
 * tr_deadline_extensions 테이블에서 현재 사용자의 연장 기록을 캐시
 */
async function loadDeadlineExtensions() {
    try {
        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (!user || !user.id) {
            console.log('📅 [연장] 사용자 정보 없음 — 로드 생략');
            return;
        }
        if (typeof supabaseSelect !== 'function') {
            console.log('📅 [연장] supabaseSelect 없음 — 로드 생략');
            return;
        }
        var rows = await supabaseSelect(
            'tr_deadline_extensions',
            'user_id=eq.' + user.id + '&select=original_date,extra_days'
        );
        window._deadlineExtensions = rows || [];
        console.log('📅 [연장] 로드 완료:', window._deadlineExtensions.length + '건');
    } catch (e) {
        console.warn('📅 [연장] 로드 실패:', e);
        window._deadlineExtensions = [];
    }
}

/**
 * 4시 마감 체크 (데드라인 방식)
 * N일 과제 → N+1일 04:00 KST 마감
 * 미리 하는 건 OK, 지난 과제만 차단
 * ★ tr_deadline_extensions에 연장 기록이 있으면 extra_days만큼 마감 연장
 * 
 * @returns {boolean} true면 마감 지남 (과제 시작 불가)
 */
function isTaskDeadlinePassed() {
    var ct = (typeof currentTest !== 'undefined') ? currentTest : window.currentTest;
    if (!ct || !ct.currentWeek || !ct.currentDay) {
        console.log('⏰ [마감] 스케줄 정보 없음 — 체크 생략');
        return false;
    }

    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user || !user.startDate) {
        console.log('⏰ [마감] startDate 없음 — 체크 생략');
        return false;
    }

    var dayMap = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
    var dayOffset = dayMap[ct.currentDay];
    if (dayOffset === undefined) {
        console.log('⏰ [마감] 요일 매핑 실패:', ct.currentDay);
        return false;
    }

    var startDate = new Date(user.startDate + 'T00:00:00');
    if (isNaN(startDate.getTime())) {
        console.log('⏰ [마감] 날짜 파싱 실패:', user.startDate);
        return false;
    }

    var taskDate = new Date(startDate);
    taskDate.setDate(taskDate.getDate() + (ct.currentWeek - 1) * 7 + dayOffset);

    var deadline = new Date(taskDate);
    deadline.setDate(deadline.getDate() + 1);
    deadline.setHours(4, 0, 0, 0);

    // ★ tr_deadline_extensions 연장 체크
    var taskDateStr = taskDate.getFullYear() + '-' +
        String(taskDate.getMonth() + 1).padStart(2, '0') + '-' +
        String(taskDate.getDate()).padStart(2, '0');
    var extensions = window._deadlineExtensions || [];
    var ext = extensions.find(function(e) { return e.original_date === taskDateStr; });
    if (ext) {
        var extraDays = ext.extra_days || 1;
        deadline.setDate(deadline.getDate() + extraDays);
        console.log('📅 [연장] ' + taskDateStr + ' → +' + extraDays + '일 → 새 마감:', deadline.toLocaleString());
    }

    var now = new Date();
    var passed = now > deadline;
    
    console.log('⏰ [마감]', 
        'start:', user.startDate,
        'week:', ct.currentWeek, 'day:', ct.currentDay,
        '→ taskDate:', taskDate.toLocaleDateString(),
        '→ deadline:', deadline.toLocaleString(),
        '→ now:', now.toLocaleString(),
        '→ 결과:', passed ? '마감지남' : 'OK');
    
    return passed;
}

// ================================================================
// 입문서 정독 — 안내 팝업 + book.html 이동
// ================================================================

/**
 * 입문서 정독 안내 팝업 (동적 DOM 생성)
 * - 미인증: 오늘 필요한 메모 수 안내 + "시작하기" 버튼
 * - 인증 완료: 이미 인증됨 안내 + "계속 읽기" 버튼
 * - 마감 지남: 경고 표시 + book.html에 deadline=passed 전달
 *
 * @param {object} params - parseTaskName() 반환값의 params
 *   params.current {number} 현재 일차 (예: 2)
 *   params.total   {number} 전체 일수 (예: 3)
 */
async function openIntroBookGuide(params) {
    var current = params.current;
    var total   = params.total;

    // ── 스케줄 정보 ──
    var ct   = window.currentTest;
    var week = (ct && ct.currentWeek) ? ct.currentWeek : 1;
    var day  = (ct && ct.currentDay)  ? ct.currentDay  : '월';

    // ── 메모 기준 계산 ──
    var requiredMemos = current * 2;

    // ── 마감 체크 ──
    var deadlinePassed = isTaskDeadlinePassed();
    if (deadlinePassed) {
        window._deadlinePassedMode = true;
    } else {
        window._deadlinePassedMode = false;
    }

    // ── 인증 여부 + 누적 메모 수 확인 (DB 조회) ──
    var alreadyCertified = false;
    var currentMemoCount = 0;
    try {
        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (user && user.id && user.id !== 'dev-user-001') {
            // 인증 여부
            var result = await getStudyResultV3(user.id, 'intro-book', current, week, day);
            if (result && result.locked_auth_rate === 100) {
                alreadyCertified = true;
            }
            // 누적 메모 수 조회
            if (typeof supabaseSelect === 'function') {
                var bookRows = await supabaseSelect('tr_book_documents', 'is_active=eq.true&order=sort_order.asc&limit=1');
                if (bookRows && bookRows.length > 0) {
                    var memoRows = await supabaseSelect(
                        'tr_book_memos',
                        'user_id=eq.' + user.id + '&book_id=eq.' + bookRows[0].id + '&select=id'
                    );
                    currentMemoCount = (memoRows && memoRows.length) ? memoRows.length : 0;
                }
            }
            console.log('📖 [IntroBook] 누적 메모:', currentMemoCount, '/ 오늘 기준:', requiredMemos);
        }
    } catch (e) {
        console.warn('📖 [IntroBook] 인증/메모 조회 실패:', e);
    }

    // ── 남은 메모 수 계산 ──
    var remainingMemos = Math.max(0, requiredMemos - currentMemoCount);

    // ── 팝업 본문 결정 ──
    var bodyHtml = '';
    var btnLabel = '시작하기';

    if (alreadyCertified) {
        bodyHtml =
            '<p style="font-size:15px;color:#16a34a;font-weight:600;margin:0 0 8px;">'
            + '✅ 오늘 과제는 이미 인증되었습니다.</p>'
            + '<p style="font-size:14px;color:#666;margin:0;">계속 읽으시겠습니까?</p>';
        btnLabel = '계속 읽기';
    } else {
        bodyHtml =
            '<p style="font-size:14px;color:#333;line-height:1.7;margin:0 0 10px;">'
            + '오늘 과제 인증을 위해 <strong>메모 ' + remainingMemos + '개</strong>를 작성해주세요.</p>'
            + (currentMemoCount > 0
                ? '<p style="font-size:12px;color:#9ca3ab;margin:0 0 10px;">이미 ' + currentMemoCount + '개 작성됨 · 오늘 목표 ' + requiredMemos + '개</p>'
                : '')
            + '<p style="font-size:13px;color:#888;line-height:1.6;margin:0;">'
            + '입문서는 ' + total + '일에 걸쳐 완독하는 과제입니다.<br>'
            + '메모만 남기고 끝이 아니니, 틈틈이 꼼꼼히 읽어주세요!</p>';

        if (deadlinePassed) {
            bodyHtml +=
                '<p style="font-size:13px;color:#ef4444;margin:12px 0 0;font-weight:600;">'
                + '⚠️ 마감 시간이 지났습니다. 메모는 작성 가능하지만 인증에는 반영되지 않습니다.</p>';
        }
    }

    // ── 기존 팝업 제거 ──
    var existingOverlay = document.getElementById('introBookGuideOverlay');
    if (existingOverlay) existingOverlay.remove();
    var existingPopup = document.getElementById('introBookGuidePopup');
    if (existingPopup) existingPopup.remove();

    // ── 오버레이 ──
    var overlay = document.createElement('div');
    overlay.id = 'introBookGuideOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99998;';

    // ── 팝업 ──
    var popup = document.createElement('div');
    popup.id = 'introBookGuidePopup';
    popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:16px;padding:32px 28px;max-width:380px;width:90%;z-index:99999;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);';
    popup.innerHTML =
        '<div style="font-size:36px;margin-bottom:8px;">📖</div>'
        + '<h3 style="margin:0 0 16px;font-size:17px;color:#1a1a1a;line-height:1.5;">'
        + '입문서 정독 (' + current + '/' + total + '일차)</h3>'
        + '<div style="margin-bottom:24px;">' + bodyHtml + '</div>'
        + '<div style="display:flex;gap:10px;">'
        + '  <button id="introBookGuideBack" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid #ddd;background:#fff;font-size:14px;font-weight:600;color:#666;cursor:pointer;">돌아가기</button>'
        + '  <button id="introBookGuideGo" style="flex:1;padding:12px;border-radius:10px;border:none;background:#5B4A9E;font-size:14px;font-weight:600;color:#fff;cursor:pointer;">' + btnLabel + '</button>'
        + '</div>';

    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    // ── 이벤트: 돌아가기 ──
    function closeGuide() {
        overlay.remove();
        popup.remove();
    }
    document.getElementById('introBookGuideBack').onclick = closeGuide;
    overlay.onclick = closeGuide;

    // ── 이벤트: 시작하기 / 계속 읽기 ──
    document.getElementById('introBookGuideGo').onclick = function() {
        closeGuide();
        var url = 'book.html?current=' + current
            + '&total=' + total
            + '&week=' + week
            + '&day=' + encodeURIComponent(day);
        if (deadlinePassed) url += '&deadline=passed';
        window.location.href = url;
    };
}

// ★ 데드라인 연장 데이터 미리 로드 (캐시)
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        if (typeof loadDeadlineExtensions === 'function') {
            loadDeadlineExtensions();
        }
    }, 500);
});

/**
 * 과제 시작 확인 팝업 (유형별 메시지)
 * @returns {boolean} true면 시작, false면 취소
 */
/**
 * 과제 시작 확인 팝업 (자체 UI)
 */
function confirmTaskStart(taskName, onConfirm) {
    // 기존 팝업 제거
    var existing = document.getElementById('taskStartPopup');
    if (existing) existing.remove();
    var existingOverlay = document.getElementById('taskStartOverlay');
    if (existingOverlay) existingOverlay.remove();

    // 오버레이
    var overlay = document.createElement('div');
    overlay.id = 'taskStartOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99998;';

    // 팝업
    var popup = document.createElement('div');
    popup.id = 'taskStartPopup';
    popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:16px;padding:32px 28px;max-width:360px;width:90%;z-index:99999;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);';
    popup.innerHTML = 
        '<div style="font-size:40px;margin-bottom:12px;">⚠️</div>' +
        '<h3 style="margin:0 0 16px;font-size:17px;color:#1a1a1a;line-height:1.5;">과제를 시작하시겠습니까?</h3>' +
        '<p style="margin:0 0 24px;font-size:14px;color:#666;line-height:1.7;">' +
            '제한시간 20분이 바로 시작됩니다.<br>' +
            '첫 풀이 결과는 차트 및 포트폴리오에<br>' +
            '<strong style="color:#ef4444;">영구 반영</strong>되며, 재시도할 수 없습니다.' +
        '</p>' +
        '<div style="display:flex;gap:10px;">' +
            '<button id="taskStartBack" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid #ddd;background:#fff;font-size:14px;font-weight:600;color:#666;cursor:pointer;">돌아가기</button>' +
            '<button id="taskStartGo" style="flex:1;padding:12px;border-radius:10px;border:none;background:#5B4A9E;font-size:14px;font-weight:600;color:#fff;cursor:pointer;">시작하기</button>' +
        '</div>';

    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    // 돌아가기
    document.getElementById('taskStartBack').onclick = function() {
        overlay.remove();
        popup.remove();
    };
    overlay.onclick = function() {
        overlay.remove();
        popup.remove();
    };

    // 시작하기
    document.getElementById('taskStartGo').onclick = function() {
        overlay.remove();
        popup.remove();
        onConfirm();
    };
}

/**
 * 과제 실행 함수
 * @param {string} taskName - 과제명 (예: "내벨업보카 5, 6, 7pg")
 */
function executeTask(taskName) {
    console.log(`📝 [과제실행] ${taskName}`);
    
    // ── 입문서 정독은 자체 안내 팝업 사용 (confirmTaskStart 바이패스) ──
    const parsed = parseTaskName(taskName);
    if (parsed.type === 'intro-book') {
        openIntroBookGuide(parsed.params);
        return;
    }
    
    // ── 그 외 과제: 시작 확인 팝업 → "시작하기" 누르면 실제 실행 ──
    confirmTaskStart(taskName, function() {
        _executeTaskCore(taskName);
    });
}

/**
 * 과제 실제 실행 (팝업 확인 후 호출)
 */
function _executeTaskCore(taskName) {
    // ── 4시 마감 체크 ──
    if (isTaskDeadlinePassed()) {
        alert('마감 시간(새벽 4시)이 지났습니다.\n연습용으로 풀 수 있지만, 인증률에는 반영되지 않습니다.');
        window._deadlinePassedMode = true;
    } else {
        window._deadlinePassedMode = false;
    }
    
    const parsed = parseTaskName(taskName);
    console.log('  파싱 결과:', parsed);
    
    switch (parsed.type) {
        case 'vocab':
            // 내벨업보카 시험 시작
            console.log(`  🔹 내벨업보카 시작 - 페이지: ${parsed.params.pages.join(', ')}`);
            _launchVocabModule(parsed.params.pages);
            break;
            
        case 'intro-book':
            // 입문서 정독 — executeTask()에서 이미 처리됨 (여기에 오면 안 됨)
            console.log(`  🔹 입문서 정독 — _executeTaskCore 도달 (정상 흐름 아님)`);
            openIntroBookGuide(parsed.params);
            break;
            
        case 'reading':
        case 'listening':
        case 'writing':
        case 'speaking':
            // V3: 4섹션은 과제 대시보드(taskDashboardScreen)를 먼저 표시
            console.log(`  🔹 [V3] ${parsed.type} → 과제 대시보드로 이동`);
            if (typeof openTaskDashboard === 'function') {
                openTaskDashboard(parsed.type, parsed.params, taskName);
            } else {
                console.error('❌ openTaskDashboard 함수가 없습니다. js/task-dashboard.js를 확인하세요.');
            }
            break;
            
        default:
            console.error('  ❌ 알 수 없는 과제 타입:', parsed.type);
            alert('알 수 없는 과제 타입입니다.');
    }
}

/**
 * 내벨업보카 모듈 시작 (initVocabTest 호출)
 * ⚠️ startVocabTest와 이름 충돌 방지 - vocab-test-logic-v2.js에 같은 이름 함수 있음
 * @param {Array<number>} pages - 페이지 번호 배열
 */
function _launchVocabModule(pages) {
    // 페이지 배열을 문자열로 변환 (예: [5, 6, 7] -> "5-7")
    let pageRange;
    if (pages.length === 1) {
        pageRange = pages[0].toString();
    } else if (pages.length === 2) {
        pageRange = pages.join('-'); // "5-6"
    } else {
        // 연속된 페이지인지 확인
        const isConsecutive = pages.every((page, i) => i === 0 || page === pages[i - 1] + 1);
        if (isConsecutive) {
            pageRange = `${pages[0]}-${pages[pages.length - 1]}`; // "5-7"
        } else {
            pageRange = pages.join(','); // "5,7,9"
        }
    }
    
    console.log(`📚 [내벨업보카] 페이지: ${pages.join(', ')} -> 범위: ${pageRange}`);
    
    // vocab-test-logic-v2.js의 initVocabTest 함수 호출
    if (typeof initVocabTest === 'function') {
        var ct = window.currentTest;
        var weekId = ct ? ct.currentWeek : null;
        var dayId = ct ? ct.currentDay : null;
        initVocabTest(pageRange, weekId, dayId);
    } else {
        console.error('❌ initVocabTest 함수를 찾을 수 없습니다.');
    }
}

