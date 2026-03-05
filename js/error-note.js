/**
 * ================================================
 * error-note.js
 * 오답노트 플로팅 UI 컴포넌트
 * ================================================
 * 
 * 기능:
 * 1. 해설 화면에서 플로팅 텍스트 입력 패널 표시
 * 2. 실시간 단어 수 카운트
 * 3. 20단어 미만 제출 시 경고 팝업
 * 4. Supabase tr_study_records에 오답노트 저장
 * 5. Speaking 과제: 1차/2차 녹음 파일 업로드 (Supabase Storage)
 * 
 * 적용 대상: R/L/W/S 해설 화면 (보카 미적용)
 */

var ErrorNote = {
    _isOpen: false,
    _isSubmitted: false,
    _currentStudyRecordId: null,
    _sectionType: null,
    _moduleNumber: null,
    _panelEl: null,
    _overlayEl: null,
    _uploadedFiles: { first: null, second: null },  // Speaking 녹음 파일

    // ========================================
    // 단어 수 카운트
    // ========================================
    countWords(text) {
        if (!text || !text.trim()) return 0;
        // 한글+영어 혼합 지원: 공백 기준 분리
        var words = text.trim().split(/\s+/);
        return words.length;
    },

    // ========================================
    // 플로팅 패널 생성
    // ========================================
    createPanel() {
        // 이미 존재하면 제거
        this.removePanel();

        // 오버레이 (팝업용)
        var overlay = document.createElement('div');
        overlay.id = 'errorNoteOverlay';
        overlay.className = 'error-note-overlay';
        overlay.style.display = 'none';
        document.body.appendChild(overlay);
        this._overlayEl = overlay;

        // 플로팅 패널
        var panel = document.createElement('div');
        panel.id = 'errorNotePanel';
        panel.className = 'error-note-panel';
        panel.innerHTML = 
            '<div class="error-note-header" id="errorNoteHeader">' +
                '<div class="error-note-title">' +
                    '<i class="fas fa-edit"></i> 오답노트' +
                '</div>' +
                '<div class="error-note-toggle" id="errorNoteToggle">' +
                    '<i class="fas fa-chevron-up"></i>' +
                '</div>' +
            '</div>' +
            '<div class="error-note-body" id="errorNoteBody">' +
                '<div class="error-note-guide">' +
                    '해설을 참고하여 오답노트를 작성해주세요.' +
                '</div>' +
                '<textarea id="errorNoteTextarea" class="error-note-textarea" ' +
                    'placeholder="틀린 문제에 대한 오답 분석, 핵심 개념 정리, 다음에 주의할 점 등을 자유롭게 작성해주세요..."></textarea>' +
                // Speaking 전용: 녹음 파일 업로드 영역
                '<div id="speakingUploadSection" class="speaking-upload-section" style="display:none;">' +
                    '<div class="speaking-upload-title">' +
                        '<i class="fas fa-microphone"></i> 녹음 파일 제출' +
                    '</div>' +
                    '<div class="speaking-upload-desc">스피킹 녹음 파일을 첨부해주세요. (형식 무관, 최대 20MB)</div>' +
                    '<div id="speakingFileStatus" class="speaking-file-status speaking-file-status-empty">' +
                        '<i class="fas fa-exclamation-circle"></i> 1차, 2차 녹음 파일을 모두 첨부해주세요' +
                    '</div>' +
                    '<div class="speaking-upload-row">' +
                        '<label class="speaking-upload-label">1차 녹음</label>' +
                        '<label class="speaking-upload-btn" id="uploadBtn1">' +
                            '<i class="fas fa-cloud-upload-alt"></i> <span id="uploadName1">파일 선택</span>' +
                            '<input type="file" id="speakingFile1" accept="audio/*,video/*,.m4a,.mp3,.wav,.ogg,.webm,.mp4,.mov" style="display:none;" onchange="ErrorNote.handleFileSelect(1)">' +
                        '</label>' +
                        '<button class="speaking-upload-remove" id="uploadRemove1" style="display:none;" onclick="ErrorNote.removeFile(1)"><i class="fas fa-times"></i></button>' +
                    '</div>' +
                    '<div class="speaking-upload-row">' +
                        '<label class="speaking-upload-label">2차 녹음</label>' +
                        '<label class="speaking-upload-btn" id="uploadBtn2">' +
                            '<i class="fas fa-cloud-upload-alt"></i> <span id="uploadName2">파일 선택</span>' +
                            '<input type="file" id="speakingFile2" accept="audio/*,video/*,.m4a,.mp3,.wav,.ogg,.webm,.mp4,.mov" style="display:none;" onchange="ErrorNote.handleFileSelect(2)">' +
                        '</label>' +
                        '<button class="speaking-upload-remove" id="uploadRemove2" style="display:none;" onclick="ErrorNote.removeFile(2)"><i class="fas fa-times"></i></button>' +
                    '</div>' +
                '</div>' +
                '<div class="error-note-footer">' +
                    '<div class="error-note-notice">' +
                        '<i class="fas fa-info-circle"></i> ' +
                    '<span class="word-count-display" id="errorNoteWordCount">0</span> / 20단어 이상 작성 시 인정' +
                    '</div>' +
                    '<button id="errorNoteSubmitBtn" class="error-note-submit-btn" onclick="ErrorNote.handleSubmit()">' +
                        '<i class="fas fa-paper-plane"></i> 제출' +
                    '</button>' +
                '</div>' +
                '<div class="error-note-resize-handle" id="errorNoteResizeHandle">' +
                    '<div class="resize-bar"></div>' +
                '</div>' +
            '</div>';

        document.body.appendChild(panel);
        this._panelEl = panel;

        // 이벤트 연결
        var textarea = document.getElementById('errorNoteTextarea');

        // 실시간 단어 수 카운트
        if (textarea) {
            textarea.addEventListener('input', function() {
                ErrorNote.updateWordCount();
            });
        }

        // 드래그로 패널 크기 조절
        var resizeHandle = document.getElementById('errorNoteResizeHandle');
        if (resizeHandle && panel) {
            var startY = 0;
            var startHeight = 0;

            resizeHandle.addEventListener('mousedown', function(e) {
                e.preventDefault();
                startY = e.clientY;
                startHeight = panel.offsetHeight;
                var panelRect = panel.getBoundingClientRect();
                var startBottom = panelRect.bottom; // 하단 고정 기준점
                
                function onMouseMove(e) {
                    var diff = startY - e.clientY;
                    var newHeight = Math.max(200, Math.min(window.innerHeight - 40, startHeight + diff));
                    panel.style.height = newHeight + 'px';
                    panel.style.overflow = 'hidden';
                    // bottom 고정, top 자동 계산
                    panel.style.top = (startBottom - newHeight) + 'px';
                    panel.style.bottom = 'auto';
                    var ta = document.getElementById('errorNoteTextarea');
                    if (ta) {
                        var taHeight = newHeight - 220;
                        if (taHeight > 40) ta.style.height = taHeight + 'px';
                    }
                }
                function onMouseUp() {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                }
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            // 터치 지원
            resizeHandle.addEventListener('touchstart', function(e) {
                var touch = e.touches[0];
                startY = touch.clientY;
                startHeight = panel.offsetHeight;
                var panelRect = panel.getBoundingClientRect();
                var startBottom = panelRect.bottom;
                
                function onTouchMove(e) {
                    e.preventDefault(); // 스크롤 방지
                    var touch = e.touches[0];
                    var diff = startY - touch.clientY;
                    var newHeight = Math.max(200, Math.min(window.innerHeight - 40, startHeight + diff));
                    panel.style.height = newHeight + 'px';
                    panel.style.overflow = 'hidden';
                    panel.style.top = (startBottom - newHeight) + 'px';
                    panel.style.bottom = 'auto';
                    var ta = document.getElementById('errorNoteTextarea');
                    if (ta) {
                        var taHeight = newHeight - 220;
                        if (taHeight > 40) ta.style.height = taHeight + 'px';
                    }
                }
                function onTouchEnd() {
                    document.removeEventListener('touchmove', onTouchMove);
                    document.removeEventListener('touchend', onTouchEnd);
                }
                document.addEventListener('touchmove', onTouchMove, { passive: false });
                document.addEventListener('touchend', onTouchEnd);
            }, { passive: true });
        }

        var toggle = document.getElementById('errorNoteToggle');
        if (toggle) {
            toggle.addEventListener('click', function(e) {
                e.stopPropagation();
                ErrorNote.togglePanel();
            });
        }

        // 헤더: 드래그 이동 + 클릭 토글
        var header = document.getElementById('errorNoteHeader');
        if (header && panel) {
            var dragState = { isDragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0, moved: false };

            function startDrag(clientX, clientY) {
                var rect = panel.getBoundingClientRect();
                dragState.startX = clientX;
                dragState.startY = clientY;
                dragState.startLeft = rect.left;
                dragState.startTop = rect.top;
                dragState.moved = false;
                dragState.isDragging = true;
                header.style.cursor = 'grabbing';
            }
            function onDragMove(clientX, clientY) {
                if (!dragState.isDragging) return;
                var dx = clientX - dragState.startX;
                var dy = clientY - dragState.startY;
                if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragState.moved = true;
                if (!dragState.moved) return;
                var newLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, dragState.startLeft + dx));
                var newTop = Math.max(0, Math.min(window.innerHeight - 60, dragState.startTop + dy));
                panel.style.left = newLeft + 'px';
                panel.style.top = newTop + 'px';
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            }
            function endDrag() {
                dragState.isDragging = false;
                header.style.cursor = 'grab';
            }

            // 마우스
            header.addEventListener('mousedown', function(e) {
                if (e.target.closest('#errorNoteToggle')) return;
                e.preventDefault();
                startDrag(e.clientX, e.clientY);
                function onMM(e) { onDragMove(e.clientX, e.clientY); }
                function onMU() { endDrag(); document.removeEventListener('mousemove', onMM); document.removeEventListener('mouseup', onMU); }
                document.addEventListener('mousemove', onMM);
                document.addEventListener('mouseup', onMU);
            });
            // 터치
            header.addEventListener('touchstart', function(e) {
                if (e.target.closest('#errorNoteToggle')) return;
                var t = e.touches[0];
                startDrag(t.clientX, t.clientY);
                function onTM(e) { var t = e.touches[0]; onDragMove(t.clientX, t.clientY); }
                function onTE() { endDrag(); document.removeEventListener('touchmove', onTM); document.removeEventListener('touchend', onTE); }
                document.addEventListener('touchmove', onTM, { passive: true });
                document.addEventListener('touchend', onTE);
            }, { passive: true });
            // 클릭 토글 (드래그 안 했을 때만)
            header.addEventListener('click', function(e) {
                if (e.target.closest('#errorNoteToggle')) return;
                if (dragState.moved) { dragState.moved = false; return; }
                ErrorNote.togglePanel();
            });
            header.style.cursor = 'grab';
        }
    },

    // ========================================
    // 패널 제거
    // ========================================
    removePanel() {
        var panel = document.getElementById('errorNotePanel');
        if (panel) panel.remove();
        var overlay = document.getElementById('errorNoteOverlay');
        if (overlay) overlay.remove();
        var popup = document.getElementById('errorNoteWarningPopup');
        if (popup) popup.remove();
        this._panelEl = null;
        this._overlayEl = null;
    },

    // ========================================
    // 패널 열기/닫기 (접기)
    // ========================================
    togglePanel() {
        var body = document.getElementById('errorNoteBody');
        var toggle = document.getElementById('errorNoteToggle');
        var panel = document.getElementById('errorNotePanel');
        if (!body || !toggle) return;

        this._isOpen = !this._isOpen;

        if (this._isOpen) {
            body.style.display = 'block';
            toggle.innerHTML = '<i class="fas fa-chevron-down"></i>';
            if (panel) panel.classList.add('error-note-panel-open');
        } else {
            body.style.display = 'none';
            toggle.innerHTML = '<i class="fas fa-chevron-up"></i>';
            if (panel) {
                panel.classList.remove('error-note-panel-open');
                // 리사이즈로 고정된 높이/textarea 높이 초기화
                panel.style.height = '';
                var ta = document.getElementById('errorNoteTextarea');
                if (ta) ta.style.height = '';
            }
        }
    },

    // ========================================
    // 단어 수 업데이트
    // ========================================
    updateWordCount() {
        var textarea = document.getElementById('errorNoteTextarea');
        var countEl = document.getElementById('errorNoteWordCount');
        if (!textarea || !countEl) return;

        var count = this.countWords(textarea.value);
        countEl.textContent = count;

        // 20 이상이면 초록색, 미만이면 빨간색
        if (count >= 20) {
            countEl.style.color = '#22c55e';
            countEl.style.fontWeight = '700';
        } else {
            countEl.style.color = '#ef4444';
            countEl.style.fontWeight = '700';
        }
    },

    // ========================================
    // 제출 처리
    // ========================================
    handleSubmit() {
        if (this._isSubmitted) {
            console.log('📝 [ErrorNote] 이미 제출됨');
            return;
        }

        // Speaking 과제: 파일 필수 체크
        if (this._sectionType === 'speaking') {
            var missing = [];
            if (!this._uploadedFiles.first) missing.push('1차 녹음');
            if (!this._uploadedFiles.second) missing.push('2차 녹음');
            if (missing.length > 0) {
                this.showFileRequiredWarning(missing);
                return;
            }
        }

        var textarea = document.getElementById('errorNoteTextarea');
        if (!textarea) return;

        var text = textarea.value.trim();
        var wordCount = this.countWords(text);

        if (wordCount < 20) {
            // 20단어 미만 → 경고 팝업
            this.showWarningPopup(wordCount);
        } else {
            // 정상 제출
            this.submitNote(text, wordCount, false);
        }
    },

    // ========================================
    // Speaking 파일 미첨부 경고
    // ========================================
    showFileRequiredWarning(missingFiles) {
        // 기존 팝업 제거
        var existing = document.getElementById('errorNoteWarningPopup');
        if (existing) existing.remove();

        var overlay = this._overlayEl;
        if (overlay) overlay.style.display = 'block';

        var popup = document.createElement('div');
        popup.id = 'errorNoteWarningPopup';
        popup.className = 'error-note-warning-popup';
        popup.innerHTML = 
            '<div class="error-note-warning-content">' +
                '<div class="error-note-warning-icon speaking-file-warning-icon">' +
                    '<i class="fas fa-microphone-slash"></i>' +
                '</div>' +
                '<h3>녹음 파일을 첨부해주세요</h3>' +
                '<p>스피킹 과제는 녹음 파일 제출이 필수입니다.<br>' +
                '<strong>' + missingFiles.join(', ') + '</strong> 파일이 첨부되지 않았습니다.</p>' +
                '<div class="error-note-warning-buttons">' +
                    '<button class="error-note-btn-edit" onclick="ErrorNote.closeWarningPopup()">' +
                        '<i class="fas fa-paperclip"></i> 파일 첨부하기' +
                    '</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(popup);
    },

    // ========================================
    // 경고 팝업 (20단어 미만)
    // ========================================
    showWarningPopup(wordCount) {
        // 기존 팝업 제거
        var existing = document.getElementById('errorNoteWarningPopup');
        if (existing) existing.remove();

        var overlay = this._overlayEl;
        if (overlay) overlay.style.display = 'block';

        var popup = document.createElement('div');
        popup.id = 'errorNoteWarningPopup';
        popup.className = 'error-note-warning-popup';
        popup.innerHTML = 
            '<div class="error-note-warning-content">' +
                '<div class="error-note-warning-icon">' +
                    '<i class="fas fa-exclamation-triangle"></i>' +
                '</div>' +
                '<h3>오답노트 단어 수 부족</h3>' +
                '<p>현재 <strong>' + wordCount + '단어</strong>를 작성했습니다.<br>' +
                '기준 미달 시 해설 단계가 <strong>미인정</strong> 처리됩니다.</p>' +
                '<div class="error-note-warning-buttons">' +
                    '<button class="error-note-btn-edit" onclick="ErrorNote.closeWarningPopup()">' +
                        '<i class="fas fa-pencil-alt"></i> 수정하기' +
                    '</button>' +
                    '<button class="error-note-btn-force" onclick="ErrorNote.forceSubmit()">' +
                        '그래도 제출' +
                    '</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(popup);
    },

    // ========================================
    // 경고 팝업 닫기
    // ========================================
    closeWarningPopup() {
        var popup = document.getElementById('errorNoteWarningPopup');
        if (popup) popup.remove();
        var overlay = this._overlayEl;
        if (overlay) overlay.style.display = 'none';

        // 텍스트 영역에 포커스
        var textarea = document.getElementById('errorNoteTextarea');
        if (textarea) textarea.focus();
    },

    // ========================================
    // 강제 제출 (20단어 미만 — 해설 단계 0%)
    // ========================================
    forceSubmit() {
        this.closeWarningPopup();
        var textarea = document.getElementById('errorNoteTextarea');
        var text = textarea ? textarea.value.trim() : '';
        var wordCount = this.countWords(text);
        this.submitNote(text, wordCount, true);
    },

    // ========================================
    // Speaking 파일 선택 처리
    // ========================================
    handleFileSelect(attemptNum) {
        var fileInput = document.getElementById('speakingFile' + attemptNum);
        if (!fileInput || !fileInput.files[0]) return;

        var file = fileInput.files[0];

        // 20MB 체크
        if (file.size > 20 * 1024 * 1024) {
            alert('파일 크기가 20MB를 초과합니다. 더 작은 파일을 선택해주세요.');
            fileInput.value = '';
            return;
        }

        this._uploadedFiles[attemptNum === 1 ? 'first' : 'second'] = file;

        // UI 업데이트
        var nameEl = document.getElementById('uploadName' + attemptNum);
        var btnEl = document.getElementById('uploadBtn' + attemptNum);
        var removeEl = document.getElementById('uploadRemove' + attemptNum);
        if (nameEl) nameEl.textContent = file.name;
        if (btnEl) btnEl.classList.add('speaking-upload-btn-selected');
        if (removeEl) removeEl.style.display = 'flex';

        // 파일 첨부 상태 표시 업데이트
        this.updateFileStatus();

        console.log('📎 [ErrorNote] 파일 선택 (' + attemptNum + '차):', file.name, Math.round(file.size/1024) + 'KB');
    },

    // ========================================
    // Speaking 파일 제거
    // ========================================
    removeFile(attemptNum) {
        var fileInput = document.getElementById('speakingFile' + attemptNum);
        if (fileInput) fileInput.value = '';

        this._uploadedFiles[attemptNum === 1 ? 'first' : 'second'] = null;

        var nameEl = document.getElementById('uploadName' + attemptNum);
        var btnEl = document.getElementById('uploadBtn' + attemptNum);
        var removeEl = document.getElementById('uploadRemove' + attemptNum);
        if (nameEl) nameEl.textContent = '파일 선택';
        if (btnEl) btnEl.classList.remove('speaking-upload-btn-selected');
        if (removeEl) removeEl.style.display = 'none';

        // 파일 첨부 상태 표시 업데이트
        this.updateFileStatus();

        console.log('📎 [ErrorNote] 파일 제거 (' + attemptNum + '차)');
    },

    // ========================================
    // 파일 첨부 상태 UI 업데이트
    // ========================================
    updateFileStatus() {
        if (this._sectionType !== 'speaking') return;

        var statusEl = document.getElementById('speakingFileStatus');
        if (!statusEl) return;

        var has1 = !!this._uploadedFiles.first;
        var has2 = !!this._uploadedFiles.second;

        if (has1 && has2) {
            statusEl.innerHTML = '<i class="fas fa-check-circle"></i> 녹음 파일 2개 첨부 완료';
            statusEl.className = 'speaking-file-status speaking-file-status-ok';
        } else if (has1 || has2) {
            var which = has1 ? '2차' : '1차';
            statusEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + which + ' 녹음 파일을 첨부해주세요';
            statusEl.className = 'speaking-file-status speaking-file-status-partial';
        } else {
            statusEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> 1차, 2차 녹음 파일을 모두 첨부해주세요';
            statusEl.className = 'speaking-file-status speaking-file-status-empty';
        }
    },

    // ========================================
    // Supabase Storage에 파일 업로드
    // ========================================
    async uploadFileToStorage(file, attemptNum) {
        if (!file) return null;

        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
        if (!user || !user.id) return null;

        var ext = file.name.split('.').pop() || 'bin';
        var timestamp = Date.now();
        var path = user.id + '/speaking_' + this._sectionType + '_m' + this._moduleNumber + '_attempt' + attemptNum + '_' + timestamp + '.' + ext;

        console.log('📤 [ErrorNote] Storage 업로드 시작:', path);

        try {
            var url = SUPABASE_CONFIG.url + '/storage/v1/object/speaking-files/' + path;
            var response = await fetch(url, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_CONFIG.anonKey,
                    'Authorization': 'Bearer ' + SUPABASE_CONFIG.anonKey,
                    'Content-Type': file.type || 'application/octet-stream',
                    'x-upsert': 'true'
                },
                body: file
            });

            if (response.ok) {
                console.log('✅ [ErrorNote] 업로드 성공:', path);
                return path;
            } else {
                var errText = await response.text();
                console.error('❌ [ErrorNote] 업로드 실패:', response.status, errText);
                return null;
            }
        } catch (e) {
            console.error('❌ [ErrorNote] 업로드 에러:', e);
            return null;
        }
    },

    // ========================================
    // 실제 제출 (Supabase 저장)
    // ========================================
    async submitNote(text, wordCount, isFraud) {
        console.log('📝 [ErrorNote] 제출:', { wordCount: wordCount, isFraud: isFraud });

        this._isSubmitted = true;
        this._lastSubmitData = { text: text, wordCount: wordCount, isFraud: isFraud };

        // UI 업데이트 — 저장 중 상태
        var submitBtn = document.getElementById('errorNoteSubmitBtn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';
        }

        var textarea = document.getElementById('errorNoteTextarea');
        if (textarea) {
            textarea.readOnly = true;
            textarea.classList.add('error-note-readonly');
        }

        // Speaking 파일 업로드 (있으면)
        var file1Path = null;
        var file2Path = null;
        if (this._sectionType === 'speaking') {
            if (this._uploadedFiles.first) {
                file1Path = await this.uploadFileToStorage(this._uploadedFiles.first, 1);
            }
            if (this._uploadedFiles.second) {
                file2Path = await this.uploadFileToStorage(this._uploadedFiles.second, 2);
            }
            // 업로드 UI 비활성화
            var section = document.getElementById('speakingUploadSection');
            if (section) {
                section.querySelectorAll('input, button, label').forEach(function(el) {
                    el.style.pointerEvents = 'none';
                    el.style.opacity = '0.5';
                });
            }
        }

        // ★ DB 저장 시도 (폴백 포함)
        var saveSuccess = false;

        // V2: study_results_v2 테이블에 저장 (이벤트로 처리)
        // 기존 방법 1, 2, 3은 건너뛰고 이벤트만 발생시킴
        if (window.StudySave) {
            saveSuccess = true;
            console.log('📝 [ErrorNote] V2 모드 — 기존 저장 건너뜀, 이벤트로 처리');
        }

        // 기존 버전: AuthMonitor / 폴백 / 비상 저장
        if (!saveSuccess) {
            // 방법 1: AuthMonitor._studyRecordId로 UPDATE
            if (window.AuthMonitor && AuthMonitor._studyRecordId) {
                saveSuccess = await AuthMonitor.saveErrorNote(text, wordCount, file1Path, file2Path);
                if (saveSuccess) {
                    console.log('📝 [ErrorNote] DB 저장 완료 (AuthMonitor)');
                } else {
                    console.warn('📝 [ErrorNote] AuthMonitor 저장 실패 — 폴백 시도');
                }
            }

            // 방법 2: 폴백 — studyRecordId 없으면 직접 최신 study_record 찾아서 UPDATE
            if (!saveSuccess) {
                saveSuccess = await this._fallbackSave(text, wordCount, file1Path, file2Path);
            }

            // 방법 3: 최종 폴백 — 새 study_record INSERT 후 오답노트 저장
            if (!saveSuccess) {
                saveSuccess = await this._emergencySave(text, wordCount, file1Path, file2Path);
            }
        }

        // UI 최종 업데이트
        if (submitBtn) {
            if (saveSuccess) {
                submitBtn.innerHTML = '<i class="fas fa-check"></i> 제출 완료';
                submitBtn.classList.add('error-note-submitted');
            } else {
                // 저장 실패 — 재시도 버튼 표시
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 저장 실패 — 다시 시도';
                submitBtn.classList.add('error-note-failed');
                submitBtn.onclick = function() { ErrorNote.retrySubmit(); };
                this._isSubmitted = false;
                if (textarea) {
                    textarea.readOnly = false;
                    textarea.classList.remove('error-note-readonly');
                }
                console.error('📝 [ErrorNote] 모든 저장 방법 실패');
            }
        }

        // ★ 실제 업로드 성공한 파일만 카운트 (파일 선택이 아닌 업로드 성공 기준)
        var speakingFileCount = 0;
        if (this._sectionType === 'speaking') {
            if (file1Path) speakingFileCount++;
            if (file2Path) speakingFileCount++;
        }

        // 커스텀 이벤트 발생 (auth-monitor 등에서 감지 가능)
        if (saveSuccess) {
            var event = new CustomEvent('errorNoteSubmitted', {
                detail: {
                    text: text,
                    wordCount: wordCount,
                    isFraud: isFraud,
                    sectionType: this._sectionType,
                    moduleNumber: this._moduleNumber,
                    speakingFileCount: speakingFileCount,
                    speakingFile1: file1Path || null,
                    speakingFile2: file2Path || null
                }
            });
            window.dispatchEvent(event);
            console.log('📝 [ErrorNote] 제출 이벤트 발생:', isFraud ? '미인정(fraud)' : '정상');
        }
    },

    // ========================================
    // 폴백 저장: 최신 study_record를 DB에서 찾아서 UPDATE
    // ========================================
    async _fallbackSave(text, wordCount, file1Path, file2Path) {
        try {
            var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
            if (!user || !user.id) {
                console.warn('📝 [ErrorNote] 폴백 — 유저 정보 없음');
                return false;
            }

            // 해당 유저의 최신 study_record 조회
            var records = await supabaseSelect(
                'tr_study_records',
                'user_id=eq.' + user.id + 
                '&task_type=eq.' + this._sectionType + 
                '&order=completed_at.desc&limit=1'
            );

            if (records && records.length > 0) {
                var recordId = records[0].id;
                var updateData = {
                    error_note_text: text,
                    error_note_word_count: wordCount
                };

                await supabaseUpdate('tr_study_records', 'id=eq.' + recordId, updateData);

                // AuthMonitor에도 studyRecordId 동기화
                if (window.AuthMonitor) {
                    AuthMonitor._studyRecordId = recordId;
                }

                console.log('📝 [ErrorNote] 폴백 저장 성공:', recordId);
                return true;
            }

            console.warn('📝 [ErrorNote] 폴백 — 매칭되는 study_record 없음');
            return false;
        } catch (e) {
            console.error('📝 [ErrorNote] 폴백 저장 에러:', e);
            return false;
        }
    },

    // ========================================
    // 최종 폴백: study_record가 아예 없으면 새로 INSERT
    // ========================================
    async _emergencySave(text, wordCount, file1Path, file2Path) {
        try {
            var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
            if (!user || !user.id) return false;

            var scheduleInfo = { week: 1, day: '일' };
            if (window.AuthMonitor && typeof AuthMonitor.getCurrentScheduleInfo === 'function') {
                var info = AuthMonitor.getCurrentScheduleInfo();
                if (info) scheduleInfo = info;
            }

            var recordData = {
                user_id: user.id,
                week: scheduleInfo.week,
                day: scheduleInfo.day,
                task_type: this._sectionType,
                module_number: this._moduleNumber || 1,
                attempt: 1,
                score: 0,
                total: 0,
                error_note_text: text,
                error_note_word_count: wordCount,
                completed_at: new Date().toISOString()
            };

            var result = await saveStudyRecord(recordData);
            if (result && result.id) {
                if (window.AuthMonitor) {
                    AuthMonitor._studyRecordId = result.id;
                }
                console.log('📝 [ErrorNote] 긴급 INSERT 성공:', result.id);
                return true;
            }

            return false;
        } catch (e) {
            console.error('📝 [ErrorNote] 긴급 INSERT 에러:', e);
            return false;
        }
    },

    // ========================================
    // 재시도 제출
    // ========================================
    async retrySubmit() {
        if (!this._lastSubmitData) return;
        var d = this._lastSubmitData;
        await this.submitNote(d.text, d.wordCount, d.isFraud);
    },

    // ========================================
    // 해설 화면 진입 시 호출 (외부에서 사용)
    // ========================================
    show(sectionType, moduleNumber) {
        console.log('📝 [ErrorNote] 표시:', sectionType, 'Module', moduleNumber);
        
        this._sectionType = sectionType;
        this._moduleNumber = moduleNumber;
        this._isSubmitted = false;
        this._isOpen = false;

        this.createPanel();

        // Speaking일 때만 파일 업로드 영역 표시
        if (sectionType === 'speaking') {
            var uploadSection = document.getElementById('speakingUploadSection');
            if (uploadSection) uploadSection.style.display = 'block';
        }

        // 접힌 상태에서 시작 → 첫 클릭 시 펼침
        var body = document.getElementById('errorNoteBody');
        if (body) body.style.display = 'none';
    },

    // ========================================
    // 해설 화면 종료 시 호출 (정리)
    // ========================================
    hide() {
        console.log('📝 [ErrorNote] 숨김');
        this.removePanel();
        this._isOpen = false;
        this._isSubmitted = false;
        this._sectionType = null;
        this._moduleNumber = null;
        this._uploadedFiles = { first: null, second: null };
    },

    // ========================================
    // 제출 여부 확인
    // ========================================
    isSubmitted() {
        return this._isSubmitted;
    },

    // ========================================
    // 제출된 단어 수 확인
    // ========================================
    getSubmittedWordCount() {
        if (!this._isSubmitted) return 0;
        var textarea = document.getElementById('errorNoteTextarea');
        return textarea ? this.countWords(textarea.value) : 0;
    }
};

console.log('✅ error-note.js 로드 완료');
