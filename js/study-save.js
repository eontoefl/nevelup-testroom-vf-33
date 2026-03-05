/**
 * ================================================
 * study-save.js — V2 공통 학습 결과 저장 모듈
 * ================================================
 * 테이블: study_results_v2
 * 
 * 저장 시점:
 *   1차 결과 화면 표시 시 → saveFirstResult()
 *   2차 결과 화면 표시 시 → saveSecondResult()
 *   오답노트 제출 시 → saveErrorNoteSubmitted()
 * 
 * ★ 다시 풀기 시스템 (RETRY_SYSTEM_SPEC v8):
 *   - 첫 사이클 완료 후 다시 풀기 시 이전 1차 결과를 이력에 보관
 *   - first_level은 최초 1회만 저장 (이후 절대 덮어쓰지 않음)
 *   - 오답노트 제출 시 locked_auth_rate 확정 (NULL이면 100으로)
 *   - loadSavedResults()에 이력 + 확정 인증률 반환 추가
 * 
 * 의존: supabase-client.js (supabaseUpsert, supabaseSelect, supabaseUpdate)
 *       auth.js (getCurrentUser)
 */

const StudySave = (function() {
    'use strict';
    
    const TABLE = 'study_results_v2';
    
    /**
     * 현재 학습 세션의 고유 키 생성
     * user_id + section_type + module_number + week + day 조합
     */
    function _getSessionKey() {
        const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (!user || !user.id) {
            console.warn('⚠️ [StudySave] 유저 정보 없음');
            return null;
        }
        
        const ct = window.currentTest || {};
        return {
            user_id: user.id,
            section_type: StageSelector.sectionType || '',
            module_number: StageSelector.moduleNumber || 1,
            week: String(ct.currentWeek || 1).replace(/[^0-9]/g, '') || '1',
            day: ct.currentDay || '일'
        };
    }
    
    /**
     * 기존 레코드 조회 (upsert용)
     */
    async function _findExisting(key) {
        try {
            const query = `user_id=eq.${key.user_id}&section_type=eq.${key.section_type}&module_number=eq.${key.module_number}&week=eq.${encodeURIComponent(key.week)}&day=eq.${encodeURIComponent(key.day)}&limit=1`;
            const records = await supabaseSelect(TABLE, query);
            return (records && records.length > 0) ? records[0] : null;
        } catch (e) {
            console.error('❌ [StudySave] 기존 레코드 조회 실패:', e);
            return null;
        }
    }
    
    /**
     * 첫 사이클 완료 여부 판단
     * second_result_json이 존재하고 error_note_submitted가 true이면 → 완료
     */
    function _isFirstCycleComplete(record) {
        return record && record.second_result_json && record.error_note_submitted === true;
    }
    
    /**
     * 레벨 계산 (1.0 ~ 6.0)
     * 리딩/리스닝만 해당, 라이팅/스피킹은 null 반환
     */
    function _calculateLevel(sectionType, totalCorrect) {
        if (sectionType === 'reading') {
            if (totalCorrect <= 3) return 1.0;
            if (totalCorrect <= 6) return 1.5;
            if (totalCorrect <= 10) return 2.0;
            if (totalCorrect <= 13) return 2.5;
            if (totalCorrect <= 17) return 3.0;
            if (totalCorrect <= 20) return 3.5;
            if (totalCorrect <= 24) return 4.0;
            if (totalCorrect <= 27) return 4.5;
            if (totalCorrect <= 30) return 5.0;
            if (totalCorrect <= 32) return 5.5;
            return 6.0;
        } else if (sectionType === 'listening') {
            if (totalCorrect <= 2) return 1.0;
            if (totalCorrect <= 5) return 1.5;
            if (totalCorrect <= 8) return 2.0;
            if (totalCorrect <= 11) return 2.5;
            if (totalCorrect <= 15) return 3.0;
            if (totalCorrect <= 18) return 3.5;
            if (totalCorrect <= 21) return 4.0;
            if (totalCorrect <= 24) return 4.5;
            if (totalCorrect <= 27) return 5.0;
            if (totalCorrect <= 29) return 5.5;
            return 6.0;
        }
        return null; // 라이팅/스피킹은 레벨 없음
    }
    
    /**
     * 1차 결과 저장
     * ★ 다시 풀기 시스템 핵심 로직:
     *   - 기존 레코드 없음 → 새로 INSERT (first_level 저장)
     *   - 기존 레코드 있음 + 첫 사이클 미완성 → first_result_json 교체, first_level은 NULL일 때만 저장
     *   - 기존 레코드 있음 + 첫 사이클 완료 (= 다시 풀기) → 이전 결과를 이력에 보관 후 교체
     * 
     * @param {object} moduleResult - ModuleController가 반환한 결과
     */
    async function saveFirstResult(moduleResult) {
        console.log('💾 [StudySave] 1차 결과 저장 시작');
        
        const key = _getSessionKey();
        if (!key) {
            console.error('❌ [StudySave] 세션 키 없음 — 저장 실패');
            return null;
        }
        
        // 점수 계산
        let totalCorrect = 0;
        if (moduleResult.componentResults) {
            moduleResult.componentResults.forEach(function(comp) {
                const answers = comp.answers || [];
                totalCorrect += answers.filter(function(a) { return a.isCorrect; }).length;
            });
        }
        
        // 레벨 계산
        const sectionType = key.section_type;
        const calculatedLevel = _calculateLevel(sectionType, totalCorrect);
        
        // 새 1차 결과 JSON
        const newFirstResultJson = JSON.stringify({
            ...moduleResult,
            totalCorrect: totalCorrect,
            totalQuestions: moduleResult.totalQuestions,
            percentage: Math.round((totalCorrect / (moduleResult.totalQuestions || 1)) * 100)
        });
        
        // 기존 레코드 확인
        const existing = await _findExisting(key);
        
        try {
            // ── 케이스 1: 기존 레코드 없음 (최초 풀이) ──
            if (!existing) {
                console.log('📝 [StudySave] 최초 풀이 — 새 레코드 생성');
                const data = {
                    ...key,
                    first_result_json: newFirstResultJson,
                    first_level: calculatedLevel,
                    completed_at: new Date().toISOString()
                };
                const result = await supabaseUpsert(TABLE, data, 'id');
                console.log('✅ [StudySave] 1차 결과 저장 완료 (최초):', totalCorrect + '/' + moduleResult.totalQuestions);
                return result;
            }
            
            // ── 케이스 2: 기존 레코드 있음 + 첫 사이클 완료 (= 다시 풀기) ──
            if (_isFirstCycleComplete(existing)) {
                console.log('🔄 [StudySave] 다시 풀기 감지 — 이전 결과를 이력에 보관');
                
                // 이력 주머니에 현재 1차 결과 추가
                var historyArray = [];
                if (existing.first_history_json) {
                    try {
                        historyArray = typeof existing.first_history_json === 'string' 
                            ? JSON.parse(existing.first_history_json) 
                            : existing.first_history_json;
                    } catch(e) {
                        console.warn('⚠️ [StudySave] 이력 JSON 파싱 실패, 새 배열로 시작');
                        historyArray = [];
                    }
                }
                if (!Array.isArray(historyArray)) historyArray = [];
                
                // 현재 first_result_json을 이력에 추가
                if (existing.first_result_json) {
                    var currentFirstResult = null;
                    try {
                        currentFirstResult = typeof existing.first_result_json === 'string'
                            ? JSON.parse(existing.first_result_json)
                            : existing.first_result_json;
                    } catch(e) {
                        currentFirstResult = existing.first_result_json;
                    }
                    
                    historyArray.push({
                        attempt: historyArray.length + 1,
                        date: new Date().toISOString(),
                        result: currentFirstResult
                    });
                    console.log('📦 [StudySave] 이력 보관 완료 — 총', historyArray.length, '건');
                }
                
                // 다시 풀기: 1차 결과만 교체, 나머지 절대 건드리지 않음
                const updateData = {
                    first_result_json: newFirstResultJson,
                    first_history_json: JSON.stringify(historyArray),
                    completed_at: new Date().toISOString()
                    // ★ first_level 건드리지 않음
                    // ★ second_result_json 건드리지 않음
                    // ★ error_note_submitted 건드리지 않음
                    // ★ locked_auth_rate 건드리지 않음
                };
                
                const result = await supabaseUpdate(TABLE, `id=eq.${existing.id}`, updateData);
                console.log('✅ [StudySave] 1차 결과 저장 완료 (다시 풀기):', totalCorrect + '/' + moduleResult.totalQuestions);
                return result;
            }
            
            // ── 케이스 3: 기존 레코드 있음 + 첫 사이클 미완성 (이어서 진행) ──
            console.log('📝 [StudySave] 첫 사이클 진행 중 — 1차 결과 갱신');
            const updateData = {
                first_result_json: newFirstResultJson,
                completed_at: new Date().toISOString()
            };
            
            // ★ first_level 보호: 기존 값이 NULL일 때만 새로 저장
            if (existing.first_level == null && calculatedLevel != null) {
                updateData.first_level = calculatedLevel;
                console.log('📝 [StudySave] first_level 최초 저장:', calculatedLevel);
            } else {
                console.log('🔒 [StudySave] first_level 보호 — 기존 값 유지:', existing.first_level);
            }
            
            const result = await supabaseUpdate(TABLE, `id=eq.${existing.id}`, updateData);
            console.log('✅ [StudySave] 1차 결과 저장 완료 (이어서):', totalCorrect + '/' + moduleResult.totalQuestions);
            return result;
            
        } catch (e) {
            console.error('❌ [StudySave] 1차 결과 저장 실패:', e);
            return null;
        }
    }
    
    /**
     * 2차 결과 저장
     * @param {object} secondResults - RetakeController.gradeSecondAttempt() 결과
     */
    async function saveSecondResult(secondResults) {
        console.log('💾 [StudySave] 2차 결과 저장 시작');
        
        const key = _getSessionKey();
        if (!key) {
            console.error('❌ [StudySave] 세션 키 없음 — 저장 실패');
            return null;
        }
        
        // 기존 레코드 확인 (1차 저장 시 생성된 row)
        const existing = await _findExisting(key);
        if (!existing) {
            console.error('❌ [StudySave] 1차 결과 레코드 없음 — 2차 저장 불가');
            return null;
        }
        
        try {
            const result = await supabaseUpdate(TABLE, `id=eq.${existing.id}`, {
                second_result_json: JSON.stringify(secondResults)
            });
            console.log('✅ [StudySave] 2차 결과 저장 완료');
            return result;
        } catch (e) {
            console.error('❌ [StudySave] 2차 결과 저장 실패:', e);
            return null;
        }
    }
    
    /**
     * 오답노트 제출 상태 + 내용 저장
     * ★ 다시 풀기 시스템: 오답노트 제출 = 첫 사이클 완료 시점
     *   → locked_auth_rate가 NULL이면 100으로 확정
     */
    async function saveErrorNoteSubmitted(noteText, speakingFile1, speakingFile2) {
        console.log('💾 [StudySave] 오답노트 제출 저장 시작');
        
        const key = _getSessionKey();
        if (!key) {
            console.error('❌ [StudySave] 세션 키 없음 — 저장 실패');
            return null;
        }
        
        const existing = await _findExisting(key);
        if (!existing) {
            console.error('❌ [StudySave] 기존 레코드 없음 — 오답노트 저장 불가');
            return null;
        }
        
        try {
            var updateData = {
                error_note_submitted: true
            };
            if (noteText) {
                updateData.error_note_text = noteText;
            }
            // ★ 스피킹 녹음 파일 경로 저장
            if (speakingFile1) {
                updateData.speaking_file_1 = speakingFile1;
            }
            if (speakingFile2) {
                updateData.speaking_file_2 = speakingFile2;
            }
            
            // ★ 다시 풀기 시스템: 첫 사이클 완료 시 인증률 확정
            // 오답노트 제출 = 첫 사이클의 마지막 단계
            // locked_auth_rate가 아직 NULL이면 → 100으로 확정
            if (existing.locked_auth_rate == null) {
                updateData.locked_auth_rate = 100;
                console.log('🔒 [StudySave] 인증률 100% 확정 (첫 사이클 완료)');
            }
            
            const result = await supabaseUpdate(TABLE, `id=eq.${existing.id}`, updateData);
            console.log('✅ [StudySave] 오답노트 제출 저장 완료' + (noteText ? ' (내용 ' + noteText.length + '자)' : '') + (speakingFile1 ? ' (녹음파일 포함)' : ''));
            return result;
        } catch (e) {
            console.error('❌ [StudySave] 오답노트 저장 실패:', e);
            return null;
        }
    }
    
    /**
     * 인증률 계산
     * ★ 다시 풀기 시스템: 모든 섹션 통일 33/66/100
     * (기존 스피킹 30/30/40 → 33/66/100으로 변경)
     */
    async function getAuthRate() {
        const key = _getSessionKey();
        if (!key) return { total: 3, completed: 0, percentage: 0 };
        
        const existing = await _findExisting(key);
        if (!existing) return { total: 3, completed: 0, percentage: 0 };
        
        // ★ 확정된 인증률이 있으면 그대로 사용
        if (existing.locked_auth_rate != null) {
            var lockedRate = Number(existing.locked_auth_rate);
            var completedCount = lockedRate === 100 ? 3 : (lockedRate >= 66 ? 2 : (lockedRate >= 33 ? 1 : 0));
            return { total: 3, completed: completedCount, percentage: lockedRate };
        }
        
        // 모든 섹션 통일: 33 + 33 + 34 = 100 (스피킹 포함)
        let completed = 0;
        let rate = 0;
        if (existing.first_result_json) { completed++; rate += 33; }
        if (existing.second_result_json) { completed++; rate += 33; }
        if (existing.error_note_submitted) { completed++; rate += 34; }
        
        return {
            total: 3,
            completed: completed,
            percentage: rate
        };
    }
    
    /**
     * 현재 세션의 저장된 결과 불러오기 (페이지 새로고침 시 복원용)
     * ★ 다시 풀기 시스템: first_history_json, locked_auth_rate 추가 반환
     */
    async function loadSavedResults() {
        const key = _getSessionKey();
        if (!key) return null;
        
        const existing = await _findExisting(key);
        if (!existing) return null;
        
        // 이력 주머니 파싱
        var historyArray = null;
        if (existing.first_history_json) {
            try {
                historyArray = typeof existing.first_history_json === 'string'
                    ? JSON.parse(existing.first_history_json)
                    : existing.first_history_json;
            } catch(e) {
                historyArray = null;
            }
        }
        
        return {
            firstResult: existing.first_result_json ? JSON.parse(existing.first_result_json) : null,
            secondResult: existing.second_result_json ? JSON.parse(existing.second_result_json) : null,
            errorNoteSubmitted: existing.error_note_submitted || false,
            errorNoteText: existing.error_note_text || null,
            speakingFile1: existing.speaking_file_1 || null,
            speakingFile2: existing.speaking_file_2 || null,
            // ★ 다시 풀기 시스템 추가 필드
            firstHistoryJson: historyArray,
            lockedAuthRate: existing.locked_auth_rate != null ? Number(existing.locked_auth_rate) : null
        };
    }
    
    /**
     * 지연 잠금: 기한 초과 시 현재 인증률을 확정
     * stage-selector.js의 _loadFromDB()에서 호출
     * @param {number} rate - 확정할 인증률 (33, 66, 100)
     */
    async function setDelayedLock(rate) {
        console.log('🔒 [StudySave] 지연 잠금 시작 — 인증률', rate, '%');
        
        const key = _getSessionKey();
        if (!key) {
            console.error('❌ [StudySave] 세션 키 없음 — 지연 잠금 실패');
            return null;
        }
        
        const existing = await _findExisting(key);
        if (!existing) {
            console.error('❌ [StudySave] 기존 레코드 없음 — 지연 잠금 실패');
            return null;
        }
        
        // 이미 확정된 경우 스킵
        if (existing.locked_auth_rate != null) {
            console.log('🔒 [StudySave] 이미 잠금됨 — 스킵:', existing.locked_auth_rate);
            return existing;
        }
        
        try {
            const result = await supabaseUpdate(TABLE, `id=eq.${existing.id}`, {
                locked_auth_rate: rate
            });
            console.log('✅ [StudySave] 지연 잠금 완료 — 인증률', rate, '% 확정');
            return result;
        } catch (e) {
            console.error('❌ [StudySave] 지연 잠금 저장 실패:', e);
            return null;
        }
    }
    
    // 공개 API
    return {
        saveFirstResult: saveFirstResult,
        saveSecondResult: saveSecondResult,
        saveErrorNoteSubmitted: saveErrorNoteSubmitted,
        getAuthRate: getAuthRate,
        loadSavedResults: loadSavedResults,
        setDelayedLock: setDelayedLock,
        // ★ 유틸리티 (외부에서 레벨 재계산 시 사용)
        calculateLevel: _calculateLevel,
        isFirstCycleComplete: _isFirstCycleComplete
    };
})();

// 전역 노출
window.StudySave = StudySave;

console.log('✅ [V2] study-save.js 로드 완료 (다시 풀기 시스템 v8)');
console.log('   - StudySave.saveFirstResult() — 이력 보관 + first_level 보호');
console.log('   - StudySave.saveSecondResult()');
console.log('   - StudySave.saveErrorNoteSubmitted() — locked_auth_rate 확정');
console.log('   - StudySave.getAuthRate() — 스피킹 33/66/100 통일');
console.log('   - StudySave.loadSavedResults() — 이력 + 확정 인증률 포함');
console.log('   - StudySave.setDelayedLock() — 기한 초과 시 인증률 확정');
