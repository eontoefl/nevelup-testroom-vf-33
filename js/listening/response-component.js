/**
 * response-component.js
 * 리스닝 - 응답고르기 컴포넌트
 *
 * - 세트당 12문제
 * - 오디오 자동 재생 (화면 표시 약 2초 후 → 재생 → 블러 해제) — 실전 동일
 * - 선택지 4개
 * - 답안 채점 및 결과 반환
 *
 * 의존성: response-loader.js (loadResponseData), 오디오는 컨트롤러의 공용 서비스(config.audio) 사용
 */

class ResponseComponent {
  constructor(setNumber, config = {}) {
    console.log(`[ResponseComponent] 생성 - setNumber: ${setNumber}`);

    this.setNumber = setNumber;
    this.currentQuestion = 0;
    this.answers = {};

    this.setData = null;
    this.isSubmitting = false;
    this._destroyed = false;
    this._questionTimedOut = false;
    // 시작 상태 = 오디오 단계 (다른 유형의 showingIntro=true와 동일 원칙)
    // → 데이터 로드 전/실패 시 Next가 절대 동작하지 않음
    this._audioPhase = true;
    this._lastFemaleImage = null;
    this._lastMaleImage = null;

    // 콜백/서비스 설정
    this.audio = config.audio || null;   // 리스닝 공용 오디오 서비스 (모듈당 1개)
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

    // 이전 오디오/대기 타이머 정리
    if (this.audio) this.audio.stopAll();

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

    // 보기를 보여주되 흐리게 (오디오 종료 후 선명해짐)
    this.renderOptions(question, true);

    // 오디오 재생 전이므로 타이머 숨김
    const timerWrap = document.getElementById('responseTimerWrap');
    if (timerWrap) timerWrap.style.display = 'none';

    // 화면 표시 약 2초 후 자동 재생 (실전 동일, 예고 표시 없음)
    // 대기하는 동안 오디오를 미리 받아 정확히 2초에 재생되게 함
    this._audioPhase = true;
    this._audioFailCount = 0;
    if (this.audio) {
      this.audio.schedule(() => this._startQuestionAudio(), [question.audioUrl]);
    } else {
      // 오디오 서비스 없음(비정상) — 바로 답변 단계로
      this._enterAnswerPhase();
    }
  }

  /**
   * 현재 세트가 오디오 대기/재생 단계인지 (컨트롤러가 Next/Submit 숨김 판단에 사용)
   */
  isAudioPhase() {
    return this._audioPhase === true;
  }

  /**
   * 문제 오디오 재생 시작 (자동재생 타이머에서 호출)
   */
  _startQuestionAudio() {
    if (this._destroyed) return;
    const question = this._currentQuestion;
    if (!question) return;

    if (!isValidListeningAudioUrl(question.audioUrl)) {
      console.warn('[ResponseComponent] 오디오 URL 없음 — 바로 답변 단계');
      this._enterAnswerPhase();
      return;
    }

    console.log('[ResponseComponent] 🔊 오디오 자동 재생:', question.audioUrl);
    this.audio.play(question.audioUrl, () => {
      if (this._destroyed) return;
      console.log('[ResponseComponent] 오디오 재생 완료');
      this._enterAnswerPhase();
    }, (err) => {
      if (this._destroyed) return;
      console.error('[ResponseComponent] 오디오 재생 실패:', err && err.message);
      this._audioFailCount++;
      this._showAudioRetryUI();
    });
  }

  /**
   * 답변 단계 진입 — 보기 선명 + 타이머 표시/시작
   */
  _enterAnswerPhase() {
    this._audioPhase = false;
    this.renderOptions(this._currentQuestion, false);
    const tw = document.getElementById('responseTimerWrap');
    if (tw) tw.style.display = '';
    if (this.onTimerStart) {
      this.onTimerStart();
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
   * 오디오 재생 실패 → 공용 실패 UI (다시 시도 / 2회 실패부터 건너뛰기)
   */
  _showAudioRetryUI() {
    showListeningFailureUI({
      containerId: 'responsePersonImage',
      uiId: 'responseAudioRetryUI',
      message: '오디오를 불러오지 못했습니다',
      failCount: this._audioFailCount,
      onRetry: () => {
        if (this._destroyed) return;
        console.log('[ResponseComponent] 🔄 오디오 다시 재생 시도');
        this._startQuestionAudio();
      },
      onSkip: () => {
        if (this._destroyed) return;
        console.log('[ResponseComponent] ⏭️ 오디오 건너뛰고 답변 단계로');
        this._enterAnswerPhase();
      }
    });
  }

  /**
   * 타임아웃 시 보기 선택 막기
   */
  onQuestionTimeout() {
    console.log('[ResponseComponent] ⏰ 시간 초과 - 보기 선택 차단');
    this._questionTimedOut = true;
    
    // 보기 잠금만 수행 — 이동은 컨트롤러가 스피너와 함께 자동 처리 (실전 동일)
    document.querySelectorAll('#responseOptions .response-option').forEach(el => {
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.5';
    });
  }
  
  /**
   * 선택지 선택
   */
  selectOption(optionIndex) {
    if (this._questionTimedOut) return;
    
    console.log(`[ResponseComponent] 선택 - Q${this.currentQuestion + 1}: ${optionIndex}`);
    
    const questionKey = `${this.setData.setId}_q${this.currentQuestion + 1}`;
    this.answers[questionKey] = optionIndex;
    
    document.querySelectorAll('#responseOptions .response-option').forEach((el, idx) => {
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

    // 오디오/대기 타이머 정지
    if (this.audio) this.audio.stopAll();
    
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
    if (this.audio) this.audio.stopAll();

    this._audioPhase = false;
    this.isSubmitting = false;
    this.answers = {};

    console.log('[ResponseComponent] Cleanup 완료');
  }
}

// 전역으로 노출
window.ResponseComponent = ResponseComponent;
console.log('[ResponseComponent] 클래스 정의 완료');
