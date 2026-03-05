/**
 * LectureComponent.js
 * 듣기 - 렉쳐 듣고 문제 풀기 컴포넌트
 * v=004_manual_play
 * 
 * 공지사항과 유사하지만 차이점:
 * - 문제 개수: 4개 (공지사항 2개)
 * - 타이머: 30초 (공지사항 20초)
 * - lectureTitle 필드 추가 (인트로 상단 표시)
 */

// ✅ 캐시 시스템 추가
let cachedLectureData = null;

window.clearLectureCache = function() {
  console.log('🔄 [LectureComponent] 캐시 초기화');
  cachedLectureData = null;
};

class LectureComponent {
    constructor(setNumber, config = {}) {
        console.log(`[LectureComponent] 생성 - setNumber: ${setNumber}`);
        
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
        this._questionTimedOut = false;     // v004: 타임아웃 플래그
        
        // 타이머 설정
        this.TIME_LIMIT = 30; // 30초 (공지사항은 20초)
        

        
        // 성별별 교수 이미지
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
        console.log('[LectureComponent] 초기화 시작');
        
        // 화면 전환
        showScreen('listeningLectureScreen');
        
        try {
            // 1. 데이터 로드
            await this.loadData();
            
            // 2. 세트 찾기 (lecture_set_XXXX 형식)
            let setId;
            if (typeof this.setNumber === 'string' && this.setNumber.includes('_set_')) {
                setId = this.setNumber;
            } else {
                setId = `lecture_set_${String(this.setNumber).padStart(4, '0')}`;
            }
            console.log(`[LectureComponent] 세트 검색 - ID: ${setId}`);
            
            const setIndex = this.findSetIndex(setId);
            if (setIndex === -1) {
                throw new Error(`세트를 찾을 수 없습니다: ${setId}`);
            }
            
            this.currentSetData = this.data.sets[setIndex];
            console.log('[LectureComponent] 세트 데이터 로드 완료:', this.currentSetData);
            
            // 3. 인트로 화면 표시
            this.showIntro();
            
        } catch (error) {
            console.error('[LectureComponent] 초기화 실패:', error);
            alert('렉쳐 듣기 데이터를 불러오는데 실패했습니다.');
        }
    }
    
    /**
     * 데이터 로드
     */
    async loadData(forceReload = false) {
        console.log('[LectureComponent] 데이터 로드 시작');
        
        // ✅ 캐시 확인
        if (!forceReload && cachedLectureData) {
            console.log('✅ [LectureComponent] 캐시된 데이터 사용 (이미 정렬됨)');
            console.log('  캐시 데이터 세트 순서:', cachedLectureData.sets.map(s => s.setId));
            this.data = cachedLectureData;
            return;
        }
        
        // 1) Supabase 우선 시도
        const supabaseResult = await this._loadFromSupabase();
        if (supabaseResult) {
            this.data = supabaseResult;
            cachedLectureData = supabaseResult;
            return;
        }
        
        // Supabase 로드 실패 시 데이터 없음 처리
        console.error('[LectureComponent] Supabase 데이터 로드 실패');
        this.data = null;
    }
    
    // --- Supabase에서 로드 ---
    async _loadFromSupabase() {
        if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) return null;
        if (typeof supabaseSelect !== 'function') return null;
        
        try {
            console.log('📥 [LectureComponent] Supabase에서 데이터 로드...');
            const rows = await supabaseSelect('tr_listening_lecture', 'select=*&order=id.asc');
            
            if (!rows || rows.length === 0) {
                console.warn('⚠️ [LectureComponent] Supabase 데이터 없음');
                return null;
            }
            
            console.log(`✅ [LectureComponent] Supabase에서 ${rows.length}개 세트 로드 성공`);
            
            const sets = rows.map(row => {
                // scriptHighlights 파싱
                let scriptHighlights = [];
                if (row.script_highlights && row.script_highlights.trim()) {
                    try {
                        const items = row.script_highlights.split('##');
                        items.forEach(item => {
                            const parts = item.split('::');
                            if (parts.length >= 3) {
                                scriptHighlights.push({
                                    word: parts[0].trim(),
                                    translation: parts[1].trim(),
                                    explanation: parts[2].trim()
                                });
                            }
                        });
                    } catch(e) {}
                }
                
                // 4개 문제 구성
                const makeQ = (prefix) => ({
                    questionText: row[`${prefix}_question_text`] || '',
                    questionTrans: row[`${prefix}_question_trans`] || '',
                    options: [row[`${prefix}_opt1`] || '', row[`${prefix}_opt2`] || '', row[`${prefix}_opt3`] || '', row[`${prefix}_opt4`] || ''],
                    correctAnswer: parseInt(row[`${prefix}_correct_answer`]) || 1,
                    translations: [row[`${prefix}_trans1`] || '', row[`${prefix}_trans2`] || '', row[`${prefix}_trans3`] || '', row[`${prefix}_trans4`] || ''],
                    explanations: [row[`${prefix}_exp1`] || '', row[`${prefix}_exp2`] || '', row[`${prefix}_exp3`] || '', row[`${prefix}_exp4`] || '']
                });
                
                return {
                    setId: row.id,
                    gender: row.gender || '',
                    lectureTitle: row.lecture_title || '',
                    narrationUrl: row.narration_url || '',
                    audioUrl: row.audio_url || '',
                    script: row.script || '',
                    scriptTrans: row.script_trans || '',
                    scriptHighlights: scriptHighlights,
                    questions: [makeQ('q1'), makeQ('q2'), makeQ('q3'), makeQ('q4')]
                };
            });
            
            sets.sort((a, b) => {
                const numA = parseInt(a.setId.replace(/\D/g, ''));
                const numB = parseInt(b.setId.replace(/\D/g, ''));
                return numA - numB;
            });
            
            return { type: 'listening_lecture', sets };
            
        } catch (error) {
            console.error('❌ [LectureComponent] Supabase 로드 실패:', error);
            return null;
        }
    }
    
    /**
     * CSV 파싱 (69개 컬럼: A~BQ)
     */
    
    /**
     * 세트 인덱스 찾기
     */
    findSetIndex(setId) {
        // ✅ setId를 lecture_set_XXXX 형식으로 변환
        let targetSetId;
        if (typeof setId === 'string' && setId.includes('_set_')) {
            // 이미 "lecture_set_0001" 형식이면 그대로 사용
            targetSetId = setId;
            console.log(`🔍 [findSetIndex] setId 문자열 직접 사용: ${targetSetId}`);
        } else {
            // 숫자면 "lecture_set_XXXX" 형식으로 변환
            targetSetId = `lecture_set_${String(setId).padStart(4, '0')}`;
            console.log(`🔍 [findSetIndex] setId ${setId} → targetSetId: ${targetSetId}`);
        }
        
        console.log(`[LectureComponent] 세트 검색 - ID: ${targetSetId}`);
        
        const index = this.data.sets.findIndex(set => set.setId === targetSetId);
        console.log(`[LectureComponent] 세트 인덱스: ${index}`);
        return index;
    }
    
    /**
     * 인트로 화면 표시
     */
    showIntro() {
        console.log('[LectureComponent] 인트로 화면 표시');
        
        this.showingIntro = true;
        
        // ★ 오디오 재생 중 Review 버튼 숨김
        const reviewBtn = document.querySelector('#listeningLectureScreen .review-btn');
        if (reviewBtn) reviewBtn.style.display = 'none';
        
        // 성별에 따라 교수 이미지 선택 (직전 이미지 제외)
        const gender = this.currentSetData.gender.toLowerCase().trim();
        const isFemale = gender === 'female' || gender === 'f';
        const images = isFemale ? this.FEMALE_IMAGES : this.MALE_IMAGES;
        const lastKey = isFemale ? '_lastFemaleImage' : '_lastMaleImage';
        if (!LectureComponent[lastKey]) LectureComponent[lastKey] = null;
        const last = LectureComponent[lastKey];
        const candidates = (last && images.length > 1) ? images.filter(img => img !== last) : images;
        this.currentImage = candidates[Math.floor(Math.random() * candidates.length)];
        LectureComponent[lastKey] = this.currentImage;
        
        console.log(`[LectureComponent] 성별: ${gender}, 여성: ${isFemale}, 선택된 이미지:`, this.currentImage);
        
        // 인트로 타이틀 표시 (렉쳐만의 특징)
        const titleElement = document.getElementById('lectureIntroTitle');
        if (titleElement) {
            titleElement.textContent = this.currentSetData.lectureTitle || 'Listen to a lecture.';
            console.log(`[LectureComponent] 타이틀 설정: ${this.currentSetData.lectureTitle}`);
        }
        
        // 인트로 화면에 이미지 표시 (Conver 스타일)
        const introImageDiv = document.getElementById('lectureIntroImage');
        if (introImageDiv) {
            introImageDiv.innerHTML = `
                <img src="${this.currentImage}" alt="Lecture professor" 
                     style="width: 100%; max-width: 450px; height: auto; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); object-fit: cover;"
                     onerror="console.error('❌ 렉쳐 이미지 로드 실패:', this.src);"
                     onload="console.log('✅ 렉쳐 이미지 로드 성공:', this.src);">
            `;
        }
        
        // 인트로 화면 표시
        document.getElementById('lectureIntroScreen').style.display = 'block';
        document.getElementById('lectureQuestionScreen').style.display = 'none';
        
        // 진행률/타이머/Next버튼 숨김 (인트로 동안)
        document.getElementById('lectureProgress').style.display = 'none';
        document.getElementById('lectureTimer').style.display = 'none';
        const lecTimerWrap = document.getElementById('lectureTimerWrap');
        if (lecTimerWrap) lecTimerWrap.style.display = 'none';
        const lecNextBtn = document.getElementById('lectureNextBtn');
        if (lecNextBtn) lecNextBtn.style.display = 'none';
        const lecSubmitBtn = document.getElementById('lectureSubmitBtn');
        if (lecSubmitBtn) lecSubmitBtn.style.display = 'none';
        
        // v004: 자동 재생 대신 [듣기 시작] 버튼 표시
        this._showPlayButton();
    }
    
    /**
     * v004: [듣기 시작] 버튼 표시
     */
    _showPlayButton() {
        const introScreen = document.getElementById('lectureIntroScreen');
        const introImage = document.getElementById('lectureIntroImage');
        if (!introScreen || !introImage) return;

        // 기존 버튼 제거
        const existing = introScreen.querySelector('.listen-start-btn');
        if (existing) existing.remove();

        const btn = document.createElement('button');
        btn.className = 'listen-start-btn';
        btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:10px;"><path d="M3 9v6h4l5 5V4L7 9H3z" fill="white"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="white"/><path d="M19 12c0-3.17-1.82-5.9-4.5-7.22v2.16A5.98 5.98 0 0 1 18 12c0 2.48-1.35 4.64-3.5 5.06v2.16C17.18 17.9 19 15.17 19 12z" fill="white" opacity="0.7"/></svg>듣기 시작';
        btn.style.cssText = '';
        btn.onmouseenter = null;
        btn.onmouseleave = null;
        btn.onclick = () => this._onPlayButtonClick();

        // 타이틀과 이미지 사이에 삽입
        introScreen.insertBefore(btn, introImage);
        console.log('[LectureComponent] 🔊 듣기 시작 버튼 표시');
    }

    /**
     * v004: 듣기 시작 버튼 클릭
     */
    _onPlayButtonClick() {
        // 버튼 제거
        const btn = document.querySelector('#lectureIntroScreen .listen-start-btn');
        if (btn) btn.remove();
        console.log('[LectureComponent] 듣기 시작 버튼 클릭됨');
        this.playAudioSequence();
    }

    /**
     * 오디오 시퀀스 재생
     * v004: 2초 대기 모두 삭제, 나레이션 → 바로 렉처 오디오 → 바로 문제 화면
     */
    playAudioSequence() {
        console.log('[LectureComponent] 오디오 시퀀스 시작');
        
        const narrationUrl = this.currentSetData.narrationUrl;
        
        // 나레이션이 없으면 바로 렉처 오디오 재생
        if (!narrationUrl || narrationUrl.trim() === '') {
            console.log('[LectureComponent] 나레이션 없음, 렉처 오디오만 재생');
            this.playMainAudio(() => {
                if (this._destroyed) return; // 🚪 문지기 가드
                console.log('[LectureComponent] 오디오 시퀀스 완료, 문제 화면으로 전환');
                this.showQuestions();
            });
            return;
        }
        
        // 1) 나레이션 재생
        console.log('[LectureComponent] 나레이션 재생 시작');
        this.playNarration(() => {
            if (this._destroyed) return; // 🚪 문지기 가드
            console.log('[LectureComponent] 나레이션 완료, 바로 렉처 오디오 재생');
            
            // 2) 바로 렉처 오디오 재생 (2초 대기 삭제)
            this.playMainAudio(() => {
                if (this._destroyed) return; // 🚪 문지기 가드
                console.log('[LectureComponent] 오디오 시퀀스 완료, 문제 화면으로 전환');
                this.showQuestions();
            });
        });
    }
    
    /**
     * 나레이션 재생
     */
    playNarration(onEnded) {
        const narrationUrl = this.currentSetData.narrationUrl;
        console.log('[LectureComponent] 나레이션 URL:', narrationUrl);
        
        if (!narrationUrl) {
            console.warn('[LectureComponent] 나레이션 URL 없음, 스킵');
            if (onEnded) onEnded();
            return;
        }
        
        this.audioPlayer = new Audio(narrationUrl);
        let _callbackFired = false; // 🔒 중복 콜백 방지 플래그
        
        const fireCallback = (source) => {
            if (_callbackFired) { console.log(`[LectureComponent] 나레이션 콜백 중복 차단 (${source})`); return; }
            _callbackFired = true;
            if (this._destroyed) return;
            if (onEnded) onEnded();
        };
        
        this.audioPlayer.onended = () => {
            console.log('[LectureComponent] 나레이션 재생 완료');
            fireCallback('ended');
        };
        this.audioPlayer.onerror = (e) => {
            console.error('[LectureComponent] 나레이션 재생 오류:', e);
            fireCallback('error');
        };
        this.audioPlayer.play().catch(err => {
            console.error('[LectureComponent] 나레이션 재생 실패:', err);
            fireCallback('catch');
        });
    }
    
    /**
     * 렉처 오디오 재생
     * v004: URL 없을 때 안내 표시, 실패 시 재시도 UI
     */
    playMainAudio(onEnded) {
        const audioUrl = this.currentSetData.audioUrl;
        console.log('[LectureComponent] 렉처 오디오 URL:', audioUrl);
        
        if (!audioUrl || audioUrl.trim() === '') {
            console.warn('[LectureComponent] 렉처 오디오 URL 없음');
            this._showNoAudioNotice();
            if (onEnded) onEnded();
            return;
        }
        
        // 이전 오디오 정리
        if (this.audioPlayer) {
            this.audioPlayer.onended = null;
            this.audioPlayer.onerror = null;
            this.audioPlayer.pause();
        }
        
        this.audioPlayer = new Audio(audioUrl);
        this.isAudioPlaying = true;
        let _callbackFired = false; // 🔒 중복 콜백 방지 플래그
        
        const fireCallback = (source) => {
            if (_callbackFired) { console.log(`[LectureComponent] 렉처오디오 콜백 중복 차단 (${source})`); return; }
            _callbackFired = true;
            this.isAudioPlaying = false;
            if (this._destroyed) return;
            if (onEnded) onEnded();
        };
        
        this.audioPlayer.onended = () => {
            console.log('[LectureComponent] 렉처 오디오 재생 완료');
            fireCallback('ended');
        };
        this.audioPlayer.onerror = (e) => {
            console.error('[LectureComponent] 렉처 오디오 재생 오류:', e);
            this.isAudioPlaying = false;
            this._showAudioRetryUI(audioUrl, onEnded);
        };
        this.audioPlayer.play().catch(err => {
            console.error('[LectureComponent] 렉처 오디오 재생 실패:', err);
            this.isAudioPlaying = false;
            this._showAudioRetryUI(audioUrl, onEnded);
        });
    }

    /**
     * v004: 오디오 재시도 UI 표시
     */
    _showAudioRetryUI(audioUrl, onEnded) {
        const introImage = document.getElementById('lectureIntroImage');
        if (!introImage) return;

        // 중복 방지
        if (introImage.querySelector('.audio-retry-panel')) return;

        const panel = document.createElement('div');
        panel.className = 'audio-retry-panel';
        panel.style.cssText = 'margin-top:16px;padding:16px;background:#FFF3F3;border:2px solid #E74C3C;border-radius:12px;text-align:center;';
        panel.innerHTML = `
            <p style="color:#E74C3C;font-weight:600;margin-bottom:12px;">⚠️ 오디오 로드에 실패했습니다</p>
            <button style="padding:10px 28px;font-size:16px;font-weight:600;color:#fff;background:#E74C3C;border:none;border-radius:8px;cursor:pointer;">🔄 다시 재생</button>
        `;
        panel.querySelector('button').onclick = () => {
            panel.remove();
            console.log('[LectureComponent] 🔄 오디오 재시도');
            this.playMainAudio(onEnded);
        };
        introImage.appendChild(panel);
    }

    /**
     * v004: 오디오 없음 안내
     */
    _showNoAudioNotice() {
        const introImage = document.getElementById('lectureIntroImage');
        if (!introImage) return;

        const notice = document.createElement('div');
        notice.style.cssText = 'margin-top:16px;padding:12px 20px;background:#FFF8E1;border:2px solid #F9A825;border-radius:10px;text-align:center;color:#F57F17;font-weight:600;';
        notice.textContent = '⚠️ 오디오가 없습니다. 문제 화면으로 전환합니다.';
        introImage.appendChild(notice);
    }
    
    /**
     * 문제 화면 표시
     */
    showQuestions() {
        console.log('[LectureComponent] 문제 화면으로 전환');
        
        this.showingIntro = false;
        
        // ★ 문제 화면 전환 시 Review 버튼 복원
        const reviewBtn = document.querySelector('#listeningLectureScreen .review-btn');
        if (reviewBtn) reviewBtn.style.display = 'inline-flex';
        
        document.getElementById('lectureIntroScreen').style.display = 'none';
        document.getElementById('lectureQuestionScreen').style.display = 'block';
        
        // 진행률/타이머/Next버튼 표시 (문제 풀이 시작)
        document.getElementById('lectureProgress').style.display = 'inline-block';
        document.getElementById('lectureTimer').style.display = 'inline-block';
        const lecTimerWrap = document.getElementById('lectureTimerWrap');
        if (lecTimerWrap) lecTimerWrap.style.display = '';
        const lecNextBtn = document.getElementById('lectureNextBtn');
        if (lecNextBtn) lecNextBtn.style.display = '';
        
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
        console.log(`[LectureComponent] 문제 ${questionIndex + 1} 로드`);
        
        this.currentQuestion = questionIndex;
        const question = this.currentSetData.questions[questionIndex];
        
        // v004: 타임아웃 상태 리셋
        this._questionTimedOut = false;
        const oldNotice = document.querySelector('#lectureQuestionContent .timeout-notice');
        if (oldNotice) oldNotice.remove();
        
        // 진행률 업데이트 (ModuleController에 알림)
        if (window.moduleController) {
            window.moduleController.updateCurrentQuestionInComponent(questionIndex);
        }
        
        // 타이머 리셋 (다음 문제로 넘어갈 때)
        if (questionIndex > 0 && window.moduleController) {
            window.moduleController.stopQuestionTimer();
            window.moduleController.startQuestionTimer(this.TIME_LIMIT);  // 30초
        }
        
        // 작은 이미지 표시
        this.renderSmallImage();
        
        // 질문 및 선택지 표시
        const questionContentDiv = document.getElementById('lectureQuestionContent');
        if (!questionContentDiv) {
            console.error('[LectureComponent] lectureQuestionContent 요소를 찾을 수 없습니다');
            return;
        }
        
        // 기존 내용 초기화
        questionContentDiv.innerHTML = '';
        
        // 답안 키 생성
        const questionKey = `${this.currentSetData.setId}_q${questionIndex + 1}`;
        const savedAnswer = this.answers[questionKey];
        
        // 선택지 HTML 생성
        const optionsHtml = question.options.map((option, index) => {
            const selectedClass = savedAnswer === (index + 1) ? 'selected' : '';
            
            return `
                <div class="response-option ${selectedClass}" 
                     onclick="window.currentLectureComponent.selectOption(${index + 1})">
                    ${option}
                </div>
            `;
        }).join('');
        
        // 질문 + 선택지 표시
        questionContentDiv.innerHTML = `
            <h3 class="conver-question">${question.questionText}</h3>
            <div class="conver-options">
                ${optionsHtml}
            </div>
        `;
        
        console.log(`[LectureComponent] 문제 ${questionIndex + 1} 로드 완료`);
    }

    /**
     * v004: 타임아웃 처리 (ModuleController가 호출)
     */
    onQuestionTimeout() {
        this._questionTimedOut = true;
        console.log('[LectureComponent] ⏰ 시간 초과 - 보기 차단');

        // 모든 보기 흐리게 + 클릭 차단
        const options = document.querySelectorAll('#lectureQuestionContent .response-option');
        options.forEach(opt => {
            opt.style.pointerEvents = 'none';
            opt.style.opacity = '0.5';
        });

        // 안내 문구 표시
        const container = document.getElementById('lectureQuestionContent');
        if (container && !container.querySelector('.timeout-notice')) {
            const notice = document.createElement('div');
            notice.className = 'timeout-notice';
            notice.style.cssText = 'margin-top:16px;padding:14px 20px;background:linear-gradient(135deg,#FFF3E0,#FFE0B2);border:2px solid #FF9800;border-radius:12px;text-align:center;font-weight:700;color:#E65100;font-size:16px;';
            notice.textContent = '⏰ 시간이 초과되었습니다. Next 버튼을 눌러주세요.';
            container.appendChild(notice);
        }
    }
    
    /**
     * 작은 이미지 렌더링
     */
    renderSmallImage() {
        const smallImageDiv = document.getElementById('lectureSmallImage');
        if (smallImageDiv && this.currentImage) {
            smallImageDiv.innerHTML = `<img src="${this.currentImage}" alt="Lecture professor" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">`;
        }
    }
    
    /**
     * 선택지 선택
     * v004: 타임아웃 체크 추가
     */
    selectOption(optionIndex) {
        // v004: 타임아웃 시 선택 차단
        if (this._questionTimedOut) {
            console.log('[LectureComponent] ⏰ 타임아웃 - 선택 차단');
            return;
        }
        
        console.log(`[LectureComponent] 선택 - Q${this.currentQuestion + 1}: ${optionIndex}`);
        
        const questionKey = `${this.currentSetData.setId}_q${this.currentQuestion + 1}`;
        this.answers[questionKey] = optionIndex;
        
        // UI 업데이트: 모든 선택지에서 selected 제거
        const allOptions = document.querySelectorAll('#lectureQuestionContent .response-option');
        allOptions.forEach(opt => opt.classList.remove('selected'));
        
        // 선택된 항목에 selected 추가 (0-based index)
        if (allOptions[optionIndex - 1]) {
            allOptions[optionIndex - 1].classList.add('selected');
        }
        
        console.log('[LectureComponent] 현재 답안:', this.answers);
    }
    
    /**
     * 다음 문제로 이동
     */
    nextQuestion() {
        if (this.currentQuestion < this.currentSetData.questions.length - 1) {
            this.loadQuestion(this.currentQuestion + 1);
            return true;
        }
        console.log('[LectureComponent] 마지막 문제입니다');
        return false;
    }
    
    /**
     * 제출 & 채점
     */
    submit() {
        console.log('[LectureComponent] 제출 시작');
        console.log('[LectureComponent] 최종 답안:', this.answers);
        
        // 답안 채점
        const results = [];
        let totalCorrect = 0;
        let totalIncorrect = 0;
        
        this.currentSetData.questions.forEach((question, index) => {
            // ✅ 수정: questionKey로 답안 찾기
            const questionKey = `${this.currentSetData.setId}_q${index + 1}`;
            const userAnswer = this.answers[questionKey];
            const correctAnswer = question.correctAnswer;
            const isCorrect = userAnswer === correctAnswer;
            
            if (isCorrect) {
                totalCorrect++;
            } else {
                totalIncorrect++;
            }
            
            results.push({
                questionIndex: index,
                questionText: question.questionText,
                questionTrans: question.questionTrans,
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
            lectureTitle: this.currentSetData.lectureTitle,
            imageUrl: this.currentImage,
            audioUrl: this.currentSetData.audioUrl,
            narrationUrl: this.currentSetData.narrationUrl,
            script: this.currentSetData.script,
            scriptTrans: this.currentSetData.scriptTrans,
            scriptHighlights: this.currentSetData.scriptHighlights,
            totalCorrect: totalCorrect,
            totalIncorrect: totalIncorrect,
            totalQuestions: this.currentSetData.questions.length,
            score: Math.round((totalCorrect / this.currentSetData.questions.length) * 100),
            answers: results
        };
        
        console.log('[LectureComponent] 채점 완료:', resultData);
        
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
     * @param {number} questionIndex - 세트 내 문제 인덱스 (0-3)
     * @param {boolean} wasCorrect - 1차에 맞았는지 여부
     * @param {any} firstAttemptAnswer - 1차 답안
     */
    async initRetakeMode(questionIndex, wasCorrect, firstAttemptAnswer = null) {
        console.log(`🔄 [LectureComponent] 2차 풀이 모드 - 문제 ${questionIndex}, 1차 결과: ${wasCorrect ? '✅' : '❌'}`);
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
            showScreen('listeningLectureScreen');
            
            // 4. 타이머 숨기기
            this.hideTimer();
            
            // 5. 인트로 건너뛰고 문제 렌더링 (2차 풀이 모드 - 이미지는 RetakeController에서 복원)
            this.showingIntro = false;
            await this.renderQuestionRetakeMode(questionIndex, wasCorrect, firstAttemptAnswer);
            
        } catch (error) {
            console.error('[LectureComponent] 2차 풀이 초기화 실패:', error);
            if (this.onError) {
                this.onError(error);
            }
        }
    }
    
    /**
     * 2차 풀이 모드로 문제 렌더링
     */
    async renderQuestionRetakeMode(questionIndex, wasCorrect, firstAttemptAnswer) {
        console.log(`🎨 [LectureComponent] 2차 풀이 문제 렌더링 - Q${questionIndex + 1}`);
        
        // 🔴 이전 AudioPlayer 정리 (렉 방지)
        if (this.retakeAudioPlayer && typeof this.retakeAudioPlayer.destroy === 'function') {
            this.retakeAudioPlayer.destroy();
            this.retakeAudioPlayer = null;
            console.log('[LectureComponent] 🛑 이전 AudioPlayer 정리 완료');
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
        document.getElementById('lectureIntroScreen').style.display = 'none';
        document.getElementById('lectureQuestionScreen').style.display = 'block';
        
        // 작은 이미지 갱신
        this.renderSmallImage();
        
        // 질문 및 선택지 렌더링 (2차 풀이 모드)
        const questionContentDiv = document.getElementById('lectureQuestionContent');
        if (!questionContentDiv) {
            console.error('❌ lectureQuestionContent 요소를 찾을 수 없습니다');
            return;
        }
        
        // 🎵 오디오 플레이어 추가
        const audioPlayerHtml = `
            <div id="lectureAudioPlayerContainer" style="margin-bottom: 20px;"></div>
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
                         onclick="window.currentLectureComponent.selectOption(${index + 1})">
                        ${option}
                    </div>
                `;
            }
        }).join('');
        
        questionContentDiv.innerHTML = `
            ${audioPlayerHtml}
            <h3 class="conver-question">${question.questionText}</h3>
            <div class="conver-options">
                ${optionsHtml}
            </div>
        `;
        
        // 🎵 AudioPlayer 초기화 (URL 없어도 UI는 표시)
        if (window.AudioPlayer) {
            this.retakeAudioPlayer = new window.AudioPlayer('lectureAudioPlayerContainer', this.currentSetData.audioUrl || '');
            console.log('🎵 Lecture AudioPlayer 생성:', this.currentSetData.audioUrl ? '오디오 있음' : 'UI만');
        } else {
            console.error('❌ AudioPlayer 클래스를 찾을 수 없습니다');
        }
        
        // ✅ 이전에 선택한 답안 복원
        const questionKey = `${this.currentSetData.setId}_q${questionIndex + 1}`;
        const savedAnswer = this.answers[questionKey];
        if (savedAnswer) {
            const options = questionContentDiv.querySelectorAll('.response-option');
            options.forEach((opt, idx) => {
                if (idx + 1 === savedAnswer) {
                    opt.classList.add('selected');
                }
            });
            console.log(`✅ [LectureComponent] 답안 복원: ${questionKey} = ${savedAnswer}`);
        }
        
        console.log(`✅ [LectureComponent] 2차 풀이 렌더링 완료 - ${question.options.length}개 보기`);
    }
    
    /**
     * 타이머와 버튼 숨기기
     */
    hideTimer() {
        console.log('  ⏱️ [LectureComponent] 타이머 및 버튼 숨김 시작');
        
        // ✅ Lecture 타이머 숨기기
        const timerEl = document.getElementById('lectureTimer');
        if (timerEl && timerEl.parentElement) {
            timerEl.parentElement.style.display = 'none';
            console.log('  ✅ lectureTimer 숨김');
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
            console.warn('[LectureComponent] getRetakeAnswer: currentSetData가 null입니다');
            return null;
        }
        const questionKey = `${this.currentSetData.setId}_q${this.currentQuestion + 1}`;
        return this.answers[questionKey] || null;
    }
    
    /**
     * Cleanup (오디오/타이머 정리 - 겹침 원천 차단)
     */
    cleanup() {
        console.log('[LectureComponent] Cleanup 시작');
        
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
        this._questionTimedOut = false;  // v004: 타임아웃 리셋
        this.showingIntro = true;
        this.currentImage = null;
        this.answers = {};
        
        console.log('[LectureComponent] Cleanup 완료');
    }
}

// 전역 스코프에 노출
window.LectureComponent = LectureComponent;
