/**
 * arrange-core.js
 * 단어배열(Build a Sentence) 공통 부품 — 실전 W1(ArrangeComponent)과 유형별 트레이닝이 같이 쓴다.
 * (2026-11-03 유형별 트레이닝, 계획서 C:\기능구현\유형별 트레이닝\IMPLEMENTATION_PLAN.md 16-3)
 *
 * 하는 일: 문제 화면 HTML 만들기, 조각 놓기·빼기, 채점, 남녀 프로필 조합.
 * 하지 않는 일: 문제 불러오기, 타이머, 결과 저장, 화면 이동 — 쓰는 쪽(실전/트레이닝)이 각자 한다.
 *
 * 실전 W1 화면은 이 파일로 옮기기 전과 HTML이 글자 하나까지 같아야 한다.
 * 그래서 buildQuestionHtml의 틀은 예전 ArrangeComponent.renderQuestion을 그대로 옮겼고,
 * 끌어다 놓기 처리를 부르는 이름만 handlerRef로 받는다(실전: 'window.currentArrangeComponent').
 */
(function () {
    'use strict';

    // 프로필 이미지 (여자 7개, 남자 7개)
    var FEMALE_IMAGES = [
        'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_F1.png',
        'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_F2.png',
        'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_F3.png',
        'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_F4.png',
        'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_F5.png',
        'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_F6.png',
        'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_F7.png'
    ];

    var MALE_IMAGES = [
        'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_M1.png',
        'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_M2.png',
        'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_M3.png',
        'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_M4.png',
        'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_M5.png',
        'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_M6.png',
        'https://eontoefl.github.io/toefl-audio/writing/arrange/image/arrange_image_M7.png'
    ];

    // 직전 이미지 추적 (예전에는 ArrangeComponent의 static 값이었다 — 실전·트레이닝이 같은 기록을 쓴다)
    var _last = { female: null, male: null };

    /**
     * 랜덤 남녀 조합 생성 (남남/여여 불가, 직전 이미지 제외)
     */
    function randomGenderPair() {
        var pickExcludingLast = function (images, key) {
            if (images.length <= 1) return images[0] || '';
            var last = _last[key];
            var candidates = last ? images.filter(function (img) { return img !== last; }) : images;
            var picked = candidates[Math.floor(Math.random() * candidates.length)];
            _last[key] = picked;
            return picked;
        };

        var femaleImage = pickExcludingLast(FEMALE_IMAGES, 'female');
        var maleImage = pickExcludingLast(MALE_IMAGES, 'male');

        // 랜덤으로 순서 결정 (50% 확률로 여자가 먼저 or 남자가 먼저)
        var femaleFirst = Math.random() < 0.5;

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
     * 문제 화면 HTML (제목 + 앞 발화 + 빈칸 줄 + 조각)
     * @param {object} question - { givenSentence, presentedWords, optionWords, endPunctuation }
     * @param {object|null} savedAnswer - { 빈칸 index: 단어 }
     * @param {object} genderPair - randomGenderPair() 결과
     * @param {string} handlerRef - 끌어다 놓기 처리를 부를 이름 (예: 'window.currentArrangeComponent')
     * @param {string[]} [optionOrder] - 조각을 보여줄 순서(트레이닝이 섞을 때). 없으면 optionWords 순서 그대로.
     */
    function buildQuestionHtml(question, savedAnswer, genderPair, handlerRef, optionOrder) {
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
                         ondrop="${handlerRef}.dropWord(event)" 
                         ondragover="allowDrop(event)"
                         onclick="${handlerRef}.removeWord(${index})">
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
        const optionsHtml = (optionOrder || question.optionWords).map(word => {
            const key = word.toLowerCase();
            let isUsed = false;
            if (usedWordsLowerCount[key] && usedWordsLowerCount[key] > 0) {
                isUsed = true;
                usedWordsLowerCount[key]--;
            }
            return `
                <div class="arrange-option ${isUsed ? 'used' : ''}" 
                     draggable="${!isUsed}" 
                     ondragstart="${handlerRef}.dragStart(event)" 
                     ondragend="${handlerRef}.dragEnd(event)"
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
        
        return `
            <h2 class="arrange-title">Make an appropriate sentence.</h2>
            ${givenSentenceHtml}
            ${answerAreaHtml}
            ${optionsAreaHtml}
        `;
    }

    /**
     * 빈칸에 단어 놓기 — 맨 앞 빈칸(0번 자리)에 놓을 때만 첫 글자를 대문자로 바꾼다.
     * @param {object} answerMap - 이 문제의 { 빈칸 index: 단어 } (직접 바뀐다)
     * @returns {string} 실제로 놓인 단어
     */
    function placeWord(answerMap, index, draggedWord) {
        let word = draggedWord;
        const isFirstPosition = index === 0;
        if (isFirstPosition && word) {
            word = word.charAt(0).toUpperCase() + word.slice(1);
        }
        answerMap[index] = word;
        return word;
    }

    /**
     * 빈칸의 단어 빼기
     * @returns {boolean} 뺀 게 있으면 true
     */
    function removeWord(answerMap, index) {
        if (answerMap && answerMap[index]) {
            delete answerMap[index];
            return true;
        }
        return false;
    }

    /**
     * 빈칸을 다 채웠는지
     */
    function isComplete(question, answerMap) {
        return question.presentedWords.every(function (word, idx) {
            return word !== '_' || !!(answerMap && answerMap[idx]);
        });
    }

    /**
     * 채점 (빈칸 답을 정답 벌마다 순서대로 비교, 하나라도 일치하면 정답, 대소문자 무시)
     * @param {object} question - { presentedWords, answerSets:[{answer:[...]}], endPunctuation }
     * @param {object|null} userAnswer - { 빈칸 index: 단어 }
     * @returns {{isCorrect:boolean, matchedIdx:number, userBlankAnswers:string[], userFullAnswer:string[], wrongBlankIndexes:number[]}}
     */
    function gradeQuestion(question, userAnswer) {
        // 사용자가 빈칸에 넣은 답만 순서대로 추출
        const userBlankAnswers = [];
        const blankIndexes = [];
        question.presentedWords.forEach((word, idx) => {
            if (word === '_') {
                blankIndexes.push(idx);
                if (userAnswer && userAnswer[idx]) {
                    userBlankAnswers.push(userAnswer[idx]);
                } else {
                    userBlankAnswers.push('___');
                }
            }
        });

        const matchedIdx = question.answerSets.findIndex(set =>
            userBlankAnswers.length === set.answer.length &&
            set.answer.every((w, i) => userBlankAnswers[i].toLowerCase() === w.toLowerCase())
        );
        const isCorrect = matchedIdx !== -1;

        // 결과 표시용 전체 문장 조합
        const userFullAnswer = question.presentedWords.map((word, idx) => {
            if (word === '_') {
                return (userAnswer && userAnswer[idx]) ? userAnswer[idx] : '___';
            }
            return word;
        });

        // 틀린 빈칸 자리(1벌 기준) — 트레이닝의 빨간 표시용
        const firstSet = (question.answerSets[0] && question.answerSets[0].answer) || [];
        const wrongBlankIndexes = isCorrect ? [] : blankIndexes.filter(function (idx, i) {
            return !firstSet[i] || userBlankAnswers[i].toLowerCase() !== String(firstSet[i]).toLowerCase();
        });

        return {
            isCorrect: isCorrect,
            matchedIdx: matchedIdx,
            userBlankAnswers: userBlankAnswers,
            userFullAnswer: userFullAnswer,
            wrongBlankIndexes: wrongBlankIndexes
        };
    }

    window.ArrangeCore = {
        FEMALE_IMAGES: FEMALE_IMAGES,
        MALE_IMAGES: MALE_IMAGES,
        randomGenderPair: randomGenderPair,
        buildQuestionHtml: buildQuestionHtml,
        placeWord: placeWord,
        removeWord: removeWord,
        isComplete: isComplete,
        gradeQuestion: gradeQuestion
    };
})();
