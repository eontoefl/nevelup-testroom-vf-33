/**
 * response-component.js
 * 리스닝 - 응답고르기 컴포넌트
 * 
 * - 세트당 12문제
 * - 오디오 재생 ([듣기 시작] 버튼 → 재생 → 블러 해제)
 * - 선택지 4개
 * - 답안 채점 및 결과 반환
 * 
 * 의존성: response-loader.js (loadResponseData)
 */

class ResponseComponent {
  constructor(setNumber, config = {}) {
    console.log(`[ResponseComponent] 생성 - setNumber: ${setNumber}`);
    
    this.setNumber = setNumber;
    this.currentQuestion = 0;
    this.answers = {};
    
    this.setData = null;
    this.audioPlayer = null;
    this.isAudioPlaying = false;
    this.isSubmitting = false;
    this._destroyed = false;
    this._questionTimedOut = false;
    this._lastFemaleImage = null;
    this._lastMaleImage = null;
    
    // 콜백 설정
    this.onComplete = config.onComplete || null;
    this.onError = config.onError || null;
    this.onTimerStart = config.onTimerStart || null;
    
    // 여성 화자 이미지 (5개)
    this.FEMALE_IMAGES = [
      'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageF1.jpg',
      'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageF2.jpg',
      'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageF3.jpg',
      'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageF4.jpg',
      'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageF5.jpg'
    ];
    
    // 남성 화자 이미지 (5개)
    this.MALE_IMAGES = [
      'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageM1.jpg',
      'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageM2.jpg',
      'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageM3.jpg',
      'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageM4.jpg',
      'https://eontoefl.github.io/toefl-audio/listening/response/image/response_imageM5.jpg'
    ];
  }

  /**
   * 초기화 - 데이터 로드 및 첫 문제 시작
   */
  async init() {
    console.log(`[ResponseComponent] 초기화 시작 - setNumber: ${this.setNumber}`);
    
    // 데이터 로드 (외부 로더 사용)
    const allData = await loadResponseData();
    
    if (!allData || !allData.sets || allData.sets.length === 0) {
      console.error('[ResponseComponent] 데이터 로드 실패');
      alert('응답고르기 데이터를 불러올 수 없습니다.');
      return false;
    }
    
    // 세트 찾기
    const setIndex = this.findSetIndex(allData.sets);
    if (setIndex === -1) {
      console.error(`[ResponseComponent] 세트를 찾을 수 없습니다 - setNumber: ${this.setNumber}`);
      return false;
    }
    
    this.setData = allData.sets[setIndex];
    console.log(`[ResponseComponent] 세트 데이터 로드 완료:`, this.setData);
    
    // 첫 문제 로드
    this.loadQuestion(0);
    
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
      setId = `response_set_${String(this.setNumber).padStart(4, '0')}`;
      console.log(`🔍 [findSetIndex] setNumber ${this.setNumber} → setId: ${setId}`);
    }
    
    console.log(`[ResponseComponent] 세트 검색 - ID: ${setId}`);
    
    const index = sets.findIndex(s => s.setId === setId);
    console.log(`[ResponseComponent] 세트 인덱스: ${index}`);
    return index;
  }

  /**
   * 문제 로드
   */
  loadQuestion(questionIndex) {
    console.log(`[ResponseComponent] 문제 로드 - questionIndex: ${questionIndex}`);
    
    // 이전 오디오 완전 정리
    this.stopAudio();
    
    // 타임아웃 상태 초기화
    this._questionTimedOut = false;
    const timeoutNotice = document.getElementById('responseTimeoutNotice');
    if (timeoutNotice) timeoutNotice.remove();
    
    const question = this.setData.questions[questionIndex];
    if (!question) {
      console.error('[ResponseComponent] 문제 데이터 없음');
      return;
    }
    
    this.currentQuestion = questionIndex;
    this._currentQuestion = question;
    
    // 사람 이미지 표시
    this.renderPersonImage(question.gender);
    
    // 보기를 보여주되 흐리게 + [듣기 시작] 버튼 표시
    this.renderOptions(question, true);
    this._showPlayButton();

    // 오디오 재생 전이므로 타이머 숨김
    const timerWrap = document.getElementById('responseTimerWrap');
    if (timerWrap) timerWrap.style.display = 'none';
  }
  
  /**
   * [듣기 시작] 버튼 표시
   */
  _showPlayButton() {
    const container = document.getElementById('responsePersonImage');
    if (!container) return;
    
    // 기존 버튼 제거
    const existingBtn = document.getElementById('responseListenBtn');
    if (existingBtn) existingBtn.remove();
    
    const btn = document.createElement('button');
    btn.id = 'responseListenBtn';
    btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;margin-right:10px;"><path d="M3 9v6h4l5 5V4L7 9H3z" fill="white"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="white"/><path d="M19 12c0-3.17-1.82-5.9-4.5-7.22v2.16A5.98 5.98 0 0 1 18 12c0 2.48-1.35 4.64-3.5 5.06v2.16C17.18 17.9 19 15.17 19 12z" fill="white" opacity="0.7"/></svg>듣기 시작';
    btn.onclick = () => this._onPlayButtonClick();
    container.appendChild(btn);
  }
  
  /**
   * [듣기 시작] 버튼 클릭 시 실행
   */
  _onPlayButtonClick() {
    const question = this._currentQuestion;
    if (!question) return;
    
    console.log('[ResponseComponent] 🔊 [듣기 시작] 버튼 클릭');
    
    // 버튼 숨기기
    const btn = document.getElementById('responseListenBtn');
    if (btn) btn.remove();
    
    // 오디오가 유효한지 확인
    const hasValidAudio = question.audioUrl && 
                          question.audioUrl !== 'PLACEHOLDER' && 
                          !question.audioUrl.includes('1ABC123DEF456');
    
    if (hasValidAudio) {
      // 오디오 재생 (보기는 이미 흐린 상태)
      this.playAudio(question.audioUrl, () => {
        if (this._destroyed) return;
        // 오디오 끝 → 보기 선명하게 + 타이머 보이기 + 타이머 시작
        this.renderOptions(question, false);
        const tw = document.getElementById('responseTimerWrap');
        if (tw) tw.style.display = '';
        if (this.onTimerStart) {
          this.onTimerStart();
        }
      });
    } else {
      // 오디오 없으면 즉시 보기 표시 + 타이머 보이기 + 타이머 시작
      this.renderOptions(question, false);
      const tw2 = document.getElementById('responseTimerWrap');
      if (tw2) tw2.style.display = '';
      if (this.onTimerStart) {
        this.onTimerStart();
      }
    }
  }

  /**
   * 직전 이미지를 제외하고 랜덤 선택
   */
  _pickRandomExcludingLast(imageArray, lastKey) {
    if (imageArray.length <= 1) return imageArray[0] || '';
    const last = this[lastKey];
    const candidates = last ? imageArray.filter(img => img !== last) : imageArray;
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    this[lastKey] = picked;
    return picked;
  }

  /**
   * 사람 이미지 렌더링
   */
  renderPersonImage(gender) {
    console.log('[ResponseComponent] 이미지 렌더링 - 성별:', gender);
    
    const container = document.getElementById('responsePersonImage');
    if (!container) {
      console.error('[ResponseComponent] responsePersonImage 요소 없음');
      return;
    }
    
    let imageUrl;
    if (gender === 'F' || gender === 'female') {
      imageUrl = this._pickRandomExcludingLast(this.FEMALE_IMAGES, '_lastFemaleImage');
    } else {
      imageUrl = this._pickRandomExcludingLast(this.MALE_IMAGES, '_lastMaleImage');
    }
    
    container.innerHTML = `
      <div style="text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center;">
        <img src="${imageUrl}" alt="${gender} speaker" 
             style="width: 100%; max-width: 400px; height: auto; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); object-fit: cover;"
             onerror="console.error('❌ 이미지 로드 실패:', this.src); this.style.display='none';"
             onload="console.log('✅ 이미지 로드 성공:', this.src);">
      </div>
    `;
  }
  
  /**
   * 오디오 완전 정지 및 정리
   */
  stopAudio() {
    if (this._audioDelayTimer) {
      clearTimeout(this._audioDelayTimer);
      this._audioDelayTimer = null;
      console.log('[ResponseComponent] 🛑 딜레이 타이머 취소');
    }
    
    if (this.audioPlayer) {
      try {
        this.audioPlayer.pause();
        this.audioPlayer.onended = null;
        this.audioPlayer.onerror = null;
        this.audioPlayer.removeAttribute('src');
        this.audioPlayer.load();
        this.audioPlayer = null;
        this.isAudioPlaying = false;
        console.log('[ResponseComponent] 🛑 오디오 완전 정리 완료');
      } catch (err) {
        console.warn('[ResponseComponent] 오디오 정리 중 오류:', err);
      }
    }
  }

  /**
   * 선택지 렌더링
   */
  renderOptions(question, isBlurred) {
    console.log('[ResponseComponent] 선택지 렌더링 - 블러:', isBlurred);
    
    const container = document.getElementById('responseOptions');
    if (!container) return;
    
    const questionKey = `${this.setData.setId}_q${this.currentQuestion + 1}`;
    const savedAnswer = this.answers[questionKey];
    
    container.innerHTML = '';
    const self = this;
    question.options.forEach((option, index) => {
      const optionDiv = document.createElement('div');
      optionDiv.className = 'response-option' + (savedAnswer === (index + 1) ? ' selected' : '') + (isBlurred ? ' blurred' : '');
      if (isBlurred) optionDiv.style.pointerEvents = 'none';
      optionDiv.textContent = option;
      optionDiv.onclick = () => self.selectOption(index + 1);
      container.appendChild(optionDiv);
    });
  }

  /**
   * 오디오 재생
   */
  playAudio(audioUrl, onEnded) {
    console.log('[ResponseComponent] 오디오 재생 시작');
    console.log('[ResponseComponent] 원본 audioUrl:', audioUrl);
    
    if (!audioUrl || audioUrl === 'PLACEHOLDER' || audioUrl.includes('1ABC123DEF456')) {
      console.warn('[ResponseComponent] 오디오 URL 없음, 즉시 진행');
      if (onEnded) onEnded();
      return;
    }
    
    console.log('[ResponseComponent] 재생 URL:', audioUrl);
    
    // 기존 오디오 정리
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer.removeAttribute('src');
      this.audioPlayer.load();
      this.audioPlayer = null;
    }
    
    // 중복 콜백 방지 플래그
    let _callbackFired = false;
    const fireCallback = (source) => {
      if (_callbackFired) {
        console.log(`[ResponseComponent] 콜백 중복 차단 (${source})`);
        return;
      }
      _callbackFired = true;
      this.isAudioPlaying = false;
    };
    
    this.audioPlayer = new Audio(audioUrl);
    this.isAudioPlaying = true;
    
    this.audioPlayer.addEventListener('loadeddata', () => {
      console.log('[ResponseComponent] 오디오 로드 완료');
    });
    
    this.audioPlayer.addEventListener('ended', () => {
      if (this._destroyed) return;
      console.log('[ResponseComponent] 오디오 재생 완료');
      fireCallback('ended');
      if (onEnded) onEnded();
    });
    
    this.audioPlayer.addEventListener('error', (e) => {
      if (this._destroyed) return;
      if (!this.audioPlayer) return;
      console.error('[ResponseComponent] 오디오 재생 실패:', e);
      fireCallback('error');
      this._showAudioRetryUI(audioUrl, onEnded);
    });
    
    this.audioPlayer.play().catch(err => {
      if (this._destroyed) return;
      console.error('[ResponseComponent] 오디오 play() 실패:', err.name, err.message);
      fireCallback('catch');
      this._showAudioRetryUI(audioUrl, onEnded);
    });
  }
  
  /**
   * 오디오 재생 실패 시 다시 재생 UI
   */
  _showAudioRetryUI(audioUrl, onEnded) {
    if (document.getElementById('responseAudioRetryUI')) return;
    
    const container = document.getElementById('responsePersonImage');
    if (!container) return;
    
    const retryDiv = document.createElement('div');
    retryDiv.id = 'responseAudioRetryUI';
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
      <button id="responseRetryBtn" style="
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
    
    document.getElementById('responseRetryBtn').onclick = () => {
      retryDiv.remove();
      console.log('[ResponseComponent] 🔄 오디오 다시 재생 시도');
      this.playAudio(audioUrl, onEnded);
    };
  }

  /**
   * 타임아웃 시 보기 선택 막기
   */
  onQuestionTimeout() {
    console.log('[ResponseComponent] ⏰ 시간 초과 - 보기 선택 차단');
    this._questionTimedOut = true;
    
    document.querySelectorAll('.response-option').forEach(el => {
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.5';
    });
    
    const container = document.getElementById('responseOptions');
    if (container) {
      const notice = document.createElement('div');
      notice.id = 'responseTimeoutNotice';
      notice.style.cssText = `
        text-align: center;
        padding: 12px;
        margin-top: 12px;
        background: #fff3cd;
        border: 1px solid #ffc107;
        border-radius: 8px;
        color: #856404;
        font-weight: 600;
      `;
      notice.textContent = '⏰ 시간이 초과되었습니다. Next 버튼을 눌러주세요.';
      container.appendChild(notice);
    }
  }
  
  /**
   * 선택지 선택
   */
  selectOption(optionIndex) {
    if (this._questionTimedOut) return;
    
    console.log(`[ResponseComponent] 선택 - Q${this.currentQuestion + 1}: ${optionIndex}`);
    
    const questionKey = `${this.setData.setId}_q${this.currentQuestion + 1}`;
    this.answers[questionKey] = optionIndex;
    
    document.querySelectorAll('.response-option').forEach((el, idx) => {
      if (idx === optionIndex - 1) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
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
    console.log('[ResponseComponent] ✅ 제출 시작');
    
    if (this.isSubmitting) {
      console.warn('[ResponseComponent] ⚠️ 중복 제출 방지');
      return null;
    }
    
    this.isSubmitting = true;
    
    // 오디오 정지
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer = null;
    }
    this.isAudioPlaying = false;
    
    // 결과 데이터 준비
    const results = {
      setId: this.setData.setId,
      answers: []
    };
    
    this.setData.questions.forEach((question, index) => {
      const questionKey = `${this.setData.setId}_q${index + 1}`;
      const userAnswer = this.answers[questionKey] || null;
      const isCorrect = userAnswer === question.correctAnswer;
      
      results.answers.push({
        questionNum: question.questionNum,
        audioUrl: question.audioUrl,
        script: question.script || '',
        scriptTrans: question.scriptTrans || '',
        scriptHighlights: question.scriptHighlights || [],
        options: question.options,
        optionTranslations: question.optionTranslations || [],
        optionExplanations: question.optionExplanations || [],
        userAnswer: userAnswer,
        correctAnswer: question.correctAnswer,
        isCorrect: isCorrect
      });
    });
    
    console.log('[ResponseComponent] 채점 완료:', results);
    
    // 완료 콜백
    if (this.onComplete) {
      console.log('[ResponseComponent] 🎉 onComplete 콜백 호출');
      this.onComplete(results);
    } else {
      console.warn('[ResponseComponent] ⚠️ onComplete 콜백이 설정되지 않음');
    }
    
    return results;
  }

  /**
   * Cleanup
   */
  cleanup() {
    console.log('[ResponseComponent] Cleanup 시작');
    
    this._destroyed = true;
    this.stopAudio();
    
    this.isAudioPlaying = false;
    this.isSubmitting = false;
    this.answers = {};
    
    console.log('[ResponseComponent] Cleanup 완료');
  }
}

// 전역으로 노출
window.ResponseComponent = ResponseComponent;
console.log('[ResponseComponent] 클래스 정의 완료');
