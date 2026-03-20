/**
 * ArrangeComponent.js
 * 라이팅 - 단어배열 (Build a Sentence) 컴포넌트
 * v=003
 * 
 * 특징:
 * - 대화형 UI (두 사람 프로필 + 문장)
 * - 드래그 & 드롭으로 빈칸 채우기
 * - 남녀 랜덤 조합 (남남/여여 불가)
 * - 첫 번째 빈칸 자동 대문자 변환
 */

class ArrangeComponent {
    constructor(setNumber) {
        console.log(`[ArrangeComponent] 생성 - setNumber: ${setNumber}`);
        
        this.setNumber = setNumber;
        
        // 내부 상태
        this.currentQuestion = 0;
        this.answers = {}; // 문제별 답안 저장
        this.setData = null;
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
            const allData = await window.loadArrangeData();
            if (!allData || !allData.sets || allData.sets.length === 0) {
                throw new Error('데이터를 불러올 수 없습니다');
            }
            
            // 2. 세트 찾기
            const setId = `arrange_set_${String(this.setNumber).padStart(4, '0')}`;
            console.log(`[ArrangeComponent] 세트 검색 - ID: ${setId}`);
            
            const setIndex = allData.sets.findIndex(set => set.setId === setId);
            if (setIndex === -1) {
                throw new Error(`세트를 찾을 수 없습니다: ${setId}`);
            }
            
            this.setData = allData.sets[setIndex];
            console.log('[ArrangeComponent] 세트 데이터 로드 완료:', this.setData);
            
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
        const question = this.setData.questions[questionIndex];
        
        // 문제별 프로필 이미지 조합 가져오기 (없으면 새로 생성)
        const questionKey = `${this.setData.setId}_q${question.questionNum}`;
        if (!this.profilePairs[questionKey]) {
            this.profilePairs[questionKey] = this.getRandomGenderPair();
            console.log(`[ArrangeComponent] 새 프로필 조합 생성: ${questionKey}`);
        }
        
        // 문제 렌더링
        this.renderQuestion(question);
        
        console.log(`[ArrangeComponent] 문제 ${questionIndex + 1} 로드 완료`);
    }
    
    /**
     * 이전 문제로 이동 (Prev 버튼에서 호출)
     */
    prevQuestion() {
        const prevIndex = this.currentQuestion - 1;
        if (prevIndex < 0) return;
        
        this.loadQuestion(prevIndex);
    }
    
    /**
     * 문제 렌더링
     */
    renderQuestion(question) {
        const container = document.getElementById('arrangeQuestionContent');
        
        // 저장된 답안 불러오기
        const questionKey = `${this.setData.setId}_q${question.questionNum}`;
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
        // 대소문자 무시 비교 (첫 빈칸 대문자 변환 대응)
        // 사용 횟수 카운트 (같은 단어가 여러 개 있을 때 사용한 만큼만 비활성화)
        const usedWordsLowerCount = {};
        usedWords.forEach(w => {
            const key = w.toLowerCase();
            usedWordsLowerCount[key] = (usedWordsLowerCount[key] || 0) + 1;
        });
        const optionsHtml = question.optionWords.map(word => {
            const key = word.toLowerCase();
            let isUsed = false;
            if (usedWordsLowerCount[key] && usedWordsLowerCount[key] > 0) {
                isUsed = true;
                usedWordsLowerCount[key]--;
            }
            return `
                <div class="arrange-option ${isUsed ? 'used' : ''}" 
                     draggable="${!isUsed}" 
                     ondragstart="window.currentArrangeComponent.dragStart(event)" 
                     ondragend="window.currentArrangeComponent.dragEnd(event)"
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
        const question = this.setData.questions[this.currentQuestion];
        const questionKey = `${this.setData.setId}_q${question.questionNum}`;
        
        if (!this.answers[questionKey]) {
            this.answers[questionKey] = {};
        }
        
        // 문장 맨 앞 빈칸인지 확인 (0번 자리가 빈칸이고, 거기에 넣을 때만 대문자 변환)
        let word = this.draggedWord;
        const isFirstPosition = index === 0;
        
        if (isFirstPosition && word) {
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
        const question = this.setData.questions[this.currentQuestion];
        const questionKey = `${this.setData.setId}_q${question.questionNum}`;
        
        if (this.answers[questionKey] && this.answers[questionKey][index]) {
            console.log(`[ArrangeComponent] 단어 제거: ${questionKey}[${index}]`);
            delete this.answers[questionKey][index];
            
            // 화면 재렌더링
            this.renderQuestion(question);
        }
    }
    
    /**
     * 다음 문제로 이동 (Next 버튼에서 호출)
     */
    nextQuestion() {
        const nextIndex = this.currentQuestion + 1;
        const totalQuestions = this.setData.questions.length;
        
        if (nextIndex >= totalQuestions) {
            console.log('[ArrangeComponent] 마지막 문제 도달');
            return false;
        }
        
        // 다음 문제 로드
        this.loadQuestion(nextIndex);
        return true;
    }
    
    /**
     * 제출 & 채점
     */
    submit() {
        console.log('[ArrangeComponent] 제출 시작');
        console.log('[ArrangeComponent] 최종 답안:', this.answers);
        
        let correct = 0;
        const total = this.setData.questions.length;
        
        const results = this.setData.questions.map((question, index) => {
            const questionKey = `${this.setData.setId}_q${question.questionNum}`;
            const userAnswer = this.answers[questionKey];
            
            // 사용자가 빈칸에 넣은 답만 순서대로 추출
            const userBlankAnswers = [];
            question.presentedWords.forEach((word, idx) => {
                if (word === '_') {
                    if (userAnswer && userAnswer[idx]) {
                        userBlankAnswers.push(userAnswer[idx]);
                    } else {
                        userBlankAnswers.push('___');
                    }
                }
            });
            
            // 정답 확인 (빈칸 답만 정답 목록과 순서대로 비교)
            let isCorrect = true;
            if (userBlankAnswers.length !== question.correctAnswer.length) {
                isCorrect = false;
            } else {
                for (let i = 0; i < question.correctAnswer.length; i++) {
                    if (userBlankAnswers[i] !== question.correctAnswer[i]) {
                        isCorrect = false;
                        break;
                    }
                }
            }
            
            // 결과 표시용 전체 문장 조합
            const userFullAnswer = question.presentedWords.map((word, idx) => {
                if (word === '_') {
                    return (userAnswer && userAnswer[idx]) ? userAnswer[idx] : '___';
                }
                return word;
            });
            
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
            week: this.setData.week,
            day: this.setData.day
        };
        
        console.log('[ArrangeComponent] 채점 완료:', resultData);
        
        // sessionStorage에 저장
        sessionStorage.setItem('arrangeResults', JSON.stringify(resultData));
        
        return resultData;
    }
    
}

// 전역 스코프에 노출
window.ArrangeComponent = ArrangeComponent;


// 드롭 허용 헬퍼 함수 (전역 필수 - renderQuestion innerHTML의 ondragover에서 호출)
function allowDrop(event) {
    event.preventDefault();
}
