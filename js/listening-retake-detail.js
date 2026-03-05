// Listening Module - 최종 해설 화면 로직

/**
 * 리스닝 최종 해설 페이지 표시
 * @param {number} pageIndex - 1: Response, 2: Conversation, 3: Announcement, 4: Lecture
 */
function showListeningRetakeDetailPage(pageIndex) {
    console.log(`📄 [리스닝 세부 결과] 페이지 ${pageIndex} 표시`);
    
    // ★ 데이터 사전 검증 - 없으면 화면을 숨기지 않고 즉시 복귀
    const resultData = window.currentListeningResultData;
    const firstAttemptStr = sessionStorage.getItem('listening_firstAttempt');
    let firstAttemptData = {};
    try { firstAttemptData = JSON.parse(firstAttemptStr || '{}'); } catch(e) {}
    
    if (!resultData) {
        console.error('❌ [리스닝 세부 결과] currentListeningResultData가 없습니다');
        alert('결과 데이터가 없습니다. 2차 결과 화면으로 돌아갑니다.');
        backToListeningRetakeResult();
        return;
    }
    
    if (!firstAttemptData.componentResults) {
        console.warn('⚠️ [리스닝 세부 결과] listening_firstAttempt에 componentResults 없음 - FlowController에서 복원 시도');
        // FlowController의 firstAttemptResult에서 복원
        const fc = window.FlowController;
        if (fc && fc.firstAttemptResult && fc.firstAttemptResult.componentResults) {
            firstAttemptData = {
                sectionType: 'listening',
                componentResults: fc.firstAttemptResult.componentResults,
                totalCorrect: fc.firstAttemptResult.totalCorrect,
                totalQuestions: fc.firstAttemptResult.totalQuestions
            };
            sessionStorage.setItem('listening_firstAttempt', JSON.stringify(firstAttemptData));
            console.log('✅ FlowController에서 listening_firstAttempt 복원 완료');
        } else {
            console.error('❌ 1차 풀이 데이터를 어디서도 찾을 수 없습니다');
            alert('1차 풀이 데이터가 없습니다. 2차 결과 화면으로 돌아갑니다.');
            backToListeningRetakeResult();
            return;
        }
    }
    
    // 데이터 확인 완료 → 화면 전환
    document.querySelectorAll('.screen, .result-screen, .test-screen').forEach(screen => {
        screen.style.display = 'none';
    });
    
    try {
        switch(pageIndex) {
            case 1:
                showResponseDetailInFinalExplain();
                break;
            case 2:
                showConverDetailInFinalExplain();
                break;
            case 3:
                showAnnouncementDetailInFinalExplain();
                break;
            case 4:
                showLectureDetailInFinalExplain();
                break;
            default:
                console.error(`❌ 알 수 없는 페이지 인덱스: ${pageIndex}`);
                backToListeningRetakeResult();
        }
    } catch(e) {
        console.error('❌ [리스닝 세부 결과] 표시 중 에러:', e);
        alert('해설 화면 표시 중 오류가 발생했습니다. 2차 결과 화면으로 돌아갑니다.');
        backToListeningRetakeResult();
    }
}

// ✅ 전역 노출
window.showListeningRetakeDetailPage = showListeningRetakeDetailPage;

/**
 * 2차 결과로 돌아가기
 */
function backToListeningRetakeResult() {
    document.querySelectorAll('.screen, .result-screen, .test-screen').forEach(screen => {
        screen.style.display = 'none';
    });
    document.getElementById('listeningRetakeResultScreen').style.display = 'block';
}

// ✅ 전역 노출
window.backToListeningRetakeResult = backToListeningRetakeResult;

/**
 * 응답고르기 세부 결과 표시
 */
function showResponseDetail() {
    console.log('🎯 [응답고르기] 세부 결과 표시');
    
    // 화면 표시
    const screen = document.getElementById('listeningRetakeDetailResponseScreen');
    if (!screen) {
        console.error('❌ 응답고르기 세부 결과 화면을 찾을 수 없습니다');
        return;
    }
    
    // ✅ 상단 제목 업데이트
    const firstAttemptData = JSON.parse(sessionStorage.getItem('listening_firstAttempt') || '{}');
    const titleElement = document.getElementById('responseDetailTitle');
    if (titleElement && firstAttemptData.weekInfo) {
        const weekName = firstAttemptData.weekInfo.weekName || 'Week 1';
        const dayName = firstAttemptData.weekInfo.dayName || '일요일';
        const moduleName = 'Listening Module 1';
        titleElement.textContent = `🎧 ${weekName} - ${dayName} : ${moduleName} 최종 해설`;
    }
    
    // ✅ resultData에서 1차/2차 정오답 배열 가져오기
    const resultData = window.currentListeningResultData;
    if (!resultData) {
        console.error('❌ resultData가 없습니다');
        alert('결과 데이터를 찾을 수 없습니다. 다시 시도해주세요.');
        return;
    }
    
    const firstResults = resultData.firstAttempt.results;
    const secondResults = resultData.secondAttempt.results;
    const secondAttemptData = resultData.secondAttemptAnswers || {};
    
    console.log('📦 [데이터 로드]');
    console.log('  - firstResults:', firstResults);
    console.log('  - secondResults:', secondResults);
    console.log('  - secondAttemptData 키 개수:', Object.keys(secondAttemptData).length);
    
    if (!firstAttemptData.componentResults) {
        console.error('❌ 1차 결과 데이터가 없습니다');
        alert('결과 데이터를 찾을 수 없습니다. 다시 시도해주세요.');
        return;
    }
    
    // 응답고르기 컴포넌트 필터링
    const responseComponents = firstAttemptData.componentResults.filter(
        comp => comp.componentType === 'response'
    );
    
    console.log(`  ✅ 응답고르기 세트 ${responseComponents.length}개 발견`);
    
    // 요약 정보 계산
    let firstTotal = 0, firstCorrect = 0;
    let secondTotal = 0, secondCorrect = 0;
    let globalQuestionIndex = 0;
    
    firstAttemptData.componentResults.forEach((comp) => {
        const answers = comp.answers || [];
        answers.forEach((answer) => {
            if (comp.componentType === 'response') {
                firstTotal++;
                if (answer.isCorrect) firstCorrect++;
                
                // 2차 답안 확인
                const secondAnswerKey = `q${globalQuestionIndex}`;
                const secondAnswer = secondAttemptData[secondAnswerKey];
                
                secondTotal++;
                if (secondAnswer) {
                    if (secondAnswer.isCorrect) secondCorrect++;
                } else {
                    if (answer.isCorrect) secondCorrect++;
                }
            }
            globalQuestionIndex++;
        });
    });
    
    const firstPercent = Math.round((firstCorrect / firstTotal) * 100);
    const secondPercent = Math.round((secondCorrect / secondTotal) * 100);
    const improvement = secondCorrect - firstCorrect;
    const improvementPercent = secondPercent - firstPercent;
    
    // 요약 정보 표시
    document.getElementById('responseTotal').textContent = firstTotal;
    document.getElementById('responseFirst').textContent = `${firstCorrect}/${firstTotal} (${firstPercent}%)`;
    document.getElementById('responseSecond').textContent = `${secondCorrect}/${secondTotal} (${secondPercent}%)`;
    document.getElementById('responseImprovement').textContent = 
        `${improvement > 0 ? '+' : ''}${improvement}문제 (${improvementPercent > 0 ? '+' : ''}${improvementPercent}%)`;
    
    // 세트별 결과 렌더링 (응답고르기 정답 채점 화면 레시피 사용)
    renderResponseDetailSets(responseComponents, firstAttemptData, firstResults, secondResults);
    
    // 화면 표시
    screen.style.display = 'block';
}

/**
 * finalExplainScreen을 사용한 응답고르기 세부 결과 표시
 */
function showResponseDetailInFinalExplain() {
    console.log('🎯 [finalExplainScreen] 응답고르기 세부 결과 표시');
    
    // 데이터 준비
    const firstAttemptData = JSON.parse(sessionStorage.getItem('listening_firstAttempt') || '{}');
    const resultData = window.currentListeningResultData;
    
    if (!resultData || !firstAttemptData.componentResults) {
        console.error('❌ 결과 데이터가 없습니다');
        alert('결과 데이터를 찾을 수 없습니다. 다시 시도해주세요.');
        return;
    }
    
    // 응답고르기 컴포넌트 필터링
    const responseComponents = firstAttemptData.componentResults.filter(
        comp => comp.componentType === 'response'
    );
    
    // 1차/2차 답변 데이터 구성
    const firstResults = resultData.firstAttempt.results;
    const secondResults = resultData.secondAttempt.results;
    const secondAttemptData = resultData.secondAttemptAnswers || {};
    
    let globalQuestionIndex = 0;
    const firstAttempt = [];
    const secondAttempt = [];
    
    firstAttemptData.componentResults.forEach((comp) => {
        const answers = comp.answers || [];
        answers.forEach((answer) => {
            if (comp.componentType === 'response') {
                firstAttempt.push({ isCorrect: answer.isCorrect });
                
                const secondAnswerKey = `q${globalQuestionIndex}`;
                const secondAnswer = secondAttemptData[secondAnswerKey];
                
                if (secondAnswer) {
                    secondAttempt.push({ isCorrect: secondAnswer.isCorrect });
                } else {
                    secondAttempt.push({ isCorrect: answer.isCorrect });
                }
            }
            globalQuestionIndex++;
        });
    });
    
    // finalExplainScreen 데이터 준비
    const weekName = firstAttemptData.weekInfo?.weekName || 'Week 1';
    const dayName = firstAttemptData.weekInfo?.dayName || '일요일';
    
    const data = {
        week: weekName,
        day: dayName,
        moduleName: 'Listening Module 1',
        sectionName: 'Response',
        firstAttempt: firstAttempt,
        secondAttempt: secondAttempt,
        pageIndex: 1
    };
    
    // finalExplainScreen 표시
    showFinalExplainScreen(data);
    
    // 1차 정답 채점 화면 렌더링 로직 실행
    // responseResults를 sessionStorage에 임시 저장
    const responseResults = responseComponents.map(comp => ({
        answers: comp.answers || []
    }));
    sessionStorage.setItem('responseResults', JSON.stringify(responseResults));
    
    // showResponseResults() 함수 실행하여 responseResultDetails 채우기
    showResponseResults();
    
    // responseResultDetails에서 finalDetailContent로 복사
    setTimeout(() => {
        // 응답고르기 정답 채점 화면 숨기기
        const responseResultScreen = document.getElementById('listeningResponseResultScreen');
        if (responseResultScreen) {
            responseResultScreen.style.display = 'none';
        }
        
        const sourceContainer = document.getElementById('responseResultDetails');
        const targetContainer = document.getElementById('finalDetailContent');
        
        if (sourceContainer && targetContainer) {
            targetContainer.innerHTML = sourceContainer.innerHTML;
            
            // 오디오 리스너 재설정
            setTimeout(() => {
                initResponseResultAudioListeners();
                const highlightedWords = document.querySelectorAll('.response-keyword-highlight');
                highlightedWords.forEach(word => {
                    word.addEventListener('mouseenter', showResponseTooltip);
                    word.addEventListener('mouseleave', hideResponseTooltip);
                });
            }, 100);
            
            // finalExplainScreen 다시 표시 (showResponseResults가 화면 전환했으므로)
            document.getElementById('finalExplainScreen').style.display = 'block';
        }
    }, 200);
}

/**
 * 응답고르기 세트별 결과 렌더링
 * (listening-response-logic.js의 renderResponseSetResult 레시피 사용)
 */
function renderResponseDetailSets(responseComponents, firstAttemptData, firstResults, secondResults) {
    const container = document.getElementById('responseDetailSets');
    if (!container) return;
    
    container.innerHTML = '';
    
    // 전체 컴포넌트에서 응답고르기의 시작 인덱스 찾기
    let globalQuestionIndex = 0;
    
    for (let i = 0; i < firstAttemptData.componentResults.length; i++) {
        const comp = firstAttemptData.componentResults[i];
        if (comp.componentType === 'response') {
            break;
        }
        globalQuestionIndex += (comp.answers || []).length;
    }
    
    // 각 세트 렌더링
    responseComponents.forEach((component, setIndex) => {
        // renderResponseSetResult 레시피 사용
        const setResult = {
            answers: component.answers || []
        };
        
        const html = renderResponseSetResultForDetail(setResult, setIndex, globalQuestionIndex, firstResults, secondResults);
        container.innerHTML += html;
        
        // 다음 세트를 위해 인덱스 이동
        globalQuestionIndex += setResult.answers.length;
    });
    
    // 오디오 리스너 설정
    setTimeout(() => {
        setupResponseDetailAudioListeners();
    }, 100);
    
    // 툴팁 이벤트 리스너 추가
    setTimeout(() => {
        const highlightedWords = document.querySelectorAll('.response-keyword-highlight');
        highlightedWords.forEach(word => {
            word.addEventListener('mouseenter', showResponseTooltip);
            word.addEventListener('mouseleave', hideResponseTooltip);
        });
        console.log(`✅ 툴팁 이벤트 리스너 추가 완료: ${highlightedWords.length}개`);
    }, 100);
}

/**
 * 세트별 결과 렌더링 (응답고르기 정답 채점 화면과 동일한 레시피)
 */
function renderResponseSetResultForDetail(setResult, setIdx, startGlobalIndex, firstResults, secondResults) {
    const setNum = setIdx + 1;
    const questionCount = setResult.answers ? setResult.answers.length : 0;
    
    let html = `
        <div class="response-set-header">
            <span class="response-set-badge">
                <i class="fas fa-headphones"></i>
                Response Set ${setNum}
            </span>
            <span class="response-set-meta">응답고르기 · ${questionCount}문제</span>
        </div>
        <div class="questions-section">
    `;
    
    // 각 문제 렌더링
    setResult.answers.forEach((answer, qIdx) => {
        const globalIdx = startGlobalIndex + qIdx;
        html += renderResponseAnswerForDetail(answer, qIdx, setIdx, globalIdx, firstResults, secondResults);
    });
    
    html += `
        </div>
    `;
    
    return html;
}

/**
 * 문제별 결과 렌더링 (1차/2차 비교 포함)
 */
function renderResponseAnswerForDetail(answer, qIdx, setIdx, globalIdx, firstResults, secondResults) {
    // 1차/2차 정오답 확인
    const firstCorrect = firstResults[globalIdx];
    const secondCorrect = secondResults[globalIdx];
    
    // 상황별 피드백 및 스타일
    let feedbackMessage = '';
    let userAnswerClass = '';
    let showCorrectAnswer = false;
    
    if (firstCorrect && secondCorrect) {
        // 1차 정답
        userAnswerClass = 'first-correct';
        feedbackMessage = '👏 1차 때부터 정확하게 맞힌 문제예요! 정말 잘했어요! 👍';
        showCorrectAnswer = false;
    } else if (!firstCorrect && secondCorrect) {
        // 1차 오답 → 2차 정답 (개선)
        userAnswerClass = 'improved';
        feedbackMessage = '🎯 1차에는 틀렸지만, 아무 도움 없이 스스로 고쳐 맞혔어요! 정말 대단해요! 다음엔 1차부터 맞힐 수 있을 거예요! 🚀';
        showCorrectAnswer = false;
    } else {
        // 1차 오답 → 2차 오답
        userAnswerClass = 'still-wrong';
        feedbackMessage = '📝 1차, 2차 모두 틀린 문제예요. 조금 어려울 수 있으니 해설을 꼼꼼히 읽어보세요! 💪';
        showCorrectAnswer = true;
    }
    
    const correctIcon = secondCorrect 
        ? '<i class="fas fa-check-circle" style="color: var(--success-color);"></i>' 
        : '<i class="fas fa-times-circle" style="color: var(--danger-color);"></i>';
    
    const audioId = `result-audio-detail-${setIdx}-${qIdx}`;
    
    let html = `
        <div class="response-result-item ${secondCorrect ? 'correct' : 'incorrect'}">
            <div class="question-header">
                <span class="question-number">Question ${answer.questionNum}</span>
                <span class="result-status">${correctIcon}</span>
            </div>
            
            <!-- 오디오 섹션 -->
            <div class="audio-section">
                <div class="audio-title">
                    <i class="fas fa-volume-up"></i>
                    <span>오디오 다시 듣기</span>
                </div>
                <div class="audio-player-container">
                    <button class="audio-play-btn" onclick="toggleResponseDetailAudio('${audioId}')">
                        <i class="fas fa-play" id="${audioId}-icon"></i>
                    </button>
                    <div class="audio-seek-container">
                        <div class="audio-seek-bar" id="${audioId}-seek" onclick="seekResponseDetailAudio('${audioId}', event)">
                            <div class="audio-seek-progress" id="${audioId}-progress" style="width: 0%">
                                <div class="audio-seek-handle"></div>
                            </div>
                        </div>
                        <div class="audio-time">
                            <span id="${audioId}-current">0:00</span> / <span id="${audioId}-duration">0:00</span>
                        </div>
                    </div>
                    <audio id="${audioId}" src="${convertGoogleDriveUrl(answer.audioUrl)}"></audio>
                </div>
                ${answer.script ? `
                <div class="audio-script">
                    <strong>Script:</strong> ${highlightResponseScript(answer.script, answer.scriptHighlights || [])}
                    ${answer.scriptTrans ? `<br><strong>해석:</strong> ${answer.scriptTrans}` : ''}
                </div>
                ` : ''}
            </div>
            
            <div class="answer-summary">
                <div class="response-answer-row">
                    <span class="response-answer-label">내 답변:</span>
                    <span class="response-answer-value ${userAnswerClass}">
                        ${answer.userAnswer ? answer.options[answer.userAnswer - 1] : '미응답'}
                    </span>
                </div>
                <div class="response-answer-row" style="padding-left: 80px;">
                    <span class="feedback-message-inline">${feedbackMessage}</span>
                </div>
                ${showCorrectAnswer ? `
                <div class="response-answer-row">
                    <span class="response-answer-label">정답:</span>
                    <span class="response-answer-value correct">
                        ${answer.options[answer.correctAnswer - 1]}
                    </span>
                </div>
                ` : ''}
            </div>
            
            ${renderResponseOptionsExplanationForDetail(answer, setIdx, qIdx)}
        </div>
    `;
    
    return html;
}

/**
 * 보기 상세 해설 렌더링 (응답고르기 정답 채점 화면과 동일한 레시피)
 */
function renderResponseOptionsExplanationForDetail(answer, setIdx, qIdx) {
    const toggleId = `response-detail-toggle-${setIdx}-${qIdx}`;
    
    let html = `
        <div class="options-explanation-section">
            <button class="toggle-explanation-btn" onclick="toggleResponseDetailOptions('${toggleId}')">
                <span class="toggle-text">보기 상세 해설 펼치기</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            
            <div id="${toggleId}" class="options-details" style="display: none;">
    `;
    
    answer.options.forEach((option, idx) => {
        const optionNum = idx + 1;
        const isCorrectAnswer = optionNum === answer.correctAnswer;
        const isUserAnswer = optionNum === answer.userAnswer;
        const translation = answer.optionTranslations && answer.optionTranslations[idx] ? answer.optionTranslations[idx] : '';
        const explanation = answer.optionExplanations && answer.optionExplanations[idx] ? answer.optionExplanations[idx] : '';
        
        // 정답 또는 사용자 답변 표시
        let badge = '';
        if (isCorrectAnswer && isUserAnswer) {
            badge = '<span class="option-badge correct-and-user">✓ 정답 (내가 선택)</span>';
        } else if (isCorrectAnswer) {
            badge = '<span class="option-badge correct-only">✓ 정답</span>';
        } else if (isUserAnswer) {
            badge = '<span class="option-badge user-only">✗ 내가 선택한 오답</span>';
        }
        
        const optionLabel = String.fromCharCode(65 + idx); // A, B, C, D
        html += `
            <div class="option-detail ${isCorrectAnswer ? 'correct' : 'incorrect'}">
                <div class="option-header">
                    <div class="option-text"><span class="option-marker">${optionLabel}</span>${option}</div>
                    ${badge}
                </div>
                ${translation ? `<div class="option-translation">${translation}</div>` : ''}
                ${explanation ? `
                <div class="option-explanation ${isCorrectAnswer ? 'correct' : 'incorrect'}">
                    <strong>${isCorrectAnswer ? '정답 이유:' : '오답 이유:'}</strong>${explanation}
                </div>
                ` : ''}
            </div>
        `;
    });
    
    html += `
            </div>
        </div>
    `;
    
    return html;
}

/**
 * Google Drive URL 변환 (listening-response-logic.js와 동일)
 */
function convertGoogleDriveUrl(url) {
    if (!url || url === 'PLACEHOLDER') return url;
    if (url.trim() === '') return '';
    if (url.startsWith('http') && !url.includes('drive.google.com')) {
        return url;
    }
    
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
        const fileId = match[1];
        return `https://drive.google.com/uc?export=open&id=${fileId}`;
    }
    
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) {
        const fileId = idMatch[1];
        return `https://drive.google.com/uc?export=open&id=${fileId}`;
    }
    
    return url;
}

/**
 * Script 하이라이트 (listening-response-logic.js와 동일)
 */
function highlightResponseScript(scriptText, highlights) {
    if (!highlights || highlights.length === 0) {
        return escapeHtml(scriptText);
    }
    
    let highlightedText = escapeHtml(scriptText);
    
    highlights.forEach(highlight => {
        const word = highlight.word || '';
        const translation = highlight.translation || '';
        const explanation = highlight.explanation || '';
        
        if (!word) return;
        
        const regex = new RegExp(`\\b(${escapeRegex(word)})\\b`, 'gi');
        highlightedText = highlightedText.replace(regex, (match) => {
            return `<span class="response-keyword-highlight" data-translation="${escapeHtml(translation)}" data-explanation="${escapeHtml(explanation)}">${match}</span>`;
        });
    });
    
    return highlightedText;
}

/**
 * 정규식 특수문자 이스케이프
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 툴팁 표시 (listening-response-logic.js와 동일)
 */
function showResponseTooltip(event) {
    const target = event.currentTarget;
    const translation = target.getAttribute('data-translation');
    const explanation = target.getAttribute('data-explanation');
    
    if (!translation && !explanation) return;
    
    // 기존 툴팁 제거
    const existingTooltip = document.querySelector('.response-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    
    // 새 툴팁 생성
    const tooltip = document.createElement('div');
    tooltip.className = 'response-tooltip';
    tooltip.innerHTML = `
        ${translation ? `<div class="tooltip-translation">${translation}</div>` : ''}
        ${explanation ? `<div class="tooltip-explanation">${explanation}</div>` : ''}
    `;
    
    document.body.appendChild(tooltip);
    
    // 툴팁 위치 설정
    const rect = target.getBoundingClientRect();
    tooltip.style.position = 'absolute';
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
}

/**
 * 툴팁 숨기기
 */
function hideResponseTooltip() {
    const tooltip = document.querySelector('.response-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

/**
 * 오디오 재생 토글
 */
function toggleResponseDetailAudio(audioId) {
    const audio = document.getElementById(audioId);
    const icon = document.getElementById(`${audioId}-icon`);
    
    if (!audio || !icon) return;
    
    if (audio.paused) {
        // 다른 모든 오디오 정지
        document.querySelectorAll('audio').forEach(a => {
            if (a.id !== audioId) {
                a.pause();
                const otherIcon = document.getElementById(`${a.id}-icon`);
                if (otherIcon) otherIcon.className = 'fas fa-play';
            }
        });
        
        audio.play();
        icon.className = 'fas fa-pause';
    } else {
        audio.pause();
        icon.className = 'fas fa-play';
    }
}

window.toggleResponseDetailAudio = toggleResponseDetailAudio;

/**
 * 오디오 탐색
 */
function seekResponseDetailAudio(audioId, event) {
    const audio = document.getElementById(audioId);
    const seekBar = document.getElementById(`${audioId}-seek`);
    
    if (!audio || !seekBar) return;
    
    const clickX = event.offsetX;
    const width = seekBar.offsetWidth;
    const seekTime = (clickX / width) * audio.duration;
    audio.currentTime = seekTime;
}

window.seekResponseDetailAudio = seekResponseDetailAudio;

/**
 * 오디오 리스너 설정
 */
function setupResponseDetailAudioListeners() {
    const audios = document.querySelectorAll('[id^="result-audio-detail-"]');
    
    audios.forEach(audio => {
        const audioId = audio.id;
        
        audio.addEventListener('loadedmetadata', () => {
            const duration = document.getElementById(`${audioId}-duration`);
            if (duration) {
                const minutes = Math.floor(audio.duration / 60);
                const seconds = Math.floor(audio.duration % 60);
                duration.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        });
        
        audio.addEventListener('timeupdate', () => {
            const progress = document.getElementById(`${audioId}-progress`);
            const current = document.getElementById(`${audioId}-current`);
            
            if (progress && current) {
                const percent = (audio.currentTime / audio.duration) * 100;
                progress.style.width = `${percent}%`;
                
                const minutes = Math.floor(audio.currentTime / 60);
                const seconds = Math.floor(audio.currentTime % 60);
                current.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        });
        
        audio.addEventListener('ended', () => {
            const icon = document.getElementById(`${audioId}-icon`);
            if (icon) icon.className = 'fas fa-play';
        });
    });
    
    console.log(`✅ 오디오 리스너 설정 완료: ${audios.length}개`);
}

/**
 * 보기 해설 토글
 */
function toggleResponseDetailOptions(toggleId) {
    const content = document.getElementById(toggleId);
    if (!content) return;
    
    const btn = content.previousElementSibling;
    const icon = btn.querySelector('i');
    const text = btn.querySelector('.toggle-text');
    
    if (content.style.display === 'none') {
        content.style.display = 'flex';
        icon.className = 'fas fa-chevron-up';
        text.textContent = '보기 상세 해설 접기';
    } else {
        content.style.display = 'none';
        icon.className = 'fas fa-chevron-down';
        text.textContent = '보기 상세 해설 펼치기';
    }
}

window.toggleResponseDetailOptions = toggleResponseDetailOptions;

/**
 * ============================================
 * 컨버(Conversation) 최종 해설
 * ============================================
 */

/**
 * 컨버 세부 결과 표시
 */
function showConverDetail() {
    console.log('🎯 [컨버] 세부 결과 표시');
    
    const screen = document.getElementById('listeningRetakeDetailConverScreen');
    if (!screen) {
        console.error('❌ 컨버 세부 결과 화면을 찾을 수 없습니다');
        return;
    }
    
    // 상단 제목 업데이트
    const firstAttemptData = JSON.parse(sessionStorage.getItem('listening_firstAttempt') || '{}');
    const titleElement = document.getElementById('converDetailTitle');
    if (titleElement && firstAttemptData.weekInfo) {
        const weekName = firstAttemptData.weekInfo.weekName || 'Week 1';
        const dayName = firstAttemptData.weekInfo.dayName || '일요일';
        const moduleName = 'Listening Module 1';
        titleElement.textContent = `🎧 ${weekName} - ${dayName} : ${moduleName} 최종 해설`;
    }
    
    // resultData 가져오기
    const resultData = window.currentListeningResultData;
    if (!resultData || !firstAttemptData.componentResults) {
        console.error('❌ 결과 데이터가 없습니다');
        alert('결과 데이터를 찾을 수 없습니다. 다시 시도해주세요.');
        return;
    }
    
    const firstResults = resultData.firstAttempt.results;
    const secondResults = resultData.secondAttempt.results;
    
    // 컨버 컴포넌트 필터링
    const converComponents = firstAttemptData.componentResults.filter(
        comp => comp.componentType === 'conver'
    );
    
    console.log(`  ✅ 컨버 세트 ${converComponents.length}개 발견`);
    
    // 요약 정보 계산
    let firstTotal = 0, firstCorrect = 0;
    let secondTotal = 0, secondCorrect = 0;
    let globalQuestionIndex = 0;
    const secondAttemptData = resultData.secondAttemptAnswers || {};
    
    firstAttemptData.componentResults.forEach((comp) => {
        const answers = comp.answers || [];
        answers.forEach((answer) => {
            if (comp.componentType === 'conver') {
                firstTotal++;
                if (answer.isCorrect) firstCorrect++;
                
                const secondAnswerKey = `q${globalQuestionIndex}`;
                const secondAnswer = secondAttemptData[secondAnswerKey];
                
                secondTotal++;
                if (secondAnswer) {
                    if (secondAnswer.isCorrect) secondCorrect++;
                } else {
                    if (answer.isCorrect) secondCorrect++;
                }
            }
            globalQuestionIndex++;
        });
    });
    
    const firstPercent = Math.round((firstCorrect / firstTotal) * 100);
    const secondPercent = Math.round((secondCorrect / secondTotal) * 100);
    const improvement = secondCorrect - firstCorrect;
    const improvementPercent = secondPercent - firstPercent;
    
    // 요약 정보 표시
    document.getElementById('converTotal').textContent = firstTotal;
    document.getElementById('converFirst').textContent = `${firstCorrect}/${firstTotal} (${firstPercent}%)`;
    document.getElementById('converSecond').textContent = `${secondCorrect}/${secondTotal} (${secondPercent}%)`;
    document.getElementById('converImprovement').textContent = 
        `${improvement > 0 ? '+' : ''}${improvement}문제 (${improvementPercent > 0 ? '+' : ''}${improvementPercent}%)`;
    
    // 세트별 결과 렌더링
    renderConverDetailSets(converComponents, firstAttemptData, firstResults, secondResults);
    
    // 화면 표시
    screen.style.display = 'block';
}

/**
 * 컨버 세트별 결과 렌더링 - 원본 listeningConverResultScreen 그대로 사용
 */
function renderConverDetailSets(converComponents, firstAttemptData, firstResults, secondResults) {
    const container = document.getElementById('converDetailSets');
    if (!container) return;
    
    container.innerHTML = '';
    
    // 전체 컴포넌트에서 컨버의 시작 인덱스 찾기
    let globalQuestionIndex = 0;
    
    for (let i = 0; i < firstAttemptData.componentResults.length; i++) {
        const comp = firstAttemptData.componentResults[i];
        if (comp.componentType === 'conver') {
            break;
        }
        globalQuestionIndex += (comp.answers || []).length;
    }
    
    // 각 세트 렌더링 - 원본 함수 그대로 사용
    converComponents.forEach((component, setIndex) => {
        const setResult = {
            answers: component.answers || []
        };
        
        // 원본 renderConverSetResult 함수 그대로 사용하되, 1차/2차 비교만 추가
        const html = renderConverSetResultForDetail(setResult, setIndex, globalQuestionIndex, firstResults, secondResults);
        container.innerHTML += html;
        
        globalQuestionIndex += setResult.answers.length;
    });
    
    // 오디오 리스너 설정 - 원본 함수 그대로 사용
    setTimeout(() => {
        initConverResultAudioListeners();
    }, 100);
    
    // 툴팁 이벤트 리스너 추가
    setTimeout(() => {
        const highlightedWords = document.querySelectorAll('.conver-keyword');
        highlightedWords.forEach(word => {
            word.addEventListener('mouseenter', showConverTooltip);
            word.addEventListener('mouseleave', hideConverTooltip);
        });
        console.log(`✅ 컨버 툴팁 이벤트 리스너 추가 완료: ${highlightedWords.length}개`);
    }, 100);
}

/**
 * 컨버 세트 렌더링 (listeningConverResultScreen 레시피)
 */
function renderConverSetResultForDetail(setResult, setIdx, startGlobalIndex, firstResults, secondResults) {
    const audioId = `conver-main-audio-${setIdx}`;
    const setNumber = setIdx + 1;
    const questionCount = setResult.answers.length;
    const setMeta = setResult.setDescription || `대화 듣기 · ${questionCount}문제`;
    
    let html = `
        <div class="conver-set">
            <!-- 세트 헤더 -->
            <div class="conver-set-header">
                <span class="conver-set-badge">
                    <i class="fas fa-comments"></i>
                    Conversation Set ${setNumber}
                </span>
                <span class="conver-set-meta">${setMeta}</span>
            </div>
            
            <!-- 전체 대화 오디오 -->
            ${setResult.answers[0].audioUrl ? `
            <div class="conver-audio-section">
                <div class="conver-audio-title">
                    <i class="fas fa-volume-up"></i>
                    <span>전체 대화 다시 듣기</span>
                </div>
                <div class="conver-audio-player">
                    <button class="conver-play-btn" onclick="toggleConverAudio('${audioId}')">
                        <i class="fas fa-play" id="${audioId}-icon"></i>
                    </button>
                    <div class="conver-seek-container">
                        <div class="conver-seek-bar" id="${audioId}-seek" onclick="seekConverAudio('${audioId}', event)">
                            <div class="conver-seek-progress" id="${audioId}-progress" style="width: 0%">
                                <div class="conver-seek-handle"></div>
                            </div>
                        </div>
                        <div class="conver-audio-time">
                            <span id="${audioId}-current">0:00</span> <span id="${audioId}-duration">0:00</span>
                        </div>
                    </div>
                    <audio id="${audioId}" src="${convertGoogleDriveUrl(setResult.answers[0].audioUrl)}"></audio>
                </div>
            </div>
            ` : ''}
            
            <!-- 전체 스크립트 -->
            ${setResult.answers[0].script ? `
            <div class="conver-script-section">
                <button class="conver-script-toggle" onclick="toggleConverScriptSection('conver-script-detail-${setIdx}')">
                    <i class="fas fa-file-alt"></i>
                    <span class="toggle-text">전체 대화 스크립트 보기</span>
                    <i class="fas fa-chevron-down" id="conver-script-detail-${setIdx}-icon"></i>
                </button>
                <div id="conver-script-detail-${setIdx}" class="conver-script-body" style="display: none;">
                    ${renderConverScript(setResult.answers[0].script, setResult.answers[0].scriptTrans, setResult.answers[0].scriptHighlights || [])}
                </div>
            </div>
            ` : ''}
            
            <!-- 구분선: 문제 영역 -->
            <div class="conver-questions-divider">
                <span>문제 해설</span>
            </div>
    `;
    
    // 각 문제 렌더링
    setResult.answers.forEach((answer, qIdx) => {
        const globalIdx = startGlobalIndex + qIdx;
        html += renderConverAnswerForDetail(answer, qIdx, setIdx, globalIdx, firstResults, secondResults);
    });
    
    html += `
        </div>
    `;
    
    return html;
}

// 컨버 스크립트 렌더링 - 웹디 구조에 맞게 수정
function renderConverScript(script, scriptTrans, scriptHighlights = []) {
    if (!script) return '';
    
    const speakerPattern = /(Man:|Woman:)/g;
    const scriptParts = script.split(speakerPattern).filter(part => part.trim());
    const transParts = scriptTrans ? scriptTrans.split(/(남자:|여자:)/g).filter(part => part.trim()) : [];
    
    let html = '';
    let transIndex = 0;
    
    for (let i = 0; i < scriptParts.length; i += 2) {
        if (i + 1 >= scriptParts.length) break;
        
        const speaker = scriptParts[i].trim();
        const text = scriptParts[i + 1].trim();
        
        let translation = '';
        const koreanSpeaker = speaker === 'Man:' ? '남자:' : '여자:';
        
        for (let j = transIndex; j < transParts.length; j += 2) {
            if (transParts[j] === koreanSpeaker && j + 1 < transParts.length) {
                translation = transParts[j + 1].trim();
                transIndex = j + 2;
                break;
            }
        }
        
        const speakerName = speaker.replace(':', '').trim();
        const speakerBClass = speaker === 'Woman:' ? ' speaker-b' : '';
        
        html += `
            <div class="script-line">
                <span class="script-speaker${speakerBClass}">${speakerName}</span>
                <div class="script-text">
                    ${highlightConverScript(text, scriptHighlights)}
                    ${translation ? `<span class="translation">${translation}</span>` : ''}
                </div>
            </div>
        `;
    }
    
    return html;
}

// 스크립트 하이라이트 - 원본 listening-conver-logic.js의 highlightConverScript 그대로 복사
function highlightConverScript(scriptText, highlights) {
    if (!highlights || highlights.length === 0) {
        return escapeHtml(scriptText);
    }
    
    let highlightedText = escapeHtml(scriptText);
    
    highlights.forEach(highlight => {
        const word = highlight.word || '';
        const translation = highlight.translation || '';
        const explanation = highlight.explanation || '';
        
        if (!word) return;
        
        const regex = new RegExp(`\\b(${escapeRegex(word)})\\b`, 'gi');
        highlightedText = highlightedText.replace(regex, (match) => {
            return `<span class="conver-keyword" data-translation="${escapeHtml(translation)}" data-explanation="${escapeHtml(explanation)}">${match}</span>`;
        });
    });
    
    return highlightedText;
}

// 컨버 문제 렌더링 - 원본 renderConverAnswer에 1차/2차 비교만 추가
function renderConverAnswerForDetail(answer, qIdx, setIdx, globalIdx, firstResults, secondResults) {
    const firstCorrect = firstResults[globalIdx];
    const secondCorrect = secondResults[globalIdx];
    
    let feedbackMessage = '';
    let userAnswerClass = '';
    let showCorrectAnswer = false;
    
    if (firstCorrect && secondCorrect) {
        userAnswerClass = 'first-correct';
        feedbackMessage = '👏 1차 때부터 정확하게 맞힌 문제예요! 정말 잘했어요! 👍';
        showCorrectAnswer = false;
    } else if (!firstCorrect && secondCorrect) {
        userAnswerClass = 'improved';
        feedbackMessage = '🎯 1차에는 틀렸지만, 아무 도움 없이 스스로 고쳐 맞혔어요! 정말 대단해요! 다음엔 1차부터 맞힐 수 있을 거예요! 🚀';
        showCorrectAnswer = false;
    } else {
        userAnswerClass = 'still-wrong';
        feedbackMessage = '📝 1차, 2차 모두 틀린 문제예요. 조금 어려울 수 있으니 해설을 꼼꼼히 읽어보세요! 💪';
        showCorrectAnswer = true;
    }
    
    const isCorrect = secondCorrect;
    const correctIcon = isCorrect 
        ? '<i class="fas fa-check-circle" style="color: var(--success-color);"></i>' 
        : '<i class="fas fa-times-circle" style="color: var(--danger-color);"></i>';
    
    let html = `
        <div class="conver-question">
            <div class="conver-question-header">
                <span class="conver-q-number">Question ${answer.questionNum}</span>
                <span class="conver-q-status">${correctIcon}</span>
            </div>
            <div class="conver-q-text">${answer.question}</div>
            ${answer.questionTrans ? `<div class="conver-q-translation">${answer.questionTrans}</div>` : ''}
            
            <div class="conver-answer-summary">
                <div class="conver-answer-row">
                    <span class="conver-answer-label">내 답변:</span>
                    <span class="conver-answer-value ${userAnswerClass}">
                        ${answer.userAnswer ? `${answer.options[answer.userAnswer - 1]}` : '미응답'}
                    </span>
                </div>
                <div class="conver-answer-row">
                    <span class="feedback-message-inline">${feedbackMessage}</span>
                </div>
                ${showCorrectAnswer ? `
                <div class="conver-answer-row">
                    <span class="conver-answer-label">정답:</span>
                    <span class="conver-answer-value correct">
                        ${answer.options[answer.correctAnswer - 1]}
                    </span>
                </div>
                ` : ''}
            </div>
            
            ${renderConverOptionsExplanationForDetail(answer, qIdx, setIdx)}
        </div>
    `;
    
    return html;
}

// 컨버 보기 해설 렌더링
function renderConverOptionsExplanationForDetail(answer, qIdx, setIdx) {
    if (!answer.optionExplanations || answer.optionExplanations.length === 0) {
        return '';
    }
    
    const hasExplanations = answer.optionExplanations.some(exp => exp && exp.trim());
    if (!hasExplanations) {
        return '';
    }
    
    const toggleId = `conver-toggle-q${setIdx}-${qIdx}`;
    
    let html = `
            <button class="conver-toggle-btn" onclick="toggleConverExplanation('${toggleId}')">
                <span class="toggle-text">보기 상세 해설 펼치기</span>
                <i class="fas fa-chevron-down" id="${toggleId}-icon"></i>
            </button>
            <div id="${toggleId}" class="conver-options-details" style="display: none;">
    `;
    
    answer.options.forEach((option, idx) => {
        const optionLetter = String.fromCharCode(65 + idx);
        const isCorrectOption = (idx + 1) === answer.correctAnswer;
        const isUserChoice = (idx + 1) === answer.userAnswer;
        const translation = answer.optionTranslations && answer.optionTranslations[idx] ? answer.optionTranslations[idx] : '';
        const explanation = answer.optionExplanations && answer.optionExplanations[idx] ? answer.optionExplanations[idx] : '';
        
        // 배지 추가
        let badge = '';
        
        if (isCorrectOption && isUserChoice) {
            badge = '<span class="option-badge correct-my-choice">✓ 내가 선택한 정답</span>';
        } else if (isCorrectOption) {
            badge = '<span class="option-badge correct-not-chosen">✓ 정답</span>';
        } else if (isUserChoice) {
            badge = '<span class="option-badge wrong-my-choice">✗ 내가 선택한 오답</span>';
        }
        
        html += `
            <div class="conver-option ${isCorrectOption ? 'correct' : ''}">
                <div class="conver-option-text"><span class="conver-option-marker">${optionLetter}</span>${option} ${badge}</div>
                ${translation ? `<div class="conver-option-translation">${translation}</div>` : ''}
                ${explanation ? `
                <div class="conver-option-explanation ${isCorrectOption ? 'correct' : 'incorrect'}">
                    <strong>${isCorrectOption ? '정답 이유:' : '오답 이유:'}</strong> ${explanation}
                </div>
                ` : ''}
            </div>
        `;
    });
    
    html += `
            </div>
    `;
    
    return html;
}

// 컨버 툴팁
function showConverTooltip(event) {
    const word = event.currentTarget;
    const translation = word.getAttribute('data-translation');
    const explanation = word.getAttribute('data-explanation');
    
    if (!translation && !explanation) return;
    
    const existingTooltip = document.querySelector('.conver-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    
    const tooltip = document.createElement('div');
    tooltip.className = 'conver-tooltip';
    tooltip.innerHTML = `
        <div class="tooltip-translation">${translation}</div>
        ${explanation ? `<div class="tooltip-explanation">${explanation}</div>` : ''}
    `;
    
    document.body.appendChild(tooltip);
    
    const rect = word.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
}

function hideConverTooltip() {
    const tooltip = document.querySelector('.conver-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

/**
 * ============================
 * 공지사항 최종 해설 화면
 * ============================
 */

function showAnnouncementDetail() {
    console.log('📄 [공지사항 세부 결과] 표시 시작');
    
    const screen = document.getElementById('listeningRetakeDetailAnnouncementScreen');
    if (!screen) {
        console.error('❌ 공지사항 세부 결과 화면이 없습니다');
        return;
    }
    
    // 1차 데이터 로드
    const firstAttemptStr = sessionStorage.getItem('listening_firstAttempt');
    if (!firstAttemptStr) {
        console.error('❌ 1차 데이터가 없습니다');
        return;
    }
    const firstAttemptData = JSON.parse(firstAttemptStr);
    
    // 2차 데이터 로드
    const resultData = window.currentListeningResultData;
    if (!resultData) {
        console.error('❌ 2차 데이터가 없습니다');
        return;
    }
    
    // Week & Day 정보 가져오기
    const currentTest = JSON.parse(sessionStorage.getItem('currentTest') || '{"week":"Week 1","day":"월"}');
    const dayTitle = `${currentTest.week || 'Week 1'} - ${currentTest.day || '월'}요일 : Listening Module 3 최종 해설`;
    document.getElementById('announcementDetailTitle').textContent = `🎧 ${dayTitle}`;
    
    // 공지사항 컴포넌트 필터링
    const announcementComponents = resultData.componentResults.filter(c => c.componentType === 'announcement');
    
    // 1차 결과
    const firstResults = firstAttemptData.componentResults
        .filter(c => c.componentType === 'announcement')
        .flatMap(c => c.answers.map(r => r.isCorrect));
    
    // 2차 결과
    const secondResults = announcementComponents
        .flatMap(c => c.answers.map(r => r.isCorrect));
    
    console.log('공지사항 1차 결과:', firstResults);
    console.log('공지사항 2차 결과:', secondResults);
    
    // 총 문제 수 계산
    const firstTotal = firstResults.length;
    const secondTotal = secondResults.length;
    const firstCorrect = firstResults.filter(r => r).length;
    const secondCorrect = secondResults.filter(r => r).length;
    const firstPercent = Math.round((firstCorrect / firstTotal) * 100);
    const secondPercent = Math.round((secondCorrect / secondTotal) * 100);
    const improvement = secondCorrect - firstCorrect;
    const improvementPercent = secondPercent - firstPercent;
    
    // 요약 정보 표시
    document.getElementById('announcementTotal').textContent = firstTotal;
    document.getElementById('announcementFirst').textContent = `${firstCorrect}/${firstTotal} (${firstPercent}%)`;
    document.getElementById('announcementSecond').textContent = `${secondCorrect}/${secondTotal} (${secondPercent}%)`;
    document.getElementById('announcementImprovement').textContent = 
        `${improvement > 0 ? '+' : ''}${improvement}문제 (${improvementPercent > 0 ? '+' : ''}${improvementPercent}%)`;
    
    // 세트별 결과 렌더링
    renderAnnouncementDetailSets(announcementComponents, firstAttemptData, firstResults, secondResults);
    
    // 화면 표시
    screen.style.display = 'block';
}

/**
 * 공지사항 세트별 결과 렌더링
 */
function renderAnnouncementDetailSets(announcementComponents, firstAttemptData, firstResults, secondResults) {
    const container = document.getElementById('announcementDetailSets');
    if (!container) return;
    
    container.innerHTML = '';
    
    // 전체 컴포넌트에서 공지사항의 시작 인덱스 찾기
    let globalQuestionIndex = 0;
    
    for (let i = 0; i < firstAttemptData.componentResults.length; i++) {
        const comp = firstAttemptData.componentResults[i];
        if (comp.componentType === 'announcement') {
            break;
        }
        globalQuestionIndex += (comp.answers || []).length;
    }
    
    // 각 세트 렌더링
    announcementComponents.forEach((component, setIndex) => {
        const setResult = {
            answers: component.answers || []
        };
        
        const html = renderAnnouncementSetResultForDetail(setResult, setIndex, globalQuestionIndex, firstResults, secondResults);
        container.innerHTML += html;
        
        globalQuestionIndex += setResult.answers.length;
    });
    
    // 오디오 리스너 설정
    setTimeout(() => {
        setupAnnouncementDetailAudioListeners();
    }, 100);
    
    // 툴팁 이벤트 리스너 추가
    setTimeout(() => {
        const highlightedWords = document.querySelectorAll('.announcement-keyword-highlight');
        highlightedWords.forEach(word => {
            word.addEventListener('mouseenter', showAnnouncementTooltip);
            word.addEventListener('mouseleave', hideAnnouncementTooltip);
        });
        console.log(`✅ 공지사항 툴팁 이벤트 리스너 추가 완료: ${highlightedWords.length}개`);
    }, 100);
}

/**
 * 공지사항 세트 렌더링
 */
function renderAnnouncementSetResultForDetail(setResult, setIdx, startGlobalIndex, firstResults, secondResults) {
    const audioId = `announcement-audio-detail-${setIdx}`;
    const setNumber = setIdx + 1;
    const questionCount = setResult.answers.length;
    const setMeta = setResult.setDescription || `안내방송 · ${questionCount}문제`;
    
    let html = `
        <div class="announce-set">
            <!-- 세트 헤더 -->
            <div class="announce-set-header">
                <span class="announce-set-badge">
                    <i class="fas fa-bullhorn"></i>
                    Announcement Set ${setNumber}
                </span>
                <span class="announce-set-meta">${setMeta}</span>
            </div>
            
            <!-- 안내문 오디오 -->
            ${setResult.answers[0].audioUrl ? `
            <div class="announce-audio-section">
                <div class="announce-audio-title">
                    <i class="fas fa-volume-up"></i>
                    <span>안내문 다시 듣기</span>
                </div>
                <div class="announce-audio-player">
                    <button class="announce-play-btn" onclick="toggleAnnouncementDetailAudio('${audioId}')">
                        <i class="fas fa-play" id="${audioId}-icon"></i>
                    </button>
                    <div class="announce-seek-container">
                        <div class="announce-seek-bar" id="${audioId}-seek" onclick="seekAnnouncementDetailAudio('${audioId}', event)">
                            <div class="announce-seek-progress" id="${audioId}-progress" style="width: 0%">
                                <div class="announce-seek-handle"></div>
                            </div>
                        </div>
                        <div class="announce-audio-time">
                            <span id="${audioId}-current">0:00</span> <span id="${audioId}-duration">0:00</span>
                        </div>
                    </div>
                    <audio id="${audioId}" src="${convertGoogleDriveUrl(setResult.answers[0].audioUrl)}"></audio>
                </div>
            </div>
            ` : ''}
            
            <!-- 전체 스크립트 -->
            ${setResult.answers[0].script ? `
            <div class="announce-script-section">
                <button class="announce-script-toggle" onclick="toggleAnnounceScriptSection('announce-script-detail-${setIdx}')">
                    <i class="fas fa-file-alt"></i>
                    <span class="toggle-text">안내문 전체 스크립트 보기</span>
                    <i class="fas fa-chevron-down" id="announce-script-detail-${setIdx}-icon"></i>
                </button>
                <div id="announce-script-detail-${setIdx}" class="announce-script-body" style="display: none;">
                    ${renderAnnouncementScriptForDetail(setResult.answers[0].script, setResult.answers[0].scriptTrans, setResult.answers[0].scriptHighlights || [])}
                </div>
            </div>
            ` : ''}
            
            <!-- 구분선: 문제 영역 -->
            <div class="announce-questions-divider">
                <span>문제 해설</span>
            </div>
    `;
    
    // 각 문제 렌더링
    setResult.answers.forEach((answer, qIdx) => {
        const globalIdx = startGlobalIndex + qIdx;
        html += renderAnnouncementAnswerForDetail(answer, qIdx, setIdx, globalIdx, firstResults, secondResults);
    });
    
    html += `
        </div>
    `;
    
    return html;
}

// 공지사항 스크립트 렌더링 (단락 구조)
function renderAnnouncementScriptForDetail(script, scriptTrans, highlights) {
    let cleanScript = script.replace(/^Woman:\s*/i, '').trim()
        .replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
    let cleanTrans = scriptTrans ? scriptTrans.replace(/\\n/g, '\n').replace(/\r\n/g, '\n') : '';
    
    let sentences = cleanScript.split(/\n\n+/).filter(s => s.trim());
    let translations = cleanTrans ? cleanTrans.split(/\n\n+/).filter(s => s.trim()) : [];
    
    if (sentences.length <= 1) {
        sentences = cleanScript.split(/(?<=[.!?])(?:\s*\n|\s{2,})/).filter(s => s.trim());
        translations = cleanTrans ? cleanTrans.split(/(?<=[.!?])(?:\s*\n|\s{2,})/).filter(s => s.trim()) : [];
    }
    if (sentences.length <= 1) {
        sentences = cleanScript.split(/(?<=[.!?])\s+/).filter(s => s.trim());
        translations = cleanTrans ? cleanTrans.split(/(?<=[.!?])\s+/).filter(s => s.trim()) : [];
    }
    
    let html = '';
    sentences.forEach((sentence, idx) => {
        const translation = translations[idx] || '';
        let highlightedText = escapeHtml(sentence).replace(/\n/g, '<br>');
        
        if (highlights && highlights.length > 0) {
            highlights.forEach(highlight => {
                const word = highlight.word || '';
                const trans = highlight.translation || '';
                const explanation = highlight.explanation || '';
                if (!word) return;
                const regex = new RegExp(`\\b(${escapeRegex(word)})\\b`, 'gi');
                highlightedText = highlightedText.replace(regex, (match) => {
                    return `<span class="announce-keyword" data-translation="${escapeHtml(trans)}" data-explanation="${escapeHtml(explanation)}">${match}</span>`;
                });
            });
        }
        
        html += `
            <div class="announce-paragraph">
                <div class="announce-paragraph-text">${highlightedText}</div>
                ${translation ? `<span class="announce-paragraph-translation">${translation.replace(/\n/g, '<br>')}</span>` : ''}
            </div>
        `;
    });
    
    return html;
}

// 공지사항 문제 렌더링 (1차/2차 비교 포함)
function renderAnnouncementAnswerForDetail(answer, qIdx, setIdx, globalIdx, firstResults, secondResults) {
    const firstCorrect = firstResults[globalIdx];
    const secondCorrect = secondResults[globalIdx];
    
    let feedbackMessage = '';
    let userAnswerClass = '';
    let showCorrectAnswer = false;
    
    if (firstCorrect && secondCorrect) {
        userAnswerClass = 'first-correct';
        feedbackMessage = '👏 1차 때부터 정확하게 맞힌 문제예요! 정말 잘했어요! 👍';
        showCorrectAnswer = false;
    } else if (!firstCorrect && secondCorrect) {
        userAnswerClass = 'improved';
        feedbackMessage = '🎯 1차에는 틀렸지만, 아무 도움 없이 스스로 고쳐 맞혔어요! 정말 대단해요! 다음엔 1차부터 맞힐 수 있을 거예요! 🚀';
        showCorrectAnswer = false;
    } else {
        userAnswerClass = 'still-wrong';
        feedbackMessage = '📝 1차, 2차 모두 틀린 문제예요. 조금 어려울 수 있으니 해설을 꼼꼼히 읽어보세요! 💪';
        showCorrectAnswer = true;
    }
    
    const correctIcon = secondCorrect 
        ? '<i class="fas fa-check-circle" style="color: var(--success-color);"></i>' 
        : '<i class="fas fa-times-circle" style="color: var(--danger-color);"></i>';
    
    let html = `
        <div class="announce-question">
            <div class="announce-question-header">
                <span class="announce-q-number">Question ${answer.questionNum}</span>
                <span class="announce-q-status">${correctIcon}</span>
            </div>
            <div class="announce-q-text">${answer.question}</div>
            ${answer.questionTrans ? `<div class="announce-q-translation">${answer.questionTrans}</div>` : ''}
            
            <div class="announce-answer-summary">
                <div class="announce-answer-row">
                    <span class="announce-answer-label">내 답변:</span>
                    <span class="announce-answer-value ${userAnswerClass}">
                        ${answer.userAnswer ? `${answer.options[answer.userAnswer - 1]}` : '미응답'}
                    </span>
                </div>
                <div class="announce-answer-row">
                    <span class="feedback-message-inline">${feedbackMessage}</span>
                </div>
                ${showCorrectAnswer ? `
                <div class="announce-answer-row">
                    <span class="announce-answer-label">정답:</span>
                    <span class="announce-answer-value correct">
                        ${answer.options[answer.correctAnswer - 1]}
                    </span>
                </div>
                ` : ''}
            </div>
            
            ${renderAnnouncementOptionsExplanationForDetail(answer, qIdx, setIdx)}
        </div>
    `;
    
    return html;
}

// 공지사항 보기 해설 렌더링
function renderAnnouncementOptionsExplanationForDetail(answer, qIdx, setIdx) {
    if (!answer.optionExplanations || answer.optionExplanations.length === 0) {
        return '';
    }
    
    const hasExplanations = answer.optionExplanations.some(exp => exp && exp.trim());
    if (!hasExplanations) {
        return '';
    }
    
    const toggleId = `announcement-detail-toggle-${setIdx}-${qIdx}`;
    
    let html = `
            <button class="announce-toggle-btn" onclick="toggleAnnouncementDetailExplanation('${toggleId}')">
                <span class="toggle-text">보기 상세 해설 펼치기</span>
                <i class="fas fa-chevron-down" id="${toggleId}-icon"></i>
            </button>
            <div id="${toggleId}" class="announce-options-details" style="display: none;">
    `;
    
    answer.options.forEach((option, idx) => {
        const optionLetter = String.fromCharCode(65 + idx);
        const isCorrect = (idx + 1) === answer.correctAnswer;
        const isUserChoice = (idx + 1) === answer.userAnswer;
        const translation = answer.optionTranslations?.[idx] || '';
        const explanation = answer.optionExplanations?.[idx] || '';
        
        html += `
            <div class="announce-option ${isCorrect ? 'correct' : ''}">
                <div class="announce-option-text"><span class="announce-option-marker">${optionLetter}</span>${option}</div>
                ${translation ? `<div class="announce-option-translation">${translation}</div>` : ''}
                ${explanation ? `
                <div class="announce-option-explanation ${isCorrect ? 'correct' : 'incorrect'}">
                    <strong>${isCorrect ? '정답 이유:' : '오답 이유:'}</strong> ${explanation}
                </div>
                ` : ''}
            </div>
        `;
    });
    
    html += `
            </div>
    `;
    
    return html;
}

// 공지사항 오디오 컨트롤
function toggleAnnouncementDetailAudio(audioId) {
    const audio = document.getElementById(audioId);
    const icon = document.getElementById(`${audioId}-icon`);
    if (!audio || !icon) return;
    
    if (audio.paused) {
        document.querySelectorAll('audio').forEach(a => {
            if (a.id !== audioId) {
                a.pause();
                const i = document.getElementById(`${a.id}-icon`);
                if (i) i.className = 'fas fa-play';
            }
        });
        audio.play();
        icon.className = 'fas fa-pause';
    } else {
        audio.pause();
        icon.className = 'fas fa-play';
    }
}

window.toggleAnnouncementDetailAudio = toggleAnnouncementDetailAudio;

function seekAnnouncementDetailAudio(audioId, event) {
    const audio = document.getElementById(audioId);
    const seekBar = document.getElementById(`${audioId}-seek`);
    if (!audio || !seekBar) return;
    
    const rect = seekBar.getBoundingClientRect();
    const pos = (event.clientX - rect.left) / rect.width;
    audio.currentTime = pos * audio.duration;
}

window.seekAnnouncementDetailAudio = seekAnnouncementDetailAudio;

function setupAnnouncementDetailAudioListeners() {
    const audios = document.querySelectorAll('[id^="announcement-audio-detail-"]');
    
    audios.forEach(audio => {
        const audioId = audio.id;
        
        audio.addEventListener('loadedmetadata', () => {
            const duration = document.getElementById(`${audioId}-duration`);
            if (duration) {
                const minutes = Math.floor(audio.duration / 60);
                const seconds = Math.floor(audio.duration % 60);
                duration.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        });
        
        audio.addEventListener('timeupdate', () => {
            const progress = document.getElementById(`${audioId}-progress`);
            const current = document.getElementById(`${audioId}-current`);
            
            if (progress && current) {
                const percent = (audio.currentTime / audio.duration) * 100;
                progress.style.width = `${percent}%`;
                
                const minutes = Math.floor(audio.currentTime / 60);
                const seconds = Math.floor(audio.currentTime % 60);
                current.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        });
        
        audio.addEventListener('ended', () => {
            const icon = document.getElementById(`${audioId}-icon`);
            if (icon) icon.className = 'fas fa-play';
        });
    });
    
    console.log(`✅ 공지사항 오디오 리스너 설정 완료: ${audios.length}개`);
}

function toggleAnnouncementDetailExplanation(toggleId) {
    const content = document.getElementById(toggleId);
    if (!content) return;
    
    const btn = content.previousElementSibling;
    const icon = btn.querySelector('i');
    const text = btn.querySelector('.toggle-text');
    
    if (content.style.display === 'none') {
        content.style.display = 'flex';
        icon.className = 'fas fa-chevron-up';
        text.textContent = '보기 상세 해설 접기';
    } else {
        content.style.display = 'none';
        icon.className = 'fas fa-chevron-down';
        text.textContent = '보기 상세 해설 펼치기';
    }
}

window.toggleAnnouncementDetailExplanation = toggleAnnouncementDetailExplanation;

// 공지사항 툴팁 표시 함수 (listening-announcement-result.js에 있는 것과 동일)
function showAnnouncementTooltip(e) {
    const translation = e.target.dataset.translation;
    const explanation = e.target.dataset.explanation;
    
    if (!translation && !explanation) return;
    
    hideAnnouncementTooltip();
    
    const tooltip = document.createElement('div');
    tooltip.className = 'announcement-tooltip';
    tooltip.innerHTML = `
        ${translation ? `<div class="tooltip-translation">${translation}</div>` : ''}
        ${explanation ? `<div class="tooltip-explanation">${explanation}</div>` : ''}
    `;
    
    document.body.appendChild(tooltip);
    
    const rect = e.target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    let top = rect.top - tooltipRect.height - 10 + window.scrollY;
    
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.opacity = '1';
}

function hideAnnouncementTooltip() {
    const existingTooltips = document.querySelectorAll('.announcement-tooltip');
    existingTooltips.forEach(tooltip => tooltip.remove());
}

/**
 * finalExplainScreen을 사용한 컨버 세부 결과 표시
 */
function showConverDetailInFinalExplain() {
    console.log('🎯 [finalExplainScreen] 컨버 세부 결과 표시');
    
    const firstAttemptData = JSON.parse(sessionStorage.getItem('listening_firstAttempt') || '{}');
    const resultData = window.currentListeningResultData;
    
    if (!resultData || !firstAttemptData.componentResults) {
        console.error('❌ 결과 데이터가 없습니다');
        alert('결과 데이터를 찾을 수 없습니다. 다시 시도해주세요.');
        return;
    }
    
    const converComponents = firstAttemptData.componentResults.filter(comp => comp.componentType === 'conver');
    const firstResults = resultData.firstAttempt.results;
    const secondResults = resultData.secondAttempt.results;
    const secondAttemptData = resultData.secondAttemptAnswers || {};
    
    let globalQuestionIndex = 0;
    const firstAttempt = [];
    const secondAttempt = [];
    
    firstAttemptData.componentResults.forEach((comp) => {
        const answers = comp.answers || [];
        answers.forEach((answer) => {
            if (comp.componentType === 'conver') {
                firstAttempt.push({ isCorrect: answer.isCorrect });
                const secondAnswerKey = `q${globalQuestionIndex}`;
                const secondAnswer = secondAttemptData[secondAnswerKey];
                secondAttempt.push({ isCorrect: secondAnswer ? secondAnswer.isCorrect : answer.isCorrect });
            }
            globalQuestionIndex++;
        });
    });
    
    const weekName = firstAttemptData.weekInfo?.weekName || 'Week 1';
    const dayName = firstAttemptData.weekInfo?.dayName || '일요일';
    
    const data = {
        week: weekName,
        day: dayName,
        moduleName: 'Listening Module 1',
        sectionName: 'Conversation',
        firstAttempt: firstAttempt,
        secondAttempt: secondAttempt,
        pageIndex: 2
    };
    
    showFinalExplainScreen(data);
    
    // converResults를 sessionStorage에 임시 저장
    const converResults = converComponents.map(comp => ({
        answers: comp.answers || []
    }));
    sessionStorage.setItem('converResults', JSON.stringify(converResults));
    
    // showConverResults() 함수 실행
    showConverResults();
    
    // converResultDetails에서 finalDetailContent로 복사
    setTimeout(() => {
        // 컨버 정답 채점 화면 숨기기
        const converResultScreen = document.getElementById('listeningConverResultScreen');
        if (converResultScreen) {
            converResultScreen.style.display = 'none';
        }
        
        const sourceContainer = document.getElementById('converResultDetails');
        const targetContainer = document.getElementById('finalDetailContent');
        
        if (sourceContainer && targetContainer) {
            targetContainer.innerHTML = sourceContainer.innerHTML;
            
            setTimeout(() => {
                initConverResultAudioListeners();
                const highlightedWords = document.querySelectorAll('.conver-keyword');
                highlightedWords.forEach(word => {
                    word.addEventListener('mouseenter', showConverTooltip);
                    word.addEventListener('mouseleave', hideConverTooltip);
                });
            }, 100);
            
            document.getElementById('finalExplainScreen').style.display = 'block';
        }
    }, 200);
}

/**
 * finalExplainScreen을 사용한 공지사항 세부 결과 표시
 */
function showAnnouncementDetailInFinalExplain() {
    console.log('🎯 [finalExplainScreen] 공지사항 세부 결과 표시');
    
    const firstAttemptData = JSON.parse(sessionStorage.getItem('listening_firstAttempt') || '{}');
    const resultData = window.currentListeningResultData;
    
    if (!resultData || !firstAttemptData.componentResults) {
        console.error('❌ 결과 데이터가 없습니다');
        alert('결과 데이터를 찾을 수 없습니다. 다시 시도해주세요.');
        return;
    }
    
    const announcementComponents = firstAttemptData.componentResults.filter(comp => comp.componentType === 'announcement');
    const firstResults = resultData.firstAttempt.results;
    const secondResults = resultData.secondAttempt.results;
    const secondAttemptData = resultData.secondAttemptAnswers || {};
    
    let globalQuestionIndex = 0;
    const firstAttempt = [];
    const secondAttempt = [];
    
    firstAttemptData.componentResults.forEach((comp) => {
        const answers = comp.answers || [];
        answers.forEach((answer) => {
            if (comp.componentType === 'announcement') {
                firstAttempt.push({ isCorrect: answer.isCorrect });
                const secondAnswerKey = `q${globalQuestionIndex}`;
                const secondAnswer = secondAttemptData[secondAnswerKey];
                secondAttempt.push({ isCorrect: secondAnswer ? secondAnswer.isCorrect : answer.isCorrect });
            }
            globalQuestionIndex++;
        });
    });
    
    const weekName = firstAttemptData.weekInfo?.weekName || 'Week 1';
    const dayName = firstAttemptData.weekInfo?.dayName || '일요일';
    
    const data = {
        week: weekName,
        day: dayName,
        moduleName: 'Listening Module 1',
        sectionName: 'Announcement',
        firstAttempt: firstAttempt,
        secondAttempt: secondAttempt,
        pageIndex: 3
    };
    
    showFinalExplainScreen(data);
    
    // announcementResults를 sessionStorage에 임시 저장
    // ★ 전체 필드 복사 (audioUrl, script, scriptHighlights 등 포함)
    const announcementResults = announcementComponents.map(comp => ({
        ...comp,
        answers: comp.answers || []
    }));
    sessionStorage.setItem('announcementResults', JSON.stringify(announcementResults));
    
    // showAnnouncementResults() 함수 실행
    showAnnouncementResults();
    
    // announcementResultDetails에서 finalDetailContent로 복사
    setTimeout(() => {
        // 공지사항 정답 채점 화면 숨기기
        const announcementResultScreen = document.getElementById('listeningAnnouncementResultScreen');
        if (announcementResultScreen) {
            announcementResultScreen.style.display = 'none';
        }
        
        const sourceContainer = document.getElementById('announcementResultDetails');
        const targetContainer = document.getElementById('finalDetailContent');
        
        if (sourceContainer && targetContainer) {
            targetContainer.innerHTML = sourceContainer.innerHTML;
            
            setTimeout(() => {
                initAnnouncementResultAudioListeners();
                const highlightedWords = document.querySelectorAll('.announcement-keyword-highlight');
                highlightedWords.forEach(word => {
                    word.addEventListener('mouseenter', showAnnouncementTooltip);
                    word.addEventListener('mouseleave', hideAnnouncementTooltip);
                });
            }, 100);
            
            document.getElementById('finalExplainScreen').style.display = 'block';
        }
    }, 200);
}

/**
 * finalExplainScreen을 사용한 렉쳐 세부 결과 표시
 */
function showLectureDetailInFinalExplain() {
    console.log('🎯 [finalExplainScreen] 렉쳐 세부 결과 표시');
    
    const firstAttemptData = JSON.parse(sessionStorage.getItem('listening_firstAttempt') || '{}');
    const resultData = window.currentListeningResultData;
    
    if (!resultData || !firstAttemptData.componentResults) {
        console.error('❌ 결과 데이터가 없습니다');
        alert('결과 데이터를 찾을 수 없습니다. 다시 시도해주세요.');
        return;
    }
    
    const lectureComponents = firstAttemptData.componentResults.filter(comp => comp.componentType === 'lecture');
    
    if (lectureComponents.length === 0) {
        alert('Lecture 데이터가 없습니다.');
        return;
    }
    
    const firstResults = resultData.firstAttempt.results;
    const secondResults = resultData.secondAttempt.results;
    const secondAttemptData = resultData.secondAttemptAnswers || {};
    
    let globalQuestionIndex = 0;
    const firstAttempt = [];
    const secondAttempt = [];
    
    firstAttemptData.componentResults.forEach((comp) => {
        const answers = comp.answers || [];
        answers.forEach((answer) => {
            if (comp.componentType === 'lecture') {
                firstAttempt.push({ isCorrect: answer.isCorrect });
                const secondAnswerKey = `q${globalQuestionIndex}`;
                const secondAnswer = secondAttemptData[secondAnswerKey];
                secondAttempt.push({ isCorrect: secondAnswer ? secondAnswer.isCorrect : answer.isCorrect });
            }
            globalQuestionIndex++;
        });
    });
    
    const weekName = firstAttemptData.weekInfo?.weekName || 'Week 1';
    const dayName = firstAttemptData.weekInfo?.dayName || '일요일';
    
    const data = {
        week: weekName,
        day: dayName,
        moduleName: 'Listening Module 1',
        sectionName: 'Lecture',
        firstAttempt: firstAttempt,
        secondAttempt: secondAttempt,
        pageIndex: 4
    };
    
    // ★ showFinalExplainScreen 호출 제거 - 직접 화면 표시
    // showFinalExplainScreen(data);
    
    // 모든 화면 숨기기
    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.display = 'none';
    });
    
    // lectureResults를 sessionStorage에 저장
    // ★ lecture 컴포넌트 전체 데이터 복사 (script, audioUrl, highlights 등 포함)
    const lectureResults = lectureComponents.map(comp => ({
        ...comp,  // 전체 필드 복사 (15개 필드)
        answers: comp.answers || []  // results를 answers로 변환
    }));
    sessionStorage.setItem('lectureResults', JSON.stringify(lectureResults));
    console.log('📦 [렉쳐 해설] lectureResults 저장 (전체 데이터):', lectureResults);
    
    // 렉쳐 결과 화면 직접 표시
    const lectureResultScreen = document.getElementById('listeningLectureResultScreen');
    if (lectureResultScreen) {
        lectureResultScreen.style.display = 'block';
        console.log('✅ [렉쳐 해설] listeningLectureResultScreen 직접 표시');
    }
    
    // showLectureResults() 함수 실행해서 데이터 채우기
    if (typeof showLectureResults === 'function') {
        showLectureResults();
        console.log('✅ [렉쳐 해설] showLectureResults 실행 완료');
    } else {
        console.error('❌ [렉쳐 해설] showLectureResults 함수 없음');
        alert('Lecture 해설 화면을 표시할 수 없습니다.');
    }
    
    // ★ 상단 통계를 1차/2차 비교 형식으로 업데이트
    const totalQuestions = firstAttempt.length;
    const firstCorrect = firstAttempt.filter(a => a.isCorrect).length;
    const secondCorrect = secondAttempt.filter(a => a.isCorrect).length;
    const improvement = secondCorrect - firstCorrect;
    const firstPercent = totalQuestions > 0 ? Math.round((firstCorrect / totalQuestions) * 100) : 0;
    const secondPercent = totalQuestions > 0 ? Math.round((secondCorrect / totalQuestions) * 100) : 0;
    const improvementPercent = secondPercent - firstPercent;
    
    const totalEl = document.getElementById('lectureResultTotalCount');
    if (totalEl) totalEl.textContent = totalQuestions;
    
    const firstEl = document.getElementById('lectureResultFirstCount');
    if (firstEl) firstEl.textContent = `${firstCorrect}/${totalQuestions} (${firstPercent}%)`;
    
    const secondEl = document.getElementById('lectureResultSecondCount');
    if (secondEl) secondEl.textContent = `${secondCorrect}/${totalQuestions} (${secondPercent}%)`;
    
    const improvementEl = document.getElementById('lectureResultImprovement');
    if (improvementEl) {
        improvementEl.textContent = improvement >= 0 
            ? `+${improvement}문제 (+${improvementPercent}%)` 
            : `${improvement}문제 (${improvementPercent}%)`;
    }
    
    console.log(`📊 [렉쳐 해설] 통계 업데이트 - 1차: ${firstCorrect}/${totalQuestions}, 2차: ${secondCorrect}/${totalQuestions}`);
}

console.log('✅ listening-retake-detail.js v20260215_010 로드 완료');
