/**
 * AcademicComponent.js v=007
 * 
 * Academic Reading 컴포넌트
 * - 🔥 optionsId 속성 추가 (RetakeController 캐시 복원용)
 * - 세트당 5문제
 * - 지문 렌더링, 문제 로드, 선택지 처리
 * - 답안 채점 및 sessionStorage 저장
 * - 타이머, 버튼 제어, 진행바는 Module Controller에서 관리
 */

class AcademicComponent {
  constructor(setNumber) {
    console.log(`[AcademicComponent] 생성 - setNumber: ${setNumber}`);
    
    this.setNumber = setNumber;           // 12. currentAcademicSet → this.setNumber
    this.currentQuestion = 0;             // 13. currentAcademicQuestion → this.currentQuestion (0-based)
    this.answers = {};                    // 14. academicAnswers → this.answers (현재 세트 답안)
    
    this.setData = null;                  // 현재 세트 데이터
    this.totalQuestions = 5;              // Academic은 5문제 고정
    
    // DOM 요소 ID (RetakeController 캐시 복원용)
    this.optionsId = 'academicOptions';
  }

  /**
   * 1. 초기화 - 데이터 로드 및 화면 렌더링
   */
  async init() {
    console.log(`[AcademicComponent] 초기화 시작 - setNumber: ${this.setNumber}`);
    
    // 1. 화면 전환
    showScreen('readingAcademicScreen');
    
    // 2. readingAcademicData 로드
    if (!window.readingAcademicData || window.readingAcademicData.length === 0) {
      console.log('[AcademicComponent] 데이터 로드 필요 - loadAcademicData() 호출');
      await loadAcademicData();
    }

    // 3. findAcademicSetIndex - 세트 인덱스 찾기
    const setIndex = this.findSetIndex();
    if (setIndex === -1) {
      console.error(`[AcademicComponent] 세트를 찾을 수 없습니다 - setNumber: ${this.setNumber}`);
      return;
    }

    this.setData = window.readingAcademicData[setIndex];
    console.log(`[AcademicComponent] 세트 데이터 로드 완료:`, this.setData);

    // 4-1. Title 표시 (mainTitle)
    const mainTitleEl = document.getElementById('academicMainTitle');
    if (mainTitleEl && this.setData.mainTitle) {
      mainTitleEl.textContent = this.setData.mainTitle;
    }

    // 5. renderAcademicPassage - 지문 렌더링
    this.renderPassage();

    // 6-1. loadAcademicQuestion - 첫 문제 로드
    this.loadQuestion(0);
  }

  /**
   * 3. findAcademicSetIndex - 세트 ID로 인덱스 찾기
   */
  findSetIndex() {
    // 🆕 setNumber가 이미 "academic_set_0001" 형식이면 그대로 사용
    let setId;
    if (typeof this.setNumber === 'string' && this.setNumber.startsWith('academic_set_')) {
      setId = this.setNumber;
      console.log(`🔍 [findSetIndex] setId 문자열 직접 사용: ${setId}`);
    } else {
      setId = `academic_set_${String(this.setNumber).padStart(4, '0')}`;
      console.log(`🔍 [findSetIndex] setNumber ${this.setNumber} → setId: ${setId}`);
    }
    
    console.log(`[AcademicComponent] 세트 검색 - ID: ${setId}, 총 세트: ${window.readingAcademicData?.length || 0}`);
    
    const index = window.readingAcademicData.findIndex(s => s.id === setId);
    console.log(`[AcademicComponent] 세트 인덱스: ${index}`);
    return index;
  }

  /**
   * 5. renderAcademicPassage - 지문 렌더링
   */
  renderPassage() {
    console.log('[AcademicComponent] 지문 렌더링');
    
    const titleEl = document.getElementById('academicPassageTitle');
    const contentEl = document.getElementById('academicPassageContent');

    if (!this.setData || !this.setData.passage) {
      console.error('[AcademicComponent] 지문 데이터 없음');
      return;
    }

    if (titleEl) {
      titleEl.innerHTML = this.setData.passage.title || '';
    }
    if (contentEl) {
      // 지문 렌더링 시 (A)~(D) 마커를 미리 span으로 감싸놓기 (기본 숨김)
      let html = this.setData.passage.content || '';
      html = html.replace(/\(([A-D])\)/g, '<span class="ac-insertion-marker">($1)</span>');
      contentEl.innerHTML = html;
    }

    console.log('[AcademicComponent] 지문 렌더링 완료');
  }

  /**
   * 🆕 5-1. 지문 highlight/insertion 스타일 토글
   * - highlight 문제 활성: .ac-highlight-word에 활성 클래스 추가
   * - insertion 문제 활성: (A)(B)(C)(D) 마커에 강조 클래스 추가
   * - 그 외: 모든 강조 제거
   */
  updatePassageHighlight(question) {
    const contentEl = document.getElementById('academicPassageContent');
    if (!contentEl) return;

    const type = question.questionType || 'normal';

    // highlight 토글
    contentEl.querySelectorAll('.ac-highlight-word').forEach(el => {
      el.classList.toggle('ac-highlight-active', type === 'highlight');
    });

    // insertion 마커 표시/숨김 (renderPassage에서 이미 span으로 감싸놓음)
    contentEl.querySelectorAll('.ac-insertion-marker').forEach(el => {
      el.classList.toggle('ac-insertion-active', type === 'insertion');
    });
  }

  /**
   * 6-1. loadAcademicQuestion - 문제 로드 (질문 텍스트, 선택지 렌더링, 답안 복원)
   */
  loadQuestion(questionIndex) {
    console.log(`[AcademicComponent] 문제 로드 - questionIndex: ${questionIndex}`);
    
    this.currentQuestion = questionIndex;
    const question = this.setData.questions[questionIndex];

    if (!question) {
      console.error(`[AcademicComponent] 문제 데이터 없음 - index: ${questionIndex}`);
      return;
    }

    // 모듈 모드일 때 진행률 업데이트
    if (window.isModuleMode && window.moduleController) {
      window.moduleController.updateCurrentQuestionInComponent(questionIndex);
    }

    // 🆕 highlight/insertion 지문 스타일 토글
    this.updatePassageHighlight(question);

    // 질문 텍스트 (insertion 문제: "..." 를 박스로 표시)
    const questionTextEl = document.getElementById('academicQuestion');
    if (questionTextEl) {
      let qText = question.question || '';
      if ((question.questionType || 'normal') === 'insertion') {
        qText = qText.replace(/"([^"]+)"/g, '<div class="ac-insertion-sentence">"$1"</div>');
      }
      questionTextEl.innerHTML = qText;
    }

    // 선택지 렌더링 (6-2)
    this.renderOptions(question.options);

    // 6-3. 답안 복원
    this.restoreAnswer(questionIndex);

    console.log(`[AcademicComponent] 문제 ${questionIndex + 1} 로드 완료`);
  }

  /**
   * 6-2. 선택지 렌더링 (구형 string 배열과 신형 object 배열 모두 지원)
   */
  renderOptions(options) {
    const container = document.getElementById('academicOptions');
    if (!container) {
      console.error('[AcademicComponent] academicOptions 컨테이너를 찾을 수 없습니다');
      return;
    }

    container.innerHTML = '';

    options.forEach((opt, idx) => {
      const label = this.getLabelFromIndex(idx);
      const text = typeof opt === 'object' ? opt.text : opt;

      const optionDiv = document.createElement('div');
      optionDiv.className = 'answer-option';  // ✅ 'option' → 'answer-option' 변경
      optionDiv.dataset.value = label;
      optionDiv.textContent = `${label}) ${text}`;  // ✅ innerHTML → textContent
      
      optionDiv.addEventListener('click', () => this.selectOption(label));
      container.appendChild(optionDiv);
    });
  }

  /**
   * 6-3. 답안 복원
   */
  restoreAnswer(questionIndex) {
    if (this.answers[questionIndex]) {
      const selected = this.answers[questionIndex];
      const options = document.querySelectorAll('#academicOptions .answer-option');
      options.forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === selected);
      });
    }
  }

  /**
   * 7. selectAcademicOption - 선택지 선택
   */
  selectOption(value) {
    console.log(`[AcademicComponent] 선택지 선택 - Q${this.currentQuestion + 1}: ${value}`);
    
    this.answers[this.currentQuestion] = value;

    // UI 업데이트
    const options = document.querySelectorAll('#academicOptions .answer-option');
    options.forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.value === value);
    });
  }

  /**
   * 8. nextQuestion - 다음 문제로 이동
   */
  nextQuestion() {
    if (this.currentQuestion < this.totalQuestions - 1) {
      this.loadQuestion(this.currentQuestion + 1);
      return true;
    }
    console.log('[AcademicComponent] 마지막 문제입니다');
    return false;
  }

  /**
   * 9. previousQuestion - 이전 문제로 이동
   */
  previousQuestion() {
    if (this.currentQuestion > 0) {
      this.loadQuestion(this.currentQuestion - 1);
      return true;
    }
    console.log('[AcademicComponent] 첫 문제입니다');
    return false;
  }

  /**
   * 10. isLastQuestion - 마지막 문제 여부
   */
  isLastQuestion() {
    return this.currentQuestion === this.totalQuestions - 1;
  }

  /**
   * 11-2. submitAcademic - 답안 수집 & 채점
   */
  submit() {
    console.log('[AcademicComponent] 제출 시작');

    // 11-3. 채점 (5문제)
    const result = {
      setId: this.setData.id,
      mainTitle: this.setData.mainTitle,
      passage: this.setData.passage,
      answers: []
    };

    this.setData.questions.forEach((q, idx) => {
      const userAnswer = this.answers[idx] || '';
      
      // ✅ 수정: userAnswer는 'A','B','C','D'이고, q.correctAnswer는 숫자(1,2,3,4,5)
      // 'A' → 1, 'B' → 2, 'C' → 3, 'D' → 4로 변환
      const userAnswerNumber = userAnswer ? userAnswer.charCodeAt(0) - 64 : 0; // 'A'.charCodeAt(0) = 65
      const isCorrect = userAnswerNumber === q.correctAnswer;

      result.answers.push({
        questionIndex: idx,
        question: q.question,
        userAnswer: userAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect: isCorrect,
        options: q.options
      });
    });

    // sessionStorage 저장
    const storageKey = `academic_set_${String(this.setNumber).padStart(4, '0')}`;
    sessionStorage.setItem(storageKey, JSON.stringify(result));
    console.log(`[AcademicComponent] sessionStorage 저장 완료 - key: ${storageKey}`);

    // 채점 완료 콜백
    if (this.onComplete) {
      console.log('[AcademicComponent] onComplete 콜백 호출');
      this.onComplete(result);
    }

    return result;
  }

  /**
   * Utility: 인덱스 → 알파벳 라벨 변환
   */
  getLabelFromIndex(index) {
    return String.fromCharCode(65 + index); // 65 = 'A'
  }

  /**
   * ================================================
   * 2차 풀이 (이중채점) 모드
   * ================================================
   */
  
  /**
   * 2차 풀이 모드로 단일 문제 표시
   * @param {number} questionIndex - 세트 내 문제 인덱스 (0-4)
   * @param {boolean} wasCorrect - 1차에 맞았는지 여부
   * @param {any} firstAttemptAnswer - 1차 답안
   */
  async initRetakeMode(questionIndex, wasCorrect, firstAttemptAnswer = null) {
    console.log(`🔄 [AcademicComponent] 2차 풀이 모드 - 문제 ${questionIndex}, 1차 결과: ${wasCorrect ? '✅' : '❌'}`);
    console.log(`  📥 firstAttemptAnswer:`, firstAttemptAnswer);
    
    try {
      // 1. 데이터 로드
      if (!window.readingAcademicData || window.readingAcademicData.length === 0) {
        await loadAcademicData();
      }
      
      // 2. 세트 찾기
      const setIndex = this.findSetIndex();
      if (setIndex === -1) {
        throw new Error(`세트를 찾을 수 없습니다: ${this.setNumber}`);
      }
      
      this.setData = window.readingAcademicData[setIndex];
      this.currentQuestion = questionIndex;
      
      console.log(`  📊 setData.id: ${this.setData.id}`);
      console.log(`  📊 setData.mainTitle: ${this.setData.mainTitle}`);
      console.log(`  📊 선택된 question (index ${questionIndex}):`, this.setData.questions[questionIndex]?.question.substring(0, 100));
      
      // 3. 화면 표시
      showScreen('readingAcademicScreen');
      
      // 4. 타이머 숨기기
      this.hideTimer();
      
      // 5. ⭐ mainTitle 설정 (핵심!)
      const mainTitleEl = document.getElementById('academicMainTitle');
      if (mainTitleEl && this.setData.mainTitle) {
        mainTitleEl.textContent = this.setData.mainTitle;
        console.log(`  ✅ mainTitle 설정: ${this.setData.mainTitle}`);
      }
      
      // 6. 지문 렌더링
      this.renderPassage();
      
      // 7. 문제 렌더링 (2차 풀이 모드)
      this.renderQuestionRetakeMode(questionIndex, wasCorrect, firstAttemptAnswer);
      
    } catch (error) {
      console.error('[AcademicComponent] 2차 풀이 초기화 실패:', error);
    }
  }
  
  /**
   * 2차 풀이 모드로 문제 렌더링
   */
  renderQuestionRetakeMode(questionIndex, wasCorrect, firstAttemptAnswer) {
    console.log(`🎨 [AcademicComponent] 2차 풀이 문제 렌더링 - Q${questionIndex + 1}`);
    
    const question = this.setData.questions[questionIndex];
    if (!question) {
      console.error(`❌ 문제를 찾을 수 없습니다: index ${questionIndex}`);
      return;
    }
    
    // 🆕 highlight/insertion 지문 스타일 토글
    this.updatePassageHighlight(question);
    
    // 1. 문제 텍스트 표시 (insertion 문제: "..." 를 박스로 표시)
    const questionEl = document.getElementById('academicQuestion');
    if (questionEl) {
      let qText = question.question || '';
      if ((question.questionType || 'normal') === 'insertion') {
        qText = qText.replace(/"([^"]+)"/g, '<div class="ac-insertion-sentence">"$1"</div>');
      }
      questionEl.innerHTML = qText;
    }
    
    // 2. 보기 컨테이너 초기화
    const optionsEl = document.getElementById('academicOptions');
    if (!optionsEl) {
      console.error('❌ academicOptions 요소를 찾을 수 없습니다');
      return;
    }
    optionsEl.innerHTML = '';
    
    // 3. 각 보기 렌더링
    question.options.forEach((option, index) => {
      const optionDiv = document.createElement('div');
      optionDiv.className = 'answer-option';
      
      const optionLabel = this.getLabelFromIndex(index); // 'A', 'B', 'C', 'D', 'E'
      
      // 2차 풀이: 1차에 맞았으면 정답 표시하고 클릭 불가
      if (wasCorrect && firstAttemptAnswer && firstAttemptAnswer.userAnswer === optionLabel) {
        optionDiv.classList.add('retake-option-correct');
        // 클릭 불가
      } else {
        // ✅ 틀렸거나 다른 보기: 클릭 가능 (label 전달!)
        optionDiv.onclick = () => this.selectOption(optionLabel);
      }
      
      // 보기 텍스트 설정
      const displayText = typeof option === 'object' ? option.text : option;
      optionDiv.textContent = `${optionLabel}) ${displayText}`;
      optionDiv.setAttribute('data-value', optionLabel);
      
      optionsEl.appendChild(optionDiv);
    });
    
    console.log(`✅ [AcademicComponent] 2차 풀이 렌더링 완료 - ${question.options.length}개 보기`);
  }
  
  /**
   * 타이머와 버튼 숨기기
   */
  hideTimer() {
    console.log('  ⏱️ [AcademicComponent] 타이머 및 버튼 숨김 시작');
    
    // ✅ 개별 타이머 숨기기
    const timerEl = document.getElementById('academicTimer');
    if (timerEl) {
      timerEl.style.display = 'none';
    }
    
    // ✅ ModuleController 타이머도 숨기기
    if (window.moduleController) {
      const moduleTimerEl = document.getElementById('moduleTimer');
      if (moduleTimerEl) {
        moduleTimerEl.style.display = 'none';
      }
      
      // 타이머 정지
      if (window.moduleController.stopTimer) {
        window.moduleController.stopTimer();
      }
    }
    
    // ✅ Previous, Next, Submit 버튼 숨기기
    const prevBtn = document.querySelector('button[onclick*="previousQuestion"]');
    const nextBtn = document.querySelector('button[onclick*="nextQuestion"]');
    const submitBtn = document.querySelector('button[onclick*="submitComponent"]');
    
    if (prevBtn) prevBtn.parentElement.style.display = 'none';
    if (nextBtn) nextBtn.parentElement.style.display = 'none';
    if (submitBtn) submitBtn.style.display = 'none';
    
    // ✅ 추가 버튼들 숨기기
    const buttonsToHide = [
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
    return this.answers[this.currentQuestion] || null;
  }
}

// 전역으로 노출
window.AcademicComponent = AcademicComponent;
console.log('[AcademicComponent] 클래스 정의 완료');
