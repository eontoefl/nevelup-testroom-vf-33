/**
 * AnnouncementComponent.js
 * 듣기 - 공지사항 듣고 응답 고르기 컴포넌트
 * v=005_manual_play
 * 
 * v005 - 수동재생 전환
 * - 2초 대기 2개 삭제 → [듣기 시작] 버튼 추가
 * - 나레이션 → 공지사항 오디오 대기 없이 자동 연결
 * - 공지사항 오디오 실패 시 [다시 재생] UI 표시
 * - 오디오 URL 없으면 안내 + 바로 문제 화면
 * - 타이머 만료 시 보기 선택 차단 (자동 넘김 제거)
 * 
 * v004_cleanup_fix
 * - scriptHighlight → scriptTrans 수정 (CSV columns[5]는 scriptTrans)
 * - scriptHighlights 추가 (CSV 마지막 컬럼)
 * - submit()에 scriptTrans, scriptHighlights, questionTextTrans 포함
 */

// ✅ 캐시 시스템 추가
let cachedAnnouncementData = null;

window.clearAnnouncementCache = function() {
  console.log('🔄 [AnnouncementComponent] 캐시 초기화');
  cachedAnnouncementData = null;
};

class AnnouncementComponent {
    constructor(setNumber, config = {}) {
        console.log(`[AnnouncementComponent] 생성 - setNumber: ${setNumber}`);
        
        this.setNumber = setNumber;
        this.onComplete = config.onComplete || null;
        this.onError = config.onError || null;
        this.onTimerStart = config.onTimerStart || null;
        
        // 내부 상태
        this.currentQuestion = 0;
        this.answers = {};
        this.showingIntro = true;
        this.data = null;
        this.currentSetData = null;
        this.currentImage = null;
        
        // 오디오 플레이어
        this.audioPlayer = null;
        this.isAudioPlaying = false;
        this._destroyed = false;           // cleanup 호출 여부 플래그
        this._questionTimedOut = false;    // v005: 타임아웃 상태 플래그
        

        
        // 성별별 이미지
        this.FEMALE_IMAGES = [
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageF1.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageF2.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageF3.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageF4.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageF5.jpg'
        ];
        
        this.MALE_IMAGES = [
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageM1.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageM2.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageM3.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageM4.jpg',
            'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageM5.jpg'
        ];
    }
    
    /**
     * 컴포넌트 초기화
     */
    async init() {
        console.log('[AnnouncementComponent] 초기화 시작');
        
        // 화면 전환
        showScreen('listeningAnnouncementScreen');
        
        try {
            // 1. 데이터 로드
            await this.loadData();
            
            // 2. 세트 찾기 (announcement_set_XXXX 형식)
            let setId;
            if (typeof this.setNumber === 'string' && this.setNumber.includes('_set_')) {
                setId = this.setNumber;
            } else {
                setId = `announcement_set_${String(this.setNumber).padStart(4, '0')}`;
            }
            console.log(`[AnnouncementComponent] 세트 검색 - ID: ${setId}`);
            
            const setIndex = this.findSetIndex(setId);
            if (setIndex === -1) {
                throw new Error(`세트를 찾을 수 없습니다: ${setId}`);
            }
            
            this.currentSetData = this.data.sets[setIndex];
            console.log('[AnnouncementComponent] 세트 데이터 로드 완료:', this.currentSetData);
            
            // 3. 인트로 화면 표시
            this.showIntro();
            
        } catch (error) {
            console.error('[AnnouncementComponent] 초기화 실패:', error);
            alert('공지사항 듣기 데이터를 불러오는데 실패했습니다.');
        }
    }
    
    /**
     * 데이터 로드
     */
    async loadData(forceReload = false) {
        console.log('[AnnouncementComponent] 데이터 로드 시작');
        
        // ✅ 캐시 확인
        if (!forceReload && cachedAnnouncementData) {
            console.log('✅ [AnnouncementComponent] 캐시된 데이터 사용 (이미 정렬됨)');
            console.log('  캐시 데이터 세트 순서:', cachedAnnouncementData.sets.map(s => s.setId));
            this.data = cachedAnnouncementData;
            return;
        }
        
        // 1) Supabase 우선 시도
        const supabaseResult = await this._loadFromSupabase();
        if (supabaseResult) {
            this.data = supabaseResult;
            cachedAnnouncementData = supabaseResult;
            return;
        }
        
        // Supabase 로드 실패 시 데이터 없음 처리
        console.error('[AnnouncementComponent] Supabase 데이터 로드 실패');
        this.data = null;
    }
    
    // --- Supabase에서 로드 ---
    async _loadFromSupabase() {
        if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) return null;
        if (typeof supabaseSelect !== 'function') return null;
        
        try {
            console.log('📥 [AnnouncementComponent] Supabase에서 데이터 로드...');
            const rows = await supabaseSelect('tr_listening_announcement', 'select=*&order=id.asc');
            
            if (!rows || rows.length === 0) {
                console.warn('⚠️ [AnnouncementComponent] Supabase 데이터 없음');
                return null;
            }
            
            console.log(`✅ [AnnouncementComponent] Supabase에서 ${rows.length}개 세트 로드 성공`);
            
            const sets = rows.map(row => {
                // scriptHighlights 파싱
                let scriptHighlights = '';
                if (row.script_highlights) scriptHighlights = row.script_highlights;
                
                return {
                    setId: row.id,
                    gender: row.gender || '',
                    narrationUrl: row.narration_url || '',
                    audioUrl: row.audio_url || '',
                    script: row.script || '',
                    scriptTrans: row.script_trans || '',
                    scriptHighlights: scriptHighlights,
                    questions: [
                        {
                            questionText: row.q1_question_text || '',
                            questionTextTrans: row.q1_question_text_trans || '',
                            options: [row.q1_opt1 || '', row.q1_opt2 || '', row.q1_opt3 || '', row.q1_opt4 || ''],
                            correctAnswer: parseInt(row.q1_correct_answer) || 1,
                            translations: [row.q1_trans1 || '', row.q1_trans2 || '', row.q1_trans3 || '', row.q1_trans4 || ''],
                            explanations: [row.q1_exp1 || '', row.q1_exp2 || '', row.q1_exp3 || '', row.q1_exp4 || '']
                        },
                        {
                            questionText: row.q2_question_text || '',
                            questionTextTrans: row.q2_question_text_trans || '',
                            options: [row.q2_opt1 || '', row.q2_opt2 || '', row.q2_opt3 || '', row.q2_opt4 || ''],
                            correctAnswer: parseInt(row.q2_correct_answer) || 1,
                            translations: [row.q2_trans1 || '', row.q2_trans2 || '', row.q2_trans3 || '', row.q2_trans4 || ''],
                            explanations: [row.q2_exp1 || '', row.q2_exp2 || '', row.q2_exp3 || '', row.q2_exp4 || '']
                        }
                    ]
                };
            });
            
            sets.sort((a, b) => {
                const numA = parseInt(a.setId.replace(/\D/g, ''));
                const numB = parseInt(b.setId.replace(/\D/g, ''));
                return numA - numB;
            });
            
            return { type: 'listening_announcement', sets };
            
        } catch (error) {
            console.error('❌ [AnnouncementComponent] Supabase 로드 실패:', error);
            return null;
        }
    }
    

    
    /**
     * 세트 인덱스 찾기
     */
    findSetIndex(setId) {
        // ✅ setId를 announcement_set_XXXX 형식으로 변환
        let targetSetId;
        if (typeof setId === 'string' && setId.includes('_set_')) {
            // 이미 "announcement_set_0001" 형식이면 그대로 사용
            targetSetId = setId;
            console.log(`🔍 [findSetIndex] setId 문자열 직접 사용: ${targetSetId}`);
        } else {
            // 숫자면 "announcement_set_XXXX" 형식으로 변환
            targetSetId = `announcement_set_${String(setId).padStart(4, '0')}`;
            console.log(`🔍 [findSetIndex] setId ${setId} → targetSetId: ${targetSetId}`);
        }
        
        console.log(`[AnnouncementComponent] 세트 검색 - ID: ${targetSetId}`);
        
        const index = this.data.sets.findIndex(set => set.setId === targetSetId);
        console.log(`[AnnouncementComponent] 세트 인덱스: ${index}`);
        return index;
    }
    
    /**
     * 인트로 화면 표시
     */
    showIntro() {
        console.log('[AnnouncementComponent] 인트로 화면 표시');
        
        this.showingIntro = true;
        
        // ★ 오디오 재생 중 Review 버튼 숨김
        const reviewBtn = document.querySelector('#listeningAnnouncementScreen .review-btn');
        if (reviewBtn) reviewBtn.style.display = 'none';
        
        // 성별에 따라 이미지 선택 (직전 이미지 제외)
        const gender = this.currentSetData.gender.toLowerCase().trim();
        const isFemale = gender === 'female' || gender === 'f';
        const images = isFemale ? this.FEMALE_IMAGES : this.MALE_IMAGES;
        const lastKey = isFemale ? '_lastFemaleImage' : '_lastMaleImage';
        if (!AnnouncementComponent[lastKey]) AnnouncementComponent[lastKey] = null;
        const last = AnnouncementComponent[lastKey];
        const candidates = (last && images.length > 1) ? images.filter(img => img !== last) : images;
        this.currentImage = candidates[Math.floor(Math.random() * candidates.length)];
        AnnouncementComponent[lastKey] = this.currentImage;
        
        console.log(`[AnnouncementComponent] 성별: ${gender}, 여성: ${isFemale}, 선택된 이미지:`, this.currentImage);
        
        // 인트로 화면에 이미지 표시 (Conver 스타일)
        const introImageDiv = document.getElementById('announcementIntroImage');
        if (introImageDiv) {
            introImageDiv.innerHTML = `
                <img src="${this.currentImage}" alt="Announcement" 
                     style="width: 100%; max-width: 450px; height: auto; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); object-fit: cover;"
                     onerror="console.error('❌ 공지사항 이미지 로드 실패:', this.src);"
                     onload="console.log('✅ 공지사항 이미지 로드 성공:', this.src);">
            `;
        }
        
        // 인트로 화면 표시
        document.getElementById('announcementIntroScreen').style.display = 'block';
        document.getElementById('announcementQuestionScreen').style.display = 'none';
        
        // 진행률/타이머 숨기기 (인트로 중에는 안 보임)
        // 진행률/타이머/Next버튼 숨김 (인트로 동안)
        document.getElementById('announcementProgress').style.display = 'none';
        document.getElementById('announcementTimer').style.display = 'none';
        const annTimerWrap = document.getElementById('announcementTimerWrap');
        if (annTimerWrap) annTimerWrap.style.display = 'none';
        const annNextBtn = document.getElementById('announcementNextBtn');
        if (annNextBtn) annNextBtn.style.display = 'none';
        const annSubmitBtn = document.getElementById('announcementSubmitBtn');
        if (annSubmitBtn) annSubmitBtn.style.display = 'none';
        
        // v005: 자동 재생 대신 [듣기 시작] 버튼 표시
        this._showPlayButton();
    }
    
    /**
     * v005: [듣기 시작] 버튼 표시 (제목과 이미지 사이)
     */
    _showPlayButton() {
        const introScreen = document.getElementById('announcementIntroScreen');
        const imageContainer = document.getElementById('announcementIntroImage');
        if (!introScreen || !imageContainer) return;
        
        // 기존 버튼 제거
        const existingBtn = document.getElementById('announcementListenBtn');
        if (existingBtn) existingBtn.remove();
        
        const btn = document.createElement('button');
        btn.id = 'announcementListenBtn';
        btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:10px;"><path d="M3 9v6h4l5 5V4L7 9H3z" fill="white"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="white"/><path d="M19 12c0-3.17-1.82-5.9-4.5-7.22v2.16A5.98 5.98 0 0 1 18 12c0 2.48-1.35 4.64-3.5 5.06v2.16C17.18 17.9 19 15.17 19 12z" fill="white" opacity="0.7"/></svg>듣기 시작';
        btn.style.cssText = '';
        btn.onmouseover = null;
        btn.onmouseout = null;
        btn.onclick = () => this._onPlayButtonClick();
        // 제목과 이미지 사이에 배치
        introScreen.insertBefore(btn, imageContainer);
    }
    
    /**
     * v005: [듣기 시작] 버튼 클릭 → 나레이션 → 공지사항 오디오 자동 연결
     */
    _onPlayButtonClick() {
        console.log('[AnnouncementComponent] 🔊 [듣기 시작] 버튼 클릭');
        
        // 버튼 제거
        const btn = document.getElementById('announcementListenBtn');
        if (btn) btn.remove();
        
        // 나레이션 → 공지사항 오디오 → 문제 화면 (대기 시간 없이 자동 연결)
        this.playNarration(() => {
            if (this._destroyed) return;
            console.log('[AnnouncementComponent] 나레이션 완료 → 공지사항 오디오 바로 재생');
            this.playMainAudio(() => {
                if (this._destroyed) return;
                console.log('[AnnouncementComponent] 공지사항 오디오 완료 → 문제 화면 전환');
                this.showQuestions();
            });
        });
    }
    
    /**
     * 나레이션 재생
     */
    playNarration(onEnded) {
        const narrationUrl = this.currentSetData.narrationUrl;
        console.log('[AnnouncementComponent] 나레이션 URL:', narrationUrl);
        
        if (!narrationUrl) {
            console.warn('[AnnouncementComponent] 나레이션 URL 없음, 스킵');
            if (onEnded) onEnded();
            return;
        }
        
        this.audioPlayer = new Audio(narrationUrl);
        let _callbackFired = false; // 🔒 중복 콜백 방지 플래그
        
        const fireCallback = (source) => {
            if (_callbackFired) { console.log(`[AnnouncementComponent] 나레이션 콜백 중복 차단 (${source})`); return; }
            _callbackFired = true;
            if (this._destroyed) return;
            if (onEnded) onEnded();
        };
        
        this.audioPlayer.onended = () => {
            console.log('[AnnouncementComponent] 나레이션 재생 완료');
            fireCallback('ended');
        };
        this.audioPlayer.onerror = (e) => {
            console.error('[AnnouncementComponent] 나레이션 재생 오류:', e);
            fireCallback('error');
        };
        this.audioPlayer.play().catch(err => {
            console.error('[AnnouncementComponent] 나레이션 재생 실패:', err);
            fireCallback('catch');
        });
    }
    
    /**
     * v005: 공지사항 오디오 재생 (실패 시 다시 재생 UI)
     */
    playMainAudio(onEnded) {
        const audioUrl = this.currentSetData.audioUrl;
        console.log('[AnnouncementComponent] 공지사항 오디오 URL:', audioUrl);
        
        // v005: 오디오 URL 없으면 안내 후 바로 문제 화면
        if (!audioUrl) {
            console.warn('[AnnouncementComponent] 공지사항 오디오 URL 없음 → 바로 문제 화면');
            this._showNoAudioNotice();
            if (!this._destroyed && onEnded) onEnded();
            return;
        }
        
        // 기존 오디오 정리
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer = null;
        }
        
        this.audioPlayer = new Audio(audioUrl);
        this.isAudioPlaying = true;
        let _callbackFired = false;
        
        const fireCallback = (source) => {
            if (_callbackFired) { console.log(`[AnnouncementComponent] 공지사항오디오 콜백 중복 차단 (${source})`); return; }
            _callbackFired = true;
            this.isAudioPlaying = false;
            if (!this._destroyed && onEnded) onEnded();
        };
        
        this.audioPlayer.onended = () => {
            console.log('[AnnouncementComponent] 공지사항 오디오 재생 완료');
            fireCallback('ended');
        };
        this.audioPlayer.onerror = (e) => {
            console.error('[AnnouncementComponent] 공지사항 오디오 재생 실패:', e);
            this.isAudioPlaying = false;
            // v005: 실패 시 다시 재생 UI 표시
            this._showAudioRetryUI(onEnded);
        };
        this.audioPlayer.play().catch(err => {
            console.error('[AnnouncementComponent] 공지사항 오디오 play() 실패:', err);
            this.isAudioPlaying = false;
            // v005: 실패 시 다시 재생 UI 표시
            this._showAudioRetryUI(onEnded);
        });
    }
    
    /**
     * v005: 오디오 재생 실패 시 [다시 재생] UI
     */
    _showAudioRetryUI(onEnded) {
        // 중복 생성 방지
        if (document.getElementById('announcementAudioRetryUI')) return;
        
        const container = document.getElementById('announcementIntroImage');
        if (!container) return;
        
        const retryDiv = document.createElement('div');
        retryDiv.id = 'announcementAudioRetryUI';
        retryDiv.style.cssText = `
            text-align: center;
            padding: 16px;
            margin-top: 12px;
            background: #fee2e2;
            border: 1px solid #ef4444;
            border-radius: 8px;
        `;
        retryDiv.innerHTML = `
            <p style="color: #dc2626; font-weight: 600; margin: 0 0 12px;">
                오디오를 불러오지 못했습니다
            </p>
            <button id="announcementRetryBtn" style="
                padding: 10px 20px;
                background: #4a90e2;
                color: white;
                border: none;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            ">🔄 다시 재생</button>
        `;
        container.appendChild(retryDiv);
        
        // 다시 재생 버튼
        document.getElementById('announcementRetryBtn').onclick = () => {
            retryDiv.remove();
            console.log('[AnnouncementComponent] 🔄 공지사항 오디오 다시 재생 시도');
            this.playMainAudio(onEnded);
        };
    }
    
    /**
     * v005: 오디오 URL 없을 때 안내
     */
    _showNoAudioNotice() {
        const container = document.getElementById('announcementIntroImage');
        if (!container) return;
        
        const notice = document.createElement('div');
        notice.style.cssText = `
            text-align: center;
            padding: 12px;
            margin-top: 12px;
            background: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 8px;
            color: #92400e;
            font-weight: 600;
        `;
        notice.textContent = '오디오가 없습니다. 문제 화면으로 이동합니다.';
        container.appendChild(notice);
    }
    
    /**
     * 문제 화면 표시
     */
    showQuestions() {
        console.log('[AnnouncementComponent] 문제 화면으로 전환');
        
        this.showingIntro = false;
        
        // ★ 문제 화면 전환 시 Review 버튼 복원
        const reviewBtn = document.querySelector('#listeningAnnouncementScreen .review-btn');
        if (reviewBtn) reviewBtn.style.display = 'inline-flex';
        
        document.getElementById('announcementIntroScreen').style.display = 'none';
        document.getElementById('announcementQuestionScreen').style.display = 'block';
        
        // 진행률/타이머/Next버튼 표시 (문제 풀이 시작)
        document.getElementById('announcementProgress').style.display = 'inline-block';
        document.getElementById('announcementTimer').style.display = 'inline-block';
        const annTimerWrap = document.getElementById('announcementTimerWrap');
        if (annTimerWrap) annTimerWrap.style.display = '';
        const annNextBtn = document.getElementById('announcementNextBtn');
        if (annNextBtn) annNextBtn.style.display = '';
        
        // 첫 번째 문제 로드
        this.loadQuestion(0);
        
        // Module에게 타이머 시작 요청
        if (this.onTimerStart) {
            this.onTimerStart();
        }
    }
    
    /**
     * 문제 로드
     */
    loadQuestion(questionIndex) {
        console.log(`[AnnouncementComponent] 문제 ${questionIndex + 1} 로드`);
        
        // v005: 타임아웃 상태 리셋 (새 문제)
        this._questionTimedOut = false;
        const oldNotice = document.getElementById('announcementTimeoutNotice');
        if (oldNotice) oldNotice.remove();
        
        this.currentQuestion = questionIndex;
        const question = this.currentSetData.questions[questionIndex];
        
        // 진행률 업데이트 (ModuleController에 알림)
        if (window.moduleController) {
            window.moduleController.updateCurrentQuestionInComponent(questionIndex);
        }
        
        // 타이머 리셋 (다음 문제로 넘어갈 때)
        if (questionIndex > 0 && window.moduleController) {
            window.moduleController.stopQuestionTimer();
            window.moduleController.startQuestionTimer(20);
        }
        
        // 작은 이미지 표시
        this.renderSmallImage();
        
        // 질문 + 선택지 표시 (Conver 방식)
        this.renderQuestion(question);
        
        // 저장된 답안 복원
        this.restoreAnswer(questionIndex);
        
        console.log(`[AnnouncementComponent] 문제 ${questionIndex + 1} 로드 완료`);
    }
    
    /**
     * 작은 이미지 렌더링
     */
    renderSmallImage() {
        const smallImageDiv = document.getElementById('announcementSmallImage');
        if (smallImageDiv && this.currentImage) {
            smallImageDiv.innerHTML = `
                <img src="${this.currentImage}" alt="Announcement" 
                     style="width: 100%; height: auto; object-fit: cover; border-radius: 12px; display: block;">
            `;
        }
    }
    
    /**
     * 질문 + 선택지 렌더링 (Conver 스타일)
     */
    renderQuestion(question) {
        console.log('[AnnouncementComponent] 질문 렌더링');
        
        const container = document.getElementById('announcementQuestionContent');
        if (!container) return;
        
        const questionKey = `${this.currentSetData.setId}_q${this.currentQuestion + 1}`;
        const savedAnswer = this.answers[questionKey];
        
        const optionsHtml = question.options.map((option, index) => {
            const selectedClass = savedAnswer === (index + 1) ? 'selected' : '';
            
            return `
                <div class="response-option ${selectedClass}" 
                     onclick="window.currentAnnouncementComponent.selectOption(${index + 1})">
                    ${option}
                </div>
            `;
        }).join('');
        
        container.innerHTML = `
            <h3 class="conver-question">${question.questionText}</h3>
            <div class="conver-options">
                ${optionsHtml}
            </div>
        `;
    }
    
    /**
     * 저장된 답안 복원
     */
    restoreAnswer(questionIndex) {
        if (this.answers[questionIndex] !== undefined) {
            const selectedIndex = this.answers[questionIndex];
            const optionItems = document.querySelectorAll('#listeningAnnouncementOptions .option-item');
            optionItems.forEach((item, index) => {
                if (index === selectedIndex) {
                    item.classList.add('selected');
                }
            });
        }
    }
    
    /**
     * 선택지 선택
     */
    selectOption(optionIndex) {
        // v005: 타임아웃 상태에서는 선택 차단
        if (this._questionTimedOut) {
            console.log('[AnnouncementComponent] ⏰ 시간 초과 - 선택 무시');
            return;
        }
        
        console.log(`[AnnouncementComponent] 선택지 ${optionIndex} 선택됨`);
        
        // ✅ _q로 통일 (다른 3개 컴포넌트와 동일)
        const questionKey = `${this.currentSetData.setId}_q${this.currentQuestion + 1}`;
        this.answers[questionKey] = optionIndex;
        
        console.log(`[AnnouncementComponent] 답안 저장 - key: ${questionKey}, value: ${optionIndex}`);
        
        // UI 업데이트: 모든 선택지에서 selected 제거
        const allOptions = document.querySelectorAll('#announcementQuestionContent .response-option');
        allOptions.forEach(opt => opt.classList.remove('selected'));
        
        // 선택된 항목에 selected 추가 (0-based index)
        if (allOptions[optionIndex - 1]) {
            allOptions[optionIndex - 1].classList.add('selected');
        }
        
        console.log('[AnnouncementComponent] 현재 답안:', this.answers);
    }
    
    /**
     * v005: 타임아웃 시 보기 선택 막기
     */
    onQuestionTimeout() {
        console.log('[AnnouncementComponent] ⏰ 시간 초과 - 보기 선택 차단');
        this._questionTimedOut = true;
        
        // 보기 흐리게 + 클릭 불가
        document.querySelectorAll('#announcementQuestionContent .response-option').forEach(el => {
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.5';
        });
        
        // 시간 초과 안내 표시
        const container = document.getElementById('announcementQuestionContent');
        if (container) {
            const notice = document.createElement('div');
            notice.id = 'announcementTimeoutNotice';
            notice.style.cssText = `
                text-align: center;
                padding: 12px;
                margin-top: 12px;
                background: #fef3c7;
                border: 1px solid #f59e0b;
                border-radius: 8px;
                color: #92400e;
                font-weight: 600;
            `;
            notice.textContent = '⏰ 시간이 초과되었습니다. Next 버튼을 눌러주세요.';
            container.appendChild(notice);
        }
    }
    
    /**
     * 다음 문제로 이동
     */
    nextQuestion() {
        if (this.currentQuestion < this.currentSetData.questions.length - 1) {
            this.loadQuestion(this.currentQuestion + 1);
            return true;
        }
        console.log('[AnnouncementComponent] 마지막 문제입니다');
        return false;
    }
    
    /**
     * 제출 & 채점
     */
    submit() {
        console.log('[AnnouncementComponent] 제출 시작');
        console.log('[AnnouncementComponent] 최종 답안:', this.answers);
        console.log('[AnnouncementComponent] currentSetData.setId:', this.currentSetData.setId);
        
        // 답안 채점
        const results = [];
        let totalCorrect = 0;
        let totalIncorrect = 0;
        
        this.currentSetData.questions.forEach((question, index) => {
            // ✅ _q 키로 통일
            const questionKey = `${this.currentSetData.setId}_q${index + 1}`;
            const userAnswer = this.answers[questionKey];
            const correctAnswer = question.correctAnswer;
            const isCorrect = userAnswer === correctAnswer;
            
            // 🔍 디버깅 로그
            console.log(`[AnnouncementComponent] 문제 ${index + 1}:`, {
                questionKey,
                userAnswer,
                correctAnswer,
                isCorrect,
                answersObject: this.answers
            });
            
            if (isCorrect) {
                totalCorrect++;
            } else {
                totalIncorrect++;
            }
            
            results.push({
                questionIndex: index,
                questionText: question.questionText,
                questionTextTrans: question.questionTextTrans || '',
                userAnswer: userAnswer,
                correctAnswer: correctAnswer,
                isCorrect: isCorrect,
                options: question.options,
                translations: question.translations,
                explanations: question.explanations
            });
        });
        
        // 결과 데이터 구성
        const resultData = {
            setId: this.currentSetData.setId,
            gender: this.currentSetData.gender,
            imageUrl: this.currentImage,
            audioUrl: this.currentSetData.audioUrl,
            narrationUrl: this.currentSetData.narrationUrl,
            script: this.currentSetData.script,
            scriptTrans: this.currentSetData.scriptTrans || '',
            scriptHighlights: this.currentSetData.scriptHighlights || '',
            totalCorrect: totalCorrect,
            totalIncorrect: totalIncorrect,
            totalQuestions: this.currentSetData.questions.length,
            score: Math.round((totalCorrect / this.currentSetData.questions.length) * 100),
            answers: results
        };
        
        console.log('[AnnouncementComponent] 채점 완료:', resultData);
        
        // 완료 콜백 호출
        if (this.onComplete) {
            this.onComplete(resultData);
        }
    }
    
    /**
     * 구글 드라이브 URL 변환
     */
    convertGoogleDriveUrl(url) {
        if (!url) return '';
        if (url.includes('drive.google.com/file/d/')) {
            const fileId = url.match(/\/d\/([^/]+)/)?.[1];
            if (fileId) {
                return `https://drive.google.com/uc?export=download&id=${fileId}`;
            }
        }
        return url;
    }
    
    /**
     * 데모 데이터
     */

    
    /**
     * ================================================
     * 2차 풀이 (이중채점) 모드
     * ================================================
     */
    
    /**
     * 2차 풀이 모드로 단일 문제 표시
     * @param {number} questionIndex - 세트 내 문제 인덱스 (0-1)
     * @param {boolean} wasCorrect - 1차에 맞았는지 여부
     * @param {any} firstAttemptAnswer - 1차 답안
     */
    async initRetakeMode(questionIndex, wasCorrect, firstAttemptAnswer = null) {
        console.log(`🔄 [AnnouncementComponent] 2차 풀이 모드 - 문제 ${questionIndex}, 1차 결과: ${wasCorrect ? '✅' : '❌'}`);
        console.log(`  📥 firstAttemptAnswer:`, firstAttemptAnswer);
        
        try {
            // 1. 데이터 로드
            await this.loadData();
            
            if (!this.data || !this.data.sets || this.data.sets.length === 0) {
                throw new Error('데이터를 불러올 수 없습니다');
            }
            
            // 2. 세트 찾기
            const setIndex = this.findSetIndex(this.setId);
            if (setIndex === -1) {
                throw new Error(`세트를 찾을 수 없습니다: ${this.setId}`);
            }
            
            this.currentSetData = this.data.sets[setIndex];
            this.currentQuestion = questionIndex;
            
            console.log(`  📊 currentSetData.setId: ${this.currentSetData.setId}`);
            console.log(`  📊 선택된 question (index ${questionIndex}):`, this.currentSetData.questions[questionIndex]?.questionText.substring(0, 50));
            
            // 3. 화면 표시
            showScreen('listeningAnnouncementScreen');
            
            // 4. 타이머 숨기기
            this.hideTimer();
            
            // 5. 인트로 건너뛰고 문제 렌더링 (2차 풀이 모드 - 이미지는 RetakeController에서 복원)
            this.showingIntro = false;
            await this.renderQuestionRetakeMode(questionIndex, wasCorrect, firstAttemptAnswer);
            
        } catch (error) {
            console.error('[AnnouncementComponent] 2차 풀이 초기화 실패:', error);
            if (this.onError) {
                this.onError(error);
            }
        }
    }
    
    /**
     * 2차 풀이 모드로 문제 렌더링
     */
    async renderQuestionRetakeMode(questionIndex, wasCorrect, firstAttemptAnswer) {
        console.log(`🎨 [AnnouncementComponent] 2차 풀이 문제 렌더링 - Q${questionIndex + 1}`);
        
        // 🔴 이전 AudioPlayer 정리 (렉 방지)
        if (this.retakeAudioPlayer && typeof this.retakeAudioPlayer.destroy === 'function') {
            this.retakeAudioPlayer.destroy();
            this.retakeAudioPlayer = null;
            console.log('[AnnouncementComponent] 🛑 이전 AudioPlayer 정리 완료');
        }
        
        const question = this.currentSetData.questions[questionIndex];
        if (!question) {
            console.error(`❌ 문제를 찾을 수 없습니다: index ${questionIndex}`);
            return;
        }
        
        // ModuleController에게 진행률 업데이트 요청
        if (window.moduleController) {
            window.moduleController.updateCurrentQuestionInComponent(questionIndex);
        }
        
        // 문제 화면 표시 (인트로 없음)
        document.getElementById('announcementIntroScreen').style.display = 'none';
        document.getElementById('announcementQuestionScreen').style.display = 'block';
        
        // 작은 이미지 갱신
        this.renderSmallImage();
        
        // 질문 및 선택지 렌더링 (2차 풀이 모드)
        const container = document.getElementById('announcementQuestionContent');
        if (!container) {
            console.error('❌ announcementQuestionContent 요소를 찾을 수 없습니다');
            return;
        }
        
        // 🎵 오디오 플레이어 추가
        const audioPlayerHtml = `
            <div id="announcementAudioPlayerContainer" style="margin-bottom: 20px;"></div>
        `;
        
        // 선택지 HTML 생성
        const optionsHtml = question.options.map((option, index) => {
            const optionNumber = index + 1;
            
            // 2차 풀이: 1차에 맞았으면 정답 표시하고 클릭 불가
            if (wasCorrect && firstAttemptAnswer && firstAttemptAnswer.userAnswer === optionNumber) {
                return `
                    <div class="response-option retake-option-correct">
                        ${option}
                    </div>
                `;
            } else {
                // 틀렸거나 다른 보기: 클릭 가능
                return `
                    <div class="response-option" 
                         onclick="window.currentAnnouncementComponent.selectOption(${index + 1})">
                        ${option}
                    </div>
                `;
            }
        }).join('');
        
        container.innerHTML = `
            ${audioPlayerHtml}
            <h3 class="conver-question">${question.questionText}</h3>
            <div class="conver-options">
                ${optionsHtml}
            </div>
        `;
        
        // 🎵 AudioPlayer 초기화 (URL 없어도 UI는 표시)
        if (window.AudioPlayer) {
            this.retakeAudioPlayer = new window.AudioPlayer('announcementAudioPlayerContainer', this.currentSetData.audioUrl || '');
            console.log('🎵 Announcement AudioPlayer 생성:', this.currentSetData.audioUrl ? '오디오 있음' : 'UI만');
        } else {
            console.error('❌ AudioPlayer 클래스를 찾을 수 없습니다');
        }
        
        // ✅ 이전에 선택한 답안 복원
        const questionKey = `${this.currentSetData.setId}_a${questionIndex + 1}`;
        const savedAnswer = this.answers[questionKey];
        if (savedAnswer) {
            const options = container.querySelectorAll('.response-option');
            options.forEach((opt, idx) => {
                if (idx + 1 === savedAnswer) {
                    opt.classList.add('selected');
                }
            });
            console.log(`✅ [AnnouncementComponent] 답안 복원: ${questionKey} = ${savedAnswer}`);
        }
        
        console.log(`✅ [AnnouncementComponent] 2차 풀이 렌더링 완료 - ${question.options.length}개 보기`);
    }
    
    /**
     * 타이머와 버튼 숨기기
     */
    hideTimer() {
        console.log('  ⏱️ [AnnouncementComponent] 타이머 및 버튼 숨김 시작');
        
        // ✅ Announcement 타이머 숨기기
        const timerEl = document.getElementById('announcementTimer');
        if (timerEl && timerEl.parentElement) {
            timerEl.parentElement.style.display = 'none';
            console.log('  ✅ announcementTimer 숨김');
        }
        
        // ✅ ModuleController 타이머 정지
        if (window.moduleController) {
            // 전체 타이머 정지
            if (window.moduleController.stopTimer) {
                window.moduleController.stopTimer();
            }
            
            // 문제당 타이머 정지
            if (window.moduleController.stopQuestionTimer) {
                window.moduleController.stopQuestionTimer();
            }
        }
        
        // ✅ 모든 가능한 Next/Submit 버튼 숨기기
        const buttonsToHide = [
            'button[onclick*="nextQuestion"]',
            'button[onclick*="submitComponent"]',
            'button[onclick*="nextModule"]',
            '.next-btn',
            '.submit-btn',
            '.timer-section button'
        ];
        
        buttonsToHide.forEach(selector => {
            document.querySelectorAll(selector).forEach(btn => {
                if (btn && btn.parentElement) {
                    btn.parentElement.style.display = 'none';
                }
            });
        });
        
        console.log('  ✅ 타이머 및 버튼 숨김 완료');
    }
    
    /**
     * 2차 답안 가져오기 (RetakeController가 호출)
     */
    getRetakeAnswer() {
        if (!this.currentSetData) {
            console.warn('[AnnouncementComponent] getRetakeAnswer: currentSetData가 null입니다');
            return null;
        }
        const questionKey = `${this.currentSetData.setId}_q${this.currentQuestion + 1}`;
        return this.answers[questionKey] || null;
    }
    
    /**
     * Cleanup (오디오/타이머 정리 - 겹침 원천 차단)
     */
    cleanup() {
        console.log('[AnnouncementComponent] Cleanup 시작');
        
        // 🔴 destroyed 플래그 (에러 핸들러 콜백 차단)
        this._destroyed = true;
        
        // 오디오 플레이어 정리
        if (this.audioPlayer) {
            this.audioPlayer.onended = null;
            this.audioPlayer.onerror = null;
            this.audioPlayer.pause();
            this.audioPlayer = null;
        }
        
        // 2차 풀이 AudioPlayer 정리
        if (this.retakeAudioPlayer && typeof this.retakeAudioPlayer.destroy === 'function') {
            this.retakeAudioPlayer.destroy();
            this.retakeAudioPlayer = null;
        }
        
        this.isAudioPlaying = false;
        this._questionTimedOut = false;
        this.showingIntro = true;
        this.currentImage = null;
        this.answers = {};
        
        console.log('[AnnouncementComponent] Cleanup 완료');
    }
}

// 전역 스코프에 노출
window.AnnouncementComponent = AnnouncementComponent;
