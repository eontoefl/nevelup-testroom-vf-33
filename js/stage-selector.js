/**
 * ================================================
 * stage-selector.js (V2 플로우)
 * 과제 버튼 클릭 → 4개 단계 선택 화면 표시
 * ================================================
 * 
 * 기존 FlowController를 대체.
 * 1차풀이 / 2차풀이 / 채점결과 / 해설보기를 독립 버튼으로 분리.
 */

const StageSelector = {
    // 현재 선택된 과제 정보
    sectionType: null,   // 'reading', 'listening', 'writing', 'speaking'
    moduleNumber: null,  // 1, 2, 3, ...
    _isRetryMode: false, // ★ 다시 풀기 모드 여부 (안내 문구 분기용)

    /**
     * 단계 선택 화면 표시
     * task-router.js에서 호출됨
     */
    async show(sectionType, moduleNumber) {
        // 1. 메모리 초기화
        this.sectionType = sectionType;
        this.moduleNumber = moduleNumber;
        this.firstAttemptResult = null;
        this.secondAttemptResult = null;

        // 2. UI 초기화 (화면을 빈 상태로 리셋)
        this._resetUI(sectionType, moduleNumber);

        // 3. DB에서 해당 모듈 데이터 읽기 → 있으면 채우기
        await this._loadFromDB();

        console.log(`✅ [StageSelector] ${sectionType} Module ${moduleNumber} 준비 완료`);
    },

    _resetUI(sectionType, moduleNumber) {
        // 제목
        var sectionLabel = { 'reading': '리딩', 'listening': '리스닝', 'writing': '라이팅', 'speaking': '스피킹' }[sectionType] || sectionType;
        var title = sectionLabel + ' 모듈 ' + moduleNumber;

        var titleEl = document.getElementById('stageSelectTitle');
        if (titleEl) titleEl.textContent = title;
        var moduleTitleEl = document.getElementById('stageModuleTitle');
        if (moduleTitleEl) moduleTitleEl.textContent = title;

        // 화면 전환
        document.querySelectorAll('.screen').forEach(function(s) { s.style.display = 'none'; });
        var screen = document.getElementById('stageSelectScreen');
        if (screen) screen.style.display = 'block';

        // 대시보드 점수/레벨 비우기
        ['1st', '2nd'].forEach(function(suffix) {
            var scoreEl = document.getElementById('stageScore' + suffix);
            if (scoreEl) scoreEl.innerHTML = '-';
            var levelEl = document.getElementById('stageLevel' + suffix);
            if (levelEl) levelEl.textContent = '-';
            var detailEl = document.getElementById('stageDetail' + suffix);
            if (detailEl) detailEl.innerHTML = '';
        });

        // ★ 라이팅: 대시보드 오른쪽 영역을 라이팅 전용 형태로 변경
        if (sectionType === 'writing') {
            this._resetWritingDashboard();
        }
        // ★ 스피킹: 대시보드 오른쪽 영역을 스피킹 전용 형태로 변경
        if (sectionType === 'speaking') {
            this._resetSpeakingDashboard();
        }

        // 완료 상태 비우기
        var status1st = document.getElementById('stage1stStatus');
        if (status1st) { status1st.textContent = '미완료'; status1st.classList.remove('stage-status-done'); }
        var status2nd = document.getElementById('stage2ndStatus');
        if (status2nd) { status2nd.textContent = '미완료'; status2nd.classList.remove('stage-status-done'); }
        var noteStatus = document.getElementById('stageErrorNoteStatus');
        if (noteStatus) { noteStatus.textContent = '제출 후 확인 가능'; noteStatus.style.color = ''; }
    },

    /**
     * 라이팅 대시보드 초기화 (점수+레벨 → 단어배열 점수+제출 상태 형태로 전환)
     */
    /**
     * 스피킹 대시보드 초기화 (점수+레벨 → 따라말하기/인터뷰 완료 상태 형태로 전환)
     */
    _resetSpeakingDashboard() {
        ['1st', '2nd'].forEach(function(suffix) {
            var scoreEl = document.getElementById('stageScore' + suffix);
            if (scoreEl) {
                scoreEl.innerHTML = '<span style="font-size:18px;">-</span>';
            }
            var levelEl = document.getElementById('stageLevel' + suffix);
            if (levelEl) {
                levelEl.textContent = '';  // 스피킹은 레벨 없음
            }
            var detailEl = document.getElementById('stageDetail' + suffix);
            if (detailEl) {
                detailEl.innerHTML = '<div style="font-size:11px; color:var(--text-secondary); text-align:center;">풀이 후 표시됩니다</div>';
            }
        });
    },

    _resetWritingDashboard() {
        ['1st', '2nd'].forEach(function(suffix) {
            var scoreEl = document.getElementById('stageScore' + suffix);
            if (scoreEl) {
                scoreEl.innerHTML = '--<span style="font-size:14px; font-weight:400; color:var(--text-secondary);">/10</span>';
            }
            var levelEl = document.getElementById('stageLevel' + suffix);
            if (levelEl) {
                levelEl.textContent = '';  // 라이팅은 레벨 없음
            }
            var detailEl = document.getElementById('stageDetail' + suffix);
            if (detailEl) {
                detailEl.innerHTML = '<div style="font-size:11px; color:var(--text-secondary); text-align:center;">풀이 후 표시됩니다</div>';
            }
        });
    },

    async _loadFromDB() {
        if (!window.StudySave) return;

        var saved = await StudySave.loadSavedResults();
        if (!saved) return;

        // 1차 결과
        if (saved.firstResult) {
            this.firstAttemptResult = saved.firstResult;
            updateStageDashboard(saved.firstResult, '1st');
            var status1st = document.getElementById('stage1stStatus');
            if (status1st) { status1st.textContent = '✅ 완료'; status1st.classList.add('stage-status-done'); }
        }

        // 2차 결과
        if (saved.secondResult) {
            this.secondAttemptResult = saved.secondResult;
            updateStageDashboard(saved.secondResult, '2nd');
            var status2nd = document.getElementById('stage2ndStatus');
            if (status2nd) { status2nd.textContent = '✅ 완료'; status2nd.classList.add('stage-status-done'); }
        }

        // 오답노트 상태
        var noteStatus = document.getElementById('stageErrorNoteStatus');
        if (noteStatus) {
            if (saved.errorNoteSubmitted) {
                noteStatus.textContent = '✅ 제출 완료';
                noteStatus.style.color = '#10b981';
            } else {
                noteStatus.textContent = '제출 후 확인 가능';
            }
        }

        // ★ 다시 풀기 시스템 — 기한 판단 + 다시 풀기 버튼 표시
        var isFirstCycleComplete = saved.secondResult && saved.errorNoteSubmitted;
        var isExpired = (typeof isTaskDeadlinePassed === 'function') ? isTaskDeadlinePassed() : false;
        var isFirstCycleIncomplete = saved.firstResult && !isFirstCycleComplete;
        
        // 지연 잠금: 기한이 지났고 locked_auth_rate가 아직 없으면 → 현재 인증률로 확정
        if (isExpired && saved.lockedAuthRate == null && saved.firstResult) {
            var currentRate = 0;
            if (saved.firstResult) currentRate += 33;
            if (saved.secondResult) currentRate += 33;
            if (saved.errorNoteSubmitted) currentRate += 34;
            
            // DB에 locked_auth_rate 저장 (지연 잠금 실행)
            try {
                await StudySave.setDelayedLock(currentRate);
                console.log('🔒 [StageSelector] 지연 잠금 실행 완료 — 인증률', currentRate, '% 확정');
            } catch(e) {
                console.warn('⚠️ [StageSelector] 지연 잠금 저장 실패:', e);
            }
        }

        // 다시 풀기 버튼 표시 조건:
        // (A) 첫 사이클 3단계 모두 완료
        // (B) 기한 마감 + 첫 사이클 미완성 (강제 종료)
        var showRetryButton = isFirstCycleComplete || (isExpired && isFirstCycleIncomplete);
        
        // 기한 마감 + 미완성 시 강제 종료 안내
        if (isExpired && isFirstCycleIncomplete) {
            var forceCloseNotice = document.getElementById('stageForceCloseNotice');
            if (!forceCloseNotice) {
                forceCloseNotice = document.createElement('div');
                forceCloseNotice.id = 'stageForceCloseNotice';
                forceCloseNotice.style.cssText = 'padding:10px 16px; margin:8px 0; background:#fef3c7; border-radius:8px; font-size:13px; color:#92400e; text-align:center;';
                forceCloseNotice.innerHTML = '⚠️ 기한 마감으로 첫 사이클이 종료되었습니다.';
                var stageScreen = document.getElementById('stageSelectScreen');
                var btnArea = stageScreen ? stageScreen.querySelector('.stage-buttons') : null;
                if (btnArea) btnArea.appendChild(forceCloseNotice);
            }
            forceCloseNotice.style.display = 'block';
            
            // 미완료 단계 표시 변경
            if (!saved.secondResult) {
                var s2 = document.getElementById('stage2ndStatus');
                if (s2) { s2.textContent = '⏸ 미완료'; s2.style.color = '#9ca3af'; }
            }
            if (!saved.errorNoteSubmitted) {
                var ns = document.getElementById('stageErrorNoteStatus');
                if (ns) { ns.textContent = '⏸ 미제출'; ns.style.color = '#9ca3af'; }
            }
        } else {
            var forceCloseNotice = document.getElementById('stageForceCloseNotice');
            if (forceCloseNotice) forceCloseNotice.style.display = 'none';
        }

        // 다시 풀기 버튼
        var retryBtn = document.getElementById('stageRetryBtn');
        if (showRetryButton) {
            if (!retryBtn) {
                retryBtn = document.createElement('button');
                retryBtn.id = 'stageRetryBtn';
                retryBtn.className = 'btn btn-retry';
                retryBtn.style.cssText = 'width:100%; padding:14px; margin-top:12px; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; border:none; border-radius:12px; font-size:15px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.2s;';
                retryBtn.innerHTML = '🔄 다시 풀어보기';
                retryBtn.onmouseover = function() { retryBtn.style.transform = 'translateY(-1px)'; retryBtn.style.boxShadow = '0 4px 12px rgba(99,102,241,0.3)'; };
                retryBtn.onmouseout = function() { retryBtn.style.transform = ''; retryBtn.style.boxShadow = ''; };
                retryBtn.onclick = function() { _startRetryAttempt(); };
                
                var stageScreen = document.getElementById('stageSelectScreen');
                var btnArea = stageScreen ? stageScreen.querySelector('.stage-buttons') : null;
                if (btnArea) btnArea.appendChild(retryBtn);
            }
            retryBtn.style.display = 'flex';
        } else {
            if (retryBtn) retryBtn.style.display = 'none';
        }

        // 이전 시도 이력 표시
        if (saved.firstHistoryJson && saved.firstHistoryJson.length > 0) {
            _renderRetryHistory(saved.firstHistoryJson);
        } else {
            var historyContainer = document.getElementById('retryHistoryContainer');
            if (historyContainer) historyContainer.style.display = 'none';
        }
    }
};

/**
 * ★ 다시 풀기 시작
 * 기존 startFirstAttemptV2()와 동일한 흐름이지만,
 * 완료 후 안내 문구가 "연습 풀이가 완료되었습니다."로 다름
 */
function _startRetryAttempt() {
    console.log('🔄 [V2] 다시 풀기 시작');
    
    // 다시 풀기 플래그 설정 (안내 문구 분기용)
    StageSelector._isRetryMode = true;
    
    // 안내 팝업
    if (typeof showGuidePopup === 'function') {
        showGuidePopup({
            icon: '🔄',
            title: '다시 풀어보기',
            desc: '연습 모드로 진행됩니다.<br>인증률과 레벨에는 영향이 없습니다.',
            notice: '',
            btn: '시작하기',
            theme: 'theme-purple'
        }).then(function() {
            startFirstAttemptV2();
        });
    } else {
        startFirstAttemptV2();
    }
}

/**
 * ★ 이전 시도 이력 표시
 */
function _renderRetryHistory(historyArray) {
    var container = document.getElementById('retryHistoryContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'retryHistoryContainer';
        container.style.cssText = 'margin-top:16px; padding:12px 16px; background:var(--bg-secondary, #f8fafc); border-radius:12px; border:1px solid var(--border-color, #e2e8f0);';
        
        var stageScreen = document.getElementById('stageSelectScreen');
        if (stageScreen) stageScreen.appendChild(container);
    }
    
    var sectionType = StageSelector.sectionType;
    var html = '<div style="font-size:13px; font-weight:600; color:var(--text-secondary, #64748b); margin-bottom:8px;">── 이전 시도 ──</div>';
    
    historyArray.forEach(function(entry, index) {
        var dateStr = '';
        if (entry.date) {
            var d = new Date(entry.date);
            dateStr = (d.getMonth() + 1) + '/' + d.getDate();
        }
        
        var resultInfo = '';
        if (entry.result) {
            var r = entry.result;
            
            // 섹션별 이력 표시
            if (sectionType === 'writing') {
                // 라이팅: 제출 완료 (단어배열 x/10)
                var arrangeScore = '';
                if (r.writingResult && r.writingResult.arrange1st) {
                    var a = r.writingResult.arrange1st;
                    arrangeScore = ' (단어배열 ' + (a.correct || 0) + '/' + (a.total || 10) + ')';
                }
                resultInfo = '제출 완료' + arrangeScore;
            } else if (sectionType === 'speaking') {
                // 스피킹: 제출 완료
                resultInfo = '제출 완료';
            } else {
                // 리딩/리스닝: 레벨 재계산
                var tc = r.totalCorrect || 0;
                var tq = r.totalQuestions || 0;
                var level = (typeof StudySave !== 'undefined' && StudySave.calculateLevel) 
                    ? StudySave.calculateLevel(sectionType, tc) 
                    : null;
                resultInfo = (level ? 'Level ' + level.toFixed(1) + ' ' : '') + '(' + tc + '/' + tq + ')';
            }
        }
        
        html += '<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; font-size:13px; border-bottom:1px solid var(--border-color, #e2e8f0);">';
        html += '<span style="color:var(--text-secondary, #64748b);">' + (index + 1) + '회차 (' + dateStr + ')</span>';
        html += '<span style="font-weight:500; color:var(--text-primary, #1e293b);">' + resultInfo + '</span>';
        html += '</div>';
    });
    
    container.innerHTML = html;
    container.style.display = 'block';
}

/**
 * 과제 화면으로 복귀하는 공통 함수
 * 화면 전환 + DB에서 최신 상태 다시 읽기
 */
function backToStageSelect() {
    // ★ 핵심: ModuleController cleanup 먼저 실행 (좀비 프로세스 방지)
    // 모듈 중간에 나갈 때 컴포넌트의 setTimeout 체인, audio, video, timer를 즉시 정리
    if (window.moduleController && typeof window.moduleController.cleanup === 'function') {
        console.log('🧹 [backToStageSelect] ModuleController cleanup 실행');
        window.moduleController.cleanup();
        window.moduleController = null;
    }
    
    document.querySelectorAll('.screen').forEach(function(s) { s.style.display = 'none'; });
    document.querySelectorAll('.result-screen, .test-screen').forEach(function(s) { s.style.display = 'none'; });
    var screen = document.getElementById('stageSelectScreen');
    if (screen) screen.style.display = 'block';
    // DB에서 최신 상태 다시 읽기
    StageSelector._loadFromDB();
    
    // ★ 리뷰 버튼 숨김 (풀이 종료)
    if (typeof ReviewPanel !== 'undefined') ReviewPanel.updateButtonVisibility();
    
    // ★ 타이머/배지 복원 (2차 풀이 도중 나간 경우 대비)
    if (window.retakeController && typeof window.retakeController.restoreHeaderToFirstMode === 'function') {
        window.retakeController.restoreHeaderToFirstMode();
    }
}

// ========================================
// 4개 버튼 핸들러
// ========================================

async function startFirstAttemptV2() {
    const sectionType = StageSelector.sectionType;
    const moduleNumber = StageSelector.moduleNumber;
    
    console.log('📝 [V2] 1차 풀이 시작:', sectionType, 'Module', moduleNumber);
    
    // 1. 모듈 설정 가져오기
    const moduleConfig = getModule(sectionType, moduleNumber);
    if (!moduleConfig) {
        console.error('❌ [V2] 모듈 설정을 찾을 수 없습니다:', sectionType, moduleNumber);
        alert('모듈을 찾을 수 없습니다.');
        return;
    }
    
    // ★ 스피킹: 가이드 팝업 → ModuleController로 풀이
    if (sectionType === 'speaking') {
        _startSpeakingAttempt(1, moduleNumber, moduleConfig);
        return;
    }
    
    // ★ 섹션별 1차 시작 안내 팝업
    if (typeof showGuidePopup === 'function') {
        var guideConfig = _getFirstStartGuide(sectionType);
        if (guideConfig) await showGuidePopup(guideConfig);
    }
    
    // ★ 라이팅은 전용 플로우 사용
    if (sectionType === 'writing' && window.WritingFlowV2) {
        WritingFlowV2.startFirst(moduleNumber, moduleConfig, function(type, writingResult) {
            console.log('✅ [V2] 라이팅 1차 완료:', writingResult);
            
            // WritingFlowV2 결과를 StageSelector에 보관
            StageSelector.firstAttemptResult = { sectionType: 'writing', writingResult: writingResult };
            
            // Supabase 저장 (비동기, 기다리지 않음)
            if (window.StudySave) {
                StudySave.saveFirstResult(StageSelector.firstAttemptResult);
            }
            
            // 대시보드 복귀 + 라이팅 대시보드 업데이트
            backToStageSelect();
            updateWritingDashboard(writingResult, '1st');
            
            // 1차 완료 상태 갱신
            var status1st = document.getElementById('stage1stStatus');
            if (status1st) { status1st.textContent = '✅ 완료'; status1st.classList.add('stage-status-done'); }
            
            // ★ 라이팅 1차 완료 안내 팝업
            if (typeof showGuidePopup === 'function') {
                showGuidePopup(StageSelector._isRetryMode 
                    ? { icon: '✅', title: '연습 풀이가 완료되었습니다', desc: '이전 시도 이력에서 결과를 확인할 수 있습니다.', notice: '', btn: '확인', theme: 'theme-purple' }
                    : { icon: '✅', title: '1차 풀이가 완료되었습니다', desc: '2차 풀이도 진행해주세요.', notice: '', btn: '확인', theme: 'theme-green' });
                StageSelector._isRetryMode = false;
            }
        });
        return;
    }
    
    // 2. ModuleController 생성 (리딩/리스닝)
    const controller = new ModuleController(moduleConfig);
    window.moduleController = controller;
    
    // ★ 리뷰 버튼 표시 (1차 풀이 시작)
    if (typeof ReviewPanel !== 'undefined') ReviewPanel.updateButtonVisibility();
    
    // 3. 다 풀면 → 결과 화면 표시 → 과제 화면 복귀
    controller.setOnComplete(function(result) {
        console.log('✅ [V2] 1차 풀이 완료:', result);
        
        // 1차 결과 데이터를 StageSelector에 보관
        StageSelector.firstAttemptResult = result;
        
        // ✅ Supabase 저장 (비동기 — 화면 표시 차단 안 함)
        if (window.StudySave) {
            StudySave.saveFirstResult(result);
        }
        
        // ResultController로 1차 결과 화면 표시
        const resultController = new ResultController(result);
        
        // "틀린 문제 다시 풀기" / "해설 보기" 대신 "과제 화면으로" 버튼으로 교체
        resultController.startRetake = function() {
            returnToStageSelect(result);
        };
        resultController.showExplanations = function() {
            returnToStageSelect(result);
        };
        
        resultController.show();
        
        // 결과 화면의 버튼을 "과제 화면으로 돌아가기"로 교체
        setTimeout(function() {
            const resultScreen = document.getElementById(sectionType + 'ResultScreen');
            if (resultScreen) {
                const btnContainer = resultScreen.querySelector('.result-buttons');
                if (btnContainer) {
                    btnContainer.innerHTML = '';
                    const backBtn = document.createElement('button');
                    backBtn.className = 'btn btn-primary';
                    backBtn.textContent = '과제 화면으로 돌아가기';
                    backBtn.onclick = async function() {
                        // ★ 리딩/리스닝 1차 완료 안내 팝업
                        if (typeof showGuidePopup === 'function') {
                            await showGuidePopup(StageSelector._isRetryMode 
                            ? { icon: '✅', title: '연습 풀이가 완료되었습니다', desc: '이전 시도 이력에서 결과를 확인할 수 있습니다.', notice: '', btn: '과제 화면으로', theme: 'theme-purple' }
                            : { icon: '✅', title: '1차 풀이가 완료되었습니다', desc: '2차 풀이도 진행해주세요.', notice: '', btn: '과제 화면으로', theme: 'theme-green' });
                        StageSelector._isRetryMode = false;
                        }
                        returnToStageSelect(result);
                    };
                    btnContainer.appendChild(backBtn);
                }
            }
        }, 100);
    });
    
    // 4. 풀이 시작
    controller.startModule();
}

/**
 * 1차 풀이 완료 후 stageSelectScreen으로 복귀
 * 오른쪽 대시보드에 점수 반영
 */
function returnToStageSelect(result) {
    console.log('🔙 [V2] 과제 화면으로 복귀');
    backToStageSelect();
    
    // 대시보드 업데이트
    if (result) {
        updateStageDashboard(result, '1st');
    }
    
    // 1차 풀이 상태 업데이트
    var status1st = document.getElementById('stage1stStatus');
    if (status1st) {
        status1st.textContent = '✅ 완료';
        status1st.classList.add('stage-status-done');
    }
}

/**
 * 오른쪽 채점 대시보드 업데이트
 */
function updateStageDashboard(result, attempt) {
    var suffix = attempt === '1st' ? '1st' : '2nd';
    
    // ★ 라이팅 전용 대시보드 업데이트
    if (StageSelector.sectionType === 'writing' || (result && result.sectionType === 'writing')) {
        updateWritingDashboard(result, attempt);
        return;
    }
    
    // ★ 스피킹 전용 대시보드 업데이트
    if (StageSelector.sectionType === 'speaking' || (result && result.sectionType === 'speaking')) {
        updateSpeakingDashboard(result, attempt);
        return;
    }
    
    var totalCorrect = 0;
    var totalQuestions = 0;
    var level = 0;
    var componentScores = [];
    
    // 2차 데이터: 이미 계산된 점수가 들어있음
    if (attempt === '2nd' && result.secondAttempt) {
        var sa = result.secondAttempt;
        totalCorrect = sa.score || 0;
        totalQuestions = StageSelector.firstAttemptResult ? StageSelector.firstAttemptResult.totalQuestions : 35;
        level = sa.level || 0;
        
        // 개선량 표시
        var detailEl = document.getElementById('stageDetail2nd');
        if (detailEl) {
            var improvement = result.improvement || {};
            var html = '';
            html += '<div style="display:flex; justify-content:space-between; font-size:12px; padding:3px 0;">';
            html += '<span style="color:var(--text-secondary);">점수 변화</span>';
            html += '<span style="font-weight:600; color:' + (improvement.scoreDiff > 0 ? '#10b981' : 'var(--text-primary)') + ';">';
            html += (improvement.scoreDiff > 0 ? '+' : '') + (improvement.scoreDiff || 0) + '문제';
            html += '</span></div>';
            html += '<div style="display:flex; justify-content:space-between; font-size:12px; padding:3px 0;">';
            html += '<span style="color:var(--text-secondary);">레벨 변화</span>';
            html += '<span style="font-weight:600; color:' + (improvement.levelDiff > 0 ? '#10b981' : 'var(--text-primary)') + ';">';
            html += (improvement.levelDiff > 0 ? '+' : '') + (improvement.levelDiff || 0).toFixed(1);
            html += '</span></div>';
            detailEl.innerHTML = html;
        }
    }
    // 1차 데이터: 답안 목록에서 점수 계산
    else {
        totalQuestions = result.totalQuestions || 0;
        if (result.componentResults) {
            var nameMap = {
                'fillblanks': '빈칸채우기', 'daily1': '일상리딩 1', 'daily2': '일상리딩 2',
                'academic': '아카데믹', 'response': '응답', 'conver': '대화',
                'announcement': '공지사항', 'lecture': '강의'
            };
            result.componentResults.forEach(function(comp) {
                var answers = comp.answers || [];
                var correct = answers.filter(function(a) { return a.isCorrect; }).length;
                totalCorrect += correct;
                componentScores.push({ name: nameMap[comp.componentType] || comp.componentType, correct: correct, total: answers.length });
            });
        }
        
        // 레벨 계산
        var sectionType = StageSelector.sectionType;
        if (sectionType === 'reading') {
            if (totalCorrect <= 3) level = 1.0;
            else if (totalCorrect <= 6) level = 1.5;
            else if (totalCorrect <= 10) level = 2.0;
            else if (totalCorrect <= 13) level = 2.5;
            else if (totalCorrect <= 17) level = 3.0;
            else if (totalCorrect <= 20) level = 3.5;
            else if (totalCorrect <= 24) level = 4.0;
            else if (totalCorrect <= 27) level = 4.5;
            else if (totalCorrect <= 30) level = 5.0;
            else if (totalCorrect <= 32) level = 5.5;
            else level = 6.0;
        } else if (sectionType === 'listening') {
            if (totalCorrect <= 2) level = 1.0;
            else if (totalCorrect <= 5) level = 1.5;
            else if (totalCorrect <= 8) level = 2.0;
            else if (totalCorrect <= 11) level = 2.5;
            else if (totalCorrect <= 15) level = 3.0;
            else if (totalCorrect <= 18) level = 3.5;
            else if (totalCorrect <= 21) level = 4.0;
            else if (totalCorrect <= 24) level = 4.5;
            else if (totalCorrect <= 27) level = 5.0;
            else if (totalCorrect <= 29) level = 5.5;
            else level = 6.0;
        }
        
        // 파트별 점수
        var detailEl = document.getElementById('stageDetail' + suffix);
        if (detailEl) {
            var html = '';
            componentScores.forEach(function(comp) {
                html += '<div style="display:flex; justify-content:space-between; font-size:12px; padding:3px 0;">';
                html += '<span style="color:var(--text-secondary);">' + comp.name + '</span>';
                html += '<span style="font-weight:600; color:var(--text-primary);">' + comp.correct + '/' + comp.total + '</span>';
                html += '</div>';
            });
            detailEl.innerHTML = html;
        }
    }
    
    // 공통 DOM 업데이트
    var scoreEl = document.getElementById('stageScore' + suffix);
    if (scoreEl) {
        scoreEl.innerHTML = totalCorrect + '<span style="font-size:14px; font-weight:400; color:var(--text-secondary);">/' + totalQuestions + '</span>';
    }
    var levelEl = document.getElementById('stageLevel' + suffix);
    if (levelEl) {
        levelEl.textContent = '레벨 ' + level.toFixed(1);
    }
    
    console.log('📊 [V2] 대시보드 업데이트:', attempt, totalCorrect + '/' + totalQuestions, '레벨', level.toFixed(1));
}

/**
 * ★ 라이팅 전용 대시보드 업데이트
 * 단어배열 점수 + 이메일/토론 제출 상태 표시
 */
function updateWritingDashboard(result, attempt) {
    var suffix = attempt === '1st' ? '1st' : '2nd';
    var wr = result && result.writingResult ? result.writingResult : result;
    
    if (!wr) {
        console.warn('⚠️ [V2] 라이팅 결과 데이터 없음');
        return;
    }
    
    // 단어 배열 점수
    var arrangeCorrect = 0;
    var arrangeTotal = 10;
    
    if (attempt === '1st') {
        arrangeCorrect = wr.arrangeCorrect1st || 0;
        arrangeTotal = wr.arrangeTotal || 10;
    } else {
        arrangeCorrect = wr.arrangeCorrect2nd || 0;
        arrangeTotal = wr.arrangeTotal || 10;
    }
    
    // 점수 표시 (단어배열 점수만 큰 숫자로)
    var scoreEl = document.getElementById('stageScore' + suffix);
    if (scoreEl) {
        scoreEl.innerHTML = arrangeCorrect + '<span style="font-size:14px; font-weight:400; color:var(--text-secondary);">/' + arrangeTotal + '</span>';
    }
    
    // 레벨 대신 "단어 배열" 라벨
    var levelEl = document.getElementById('stageLevel' + suffix);
    if (levelEl) {
        levelEl.textContent = '단어 배열';
        levelEl.style.color = 'var(--text-secondary)';
    }
    
    // 제출 상태 (이메일, 토론) — 제출 시 '보기' 버튼으로 표시
    var detailEl = document.getElementById('stageDetail' + suffix);
    if (detailEl) {
        var html = '';
        
        // 이메일 제출 상태
        var emailKey = attempt === '1st' ? 'email1stSubmitted' : 'email2ndSubmitted';
        var emailTextKey = attempt === '1st' ? 'email1stText' : 'email2ndText';
        var emailSubmitted = wr[emailKey] || false;
        var emailLabel = '이메일' + (attempt === '2nd' ? ' 2차' : '');
        html += '<div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:3px 0;">';
        html += '<span style="color:var(--text-secondary);"><i class="fas fa-envelope" style="width:14px;"></i> ' + emailLabel + '</span>';
        if (emailSubmitted && wr[emailTextKey]) {
            html += '<span onclick="showWritingTextPopup(\'' + emailLabel + '\', \'' + attempt + '\', \'email\')" style="font-weight:600; color:#4A90D9; cursor:pointer; text-decoration:underline;">📄 보기</span>';
        } else if (emailSubmitted) {
            html += '<span style="font-weight:600; color:#10b981;">✅ 제출됨</span>';
        } else {
            html += '<span style="font-weight:600; color:var(--text-secondary);">미제출</span>';
        }
        html += '</div>';
        
        // 토론 제출 상태
        var discKey = attempt === '1st' ? 'discussion1stSubmitted' : 'discussion2ndSubmitted';
        var discTextKey = attempt === '1st' ? 'discussion1stText' : 'discussion2ndText';
        var discSubmitted = wr[discKey] || false;
        var discLabel = '토론' + (attempt === '2nd' ? ' 2차' : '');
        html += '<div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:3px 0;">';
        html += '<span style="color:var(--text-secondary);"><i class="fas fa-comments" style="width:14px;"></i> ' + discLabel + '</span>';
        if (discSubmitted && wr[discTextKey]) {
            html += '<span onclick="showWritingTextPopup(\'' + discLabel + '\', \'' + attempt + '\', \'discussion\')" style="font-weight:600; color:#4A90D9; cursor:pointer; text-decoration:underline;">📄 보기</span>';
        } else if (discSubmitted) {
            html += '<span style="font-weight:600; color:#10b981;">✅ 제출됨</span>';
        } else {
            html += '<span style="font-weight:600; color:var(--text-secondary);">미제출</span>';
        }
        html += '</div>';
        
        // 2차일 때 1차→2차 점수 비교 추가
        if (attempt === '2nd' && wr.arrangeCorrect1st !== undefined) {
            var diff = arrangeCorrect - wr.arrangeCorrect1st;
            html += '<div style="display:flex; justify-content:space-between; font-size:12px; padding:3px 0; margin-top:4px; border-top:1px solid var(--border-color); padding-top:6px;">';
            html += '<span style="color:var(--text-secondary);">단어배열 변화</span>';
            html += '<span style="font-weight:600; color:' + (diff > 0 ? '#10b981' : 'var(--text-primary)') + ';">';
            html += wr.arrangeCorrect1st + ' → ' + arrangeCorrect + (diff > 0 ? ' (+' + diff + ')' : '');
            html += '</span></div>';
        }
        
        detailEl.innerHTML = html;
    }
    
    console.log('📊 [V2] 라이팅 대시보드 업데이트:', attempt, arrangeCorrect + '/' + arrangeTotal);
}

/**
 * ★ 스피킹 전용 대시보드 업데이트
 * 점수/레벨 대신 따라말하기 ✅ / 인터뷰 ✅ 완료 상태 표시
 */
function updateSpeakingDashboard(result, attempt) {
    var suffix = attempt === '1st' ? '1st' : '2nd';
    
    // 점수 영역에 완료 표시
    var scoreEl = document.getElementById('stageScore' + suffix);
    if (scoreEl) {
        scoreEl.innerHTML = '<span style="font-size:18px; color:#10b981;">✅</span>';
    }
    
    // 레벨 대신 "답변 완료" 표시
    var levelEl = document.getElementById('stageLevel' + suffix);
    if (levelEl) {
        levelEl.textContent = attempt === '1st' ? '1차 답변' : '2차 답변';
        levelEl.style.color = 'var(--text-secondary)';
    }
    
    // 상세 영역: 따라말하기/인터뷰 완료 상태
    var detailEl = document.getElementById('stageDetail' + suffix);
    if (detailEl) {
        var html = '';
        html += '<div style="display:flex; justify-content:space-between; font-size:12px; padding:3px 0;">';
        html += '<span style="color:var(--text-secondary);"><i class="fas fa-microphone" style="width:14px;"></i> 따라말하기</span>';
        html += '<span style="font-weight:600; color:#10b981;">✅ 완료</span>';
        html += '</div>';
        html += '<div style="display:flex; justify-content:space-between; font-size:12px; padding:3px 0;">';
        html += '<span style="color:var(--text-secondary);"><i class="fas fa-user-tie" style="width:14px;"></i> 인터뷰</span>';
        html += '<span style="font-weight:600; color:#10b981;">✅ 완료</span>';
        html += '</div>';
        detailEl.innerHTML = html;
    }
    
    console.log('📊 [V2] 스피킹 대시보드 업데이트:', attempt, '답변 완료');
}

async function startSecondAttemptV2() {
    const sectionType = StageSelector.sectionType;
    const moduleNumber = StageSelector.moduleNumber;
    
    console.log('🔄 [V2] 2차 풀이 시작:', sectionType, 'Module', moduleNumber);
    
    // 1차 결과 확인
    const firstResult = StageSelector.firstAttemptResult;
    if (!firstResult) {
        alert('1차 풀이를 먼저 완료해주세요.');
        console.warn('⚠️ [V2] 1차 결과 없음 — 2차 풀이 불가');
        return;
    }
    
    // ★ 스피킹: 가이드 팝업 → ModuleController로 2차 풀이
    if (sectionType === 'speaking') {
        const moduleConfig = getModule(sectionType, moduleNumber);
        if (!moduleConfig) {
            alert('모듈을 찾을 수 없습니다.');
            return;
        }
        _startSpeakingAttempt(2, moduleNumber, moduleConfig);
        return;
    }
    
    // ★ 섹션별 2차 시작 안내 팝업
    if (typeof showGuidePopup === 'function') {
        var guideConfig = _getSecondStartGuide(sectionType);
        if (guideConfig) await showGuidePopup(guideConfig);
    }
    
    // ★ 라이팅은 전용 플로우 사용
    if (sectionType === 'writing' && window.WritingFlowV2) {
        const moduleConfig = getModule(sectionType, moduleNumber);
        if (!moduleConfig) {
            alert('모듈을 찾을 수 없습니다.');
            return;
        }
        
        // ★ 2차 풀이 전에 1차 결과를 WritingFlowV2에 복원
        // (페이지 새로고침 후 DB에서 불러온 경우 WritingFlowV2 내부 상태가 비어있을 수 있음)
        if (firstResult && firstResult.writingResult) {
            var wr = firstResult.writingResult;
            WritingFlowV2.arrange1stResult = wr.arrange1st || null;
            WritingFlowV2.email1stText = wr.email1stText || '';
            WritingFlowV2.email1stData = wr.email1stData || null;
            WritingFlowV2.discussion1stText = wr.discussion1stText || '';
            WritingFlowV2.discussion1stData = wr.discussion1stData || null;
        }
        
        WritingFlowV2.startSecond(moduleNumber, moduleConfig, function(type, writingResult) {
            console.log('✅ [V2] 라이팅 2차 완료:', writingResult);
            
            StageSelector.secondAttemptResult = { sectionType: 'writing', writingResult: writingResult };
            
            if (window.StudySave) {
                StudySave.saveSecondResult(StageSelector.secondAttemptResult);
            }
            
            // 대시보드 복귀 + 라이팅 대시보드 업데이트
            backToStageSelect();
            updateWritingDashboard(writingResult, '2nd');
            
            // 2차 완료 상태 갱신
            var status2nd = document.getElementById('stage2ndStatus');
            if (status2nd) { status2nd.textContent = '✅ 완료'; status2nd.classList.add('stage-status-done'); }
            
            // ★ 라이팅 2차 완료 안내 팝업
            if (typeof showGuidePopup === 'function') {
                showGuidePopup({ icon: '✅', title: '2차 풀이가 완료되었습니다', desc: '해설을 확인하고 <b>오답노트</b>를 작성해주세요.', tip: '오답노트까지 제출하면 <b>100% 인증</b>됩니다.', notice: '', btn: '확인', theme: 'theme-green' });
            }
        });
        return;
    }
    
    // RetakeController 존재 확인 (리딩/리스닝)
    if (typeof RetakeController === 'undefined') {
        alert('2차 풀이 모듈을 불러올 수 없습니다.');
        console.error('❌ [V2] RetakeController not loaded');
        return;
    }
    
    // RetakeController 생성 및 시작
    const retakeCtrl = new RetakeController(sectionType, firstResult);
    window.retakeController = retakeCtrl;
    
    // ★ 리뷰 버튼 숨김 (2차 풀이 시작)
    if (typeof ReviewPanel !== 'undefined') ReviewPanel.updateButtonVisibility();
    
    // showSecondResultScreen 오버라이드 — 2차 결과 표시 후 "과제 화면으로" 버튼 추가
    const originalShowResult = retakeCtrl.showSecondResultScreen.bind(retakeCtrl);
    retakeCtrl.showSecondResultScreen = function(secondResults) {
        console.log('📊 [V2] 2차 결과 화면 (오버라이드)');
        
        // 2차 결과를 StageSelector에 보관
        StageSelector.secondAttemptResult = secondResults;
        
        // ✅ Supabase 저장 (비동기 — 화면 표시 차단 안 함)
        if (window.StudySave) {
            StudySave.saveSecondResult(secondResults);
        }
        
        // 기존 결과 화면 표시 (reading-retake-result.js의 showReadingRetakeResult 등)
        originalShowResult(secondResults);
        
        // "과제 화면으로 돌아가기" 버튼 추가
        setTimeout(function() {
            addReturnButtonToRetakeResult(secondResults);
        }, 300);
    };
    
    // 2차 풀이 시작
    retakeCtrl.start();
}

/**
 * 2차 결과 화면에 "과제 화면으로 돌아가기" 버튼 추가
 */
function addReturnButtonToRetakeResult(secondResults) {
    var sectionType = StageSelector.sectionType || 'reading';
    var retakeScreen = document.getElementById(sectionType + 'RetakeResultScreen');
    if (!retakeScreen) return;
    
    // 이미 추가된 버튼이 있으면 제거
    const existing = retakeScreen.querySelector('.v2-return-btn');
    if (existing) existing.remove();
    
    // 버튼 추가 (화면 하단에 직접 삽입)
    const returnBtn = document.createElement('button');
    returnBtn.className = 'btn btn-secondary btn-large v2-return-btn';
    returnBtn.style.cssText = 'margin:20px auto; display:block; width:90%; max-width:400px; background:#9480c5; color:#fff; border:none; padding:14px 24px; border-radius:12px; font-size:16px; font-weight:600; cursor:pointer;';
    returnBtn.textContent = '📋 과제 화면으로 돌아가기';
    returnBtn.onclick = async function() {
        // ★ 리딩/리스닝 2차 완료 안내 팝업
        if (typeof showGuidePopup === 'function') {
            await showGuidePopup({ icon: '✅', title: '2차 풀이가 완료되었습니다', desc: '해설을 확인하고 <b>오답노트</b>를 작성해주세요.', tip: '오답노트까지 제출하면 <b>100% 인증</b>됩니다.', notice: '', btn: '과제 화면으로', theme: 'theme-green' });
        }
        returnToStageSelectAfterRetake(secondResults);
    };
    retakeScreen.appendChild(returnBtn);
    
    console.log('✅ [V2] "과제 화면으로 돌아가기" 버튼 추가 완료');
}

/**
 * 2차 풀이 완료 후 stageSelectScreen으로 복귀
 * 대시보드에 2차 점수 반영
 */
function returnToStageSelectAfterRetake(secondResults) {
    console.log('🔙 [V2] 2차 풀이 후 과제 화면으로 복귀');
    backToStageSelect();
}


/**
 * ================================================
 * 섹션별 시작 안내 팝업 설정
 * ================================================
 */

/**
 * 풀이 중 이탈 주의사항 (공통)
 */
const EXIT_WARNING = '풀이 중 뒤로가기·새로고침 시 작성 내용이 모두 삭제되며, 처음부터 다시 풀어야 합니다.';

/**
 * 1차 풀이 시작 전 안내 팝업 (리딩/리스닝/라이팅)
 * 스피킹은 별도 _startSpeakingAttempt에서 처리
 */
function _getFirstStartGuide(sectionType) {
    switch (sectionType) {
        case 'reading':
            return {
                icon: '📖',
                title: '1차 풀이를 시작합니다',
                desc: '총 <b>35문제</b>입니다.<br>집중해서 풀어주세요.',
                tip: '',
                notice: EXIT_WARNING,
                btn: '시작하기',
                theme: 'theme-purple'
            };
        case 'listening':
            return {
                icon: '🎧',
                title: '1차 풀이를 시작합니다',
                desc: '총 <b>32문제</b>입니다.<br>이어폰 착용을 권장합니다.',
                tip: '음원은 <b>1회만</b> 재생됩니다.<br>문항당 제한시간: <b>20초</b> (강의 파트 <b>30초</b>)',
                notice: EXIT_WARNING,
                btn: '시작하기',
                theme: 'theme-purple'
            };
        case 'writing':
            return {
                icon: '✏️',
                title: '1차 풀이를 시작합니다',
                desc: '과제 순서: <b>단어배열 → 이메일 → 토론형</b>',
                tip: '',
                notice: EXIT_WARNING,
                btn: '시작하기',
                theme: 'theme-purple'
            };
        default:
            return null;
    }
}

/**
 * 2차 풀이 시작 전 안내 팝업 (리딩/리스닝/라이팅)
 * 스피킹은 별도 _startSpeakingAttempt에서 처리
 */
function _getSecondStartGuide(sectionType) {
    switch (sectionType) {
        case 'reading':
            return {
                icon: '🔄',
                title: '2차 풀이를 시작합니다',
                desc: '1차에서 <b>틀린 문제만</b> 다시 풀어주세요.',
                tip: '이미 맞힌 문제는 다시 선택하지 않아도 됩니다.',
                notice: EXIT_WARNING,
                btn: '시작하기',
                theme: 'theme-blue'
            };
        case 'listening':
            return {
                icon: '🔄',
                title: '2차 풀이를 시작합니다',
                desc: '1차에서 <b>틀린 문제만</b> 다시 풀어주세요.',
                tip: '이미 맞힌 문제는 다시 선택하지 않아도 됩니다.',
                notice: EXIT_WARNING,
                btn: '시작하기',
                theme: 'theme-blue'
            };
        case 'writing':
            return {
                icon: '🔄',
                title: '2차 풀이를 시작합니다',
                desc: '과제 순서: <b>단어배열 → 이메일 → 토론형</b>',
                tip: '① 한글 모범답안은 단순 참고 자료이니,<br>&nbsp;&nbsp;&nbsp;&nbsp;충분히 읽고 뒤로 가기를 누르지 마세요.<br>' +
                        '② 한글로 제공하는 이유는 그대로 베끼지 않고,<br>&nbsp;&nbsp;&nbsp;&nbsp;본인만의 표현으로 작성하도록 하기 위함입니다.<br>' +
                        '③ 답안을 옆에 띄워놓고 따라 쓰지 말고,<br>&nbsp;&nbsp;&nbsp;&nbsp;본인의 문장으로 직접 작성해 주세요.',
                notice: EXIT_WARNING,
                btn: '시작하기',
                theme: 'theme-blue'
            };
        default:
            return null;
    }
}


/**
 * 오답노트 보기 — 대시보드 버튼 클릭 시 호출
 * DB에서 내용 가져와서 팝업으로 표시
 */
async function showErrorNoteV2() {
    console.log('📝 [V2] 오답노트 보기:', StageSelector.sectionType, StageSelector.moduleNumber);

    if (!window.StudySave) {
        alert('저장 모듈을 불러올 수 없습니다.');
        return;
    }

    var saved = await StudySave.loadSavedResults();

    if (!saved || !saved.errorNoteSubmitted) {
        alert('아직 제출한 오답노트가 없습니다.\n해설 화면에서 오답노트를 작성해주세요.');
        return;
    }

    if (!saved.errorNoteText) {
        alert('오답노트가 제출되었지만 내용을 불러올 수 없습니다.');
        return;
    }

    // 팝업 표시
    showErrorNotePopup(saved.errorNoteText);
}

/**
 * 오답노트 내용 팝업
 */
function showErrorNotePopup(noteText) {
    // 기존 팝업 제거
    var existing = document.getElementById('errorNoteViewPopup');
    if (existing) existing.remove();

    var sectionLabel = { 'reading': '리딩', 'listening': '리스닝', 'writing': '라이팅', 'speaking': '스피킹' }[StageSelector.sectionType] || '';
    var title = sectionLabel + ' 모듈 ' + StageSelector.moduleNumber + ' — 오답노트';

    var popup = document.createElement('div');
    popup.id = 'errorNoteViewPopup';
    popup.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    popup.innerHTML =
        '<div style="background:#fff;border-radius:16px;max-width:560px;width:90%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
            '<div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;">' +
                '<h3 style="margin:0;font-size:16px;font-weight:700;color:#1e293b;">📝 ' + title + '</h3>' +
                '<button id="errorNotePopupClose" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;padding:4px 8px;">✕</button>' +
            '</div>' +
            '<div style="padding:24px;overflow-y:auto;flex:1;">' +
                '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;font-size:14px;line-height:1.8;color:#334155;white-space:pre-wrap;">' +
                    noteText.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
                '</div>' +
            '</div>' +
            '<div style="padding:16px 24px;border-top:1px solid #e2e8f0;text-align:right;">' +
                '<button id="errorNotePopupCloseBtn" style="padding:10px 24px;background:#9480c5;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">닫기</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(popup);

    // 닫기 이벤트
    document.getElementById('errorNotePopupClose').onclick = function() { popup.remove(); };
    document.getElementById('errorNotePopupCloseBtn').onclick = function() { popup.remove(); };
    popup.onclick = function(e) { if (e.target === popup) popup.remove(); };
}

/**
 * ★ 이메일/토론 작성 내용 열람 팝업
 * @param {string} label - '이메일' 또는 '토론' 등 표시용
 * @param {string} attempt - '1st' 또는 '2nd'
 * @param {string} type - 'email' 또는 'discussion'
 */
function showWritingTextPopup(label, attempt, type) {
    // 결과 데이터에서 텍스트 가져오기
    var resultObj = attempt === '1st' ? StageSelector.firstAttemptResult : StageSelector.secondAttemptResult;
    if (!resultObj || !resultObj.writingResult) {
        alert('작성 내용을 불러올 수 없습니다.');
        return;
    }
    var wr = resultObj.writingResult;
    var textKey = type + (attempt === '1st' ? '1st' : '2nd') + 'Text';
    var text = wr[textKey] || '';
    
    if (!text) {
        alert('작성 내용이 저장되어 있지 않습니다.');
        return;
    }
    
    // 기존 팝업 제거
    var existing = document.getElementById('writingTextViewPopup');
    if (existing) existing.remove();
    
    var sectionLabel = { 'reading': '리딩', 'listening': '리스닝', 'writing': '라이팅', 'speaking': '스피킹' }[StageSelector.sectionType] || '';
    var attemptLabel = attempt === '1st' ? '1차' : '2차';
    var title = sectionLabel + ' 모듈 ' + StageSelector.moduleNumber + ' — ' + label + ' (' + attemptLabel + ')';
    
    // 단어 수 계산
    var wordCount = text.trim().split(/\s+/).filter(function(w) { return w.length > 0; }).length;
    
    var popup = document.createElement('div');
    popup.id = 'writingTextViewPopup';
    popup.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    popup.innerHTML =
        '<div style="background:#fff;border-radius:16px;max-width:620px;width:90%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
            '<div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;">' +
                '<h3 style="margin:0;font-size:16px;font-weight:700;color:#1e293b;">' +
                    (type === 'email' ? '📧' : '💬') + ' ' + title +
                '</h3>' +
                '<button id="writingTextPopupClose" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;padding:4px 8px;">✕</button>' +
            '</div>' +
            '<div style="padding:24px;overflow-y:auto;flex:1;">' +
                '<div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:13px;color:#64748b;">' +
                    '<span><i class="fas fa-pen"></i> ' + attemptLabel + ' 작성</span>' +
                    '<span>' + wordCount + ' words</span>' +
                '</div>' +
                '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;font-size:14px;line-height:1.8;color:#334155;white-space:pre-wrap;">' +
                    text.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
                '</div>' +
            '</div>' +
            '<div style="padding:16px 24px;border-top:1px solid #e2e8f0;text-align:right;">' +
                '<button id="writingTextPopupCloseBtn" style="padding:10px 24px;background:#9480c5;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">닫기</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(popup);

    // 닫기 이벤트
    document.getElementById('writingTextPopupClose').onclick = function() { popup.remove(); };
    document.getElementById('writingTextPopupCloseBtn').onclick = function() { popup.remove(); };
    popup.onclick = function(e) { if (e.target === popup) popup.remove(); };
}

function showExplainV2() {
    var sectionType = StageSelector.sectionType;
    console.log('📖 [V2] 해설 보기:', sectionType, StageSelector.moduleNumber);

    if (!StageSelector.firstAttemptResult) {
        alert('1차 풀이를 먼저 완료해주세요.');
        return;
    }

    // 오답노트 플로팅 표시
    if (window.ErrorNote) {
        ErrorNote.show(sectionType, StageSelector.moduleNumber);
    }

    if (sectionType === 'reading' && typeof showReadingExplainV2 === 'function') {
        showReadingExplainV2();
    } else if (sectionType === 'listening' && typeof showListeningExplainV2 === 'function') {
        showListeningExplainV2();
    } else if (sectionType === 'writing' && window.WritingFlowV2) {
        // ★ 라이팅 해설: 1차/2차 결과에서 데이터를 WritingFlowV2에 복원
        var firstResult = StageSelector.firstAttemptResult;
        if (firstResult && firstResult.writingResult) {
            var wr = firstResult.writingResult;
            WritingFlowV2.arrange1stResult = wr.arrange1st || null;
            WritingFlowV2.arrange2ndResult = wr.arrange2nd || null;
            WritingFlowV2.email1stText = wr.email1stText || '';
            WritingFlowV2.email1stData = wr.email1stData || null;
            WritingFlowV2.discussion1stText = wr.discussion1stText || '';
            WritingFlowV2.discussion1stData = wr.discussion1stData || null;
        }
        var secondResult = StageSelector.secondAttemptResult;
        if (secondResult && secondResult.writingResult) {
            var wr2 = secondResult.writingResult;
            WritingFlowV2.arrange2ndResult = wr2.arrange2nd || WritingFlowV2.arrange2ndResult;
            WritingFlowV2.email2ndText = wr2.email2ndText || '';
            WritingFlowV2.email2ndData = wr2.email2ndData || null;
            WritingFlowV2.discussion2ndText = wr2.discussion2ndText || '';
            WritingFlowV2.discussion2ndData = wr2.discussion2ndData || null;
        }
        var moduleConfig = getModule(sectionType, StageSelector.moduleNumber);
        WritingFlowV2.startExplain(StageSelector.moduleNumber, moduleConfig, function() {
            backToStageSelect();
        });
    } else if (sectionType === 'speaking') {
        // ★ 스피킹 해설: DB에서 데이터 복원 → 따라말하기 복습 → 인터뷰 복습 → 대시보드
        _showSpeakingExplainV2().catch(function(err) {
            console.error('❌ [V2] 스피킹 해설 로드 실패:', err);
            alert('스피킹 해설 데이터를 불러오는데 실패했습니다.');
            backToStageSelect();
        });
    }
}

// ========================================
// ★ 스피킹 풀이 공통 함수 (1차/2차)
// ========================================
async function _startSpeakingAttempt(attemptNum, moduleNumber, moduleConfig) {
    console.log('🎤 [V2] 스피킹 ' + attemptNum + '차 답변 시작: Module', moduleNumber);
    
    // 가이드 팝업 표시
    if (typeof showGuidePopup === 'function') {
        await showGuidePopup({
            icon: '🎤',
            title: attemptNum + '차 답변을 시작합니다',
            desc: '휴대폰 <b>녹음 기능을 켠 채로</b> 시작해주세요.',
            tip: '녹음 파일은 오답노트 제출 시 첨부해야 합니다.',
            notice: EXIT_WARNING,
            btn: '시작하기',
            theme: attemptNum === 1 ? 'theme-purple' : 'theme-blue'
        });
    }
    
    // ModuleController 생성 및 시작
    var controller = new ModuleController(moduleConfig);
    window.moduleController = controller;
    
    controller.setOnComplete(async function(result) {
        console.log('✅ [V2] 스피킹 ' + attemptNum + '차 답변 완료:', result);
        
        var speakingResult = { sectionType: 'speaking', componentResults: result.componentResults || [] };
        
        // ★ 오디오/비디오만 정지 (컴포넌트와 데이터는 유지 — 해설 보기에서 사용)
        if (window.currentRepeatComponent) {
            if (window.currentRepeatComponent.currentAudio) {
                window.currentRepeatComponent.currentAudio.pause();
            }
        }
        if (window.currentInterviewComponent) {
            if (window.currentInterviewComponent.currentInterviewAudio) {
                window.currentInterviewComponent.currentInterviewAudio.pause();
            }
            var noddingVideo = document.getElementById('interviewNoddingVideo');
            if (noddingVideo) noddingVideo.pause();
        }
        
        // ★ 완료 안내 팝업
        if (typeof showGuidePopup === 'function') {
            if (attemptNum === 1 && StageSelector._isRetryMode) {
                await showGuidePopup({
                    icon: '✅',
                    title: '연습 풀이가 완료되었습니다',
                    desc: '이전 시도 이력에서 결과를 확인할 수 있습니다.',
                    notice: '',
                    btn: '과제 화면으로',
                    theme: 'theme-purple'
                });
                StageSelector._isRetryMode = false;
            } else {
                await showGuidePopup({
                    icon: '✅',
                    title: attemptNum + '차 답변이 완료되었습니다',
                    desc: attemptNum === 1
                        ? '2차 답변도 진행해주세요.'
                        : '오답노트까지 제출하면 <b>100% 인증</b>됩니다.',
                    notice: '',
                    btn: '과제 화면으로',
                    theme: 'theme-green'
                });
            }
        }
        
        if (attemptNum === 1) {
            StageSelector.firstAttemptResult = speakingResult;
            if (window.StudySave) StudySave.saveFirstResult(speakingResult);
            backToStageSelect();
            updateSpeakingDashboard(speakingResult, '1st');
            var status1st = document.getElementById('stage1stStatus');
            if (status1st) { status1st.textContent = '✅ 완료'; status1st.classList.add('stage-status-done'); }
        } else {
            StageSelector.secondAttemptResult = speakingResult;
            if (window.StudySave) StudySave.saveSecondResult(speakingResult);
            backToStageSelect();
            updateSpeakingDashboard(speakingResult, '2nd');
            var status2nd = document.getElementById('stage2ndStatus');
            if (status2nd) { status2nd.textContent = '✅ 완료'; status2nd.classList.add('stage-status-done'); }
        }
    });
    
    controller.startModule();
}

// ========================================
// ★ 스피킹 해설 보기 (따라말하기 복습 → 인터뷰 복습 → 대시보드)
// ========================================
// DB에서 문제 원본 데이터를 불러와 컴포넌트를 재생성한 뒤 해설 화면을 표시합니다.
// 새로고침 후에도 DB 데이터만 있으면 해설을 정상적으로 볼 수 있습니다.
// ========================================

async function _showSpeakingExplainV2() {
    console.log('🎤 [V2] 스피킹 해설 시작: 따라말하기 복습');
    
    var moduleNumber = StageSelector.moduleNumber || 1;
    var setIndex = moduleNumber - 1;
    
    // 모든 화면 숨기기
    document.querySelectorAll('.screen').forEach(function(s) { s.style.display = 'none'; });
    document.querySelectorAll('.result-screen, .test-screen').forEach(function(s) { s.style.display = 'none'; });
    
    // ★ 컴포넌트가 메모리에 없으면 DB에서 데이터를 불러와 재생성
    if (!window.currentRepeatComponent || !window.currentRepeatComponent.speakingRepeatData) {
        console.log('🔄 [V2] 따라말하기 컴포넌트 없음 → DB에서 복원 시도');
        try {
            var repeatComp = new RepeatComponent();
            await repeatComp.loadRepeatData();
            
            if (repeatComp.speakingRepeatData && repeatComp.speakingRepeatData.sets && repeatComp.speakingRepeatData.sets.length > setIndex) {
                repeatComp.setId = moduleNumber;
                repeatComp.currentRepeatSet = setIndex;
                window.currentRepeatComponent = repeatComp;
                console.log('✅ [V2] 따라말하기 컴포넌트 DB에서 복원 성공');
            } else {
                console.warn('⚠️ [V2] 따라말하기 DB 데이터 없음 또는 세트 인덱스 초과');
                window.currentRepeatComponent = null;
            }
        } catch (err) {
            console.error('❌ [V2] 따라말하기 DB 복원 실패:', err);
            window.currentRepeatComponent = null;
        }
    }
    
    // 1. 따라말하기 복습 화면 표시
    var repeatScreen = document.getElementById('speakingRepeatResultScreen');
    if (repeatScreen && window.currentRepeatComponent) {
        repeatScreen.style.display = 'block';
        
        var repeatSetIndex = (window.currentRepeatComponent.setId || 1) - 1;
        var set = window.currentRepeatComponent.speakingRepeatData?.sets?.[repeatSetIndex] || window.currentRepeatComponent._cachedSet;
        if (set) {
            window.currentRepeatComponent.showRepeatResult({ set: set });
        }
        
        // 따라말하기 복습 완료 → 인터뷰 복습으로 연결
        var origComplete = window.currentRepeatComponent.completeRepeatResult;
        window.currentRepeatComponent.completeRepeatResult = function() {
            console.log('🎤 [V2] 따라말하기 복습 완료 → 인터뷰 복습으로');
            if (origComplete) origComplete.call(window.currentRepeatComponent);
            _showInterviewExplainV2().catch(function(err) {
                console.error('❌ [V2] 인터뷰 해설 로드 실패:', err);
                backToStageSelect();
            });
        };
    } else {
        console.warn('⚠️ [V2] 따라말하기 데이터 복원 실패, 인터뷰 복습으로 이동');
        _showInterviewExplainV2().catch(function(err) {
            console.error('❌ [V2] 인터뷰 해설 로드 실패:', err);
            backToStageSelect();
        });
    }
}

async function _showInterviewExplainV2() {
    console.log('🎙️ [V2] 인터뷰 복습 시작');
    
    var moduleNumber = StageSelector.moduleNumber || 1;
    var setIndex = moduleNumber - 1;
    
    document.querySelectorAll('.screen').forEach(function(s) { s.style.display = 'none'; });
    
    // ★ 컴포넌트가 메모리에 없으면 DB에서 데이터를 불러와 재생성
    if (!window.currentInterviewComponent || !window.currentInterviewComponent.speakingInterviewData) {
        console.log('🔄 [V2] 인터뷰 컴포넌트 없음 → DB에서 복원 시도');
        try {
            var interviewComp = new InterviewComponent();
            await interviewComp.loadInterviewData();
            
            if (interviewComp.speakingInterviewData && interviewComp.speakingInterviewData.sets && interviewComp.speakingInterviewData.sets.length > setIndex) {
                interviewComp.setId = moduleNumber;
                interviewComp.currentInterviewSet = setIndex;
                window.currentInterviewComponent = interviewComp;
                console.log('✅ [V2] 인터뷰 컴포넌트 DB에서 복원 성공');
            } else {
                console.warn('⚠️ [V2] 인터뷰 DB 데이터 없음 또는 세트 인덱스 초과');
                window.currentInterviewComponent = null;
            }
        } catch (err) {
            console.error('❌ [V2] 인터뷰 DB 복원 실패:', err);
            window.currentInterviewComponent = null;
        }
    }
    
    var interviewScreen = document.getElementById('speakingInterviewResultScreen');
    if (interviewScreen && window.currentInterviewComponent) {
        interviewScreen.style.display = 'block';
        
        if (typeof window.currentInterviewComponent.showInterviewResult === 'function') {
            var interviewData = window.currentInterviewComponent.speakingInterviewData;
            var currentSet = window.currentInterviewComponent.currentInterviewSet || 0;
            var set = interviewData?.sets?.[currentSet] || interviewData?.sets?.[0];
            if (set) {
                window.currentInterviewComponent.showInterviewResult({ set: set });
            }
        }
        
        // 인터뷰 복습 완료 → 대시보드 복귀 연결
        setTimeout(function() {
            var backBtns = interviewScreen.querySelectorAll('.btn-back-to-schedule, [onclick*="backToSchedule"]');
            backBtns.forEach(function(btn) {
                btn.onclick = function(e) {
                    e.preventDefault();
                    console.log('🏠 [V2] 인터뷰 복습 완료 → 대시보드');
                    backToStageSelect();
                };
            });
            
            if (window.currentInterviewComponent) {
                var origIntComplete = window.currentInterviewComponent.completeInterviewResult;
                window.currentInterviewComponent.completeInterviewResult = function() {
                    console.log('🏠 [V2] 인터뷰 복습 완료 → 대시보드');
                    if (origIntComplete) origIntComplete.call(window.currentInterviewComponent);
                    backToStageSelect();
                };
            }
        }, 500);
    } else {
        console.warn('⚠️ [V2] 인터뷰 데이터 복원 실패, 대시보드로 복귀');
        backToStageSelect();
    }
}

// ========================================
// 오답노트 제출 → study_results_v2 업데이트
// ========================================
window.addEventListener('errorNoteSubmitted', function(e) {
    if (window.StudySave) {
        var detail = e.detail || {};
        var noteText = detail.text || '';
        var speakingFile1 = detail.speakingFile1 || null;
        var speakingFile2 = detail.speakingFile2 || null;
        StudySave.saveErrorNoteSubmitted(noteText, speakingFile1, speakingFile2);
        console.log('📝 [V2] 오답노트 제출 → DB 업데이트 (내용 ' + noteText.length + '자, 녹음파일: ' + (detail.speakingFileCount || 0) + '개)');
    }
});

// ========================================
// 기존 진입점 함수를 StageSelector로 대체
// ========================================
window.startReadingModule = function(moduleNum) {
    StageSelector.show('reading', moduleNum);
};

window.startListeningModule = function(moduleNum) {
    StageSelector.show('listening', moduleNum);
};

window.startWriting = function(number) {
    StageSelector.show('writing', number);
};

window.startSpeaking = function(number) {
    StageSelector.show('speaking', number);
};

// 전역 노출
window.StageSelector = StageSelector;

// ========================================
// [V2] executeTask 오버라이드
// 기존: 시작 확인 팝업 → 마감 체크 → FlowController.start()
// V2:   팝업 없이 바로 → StageSelector.show()
// ========================================
window.executeTask = function(taskName) {
    console.log(`📝 [V2] 과제 실행 (팝업 스킵): ${taskName}`);
    
    // parseTaskName은 task-router.js에서 이미 정의됨
    const parsed = parseTaskName(taskName);
    console.log('  파싱 결과:', parsed);
    
    switch (parsed.type) {
        case 'reading':
            StageSelector.show('reading', parsed.params.module);
            break;
        case 'listening':
            StageSelector.show('listening', parsed.params.module);
            break;
        case 'writing':
            StageSelector.show('writing', parsed.params.number);
            break;
        case 'speaking':
            StageSelector.show('speaking', parsed.params.number);
            break;
        case 'vocab':
            // 보카는 기존 플로우 그대로 (리팩토링 대상 아님)
            if (typeof _launchVocabModule === 'function') {
                _launchVocabModule(parsed.params.pages);
            }
            break;
        case 'intro-book':
            // 입문서도 기존 그대로
            if (typeof openIntroBookModal === 'function') {
                openIntroBookModal(taskName);
            }
            break;
        default:
            console.error('  ❌ 알 수 없는 과제 타입:', parsed.type);
            alert('알 수 없는 과제 타입입니다.');
    }
};

console.log('✅ [V2] stage-selector.js 로드 완료');
console.log('   - startReadingModule() → StageSelector.show()');
console.log('   - startListeningModule() → StageSelector.show()');
console.log('   - startWriting() → StageSelector.show()');
console.log('   - startSpeaking() → StageSelector.show()');
