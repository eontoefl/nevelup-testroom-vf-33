/**
 * ================================================
 * error-note.js
 * V3 스플릿 메모장 오답노트 컴포넌트
 * ================================================
 *
 * 역할:
 *   해설 화면(explainViewerScreen) 우측 메모장 제어
 *   - 선택 모드(실전풀이/다시풀기)에 따라 오답노트 로드·저장
 *   - 실전풀이 → error_note_text + error_note_submitted (마감 시 잠금, 마감 전 수정·재제출 가능)
 *   - 다시풀기 → current_error_note_text (덮어쓰기 가능)
 *   - 단어 수 카운트, 자동저장(localStorage), 제출(DB)
 *   - 마감 후 실전풀이 오답노트 작성 불가
 *   - 스피킹 과제: 실전풀이 탭에서 녹음 파일 첨부 + 업로드
 *
 * 의존:
 *   supabase-client.js (supabaseUpdate, supabaseStorageUpload, getStudyResultV3, getCurrentUser)
 *   explain-viewer.js  (_explainState, 선택 시 ErrorNote.init 호출)
 *
 * 참조: v3-design-spec.md §8, §2-5-A, §2-5-1
 */

var ErrorNote = {

    // ─── 내부 상태 ───
    _activeTab: 'initial',    // 'initial' | 'current'
    _sectionType: null,       // 'reading' | 'listening' | 'writing' | 'speaking'
    _moduleNumber: null,
    _dbRow: null,             // study_results_v3 레코드
    _isSubmitted: false,      // 현재 탭에서 제출 완료 여부
    _autoSaveTimer: null,
    _autoSaveKey: null,       // localStorage 키
    _selectedFile: null,      // 스피킹 녹음 파일 (File 객체)

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
        this._sectionType = sectionType;
        this._moduleNumber = moduleNumber;
        this._isSubmitted = false;
        this._selectedFile = null;

        // 자동저장 키 설정
        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        var userId = (user && user.id) ? user.id : 'unknown';
        this._autoSaveKey = 'errornote_' + userId + '_' + sectionType + '_' + moduleNumber;

        this._renderMemo();
        this._renderSpeakingFileArea();
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
            var existingText = (row && row.error_note_text) || '';

            if (deadlinePassed) {
                // 마감 지남 → 제출 여부 무관하게 잠김
                if (existingText) {
                    this._showReadonly(textarea, submitBtn, statusArea, statusMsg, bodyArea, footerArea, existingText, '마감으로 인해 수정이 불가합니다.');
                } else {
                    this._showLocked(textarea, submitBtn, statusArea, statusMsg, bodyArea, footerArea, '마감으로 인해 작성이 불가합니다.');
                }
            } else if (!hasInitial) {
                // 실전풀이 안 함 → 잠김
                this._showLocked(textarea, submitBtn, statusArea, statusMsg, bodyArea, footerArea, '실전풀이를 완료한 후 작성할 수 있습니다.');
            } else {
                // 마감 전 → 제출 후에도 수정·재제출 가능
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

    // ========================================
    // 스피킹 파일 첨부 영역 렌더링
    // ========================================
    _renderSpeakingFileArea: function() {
        var fileArea = document.getElementById('explainSpeakingFileArea');
        var fileInput = document.getElementById('explainSpeakingFileInput');
        var fileMsg = document.getElementById('explainSpeakingFileMsg');
        if (!fileArea) return;

        var isSpeaking = this._sectionType === 'speaking';
        var isInitialTab = this._activeTab === 'initial';
        var row = this._dbRow;
        var deadlinePassed = window._deadlinePassedMode || false;
        var hasFile = row && row.speaking_file_1;

        // 스피킹 + 실전풀이 탭만 표시
        if (isSpeaking && isInitialTab) {
            fileArea.style.display = 'block';

            if (deadlinePassed) {
                // 마감 지남 → 잠금
                if (fileInput) { fileInput.disabled = true; fileInput.style.display = 'none'; }
                if (fileMsg) {
                    if (hasFile) {
                        fileMsg.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#77bf7e"></i> 파일 첨부 완료';
                    } else {
                        fileMsg.textContent = '마감으로 인해 파일 첨부가 불가합니다.';
                    }
                    fileMsg.style.color = '#64748b';
                }
            } else {
                // 마감 전 → 제출 여부 무관하게 파일 첨부 가능
                if (fileInput) { fileInput.disabled = false; fileInput.style.display = ''; fileInput.value = ''; }
                if (fileMsg) {
                    if (hasFile) {
                        fileMsg.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#77bf7e"></i> 파일 첨부됨 (변경 가능)';
                    } else {
                        fileMsg.textContent = '녹음 파일을 첨부해주세요. (최대 25MB)';
                    }
                    fileMsg.style.color = '#64748b';
                }
            }
        } else if (isSpeaking && !isInitialTab) {
            // 다시풀기 탭 → 안내 메시지
            fileArea.style.display = 'block';
            if (fileInput) { fileInput.style.display = 'none'; }
            if (fileMsg) {
                fileMsg.textContent = '다시풀기 오답노트의 녹음 파일은 저장되지 않습니다. 개인 연습용으로만 활용해 주세요.';
                fileMsg.style.color = '#94a3b8';
            }
        } else {
            // 스피킹 외 → 숨김
            fileArea.style.display = 'none';
        }

        this._selectedFile = null;
        this._updateSubmitState();
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
        var fileInput = document.getElementById('explainSpeakingFileInput');

        if (textarea) {
            textarea.oninput = function() {
                self._updateWordCount();
                self._updateSubmitState();
                self._scheduleAutoSave();
            };
        }

        if (submitBtn) {
            submitBtn.onclick = function() {
                self.handleSubmit();
            };
        }

        if (fileInput) {
            fileInput.onchange = function() {
                self._handleFileSelect();
            };
        }
    },

    // ========================================
    // 파일 선택 처리
    // ========================================
    _handleFileSelect: function() {
        var fileInput = document.getElementById('explainSpeakingFileInput');
        var fileMsg = document.getElementById('explainSpeakingFileMsg');
        if (!fileInput || !fileInput.files[0]) return;

        var file = fileInput.files[0];

        // 25MB 제한
        if (file.size > 25 * 1024 * 1024) {
            alert('파일 크기가 25MB를 초과합니다. 더 작은 파일을 선택해주세요.');
            fileInput.value = '';
            this._selectedFile = null;
            if (fileMsg) { fileMsg.textContent = '녹음 파일을 첨부해주세요. (최대 25MB)'; fileMsg.style.color = '#64748b'; }
            this._updateSubmitState();
            return;
        }

        this._selectedFile = file;

        // 파일 선택 완료 UI
        if (fileMsg) {
            fileMsg.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#77bf7e"></i> ' + file.name + ' (' + Math.round(file.size / 1024) + 'KB)';
            fileMsg.style.color = '#334155';
        }

        console.log('📎 [메모장] 파일 선택:', file.name, Math.round(file.size / 1024) + 'KB');
        this._updateSubmitState();
    },

    // ========================================
    // 단어 수 업데이트
    // ========================================
    _updateWordCount: function() {
        var textarea = document.getElementById('explainMemoTextarea');
        var countEl = document.getElementById('explainMemoWordCount');
        if (!textarea || !countEl) return;

        var count = this.countWords(textarea.value);
        countEl.textContent = count + ' / 20 단어';

        if (count >= 20) {
            countEl.style.color = '#22c55e';
        } else {
            countEl.style.color = '#ef4444';
        }
    },

    // ========================================
    // 제출 버튼 활성화 조건 관리
    // ========================================
    _updateSubmitState: function() {
        var textarea = document.getElementById('explainMemoTextarea');
        var submitBtn = document.getElementById('explainMemoSubmitBtn');
        if (!textarea || !submitBtn || textarea.readOnly) return;

        var wordCount = this.countWords(textarea.value);
        var textOk = wordCount >= 20;

        // 스피킹 + 실전풀이: 텍스트 + 파일 둘 다 필요
        var isSpeakingInitial = this._sectionType === 'speaking' && this._activeTab === 'initial';
        if (isSpeakingInitial) {
            var fileOk = this._selectedFile != null;
            submitBtn.disabled = !(textOk && fileOk);
        } else {
            submitBtn.disabled = !textOk;
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

        // 스피킹 + 실전풀이: 파일 필수
        var isSpeakingInitial = this._sectionType === 'speaking' && this._activeTab === 'initial';
        if (isSpeakingInitial && !this._selectedFile) {
            alert('스피킹 녹음 파일을 첨부해주세요.');
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
            // ── 스피킹 + 실전풀이: 파일 먼저 업로드 ──
            var filePath = null;
            var isSpeakingInitial = this._sectionType === 'speaking' && this._activeTab === 'initial';

            if (isSpeakingInitial && this._selectedFile) {
                var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
                if (!user || !user.id) {
                    throw new Error('사용자 정보 없음');
                }

                var ext = this._selectedFile.name.split('.').pop() || 'bin';
                var timestamp = Date.now();
                var storagePath = user.id + '/speaking_' + this._sectionType + '_m' + this._moduleNumber + '_' + timestamp + '.' + ext;

                if (submitBtn) submitBtn.textContent = '파일 업로드 중...';

                filePath = await supabaseStorageUpload('speaking-files', storagePath, this._selectedFile);

                if (!filePath) {
                    throw new Error('파일 업로드 실패');
                }
            }

            // ── DB 저장 ──
            var updateData = {};

            if (this._activeTab === 'initial') {
                updateData.error_note_text = text;
                updateData.error_note_submitted = true;
                if (filePath) {
                    updateData.speaking_file_1 = filePath;
                }
            } else {
                updateData.current_error_note_text = text;
            }

            if (submitBtn) submitBtn.textContent = '저장 중...';

            await supabaseUpdate('study_results_v3', 'id=eq.' + row.id, updateData);

            // 로컬 상태 업데이트
            if (this._activeTab === 'initial') {
                row.error_note_text = text;
                row.error_note_submitted = true;
                if (filePath) row.speaking_file_1 = filePath;
            } else {
                row.current_error_note_text = text;
            }

            // localStorage 임시 저장 삭제
            this._clearLocal();

            // 제출 완료 UI
            this._isSubmitted = true;

            if (this._activeTab === 'initial') {
                // 실전풀이 오답노트 → 제출 완료 표시 (마감 전이면 수정·재제출 가능)
                if (submitBtn) {
                    submitBtn.textContent = '제출 완료';
                    submitBtn.classList.add('submitted');
                    // 3초 후 재제출 가능하도록 복원
                    setTimeout(function() {
                        if (submitBtn) {
                            submitBtn.textContent = '제출하기';
                            submitBtn.classList.remove('submitted');
                            submitBtn.disabled = false;
                        }
                    }, 3000);
                }
                console.log('📝 [메모장] 실전풀이 오답노트 제출 완료 (마감 전 수정·재제출 가능)');
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
            alert('저장에 실패했습니다. 다시 시도해 주세요.');
        }
    },

    // ========================================
    // 스피킹 파일 영역 잠금 (제출 후)
    // ========================================
    _lockSpeakingFileArea: function() {
        var fileInput = document.getElementById('explainSpeakingFileInput');
        var fileMsg = document.getElementById('explainSpeakingFileMsg');

        if (fileInput) {
            fileInput.disabled = true;
            fileInput.style.display = 'none';
        }
        if (fileMsg && this._selectedFile) {
            fileMsg.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#77bf7e"></i> 파일 첨부 완료';
            fileMsg.style.color = '#64748b';
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
        this._sectionType = null;
        this._moduleNumber = null;
        this._isSubmitted = false;
        this._autoSaveKey = null;
        this._selectedFile = null;

        // 파일 영역 숨기기
        var fileArea = document.getElementById('explainSpeakingFileArea');
        if (fileArea) fileArea.style.display = 'none';
    }
};

console.log('✅ error-note.js 로드 완료 (V3 스플릿 메모장)');
