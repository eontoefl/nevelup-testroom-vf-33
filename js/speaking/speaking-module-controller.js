/**
 * ================================================
 * speaking-module-controller.js
 * 스피킹 모듈 컨트롤러
 * ================================================
 * 
 * 역할: 2개 컴포넌트(Repeat × 1, Interview × 1)를 순서대로 진행시키는 지휘자
 * 
 * 흐름:
 *   대시보드 "실전풀이" → startSpeakingModule(moduleNumber)
 *   → "시작" 준비 화면 (데이터 로드 + AudioContext 생성)
 *   → 사용자 "시작" 탭 → AudioContext unlock (iPad 호환)
 *   → Repeat 인트로 → 7개 오디오 + 녹음 (자동 진행)
 *   → Repeat 완료 → Interview 인트로 → 4개 질문 + 녹음 (자동 진행)
 *   → Interview 완료 → DB 저장 → 대시보드 복귀
 * 
 * 다른 컨트롤러와의 핵심 차이:
 *   - Next/Back/Submit 버튼 없음 ("시작" 탭 1회 → 이후 완전 자동)
 *   - 전체 타이머 없음 (컴포넌트 내부에서 녹음 타이머 처리)
 *   - Review Panel 없음
 *   - DB에는 완료 플래그만 저장 (레벨 계산 없음)
 *   - AudioContext 기반 오디오 재생 (iPad Safari 호환)
 * 
 * 참조: docs/speaking-module-controller-spec.md
 */

// ============================================================
// 전역 상태
// ============================================================

window.currentSpeakingModule = null;

// ============================================================
// 1. 진입점 — startSpeakingModule
// ============================================================

/**
 * 스피킹 모듈 시작 (대시보드에서 호출됨)
 * @param {number} moduleNumber - 모듈 번호 (1, 2, ...)
 */
async function startSpeakingModule(moduleNumber) {
    console.log('\n🎙️ ============================');
    console.log('🎙️ 스피킹 Module ' + moduleNumber + ' 시작');
    console.log('🎙️ ============================\n');

    // 시퀀스 정의 (2개 컴포넌트)
    var sequence = [
        { type: 'repeat',    setNum: moduleNumber, questionsPerSet: 7, label: '따라말하기' },
        { type: 'interview', setNum: moduleNumber, questionsPerSet: 4, label: '인터뷰' }
    ];

    // AudioPlayer 인스턴스 생성
    var audioPlayer = new AudioPlayer();

    // 모듈 상태 객체 생성
    window.currentSpeakingModule = {
        moduleNum: moduleNumber,
        sequence: sequence,
        components: [],          // [RepeatComponent, InterviewComponent]
        currentIndex: 0,         // 현재 컴포넌트 인덱스 (0=Repeat, 1=Interview)
        totalQuestions: 11,
        isRetake: false,         // 다시풀기 여부
        completedTypes: {},      // { repeat: true, interview: true }
        audioPlayer: audioPlayer // AudioPlayer 인스턴스 (공유)
    };

    // 다시풀기 여부 확인
    // 기준: initial_record 존재 OR 마감 지남 → current_record에 저장
    var state = window._taskDashboardState;
    var deadlinePassed = window._deadlinePassedMode || false;
    var inPractice = state && state.isPractice;
    if (deadlinePassed && !inPractice) {
        window.currentSpeakingModule.isRetake = true;
        console.log('🔄 다시풀기 모드 (마감 지남)');
    } else if (state) {
        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
        if (user && user.id && user.id !== 'dev-user-001') {
            try {
                var existing;
                if (inPractice && typeof getStudyResultPractice === 'function') {
                    existing = await getStudyResultPractice(
                        user.id, 'speaking', moduleNumber, state.practiceNumber
                    );
                } else {
                    existing = await getStudyResultV3(
                        user.id, 'speaking', moduleNumber,
                        state.week, state.day
                    );
                }
                if (existing && existing.initial_record != null) {
                    window.currentSpeakingModule.isRetake = true;
                    console.log('🔄 다시풀기 모드 (initial_record 존재)');
                }
            } catch (e) {
                console.warn('⚠️ 다시풀기 확인 실패 (무시하고 진행):', e);
            }
        }
    }

    // 컴포넌트 2개 생성
    _createSpeakingComponents(moduleNumber);

    // "시작" 준비 화면 표시
    showScreen('speakingRepeatScreen');
    _showSpeakingReadyScreen();

    // 데이터 병렬 로드
    try {
        await _loadSpeakingData();
        // 로드 성공 → "시작" 버튼 활성화
        _enableSpeakingStartBtn();
    } catch (e) {
        console.error('❌ 스피킹 데이터 로드 실패:', e);
        _showSpeakingLoadError();
    }
}

// ============================================================
// 2. 컴포넌트 생성 (2개)
// ============================================================

/**
 * Repeat + Interview 컴포넌트 생성
 * 생성자에서 setId, audioPlayer, onComplete을 한번에 전달
 */
function _createSpeakingComponents(moduleNumber) {
    var mod = window.currentSpeakingModule;
    if (!mod) return;

    console.log('📦 스피킹 컴포넌트 생성 시작...');

    // Repeat 컴포넌트
    var repeatComp = new RepeatComponent(
        moduleNumber,
        mod.audioPlayer,
        function(result) {
            _onSpeakingComponentComplete(0, 'repeat', result);
        }
    );
    window.currentRepeatComponent = repeatComp;
    console.log('  ✅ [0] 따라말하기 생성 완료');

    // Interview 컴포넌트
    var interviewComp = new InterviewComponent(
        moduleNumber,
        mod.audioPlayer,
        function(result) {
            _onSpeakingComponentComplete(1, 'interview', result);
        }
    );
    window.currentInterviewComponent = interviewComp;
    console.log('  ✅ [1] 인터뷰 생성 완료');

    mod.components = [repeatComp, interviewComp];
    console.log('📦 스피킹 컴포넌트 생성 완료');
}

// ============================================================
// 3. 데이터 로드
// ============================================================

/**
 * 두 컴포넌트의 데이터를 병렬로 로드
 */
async function _loadSpeakingData() {
    var mod = window.currentSpeakingModule;
    if (!mod) return;

    console.log('📥 스피킹 데이터 병렬 로드 시작...');

    var results = await Promise.all([
        mod.components[0].loadRepeatData(),
        mod.components[1].loadInterviewData()
    ]);

    // 로드 결과 확인
    if (!results[0]) {
        throw new Error('따라말하기 데이터 로드 실패');
    }
    if (!results[1]) {
        throw new Error('인터뷰 데이터 로드 실패');
    }

    console.log('📥 스피킹 데이터 로드 완료');
}

// ============================================================
// 4. "시작" 준비 화면 관리
// ============================================================

/**
 * "시작" 준비 화면 표시
 */
function _showSpeakingReadyScreen() {
    var readyScreen = document.getElementById('speakingReadyScreen');
    if (readyScreen) {
        readyScreen.style.display = 'flex';
    }

    // 상태 텍스트: 로드 중
    var statusEl = document.getElementById('speakingReadyStatus');
    if (statusEl) {
        statusEl.textContent = '데이터 로드 중...';
    }

    // 버튼 비활성화
    var startBtn = document.getElementById('speakingStartBtn');
    if (startBtn) {
        startBtn.disabled = true;
    }

    // 재시도 버튼 숨김
    var retryBtn = document.getElementById('speakingRetryBtn');
    if (retryBtn) {
        retryBtn.style.display = 'none';
    }

    console.log('📺 "시작" 준비 화면 표시');
}

/**
 * 데이터 로드 성공 → "시작" 버튼 활성화
 */
function _enableSpeakingStartBtn() {
    var statusEl = document.getElementById('speakingReadyStatus');
    if (statusEl) {
        statusEl.textContent = '준비 완료! 시작 버튼을 눌러주세요.';
    }

    var startBtn = document.getElementById('speakingStartBtn');
    if (startBtn) {
        startBtn.disabled = false;
        startBtn.style.opacity = '1';
        startBtn.style.cursor = 'pointer';
    }

    console.log('✅ "시작" 버튼 활성화');
}

/**
 * 데이터 로드 실패 → 에러 메시지 + 재시도 버튼 표시
 */
function _showSpeakingLoadError() {
    var statusEl = document.getElementById('speakingReadyStatus');
    if (statusEl) {
        statusEl.textContent = '데이터를 불러올 수 없습니다.';
    }

    var startBtn = document.getElementById('speakingStartBtn');
    if (startBtn) {
        startBtn.style.display = 'none';
    }

    var retryBtn = document.getElementById('speakingRetryBtn');
    if (retryBtn) {
        retryBtn.style.display = 'inline-block';
    }

    console.log('❌ 데이터 로드 실패 — 재시도 버튼 표시');
}

// ============================================================
// 5. "시작" 버튼 탭 핸들러 (글로벌)
// ============================================================

/**
 * 사용자가 "시작" 버튼을 탭했을 때 호출
 * - AudioContext unlock (iPad 필수)
 * - 준비 화면 숨기고 Repeat 인트로 시작
 */
async function _onSpeakingStartTap() {
    var mod = window.currentSpeakingModule;
    if (!mod || !mod.audioPlayer) return;

    console.log('🎙️ "시작" 버튼 탭됨');

    // iPad 오디오 잠금 해제 (사용자 탭 컨텍스트 안에서 호출)
    await mod.audioPlayer.unlock();
    console.log('🔓 AudioContext unlock 완료');

    // 준비 화면 숨기기
    var readyScreen = document.getElementById('speakingReadyScreen');
    if (readyScreen) {
        readyScreen.style.display = 'none';
    }

    // Repeat 인트로 시작 (이후 완전 자동 진행)
    mod.components[0].showIntroScreen();
}

/**
 * 재시도 버튼 핸들러
 */
async function _onSpeakingRetryTap() {
    var mod = window.currentSpeakingModule;
    if (!mod) return;

    console.log('🔄 데이터 재로드 시도...');

    // 재시도 버튼 숨기고 로드 상태로 복귀
    var retryBtn = document.getElementById('speakingRetryBtn');
    if (retryBtn) {
        retryBtn.style.display = 'none';
    }

    var startBtn = document.getElementById('speakingStartBtn');
    if (startBtn) {
        startBtn.style.display = 'inline-block';
        startBtn.disabled = true;
    }

    var statusEl = document.getElementById('speakingReadyStatus');
    if (statusEl) {
        statusEl.textContent = '데이터 로드 중...';
    }

    try {
        await _loadSpeakingData();
        _enableSpeakingStartBtn();
    } catch (e) {
        console.error('❌ 재로드 실패:', e);
        _showSpeakingLoadError();
    }
}

// ============================================================
// 6. 컴포넌트 완료 핸들러
// ============================================================

/**
 * 컴포넌트가 완료되면 호출됨 (onComplete 콜백)
 * @param {number} index - 컴포넌트 인덱스 (0=Repeat, 1=Interview)
 * @param {string} type - 'repeat' 또는 'interview'
 * @param {object} result - 컴포넌트가 반환한 결과
 */
function _onSpeakingComponentComplete(index, type, result) {
    var mod = window.currentSpeakingModule;
    if (!mod) return;

    console.log('✅ ' + type + ' 완료');

    // cleanup은 DB 저장 후 backToTaskDashboard → cleanupSpeakingModule에서 일괄 수행
    // (cleanup을 여기서 호출하면 speakingRepeatData/speakingInterviewData가 null이 되어 DB 저장 시 데이터 누락)

    // 완료 표시
    mod.completedTypes[type] = true;

    if (index === 0) {
        // Repeat 완료 → Interview 시작
        console.log('\n▶️ Repeat 완료 → Interview 시작');
        mod.currentIndex = 1;
        showScreen('speakingInterviewScreen');
        mod.components[1].showInterviewIntroScreen();
    } else {
        // Interview 완료 → 모듈 종료
        console.log('\n▶️ Interview 완료 → 모듈 종료');
        _finishSpeakingModule();
    }
}

// ============================================================
// 7. 완료 → DB 저장 → 대시보드 복귀
// ============================================================

async function _finishSpeakingModule() {
    var mod = window.currentSpeakingModule;
    if (!mod) return;

    console.log('\n🎉 ============================');
    console.log('🎉 스피킹 Module 완료!');
    console.log('🎉 ============================\n');

    // 로딩 화면 표시 (DB 저장 대기)
    _showSubmitLoading();

    // V3 JSON 구조 (완료 플래그 + 문제 데이터)
    // 해설 화면에서 DB로부터 문제를 복원하기 위해 데이터를 함께 저장
    var repeatData = (mod.components[0] && mod.components[0].speakingRepeatData) || null;
    var interviewData = (mod.components[1] && mod.components[1].speakingInterviewData) || null;

    var recordJson = {
        totalQuestions: mod.totalQuestions,
        completed: true,
        repeat: {
            completed: !!mod.completedTypes.repeat,
            data: repeatData
        },
        interview: {
            completed: !!mod.completedTypes.interview,
            data: interviewData
        },
        completedAt: new Date().toISOString()
    };

    console.log('📊 결과 JSON:', JSON.stringify(recordJson));

    // DB 저장
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
    var ct = window.currentTest;
    var state2 = window._taskDashboardState || {};
    var inPractice2 = state2.isPractice;

    if (user && user.id && user.id !== 'dev-user-001' && (ct || inPractice2)) {
        var week = inPractice2 ? null : ct.currentWeek;
        var day = inPractice2 ? null : ct.currentDay;

        try {
            if (inPractice2) {
                var pNum = state2.practiceNumber;
                if (mod.isRetake) {
                    await upsertCurrentRecordPractice(user.id, 'speaking', mod.moduleNum, pNum, recordJson);
                } else {
                    await upsertInitialRecordPractice(user.id, 'speaking', mod.moduleNum, pNum, recordJson);
                }
            } else if (mod.isRetake) {
                await upsertCurrentRecord(user.id, 'speaking', mod.moduleNum, week, day, recordJson);
                console.log('💾 current_record 저장 완료');
            } else {
                await upsertInitialRecord(user.id, 'speaking', mod.moduleNum, week, day, recordJson);
                console.log('💾 initial_record 저장 완료');
            }

            // 저장 성공 → 대시보드 복귀 (cleanup은 backToTaskDashboard → cleanupSpeakingModule에서 일괄 수행)
            _hideSubmitLoading();
            backToTaskDashboard();

        } catch (e) {
            console.error('❌ DB 저장 실패:', e);
            _hideSubmitLoading();
            alert('저장에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');
        }
    } else {
        console.log('📊 [개발모드] DB 저장 생략');
        console.log('📊 recordJson:', JSON.stringify(recordJson, null, 2));
        _hideSubmitLoading();
        backToTaskDashboard();
    }
}

// ============================================================
// 8. 정리 함수 (외부에서 호출 가능)
// ============================================================

/**
 * 스피킹 모듈 전체 정리
 * - 각 컴포넌트 cleanup (오디오/타이머/비디오 정지)
 * - AudioPlayer 자원 해제
 * - 모듈 상태 초기화
 * 
 * 호출 시점: backToTaskDashboard()
 */
function cleanupSpeakingModule() {
    var mod = window.currentSpeakingModule;
    if (!mod) {
        console.log('🧹 스피킹 모듈 없음 — 정리 불필요');
        return;
    }

    console.log('🧹 [cleanupSpeakingModule] 스피킹 모듈 정리 시작');

    // 1. 각 컴포넌트 cleanup
    mod.components.forEach(function(comp, i) {
        if (comp && typeof comp.cleanup === 'function') {
            try {
                comp.cleanup();
                console.log('  ✅ 컴포넌트 [' + i + '] cleanup 완료');
            } catch (e) {
                console.warn('  ⚠️ 컴포넌트 [' + i + '] cleanup 오류:', e);
            }
        }
    });

    // 2. AudioPlayer 자원 해제
    if (mod.audioPlayer && typeof mod.audioPlayer.destroy === 'function') {
        mod.audioPlayer.destroy();
        console.log('  ✅ AudioPlayer 정리 완료');
    }

    // 3. 모듈 상태 초기화
    window.currentSpeakingModule = null;
    console.log('✅ [cleanupSpeakingModule] 스피킹 모듈 정리 완료');
}

// ============================================================
// 9. 로딩 함수 (리딩/리스닝과 공유 — submitLoadingOverlay)
// ============================================================

// _showSubmitLoading, _hideSubmitLoading은 reading-module-controller.js에서 이미 정의됨
// 스피킹에서도 동일한 오버레이 사용 (DB 저장 대기용)

// ============================================================
// 로드 확인
// ============================================================

console.log('✅ [Speaking] speaking-module-controller.js 로드 완료');
