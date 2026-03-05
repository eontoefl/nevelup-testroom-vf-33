// Reading - Fill in the Blanks 로직
// 
// ✅ 컴포넌트화 완료!
// - FillBlanksComponent: 실제 문제 풀이 로직
// - 이 파일: 어댑터 + 결과 화면

// ============================================
// 1. 어댑터 함수 (Component 사용)
// ============================================

let currentFillBlanksComponent = null;

/**
 * 모듈 시스템용 초기화 함수
 * @param {number} setId - 세트 ID
 * @param {function} onCompleteCallback - 완료 콜백
 * @param {object} initOptions - 초기화 옵션 (startQuestionNumber, totalModuleQuestions)
 */
async function initFillBlanksComponent(setId, onCompleteCallback, initOptions = {}) {
    console.log(`📦 [모듈] initFillBlanksComponent - setId: ${setId}`, initOptions);
    
    // 기존 컴포넌트 정리
    if (currentFillBlanksComponent) {
        console.log(`🧹 [모듈] 이전 FillBlanks Component 정리`);
        currentFillBlanksComponent._destroyed = true;
        if (currentFillBlanksComponent.cleanup) {
            currentFillBlanksComponent.cleanup();
        }
        currentFillBlanksComponent = null;
    }
    
    // Component 생성
    currentFillBlanksComponent = new FillBlanksComponent(setId, {
        onComplete: (results) => {
            console.log(`✅ [모듈] FillBlanks Component 완료`);
            
            // 모듈 컨트롤러에 결과 전달
            if (onCompleteCallback) {
                onCompleteCallback(results);
            }
        },
        onError: (error) => {
            console.error(`❌ [모듈] FillBlanks Component 오류:`, error);
        }
    });
    
    // 진행률 표시 옵션 전달
    if (initOptions.startQuestionNumber && initOptions.totalModuleQuestions) {
        currentFillBlanksComponent.moduleProgressOptions = initOptions;
    }
    
    // 초기화
    await currentFillBlanksComponent.init();
    
    // ★ window에 노출 (module-controller, review-panel에서 참조)
    window.currentFillBlanksComponent = currentFillBlanksComponent;
}

/**
 * 빈칸채우기 초기화 - Component 어댑터
 */
async function initReadingFillBlanks(setNumber) {
    console.log(`📖 [어댑터] initReadingFillBlanks - setNumber: ${setNumber}`);
    
    // Component 생성
    currentFillBlanksComponent = new FillBlanksComponent(setNumber, {
        onComplete: (results) => {
            console.log(`✅ [어댑터] Component 완료 콜백 받음`);
            
            // Module 콜백이 있으면 전달
            if (window.moduleCallback) {
                window.moduleCallback(results);
            } else {
                // 일반 모드: sessionStorage에 저장
                if (!sessionStorage.getItem('fillBlanksResults')) {
                    sessionStorage.setItem('fillBlanksResults', JSON.stringify([]));
                }
                const results_list = JSON.parse(sessionStorage.getItem('fillBlanksResults'));
                results_list.push(results);
                sessionStorage.setItem('fillBlanksResults', JSON.stringify(results_list));
                
                // 결과 화면 표시
                checkDayCompletion();
            }
        },
        onError: (error) => {
            console.error(`❌ [어댑터] Component 오류:`, error);
            alert(`오류가 발생했습니다: ${error.message}`);
        }
    });
    
    // 초기화
    await currentFillBlanksComponent.init();
    
    // ★ window에 노출
    window.currentFillBlanksComponent = currentFillBlanksComponent;
}

/**
 * 빈칸채우기 제출 - Component 어댑터
 */
function submitFillBlanks() {
    console.log(`📤 [어댑터] submitFillBlanks 호출`);
    
    if (currentFillBlanksComponent) {
        currentFillBlanksComponent.submit();
    } else {
        console.error(`❌ Component가 초기화되지 않았습니다`);
    }
}

/**
 * 이전 세트로 이동 - Component 어댑터
 * (Module 모드에서는 사용하지 않음)
 */
function previousFillBlanks() {
    console.warn(`⚠️ previousFillBlanks는 더 이상 지원되지 않습니다 (Component 모드)`);
}

/**
 * 개별 문자 입력 핸들러 - 전역 함수로 노출 (HTML에서 호출)
 * (Component 내부로 이동했으므로 더 이상 필요 없음)
 */
function handleCharInput(input, setId, blankId, charIndex, totalChars) {
    // Component가 이벤트 리스너로 처리하므로 빈 함수
    console.warn(`⚠️ handleCharInput은 Component가 처리합니다`);
}

/**
 * Backspace 및 방향키 처리 - 전역 함수로 노출 (HTML에서 호출)
 * (Component 내부로 이동했으므로 더 이상 필요 없음)
 */
function handleCharKeydown(event, setId, blankId, charIndex, totalChars) {
    // Component가 이벤트 리스너로 처리하므로 빈 함수
    console.warn(`⚠️ handleCharKeydown은 Component가 처리합니다`);
}

// 전역으로 노출
window.initFillBlanksComponent = initFillBlanksComponent;
window.initReadingFillBlanks = initReadingFillBlanks;
// ============================================

// 해당일 완료 확인
function checkDayCompletion() {
    // 현재는 빈칸채우기만 있으므로 바로 결과 화면 표시
    // 추후 다른 유형이 추가되면 여기서 체크
    showResultScreen();
}

// 정답채점 결과 화면 표시
function showResultScreen() {
    // 결과 데이터 가져오기
    const fillBlanksResults = JSON.parse(sessionStorage.getItem('fillBlanksResults') || '[]');
    
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
    const totalScore = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    
    // 결과 화면 업데이트
    const week = currentTest.currentWeek || 1;
    const day = currentTest.currentDay || '일';
    document.getElementById('resultDayTitle').textContent = `Week ${week} - ${getDayName(day)}`;
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
    
    // 결과 화면 표시
    showScreen('resultScreen');
    
    // ★ 해설 다시보기용 result_json 저장
    saveResultJsonToSupabase('reading', fillBlanksResults);
    
    // 세션 스토리지 정리
    sessionStorage.removeItem('fillBlanksResults');
}

// 지문을 답안과 함께 렌더링
function renderPassageWithAnswers(setResult, answerMap, firstAttemptMap = null) {
    console.log('🎨 [renderPassageWithAnswers] 실행 시작');
    console.log('  - setResult:', setResult);
    console.log('  - setResult.setId:', setResult.setId);
    console.log('  - setResult.passage 길이:', setResult.passage?.length);
    console.log('  - setResult.blanks 존재?', !!setResult.blanks);
    console.log('  - answerMap:', answerMap);
    console.log('  - firstAttemptMap:', firstAttemptMap);
    
    const passage = setResult.passage;
    let html = '';
    let lastIndex = 0;
    
    // blanks 가져오기 (우선순위: setResult.blanks → window.readingFillBlanksData)
    let blanks = null;
    
    if (setResult.blanks && setResult.blanks.length > 0) {
        // ✅ setResult에 blanks가 이미 있으면 사용
        blanks = setResult.blanks;
        console.log('  ✅ setResult.blanks 사용 (개수:', blanks.length, ')');
    } else {
        // window.readingFillBlanksData에서 찾기
        const fillBlanksData = window.readingFillBlanksData || readingFillBlanksData;
        console.log('  - fillBlanksData 존재?', !!fillBlanksData);
        console.log('  - fillBlanksData.sets:', fillBlanksData?.sets?.map(s => s.id));
        console.log('  - 찾으려는 setId:', setResult.setId);
        
        const set = fillBlanksData?.sets?.find(s => s.id === setResult.setId);
        console.log('  - set 발견?', !!set);
        
        if (set) {
            blanks = set.blanks;
            console.log('  ✅ fillBlanksData에서 blanks 가져옴 (개수:', blanks.length, ')');
        }
    }
    
    if (!blanks || blanks.length === 0) {
        console.error('❌ [renderPassageWithAnswers] blanks를 찾을 수 없음! 텍스트만 반환');
        return escapeHtml(passage);
    }
    
    const sortedBlanks = [...blanks].sort((a, b) => a.startIndex - b.startIndex);
    console.log('  - sortedBlanks 개수:', sortedBlanks.length);
    
    sortedBlanks.forEach(blank => {
        const answer = answerMap[blank.id];
        
        console.log(`  📌 Blank ${blank.id}:`, {
            userAnswer: answer?.userAnswer,
            isCorrect: answer?.isCorrect,
            wasCorrectInFirst: firstAttemptMap?.[blank.id]?.isCorrect
        });
        
        // 빈칸 앞 텍스트
        html += escapeHtml(passage.substring(lastIndex, blank.startIndex));
        
        // 빈칸 부분 렌더링
        const isCorrect = answer && answer.isCorrect; // 2차 결과
        const userAnswer = answer ? answer.userAnswer : '';
        const correctAnswer = blank.prefix + blank.answer;
        
        // 1차 결과 확인 (2차 풀이인 경우)
        const wasCorrectInFirst = firstAttemptMap ? (firstAttemptMap[blank.id]?.isCorrect || false) : null;
        
        // 케이스별 클래스, 아이콘, 마우스 대면 텍스트 결정
        let blankClass, icon, hoverText;
        
        if (wasCorrectInFirst === true) {
            // 1차 맞음 → 평범한 초록색, 마우스 대도 아무것도 안 뜸
            blankClass = 'result-blank correct';
            icon = '<i class="fas fa-check-circle"></i>';
            hoverText = '';
        } else if (wasCorrectInFirst === false && isCorrect) {
            // 1차 틀림 + 2차 맞음 → 초록색 + 반짝이는 테두리
            blankClass = 'result-blank correct improved';
            icon = '<i class="fas fa-check-circle"></i>';
            hoverText = '1차엔 틀렸지만 2차에 맞힌 문제 ✨';
        } else if (wasCorrectInFirst === false && !isCorrect) {
            // 1차 틀림 + 2차 틀림 → 빨간색
            blankClass = 'result-blank incorrect';
            icon = '<i class="fas fa-times-circle"></i>';
            hoverText = '1차, 2차 모두 틀린 문제';
        } else {
            // 1차 전용 (기존 로직)
            blankClass = isCorrect ? 'result-blank correct' : 'result-blank incorrect';
            icon = isCorrect ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>';
            hoverText = '';
        }
        
        // 사용자 답안을 언더스코어로 표시
        let displayAnswer = '';
        for (let i = 0; i < blank.blankCount; i++) {
            const char = userAnswer && userAnswer[i] ? userAnswer[i] : '_';
            displayAnswer += char;
            // 언더스코어 사이에만 공백 추가 (실제 글자 사이는 공백 없음)
            if (i < blank.blankCount - 1 && char === '_') {
                // 다음 글자도 언더스코어인지 확인
                const nextChar = userAnswer && userAnswer[i + 1] ? userAnswer[i + 1] : '_';
                if (nextChar === '_') {
                    displayAnswer += ' ';
                }
            }
        }
        
        // title 속성 추가 (마우스 대면 나오는 텍스트)
        const titleAttr = hoverText ? `title="${hoverText}"` : '';
        
        html += `
            <span class="${blankClass}" data-blank-id="${blank.id}" ${titleAttr} onclick="toggleBlankExplanation(event, ${blank.id}, '${setResult.setId}')" style="cursor: pointer;">
                ${icon}
                <span class="blank-given">${escapeHtml(blank.prefix)}</span><span class="blank-user">${escapeHtml(displayAnswer)}</span>
            </span>
        `;
        
        // 인덱스 업데이트 (prefix + answer 길이만큼)
        lastIndex = blank.startIndex + blank.prefix.length + blank.answer.length;
    });
    
    // 마지막 텍스트
    html += escapeHtml(passage.substring(lastIndex));
    
    console.log('✅ [renderPassageWithAnswers] HTML 생성 완료 (길이:', html.length, ')');
    
    return html;
}

// 각 빈칸별 해설 영역 렌더링
function renderBlankExplanations(setResult, answerMap) {
    let html = '';
    
    console.log('📝 [renderBlankExplanations] answerMap:', answerMap);
    
    Object.values(answerMap).forEach(answer => {
        console.log(`  - Blank ${answer.blankId}: isCorrect=${answer.isCorrect}, wasCorrectInFirst=${answer.wasCorrectInFirst}`);
        
        const incorrectClass = answer.isCorrect ? '' : 'incorrect-answer';
        
        // 피드백 코멘트 생성
        let feedbackComment = '';
        
        if (answer.wasCorrectInFirst !== undefined) {
            // 2차 풀이 모드 (1차 + 2차 정보 있음)
            if (answer.wasCorrectInFirst && answer.isCorrect) {
                // 1. 1차 맞음
                feedbackComment = `<span class="feedback-comment" style="color: #10b981; font-weight: 500; font-size: 12px; margin-left: 8px;">👏 1차 때부터 정확하게 맞힌 문제예요! 정말 잘했어요! 👍</span>`;
            } else if (!answer.wasCorrectInFirst && answer.isCorrect) {
                // 2. 1차 틀림 → 2차 맞음
                feedbackComment = `<span class="feedback-comment" style="color: #3b82f6; font-weight: 500; font-size: 12px; margin-left: 8px;">🎯 1차에는 틀렸지만, 아무 도움 없이 스스로 고쳐 맞혔어요! 정말 대단해요! 다음엔 1차부터 맞힐 수 있을 거예요! 🚀</span>`;
            } else {
                // 3. 1차 틀림 → 2차 틀림
                feedbackComment = `<span class="feedback-comment" style="color: #6b7280; font-weight: 500; font-size: 12px; margin-left: 8px;">📝 1차, 2차 모두 틀린 문제예요. 조금 어려울 수 있으니 해설을 꼼꼼히 읽어보세요! 💪</span>`;
            }
        }
        
        console.log(`    → incorrectClass="${incorrectClass}", feedbackComment="${feedbackComment}"`);
        
        // 자주 보이는 오답이 있는지 확인
        const hasCommonMistakes = answer.commonMistakes && answer.commonMistakes.trim() !== '';
        
        html += `
            <div class="blank-explanation-box" id="blank_exp_${setResult.setId}_${answer.blankId}" style="display: none;">
                <div class="explanation-header">
                    <div class="explanation-word">
                        <strong>정답:</strong> 
                        <span class="correct-word ${incorrectClass}">${escapeHtml(answer.prefix)}${escapeHtml(answer.correctAnswer)}</span>
                        ${feedbackComment}
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
            // 다른 모든 해설 숨기기
            document.querySelectorAll('.blank-explanation-box').forEach(box => {
                box.style.display = 'none';
            });
            
            // 현재 해설 표시
            explanationBox.style.display = 'block';
            
            // 해설로 부드럽게 스크롤
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

// 요일 이름 가져오기
function getDayName(day) {
    const dayNames = {
        '일': '일요일',
        '월': '월요일',
        '화': '화요일',
        '수': '수요일',
        '목': '목요일',
        '금': '금요일'
    };
    return dayNames[day] || day;
}

// HTML 이스케이프 함수
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 2차 결과 화면용 전역 노출
window.renderPassageWithAnswers = renderPassageWithAnswers;
window.renderBlankExplanations = renderBlankExplanations;
window.toggleBlankExplanation = toggleBlankExplanation;
window.closeBlankExplanation = closeBlankExplanation;
