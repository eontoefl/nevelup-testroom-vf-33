/**
 * ================================================
 * error-note.js
 * V3 스플릿 메모장 오답노트 컴포넌트
 * ================================================
 *
 * 역할:
 *   해설 화면(explainViewerScreen) 우측 메모장 제어
 *   - 선택 모드(실전풀이/다시풀기)에 따라 오답노트 로드·저장
 *   - 실전풀이 → error_note_text + error_note_submitted (제출 후 영구 잠금)
 *   - 다시풀기 → current_error_note_text (덮어쓰기 가능)
 *   - 단어 수 카운트, 자동저장(localStorage), 제출(DB)
 *   - 마감 후 실전풀이 오답노트 작성 불가
 *
 * 의존:
 *   supabase-client.js (supabaseUpdate, getStudyResultV3, getCurrentUser)
 *   explain-viewer.js  (_explainState, 선택 시 ErrorNote.init 호출)
 *
 * 참조: v3-design-spec.md §8, §2-5-A
 */

var ErrorNote = {

    // ─── 내부 상태 ───
    _activeTab: 'initial',    // 'initial' | 'current'
    _dbRow: null,             // study_results_v3 레코드
    _isSubmitted: false,      // 현재 탭에서 제출 완료 여부
    _autoSaveTimer: null,
    _autoSaveKey: null,       // localStorage 키

    // ========================================
    // 단어 수 카운트
    // ========================================
    countWords: function(text) {
        if (!text || !text.trim()) return 0;
        return text.trim().split(/\s+/).length;
    },

    // ========================================
    // 해설 화면 진입 시 호출
    // ========================================
    init: function(dbRow, sectionType, moduleNumber, activeTab) {
        console.log('📝 [메모장] 초기화:', sectionType, 'M' + moduleNumber, '탭:', activeTab);

        this._dbRow = dbRow;
        this._activeTab = activeTab || 'initial';
        this._isSubmitted = false;

        // 자동저장 키 설정
        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        var userId = (user && user.id) ? user.id : 'unknown';
        this._autoSaveKey = 'errornote_' + userId + '_' + sectionType + '_' + moduleNumber;

        this._renderMemo();
        this._bindEvents();
    },

    // ========================================
    // 메모장 상태 렌더링 (핵심)
    // ========================================
    _renderMemo: function() {
        var textarea = document.getElementById('explainMemoTextarea');
        var submitBtn = document.getElementById('explainMemoSubmitBtn');
        var statusArea = document.getElementById('explainMemoStatus');
        var statusMsg = document.getElementById('explainMemoStatusMsg');
        var bodyArea = document.getElementById('explainMemoBody');
        var footerArea = document.querySelector('.explain-memo-footer');
        var autoSaveEl = document.getElementById('explainMemoAutoSave');

        if (!textarea || !submitBtn) return;

        var row = this._dbRow;
        var tab = this._activeTab;
        var deadlinePassed = window._deadlinePassedMode || false;

        // ── 실전풀이 탭 ──
        if (tab === 'initial') {
            var hasInitial = row && row.initial_record != null;
            var alreadySubmitted = row && row.error_note_submitted === true;
            var existingText = (row && row.error_note_text) || '';

            if (alreadySubmitted) {
                // 이미 제출됨 → 읽기전용
                this._showReadonly(textarea, submitBtn, statusArea, statusMsg, bodyArea, footerArea, existingText, '제출 완료된 오답노트입니다. (수정 불가)');
            } else if (deadlinePassed) {
                // 마감 지남 + 미제출 → 잠김
                this._showLocked(textarea, submitBtn, statusArea, statusMsg, bodyArea, footerArea, '마감으로 인해 작성이 불가합니다.');
            } else if (!hasInitial) {
                // 실전풀이 안 함 → 잠김
                this._showLocked(textarea, submitBtn, statusArea, statusMsg, bodyArea, footerArea, '실전풀이를 완료한 후 작성할 수 있습니다.');
            } else {
                // 작성 가능
                this._showEditable(textarea, submitBtn, statusArea, bodyArea, footerArea, existingText);
            }

        // ── 다시풀기 탭 ──
        } else {
            var hasCurrent = row && row.current_record != null;
            var existingCurrentText = (row && row.current_error_note_text) || '';

            if (!hasCurrent) {
                // 다시풀기 안 함 → 잠김
                this._showLocked(textarea, submitBtn, statusArea, statusMsg, bodyArea, footerArea, '다시풀기를 완료한 후 작성할 수 있습니다.');
            } else {
                // 작성 가능 (덮어쓰기 가능)
                this._showEditable(textarea, submitBtn, statusArea, bodyArea, footerArea, existingCurrentText);
            }
        }

        // localStorage에 임시 저장된 내용이 있으면 복원 (DB 내용이 없을 때만)
        if (!textarea.readOnly && !textarea.value) {
            var localKey = this._autoSaveKey + '_' + tab;
            var saved = localStorage.getItem(localKey);
            if (saved) {
                textarea.value = saved;
                if (autoSaveEl) autoSaveEl.textContent = '임시 저장된 내용을 불러왔습니다';
            }
        }

        this._updateWordCount();
    },

    // ── 상태별 UI 세팅 ──

    _showReadonly: function(textarea, submitBtn, statusArea, statusMsg, bodyArea, footerArea, text, msg) {
        if (statusArea) { statusArea.style.display = 'flex'; }
        if (statusMsg) { statusMsg.textContent = msg; }
        if (bodyArea) { bodyArea.style.display = 'block'; }
        if (footerArea) { footerArea.style.display = 'none'; }
        textarea.value = text;
        textarea.readOnly = true;
        textarea.disabled = true;
        submitBtn.style.display = 'none';
    },

    _showLocked: function(textarea, submitBtn, statusArea, statusMsg, bodyArea, footerArea, msg) {
        if (statusArea) { statusArea.style.display = 'flex'; }
        if (statusMsg) { statusMsg.textContent = msg; }
        if (bodyArea) { bodyArea.style.display = 'none'; }
        if (footerArea) { footerArea.style.display = 'none'; }
        textarea.value = '';
        textarea.readOnly = true;
        textarea.disabled = true;
        submitBtn.style.display = 'none';
    },

    _showEditable: function(textarea, submitBtn, statusArea, bodyArea, footerArea, existingText) {
        if (statusArea) { statusArea.style.display = 'none'; }
        if (bodyArea) { bodyArea.style.display = 'block'; }
        if (footerArea) { footerArea.style.display = 'flex'; }
        textarea.value = existingText;
        textarea.readOnly = false;
        textarea.disabled = false;
        submitBtn.style.display = '';
        submitBtn.disabled = false;
        submitBtn.textContent = '제출하기';
        submitBtn.classList.remove('submitted');
    },

    // ========================================
    // 이벤트 바인딩
    // ========================================
    _bindEvents: function() {
        var self = this;
        var textarea = document.getElementById('explainMemoTextarea');
        var submitBtn = document.getElementById('explainMemoSubmitBtn');

        if (textarea) {
            // 기존 리스너 제거 후 재등록
            textarea.oninput = function() {
                self._updateWordCount();
                self._scheduleAutoSave();
            };
        }

        if (submitBtn) {
            submitBtn.onclick = function() {
                self.handleSubmit();
            };
        }
    },

    // ========================================
    // 단어 수 업데이트 + 제출 버튼 활성화
    // ========================================
    _updateWordCount: function() {
        var textarea = document.getElementById('explainMemoTextarea');
        var countEl = document.getElementById('explainMemoWordCount');
        var submitBtn = document.getElementById('explainMemoSubmitBtn');
        if (!textarea || !countEl) return;

        var count = this.countWords(textarea.value);
        countEl.textContent = count + ' / 20 단어';

        if (count >= 20) {
            countEl.style.color = '#22c55e';
        } else {
            countEl.style.color = '#ef4444';
        }

        // 20단어 이상이어야 제출 가능
        if (submitBtn && !textarea.readOnly) {
            submitBtn.disabled = count < 20;
        }
    },

    // ========================================
    // 자동저장 (localStorage)
    // ========================================
    _scheduleAutoSave: function() {
        var self = this;
        if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);

        this._autoSaveTimer = setTimeout(function() {
            self._saveToLocal();
        }, 2000);
    },

    _saveToLocal: function() {
        var textarea = document.getElementById('explainMemoTextarea');
        if (!textarea || textarea.readOnly) return;

        var localKey = this._autoSaveKey + '_' + this._activeTab;
        var text = textarea.value.trim();

        if (text) {
            localStorage.setItem(localKey, text);
            var autoSaveEl = document.getElementById('explainMemoAutoSave');
            if (autoSaveEl) {
                autoSaveEl.textContent = '자동 저장됨';
                setTimeout(function() {
                    if (autoSaveEl) autoSaveEl.textContent = '';
                }, 2000);
            }
        }
    },

    _clearLocal: function() {
        var localKey = this._autoSaveKey + '_' + this._activeTab;
        localStorage.removeItem(localKey);
    },

    // ========================================
    // 제출 처리
    // ========================================
    handleSubmit: function() {
        var textarea = document.getElementById('explainMemoTextarea');
        if (!textarea) return;

        var text = textarea.value.trim();
        var wordCount = this.countWords(text);

        if (wordCount < 20) {
            alert('오답노트는 20단어 이상 작성해야 제출할 수 있습니다.\n현재 ' + wordCount + '단어입니다.');
            return;
        }

        this._submitToDb(text, wordCount);
    },

    // ========================================
    // DB 저장 (study_results_v3)
    // ========================================
    _submitToDb: async function(text, wordCount) {
        var row = this._dbRow;
        if (!row || !row.id) {
            console.error('📝 [메모장] DB 레코드 없음 — 저장 불가');
            alert('저장할 수 없습니다. 페이지를 새로고침 후 다시 시도해 주세요.');
            return;
        }

        var submitBtn = document.getElementById('explainMemoSubmitBtn');
        var textarea = document.getElementById('explainMemoTextarea');

        // 저장 중 UI
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '저장 중...';
        }

        try {
            var updateData = {};

            if (this._activeTab === 'initial') {
                updateData.error_note_text = text;
                updateData.error_note_submitted = true;
            } else {
                updateData.current_error_note_text = text;
            }

            await supabaseUpdate('study_results_v3', 'id=eq.' + row.id, updateData);

            // 로컬 상태 업데이트
            if (this._activeTab === 'initial') {
                row.error_note_text = text;
                row.error_note_submitted = true;
            } else {
                row.current_error_note_text = text;
            }

            // localStorage 임시 저장 삭제
            this._clearLocal();

            // 제출 완료 UI
            this._isSubmitted = true;

            if (this._activeTab === 'initial') {
                // 실전풀이 오답노트 → 영구 잠금
                if (textarea) {
                    textarea.readOnly = true;
                    textarea.disabled = true;
                }
                if (submitBtn) {
                    submitBtn.textContent = '제출 완료';
                    submitBtn.classList.add('submitted');
                }
                console.log('📝 [메모장] 실전풀이 오답노트 제출 완료 (영구 잠금)');
            } else {
                // 다시풀기 오답노트 → 제출 완료 표시 (재수정 가능)
                if (submitBtn) {
                    submitBtn.textContent = '제출 완료';
                    submitBtn.classList.add('submitted');
                }
                console.log('📝 [메모장] 다시풀기 오답노트 제출 완료');
            }

        } catch (e) {
            console.error('📝 [메모장] 저장 실패:', e);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '저장 실패 — 다시 시도';
            }
        }
    },

    // ========================================
    // 정리 (해설 화면 나갈 때)
    // ========================================
    cleanup: function() {
        console.log('📝 [메모장] 정리');
        this._saveToLocal();
        if (this._autoSaveTimer) {
            clearTimeout(this._autoSaveTimer);
            this._autoSaveTimer = null;
        }
        this._dbRow = null;
        this._activeTab = 'initial';
        this._isSubmitted = false;
        this._autoSaveKey = null;
    }
};

console.log('✅ error-note.js 로드 완료 (V3 스플릿 메모장)');
