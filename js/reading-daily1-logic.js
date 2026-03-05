// Reading - 일상리딩1 (Daily Reading 1) 로직
// 
// ✅ 컴포넌트화 완료!
// - Daily1Component: 실제 문제 풀이 로직
// - 이 파일: 어댑터 + 결과 화면

/**
 * 번역 수에 맞춰 원문을 문장 단위로 분리하는 공통 함수
 * 
 * ★ 새 방식: 원문에 ##가 있으면 사람이 직접 지정한 구분점으로 나눔
 *   - ## : 단락구분 (빈 줄)
 *   - #||# : 줄바꿈
 *   - #|# : 이어붙이기 (공백)
 *   → 해설 화면에서는 모두 동일한 블록 구분으로 처리
 *   - \n : 같은 블록 안의 줄바꿈 (화면에 <br>로 표시)
 * ★ 기존 방식: ##가 없으면 자동 분리 (하위 호환)
 */
function splitToMatchTranslations(cleanContent, translationCount) {
    // ★ 새 방식: #|#, #||#, ## 중 하나라도 있으면 블록 구분자로 나눔
    if (cleanContent.includes('##') || cleanContent.includes('#|#')) {
        // 모든 구분자를 ##로 통일한 후 split (해설 화면에서는 동일하게 처리)
        return cleanContent.replace(/#\|\|#/g, '##').replace(/#\|#/g, '##').split('##');
    }
    
    // ── 기존 자동 분리 (하위 호환) ──
    if (translationCount <= 0) {
        return cleanContent.split(/\n\n+/).filter(s => s.trim());
    }
    
    // 1순위: 단락(\n\n) 기준 split
    const paragraphs = cleanContent.split(/\n\n+/).filter(s => s.trim());
    if (paragraphs.length === translationCount) {
        return paragraphs;
    }
    
    // 2순위: 문장 단위 split (이메일 주소 보호)
    const allText = cleanContent.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const sentenceSplit = allText.split(/(?<=[.!?])(?<!\w\.\w)(?<![A-Z])(?:\s*\([A-Z]\))?\s+(?=[A-Z\("])/).filter(s => s.trim());
    if (sentenceSplit.length === translationCount) {
        return sentenceSplit;
    }
    
    // 3순위: 더 단순한 문장 split
    const simpleSplit = allText.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(s => s.trim());
    if (simpleSplit.length === translationCount) {
        return simpleSplit;
    }
    
    // 최후: 가장 가까운 결과 반환
    const diffs = [
        { s: paragraphs, d: Math.abs(paragraphs.length - translationCount) },
        { s: sentenceSplit, d: Math.abs(sentenceSplit.length - translationCount) },
        { s: simpleSplit, d: Math.abs(simpleSplit.length - translationCount) }
    ];
    diffs.sort((a, b) => a.d - b.d);
    return diffs[0].s;
}

// ============================================
// 1. 어댑터 함수 (Component 사용)
// ============================================

let currentDaily1Component = null;

/**
 * 모듈 시스템용 초기화 함수
 */
async function initDaily1Component(setId, onCompleteCallback) {
    console.log(`📦 [모듈] initDaily1Component - setId: ${setId}`);
    
    // 기존 컴포넌트 정리
    if (currentDaily1Component) {
        console.log(`🧹 [모듈] 이전 Daily1 Component 정리`);
        currentDaily1Component._destroyed = true;
        if (currentDaily1Component.cleanup) {
            currentDaily1Component.cleanup();
        }
        currentDaily1Component = null;
    }
    
    currentDaily1Component = new Daily1Component(setId, {
        onComplete: (results) => {
            console.log(`✅ [모듈] Daily1 Component 완료`);
            currentDaily1Component._completed = true;
            if (onCompleteCallback) onCompleteCallback(results);
        },
        onError: (error) => {
            console.error(`❌ [모듈] Daily1 Component 오류:`, error);
        }
    });
    window.currentDaily1Component = currentDaily1Component;
    await currentDaily1Component.init();
}

/**
 * 일상리딩1 초기화 - Component 어댑터
 */
async function initReadingDaily1(setNumber) {
    console.log(`📖 [어댑터] initReadingDaily1 - setNumber: ${setNumber}`);
    
    // Component 생성
    currentDaily1Component = new Daily1Component(setNumber, {
        onComplete: (results) => {
            console.log(`✅ [어댑터] Component 완료 콜백 받음`);
            
            // Module 콜백이 있으면 전달
            if (window.moduleCallback) {
                window.moduleCallback(results);
            } else {
                // 일반 모드: sessionStorage에 저장
                if (!sessionStorage.getItem('daily1Results')) {
                    sessionStorage.setItem('daily1Results', JSON.stringify([]));
                }
                const results_list = JSON.parse(sessionStorage.getItem('daily1Results'));
                results_list.push(results);
                sessionStorage.setItem('daily1Results', JSON.stringify(results_list));
                
                // 결과 화면 표시
                showDaily1Results();
            }
        },
        onError: (error) => {
            console.error(`❌ [어댑터] Component 오류:`, error);
            alert(`오류가 발생했습니다: ${error.message}`);
        }
    });
    
    // 초기화
    await currentDaily1Component.init();
}

/**
 * 일상리딩1 제출 - Component 어댑터
 */
function submitDaily1() {
    console.log(`📤 [어댑터] submitDaily1 호출`);
    
    if (currentDaily1Component) {
        currentDaily1Component.submit();
    } else {
        console.error(`❌ Component가 초기화되지 않았습니다`);
    }
}

/**
 * 다음 문제 - Component 어댑터
 */
function daily1NextQuestion() {
    if (currentDaily1Component) {
        const hasNext = currentDaily1Component.nextQuestion();
        if (!hasNext) {
            console.log('⚠️ 세트 내 마지막 문제입니다');
            
            // 모듈 모드일 때는 자동으로 submit하여 다음 컴포넌트로 이동
            if (window.isModuleMode) {
                console.log('📦 [모듈 모드] 세트 완료 → 자동 제출');
                if (!currentDaily1Component._submitted && !currentDaily1Component._completed && !currentDaily1Component._destroyed) {
                    currentDaily1Component._submitted = true;
                    currentDaily1Component.submit();
                }
            }
        }
    } else {
        console.warn(`⚠️ Component가 초기화되지 않았습니다`);
    }
}

/**
 * 이전 문제 - Component 어댑터
 * 컴포넌트 첫 문제에서 Back → 이전 컴포넌트로 이동
 */
function daily1PreviousQuestion() {
    if (currentDaily1Component) {
        const hasPrev = currentDaily1Component.previousQuestion();
        if (!hasPrev) {
            console.log('⬅️ [모듈 모드] 세트 첫 문제 → 이전 컴포넌트로 이동');
            if (window.isModuleMode && window.moduleController) {
                window.moduleController.goToPreviousComponent();
            }
        }
    } else {
        console.warn(`⚠️ Component가 초기화되지 않았습니다`);
    }
}

/**
 * 보기 선택 - 전역 함수로 노출 (HTML에서 호출 가능)
 */
function selectDaily1Option(optionIndex) {
    if (currentDaily1Component) {
        currentDaily1Component.selectOption(optionIndex);
    } else {
        console.warn(`⚠️ Component가 초기화되지 않았습니다`);
    }
}

// 전역으로 노출
window.initDaily1Component = initDaily1Component;
window.initReadingDaily1 = initReadingDaily1;

// ============================================
// 2. 결과 화면 (기존 유지)
// ============================================

// 정답채점 화면 표시
function showDaily1Results() {
    const results = JSON.parse(sessionStorage.getItem('daily1Results'));
    
    // 전체 통계 계산
    let totalCorrect = 0;
    let totalQuestions = 0;
    
    results.forEach(setResult => {
        setResult.answers.forEach(answer => {
            totalQuestions++;
            if (answer.isCorrect) {
                totalCorrect++;
            }
        });
    });
    
    const totalScore = Math.round((totalCorrect / totalQuestions) * 100);
    const totalIncorrect = totalQuestions - totalCorrect;
    
    // 결과 화면 채우기
    document.getElementById('daily1ResultScoreValue').textContent = `${totalScore}%`;
    document.getElementById('daily1ResultCorrectCount').textContent = totalCorrect;
    document.getElementById('daily1ResultIncorrectCount').textContent = totalIncorrect;
    document.getElementById('daily1ResultTotalCount').textContent = totalQuestions;
    
    // Week와 Day 정보 설정
    const week = currentTest.currentWeek || 1;
    const day = currentTest.currentDay || '월';
    document.getElementById('daily1ResultDayTitle').textContent = `Week ${week} - ${getDayName(day)}`;
    
    // 세부 결과 렌더링
    const detailsContainer = document.getElementById('daily1ResultDetails');
    let detailsHTML = '';
    
    results.forEach((setResult, setIndex) => {
        detailsHTML += renderDaily1SetResult(setResult, null, null, null, setIndex);
    });
    
    detailsContainer.innerHTML = detailsHTML;
    
    // 보기 해설 펼치기/접기 이벤트 바인딩
    bindDaily1ToggleEvents();
    
    // 결과 화면 표시
    showScreen('readingDaily1ResultScreen');
    
    // ★ 해설 다시보기용 result_json 저장
    saveResultJsonToSupabase('reading', results);
    
    // 세션 스토리지 정리
    sessionStorage.removeItem('daily1Results');
}

// 세트별 결과 렌더링 (1차 결과 화면용 - 기존 로직)
function renderDaily1SetResultOriginal(setResult, setIndex) {
    const passage = setResult.passage;
    const translations = passage.translations || [];
    const interactiveWords = passage.interactiveWords || [];
    
    // \n 처리: literal "\n" → 실제 줄바꿈
    const cleanContent = passage.content
        .replace(/\\n/g, '\n')  // escaped \n → real newline
        .replace(/\r\n/g, '\n');
    
    // 번역 수에 맞춰 문장 분리
    const sentences = splitToMatchTranslations(cleanContent, translations.length);
    
    // 문장별 해석 HTML 생성
    let sentencesHTML = '';
    sentences.forEach((sentence, idx) => {
        const translation = translations[idx] || '';
        
        // 문장 내 \n → <br> 변환 + 인터랙티브 단어 하이라이트
        let sentenceHTML = escapeHtml(sentence).replace(/\n/g, '<br>');
        interactiveWords.forEach(wordData => {
            const regex = new RegExp(`(?<![\\w-])${wordData.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'gi');
            sentenceHTML = sentenceHTML.replace(regex, (match) => `<span class="interactive-word" data-translation="${escapeHtml(wordData.translation)}" data-explanation="${escapeHtml(wordData.explanation)}">${match}</span>`);
        });
        
        sentencesHTML += `
            <div class="sentence-pair">
                <div class="sentence-original">${sentenceHTML}</div>
                ${translation && translation.trim() ? `<div class="sentence-translation">${escapeHtml(translation)}</div>` : ''}
            </div>
        `;
    });
    
    return `
        <div class="result-set-section">
            <h3 class="result-section-title">
                <i class="fas fa-book-open"></i> Set ${setIndex + 1}: ${escapeHtml(setResult.mainTitle)}
            </h3>
            
            <!-- 지문 패널 -->
            <div class="daily1-passage-panel-result">
                <h4 class="result-passage-title">${escapeHtml(passage.title)}</h4>
                <div class="sentence-translations">
                    ${sentencesHTML}
                </div>
            </div>
            
            <!-- 문제별 결과 -->
            ${renderDaily1AnswersOriginal(setResult)}
        </div>
    `;
}

// 문제별 답안 렌더링 (1차 결과 화면용 - 기존 로직)
function renderDaily1AnswersOriginal(setResult) {
    let html = '';
    
    setResult.answers.forEach((answer, answerIndex) => {
        const resultClass = answer.isCorrect ? 'correct' : 'incorrect';
        const icon = answer.isCorrect ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>';
        const userAnswerIndex = answer.userAnswer;
        const correctAnswerIndex = answer.correctAnswer;
        
        // 사용자가 선택한 보기 찾기
        let userAnswerOption = null;
        let correctAnswerOption = null;
        
        if (Array.isArray(answer.options) && answer.options.length > 0 && answer.options[0].label) {
            // 새 형식: options = [{label: 'A', text: '...', translation: '...', explanation: '...'}, ...]
            userAnswerOption = answer.options.find(opt => opt.label === getLabelFromIndex(userAnswerIndex));
            correctAnswerOption = answer.options.find(opt => opt.label === getLabelFromIndex(correctAnswerIndex));
        } else {
            // 구 형식: options = ['text1', 'text2', ...]
            userAnswerOption = { label: getLabelFromIndex(userAnswerIndex), text: answer.options[userAnswerIndex - 1] || '미응답', translation: '', explanation: '' };
            correctAnswerOption = { label: getLabelFromIndex(correctAnswerIndex), text: answer.options[correctAnswerIndex - 1] || '', translation: '', explanation: '' };
        }
        
        const userAnswerText = userAnswerOption ? `${userAnswerOption.label}) ${userAnswerOption.text}` : '미응답';
        const correctAnswerText = correctAnswerOption ? `${correctAnswerOption.label}) ${correctAnswerOption.text}` : '';
        
        html += `
            <div class="daily1-result-item ${resultClass}">
                <div class="daily1-result-icon">${icon}</div>
                <div class="daily1-result-content">
                    <div class="daily1-question-text">
                        <strong>${answer.questionNum}.</strong> ${escapeHtml(answer.question)}
                    </div>
                    ${answer.questionTranslation ? `
                    <div class="question-translation">
                        <i class="fas fa-comment-dots"></i> 문제 해석: ${escapeHtml(answer.questionTranslation)}
                    </div>
                    ` : ''}
                    
                    <div class="daily1-answer-row">
                        <span class="daily1-answer-label">${answer.isCorrect ? '✓ 내 답변:' : '✗ 내 답변:'}</span>
                        <span class="daily1-answer-value ${resultClass}">${escapeHtml(userAnswerText)}</span>
                    </div>
                    ${!answer.isCorrect ? `
                    <div class="daily1-answer-row">
                        <span class="daily1-answer-label">✓ 정답:</span>
                        <span class="daily1-answer-value correct">${escapeHtml(correctAnswerText)}</span>
                    </div>
                    ` : ''}
                    
                    <!-- 보기 상세 해설 -->
                    ${renderDaily1OptionsExplanation(answer, setResult.setId, answerIndex)}
                </div>
            </div>
        `;
    });
    
    return html;
}


// 세트별 결과 렌더링 (2차 결과용)
function renderDaily1SetResult(setResult, secondAttemptData, firstResults, secondResults, startIndex) {
    // 파라미터가 숫자면 1차 결과 화면 (기존 로직)
    if (typeof secondAttemptData === 'number') {
        const setIndex = secondAttemptData;
        return renderDaily1SetResultOriginal(setResult, setIndex);
    }
    
    // 2차 결과 화면 로직
    const setIndex = 0; // 세트 번호는 나중에 필요 시 추가
    const passage = setResult.passage;
    const translations = passage.translations || [];
    const interactiveWords = passage.interactiveWords || [];
    
    // \n 처리: literal "\n" → 실제 줄바꿈
    const cleanContent = passage.content
        .replace(/\\n/g, '\n')  // escaped \n → real newline
        .replace(/\r\n/g, '\n');
    
    // 번역 수에 맞춰 문장 분리
    const sentences = splitToMatchTranslations(cleanContent, translations.length);
    
    // 문장별 해석 HTML 생성
    let sentencesHTML = '';
    sentences.forEach((sentence, idx) => {
        const translation = translations[idx] || '';
        
        // 문장 내 \n → <br> 변환 + 인터랙티브 단어 하이라이트
        let sentenceHTML = escapeHtml(sentence).replace(/\n/g, '<br>');
        interactiveWords.forEach(wordData => {
            const regex = new RegExp(`(?<![\\w-])${wordData.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'gi');
            sentenceHTML = sentenceHTML.replace(regex, (match) => `<span class="interactive-word" data-translation="${escapeHtml(wordData.translation)}" data-explanation="${escapeHtml(wordData.explanation)}">${match}</span>`);
        });
        
        sentencesHTML += `
            <div class="sentence-pair">
                <div class="sentence-original">${sentenceHTML}</div>
                ${translation && translation.trim() ? `<div class="sentence-translation">${escapeHtml(translation)}</div>` : ''}
            </div>
        `;
    });
    
    return `
        <div class="result-set-section">
            <!-- 지문 패널 -->
            <div class="daily1-passage-panel-result">
                <h4 class="result-passage-title">${escapeHtml(passage.title)}</h4>
                <div class="sentence-translations">
                    ${sentencesHTML}
                </div>
            </div>
            
            <!-- 문제별 결과 -->
            ${renderDaily1Answers(setResult, secondAttemptData, firstResults, secondResults, startIndex)}
        </div>
    `;
}

// 문제별 답안 렌더링 (2차 결과용)
function renderDaily1Answers(setResult, secondAttemptData, firstResults, secondResults, startIndex) {
    let html = '';
    
    setResult.answers.forEach((answer, answerIndex) => {
        const questionIndex = startIndex + answerIndex;
        
        // 1차, 2차 결과 확인
        const wasCorrectInFirst = firstResults ? firstResults[questionIndex] : answer.isCorrect;
        const isCorrectInSecond = secondResults ? secondResults[questionIndex] : answer.isCorrect;
        
        // 3가지 케이스 구분
        let feedbackClass = '';
        let feedbackMessage = '';
        
        if (wasCorrectInFirst) {
            // 1차 정답
            feedbackClass = 'first-correct';
            feedbackMessage = '👏 1차 때부터 정확하게 맞힌 문제예요! 정말 잘했어요! 👍';
        } else if (isCorrectInSecond) {
            // 1차 오답 → 2차 정답
            feedbackClass = 'improved';
            feedbackMessage = '🎯 1차에는 틀렸지만, 아무 도움 없이 스스로 고쳐 맞혔어요! 정말 대단해요! 다음엔 1차부터 맞힐 수 있을 거예요! 🚀';
        } else {
            // 1차 오답 → 2차 오답
            feedbackClass = 'still-wrong';
            feedbackMessage = '📝 1차, 2차 모두 틀린 문제예요. 조금 어려울 수 있으니 해설을 꼼꼼히 읽어보세요! 💪';
        }
        
        const resultClass = isCorrectInSecond ? 'correct' : 'incorrect';
        const icon = isCorrectInSecond ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-times-circle"></i>';
        const userAnswerIndex = answer.userAnswer;
        const correctAnswerIndex = answer.correctAnswer;
        
        // 사용자가 선택한 보기 찾기
        let userAnswerOption = null;
        let correctAnswerOption = null;
        
        if (Array.isArray(answer.options) && answer.options.length > 0 && answer.options[0].label) {
            // 새 형식: options = [{label: 'A', text: '...', translation: '...', explanation: '...'}, ...]
            userAnswerOption = answer.options.find(opt => opt.label === getLabelFromIndex(userAnswerIndex));
            correctAnswerOption = answer.options.find(opt => opt.label === getLabelFromIndex(correctAnswerIndex));
        } else {
            // 구 형식: options = ['text1', 'text2', ...]
            userAnswerOption = { label: getLabelFromIndex(userAnswerIndex), text: answer.options[userAnswerIndex - 1] || '미응답', translation: '', explanation: '' };
            correctAnswerOption = { label: getLabelFromIndex(correctAnswerIndex), text: answer.options[correctAnswerIndex - 1] || '', translation: '', explanation: '' };
        }
        
        const userAnswerText = userAnswerOption ? `${userAnswerOption.label}) ${userAnswerOption.text}` : '미응답';
        const correctAnswerText = correctAnswerOption ? `${correctAnswerOption.label}) ${correctAnswerOption.text}` : '';
        
        html += `
            <div class="daily1-result-item ${resultClass}">
                <div class="daily1-result-icon">${icon}</div>
                <div class="daily1-result-content">
                    <div class="daily1-question-text">
                        <strong>${answer.questionNum}.</strong> ${escapeHtml(answer.question)}
                    </div>
                    ${answer.questionTranslation ? `
                    <div class="question-translation">
                        <i class="fas fa-comment-dots"></i> 문제 해석: ${escapeHtml(answer.questionTranslation)}
                    </div>
                    ` : ''}
                    
                    <div class="daily1-answer-row">
                        <span class="daily1-answer-label">${isCorrectInSecond ? '✓ 내 답변:' : '✗ 내 답변:'}</span>
                        <span class="daily1-answer-value user-answer ${feedbackClass}">
                            ${escapeHtml(userAnswerText)}
                        </span>
                    </div>
                    <div class="daily1-answer-row" style="padding-left: 80px;">
                        <span class="daily1-feedback-message ${feedbackClass}" style="font-size: 10pt;">${feedbackMessage}</span>
                    </div>
                    ${!isCorrectInSecond ? `
                    <div class="daily1-answer-row">
                        <span class="daily1-answer-label">✓ 정답:</span>
                        <span class="daily1-answer-value correct">${escapeHtml(correctAnswerText)}</span>
                    </div>
                    ` : ''}
                    
                    <!-- 보기 상세 해설 -->
                    ${renderDaily1OptionsExplanation(answer, setResult.setId, answerIndex)}
                </div>
            </div>
        `;
    });
    
    return html;
}

// 보기 상세 해설 렌더링
function renderDaily1OptionsExplanation(answer, setId, answerIndex) {
    // 새 형식인지 확인
    if (!answer.options || answer.options.length === 0 || !answer.options[0].label) {
        return ''; // 구 형식이면 해설 없음
    }
    
    const toggleId = `daily1-options-${setId}-${answerIndex}`;
    const userAnswerLabel = getLabelFromIndex(answer.userAnswer);
    const correctAnswerLabel = getLabelFromIndex(answer.correctAnswer);
    
    let optionsHTML = answer.options.map(option => {
        const isUserAnswer = option.label === userAnswerLabel;
        const isCorrectAnswer = option.label === correctAnswerLabel;
        
        let badge = '';
        if (isCorrectAnswer) {
            badge = '<span class="option-badge correct-badge">✓ 정답</span>';
        } else if (isUserAnswer) {
            badge = '<span class="option-badge incorrect-badge">✗ 내가 선택한 오답</span>';
        }
        
        const explanationClass = isCorrectAnswer ? 'correct' : 'incorrect';
        const explanationIcon = isCorrectAnswer ? '💡' : '⚠️';
        const explanationLabel = isCorrectAnswer ? '정답 이유:' : '오답 이유:';
        
        return `
            <div class="option-item">
                <div class="option-header">
                    <span class="option-label">${option.label})</span>
                    <span class="option-text">${escapeHtml(option.text)}</span>
                    ${badge}
                </div>
                ${option.translation ? `
                <div class="option-translation">
                    └─ ${escapeHtml(option.translation)}
                </div>
                ` : ''}
                ${option.explanation ? `
                <div class="option-explanation ${explanationClass}">
                    <strong>${explanationIcon} ${explanationLabel}</strong><br>
                    ${escapeHtml(option.explanation)}
                </div>
                ` : ''}
            </div>
        `;
    }).join('');
    
    return `
        <div class="options-explanation-container">
            <button class="btn-toggle-options" onclick="toggleDaily1Options('${toggleId}')">
                <span class="toggle-text">보기 상세 해설 펼치기</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div id="${toggleId}" class="options-explanation-content" style="display: none;">
                ${optionsHTML}
            </div>
        </div>
    `;
}

// 인덱스를 레이블로 변환 (1 -> A, 2 -> B, ...)
function getLabelFromIndex(index) {
    if (!index) return '';
    return String.fromCharCode(64 + index); // 1=A, 2=B, 3=C, 4=D
}

// 탭 전환
function switchDaily1Tab(setIndex, tabType) {
    const originalPane = document.getElementById(`daily1-original-${setIndex}`);
    const translationPane = document.getElementById(`daily1-translation-${setIndex}`);
    const tabs = document.querySelectorAll(`#daily1ResultDetails .result-set-section:nth-child(${setIndex + 1}) .passage-tab`);
    
    if (tabType === 'original') {
        originalPane.style.display = 'block';
        translationPane.style.display = 'none';
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
    } else {
        originalPane.style.display = 'none';
        translationPane.style.display = 'block';
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
    }
}

// 보기 해설 펼치기/접기
function toggleDaily1Options(toggleId) {
    const content = document.getElementById(toggleId);
    const button = content.previousElementSibling;
    const icon = button.querySelector('i');
    const text = button.querySelector('.toggle-text');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
        text.textContent = '보기 상세 해설 접기';
    } else {
        content.style.display = 'none';
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
        text.textContent = '보기 상세 해설 펼치기';
    }
}

// 이벤트 바인딩
function bindDaily1ToggleEvents() {
    // 인터랙티브 단어 툴팁
    const interactiveWords = document.querySelectorAll('.interactive-word');
    interactiveWords.forEach(word => {
        word.addEventListener('mouseenter', showDaily1Tooltip);
        word.addEventListener('mouseleave', hideDaily1Tooltip);
    });
}

// 툴팁 표시
function showDaily1Tooltip(event) {
    const word = event.target;
    const translation = word.getAttribute('data-translation');
    const explanation = word.getAttribute('data-explanation');
    
    // 기존 툴팁 제거
    const existingTooltip = document.querySelector('.daily1-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    
    // 새 툴팁 생성
    const tooltip = document.createElement('div');
    tooltip.className = 'daily1-tooltip';
    tooltip.innerHTML = `
        <div class="tooltip-translation">${escapeHtml(translation)}</div>
        ${explanation ? `<div class="tooltip-explanation">${escapeHtml(explanation)}</div>` : ''}
    `;
    
    document.body.appendChild(tooltip);
    
    // 위치 계산
    const rect = word.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
}

// 툴팁 숨기기
function hideDaily1Tooltip() {
    const tooltip = document.querySelector('.daily1-tooltip');
    if (tooltip) {
        tooltip.remove();
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

// ============================================
// 3. 전역 노출 (최종 해설 화면용)
// ============================================
window.showDaily1Results = showDaily1Results;
window.renderDaily1SetResult = renderDaily1SetResult;
window.renderDaily1Answers = renderDaily1Answers;
window.renderDaily1OptionsExplanation = renderDaily1OptionsExplanation;
window.switchDaily1Tab = switchDaily1Tab;
window.toggleDaily1Options = toggleDaily1Options;
window.bindDaily1ToggleEvents = bindDaily1ToggleEvents;

console.log('✅ [일상리딩1] 전역 함수 노출 완료');
