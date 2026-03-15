/**
 * conver-component.js
 * 리스닝 - 컨버(Conversation) 컴포넌트
 * 
 * - 세트당 2문제
 * - 인트로 화면 (이미지 + [듣기 시작] 버튼)
 * - 오디오 시퀀스: 버튼 클릭 → 나레이션 → 대화 오디오
 * - 문제 화면 (작은 이미지 + 질문 2개)
 * - 답안 채점 및 결과 반환
 * 
 * 의존성: conver-loader.js (loadConverData)
 */

class ConverComponent {
  constructor(setNumber, config = {}) {
    console.log(`[ConverComponent] 생성 - setNumber: ${setNumber}`);
    
    this._destroyed = false;
    this._questionTimedOut = false;
    this.setNumber = setNumber;
    this.currentQuestion = 0;
    this.answers = {};
    
    this.setData = null;
    this.audioPlayer = null;
    this.isAudioPlaying = false;
    this.showingIntro = true;
    this.currentImage = null;
    
    // 직전 이미지 추적 (static 레벨)
    if (!ConverComponent._lastImage) ConverComponent._lastImage = null;
    
    // 콜백 설정
    this.onComplete = config.onComplete || null;
    this.onError = config.onError || null;
    this.onTimerStart = config.onTimerStart || null;
    
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
  }

  /**
   * 초기화 - 데이터 로드 및 인트로 시작
   */
  async init() {
    console.log(`[ConverComponent] 초기화 시작 - setNumber: ${this.setNumber}`);
    
    // 데이터 로드 (외부 로더 사용)
    const allData = await loadConverData();
    
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
   * 세트 인덱스 찾기
   */
  findSetIndex(sets) {
    let setId;
    if (typeof this.setNumber === 'string' && this.setNumber.includes('_set_')) {
      setId = this.setNumber;
      console.log(`🔍 [findSetIndex] setId 문자열 직접 사용: ${setId}`);
    } else {
      setId = `conversation_set_${String(this.setNumber).padStart(4, '0')}`;
      console.log(`🔍 [findSetIndex] setNumber ${this.setNumber} → setId: ${setId}`);
    }
    
    console.log(`[ConverComponent] 세트 검색 - ID: ${setId}`);
    
    const index = sets.findIndex(s => s.setId === setId);
    console.log(`[ConverComponent] 세트 인덱스: ${index}`);
    return index;
  }

  /**
   * 인트로 화면 표시 (이미지 + 오디오)
   */
  showIntro() {
    console.log('[ConverComponent] 인트로 화면 시작');
    
    this.showingIntro = true;
    
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
    }
    
    // 이미지 렌더링
    const container = document.getElementById('converIntroImage');
    container.innerHTML = `
      <img src="${this.currentImage}" alt="Conversation scene" 
           style="width: 100%; max-width: 450px; height: auto; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); object-fit: cover;"
           onerror="console.error('❌ 컨버 이미지 로드 실패:', this.src);"
           onload="console.log('✅ 컨버 이미지 로드 성공:', this.src);">
    `;
    
    // [듣기 시작] 버튼 표시
    this._showPlayButton();
  }

  /**
   * [듣기 시작] 버튼 표시
   */
  _showPlayButton() {
    const introScreen = document.getElementById('converIntroScreen');
    const imageContainer = document.getElementById('converIntroImage');
    if (!introScreen || !imageContainer) return;
    
    const existingBtn = document.getElementById('converListenBtn');
    if (existingBtn) existingBtn.remove();
    
    const btn = document.createElement('button');
    btn.id = 'converListenBtn';
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:10px;"><path d="M3 9v6h4l5 5V4L7 9H3z" fill="white"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="white"/><path d="M19 12c0-3.17-1.82-5.9-4.5-7.22v2.16A5.98 5.98 0 0 1 18 12c0 2.48-1.35 4.64-3.5 5.06v2.16C17.18 17.9 19 15.17 19 12z" fill="white" opacity="0.7"/></svg>듣기 시작';
    btn.onclick = () => this._onPlayButtonClick();
    introScreen.insertBefore(btn, imageContainer);
  }
  
  /**
   * [듣기 시작] 버튼 클릭 → 나레이션 → 대화 오디오 자동 연결
   */
  _onPlayButtonClick() {
    console.log('[ConverComponent] 🔊 [듣기 시작] 버튼 클릭');
    
    const btn = document.getElementById('converListenBtn');
    if (btn) btn.remove();
    
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
    
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer = null;
    }
    
    this.audioPlayer = new Audio(this.NARRATION_URL);
    this.isAudioPlaying = true;
    let _callbackFired = false;
    
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
   * 대화 오디오 재생 (실패 시 다시 재생 UI)
   */
  playMainAudio(audioUrl, onEnded) {
    console.log('[ConverComponent] 대화 오디오 재생');
    
    if (!audioUrl || audioUrl === 'PLACEHOLDER') {
      console.warn('[ConverComponent] 오디오 URL 없음 → 바로 문제 화면');
      this._showNoAudioNotice();
      if (!this._destroyed && onEnded) onEnded();
      return;
    }
    
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
      this._showAudioRetryUI(audioUrl, onEnded);
    });
    
    this.audioPlayer.play().catch(err => {
      console.error('[ConverComponent] 대화 오디오 play() 실패:', err);
      this.isAudioPlaying = false;
      this._showAudioRetryUI(audioUrl, onEnded);
    });
  }
  
  /**
   * 오디오 재생 실패 시 [다시 재생] UI
   */
  _showAudioRetryUI(audioUrl, onEnded) {
    if (document.getElementById('converAudioRetryUI')) return;
    
    const container = document.getElementById('converIntroImage');
    if (!container) return;
    
    const retryDiv = document.createElement('div');
    retryDiv.id = 'converAudioRetryUI';
    retryDiv.style.cssText = `text-align: center; padding: 16px; margin-top: 12px; background: #fee2e2; border: 1px solid #ef4444; border-radius: 8px;`;
    retryDiv.innerHTML = `
      <p style="color: #dc2626; font-weight: 600; margin: 0 0 12px;">오디오를 불러오지 못했습니다</p>
      <button id="converRetryBtn" style="padding: 10px 20px; background: #4a90e2; color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">🔄 다시 재생</button>
    `;
    container.appendChild(retryDiv);
    
    document.getElementById('converRetryBtn').onclick = () => {
      retryDiv.remove();
      console.log('[ConverComponent] 🔄 대화 오디오 다시 재생 시도');
      this.playMainAudio(audioUrl, onEnded);
    };
  }
  
  /**
   * 오디오 URL 없을 때 안내
   */
  _showNoAudioNotice() {
    const container = document.getElementById('converIntroImage');
    if (!container) return;
    
    const notice = document.createElement('div');
    notice.style.cssText = `text-align: center; padding: 12px; margin-top: 12px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; color: #92400e; font-weight: 600;`;
    notice.textContent = '오디오가 없습니다. 문제 화면으로 이동합니다.';
    container.appendChild(notice);
  }

  /**
   * 문제 화면 표시
   */
  showQuestions() {
    console.log('[ConverComponent] 문제 화면 시작');
    
    this.showingIntro = false;
    
    // 화면 전환
    document.getElementById('converIntroScreen').style.display = 'none';
    document.getElementById('converQuestionScreen').style.display = 'block';
    
    // 진행률/타이머/Next버튼 표시
    document.getElementById('converProgress').style.display = 'inline-block';
    document.getElementById('converTimer').style.display = 'inline-block';
    const converTimerWrap = document.getElementById('converTimerWrap');
    if (converTimerWrap) converTimerWrap.style.display = '';
    const converNextBtn = document.getElementById('converNextBtn');
    if (converNextBtn) converNextBtn.style.display = '';
    
    // 첫 번째 문제 로드
    this.loadQuestion(0);
    
    // 타이머 시작 요청
    if (this.onTimerStart) {
      this.onTimerStart();
    }
  }

  /**
   * 문제 로드
   */
  loadQuestion(questionIndex) {
    console.log(`[ConverComponent] 문제 로드 - questionIndex: ${questionIndex}`);
    
    this._questionTimedOut = false;
    const oldNotice = document.getElementById('converTimeoutNotice');
    if (oldNotice) oldNotice.remove();
    
    this.currentQuestion = questionIndex;
    const question = this.setData.questions[questionIndex];
    
    if (!question) {
      console.error('[ConverComponent] 문제 데이터 없음');
      return;
    }
    
    // 작은 이미지 표시
    this.renderSmallImage();
    
    // 질문 + 선택지 렌더링
    this.renderQuestion(question);

    // 타이머 시작 요청 (문제 표시 = 답 고를 수 있는 상태)
    if (this.onTimerStart) {
      this.onTimerStart();
    }
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
    const questionKey = `${this.setData.setId}_q${this.currentQuestion + 1}`;
    const savedAnswer = this.answers[questionKey];
    
    const self = this;
    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'conver-options';
    question.options.forEach((option, index) => {
      const optionDiv = document.createElement('div');
      optionDiv.className = 'response-option' + (savedAnswer === (index + 1) ? ' selected' : '');
      optionDiv.textContent = option;
      optionDiv.onclick = () => self.selectOption(index + 1);
      optionsDiv.appendChild(optionDiv);
    });
    
    container.innerHTML = `<h3 class="conver-question">${question.question}</h3>`;
    container.appendChild(optionsDiv);
  }

  /**
   * 선택지 선택
   */
  selectOption(optionIndex) {
    if (this._questionTimedOut) {
      console.log('[ConverComponent] ⏰ 시간 초과 - 선택 무시');
      return;
    }
    
    console.log(`[ConverComponent] 선택 - Q${this.currentQuestion + 1}: ${optionIndex}`);
    
    const questionKey = `${this.setData.setId}_q${this.currentQuestion + 1}`;
    this.answers[questionKey] = optionIndex;
    
    document.querySelectorAll('.conver-options .response-option').forEach((el, idx) => {
      if (idx === optionIndex - 1) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
  }
  
  /**
   * 타임아웃 시 보기 선택 막기
   */
  onQuestionTimeout() {
    console.log('[ConverComponent] ⏰ 시간 초과 - 보기 선택 차단');
    this._questionTimedOut = true;
    
    document.querySelectorAll('.conver-options .response-option').forEach(el => {
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.5';
    });
    
    const container = document.getElementById('converQuestionContent');
    if (container) {
      const notice = document.createElement('div');
      notice.id = 'converTimeoutNotice';
      notice.style.cssText = `text-align: center; padding: 12px; margin-top: 12px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; color: #92400e; font-weight: 600;`;
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
    
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer = null;
    }
    this.isAudioPlaying = false;
    
    const results = {
      setId: this.setData.setId,
      imageUrl: this.currentImage,
      answers: []
    };
    
    this.setData.questions.forEach((question, index) => {
      const questionKey = `${this.setData.setId}_q${index + 1}`;
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
    
    if (this.onComplete) {
      this.onComplete(results);
    }
    
    return results;
  }

  /**
   * Cleanup
   */
  cleanup() {
    console.log('[ConverComponent] Cleanup 시작');
    
    this._destroyed = true;
    
    if (this.audioPlayer) {
      this.audioPlayer.onended = null;
      this.audioPlayer.onerror = null;
      this.audioPlayer.pause();
      this.audioPlayer = null;
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
