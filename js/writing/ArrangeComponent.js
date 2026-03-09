/**
 * ArrangeComponent.js
 * 라이팅 - 단어배열 (Build a Sentence) 컴포넌트
 * v=002_retake
 * 
 * 특징:
 * - 대화형 UI (두 사람 프로필 + 문장)
 * - 드래그 & 드롭으로 빈칸 채우기
 * - 남녀 랜덤 조합 (남남/여여 불가)
 * - 첫 번째 빈칸 자동 대문자 변환
 * - 6분 50초 타이머 (410초)
 */

class ArrangeComponent {
    constructor(setNumber) {
        console.log(`[ArrangeComponent] 생성 - setNumber: ${setNumber}`);
        
        this.setNumber = setNumber;
        
        // 내부 상태
        this.currentQuestion = 0;
        this.answers = {}; // 문제별 답안 저장
        this.data = null;
        this.currentSetData = null;
        this.profilePairs = {}; // 문제별 프로필 이미지 저장
        this.draggedWord = null; // 현재 드래그 중인 단어
        
        
        // 프로필 이미지 (여자 7개, 남자 7개)
        this.FEMALE_IMAGES = [
            'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_F1.png',
            'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_F2.png',
            'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_F3.png',
            'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_F4.png',
            'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_F5.png',
            'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_F6.png',
            'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_F7.png'
        ];
        
        this.MALE_IMAGES = [
            'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_M1.png',
            'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_M2.png',
            'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_M3.png',
            'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_M4.png',
            'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_M5.png',
            'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_M6.png',
            'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_M7.png'
        ];
    }
    
    /**
     * 컴포넌트 초기화
     */
    async init() {
        console.log('[ArrangeComponent] 초기화 시작');
        
        try {
            // 1. 데이터 로드 (외부 로더 사용)
            this.data = await window.loadArrangeData();
            if (!this.data) {
                throw new Error('데이터를 불러올 수 없습니다');
            }
            
            // 2. 세트 찾기
            const setId = `arrange_set_${String(this.setNumber).padStart(4, '0')}`;
            console.log(`[ArrangeComponent] 세트 검색 - ID: ${setId}`);
            
            const setIndex = this.findSetIndex(setId);
            if (setIndex === -1) {
                throw new Error(`세트를 찾을 수 없습니다: ${setId}`);
            }
            
            this.currentSetData = this.data.sets[setIndex];
            console.log('[ArrangeComponent] 세트 데이터 로드 완료:', this.currentSetData);
            
            // ★ 2차 리테이크 모드: 전체 순회 (틀린 문제만 표시가 아닌 전체 1-10 순회)
            if (window.isArrangeRetake && window.arrangeRetakeWrongIndices) {
                this.isRetakeMode = true;
                this.retakeWrongIndices = window.arrangeRetakeWrongIndices;
                // 1차에서 맞은 문제의 정답을 미리 채워넣기
                this.prefillCorrectAnswers();
                console.log(`🔄 [ArrangeComponent] 리테이크 모드 - 전체 ${this.currentSetData.questions.length}문제 순회 (틀린 ${this.retakeWrongIndices.length}개)`);
            } else {
                this.isRetakeMode = false;
                this.retakeWrongIndices = [];
            }
            
            // 3. 첫 번째 문제 로드
            this.loadQuestion(0);
            
        } catch (error) {
            console.error('[ArrangeComponent] 초기화 실패:', error);
            alert('단어배열 데이터를 불러오는데 실패했습니다.');
        }
    }
    
    /**
     * 세트 인덱스 찾기
     */
    findSetIndex(setId) {
        return this.data.sets.findIndex(set => set.setId === setId);
    }
    
    /**
     * 랜덤 남녀 조합 생성 (남남/여여 불가, 직전 이미지 제외)
     */
    getRandomGenderPair() {
        // static 레벨 직전 이미지 추적
        if (!ArrangeComponent._lastFemaleImage) ArrangeComponent._lastFemaleImage = null;
        if (!ArrangeComponent._lastMaleImage) ArrangeComponent._lastMaleImage = null;
        
        const pickExcludingLast = (images, lastKey) => {
            if (images.length <= 1) return images[0] || '';
            const last = ArrangeComponent[lastKey];
            const candidates = last ? images.filter(img => img !== last) : images;
            const picked = candidates[Math.floor(Math.random() * candidates.length)];
            ArrangeComponent[lastKey] = picked;
            return picked;
        };
        
        const femaleImage = pickExcludingLast(this.FEMALE_IMAGES, '_lastFemaleImage');
        const maleImage = pickExcludingLast(this.MALE_IMAGES, '_lastMaleImage');
        
        // 랜덤으로 순서 결정 (50% 확률로 여자가 먼저 or 남자가 먼저)
        const femaleFirst = Math.random() < 0.5;
        
        return {
            first: femaleFirst ? {
                gender: 'female',
                image: femaleImage
            } : {
                gender: 'male',
                image: maleImage
            },
            second: femaleFirst ? {
                gender: 'male',
                image: maleImage
            } : {
                gender: 'female',
                image: femaleImage
            }
        };
    }
    
    /**
     * 문제 로드
     */
    loadQuestion(questionIndex) {
        console.log(`[ArrangeComponent] 문제 ${questionIndex + 1} 로드`);
        
        this.currentQuestion = questionIndex;
        const question = this.currentSetData.questions[questionIndex];
        
        // 문제별 프로필 이미지 조합 가져오기 (없으면 새로 생성)
        const questionKey = `${this.currentSetData.setId}_q${question.questionNum}`;
        if (!this.profilePairs[questionKey]) {
            this.profilePairs[questionKey] = this.getRandomGenderPair();
            console.log(`[ArrangeComponent] 새 프로필 조합 생성: ${questionKey}`);
        }
        
        // 문제 렌더링
        this.renderQuestion(question);
        
        // ★ 리테이크 모드: floating UI 표시
        if (this.isRetakeMode) {
            this.showRetakeFloatingUI(questionIndex);
        }
        
        console.log(`[ArrangeComponent] 문제 ${questionIndex + 1} 로드 완료`);
        
        // 버튼 상태 업데이트
        const totalQuestions = this.currentSetData.questions.length;
        
        // Prev 버튼: 첫 문제가 아니면 표시
        const prevBtn = document.getElementById('arrangePrevBtn');
        if (prevBtn) {
            prevBtn.style.display = questionIndex > 0 ? 'inline-block' : 'none';
        }
        
        // Next/Submit 버튼
        if (questionIndex >= totalQuestions - 1) {
            document.getElementById('arrangeNextBtn').style.display = 'none';
            document.getElementById('arrangeSubmitBtn').style.display = 'inline-block';
        } else {
            document.getElementById('arrangeNextBtn').style.display = 'inline-block';
            document.getElementById('arrangeSubmitBtn').style.display = 'none';
        }
    }
    
    /**
     * 이전 문제로 이동 (Prev 버튼에서 호출)
     */
    prevQuestion() {
        const prevIndex = this.currentQuestion - 1;
        if (prevIndex < 0) return;
        
        this.loadQuestion(prevIndex);
        
        const totalQuestions = this.currentSetData.questions.length;
        const progressEl = document.getElementById('arrangeProgress');
        if (progressEl) {
            progressEl.textContent = `Question ${prevIndex + 1} of ${totalQuestions}`;
        }
    }
    
    /**
     * 문제 렌더링
     */
    renderQuestion(question) {
        const container = document.getElementById('arrangeQuestionContent');
        
        // ★ 리테이크 모드에서 맞은 문제인지 확인
        const isReadonly = this.isRetakeMode && !this.retakeWrongIndices.includes(this.currentQuestion);
        
        // 저장된 답안 불러오기
        const questionKey = `${this.currentSetData.setId}_q${question.questionNum}`;
        const savedAnswer = this.answers[questionKey];
        
        // 프로필 이미지 조합
        const genderPair = this.profilePairs[questionKey];
        
        // 첫 번째 사람 프로필 + 주어진 문장
        const givenSentenceHtml = `
            <div class="arrange-given">
                <div class="arrange-profile ${genderPair.first.gender}">
                    <img src="${genderPair.first.image}" alt="${genderPair.first.gender}" />
                </div>
                <div class="arrange-sentence">${question.givenSentence}</div>
            </div>
        `;
        
        // 두 번째 사람 프로필 + 빈칸
        const blanksHtml = question.presentedWords.map((word, index) => {
            const isBlank = word === '_';
            const userWord = savedAnswer && savedAnswer[index] ? savedAnswer[index] : null;
            
            if (isBlank) {
                if (isReadonly) {
                    // ★ readonly: 정답이 채워진 상태, 드래그/클릭 불가, 초록색 스타일
                    return `
                        <div class="arrange-blank has-word" 
                             data-index="${index}" 
                             style="background:#e8f5e9; border-color:#4CAF50; cursor:default; pointer-events:none;">
                            <span class="filled-word" style="color:#2e7d32; font-weight:700;">${userWord || ''}</span>
                        </div>
                    `;
                }
                return `
                    <div class="arrange-blank ${userWord ? 'has-word' : ''}" 
                         data-index="${index}" 
                         ondrop="window.currentArrangeComponent.dropWord(event)" 
                         ondragover="allowDrop(event)"
                         onclick="window.currentArrangeComponent.removeWord(${index})">
                        ${userWord ? `<span class="filled-word">${userWord}</span>` : ''}
                    </div>
                `;
            } else {
                return `<span class="arrange-presented-word">${word}</span>`;
            }
        }).join('');
        
        const answerAreaHtml = `
            <div class="arrange-answer">
                <div class="arrange-profile ${genderPair.second.gender}">
                    <img src="${genderPair.second.image}" alt="${genderPair.second.gender}" />
                </div>
                <div class="arrange-blanks">
                    ${blanksHtml}
                    <span class="arrange-punctuation">${question.endPunctuation}</span>
                </div>
            </div>
        `;
        
        // 하단 보기 단어들
        const usedWords = savedAnswer ? Object.values(savedAnswer) : [];
        // ★ 대소문자 무시 비교 (첫 빈칸 대문자 변환 대응)
        const usedWordsLower = usedWords.map(w => w.toLowerCase());
        const optionsHtml = question.optionWords.map(word => {
            const isUsed = isReadonly || usedWordsLower.includes(word.toLowerCase());
            return `
                <div class="arrange-option ${isUsed ? 'used' : ''}" 
                     draggable="${!isUsed}" 
                     ${!isReadonly ? `ondragstart="window.currentArrangeComponent.dragStart(event)" 
                     ondragend="window.currentArrangeComponent.dragEnd(event)"` : ''}
                     data-word="${word}">
                    ${word}
                </div>
            `;
        }).join('');
        
        const optionsAreaHtml = `
            <div class="arrange-options">
                ${optionsHtml}
            </div>
        `;
        
        container.innerHTML = `
            <h2 class="arrange-title">Make an appropriate sentence.</h2>
            ${givenSentenceHtml}
            ${answerAreaHtml}
            ${optionsAreaHtml}
        `;
    }
    
    /**
     * 드래그 시작
     */
    dragStart(event) {
        this.draggedWord = event.target.dataset.word;
        event.dataTransfer.effectAllowed = 'move';
        console.log(`[ArrangeComponent] 드래그 시작: ${this.draggedWord}`);
    }
    
    /**
     * 드래그 종료
     */
    dragEnd(event) {
        this.draggedWord = null;
        console.log('[ArrangeComponent] 드래그 종료');
    }
    
    /**
     * 단어 드롭
     */
    dropWord(event) {
        event.preventDefault();
        
        if (!this.draggedWord) return;
        
        const blank = event.target.closest('.arrange-blank');
        if (!blank) {
            console.log('[ArrangeComponent] 빈칸이 아닌 곳에 드롭 - 무시');
            this.draggedWord = null;
            return;
        }
        
        const index = parseInt(blank.dataset.index);
        const question = this.currentSetData.questions[this.currentQuestion];
        const questionKey = `${this.currentSetData.setId}_q${question.questionNum}`;
        
        if (!this.answers[questionKey]) {
            this.answers[questionKey] = {};
        }
        
        // 첫 번째 빈칸인지 확인
        let word = this.draggedWord;
        const isFirstBlank = question.presentedWords[0] === '_' && index === 0;
        
        if (isFirstBlank && word) {
            // 첫 글자를 대문자로 변환
            word = word.charAt(0).toUpperCase() + word.slice(1);
            console.log(`[ArrangeComponent] 첫 번째 빈칸 - 대문자 변환: ${this.draggedWord} → ${word}`);
        }
        
        this.answers[questionKey][index] = word;
        console.log(`[ArrangeComponent] 답안 저장: ${questionKey}[${index}] = ${word}`);
        
        // 화면 재렌더링
        this.renderQuestion(question);
        
        this.draggedWord = null;
    }
    
    /**
     * 단어 제거 (클릭)
     */
    removeWord(index) {
        // ★ 리테이크에서 맞은 문제는 제거 불가
        if (this.isRetakeMode && !this.retakeWrongIndices.includes(this.currentQuestion)) {
            return;
        }
        
        const question = this.currentSetData.questions[this.currentQuestion];
        const questionKey = `${this.currentSetData.setId}_q${question.questionNum}`;
        
        if (this.answers[questionKey] && this.answers[questionKey][index]) {
            console.log(`[ArrangeComponent] 단어 제거: ${questionKey}[${index}]`);
            delete this.answers[questionKey][index];
            
            // 화면 재렌더링
            this.renderQuestion(question);
        }
    }
    
    /**
     * ★ 리테이크: 1차에서 맞은 문제에 정답을 미리 채우기
     */
    prefillCorrectAnswers() {
        if (!this.currentSetData || !this.currentSetData.questions) return;
        
        this.currentSetData.questions.forEach((question, idx) => {
            // 맞은 문제만 (wrongIndices에 없는 것)
            if (!this.retakeWrongIndices.includes(idx)) {
                const questionKey = `${this.currentSetData.setId}_q${question.questionNum}`;
                this.answers[questionKey] = {};
                
                // correctAnswer 배열에서 빈칸 위치에 맞는 단어를 채움
                question.presentedWords.forEach((word, wordIdx) => {
                    if (word === '_') {
                        // correctAnswer에서 대응하는 단어 찾기
                        const correctWord = question.correctAnswer[wordIdx];
                        if (correctWord) {
                            this.answers[questionKey][wordIdx] = correctWord;
                        }
                    }
                });
                
                console.log(`✅ [ArrangeComponent] Q${question.questionNum} 정답 미리 채움`);
            }
        });
    }
    
    /**
     * ★ 리테이크: Floating UI 표시
     */
    showRetakeFloatingUI(questionIndex) {
        // 기존 floating 제거
        const existing = document.getElementById('arrangeRetakeFloating');
        if (existing) existing.remove();
        
        const isWrong = this.retakeWrongIndices.includes(questionIndex);
        const total = this.currentSetData.questions.length;
        const isFirst = questionIndex === 0;
        const isLast = questionIndex >= total - 1;
        
        const floatingDiv = document.createElement('div');
        floatingDiv.id = 'arrangeRetakeFloating';
        floatingDiv.className = isWrong ? 'retake-floating wrong' : 'retake-floating correct';
        
        const prevBtnHtml = !isFirst 
            ? `<button class="retake-prev-btn" onclick="window.currentArrangeComponent.goToPrevQuestion()">← 이전 문제</button>` 
            : '';
        const nextBtnHtml = !isLast
            ? `<button class="retake-next-btn" onclick="window.currentArrangeComponent.goToNextQuestion()">다음 문제로 →</button>`
            : `<button class="retake-next-btn" onclick="window.currentArrangeComponent.goToNextQuestion()">제출하기 →</button>`;
        
        if (isWrong) {
            floatingDiv.innerHTML = `
                <div class="retake-floating-content">
                    <div class="retake-icon">⚠️</div>
                    <div class="retake-message">틀렸던 문제입니다<br>다시 풀어보세요!</div>
                    <div style="font-size:12px; color:#888; margin-top:4px;">Q${questionIndex + 1} / ${total}</div>
                    <div class="retake-buttons">
                        ${prevBtnHtml}
                        ${nextBtnHtml}
                    </div>
                </div>
            `;
        } else {
            floatingDiv.innerHTML = `
                <div class="retake-floating-content">
                    <div class="retake-icon">✅</div>
                    <div class="retake-message">맞은 문제입니다</div>
                    <div style="font-size:12px; color:#888; margin-top:4px;">Q${questionIndex + 1} / ${total}</div>
                    <div class="retake-buttons">
                        ${prevBtnHtml}
                        ${nextBtnHtml}
                    </div>
                </div>
            `;
        }
        
        document.body.appendChild(floatingDiv);
    }
    
    /**
     * ★ 리테이크: Floating UI 제거
     */
    removeRetakeFloatingUI() {
        const existing = document.getElementById('arrangeRetakeFloating');
        if (existing) existing.remove();
    }
    
    /**
     * ★ 리테이크: 다음 문제 (floating 버튼에서 호출)
     */
    goToNextQuestion() {
        const nextIndex = this.currentQuestion + 1;
        const totalQuestions = this.currentSetData.questions.length;
        
        if (nextIndex >= totalQuestions) {
            // 마지막 → 제출
            this.removeRetakeFloatingUI();
            this.submit();
            return;
        }
        
        this.loadQuestion(nextIndex);
        
        // 진행률 업데이트
        const progressEl = document.getElementById('arrangeProgress');
        if (progressEl) {
            progressEl.textContent = `Question ${nextIndex + 1} of ${totalQuestions}`;
        }
        
        // Next/Submit 버튼 상태
        if (nextIndex >= totalQuestions - 1) {
            document.getElementById('arrangeNextBtn').style.display = 'none';
            document.getElementById('arrangeSubmitBtn').style.display = 'inline-block';
        } else {
            document.getElementById('arrangeNextBtn').style.display = 'inline-block';
            document.getElementById('arrangeSubmitBtn').style.display = 'none';
        }
    }
    
    /**
     * ★ 리테이크: 이전 문제 (floating 버튼에서 호출)
     */
    goToPrevQuestion() {
        const prevIndex = this.currentQuestion - 1;
        if (prevIndex < 0) return;
        
        this.loadQuestion(prevIndex);
        
        const totalQuestions = this.currentSetData.questions.length;
        const progressEl = document.getElementById('arrangeProgress');
        if (progressEl) {
            progressEl.textContent = `Question ${prevIndex + 1} of ${totalQuestions}`;
        }
    }
    
    /**
     * 다음 문제로 이동 (Next 버튼에서 호출)
     */
    nextQuestion() {
        const nextIndex = this.currentQuestion + 1;
        const totalQuestions = this.currentSetData.questions.length;
        
        if (nextIndex >= totalQuestions) {
            // 마지막 문제 → Submit 버튼 표시
            console.log('[ArrangeComponent] 마지막 문제 → Submit 버튼 표시');
            document.getElementById('arrangeNextBtn').style.display = 'none';
            document.getElementById('arrangeSubmitBtn').style.display = 'inline-block';
            return;
        }
        
        // 다음 문제 로드
        this.loadQuestion(nextIndex);
        
        // 진행률 업데이트
        const progressEl = document.getElementById('arrangeProgress');
        if (progressEl) {
            progressEl.textContent = `Question ${nextIndex + 1} of ${totalQuestions}`;
        }
    }
    
    /**
     * 제출 & 채점
     */
    submit() {
        console.log('[ArrangeComponent] 제출 시작');
        console.log('[ArrangeComponent] 최종 답안:', this.answers);
        
        let correct = 0;
        const total = this.currentSetData.questions.length;
        
        const results = this.currentSetData.questions.map((question, index) => {
            const questionKey = `${this.currentSetData.setId}_q${question.questionNum}`;
            const userAnswer = this.answers[questionKey];
            
            // 사용자가 입력한 전체 문장 만들기
            const userFullAnswer = [];
            question.presentedWords.forEach((word, idx) => {
                if (word === '_') {
                    if (userAnswer && userAnswer[idx]) {
                        userFullAnswer.push(userAnswer[idx]);
                    } else {
                        userFullAnswer.push('___');
                    }
                } else {
                    userFullAnswer.push(word);
                }
            });
            
            // 정답 확인
            let isCorrect = true;
            if (userFullAnswer.length !== question.correctAnswer.length) {
                isCorrect = false;
            } else {
                for (let i = 0; i < question.correctAnswer.length; i++) {
                    if (userFullAnswer[i] !== question.correctAnswer[i]) {
                        isCorrect = false;
                        break;
                    }
                }
            }
            
            console.log(`[ArrangeComponent] Q${question.questionNum} - ${isCorrect ? '정답' : '오답'}`);
            
            if (isCorrect) {
                correct++;
            }
            
            return {
                questionNum: question.questionNum,
                givenSentence: question.givenSentence,
                givenTranslation: question.givenTranslation,
                correctAnswer: question.correctAnswer.join(' ') + question.endPunctuation,
                correctAnswerArray: question.correctAnswer,
                correctTranslation: question.correctTranslation,
                userAnswer: userFullAnswer.join(' ') + question.endPunctuation,
                explanation: question.explanation,
                isCorrect: isCorrect,
                profilePair: this.profilePairs[questionKey],
                presentedWords: question.presentedWords,
                userFilledWords: userAnswer || {},
                optionWords: question.optionWords,
                endPunctuation: question.endPunctuation
            };
        });
        
        const accuracy = Math.round((correct / total) * 100);
        
        // 결과 데이터 구성
        const resultData = {
            results: results,
            correct: correct,
            total: total,
            accuracy: accuracy,
            week: this.currentSetData.week,
            day: this.currentSetData.day
        };
        
        console.log('[ArrangeComponent] 채점 완료:', resultData);
        
        // sessionStorage에 저장
        sessionStorage.setItem('arrangeResults', JSON.stringify(resultData));
        
        return resultData;
    }
    
}

// 전역 스코프에 노출
window.ArrangeComponent = ArrangeComponent;


// 드롭 허용 헬퍼 함수 (전역)
function allowDrop(event) {
    event.preventDefault();
}
