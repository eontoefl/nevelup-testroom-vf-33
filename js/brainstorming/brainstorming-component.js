/**
 * brainstorming-component.js
 * 브레인스토밍 컴포넌트
 *
 * 플로우:
 *   인트로(나레이션) → [주제 표시 + 토픽 오디오] → 준비 15초 → 응답 45초 → 완료 확인 → 반복
 *   Day 1개 = 주제 2개
 */

// ============================================================
// 오디오 URL
// ============================================================
var BRAINSTORM_AUDIO = {
    introNarration: 'https://eontoefl.github.io/toefl-audio/australia/audio/intro_audio/indspk_brainstorm_intro.mp3',
    prepareBeep: 'https://eontoefl.github.io/toefl-audio/australia/audio/fixed_audio/prepare_beep.mp3',
    speakBeep: 'https://eontoefl.github.io/toefl-audio/australia/audio/fixed_audio/begin_beep.mp3'
};

// ============================================================
// 전역 상태
// ============================================================
window.currentBrainstormModule = null;

// 메모 최소 글자 수 (회의 확정: 20자)
var BS_MEMO_MIN = 20;

// 준비/응답 시간(초)
var BS_PREP_SEC = 15;
var BS_SPEAK_SEC = 45;

// ============================================================
// 진입점
// ============================================================

async function startBrainstormModule(dayNumber, week, day) {
    console.log('\n============================');
    console.log('Brainstorming Day ' + dayNumber + ' 시작 (W' + week + ' ' + day + ')');
    console.log('============================\n');

    var audioPlayer = new AudioPlayer();

    // 신규 수집 코호트 여부 (기준일 이후 시작자만 메모 수집)
    var collect = (typeof isAusCollectEnabled === 'function') && isAusCollectEnabled();

    // 마감 판정을 위해 스케줄 정보 세팅 (리딩/리스닝과 동일 패턴)
    if (week && day) {
        window.currentTest = window.currentTest || {};
        window.currentTest.currentWeek = week;
        window.currentTest.currentDay = day;
    }

    window.currentBrainstormModule = {
        dayNumber: dayNumber,
        week: week || null,
        day: day || null,
        collect: collect,
        memos: {},            // { topicIndex: '메모내용' }
        requiredMemos: 2,     // Day 1개 = 주제 2개 → 메모 2개
        certified: false,
        audioPlayer: audioPlayer,
        data: null,
        currentTopicIndex: 0,
        timer: null,
        _destroyed: false
    };

    // 헤더 타이틀 업데이트
    var titleEl = document.getElementById('brainstormTitle');
    if (titleEl) titleEl.textContent = 'Brainstorming Day ' + dayNumber;

    showScreen('brainstormScreen');
    _showBrainstormIntroScreen();

    try {
        var result = await loadBrainstormData();
        if (!result) throw new Error('데이터 없음');
        window.currentBrainstormModule.data = result;
        console.log('[Brainstorm] 데이터 로드 완료 (collect=' + collect + ')');
    } catch (e) {
        console.error('[Brainstorm] 데이터 로드 실패:', e);
        alert('데이터를 불러올 수 없습니다.');
        backToAusTaskSelect();
        return;
    }

    // 기존 메모/인증 불러오기 (수집 코호트 + 실제 로그인 학생만)
    if (collect) {
        await _loadExistingBrainstormMemos();
    }

    _playIntroNarration();
}

/**
 * 이미 작성한 메모/인증 상태를 DB에서 복원
 */
async function _loadExistingBrainstormMemos() {
    var mod = window.currentBrainstormModule;
    if (!mod) return;
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user || !user.id || user.id === 'dev-user-001') return;
    if (typeof getStudyResultV3 !== 'function') return;

    try {
        var rec = await getStudyResultV3(user.id, 'brainstorming', mod.dayNumber, mod.week, mod.day);
        if (rec) {
            if (rec.current_record && rec.current_record.memos) {
                mod.memos = rec.current_record.memos || {};
            }
            if (rec.initial_record != null) {
                mod.certified = true;
            }
            console.log('[Brainstorm] 기존 메모 복원:', Object.keys(mod.memos).length + '개, 인증=' + mod.certified);
        }
    } catch (e) {
        console.warn('[Brainstorm] 기존 메모 복원 실패:', e);
    }
}

// ============================================================
// 인트로 화면
// ============================================================

function _showBrainstormIntroScreen() {
    var container = document.getElementById('brainstormContent');

    container.innerHTML =
        '<div class="bs-intro-screen">' +
            '<div class="bs-intro-card">' +
                '<div class="bs-intro-icon">' +
                    '<i class="fas fa-brain"></i>' +
                '</div>' +
                '<h1 class="bs-intro-title">Brainstorming</h1>' +
                '<div class="bs-intro-text">' +
                    '<p>In this question, you will be asked to talk about a familiar topic.</p>' +
                    '<p>After you hear the question, you will have <strong>15 seconds</strong> to prepare your response, and <strong>45 seconds</strong> to speak.</p>' +
                '</div>' +
                '<div class="bs-intro-note">' +
                    'Please listen carefully.' +
                '</div>' +
                ((window.currentBrainstormModule && window.currentBrainstormModule.collect) ?
                    '<div style="margin-top:16px;background:#f4f3fb;border:1px solid #e3e0f3;border-radius:12px;padding:14px 16px;font-size:13.5px;color:#5B4A9E;line-height:1.6;text-align:left;">' +
                        '📝 <strong>말하기 후 주제마다 메모를 작성하면 오늘 과제가 인증됩니다.</strong><br>주제 2개 = 메모 2개를 작성해 주세요.' +
                    '</div>' : '') +
            '</div>' +
        '</div>';

    var continueBtn = document.getElementById('brainstormContinueBtn');
    continueBtn.style.display = 'inline-block';
    continueBtn.disabled = false;
    continueBtn.style.opacity = '1';
    continueBtn.style.cursor = 'pointer';
    continueBtn.onclick = function() {
        _startTopicPhase();
    };
}

function _playIntroNarration() {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    mod.audioPlayer.play(BRAINSTORM_AUDIO.introNarration, function() {
        if (mod._destroyed) return;
        _enableContinueBtn();
    });
}

function _enableContinueBtn() {
    var btn = document.getElementById('brainstormContinueBtn');
    if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    }
}

// ============================================================
// 주제 화면
// ============================================================

function _startTopicPhase() {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    var dayIndex = mod.dayNumber - 1;
    var dayData = mod.data.days[dayIndex];
    if (!dayData) {
        alert('Day ' + mod.dayNumber + ' 데이터가 없습니다.');
        backToAusTaskSelect();
        return;
    }

    mod.currentTopicIndex = 0;
    _showTopicScreen(dayData, 0);
}

function _showTopicScreen(dayData, topicIndex) {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    var topic = dayData.topics[topicIndex];
    var label = 'Brainstorming Day ' + mod.dayNumber + '-' + (topicIndex + 1);

    var continueBtn = document.getElementById('brainstormContinueBtn');
    continueBtn.style.display = 'none';

    var container = document.getElementById('brainstormContent');
    container.innerHTML =
        '<div class="bs-topic-wrap">' +
            '<div class="bs-topic-label">' + label + '</div>' +
            '<div class="bs-topic-text">' + _escapeHtml(topic.text) + '</div>' +
            '<div class="bs-timer-section" id="bsTimerSection" style="display:none;">' +
                '<div class="bs-timer-display">' +
                    '<div class="bs-timer-phase-label" id="bsPhaseLabel">PREPARATION TIME</div>' +
                    '<div class="bs-timer-content">' +
                        '<div class="bs-timer-wrapper">' +
                            '<div class="bs-progress-circle">' +
                                '<svg width="50" height="50" viewBox="0 0 50 50">' +
                                    '<circle class="bs-progress-circle-bg" cx="25" cy="25" r="20"></circle>' +
                                    '<circle id="bsProgressCircle" class="bs-progress-circle-fill" cx="25" cy="25" r="20" ' +
                                            'stroke-dasharray="125.6" stroke-dashoffset="125.6"></circle>' +
                                '</svg>' +
                                '<svg class="bs-mic-icon" fill="currentColor" viewBox="0 0 20 20">' +
                                    '<path d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"/>' +
                                '</svg>' +
                            '</div>' +
                            '<span id="bsCountdown" class="bs-timer-text">00:15</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

    _playTopicAudio(dayData, topicIndex, topic);
}

function _playTopicAudio(dayData, topicIndex, topic) {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    var url = topic.audioUrl;
    if (!url || url.trim() === '') {
        console.warn('[Brainstorm] 토픽 오디오 없음 — 2초 후 준비 단계 진행');
        setTimeout(function() {
            if (mod._destroyed) return;
            _startPreparePhase(dayData, topicIndex);
        }, 2000);
        return;
    }

    mod.audioPlayer.play(url, function() {
        if (mod._destroyed) return;
        _startPreparePhase(dayData, topicIndex);
    });
}

// ============================================================
// 준비 단계 (15초)
// ============================================================

function _startPreparePhase(dayData, topicIndex) {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    var timerSection = document.getElementById('bsTimerSection');
    if (timerSection) timerSection.style.display = 'block';

    var phaseLabel = document.getElementById('bsPhaseLabel');
    if (phaseLabel) phaseLabel.textContent = 'PREPARATION TIME';

    var countdownEl = document.getElementById('bsCountdown');
    if (countdownEl) countdownEl.textContent = '00:15';

    mod.audioPlayer.play(BRAINSTORM_AUDIO.prepareBeep, function() {
        if (mod._destroyed) return;
        _runCountdown(BS_PREP_SEC, function() {
            _startSpeakPhase(dayData, topicIndex);
        });
    });
}

// ============================================================
// 응답 단계 (45초)
// ============================================================

function _startSpeakPhase(dayData, topicIndex) {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    var phaseLabel = document.getElementById('bsPhaseLabel');
    if (phaseLabel) phaseLabel.textContent = 'RESPONSE TIME';

    var countdownEl = document.getElementById('bsCountdown');
    if (countdownEl) countdownEl.textContent = '00:45';

    var circle = document.getElementById('bsProgressCircle');
    if (circle) circle.style.strokeDashoffset = '125.6';

    mod.audioPlayer.play(BRAINSTORM_AUDIO.speakBeep, function() {
        if (mod._destroyed) return;
        _runCountdown(BS_SPEAK_SEC, function() {
            _onTopicComplete(dayData, topicIndex);
        });
    });
}

// ============================================================
// 카운트다운 공통
// ============================================================

function _runCountdown(seconds, onDone) {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    var timeLeft = seconds;
    var totalTime = seconds;
    var countdownEl = document.getElementById('bsCountdown');
    var progressCircle = document.getElementById('bsProgressCircle');
    var circumference = 2 * Math.PI * 20; // r=20

    if (countdownEl) countdownEl.textContent = _formatTime(timeLeft);
    if (progressCircle) {
        progressCircle.style.strokeDasharray = circumference;
        progressCircle.style.strokeDashoffset = circumference;
    }

    mod.timer = setInterval(function() {
        timeLeft--;
        if (countdownEl) countdownEl.textContent = _formatTime(timeLeft);

        if (progressCircle) {
            var elapsed = totalTime - timeLeft;
            var offset = circumference - (elapsed / totalTime) * circumference;
            progressCircle.style.strokeDashoffset = offset;
        }

        if (timeLeft <= 0) {
            clearInterval(mod.timer);
            mod.timer = null;
            if (onDone) onDone();
        }
    }, 1000);
}

// ============================================================
// 주제 완료
// ============================================================

function _onTopicComplete(dayData, topicIndex) {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    mod.requiredMemos = dayData.topics.length;

    if (mod.collect) {
        // 수집 코호트: 말하기 직후 메모 작성 화면
        _showMemoScreen(dayData, topicIndex);
    } else {
        _afterTopic(dayData, topicIndex);
    }
}

// 다음 주제 또는 Day 완료로 진행
function _afterTopic(dayData, topicIndex) {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    var nextTopicIndex = topicIndex + 1;
    if (nextTopicIndex < dayData.topics.length) {
        if (mod.collect) {
            // 메모 화면이 인터스티셜 역할 → 바로 다음 주제로
            mod.currentTopicIndex = nextTopicIndex;
            _showTopicScreen(dayData, nextTopicIndex);
        } else {
            var currentLabel = mod.dayNumber + '-' + (topicIndex + 1);
            var nextLabel = mod.dayNumber + '-' + (nextTopicIndex + 1);
            _showCompletionConfirm(currentLabel, nextLabel, function() {
                mod.currentTopicIndex = nextTopicIndex;
                _showTopicScreen(dayData, nextTopicIndex);
            });
        }
    } else {
        _showDayComplete();
    }
}

// ============================================================
// 메모 작성 화면 (수집 코호트)
// ============================================================

function _showMemoScreen(dayData, topicIndex) {
    var mod = window.currentBrainstormModule;
    if (!mod || mod._destroyed) return;

    var topic = dayData.topics[topicIndex];
    var label = 'Day ' + mod.dayNumber + '-' + (topicIndex + 1);
    var existing = (mod.memos && mod.memos[topicIndex]) ? mod.memos[topicIndex] : '';

    var continueBtn = document.getElementById('brainstormContinueBtn');
    if (continueBtn) continueBtn.style.display = 'none';

    var total = dayData.topics.length;
    var container = document.getElementById('brainstormContent');
    container.innerHTML =
        '<div class="bs-memo-wrap" style="max-width:680px;margin:0 auto;padding:28px 18px;">' +
            '<div style="font-size:13px;font-weight:700;color:#5B4A9E;letter-spacing:0.5px;margin-bottom:6px;">' + label + ' · 메모</div>' +
            '<div style="font-size:13px;color:#16a34a;font-weight:600;margin-bottom:14px;">✍️ 오늘 과제 인증까지 — 메모 ' + (topicIndex + 1) + ' / ' + total + '개째</div>' +
            '<div style="background:#f4f3fb;border-radius:12px;padding:16px 18px;font-size:15px;line-height:1.6;color:#2d2d2d;margin-bottom:18px;">' + _escapeHtml(topic.text) + '</div>' +
            '<p style="font-size:14px;color:#555;margin:0 0 10px;">방금 말한 내용을 메모로 정리하세요. <strong>(최소 ' + BS_MEMO_MIN + '자)</strong></p>' +
            (existing ? '<div style="font-size:12.5px;color:#16a34a;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;margin:0 0 10px;">📝 이전에 저장한 메모예요 — 그대로 두거나 수정할 수 있어요.</div>' : '') +
            '<textarea id="bsMemoTextarea" placeholder="떠올린 아이디어를 자유롭게 적어보세요..." ' +
                'style="width:100%;min-height:160px;box-sizing:border-box;border:1.5px solid #ddd;border-radius:12px;padding:14px;font-size:15px;line-height:1.6;resize:vertical;font-family:inherit;">' + _escapeHtml(existing) + '</textarea>' +
            '<div style="text-align:right;font-size:13px;color:#999;margin:6px 2px 18px;"><span id="bsMemoCount">0</span>자</div>' +
            '<button id="bsMemoSaveBtn" style="width:100%;padding:14px;border-radius:10px;border:none;background:#5B4A9E;font-size:15px;font-weight:700;color:#fff;cursor:pointer;">저장하고 계속</button>' +
            '<div style="text-align:center;margin-top:14px;">' +
                '<button id="bsMemoSkipBtn" style="background:none;border:none;color:#9ca3af;font-size:13px;text-decoration:underline;cursor:pointer;padding:4px;">나중에 쓸게요</button>' +
            '</div>' +
            '<p style="font-size:12px;color:#aaa;text-align:center;line-height:1.6;margin:6px 2px 0;">지금 건너뛰면 이 주제는 미인증으로 남아요.<br>다시 들어와(말하기부터 다시 진행) 작성할 수 있어요.</p>' +
        '</div>';

    var ta = document.getElementById('bsMemoTextarea');
    var countEl = document.getElementById('bsMemoCount');
    var saveBtn = document.getElementById('bsMemoSaveBtn');
    var skipBtn = document.getElementById('bsMemoSkipBtn');

    function refresh() {
        var len = ta.value.trim().length;
        countEl.textContent = len;
        var ok = len >= BS_MEMO_MIN;
        saveBtn.disabled = !ok;
        saveBtn.style.opacity = ok ? '1' : '0.4';
        saveBtn.style.cursor = ok ? 'pointer' : 'not-allowed';
    }
    ta.addEventListener('input', refresh);
    refresh();
    setTimeout(function() { ta.focus(); }, 100);

    saveBtn.onclick = async function() {
        var text = ta.value.trim();
        if (text.length < BS_MEMO_MIN) return;
        saveBtn.disabled = true;
        saveBtn.textContent = '저장 중...';
        await _saveBrainstormMemo(topicIndex, text);
        _afterTopic(dayData, topicIndex);
    };
    skipBtn.onclick = function() {
        _showBsSkipConfirm(function() {
            _afterTopic(dayData, topicIndex);
        });
    };
}

// 건너뛰기 확인 팝업
function _showBsSkipConfirm(onConfirm) {
    var existing = document.getElementById('bsSkipConfirmOverlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'bsSkipConfirmOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99998;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
        '<div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:340px;width:88%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
            '<div style="font-size:32px;margin-bottom:10px;">📝</div>' +
            '<h3 style="margin:0 0 10px;font-size:16px;color:#1a1a1a;">메모를 건너뛸까요?</h3>' +
            '<p style="font-size:13.5px;color:#666;line-height:1.6;margin:0 0 20px;">건너뛰면 이 주제는 <strong style="color:#ef4444;">미인증</strong>으로 남아요.<br>나중에 다시 들어와 작성할 수 있어요.</p>' +
            '<div style="display:flex;gap:10px;">' +
                '<button id="bsSkipCancelBtn" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid #ddd;background:#fff;font-size:14px;font-weight:600;color:#666;cursor:pointer;">돌아가기</button>' +
                '<button id="bsSkipConfirmBtn" style="flex:1;padding:12px;border-radius:10px;border:none;background:#9ca3af;font-size:14px;font-weight:600;color:#fff;cursor:pointer;">건너뛰기</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(overlay);

    document.getElementById('bsSkipCancelBtn').onclick = function() { overlay.remove(); };
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.getElementById('bsSkipConfirmBtn').onclick = function() {
        overlay.remove();
        if (onConfirm) onConfirm();
    };
}

/**
 * 메모 저장: 본문은 current_record에 보관(수정 자유),
 * 메모 2개 모두 채우고 마감 전이면 initial_record로 인증.
 */
async function _saveBrainstormMemo(topicIndex, text) {
    var mod = window.currentBrainstormModule;
    if (!mod) return;
    mod.memos = mod.memos || {};
    mod.memos[topicIndex] = text;

    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user || !user.id || user.id === 'dev-user-001') {
        console.log('[Brainstorm] dev/비로그인 — 메모 로컬 보관만');
        return;
    }
    if (typeof upsertCurrentRecord !== 'function') return;

    try {
        await upsertCurrentRecord(user.id, 'brainstorming', mod.dayNumber, mod.week, mod.day, { memos: mod.memos });

        var count = 0;
        Object.keys(mod.memos).forEach(function(k) {
            if ((mod.memos[k] || '').trim().length >= BS_MEMO_MIN) count++;
        });

        var passed = (typeof isTaskDeadlinePassed === 'function') ? isTaskDeadlinePassed() : false;

        if (count >= (mod.requiredMemos || 2) && !passed && !mod.certified) {
            if (typeof upsertInitialRecord === 'function') {
                await upsertInitialRecord(
                    user.id, 'brainstorming', mod.dayNumber, mod.week, mod.day,
                    { memo_count: count, completedAt: new Date().toISOString() },
                    { locked_auth_rate: 100 }
                );
                mod.certified = true;
                console.log('🎉 [Brainstorm] 인증 완료 (메모 ' + count + '개)');
            }
        }

        if (mod.certified && typeof ProgressTracker !== 'undefined' && ProgressTracker.markCompleted) {
            ProgressTracker.markCompleted('brainstorming', mod.dayNumber);
        }
    } catch (e) {
        console.error('[Brainstorm] 메모 저장 실패:', e);
    }
}

function _showCompletionConfirm(currentLabel, nextLabel, onConfirm) {
    var mod = window.currentBrainstormModule;
    var container = document.getElementById('brainstormContent');
    container.innerHTML =
        '<div class="bs-complete-screen">' +
            '<div class="bs-complete-card">' +
                '<div class="bs-complete-check">' +
                    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#48bb78" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                        '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
                        '<polyline points="22 4 12 14.01 9 11.01"/>' +
                    '</svg>' +
                '</div>' +
                '<h2 class="bs-complete-title">Day ' + currentLabel + ' 완료</h2>' +
                '<p class="bs-complete-desc">Day ' + nextLabel + ' 로 넘어가시겠습니까?</p>' +
                '<button class="bs-complete-btn" id="bsConfirmBtn">다음으로</button>' +
            '</div>' +
        '</div>';

    document.getElementById('bsConfirmBtn').onclick = function() {
        if (onConfirm) onConfirm();
    };
}

function _showDayComplete() {
    var mod = window.currentBrainstormModule;
    var container = document.getElementById('brainstormContent');

    var statusHtml;
    if (!mod.collect) {
        statusHtml = '<p class="bs-complete-desc">오늘의 브레인스토밍을 모두 마쳤습니다.</p>';
    } else {
        var count = 0;
        Object.keys(mod.memos || {}).forEach(function(k) {
            if ((mod.memos[k] || '').trim().length >= BS_MEMO_MIN) count++;
        });
        var total = mod.requiredMemos || 2;
        var passed = (typeof isTaskDeadlinePassed === 'function') ? isTaskDeadlinePassed() : false;
        var comeBack = '<p style="font-size:13px;color:#888;margin-top:10px;">다시 들어오면 말하기를 한 번 더 진행한 뒤 메모를 작성할 수 있어요.</p>';

        if (mod.certified) {
            // [1] 인증 완료
            statusHtml = '<p class="bs-complete-desc" style="color:#16a34a;font-weight:600;">🎉 오늘 브레인스토밍 인증 완료! 메모 ' + count + '개를 모두 작성했어요.</p>';
        } else if (!passed) {
            if (count === 0) {
                // [2] 마감 전 · 메모 0개
                statusHtml = '<p class="bs-complete-desc">아직 메모를 작성하지 않았어요. 주제 ' + total + '개에 각각 메모(' + BS_MEMO_MIN + '자 이상)를 쓰면 인증됩니다.</p>' + comeBack;
            } else if (count < total) {
                // [3] 마감 전 · 메모 1개
                statusHtml = '<p class="bs-complete-desc">메모 <strong>' + count + '/' + total + '개</strong> 작성됨 — 나머지 ' + (total - count) + '개만 더 채우면 인증돼요!</p>' + comeBack;
            } else {
                // [4] 마감 전 · 메모 2개인데 미인증 (저장 오류 등 드문 경우)
                statusHtml = '<p class="bs-complete-desc">메모 ' + count + '개를 작성했지만 인증 처리가 끝나지 않았어요. 잠시 후 다시 시도해 주세요.</p>';
            }
        } else {
            // 마감 후
            if (count === 0) {
                // [5] 마감 후 · 메모 0개
                statusHtml = '<p class="bs-complete-desc">⚠️ 마감이 지났습니다. 메모는 복습용으로 저장되지만 인증에는 반영되지 않아요.</p>';
            } else if (count < total) {
                // [6] 마감 후 · 메모 1개
                statusHtml = '<p class="bs-complete-desc">메모 ' + count + '/' + total + '개 작성됨. ⚠️ 마감이 지나 인증에는 반영되지 않지만 메모는 저장됩니다.</p>';
            } else {
                // [7] 마감 후 · 메모 2개
                statusHtml = '<p class="bs-complete-desc">메모 ' + count + '개를 모두 작성했어요. ⚠️ 다만 마감이 지나 인증에는 반영되지 않습니다. (메모는 저장됨)</p>';
            }
        }
    }

    container.innerHTML =
        '<div class="bs-complete-screen">' +
            '<div class="bs-complete-card">' +
                '<div class="bs-complete-check">' +
                    '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#48bb78" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                        '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>' +
                        '<polyline points="22 4 12 14.01 9 11.01"/>' +
                    '</svg>' +
                '</div>' +
                '<h2 class="bs-complete-title">Day ' + mod.dayNumber + ' 완료!</h2>' +
                statusHtml +
                '<button class="bs-complete-btn" id="bsDayDoneBtn">확인</button>' +
            '</div>' +
        '</div>';

    document.getElementById('bsDayDoneBtn').onclick = function() {
        cleanupBrainstormModule();
        backToAusTaskSelect();
    };
}

// ============================================================
// 뒤로가기 / 정리
// ============================================================

function backToAusTaskSelect() {
    showScreen('ausTaskSelectScreen');
}

function cleanupBrainstormModule() {
    var mod = window.currentBrainstormModule;
    if (!mod) return;

    mod._destroyed = true;

    if (mod.timer) {
        clearInterval(mod.timer);
        mod.timer = null;
    }

    if (mod.audioPlayer) {
        mod.audioPlayer.stop();
        mod.audioPlayer.destroy();
    }

    window.currentBrainstormModule = null;
    console.log('[Brainstorm] cleanup 완료');
}

// ============================================================
// 유틸
// ============================================================

function _formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
}

function _escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================
// Day 번호 추출 유틸 (main.js에서 사용)
// ============================================================

function _getAusBrainstormDay(taskName) {
    var match = taskName.match(/브레인스토밍\s*Day\s*(\d+)/i);
    return match ? parseInt(match[1]) : null;
}

window.startBrainstormModule = startBrainstormModule;
window.cleanupBrainstormModule = cleanupBrainstormModule;
window._getAusBrainstormDay = _getAusBrainstormDay;

console.log('[Brainstorming] brainstorming-component.js 로드 완료');
