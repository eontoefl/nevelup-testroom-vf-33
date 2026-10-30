/**
 * ================================================
 * listening-module-controller.js
 * 리스닝 모듈 컨트롤러 (V3)
 * ================================================
 * 
 * 역할: 9개 세트(32문제)를 순서대로 진행시키는 지휘자
 * 
 * 흐름:
 *   대시보드 "실전풀이" → startListeningModule(moduleNumber)
 *   → 사운드 체크 화면 (음량 확인 + 오디오 잠금 해제)
 *   → 9개 세트 순서 진행 (순방향만, Back 없음)
 *   → Submit 또는 마지막 문제 완료 → 전체 채점 → DB 저장
 *   → 대시보드 복귀
 *
 * 오디오 규칙 (실전 동일):
 *   - 화면 표시 약 2초 후 자동 재생 (예고 표시 없음)
 *   - 오디오는 모듈당 1개의 AudioPlayer(공용 서비스)가 단독 소유
 *   - 세트 이동/제출/이탈 시 컨트롤러가 무조건 정지 (떠도는 오디오/타이머 원천 차단)
 *   - 재생 중에는 Next/Submit 숨김 (오디오 스킵 불가)
 * 
 * 세트 순서 (총 32문제):
 *   Response(Q1-12) → Conver세트1(Q13-14) → Conver세트2(Q15-16)
 *   → Conver세트3(Q17-18) → Announce세트1(Q19-20) → Announce세트2(Q21-22)
 *   → Announce세트3(Q23-24) → Lecture세트1(Q25-28) → Lecture세트2(Q29-32)
 * 
 * 리딩과의 핵심 차이:
 *   - Back 버튼 없음 (순방향만)
 *   - 전체 타이머 없음 (문제별 타이머는 컴포넌트 내부에서 처리)
 *   - Review Panel은 열람 전용 (클릭해도 이동 안 함)
 * 
 * 참조: v3-flow-spec.md §2-1 ~ §2-6, v3-design-spec.md §2
 */

// ============================================================
// 전역 상태
// ============================================================

window.currentListeningModule = null;

// 자동재생 대기 시간 (화면 표시 → 재생까지, 실전 체감 기준)
var LISTENING_AUTOPLAY_DELAY_MS = 2000;

// 사운드 체크 음성 (실제 문제 오디오와 동일 음량으로 제작된 전용 파일)
var LISTENING_SOUND_CHECK_URL = 'https://eontoefl.github.io/toefl-audio/listening/fixed_audio/sound_check.mp3';

// ============================================================
// 0. 리스닝 오디오 서비스 — 모듈당 1개, 모든 재생/타이머의 단독 소유자
// ============================================================

/**
 * 오디오 서비스 생성
 * - player: AudioPlayer (AudioContext 기반, 사용자 탭 1회 unlock 후 자동재생 가능)
 * - schedule(): 자동재생 대기 타이머 등록 (기존 대기는 자동 취소 — 떠도는 타이머 방지)
 * - stopAll(): 대기 타이머 + 재생 중 오디오 즉시 정지 (화면 전환 시 컨트롤러가 호출)
 */
function _createListeningAudioService() {
    return {
        player: new AudioPlayer(),
        pendingTimer: null,

        unlock: function() {
            return this.player.unlock();
        },

        /**
         * 자동재생 대기 등록 + 파일 준비 병렬 시작
         * @param {Function} fn - 대기 후 실행할 재생 함수
         * @param {string[]} [preloadUrls] - 대기하는 동안 미리 받아둘 오디오 URL들
         *   → 2초 시점에 이미 준비된 소리를 재생하므로 네트워크와 무관하게 "정확히 2초"가 보장됨
         */
        schedule: function(fn, preloadUrls) {
            this.cancelPending();
            if (preloadUrls && preloadUrls.length) {
                var p = this.player;
                preloadUrls.forEach(function(u) {
                    if (isValidListeningAudioUrl(u)) p.preload(u);
                });
            }
            var self = this;
            this.pendingTimer = setTimeout(function() {
                self.pendingTimer = null;
                fn();
            }, LISTENING_AUTOPLAY_DELAY_MS);
        },

        cancelPending: function() {
            if (this.pendingTimer) {
                clearTimeout(this.pendingTimer);
                this.pendingTimer = null;
            }
        },

        play: function(url, onEnded, onError) {
            return this.player.play(url, onEnded, onError);
        },

        stopAll: function() {
            this.cancelPending();
            this.player.stop();
        },

        destroy: function() {
            this.cancelPending();
            this.player.destroy();
        }
    };
}

// ============================================================
// 1. 진입점 — startListeningModule
// ============================================================

/**
 * 리스닝 모듈 시작 (대시보드에서 호출됨)
 * @param {number} moduleNumber - 모듈 번호 (1, 2, ...)
 */
async function startListeningModule(moduleNumber) {
    console.log(`\n🎧 ============================`);
    console.log(`🎧 리스닝 Module ${moduleNumber} 시작`);
    console.log(`🎧 ============================\n`);

    // 이전 모듈이 정리되지 않은 채 남아있으면(예: 진입 버튼 연타) 같은 문으로 먼저 정리
    if (window.currentListeningModule) {
        console.warn('⚠️ 이전 리스닝 모듈 미정리 상태 — 정리 후 재시작');
        cleanupListeningModule();
    }

    // 세트 번호 매핑 (module-definitions.js 규칙 기반)
    // Response: 모듈당 1세트 (Module 1 → set 1, Module 2 → set 2)
    // Conver: 모듈당 3세트 (Module 1 → sets [1,2,3], Module 2 → sets [4,5,6])
    // Announcement: 모듈당 3세트 (Module 1 → sets [1,2,3], Module 2 → sets [4,5,6])
    // Lecture: 모듈당 2세트 (Module 1 → sets [1,2], Module 2 → sets [3,4])
    const responseStart = moduleNumber;
    const converStart = (moduleNumber - 1) * 3 + 1;
    const announceStart = (moduleNumber - 1) * 3 + 1;
    const lectureStart = (moduleNumber - 1) * 2 + 1;

    // 9개 세트 시퀀스 정의
    const sequence = [
        { type: 'response',     setNum: responseStart,       questionsPerSet: 12, label: '응답고르기' },
        { type: 'conver',       setNum: converStart,         questionsPerSet: 2,  label: '대화 세트1' },
        { type: 'conver',       setNum: converStart + 1,     questionsPerSet: 2,  label: '대화 세트2' },
        { type: 'conver',       setNum: converStart + 2,     questionsPerSet: 2,  label: '대화 세트3' },
        { type: 'announcement', setNum: announceStart,       questionsPerSet: 2,  label: '공지사항 세트1' },
        { type: 'announcement', setNum: announceStart + 1,   questionsPerSet: 2,  label: '공지사항 세트2' },
        { type: 'announcement', setNum: announceStart + 2,   questionsPerSet: 2,  label: '공지사항 세트3' },
        { type: 'lecture',      setNum: lectureStart,        questionsPerSet: 4,  label: '렉쳐 세트1' },
        { type: 'lecture',      setNum: lectureStart + 1,    questionsPerSet: 4,  label: '렉쳐 세트2' }
    ];

    // 모듈 상태 객체 생성
    window.currentListeningModule = {
        moduleNum: moduleNumber,
        sequence: sequence,
        components: [],       // 9개 컴포넌트 인스턴스
        currentIndex: 0,      // 현재 세트 인덱스 (0~8)
        totalQuestions: 32,
        answers: {},          // 세트별 채점 결과
        isRetake: false,      // 다시풀기 여부
        audio: _createListeningAudioService(),  // 오디오 단독 소유자
        soundCheckHeard: false                  // 사운드 체크 1회 이상 청취 여부
    };

    // 다시풀기 여부 확인
    // 기준: initial_record 존재 OR 마감 지남 → current_record에 저장
    var state = window._taskDashboardState;
    var deadlinePassed = (window._deadlinePassedMode || window._pausedMode) || false;   // 일시정지 중(실전 기록 있는 과제)도 다시풀기 모드
    var inPractice = state && state.isPractice;
    if (deadlinePassed && !inPractice) {
        window.currentListeningModule.isRetake = true;
        console.log('🔄 다시풀기 모드 (마감 지남)');
    } else if (state) {
        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
        if (user && user.id && user.id !== 'dev-user-001') {
            try {
                var existing;
                if (inPractice && typeof getStudyResultPractice === 'function') {
                    existing = await getStudyResultPractice(
                        user.id, 'listening', moduleNumber, state.practiceNumber
                    );
                } else {
                    existing = await getStudyResultV3(
                        user.id, 'listening', moduleNumber,
                        state.week, state.day
                    );
                }
                if (existing && existing.initial_record != null) {
                    window.currentListeningModule.isRetake = true;
                    console.log('🔄 다시풀기 모드 (initial_record 존재)');
                }
            } catch (e) {
                console.warn('⚠️ 다시풀기 확인 실패 (무시하고 진행):', e);
            }
        }
    }

    // 9개 컴포넌트 한꺼번에 생성
    _createAllListeningComponents();

    // 사운드 체크 화면부터 시작 (음량 확인 + 오디오 잠금 해제 → 이후 자동재생)
    _showListeningSoundCheck();
}

// ============================================================
// 1-1. 사운드 체크 화면
// ============================================================

// 사운드체크 버튼 라벨 (재생/정지 토글)
var _SOUND_CHECK_PLAY_LABEL = '<i class="fas fa-volume-up"></i>소리 들어보기';
var _SOUND_CHECK_STOP_LABEL = '<i class="fas fa-stop"></i>정지';

/**
 * 사운드 체크 화면 표시 (모듈 진입 직후)
 * - [소리 들어보기]: 반복 재생 가능, 재생 중에는 [정지]로 토글
 * - [잘 들려요, 시작하기]: 소리가 한 번이라도 재생되기 전까지 비활성화
 */
function _showListeningSoundCheck() {
    if (typeof showScreen === 'function') {
        showScreen('listeningSoundCheckScreen');
    }

    var playBtn = document.getElementById('listeningSoundPlayBtn');
    var startBtn = document.getElementById('listeningSoundStartBtn');
    var statusEl = document.getElementById('listeningSoundCheckStatus');

    var mod = window.currentListeningModule;
    if (mod) mod.soundCheckPlaying = false;

    if (playBtn) {
        playBtn.disabled = false;
        playBtn.innerHTML = _SOUND_CHECK_PLAY_LABEL;
    }
    if (startBtn) startBtn.disabled = true;
    if (statusEl) {
        statusEl.innerHTML = '&nbsp;';
        statusEl.classList.remove('is-error');
    }

    // 화면이 뜨는 동안 체크 음성을 미리 받아둠 (버튼 클릭 시 즉시 재생)
    if (mod && mod.audio) mod.audio.player.preload(LISTENING_SOUND_CHECK_URL);

    console.log('🔉 사운드 체크 화면 표시');
}

/**
 * [소리 들어보기] / [정지] 클릭 (토글) — 사용자 제스처 안에서 unlock 후 재생
 */
async function _onListeningSoundCheckPlay() {
    var mod = window.currentListeningModule;
    if (!mod || !mod.audio) return;

    var playBtn = document.getElementById('listeningSoundPlayBtn');
    var statusEl = document.getElementById('listeningSoundCheckStatus');

    // 재생 중 클릭 = 정지
    // "들었다"는 버튼의 추측이 아니라 플레이어의 사실로 판정:
    // 소리가 실제로 출발한 적(currentSource 존재) 있을 때만 청취로 인정
    if (mod.soundCheckPlaying) {
        var actuallyPlayed = !!(mod.audio.player && mod.audio.player.currentSource);
        mod.audio.stopAll();
        mod.soundCheckPlaying = false;
        if (playBtn) playBtn.innerHTML = _SOUND_CHECK_PLAY_LABEL;

        if (actuallyPlayed) {
            mod.soundCheckHeard = true;
            if (statusEl) statusEl.textContent = '잘 들리셨나요? 음량을 조절한 뒤 다시 들어보셔도 좋아요.';
            var startBtn0 = document.getElementById('listeningSoundStartBtn');
            if (startBtn0) startBtn0.disabled = false;
        } else {
            // 소리가 나오기 전에 정지됨 — 청취로 인정하지 않음
            if (statusEl) statusEl.textContent = '소리가 나오기 전에 정지했어요. 다시 눌러 확인해 주세요.';
        }
        return;
    }

    // 재생 시작 (토글 상태를 먼저 확정 — 연타 시 두 번째 클릭은 정지로 동작)
    mod.soundCheckPlaying = true;
    if (playBtn) playBtn.innerHTML = _SOUND_CHECK_STOP_LABEL;
    if (statusEl) {
        statusEl.textContent = '재생 중... (다시 누르면 정지)';
        statusEl.classList.remove('is-error');
    }

    try { await mod.audio.unlock(); } catch (e) { /* 재생 시도에서 판정됨 */ }

    // unlock 대기 중 정지되었거나 모듈이 바뀌었으면 재생하지 않음
    if (!mod.soundCheckPlaying || window.currentListeningModule !== mod) return;

    mod.audio.play(LISTENING_SOUND_CHECK_URL, function() {
        // 청취 완료 → 시작 버튼 활성화
        mod.soundCheckPlaying = false;
        mod.soundCheckHeard = true;
        if (playBtn) playBtn.innerHTML = _SOUND_CHECK_PLAY_LABEL;
        if (statusEl) statusEl.textContent = '잘 들리셨나요? 음량을 조절한 뒤 다시 들어보셔도 좋아요.';
        var startBtn = document.getElementById('listeningSoundStartBtn');
        if (startBtn) startBtn.disabled = false;
    }, function() {
        // 재생 실패 → 안내 후 재시도 가능
        // 실패 문법(2회차부터 탈출구): 계속 실패하면 사운드체크 없이 시작할 수 있게 허용
        // (문제 화면에는 자체 재시도 UI가 있으므로 학생이 갇히지 않음)
        mod.soundCheckPlaying = false;
        mod.soundCheckFailCount = (mod.soundCheckFailCount || 0) + 1;
        if (playBtn) playBtn.innerHTML = _SOUND_CHECK_PLAY_LABEL;

        if (mod.soundCheckFailCount >= 2) {
            mod.soundCheckBypassAllowed = true;
            var startBtnE = document.getElementById('listeningSoundStartBtn');
            if (startBtnE) startBtnE.disabled = false;
            if (statusEl) {
                statusEl.textContent = '소리 재생에 계속 실패하고 있어요. 이대로 시작해도 돼요. 문제 화면에서 소리가 안 나오면 [다시 시도] 버튼이 나와요.';
                statusEl.classList.add('is-error');
            }
        } else if (statusEl) {
            statusEl.textContent = '소리를 재생하지 못했습니다. 인터넷 연결을 확인하고 다시 눌러주세요.';
            statusEl.classList.add('is-error');
        }
    });
}

/**
 * [잘 들려요, 시작하기] 클릭 → 첫 세트 시작
 */
async function _onListeningSoundCheckStart() {
    var mod = window.currentListeningModule;
    if (!mod || !mod.audio) return;
    if (!mod.soundCheckHeard && !mod.soundCheckBypassAllowed) return;

    // 클릭 즉시 버튼 비활성화 — 전이 중 두 번째 클릭이 물리적으로 불가능
    var startBtn = document.getElementById('listeningSoundStartBtn');
    if (startBtn) startBtn.disabled = true;

    // 제스처 컨텍스트에서 한 번 더 unlock (안전망 — 실패해도 진행, 재생 시도에서 판정됨)
    try { await mod.audio.unlock(); } catch (e) { /* 무시 */ }
    mod.audio.stopAll();

    console.log('✅ 사운드 체크 완료 → 첫 세트 시작');
    await _goToListeningSet(0);
}

window._onListeningSoundCheckPlay = _onListeningSoundCheckPlay;
window._onListeningSoundCheckStart = _onListeningSoundCheckStart;

// ============================================================
// 2. 컴포넌트 생성 (9개 한꺼번에)
// ============================================================

function _createAllListeningComponents() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    console.log('📦 9개 리스닝 컴포넌트 생성 시작...');

    mod.components = mod.sequence.map(function(seq, index) {
        var comp = null;

        // 공통 config (문제별 타이머: 렉쳐 30초, 나머지 20초)
        var config = {
            audio: mod.audio,
            onComplete: function(results) {
                _onListeningSetComplete(index, results);
            },
            onTimerStart: function() {
                _startListeningQuestionTimer(index, seq.type === 'lecture' ? 30 : 20);
            }
        };

        switch (seq.type) {
            case 'response':     comp = new ResponseComponent(seq.setNum, config); break;
            case 'conver':       comp = new ConverComponent(seq.setNum, config); break;
            case 'announcement': comp = new AnnouncementComponent(seq.setNum, config); break;
            case 'lecture':      comp = new LectureComponent(seq.setNum, config); break;
        }

        console.log(`  ✅ [${index}] ${seq.label} 생성 완료`);
        return comp;
    });

    console.log('📦 9개 리스닝 컴포넌트 생성 완료');
}

// ============================================================
// 3. 세트 이동
// ============================================================

/**
 * 특정 세트로 이동 (init 호출)
 * @param {number} setIndex - 0~8
 */
async function _goToListeningSet(setIndex) {
    var mod = window.currentListeningModule;
    if (!mod) return;

    if (setIndex < 0 || setIndex >= mod.sequence.length) {
        console.warn('⚠️ 유효하지 않은 세트 인덱스:', setIndex);
        return;
    }

    // ★ 세트 이동 전 오디오/대기 타이머 무조건 정지 (이전 세트 소리 누수 차단)
    if (mod.audio) mod.audio.stopAll();

    mod.currentIndex = setIndex;
    var seq = mod.sequence[setIndex];
    var comp = mod.components[setIndex];

    console.log(`\n▶️ [${setIndex + 1}/9] ${seq.label} 이동`);

    // 화면 전환 — 유형별 screen 표시
    var screenId = _LISTENING_SCREEN_MAP[seq.type];
    if (screenId && typeof showScreen === 'function') {
        showScreen(screenId);
    }

    // 버튼 상태 갱신 — 새 세트는 오디오 단계에서 시작하므로 Next/Submit 숨김
    // (데이터 로드 중·로드 실패 안내 중에도 이전 세트의 버튼 상태가 남지 않음)
    _updateListeningButtons();

    // 컴포넌트 초기화 (데이터 로드 + 문제 표시)
    var initOk = false;
    try {
        initOk = (await comp.init()) === true;
    } catch (e) {
        console.error('❌ 세트 초기화 실패:', e);
    }

    if (!initOk) {
        // 세트 로드 실패 → 공용 실패 문법으로 처리 (다시 시도 / 2회 실패부터 건너뛰기)
        _showListeningSetLoadFailure(setIndex);
        return;
    }

    // 문제 번호 표시 업데이트
    _updateListeningProgress();
}

// 유형별 화면/컨테이너 매핑
var _LISTENING_SCREEN_MAP = {
    'response':     'listeningResponseScreen',
    'conver':       'listeningConverScreen',
    'announcement': 'listeningAnnouncementScreen',
    'lecture':      'listeningLectureScreen'
};
var _LISTENING_FAILURE_CONTAINER_MAP = {
    'response':     'responsePersonImage',
    'conver':       'converIntroImage',
    'announcement': 'announcementIntroImage',
    'lecture':      'lectureIntroImage'
};

/**
 * 세트 데이터 로드 실패 → 공용 실패 UI 표시
 * 건너뛰면 해당 세트는 최종 제출 시 기존 규칙("데이터 없는 세트는 0점")이 그대로 처리
 */
function _showListeningSetLoadFailure(setIndex) {
    var mod = window.currentListeningModule;
    if (!mod) return;

    var seq = mod.sequence[setIndex];
    if (!mod._setFailCounts) mod._setFailCounts = {};
    mod._setFailCounts[setIndex] = (mod._setFailCounts[setIndex] || 0) + 1;

    console.warn('⚠️ [' + seq.label + '] 로드 실패 (' + mod._setFailCounts[setIndex] + '회차)');

    // 실패 UI가 붙는 인트로 영역이 보이도록 서브화면 상태 정리
    // (같은 유형의 직전 세트가 문제 화면을 띄워둔 채일 수 있음)
    var subScreens = {
        'conver':       ['converIntroScreen', 'converQuestionScreen'],
        'announcement': ['announcementIntroScreen', 'announcementQuestionScreen'],
        'lecture':      ['lectureIntroScreen', 'lectureQuestionScreen']
    }[seq.type];
    if (subScreens) {
        var introEl = document.getElementById(subScreens[0]);
        var questionEl = document.getElementById(subScreens[1]);
        if (introEl) introEl.style.display = 'block';
        if (questionEl) questionEl.style.display = 'none';
    }

    showListeningFailureUI({
        containerId: _LISTENING_FAILURE_CONTAINER_MAP[seq.type],
        uiId: 'listeningSetLoadFailureUI',
        message: '문제를 불러오지 못했습니다',
        failCount: mod._setFailCounts[setIndex],
        onRetry: function() {
            _goToListeningSet(setIndex);
        },
        onSkip: function() {
            if (setIndex < mod.sequence.length - 1) {
                _goToListeningSet(setIndex + 1);
            } else {
                // 마지막 세트 → 전체 제출 (이 세트는 0점 처리됨)
                _listeningModuleSubmit();
            }
        }
    });
}

/**
 * 세트 완료 콜백 (submit 후 호출됨)
 */
function _onListeningSetComplete(setIndex, results) {
    var mod = window.currentListeningModule;
    if (!mod) return;

    var seq = mod.sequence[setIndex];
    var answerKey = seq.type + '_set' + seq.setNum;
    mod.answers[answerKey] = results;

    console.log(`✅ ${seq.label} 채점 결과 저장: ${answerKey}`);
}

// ============================================================
// 4. Next / Submit 버튼 핸들러 (글로벌 함수)
// ============================================================

/**
 * 통합 Next 핸들러 — 모든 리스닝 화면의 Next 버튼에서 호출
 * 리스닝은 순방향만 (Back 없음)
 */
async function _listeningModuleNext() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    var seq = mod.sequence[mod.currentIndex];
    var comp = mod.components[mod.currentIndex];

    // 오디오 재생 중에는 Next 무시 (버튼은 숨겨져 있지만 이중 방어)
    if (comp && typeof comp.isAudioPhase === 'function' && comp.isAudioPhase()) {
        console.log('🔒 오디오 재생 중 — Next 무시');
        return;
    }

    // 클릭 즉시 전이 버튼 물리 잠금 — 새 상태가 그려진 뒤 되살아남
    _lockListeningNavButtons();

    try {
        // Next 누르면 현재 타이머 멈춤
        _stopListeningQuestionTimer();

        // 세트 내부 다음 문제 시도
        var moved = comp.nextQuestion();
        if (!moved) {
            // 세트 마지막 → 제출 후 다음 세트
            comp.submit();
            if (mod.currentIndex < mod.sequence.length - 1) {
                // _goToListeningSet 내부에서 progress/buttons 업데이트하므로 여기서 return
                await _goToListeningSet(mod.currentIndex + 1);
                return;
            }
        }

        _updateListeningProgress();
        _updateListeningButtons();
    } finally {
        _unlockListeningNavButtonsSoon();
    }
}

/**
 * 전체 Submit 핸들러
 * - 로딩 화면 표시로 중복 클릭 차단
 * - 채점 + DB 저장 1회만 실행
 */
function _listeningModuleSubmit() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    // 클릭 즉시 전이 버튼 물리 잠금 (제출 중 로딩 오버레이가 이어받음)
    _lockListeningNavButtons();

    // 오디오/대기 타이머 정지
    if (mod.audio) mod.audio.stopAll();

    // 타이머 멈춤
    _stopListeningQuestionTimer();

    // 로딩 화면 표시 (중복 클릭 차단)
    _showSubmitLoading();

    console.log('📤 리스닝 모듈 전체 제출');

    // 현재 세트 먼저 제출 (아직 안 했을 수 있음)
    var comp = mod.components[mod.currentIndex];
    var currentKey = mod.sequence[mod.currentIndex].type + '_set' + mod.sequence[mod.currentIndex].setNum;
    if (comp && !mod.answers[currentKey] && comp.setData != null) {
        comp.submit();
    }

    // 모든 미제출 세트 일괄 제출
    // ※ init()되지 않은 세트(문제 데이터 없음)는 건너뛰고 0점 처리
    mod.sequence.forEach(function(seq, i) {
        var key = seq.type + '_set' + seq.setNum;
        if (!mod.answers[key] && mod.components[i]) {
            // 문제 데이터가 있는지 확인 (init 완료 여부)
            var hasData = mod.components[i].setData != null;
            if (hasData) {
                mod.components[i].submit();
            } else {
                // 데이터 없음 → 빈 결과(0점)로 기록
                console.log('⚠️ [' + seq.label + '] 문제 데이터 없음 — 0점 처리');
                mod.answers[key] = {
                    type: seq.type,
                    setNumber: seq.setNum,
                    answers: []
                };
            }
        }
    });

    _finishListeningModule();
}

// ============================================================
// 5. HTML onclick 연결용 글로벌 함수
// ============================================================

// Response Next/Submit
window.nextResponseQuestion = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleNext();
};

window.submitListeningResponse = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleSubmit();
};

// Conver Next/Submit
window.nextConverQuestion = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleNext();
};

window.submitListeningConver = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleSubmit();
};

// Announcement Next/Submit
window.nextAnnouncementQuestion = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleNext();
};

window.submitListeningAnnouncement = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleSubmit();
};

// Lecture Next/Submit
window.nextLectureQuestion = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleNext();
};

window.submitListeningLecture = function() {
    if (!window.currentListeningModule) return;
    _listeningModuleSubmit();
};

// Review Panel
window.openListeningReviewPanel = function() {
    _openListeningReviewPanel();
};

window.closeListeningReviewPanel = function() {
    _closeReviewPanel();
};

// ============================================================
// 6. 문제 번호 표시 업데이트
// ============================================================

function _updateListeningProgress() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    var seq = mod.sequence[mod.currentIndex];
    var comp = mod.components[mod.currentIndex];

    // 이 세트 이전까지의 누적 문제 수
    var offset = 0;
    for (var i = 0; i < mod.currentIndex; i++) {
        offset += mod.sequence[i].questionsPerSet;
    }

    var qNum = offset + comp.currentQuestion + 1;
    var progressText = 'Question ' + qNum + ' of ' + mod.totalQuestions;

    // 유형별 progress 요소 ID
    var progressIds = {
        'response': 'responseProgress',
        'conver': 'converProgress',
        'announcement': 'announcementProgress',
        'lecture': 'lectureProgress'
    };

    var el = document.getElementById(progressIds[seq.type]);
    if (el) {
        el.textContent = progressText;
    }
}

// ============================================================
// 7. 버튼 상태 업데이트 (Next/Submit — 켜는 손은 컨트롤러 한 곳)
// ============================================================

// 전이 버튼 물리 잠금 — 전이가 시작되면 버튼이 눌리는 상태로 존재하지 않는다.
// 새 상태가 화면에 정착(350ms)한 뒤에만 되살아남 → 더블클릭이 물리적으로 불가능
var _listeningNavLock = { active: false, timer: null };
var _LISTENING_NAV_BUTTON_IDS = [
    'responseNextBtn', 'responseSubmitBtn',
    'converNextBtn', 'converSubmitBtn',
    'announcementNextBtn', 'announcementSubmitBtn',
    'lectureNextBtn', 'lectureSubmitBtn'
];

function _setListeningNavButtonsDisabled(disabled) {
    _LISTENING_NAV_BUTTON_IDS.forEach(function(id) {
        var btn = document.getElementById(id);
        if (btn) btn.disabled = disabled;
    });
}

function _lockListeningNavButtons() {
    _listeningNavLock.active = true;
    if (_listeningNavLock.timer) {
        clearTimeout(_listeningNavLock.timer);
        _listeningNavLock.timer = null;
    }
    _setListeningNavButtonsDisabled(true);
}

function _unlockListeningNavButtonsSoon() {
    if (_listeningNavLock.timer) clearTimeout(_listeningNavLock.timer);
    _listeningNavLock.timer = setTimeout(function() {
        _listeningNavLock.timer = null;
        _listeningNavLock.active = false;
        _setListeningNavButtonsDisabled(false);
    }, 350);
}

function _updateListeningButtons() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    var seq = mod.sequence[mod.currentIndex];
    var comp = mod.components[mod.currentIndex];
    var isLastSet = (mod.currentIndex === mod.sequence.length - 1);

    // 전체 32문제 기준 마지막 문제인지 판단
    var isVeryLast = false;
    if (isLastSet) {
        // 마지막 세트의 마지막 문제인지
        isVeryLast = (comp.currentQuestion >= seq.questionsPerSet - 1);
    }

    // 유형별 버튼 요소 ID
    var buttonMap = {
        'response':     { next: 'responseNextBtn',     submit: 'responseSubmitBtn' },
        'conver':       { next: 'converNextBtn',       submit: 'converSubmitBtn' },
        'announcement': { next: 'announcementNextBtn', submit: 'announcementSubmitBtn' },
        'lecture':      { next: 'lectureNextBtn',      submit: 'lectureSubmitBtn' }
    };

    var ids = buttonMap[seq.type];
    if (!ids) return;

    var nextBtn = document.getElementById(ids.next);
    var submitBtn = document.getElementById(ids.submit);

    // ★ 오디오 재생 단계(인트로/재생 중)에는 Next/Submit 모두 숨김 (오디오 스킵 불가 — 실전 동일)
    if (comp && typeof comp.isAudioPhase === 'function' && comp.isAudioPhase()) {
        if (nextBtn) nextBtn.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'none';
        return;
    }

    if (nextBtn) nextBtn.style.display = isVeryLast ? 'none' : '';
    if (submitBtn) submitBtn.style.display = isVeryLast ? '' : 'none';

    // 전이 잠금 중이 아닐 때만 활성 상태 복원 (잠금 해제는 정착 타이머가 담당)
    if (!_listeningNavLock.active) {
        if (nextBtn) nextBtn.disabled = false;
        if (submitBtn) submitBtn.disabled = false;
    }
}

// ============================================================
// 8. Review Panel (열람 전용)
// ============================================================

function _openListeningReviewPanel() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    console.log('📋 Listening Review Panel 열기 (열람 전용)');

    var panel = document.getElementById('reviewPanel');
    var tbody = document.getElementById('reviewTableBody');
    var summary = document.getElementById('reviewSummary');

    if (!panel || !tbody) return;

    // 테이블 내용 생성
    tbody.innerHTML = '';
    var answeredCount = 0;
    var questionNum = 0;

    mod.sequence.forEach(function(seq, setIdx) {
        var comp = mod.components[setIdx];

        for (var q = 0; q < seq.questionsPerSet; q++) {
            questionNum++;
            var isAnswered = _isListeningQuestionAnswered(setIdx, q);
            if (isAnswered) answeredCount++;

            var tr = document.createElement('tr');
            tr.className = 'review-row';
            // 열람 전용: 클릭해도 이동하지 않음 (커서도 기본)
            tr.style.cursor = 'default';

            // 현재 보고 있는 문제 강조
            var isCurrent = (setIdx === mod.currentIndex && comp.currentQuestion === q);
            if (isCurrent) {
                tr.classList.add('review-current');
            }

            tr.innerHTML =
                '<td>' + questionNum + '</td>' +
                '<td>' + seq.label + '</td>' +
                '<td class="' + (isAnswered ? 'review-answered' : 'review-not-answered') + '">' +
                    (isAnswered ? 'Answered' : 'Not Answered') +
                '</td>';

            tbody.appendChild(tr);
        }
    });

    // 요약
    if (summary) {
        summary.textContent = answeredCount + ' of ' + mod.totalQuestions + ' answered';
    }

    // 패널 표시
    panel.style.display = 'block';
    panel.classList.add('active');
}

/**
 * 특정 문제가 답이 있는지 확인
 */
function _isListeningQuestionAnswered(setIndex, questionIndex) {
    var mod = window.currentListeningModule;
    if (!mod) return false;

    var comp = mod.components[setIndex];
    if (!comp) return false;

    if (!comp.setData) return false;

    var key = comp.setData.setId + '_q' + (questionIndex + 1);
    return comp.answers[key] != null;
}

// ============================================================
// 9. 완료 → 채점 → DB 저장 → 대시보드 복귀
// ============================================================

async function _finishListeningModule() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    console.log('\n🎉 ============================');
    console.log('🎉 리스닝 Module 완료!');
    console.log('🎉 ============================\n');

    // 전체 정답 수 계산
    var totalCorrect = 0;
    var allAnswers = [];

    mod.sequence.forEach(function(seq) {
        var key = seq.type + '_set' + seq.setNum;
        var result = mod.answers[key];
        if (result && result.answers) {
            result.answers.forEach(function(a) {
                allAnswers.push(a);
                if (a.isCorrect) totalCorrect++;
            });
        }
    });

    console.log('📊 총 정답:', totalCorrect, '/', mod.totalQuestions);

    // 레벨 계산
    var level = _calculateListeningLevel(totalCorrect);
    console.log('📊 레벨:', level);

    // V3 JSON 구조 생성
    var recordJson = {
        totalQuestions: mod.totalQuestions,
        totalCorrect: totalCorrect,
        level: level,
        sets: mod.answers,
        completedAt: new Date().toISOString()
    };

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
                // 연습코스: 자동 재시도 → 최종 실패 시 보고 팝업 (SaveGuard)
                var saveOk = await SaveGuard.attempt(function() {
                    return mod.isRetake
                        ? upsertCurrentRecordPractice(user.id, 'listening', mod.moduleNum, pNum, recordJson)
                        : upsertInitialRecordPractice(user.id, 'listening', mod.moduleNum, pNum, recordJson, {
                            initial_level: level
                        });
                });
                if (!saveOk) {
                    _hideSubmitLoading();
                    SaveGuard.showFailurePopup({
                        sectionType: 'listening',
                        moduleNumber: mod.moduleNum,
                        practiceNumber: pNum,
                        taskLabel: '리스닝 Module ' + mod.moduleNum + ' (P' + pNum + (mod.isRetake ? ', 다시풀기' : '') + ')',
                        record: recordJson,
                        onDone: function() {
                            // 모듈 종료는 backToTaskDashboard → cleanupListeningModule 한 곳에서만 수행
                            backToTaskDashboard();
                        }
                    });
                    return;
                }
            } else if (mod.isRetake) {
                await upsertCurrentRecord(user.id, 'listening', mod.moduleNum, week, day, recordJson);
                console.log('💾 current_record 저장 완료');
            } else {
                await upsertInitialRecord(user.id, 'listening', mod.moduleNum, week, day, recordJson, {
                    initial_level: level
                });
                console.log('💾 initial_record 저장 완료');
            }

            // ✅ 저장 성공 → 대시보드 복귀
            // (모듈 종료·오디오 해제는 backToTaskDashboard → cleanupListeningModule 한 곳에서만 수행)
            _hideSubmitLoading();
            backToTaskDashboard();

        } catch (e) {
            // ❌ 저장 실패 → 로딩 닫고 문제 화면 유지, 답안 보존 (Submit 버튼 재활성)
            console.error('❌ DB 저장 실패:', e);
            _hideSubmitLoading();
            _unlockListeningNavButtonsSoon();
            alert('저장에 실패했습니다. 인터넷 연결을 확인하고 다시 Submit 버튼을 눌러주세요.');
        }
    } else {
        console.log('📊 [개발모드] DB 저장 생략');
        _hideSubmitLoading();
        backToTaskDashboard();
    }
}

// ============================================================
// 10. 레벨 변환표 (Listening, 총 32문제)
// ============================================================

function _calculateListeningLevel(correctCount) {
    if (correctCount >= 30) return 6.0;
    if (correctCount >= 28) return 5.5;
    if (correctCount >= 25) return 5.0;
    if (correctCount >= 22) return 4.5;
    if (correctCount >= 19) return 4.0;
    if (correctCount >= 16) return 3.5;
    if (correctCount >= 12) return 3.0;
    if (correctCount >= 9)  return 2.5;
    if (correctCount >= 6)  return 2.0;
    if (correctCount >= 3)  return 1.5;
    return 1.0;
}

// ============================================================
// 11. 문제별 타이머 (리스닝 전용)
// ============================================================

var _listeningTimerState = {
    interval: null,
    remaining: 0
};

/**
 * 문제별 타이머 시작
 * @param {number} setIndex - 현재 세트 인덱스
 * @param {number} seconds - 제한 시간 (초)
 */
function _startListeningQuestionTimer(setIndex, seconds) {
    // 이전 타이머 반드시 멈추고 시작
    _stopListeningQuestionTimer();

    var mod = window.currentListeningModule;
    if (!mod) return;

    _listeningTimerState.remaining = seconds;
    _updateListeningTimerDisplay();

    // 타이머 시작 = 답변 단계 진입 → 버튼 상태 갱신 (오디오 중 숨겼던 Next/Submit 복원)
    _updateListeningButtons();

    console.log('⏱️ 문제별 타이머 시작:', seconds + '초');

    _listeningTimerState.interval = setInterval(function() {
        _listeningTimerState.remaining--;
        _updateListeningTimerDisplay();

        if (_listeningTimerState.remaining <= 0) {
            _stopListeningQuestionTimer();

            // 시간 만료 → 컴포넌트에 알림 (보기 잠금)
            var comp = mod.components[mod.currentIndex];
            if (comp && typeof comp.onQuestionTimeout === 'function') {
                comp.onQuestionTimeout();
            }
            console.log('⏰ 시간 만료 → 자동 이동');

            // 실전 동일: 만료되면 시스템이 다음으로 넘김 (Next 클릭과 같은 문 사용)
            _autoAdvanceAfterTimeout();
        }
    }, 1000);
}

// ============================================================
// 11-1. 시간 만료 자동 이동 (스피너 1초 → 기존 전이 경로)
// ============================================================

var _listeningAutoAdvance = { timer: null };
var LISTENING_AUTO_ADVANCE_SPINNER_MS = 1000;

/**
 * 시간 만료 → 스피너 1초 → 다음 문제/세트 (마지막 문제는 자동 제출)
 * 새 이동 경로를 만들지 않고 Next/Submit과 같은 문(_listeningModuleNext/_listeningModuleSubmit)을 쓴다
 */
function _autoAdvanceAfterTimeout() {
    var mod = window.currentListeningModule;
    if (!mod) return;
    if (_listeningNavLock.active) return;   // 수동 전이가 이미 진행 중이면 중복 이동 방지

    var seq = mod.sequence[mod.currentIndex];
    var comp = mod.components[mod.currentIndex];
    var isVeryLast = (mod.currentIndex === mod.sequence.length - 1) &&
                     comp && comp.currentQuestion >= seq.questionsPerSet - 1;

    // 스피너 동안 전이 버튼 물리 잠금 + 스피너 표시
    _lockListeningNavButtons();
    _showListeningAutoAdvanceSpinner(isVeryLast ? '답안을 제출합니다' : '다음 문제로 이동합니다');

    _listeningAutoAdvance.timer = setTimeout(async function() {
        _listeningAutoAdvance.timer = null;
        _hideListeningAutoAdvanceSpinner();

        var m = window.currentListeningModule;
        if (!m) return;   // 스피너 동안 뒤로가기로 이탈한 경우

        if (isVeryLast) {
            _listeningModuleSubmit();
        } else {
            // _listeningModuleNext의 잠금은 idempotent — 같은 문을 그대로 사용
            await _listeningModuleNext();
        }
    }, LISTENING_AUTO_ADVANCE_SPINNER_MS);
}

function _showListeningAutoAdvanceSpinner(text) {
    var overlay = document.getElementById('listeningAutoAdvanceOverlay');
    if (!overlay) return;
    var label = overlay.querySelector('.laa-text');
    if (label) label.textContent = text || '다음 문제로 이동합니다';
    overlay.style.display = 'flex';
}

function _hideListeningAutoAdvanceSpinner() {
    var overlay = document.getElementById('listeningAutoAdvanceOverlay');
    if (overlay) overlay.style.display = 'none';
}

/**
 * 타이머 멈춤
 */
function _stopListeningQuestionTimer() {
    if (_listeningTimerState.interval) {
        clearInterval(_listeningTimerState.interval);
        _listeningTimerState.interval = null;
    }
}

/**
 * 타이머 화면 표시 업데이트
 */
function _updateListeningTimerDisplay() {
    var mod = window.currentListeningModule;
    if (!mod) return;

    var sec = Math.max(0, _listeningTimerState.remaining);
    var min = Math.floor(sec / 60);
    var s = sec % 60;
    var text = min + ':' + (s < 10 ? '0' : '') + s;

    // 현재 유형에 맞는 타이머 요소 업데이트
    var timerIds = {
        'response': 'responseTimer',
        'conver': 'converTimer',
        'announcement': 'announcementTimer',
        'lecture': 'lectureTimer'
    };

    var seq = mod.sequence[mod.currentIndex];
    var el = document.getElementById(timerIds[seq.type]);
    if (el) {
        el.textContent = text;
    }
}

// ============================================================
// 12. 리스닝 모듈 정리 함수
// ============================================================

/**
 * 리스닝 모듈 전체 정리
 * - 현재 컴포넌트 cleanup (오디오 정지 + 폐쇄)
 * - 타이머 정지
 * - 모듈 상태 초기화
 */
function cleanupListeningModule() {
    console.log('🧹 [cleanupListeningModule] 리스닝 모듈 정리 시작');

    var mod = window.currentListeningModule;
    if (!mod) {
        console.log('🧹 리스닝 모듈 없음 — 정리 불필요');
        return;
    }

    // 1. 오디오 완전 정리 (재생 + 대기 타이머 + AudioContext 해제)
    if (mod.audio) {
        mod.audio.destroy();
        mod.audio = null;
        console.log('✅ 오디오 서비스 정리 완료');
    }

    // 2. 현재 컴포넌트 cleanup
    var comp = mod.components[mod.currentIndex];
    if (comp && typeof comp.cleanup === 'function') {
        comp.cleanup();
        console.log('✅ 컴포넌트 cleanup 완료');
    }

    // 3. 타이머 정지 + 전이 잠금 해제 + 자동 이동 스피너 정리
    _stopListeningQuestionTimer();
    if (_listeningNavLock.timer) {
        clearTimeout(_listeningNavLock.timer);
        _listeningNavLock.timer = null;
    }
    _listeningNavLock.active = false;
    _setListeningNavButtonsDisabled(false);
    if (_listeningAutoAdvance.timer) {
        clearTimeout(_listeningAutoAdvance.timer);
        _listeningAutoAdvance.timer = null;
    }
    _hideListeningAutoAdvanceSpinner();
    console.log('✅ 타이머 정지 완료');

    // 4. 모듈 상태 초기화
    window.currentListeningModule = null;
    console.log('✅ [cleanupListeningModule] 리스닝 모듈 정리 완료');
}

// ============================================================
// 13. 로딩 함수 (리딩과 공유 — submitLoadingOverlay)
// ============================================================

// _showSubmitLoading, _hideSubmitLoading은 reading-module-controller.js에서 이미 정의됨
// 리스닝에서도 동일한 오버레이 사용

// ============================================================
// 로드 확인
// ============================================================

console.log('✅ listening-module-controller.js loaded');
