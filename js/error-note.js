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

    // ─── 스피킹 녹음 파일 (인터뷰 4문항) ───
    SPEAKING_SLOT_COUNT: 4,       // 인터뷰 제출 답변 수 (항상 4)
    _selectedFiles: [null, null, null, null],  // 슬롯별 새로 선택한 File 객체
    _existingFiles: [null, null, null, null],  // 슬롯별 이미 저장돼 있는 경로

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
        this._selectedFiles = [null, null, null, null];
        this._existingFiles = [null, null, null, null];

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
    // speaking_file_1 컬럼 → 슬롯별 경로 배열 파싱
    //   신규: JSON 배열 문자열 (["p1","p2",...])
    //   레거시: 단일 경로 문자열 → 1번 슬롯으로 취급
    // ========================================
    _parseSpeakingFiles: function(row) {
        var out = [null, null, null, null];
        if (!row || !row.speaking_file_1) return out;

        var raw = row.speaking_file_1;
        var arr = null;

        if (Array.isArray(raw)) {
            arr = raw;
        } else if (typeof raw === 'string') {
            var s = raw.trim();
            if (s.charAt(0) === '[') {
                try { arr = JSON.parse(s); } catch (e) { arr = null; }
            }
            if (!arr) { arr = [raw]; }  // 레거시 단일 경로
        }

        if (arr) {
            for (var i = 0; i < this.SPEAKING_SLOT_COUNT && i < arr.length; i++) {
                out[i] = arr[i] || null;
            }
        }
        return out;
    },

    // ========================================
    // 스피킹 파일 첨부 영역 렌더링 (인터뷰 4문항 슬롯)
    // ========================================
    _renderSpeakingFileArea: function() {
        var fileArea = document.getElementById('explainSpeakingFileArea');
        if (!fileArea) return;

        var isSpeaking = this._sectionType === 'speaking';
        var isInitialTab = this._activeTab === 'initial';
        var deadlinePassed = window._deadlinePassedMode || false;

        this._selectedFiles = [null, null, null, null];
        this._existingFiles = [null, null, null, null];

        // 스피킹 외 → 숨김
        if (!isSpeaking) {
            fileArea.style.display = 'none';
            this._updateSubmitState();
            return;
        }

        // 다시풀기 탭 → 안내만
        if (!isInitialTab) {
            fileArea.style.display = 'block';
            fileArea.innerHTML = '<div class="explain-speaking-file-header"><span>🎤 스피킹 파일</span></div>'
                + '<p class="explain-speaking-file-msg" style="color:#94a3b8;">다시풀기 오답노트의 녹음 파일은 저장되지 않습니다. 개인 연습용으로만 활용해 주세요.</p>';
            this._updateSubmitState();
            return;
        }

        // 실전풀이 탭 → 4개 슬롯
        fileArea.style.display = 'block';
        this._existingFiles = this._parseSpeakingFiles(this._dbRow);

        var html = '<div class="explain-speaking-file-header"><span>🎤 스피킹 녹음 파일 (인터뷰 4문항)</span></div>';
        for (var i = 0; i < this.SPEAKING_SLOT_COUNT; i++) {
            var num = i + 1;
            var has = !!this._existingFiles[i];
            html += '<div class="explain-speaking-file-slot" style="margin-bottom:12px;">';
            html += '<div class="explain-speaking-slot-label" style="font-size:13px;font-weight:600;color:#334155;margin-bottom:4px;">' + num + '번 답변</div>';

            if (deadlinePassed) {
                html += '<p class="explain-speaking-file-msg" id="explainSpeakingFileMsg' + i + '" style="color:#64748b;">'
                    + (has ? '<i class="fa-solid fa-circle-check" style="color:#77bf7e"></i> 파일 첨부 완료' : '마감으로 인해 파일 첨부가 불가합니다.')
                    + '</p>';
            } else {
                html += '<input type="file" id="explainSpeakingFileInput' + i + '" data-slot="' + i + '" accept="audio/*,video/mp4" />';
                html += '<p class="explain-speaking-file-msg" id="explainSpeakingFileMsg' + i + '" style="color:#64748b;">'
                    + (has ? '<i class="fa-solid fa-circle-check" style="color:#77bf7e"></i> 첨부됨 (다시 선택하면 교체)' : '녹음 파일을 첨부해주세요. (최대 25MB)')
                    + '</p>';
            }
            html += '</div>';
        }
        fileArea.innerHTML = html;

        // 슬롯별 input 이벤트 바인딩
        if (!deadlinePassed) {
            var self = this;
            for (var j = 0; j < this.SPEAKING_SLOT_COUNT; j++) {
                var inp = document.getElementById('explainSpeakingFileInput' + j);
                if (inp) {
                    inp.onchange = (function(idx) {
                        return function() { self._handleFileSelect(idx); };
                    })(j);
                }
            }
        }

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

        // 스피킹 파일 슬롯 input은 _renderSpeakingFileArea에서 슬롯별로 바인딩됨
    },

    // ========================================
    // 파일 선택 처리 (슬롯별)
    // ========================================
    _handleFileSelect: function(idx) {
        var fileInput = document.getElementById('explainSpeakingFileInput' + idx);
        var fileMsg = document.getElementById('explainSpeakingFileMsg' + idx);
        if (!fileInput || !fileInput.files[0]) return;

        var file = fileInput.files[0];

        // 25MB 제한
        if (file.size > 25 * 1024 * 1024) {
            alert((idx + 1) + '번 답변 파일 크기가 25MB를 초과합니다. 더 작은 파일을 선택해주세요.');
            fileInput.value = '';
            this._selectedFiles[idx] = null;
            if (fileMsg) {
                fileMsg.innerHTML = this._existingFiles[idx]
                    ? '<i class="fa-solid fa-circle-check" style="color:#77bf7e"></i> 첨부됨 (다시 선택하면 교체)'
                    : '녹음 파일을 첨부해주세요. (최대 25MB)';
                fileMsg.style.color = '#64748b';
            }
            this._updateSubmitState();
            return;
        }

        this._selectedFiles[idx] = file;

        // 파일 선택 완료 UI
        if (fileMsg) {
            fileMsg.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#77bf7e"></i> ' + file.name + ' (' + Math.round(file.size / 1024) + 'KB)';
            fileMsg.style.color = '#334155';
        }

        console.log('📎 [메모장] ' + (idx + 1) + '번 답변 파일 선택:', file.name, Math.round(file.size / 1024) + 'KB');
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

        // 스피킹 + 실전풀이: 텍스트 + 파일 4개 모두 필요
        var isSpeakingInitial = this._sectionType === 'speaking' && this._activeTab === 'initial';
        if (isSpeakingInitial) {
            submitBtn.disabled = !(textOk && this._allSpeakingFilesReady());
        } else {
            submitBtn.disabled = !textOk;
        }
    },

    // 4개 슬롯이 모두 채워졌는지 (새로 선택 or 기존 저장)
    _allSpeakingFilesReady: function() {
        for (var i = 0; i < this.SPEAKING_SLOT_COUNT; i++) {
            var hasNew = this._selectedFiles && this._selectedFiles[i];
            var hasOld = this._existingFiles && this._existingFiles[i];
            if (!hasNew && !hasOld) return false;
        }
        return true;
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

        // 스피킹 + 실전풀이: 인터뷰 4문항 파일 모두 필수
        var isSpeakingInitial = this._sectionType === 'speaking' && this._activeTab === 'initial';
        if (isSpeakingInitial) {
            for (var i = 0; i < this.SPEAKING_SLOT_COUNT; i++) {
                var hasNew = this._selectedFiles[i];
                var hasOld = this._existingFiles[i];
                if (!hasNew && !hasOld) {
                    alert('인터뷰 ' + (i + 1) + '번 답변 녹음 파일을 첨부해주세요.');
                    return;
                }
            }
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
            // ── 스피킹 + 실전풀이: 인터뷰 4문항 파일 먼저 업로드 ──
            var filePathsJson = null;
            var isSpeakingInitial = this._sectionType === 'speaking' && this._activeTab === 'initial';

            if (isSpeakingInitial) {
                var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
                if (!user || !user.id) {
                    throw new Error('사용자 정보 없음');
                }

                // 기존 저장분 유지 + 새로 선택한 슬롯만 교체 업로드
                var merged = this._existingFiles.slice();
                var extMap = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/aac': 'aac', 'video/mp4': 'mp4' };

                for (var s = 0; s < this.SPEAKING_SLOT_COUNT; s++) {
                    var f = this._selectedFiles[s];
                    if (!f) continue;  // 재선택 안 한 슬롯 → 기존 경로 유지

                    var rawExt = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : '';
                    var ext = (/^[a-z0-9]+$/.test(rawExt)) ? rawExt : (extMap[f.type] || 'bin');
                    var storagePath = user.id + '/speaking_' + this._sectionType + '_m' + this._moduleNumber + '_q' + (s + 1) + '_' + Date.now() + '.' + ext;

                    if (submitBtn) submitBtn.textContent = '파일 업로드 중... (' + (s + 1) + '/' + this.SPEAKING_SLOT_COUNT + ')';

                    var uploaded = await supabaseStorageUpload('speaking-files', storagePath, f);
                    if (!uploaded) {
                        throw new Error('파일 업로드 실패 (' + (s + 1) + '번 답변)');
                    }
                    merged[s] = uploaded;
                }

                // 업로드된 경로를 기존분으로 승격 → DB 저장 실패 후 재시도 시 재업로드 방지(고아 파일 최소화)
                this._existingFiles = merged;
                this._selectedFiles = [null, null, null, null];
                filePathsJson = JSON.stringify(merged);
            }

            // ── DB 저장 ──
            var updateData = {};

            if (this._activeTab === 'initial') {
                updateData.error_note_text = text;
                updateData.error_note_submitted = true;
                if (filePathsJson) {
                    updateData.speaking_file_1 = filePathsJson;
                }
            } else {
                updateData.current_error_note_text = text;
            }

            if (submitBtn) submitBtn.textContent = '저장 중...';

            // 연습코스 여부에 따라 테이블 분기
            var dashState = window._taskDashboardState || {};
            var tableName = dashState.isPractice ? 'study_results_practice' : 'study_results_v3';
            var saveResult = await supabaseUpdate(tableName, 'id=eq.' + row.id, updateData);

            // ★ 저장 실패 감지: supabaseUpdate는 실패 시 null 반환 → 조용히 넘어가지 않도록
            if (!saveResult) {
                throw new Error('DB 저장 실패');
            }

            // 로컬 상태 업데이트
            if (this._activeTab === 'initial') {
                row.error_note_text = text;
                row.error_note_submitted = true;
                if (filePathsJson) row.speaking_file_1 = filePathsJson;
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
        this._selectedFiles = [null, null, null, null];
        this._existingFiles = [null, null, null, null];

        // 파일 영역 숨기기
        var fileArea = document.getElementById('explainSpeakingFileArea');
        if (fileArea) fileArea.style.display = 'none';
    }
};

console.log('✅ error-note.js 로드 완료 (V3 스플릿 메모장)');
