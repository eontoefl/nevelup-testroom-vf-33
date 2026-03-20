// ============================================
// Reading - FillBlanks 결과(해설) 화면
// ============================================

// 정답채점 결과 화면 표시
// @param {Array} data - 세트별 결과 배열 (explain-viewer.js에서 전달)
function showFillBlanksExplainScreen(data) {
    // 결과 데이터
    const fillBlanksResults = data || [];
    
    // 전체 통계 계산
    let totalCorrect = 0;
    let totalQuestions = 0;
    
    fillBlanksResults.forEach(setResult => {
        setResult.answers.forEach(answer => {
            totalQuestions++;
            if (answer.isCorrect) {
                totalCorrect++;
            }
        });
    });
    
    const totalIncorrect = totalQuestions - totalCorrect;
    const totalScore = Math.round((totalCorrect / totalQuestions) * 100);
    
    // 결과 화면 업데이트
    document.getElementById('resultTotalScore').textContent = `${totalScore}%`;
    document.getElementById('resultCorrectCount').textContent = totalCorrect;
    document.getElementById('resultIncorrectCount').textContent = totalIncorrect;
    document.getElementById('resultTotalCount').textContent = totalQuestions;
    
    // 세부 결과 렌더링 (지문 기반)
    const detailsContainer = document.getElementById('resultDetails');
    let detailsHTML = '';
    
    fillBlanksResults.forEach((setResult, setIndex) => {
        // 답안을 blankId로 매핑
        const answerMap = {};
        setResult.answers.forEach(answer => {
            answerMap[answer.blankId] = answer;
        });
        
        detailsHTML += `
            <div class="result-section">
                <div class="result-section-title">
                    <i class="fas fa-book-open"></i> Set ${setIndex + 1}: ${setResult.setTitle}
                </div>
                
                <!-- 지문 표시 (빈칸 강조) -->
                <div class="result-passage">
                    ${renderPassageWithAnswers(setResult, answerMap)}
                </div>
                
                <!-- 각 빈칸별 해설 영역 (기본 숨김) -->
                ${renderBlankExplanations(setResult, answerMap)}
            </div>
        `;
    });
    
    detailsContainer.innerHTML = detailsHTML;
    
    // 결과 화면 표시 완료
}

// 지문을 답안과 함께 렌더링
function renderPassageWithAnswers(setResult, answerMap) {
    console.log('🎨 [renderPassageWithAnswers] 실행 시작');
    
    const passage = setResult.passage;
    let html = '';
    let lastIndex = 0;
    
    // blanks 가져오기 (setResult에 항상 포함됨)
    const blanks = setResult.blanks;
    
    if (!blanks || blanks.length === 0) {
        console.error('❌ [renderPassageWithAnswers] blanks를 찾을 수 없음!');
        return escapeHtml(passage);
    }
    
    const sortedBlanks = [...blanks].sort((a, b) => a.startIndex - b.startIndex);
    
    sortedBlanks.forEach(blank => {
        const answer = answerMap[blank.id];
        
        // 빈칸 앞 텍스트
        html += escapeHtml(passage.substring(lastIndex, blank.startIndex));
        
        // 빈칸 부분 렌더링 (1차 결과만)
        const isCorrect = answer && answer.isCorrect;
        const userAnswer = answer ? answer.userAnswer : '';
        const blankClass = isCorrect ? 'result-blank correct' : 'result-blank incorrect';
        const icon = isCorrect ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>';
        
        // 사용자 답안을 언더스코어로 표시
        let displayAnswer = '';
        for (let i = 0; i < blank.blankCount; i++) {
            const char = userAnswer && userAnswer[i] ? userAnswer[i] : '_';
            displayAnswer += char;
            if (i < blank.blankCount - 1 && char === '_') {
                const nextChar = userAnswer && userAnswer[i + 1] ? userAnswer[i + 1] : '_';
                if (nextChar === '_') {
                    displayAnswer += ' ';
                }
            }
        }
        
        html += `
            <span class="${blankClass}" data-blank-id="${blank.id}" onclick="toggleBlankExplanation(event, ${blank.id}, '${setResult.setId}')" style="cursor: pointer;">
                ${icon}
                <span class="blank-given">${escapeHtml(blank.prefix)}</span><span class="blank-user">${escapeHtml(displayAnswer)}</span>
            </span>
        `;
        
        lastIndex = blank.startIndex + blank.prefix.length + blank.answer.length;
    });
    
    // 마지막 텍스트
    html += escapeHtml(passage.substring(lastIndex));
    
    return html;
}

// 각 빈칸별 해설 영역 렌더링
function renderBlankExplanations(setResult, answerMap) {
    let html = '';
    
    Object.values(answerMap).forEach(answer => {
        const incorrectClass = answer.isCorrect ? '' : 'incorrect-answer';
        
        // 자주 보이는 오답이 있는지 확인
        const hasCommonMistakes = answer.commonMistakes && answer.commonMistakes.trim() !== '';
        
        html += `
            <div class="blank-explanation-box" id="blank_exp_${setResult.setId}_${answer.blankId}" style="display: none;">
                <div class="explanation-header">
                    <div class="explanation-word">
                        <strong>정답:</strong> 
                        <span class="correct-word ${incorrectClass}">${escapeHtml(answer.prefix)}${escapeHtml(answer.correctAnswer)}</span>
                    </div>
                    <button class="btn-close-explanation" onclick="closeBlankExplanation('${setResult.setId}', ${answer.blankId})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="explanation-text">
                    <i class="fas fa-lightbulb"></i>
                    <p>${answer.explanation}</p>
                </div>
                ${hasCommonMistakes ? `
                <div class="common-mistakes-section">
                    <div class="common-mistakes-header-row">
                        <div class="common-mistakes-header">
                            <i class="fas fa-exclamation-triangle"></i>
                            <strong>자주 보이는 오답</strong>
                        </div>
                        <div class="common-mistakes-words">
                            ${answer.commonMistakes.split(',').map(word => 
                                `<span class="mistake-word">${escapeHtml(word.trim())}</span>`
                            ).join('')}
                        </div>
                    </div>
                    ${answer.mistakesExplanation && answer.mistakesExplanation.trim() !== '' ? `
                    <p class="common-mistakes-text">${escapeHtml(answer.mistakesExplanation)}</p>
                    ` : ''}
                </div>
                ` : ''}
            </div>
        `;
    });
    
    return html;
}

// 빈칸 해설 토글
function toggleBlankExplanation(event, blankId, setId) {
    event.stopPropagation();
    
    const explanationBox = document.getElementById(`blank_exp_${setId}_${blankId}`);
    
    if (explanationBox) {
        if (explanationBox.style.display === 'none') {
            document.querySelectorAll('.blank-explanation-box').forEach(box => {
                box.style.display = 'none';
            });
            explanationBox.style.display = 'block';
            explanationBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            explanationBox.style.display = 'none';
        }
    }
}

// 빈칸 해설 닫기
function closeBlankExplanation(setId, blankId) {
    const explanationBox = document.getElementById(`blank_exp_${setId}_${blankId}`);
    if (explanationBox) {
        explanationBox.style.display = 'none';
    }
}

// 전역 노출
window.showFillBlanksExplainScreen = showFillBlanksExplainScreen;
window.toggleBlankExplanation = toggleBlankExplanation;
window.closeBlankExplanation = closeBlankExplanation;

console.log('✅ [Reading] fillblanks-result.js 로드 완료');
