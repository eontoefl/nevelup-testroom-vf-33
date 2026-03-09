/**
 * arrange-result.js
 * 라이팅 - 단어배열 결과 화면
 */

/**
 * 결과 화면 표시
 */
function showArrangeResult() {
    console.log('[arrange-result] 결과 화면 표시');
    
    const resultsStr = sessionStorage.getItem('arrangeResults');
    if (!resultsStr) {
        console.error('❌ [arrange-result] 저장된 결과 없음');
        return;
    }
    
    const resultsData = JSON.parse(resultsStr);
    
    // 점수 표시
    document.getElementById('arrangeResultScoreValue').textContent = resultsData.accuracy + '%';
    document.getElementById('arrangeResultCorrectCount').textContent = resultsData.correct;
    document.getElementById('arrangeResultIncorrectCount').textContent = resultsData.total - resultsData.correct;
    document.getElementById('arrangeResultTotalCount').textContent = resultsData.total;
    
    // Week/Day 정보
    const currentTest = JSON.parse(sessionStorage.getItem('currentTest') || '{"week":"Week 1","day":"월"}');
    const dayTitle = `${currentTest.week || 'Week 1'}, ${currentTest.day || '월'}요일 - Build a Sentence`;
    document.getElementById('arrangeResultDayTitle').textContent = dayTitle;
    
    // 세부 결과 렌더링
    const detailsContainer = document.getElementById('arrangeResultDetails');
    let html = '';
    
    resultsData.results.forEach((result, index) => {
        html += renderArrangeResultItem(result, index);
    });
    
    detailsContainer.innerHTML = html;
}

/**
 * 개별 문제 결과 렌더링
 */
function renderArrangeResultItem(result, index) {
    const isCorrect = result.isCorrect;
    const statusClass = isCorrect ? 'correct' : 'incorrect';
    const statusIcon = isCorrect ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>';
    
    // 프로필 이미지 정보
    const profilePair = result.profilePair || {
        first: { gender: 'female', image: '' },
        second: { gender: 'male', image: '' }
    };
    
    let html = `
        <div class="arrange-result-item">
            <div class="arrange-result-header ${statusClass}">
                <div class="arrange-question-number">
                    Question ${result.questionNum}
                </div>
                <div class="arrange-result-status ${statusClass}">
                    ${statusIcon}
                </div>
            </div>
            
            <div class="arrange-result-content">
                <!-- 주어진 문장 -->
                <div class="arrange-given-section">
                    <div class="arrange-result-profile-row">
                        <div class="arrange-result-profile ${profilePair.first.gender}">
                            <img src="${profilePair.first.image}" alt="${profilePair.first.gender}" />
                        </div>
                        <div class="arrange-result-text-area">
                            <div class="arrange-given-text">
                                ${escapeHtml_arrange(result.givenSentence)}
                            </div>
                            ${result.givenTranslation ? `
                            <div class="arrange-translation">
                                ${escapeHtml_arrange(result.givenTranslation)}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                
                <div class="arrange-divider"></div>
                
                ${!isCorrect ? `
                <!-- 사용자 답변 (오답일 경우) -->
                <div class="arrange-user-answer-section">
                    <div class="arrange-answer-label">내 답변</div>
                    <div class="arrange-result-profile-row">
                        <div class="arrange-result-profile ${profilePair.second.gender}">
                            <img src="${profilePair.second.image}" alt="${profilePair.second.gender}" />
                        </div>
                        <div class="arrange-user-sentence">
                            ${renderArrangeAnswerStructure(result, false)}
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <!-- 정답 문장 -->
                <div class="arrange-answer-section">
                    <div class="arrange-answer-label">정답</div>
                    <div class="arrange-result-profile-row">
                        <div class="arrange-result-profile ${profilePair.second.gender}">
                            <img src="${profilePair.second.image}" alt="${profilePair.second.gender}" />
                        </div>
                        <div class="arrange-result-text-area">
                            <div class="arrange-correct-sentence">
                                ${renderArrangeAnswerStructure(result, true)}
                            </div>
                            ${result.correctTranslation ? `
                            <div class="arrange-correct-translation">
                                ${escapeHtml_arrange(result.correctTranslation)}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                
                <!-- 주어진 단어들 -->
                <div class="arrange-options-display">
                    <div class="arrange-options-label">주어진 단어</div>
                    <div class="arrange-options-list">
                        ${result.optionWords ? result.optionWords.map(word => 
                            `<span class="arrange-option-display">${escapeHtml_arrange(word)}</span>`
                        ).join('') : ''}
                    </div>
                </div>
                
                ${result.explanation ? `
                <div class="arrange-divider"></div>
                
                <!-- 해설 -->
                <div class="arrange-explanation-section">
                    <div class="arrange-explanation-title">
                        <i class="fas fa-lightbulb"></i>
                        해설
                    </div>
                    <div class="arrange-explanation-text">
                        ${escapeHtml_arrange(result.explanation)}
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
    
    return html;
}

/**
 * 답변 구조 렌더링 (주어진 단어 + 내가 채운 빈칸 구분)
 */
function renderArrangeAnswerStructure(result, isCorrectAnswer) {
    if (!result.presentedWords) {
        return escapeHtml_arrange(isCorrectAnswer ? result.correctAnswer : result.userAnswer);
    }
    
    const presentedWords = result.presentedWords;
    const userFilledWords = result.userFilledWords || {};
    const correctWords = result.correctAnswerArray || [];
    
    let html = '';
    let correctIndex = 0;
    
    presentedWords.forEach((word, index) => {
        if (word === '_') {
            if (isCorrectAnswer) {
                html += `<span class="arrange-result-blank correct-blank">${escapeHtml_arrange(correctWords[correctIndex] || '')}</span> `;
            } else {
                const userWord = userFilledWords[index] || '___';
                const isWrong = userWord !== correctWords[correctIndex];
                html += `<span class="arrange-result-blank user-blank ${isWrong ? 'wrong-blank' : 'correct-blank'}">${escapeHtml_arrange(userWord)}</span> `;
            }
            correctIndex++;
        } else {
            html += `<span class="arrange-result-given">${escapeHtml_arrange(word)}</span> `;
            correctIndex++;
        }
    });
    
    if (result.endPunctuation) {
        html += `<span class="arrange-result-punctuation">${result.endPunctuation}</span>`;
    }
    
    return html;
}

/**
 * HTML 이스케이프
 */
function escapeHtml_arrange(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 전역 노출
window.showArrangeResult = showArrangeResult;
console.log('[arrange-result] 로드 완료');
