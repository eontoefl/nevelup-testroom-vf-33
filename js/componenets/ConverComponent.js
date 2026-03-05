/**
 * ConverComponent.js v=004_manual_play
 * 
 * Listening - 컨버(Conversation) 컴포넌트
 * - 세트당 2문제
 * - 인트로 화면 (이미지 + [듣기 시작] 버튼)
 * - 오디오 시퀀스: 버튼 클릭 → 나레이션 → 대화 오디오 (대기 없음)
 * - 문제 화면 (작은 이미지 + 질문 2개)
 * - 타이머, 버튼 제어, 진행바는 Module Controller에서 관리
 * 
 * v004 - 수동재생 전환
 * - 2초 대기 2개 삭제 → [듣기 시작] 버튼 추가
 * - 나레이션 실패 시 조용히 대화 오디오로 넘어감
 * - 대화 오디오 실패 시 [다시 재생] UI 표시
 * - 오디오 URL 없으면 안내 후 바로 문제 화면
 * - 타이머 만료 시 보기 선택 차단 (자동 넘김 제거)
 */

// ✅ 캐시 시스템 추가 (정렬된 데이터 재사용)
let cachedConverData = null;

// 캐시 초기화 함수 (디버깅용)
window.clearConverCache = function() {
  console.log('🔄 [ConverComponent] 캐시 초기화');
  cachedConverData = null;
};

class ConverComponent {
  constructor(setNumber, config = {}) {
    console.log(`[ConverComponent] 생성 - setNumber: ${setNumber}`);
    
    this._destroyed = false;              // cleanup 호출 여부 플래그
    this._questionTimedOut = false;       // v004: 타임아웃 상태 플래그
    this.setNumber = setNumber;           // 현재 세트 번호
    this.currentQuestion = 0;             // 현재 문제 인덱스 (0-based)
    this.answers = {};                    // 답안 저장
    
    this.setData = null;                  // 현재 세트 데이터
    this.audioPlayer = null;              // 오디오 플레이어
    this.isAudioPlaying = false;          // 오디오 재생 중 플래그
    this.showingIntro = true;             // 인트로 화면 표시 여부
    this.currentImage = null;             // 현재 세트의 랜덤 이미지
    
    // 직전 이미지 추적 (static 레벨 - 인스턴스 간 유지)
    if (!ConverComponent._lastImage) ConverComponent._lastImage = null;
    
    // 콜백 설정
    this.onComplete = config.onComplete || null;
    this.onError = config.onError || null;
    this.onTimerStart = config.onTimerStart || null;
    
    // 상수
    this.TIME_LIMIT = 20;                 // 문제당 20초
    
    // 대화 이미지 배열 (10개)
    this.CONVERSATION_IMAGES = [
      'https://eontoefl.github.io/toefl-audio/listening/conversation/image/conver_image_1.png',
      'https://eontoefl.github.io/toefl-audio/listening/conversation/image/conver_image_2.png',
      'https://eontoefl.github.io/toefl-audio/listening/conversation/image/conver_image_3.png',
      'https://eontoefl.github.io/toefl-audio/listening/conversation/image/conver_image_4.png',
      'https://eontoefl.github.io/toefl-audio/listening/conversation/image/conver_image_5.png',
      'https://eontoefl.github.io/toefl-audio/listening/conversation/image/conver_image_6.png',
      'https://eontoefl.github.io/toefl-audio/listening/conversation/image/conver_image_7.png',
      'https://eontoefl.github.io/toefl-audio/listening/conversation/image/conver_image_8.png',
      'https://eontoefl.github.io/toefl-audio/listening/conversation/image/conver_image_9.png',
      'https://eontoefl.github.io/toefl-audio/listening/conversation/image/conver_image_10.png'
    ];
    
    // 나레이션 URL (고정)
    this.NARRATION_URL = 'https://eontoefl.github.io/toefl-audio/listening/conversation/narration/conversation_narration.mp3';
    


  /**
   * 초기화 - 데이터 로드 및 인트로 시작
   */
  async init() {
    console.log(`[ConverComponent] 초기화 시작 - setNumber: ${this.setNumber}`);
    
    // 화면 전환
    showScreen('listeningConverScreen');
    
    // 데이터 로드
    const allData = await this.loadData();
    
    if (!allData || !allData.sets || allData.sets.length === 0) {
      console.error('[ConverComponent] 데이터 로드 실패');
      alert('컨버 데이터를 불러올 수 없습니다.');
      return false;
    }
    
    // 세트 찾기
    const setIndex = this.findSetIndex(allData.sets);
    if (setIndex === -1) {
      console.error(`[ConverComponent] 세트를 찾을 수 없습니다 - setNumber: ${this.setNumber}`);
      return false;
    }
    
    this.setData = allData.sets[setIndex];
    console.log(`[ConverComponent] 세트 데이터 로드 완료:`, this.setData);
    
    // 인트로 화면 시작
    this.showIntro();
    
    return true;
  }

  /**
   * Google Sheets에서 데이터 로드
   */
  async loadData(forceReload = false) {
    console.log('[ConverComponent] 데이터 로드 시작');
    
    // ✅ 캐시 확인
    if (!forceReload && cachedConverData) {
      console.log('✅ [ConverComponent] 캐시된 데이터 사용 (이미 정렬됨)');
      console.log('  캐시 데이터 세트 순서:', cachedConverData.sets.map(s => s.id));
      return cachedConverData;
    }
    
    // 1) Supabase 우선 시도
    const supabaseResult = await this._loadFromSupabase();
    if (supabaseResult) {
      cachedConverData = supabaseResult;
      return supabaseResult;
    }
    
    // Supabase 로드 실패 시 데이터 없음 처리
    console.error('[ConverComponent] Supabase 데이터 로드 실패');
    return null;
  }

  // --- Supabase에서 로드 ---
  async _loadFromSupabase() {
    if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) return null;
    if (typeof supabaseSelect !== 'function') return null;
    
    try {
      console.log('📥 [ConverComponent] Supabase에서 데이터 로드...');
      const rows = await supabaseSelect('tr_listening_conversation', 'select=*&order=id.asc');
      
      if (!rows || rows.length === 0) {
        console.warn('⚠️ [ConverComponent] Supabase 데이터 없음');
        return null;
      }
      
      console.log(`✅ [ConverComponent] Supabase에서 ${rows.length}개 세트 로드 성공`);
      
      const sets = rows.map(row => {
        // scriptHighlights 파싱
        let scriptHighlights = [];
        if (row.script_highlights && row.script_highlights.trim()) {
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
        }
        
        return {
          id: row.id,
          audioUrl: row.audio_url || '',
          script: row.script || '',
          scriptTrans: row.script_trans || '',
          scriptHighlights: scriptHighlights,
          questions: [
            {
              question: row.q1_question || '',
              questionTrans: row.q1_question_trans || '',
              options: [row.q1_opt1 || '', row.q1_opt2 || '', row.q1_opt3 || '', row.q1_opt4 || ''],
              answer: parseInt(row.q1_answer) || 1,
              optionTranslations: [row.q1_opt_trans1 || '', row.q1_opt_trans2 || '', row.q1_opt_trans3 || '', row.q1_opt_trans4 || ''],
              optionExplanations: [row.q1_opt_exp1 || '', row.q1_opt_exp2 || '', row.q1_opt_exp3 || '', row.q1_opt_exp4 || '']
            },
            {
              question: row.q2_question || '',
              questionTrans: row.q2_question_trans || '',
              options: [row.q2_opt1 || '', row.q2_opt2 || '', row.q2_opt3 || '', row.q2_opt4 || ''],
              answer: parseInt(row.q2_answer) || 1,
              optionTranslations: [row.q2_opt_trans1 || '', row.q2_opt_trans2 || '', row.q2_opt_trans3 || '', row.q2_opt_trans4 || ''],
              optionExplanations: [row.q2_opt_exp1 || '', row.q2_opt_exp2 || '', row.q2_opt_exp3 || '', row.q2_opt_exp4 || '']
            }
          ]
        };
      });
      
      sets.sort((a, b) => {
        const numA = parseInt(a.id.replace(/\D/g, ''));
        const numB = parseInt(b.id.replace(/\D/g, ''));
        return numA - numB;
      });
      
      return { type: 'listening_conver', timeLimit: this.TIME_LIMIT, sets };
      
    } catch (error) {
      console.error('❌ [ConverComponent] Supabase 로드 실패:', error);
      return null;
    }
  }

  /**
   * CSV 파싱
   */
  /**
   * 세트 인덱스 찾기
   */
  findSetIndex(sets) {
    // ✅ setNumber를 conversation_set_XXXX 형식으로 변환
    let setId;
    if (typeof this.setNumber === 'string' && this.setNumber.includes('_set_')) {
      // 이미 "conversation_set_0001" 형식이면 그대로 사용
      setId = this.setNumber;
      console.log(`🔍 [findSetIndex] setId 문자열 직접 사용: ${setId}`);
    } else {
      // 숫자면 "conversation_set_XXXX" 형식으로 변환
      setId = `conversation_set_${String(this.setNumber).padStart(4, '0')}`;
      console.log(`🔍 [findSetIndex] setNumber ${this.setNumber} → setId: ${setId}`);
    }
    
    console.log(`[ConverComponent] 세트 검색 - ID: ${setId}`);
    
    const index = sets.findIndex(s => s.id === setId);
    console.log(`[ConverComponent] 세트 인덱스: ${index}`);
    return index;
  }

  /**
   * 인트로 화면 표시 (이미지 + 오디오)
   */
  showIntro() {
    console.log('[ConverComponent] 인트로 화면 시작');
    
    this.showingIntro = true;
    
    // ★ 오디오 재생 중 Review 버튼 숨김
    const reviewBtn = document.querySelector('#listeningConverScreen .review-btn');
    if (reviewBtn) reviewBtn.style.display = 'none';
    
    // 인트로 화면 표시
    document.getElementById('converIntroScreen').style.display = 'block';
    document.getElementById('converQuestionScreen').style.display = 'none';
    
    // 진행률/타이머/Next버튼 숨김 (인트로 동안)
    document.getElementById('converProgress').style.display = 'none';
    document.getElementById('converTimer').style.display = 'none';
    const converTimerWrap = document.getElementById('converTimerWrap');
    if (converTimerWrap) converTimerWrap.style.display = 'none';
    const converNextBtn = document.getElementById('converNextBtn');
    if (converNextBtn) converNextBtn.style.display = 'none';
    const converSubmitBtn = document.getElementById('converSubmitBtn');
    if (converSubmitBtn) converSubmitBtn.style.display = 'none';
    
    // 랜덤 이미지 선택 (세트당 1개, 직전 이미지 제외)
    if (!this.currentImage) {
      const images = this.CONVERSATION_IMAGES;
      const last = ConverComponent._lastImage;
      const candidates = (last && images.length > 1) ? images.filter(img => img !== last) : images;
      const randomIndex = Math.floor(Math.random() * candidates.length);
      this.currentImage = candidates[randomIndex];
      ConverComponent._lastImage = this.currentImage;
      console.log(`[ConverComponent] 랜덤 이미지 선택 (직전 제외): ${this.CONVERSATION_IMAGES.indexOf(this.currentImage) + 1}/${this.CONVERSATION_IMAGES.length}`);
    }
    
    // 이미지 렌더링 + [듣기 시작] 버튼
    const container = document.getElementById('converIntroImage');
    container.innerHTML = `
      <img src="${this.currentImage}" alt="Conversation scene" 
           style="width: 100%; max-width: 450px; height: auto; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); object-fit: cover;"
           onerror="console.error('❌ 컨버 이미지 로드 실패:', this.src);"
           onload="console.log('✅ 컨버 이미지 로드 성공:', this.src);">
    `;
    
    // v004: 자동 재생 대신 [듣기 시작] 버튼 표시
    this._showPlayButton();
  }

  /**
   * v004: [듣기 시작] 버튼 표시
   */
  _showPlayButton() {
    const introScreen = document.getElementById('converIntroScreen');
    const imageContainer = document.getElementById('converIntroImage');
    if (!introScreen || !imageContainer) return;
    
    // 기존 버튼 제거
    const existingBtn = document.getElementById('converListenBtn');
    if (existingBtn) existingBtn.remove();
    
    const btn = document.createElement('button');
    btn.id = 'converListenBtn';
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:10px;"><path d="M3 9v6h4l5 5V4L7 9H3z" fill="white"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="white"/><path d="M19 12c0-3.17-1.82-5.9-4.5-7.22v2.16A5.98 5.98 0 0 1 18 12c0 2.48-1.35 4.64-3.5 5.06v2.16C17.18 17.9 19 15.17 19 12z" fill="white" opacity="0.7"/></svg>듣기 시작';
    btn.style.cssText = '';
    btn.onmouseover = null;
    btn.onmouseout = null;
    btn.onclick = () => this._onPlayButtonClick();
    // h2와 이미지 사이에 배치 (이미지 위치 영향 없음)
    introScreen.insertBefore(btn, imageContainer);
  }
  
  /**
   * v004: [듣기 시작] 버튼 클릭 → 나레이션 → 대화 오디오 자동 연결
   */
  _onPlayButtonClick() {
    console.log('[ConverComponent] 🔊 [듣기 시작] 버튼 클릭');
    
    // 버튼 제거
    const btn = document.getElementById('converListenBtn');
    if (btn) btn.remove();
    
    // 나레이션 → 대화 오디오 → 문제 화면 (대기 시간 없이 자동 연결)
    this.playNarration(() => {
      if (this._destroyed) return;
      console.log('[ConverComponent] 나레이션 완료 → 대화 오디오 바로 재생');
      this.playMainAudio(this.setData.audioUrl, () => {
        if (this._destroyed) return;
        console.log('[ConverComponent] 대화 오디오 완료 → 문제 화면 전환');
        this.showQuestions();
      });
    });
  }

  /**
   * 나레이션 재생
   */
  playNarration(onEnded) {
    console.log('[ConverComponent] 나레이션 재생');
    
    // 기존 오디오 정리
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer = null;
    }
    
    this.audioPlayer = new Audio(this.NARRATION_URL);
    this.isAudioPlaying = true;
    let _callbackFired = false; // 🔒 중복 콜백 방지 플래그
    
    const fireCallback = (source) => {
      if (_callbackFired) { console.log(`[ConverComponent] 나레이션 콜백 중복 차단 (${source})`); return; }
      _callbackFired = true;
      this.isAudioPlaying = false;
      if (!this._destroyed && onEnded) onEnded();
    };
    
    this.audioPlayer.addEventListener('ended', () => {
      console.log('[ConverComponent] 나레이션 재생 완료');
      fireCallback('ended');
    });
    
    this.audioPlayer.addEventListener('error', (e) => {
      console.error('[ConverComponent] 나레이션 재생 실패:', e);
      fireCallback('error');
    });
    
    this.audioPlayer.play().catch(err => {
      console.error('[ConverComponent] 나레이션 play() 실패:', err);
      fireCallback('catch');
    });
  }

  /**
   * v004: 대화 오디오 재생 (실패 시 다시 재생 UI)
   */
  playMainAudio(audioUrl, onEnded) {
    console.log('[ConverComponent] 대화 오디오 재생');
    
    // v004: 오디오 URL 없으면 안내 후 바로 문제 화면
    if (!audioUrl || audioUrl === 'PLACEHOLDER') {
      console.warn('[ConverComponent] 오디오 URL 없음 → 바로 문제 화면');
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
      if (_callbackFired) { console.log(`[ConverComponent] 대화오디오 콜백 중복 차단 (${source})`); return; }
      _callbackFired = true;
      this.isAudioPlaying = false;
      if (!this._destroyed && onEnded) onEnded();
    };
    
    this.audioPlayer.addEventListener('ended', () => {
      console.log('[ConverComponent] 대화 오디오 재생 완료');
      fireCallback('ended');
    });
    
    this.audioPlayer.addEventListener('error', (e) => {
      console.error('[ConverComponent] 대화 오디오 재생 실패:', e);
      this.isAudioPlaying = false;
      // v004: 실패 시 다시 재생 UI 표시 (자동 넘김 안 함)
      this._showAudioRetryUI(audioUrl, onEnded);
    });
    
    this.audioPlayer.play().catch(err => {
      console.error('[ConverComponent] 대화 오디오 play() 실패:', err);
      this.isAudioPlaying = false;
      // v004: 실패 시 다시 재생 UI 표시
      this._showAudioRetryUI(audioUrl, onEnded);
    });
  }
  
  /**
   * v004: 오디오 재생 실패 시 [다시 재생] UI
   */
  _showAudioRetryUI(audioUrl, onEnded) {
    // 중복 생성 방지
    if (document.getElementById('converAudioRetryUI')) return;
    
    const container = document.getElementById('converIntroImage');
    if (!container) return;
    
    const retryDiv = document.createElement('div');
    retryDiv.id = 'converAudioRetryUI';
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
      <button id="converRetryBtn" style="
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
    document.getElementById('converRetryBtn').onclick = () => {
      retryDiv.remove();
      console.log('[ConverComponent] 🔄 대화 오디오 다시 재생 시도');
      this.playMainAudio(audioUrl, onEnded);
    };
  }
  
  /**
   * v004: 오디오 URL 없을 때 안내
   */
  _showNoAudioNotice() {
    const container = document.getElementById('converIntroImage');
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
    console.log('[ConverComponent] 문제 화면 시작');
    
    this.showingIntro = false;
    
    // ★ 문제 화면 전환 시 Review 버튼 복원
    const reviewBtn = document.querySelector('#listeningConverScreen .review-btn');
    if (reviewBtn) reviewBtn.style.display = 'inline-flex';
    
    // 화면 전환
    document.getElementById('converIntroScreen').style.display = 'none';
    document.getElementById('converQuestionScreen').style.display = 'block';
    
    // 진행률/타이머/Next버튼 표시 (문제 풀이 시작)
    document.getElementById('converProgress').style.display = 'inline-block';
    document.getElementById('converTimer').style.display = 'inline-block';
    const converTimerWrap = document.getElementById('converTimerWrap');
    if (converTimerWrap) converTimerWrap.style.display = '';
    const converNextBtn = document.getElementById('converNextBtn');
    if (converNextBtn) converNextBtn.style.display = '';
    
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
    console.log(`[ConverComponent] 문제 로드 - questionIndex: ${questionIndex}`);
    
    // v004: 타임아웃 상태 리셋 (새 문제)
    this._questionTimedOut = false;
    const oldNotice = document.getElementById('converTimeoutNotice');
    if (oldNotice) oldNotice.remove();
    
    this.currentQuestion = questionIndex;
    const question = this.setData.questions[questionIndex];
    
    if (!question) {
      console.error('[ConverComponent] 문제 데이터 없음');
      return;
    }
    
    // 진행률 업데이트 (ModuleController에 알림)
    if (window.moduleController) {
      window.moduleController.updateCurrentQuestionInComponent(questionIndex);
    }
    
    // 타이머 리셋 (다음 문제로 넘어갈 때)
    if (questionIndex > 0 && window.moduleController) {
      window.moduleController.stopQuestionTimer();
      window.moduleController.startQuestionTimer(this.TIME_LIMIT);  // 20초
    }
    
    // 작은 이미지 표시 (인트로와 동일)
    this.renderSmallImage();
    
    // 질문 + 선택지 렌더링
    this.renderQuestion(question);
  }

  /**
   * 작은 이미지 렌더링 (문제 화면 왼쪽)
   */
  renderSmallImage() {
    const container = document.getElementById('converSmallImage');
    
    if (this.currentImage) {
      container.innerHTML = `
        <img src="${this.currentImage}" alt="Conversation scene" 
             style="width: 100%; height: auto; object-fit: cover; border-radius: 12px; display: block;">
      `;
    } else {
      container.innerHTML = `
        <div style="width: 100%; height: 400px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white;">
          <i class="fas fa-image" style="font-size: 60px; opacity: 0.8;"></i>
        </div>
      `;
    }
  }

  /**
   * 질문 + 선택지 렌더링
   */
  renderQuestion(question) {
    console.log('[ConverComponent] 질문 렌더링');
    
    const container = document.getElementById('converQuestionContent');
    const questionKey = `${this.setData.id}_q${this.currentQuestion + 1}`;
    const savedAnswer = this.answers[questionKey];
    
    const optionsHtml = question.options.map((option, index) => {
      const selectedClass = savedAnswer === (index + 1) ? 'selected' : '';
      
      return `
        <div class="response-option ${selectedClass}" 
             onclick="window.currentConverComponent.selectOption(${index + 1})">
          ${option}
        </div>
      `;
    }).join('');
    
    container.innerHTML = `
      <h3 class="conver-question">${question.question}</h3>
      <div class="conver-options">
        ${optionsHtml}
      </div>
    `;
  }

  /**
   * 선택지 선택
   */
  selectOption(optionIndex) {
    // v004: 타임아웃 상태에서는 선택 차단
    if (this._questionTimedOut) {
      console.log('[ConverComponent] ⏰ 시간 초과 - 선택 무시');
      return;
    }
    
    console.log(`[ConverComponent] 선택 - Q${this.currentQuestion + 1}: ${optionIndex}`);
    
    const questionKey = `${this.setData.id}_q${this.currentQuestion + 1}`;
    this.answers[questionKey] = optionIndex;
    
    // UI 업데이트
    document.querySelectorAll('.conver-options .response-option').forEach((el, idx) => {
      if (idx === optionIndex - 1) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }
  
  /**
   * v004: 타임아웃 시 보기 선택 막기
   */
  onQuestionTimeout() {
    console.log('[ConverComponent] ⏰ 시간 초과 - 보기 선택 차단');
    this._questionTimedOut = true;
    
    // 보기 흐리게 + 클릭 불가
    document.querySelectorAll('.conver-options .response-option').forEach(el => {
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.5';
    });
    
    // 시간 초과 안내 표시
    const container = document.getElementById('converQuestionContent');
    if (container) {
      const notice = document.createElement('div');
      notice.id = 'converTimeoutNotice';
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
    if (this.currentQuestion < this.setData.questions.length - 1) {
      this.loadQuestion(this.currentQuestion + 1);
      return true;
    }
    return false;
  }

  /**
   * 제출 & 채점
   */
  submit() {
    console.log('[ConverComponent] 제출 시작');
    
    // 오디오 정지
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer = null;
    }
    this.isAudioPlaying = false;
    
    // 결과 데이터 준비
    const results = {
      setId: this.setData.id,
      imageUrl: this.currentImage,
      answers: []
    };
    
    this.setData.questions.forEach((question, index) => {
      const questionKey = `${this.setData.id}_q${index + 1}`;
      const userAnswer = this.answers[questionKey] || null;
      const isCorrect = userAnswer === question.answer;
      
      results.answers.push({
        questionNum: index + 1,
        audioUrl: this.setData.audioUrl || '',
        script: this.setData.script || '',
        scriptTrans: this.setData.scriptTrans || '',
        scriptHighlights: this.setData.scriptHighlights || [],
        question: question.question,
        questionTrans: question.questionTrans || '',
        options: question.options,
        optionTranslations: question.optionTranslations || [],
        optionExplanations: question.optionExplanations || [],
        userAnswer: userAnswer,
        correctAnswer: question.answer,
        isCorrect: isCorrect
      });
    });
    
    console.log('[ConverComponent] 채점 완료:', results);
    
    // 완료 콜백
    if (this.onComplete) {
      this.onComplete(results);
    }
    
    return results;
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
    console.log(`🔄 [ConverComponent] 2차 풀이 모드 - 문제 ${questionIndex}, 1차 결과: ${wasCorrect ? '✅' : '❌'}`);
    console.log(`  📥 firstAttemptAnswer:`, firstAttemptAnswer);
    
    try {
      // 1. 데이터 로드
      const allData = await this.loadData();
      
      if (!allData || !allData.sets || allData.sets.length === 0) {
        throw new Error('데이터를 불러올 수 없습니다');
      }
      
      // 2. 세트 찾기
      const setIndex = this.findSetIndex(allData.sets);
      if (setIndex === -1) {
        throw new Error(`세트를 찾을 수 없습니다: ${this.setNumber}`);
      }
      
      this.setData = allData.sets[setIndex];
      this.currentQuestion = questionIndex;
      
      console.log(`  📊 setData.id: ${this.setData.id}`);
      console.log(`  📊 선택된 question (index ${questionIndex}):`, this.setData.questions[questionIndex]?.question.substring(0, 50));
      
      // 3. 화면 표시
      showScreen('listeningConverScreen');
      
      // 4. 타이머 숨기기
      this.hideTimer();
      
      // 5. 인트로 건너뛰고 문제 렌더링 (2차 풀이 모드 - 이미지는 RetakeController에서 복원)
      this.showingIntro = false;
      await this.renderQuestionRetakeMode(questionIndex, wasCorrect, firstAttemptAnswer);
      
    } catch (error) {
      console.error('[ConverComponent] 2차 풀이 초기화 실패:', error);
      if (this.onError) {
        this.onError(error);
      }
    }
  }
  
  /**
   * 2차 풀이 모드로 문제 렌더링
   */
  async renderQuestionRetakeMode(questionIndex, wasCorrect, firstAttemptAnswer) {
    console.log(`🎨 [ConverComponent] 2차 풀이 문제 렌더링 - Q${questionIndex + 1}`);
    
    // 🔴 이전 AudioPlayer 정리 (렉 방지)
    if (this.retakeAudioPlayer && typeof this.retakeAudioPlayer.destroy === 'function') {
      this.retakeAudioPlayer.destroy();
      this.retakeAudioPlayer = null;
      console.log('[ConverComponent] 🛑 이전 AudioPlayer 정리 완료');
    }
    
    const question = this.setData.questions[questionIndex];
    if (!question) {
      console.error(`❌ 문제를 찾을 수 없습니다: index ${questionIndex}`);
      return;
    }
    
    // ModuleController에게 진행률 업데이트 요청
    if (window.moduleController) {
      window.moduleController.updateCurrentQuestionInComponent(questionIndex);
    }
    
    // 문제 화면 표시 (인트로 없음)
    document.getElementById('converIntroScreen').style.display = 'none';
    document.getElementById('converQuestionScreen').style.display = 'block';
    
    // 작은 이미지 갱신
    this.renderSmallImage();
    
    // 질문 및 선택지 렌더링 (2차 풀이 모드)
    const container = document.getElementById('converQuestionContent');
    if (!container) {
      console.error('❌ converQuestionContent 요소를 찾을 수 없습니다');
      return;
    }
    
    // 🎵 오디오 플레이어 추가
    const audioPlayerHtml = `
      <div id="converAudioPlayerContainer" style="margin-bottom: 20px;"></div>
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
               onclick="window.currentConverComponent.selectOption(${index + 1})">
            ${option}
          </div>
        `;
      }
    }).join('');
    
    container.innerHTML = `
      ${audioPlayerHtml}
      <h3 class="conver-question">${question.question}</h3>
      <div class="conver-options">
        ${optionsHtml}
      </div>
    `;
    
    // 🎵 AudioPlayer 초기화 (URL 없어도 UI는 표시)
    if (window.AudioPlayer) {
      this.retakeAudioPlayer = new window.AudioPlayer('converAudioPlayerContainer', this.setData.audioUrl || '');
      console.log('🎵 Conver AudioPlayer 생성:', this.setData.audioUrl ? '오디오 있음' : 'UI만');
    } else {
      console.error('❌ AudioPlayer 클래스를 찾을 수 없습니다');
    }
    
    // ✅ 이전에 선택한 답안 복원
    const questionKey = `${this.setData.id}_q${questionIndex + 1}`;
    const savedAnswer = this.answers[questionKey];
    if (savedAnswer) {
      const options = container.querySelectorAll('.response-option');
      options.forEach((opt, idx) => {
        if (idx + 1 === savedAnswer) {
          opt.classList.add('selected');
        }
      });
      console.log(`✅ [ConverComponent] 답안 복원: ${questionKey} = ${savedAnswer}`);
    }
    
    console.log(`✅ [ConverComponent] 2차 풀이 렌더링 완료 - ${question.options.length}개 보기`);
  }
  
  /**
   * 타이머와 버튼 숨기기
   */
  hideTimer() {
    console.log('  ⏱️ [ConverComponent] 타이머 및 버튼 숨김 시작');
    
    // ✅ Conver 타이머 숨기기
    const timerEl = document.getElementById('converTimer');
    if (timerEl && timerEl.parentElement) {
      timerEl.parentElement.style.display = 'none';
      console.log('  ✅ converTimer 숨김');
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
    if (!this.setData) {
      console.warn('[ConverComponent] getRetakeAnswer: setData가 null입니다');
      return null;
    }
    const questionKey = `${this.setData.id}_q${this.currentQuestion + 1}`;
    return this.answers[questionKey] || null;
  }

  /**
   * Cleanup
   */
  cleanup() {
    console.log('[ConverComponent] Cleanup 시작');
    
    // v004: _destroyed 플래그로 늦게 들어온 콜백 차단
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
    
    console.log('[ConverComponent] Cleanup 완료');
  }
}

// 전역으로 노출
window.ConverComponent = ConverComponent;
console.log('[ConverComponent] 클래스 정의 완료');
