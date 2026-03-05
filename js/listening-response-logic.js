// Listening - 응답고르기 로직 v=20250212-020
// 
// ✅ 컴포넌트화 완료!
// - ResponseComponent: 실제 문제 풀이 로직
// - 이 파일: 어댑터 + 결과 화면

console.log('🚀 [파일로드] listening-response-logic.js 로드 완료');

// ============================================
// 1. 어댑터 함수 (Component 사용)
// ============================================

let currentResponseComponent = null;

/**
 * 모듈 시스템용 초기화 함수
 */
async function initResponseComponent(setId, onCompleteCallback) {
    console.log(`📦 [모듈] initResponseComponent - setId: ${setId}`);
    
    // 기존 컴포넌트 정리
    if (currentResponseComponent) {
        console.log(`🧹 [모듈] 이전 Response Component 정리`);
        currentResponseComponent._destroyed = true;
        if (currentResponseComponent.cleanup) {
            currentResponseComponent.cleanup();
        }
        currentResponseComponent = null;
    }
    
    currentResponseComponent = new ResponseComponent(setId, {
        onComplete: (results) => {
            console.log(`✅ [모듈] Response Component 완료`);
            if (onCompleteCallback) onCompleteCallback(results);
        },
        onError: (error) => console.error(`❌ [모듈] Response Component 오류:`, error),
        onTimerStart: () => {
            console.log(`⏰ [모듈] Response 타이머 시작 (20초)`);
            if (window.moduleController) {
                window.moduleController.startQuestionTimer(20);
            }
        }
    });
    
    // 전역으로 노출 (HTML onclick에서 접근)
    window.currentResponseComponent = currentResponseComponent;
    
    await currentResponseComponent.init();
}

/**
 * 응답고르기 초기화 - Component 어댑터
 */
async function initListeningResponse(setNumber = 1) {
    console.log(`📖 [어댑터] initListeningResponse - setNumber: ${setNumber}`);
    
    // Component 생성
    currentResponseComponent = new ResponseComponent(setNumber);
    
    // 완료 콜백 설정
    currentResponseComponent.onComplete = (results) => {
        console.log(`✅ [어댑터] Component 완료 콜백 받음`);
        
        // Module 콜백이 있으면 전달
        if (window.moduleCallback) {
            window.moduleCallback(results);
        } else {
            // 일반 모드: 결과 화면 표시
            showResponseResults();
        }
    };
    
    // 타이머 시작 콜백 설정
    currentResponseComponent.onTimerStart = () => {
        console.log(`⏰ [어댑터] 타이머 시작 요청`);
        // Module이 타이머를 시작해야 하지만, 일반 모드에서는 여기서 처리 가능
    };
    
    // 전역으로 노출 (HTML onclick에서 접근)
    window.currentResponseComponent = currentResponseComponent;
    
    // 초기화
    const success = await currentResponseComponent.init();
    
    if (!success) {
        console.error('❌ [어댑터] Component 초기화 실패');
        alert('응답고르기를 시작할 수 없습니다.');
        backToSchedule();
    }
}

/**
 * 다음 문제 - Component 어댑터
 */
function nextResponseQuestion() {
    if (currentResponseComponent) {
        const hasNext = currentResponseComponent.nextQuestion();
        if (hasNext) {
            // 타이머는 컴포넌트 내부 loadQuestion()에서 오디오 완료 후 시작됨 (중복 방지)
            console.log('⏰ [어댑터] Response 다음 문제 → 타이머는 컴포넌트에서 관리');
        } else {
            // 마지막 문제 - 제출
            submitListeningResponse();
        }
    }
}

/**
 * 제출 - Component 어댑터
 */
function submitListeningResponse() {
    console.log(`📤 [어댑터] submitListeningResponse 호출`);
    
    if (currentResponseComponent) {
        currentResponseComponent.submit();
    } else {
        console.error(`❌ Component가 초기화되지 않았습니다`);
    }
}

/**
 * Cleanup - Component 어댑터
 */
function cleanupListeningResponse() {
    console.log('🧹 [어댑터] Cleanup 시작');
    
    if (currentResponseComponent) {
        currentResponseComponent.cleanup();
        currentResponseComponent = null;
    }
    
    window.currentResponseComponent = null;
    
    console.log('🧹 [어댑터] Cleanup 완료');
}

// 전역으로 노출
window.initResponseComponent = initResponseComponent;
window.initListeningResponse = initListeningResponse;

// ============================================
// 2. 결과 화면 (기존 유지)
// ============================================

// 결과 화면 표시
function showResponseResults() {
    console.log('📊 [응답고르기] 결과 화면 표시');
    
    const responseResultsStr = sessionStorage.getItem('responseResults');
    if (!responseResultsStr) {
        console.error('❌ 결과 데이터가 없습니다');
        return;
    }
    
    const responseResults = JSON.parse(responseResultsStr);
    
    // 전체 정답/오답 계산
    let totalCorrect = 0;
    let totalQuestions = 0;
    
    responseResults.forEach(setResult => {
        setResult.answers.forEach(answer => {
            totalQuestions++;
            if (answer.isCorrect) {
                totalCorrect++;
            }
        });
    });
    
    const totalIncorrect = totalQuestions - totalCorrect;
    const totalScore = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    
    console.log('📊 총 문제:', totalQuestions);
    console.log('✅ 정답:', totalCorrect);
    console.log('❌ 오답:', totalIncorrect);
    console.log('💯 점수:', totalScore + '%');
    
    // 결과 UI 업데이트
    document.getElementById('responseResultScoreValue').textContent = totalScore + '%';
    document.getElementById('responseResultCorrectCount').textContent = totalCorrect;
    document.getElementById('responseResultIncorrectCount').textContent = totalIncorrect;
    document.getElementById('responseResultTotalCount').textContent = totalQuestions;
    
    // Week/Day 정보
    const currentTest = JSON.parse(sessionStorage.getItem('currentTest') || '{"week":"Week 1","day":"월"}');
    const dayTitle = `${currentTest.week || 'Week 1'}, ${currentTest.day || '월'}요일 - 응답고르기`;
    document.getElementById('responseResultDayTitle').textContent = dayTitle;
    
    // 세부 결과 렌더링
    const detailsContainer = document.getElementById('responseResultDetails');
    let detailsHTML = '';
    
    responseResults.forEach((setResult, setIdx) => {
        detailsHTML += renderResponseSetResult(setResult, setIdx);
    });
    
    detailsContainer.innerHTML = detailsHTML;
    
    // 오디오 리스너 설정
    setTimeout(() => {
        responseResults.forEach((setResult, setIdx) => {
            setResult.answers.forEach((answer, qIdx) => {
                const audioId = `result-audio-${qIdx}`;
                setupResponseAudioListeners(audioId);
            });
        });
        console.log('✅ 응답고르기 오디오 리스너 설정 완료');
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
    
    // 결과 화면 표시
    showScreen('listeningResponseResultScreen');
    
    // 결과 데이터 정리
    sessionStorage.removeItem('responseResults');
}

// 세트별 결과 렌더링
function renderResponseSetResult(setResult, setIdx) {
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
        html += renderResponseAnswer(answer, qIdx);
    });
    
    html += `
        </div>
    `;
    
    return html;
}

// Google Drive URL을 직접 재생 가능한 URL로 변환
function convertGoogleDriveUrl(url) {
    if (!url || url === 'PLACEHOLDER') return url;
    
    // 빈 문자열이면 그대로 반환
    if (url.trim() === '') return '';
    
    // GitHub Pages 등 일반 URL이면 그대로 반환
    if (url.startsWith('http') && !url.includes('drive.google.com')) {
        return url;
    }
    
    // Google Drive 공유 링크 형식: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
    // 직접 스트리밍 형식: https://drive.google.com/uc?export=open&id=FILE_ID
    
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
        const fileId = match[1];
        return `https://drive.google.com/uc?export=open&id=${fileId}`;
    }
    
    // 이미 변환된 URL인지 확인
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) {
        const fileId = idMatch[1];
        return `https://drive.google.com/uc?export=open&id=${fileId}`;
    }
    
    return url;
}

// 문제별 결과 렌더링
function renderResponseAnswer(answer, qIdx) {
    const isCorrect = answer.isCorrect;
    const correctIcon = isCorrect 
        ? '<i class="fas fa-check-circle" style="color: var(--success-color);"></i>' 
        : '<i class="fas fa-times-circle" style="color: var(--danger-color);"></i>';
    
    const audioId = `result-audio-${qIdx}`;
    
    let html = `
        <div class="response-result-item ${isCorrect ? 'correct' : 'incorrect'}">
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
                    <button class="audio-play-btn" onclick="toggleResponseAudio('${audioId}')">
                        <i class="fas fa-play" id="${audioId}-icon"></i>
                    </button>
                    <div class="audio-seek-container">
                        <div class="audio-seek-bar" id="${audioId}-seek" onclick="seekResponseAudio('${audioId}', event)">
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
                    <span class="response-answer-value ${isCorrect ? 'correct' : 'incorrect'}">
                        ${answer.userAnswer ? answer.options[answer.userAnswer - 1] : '미응답'}
                    </span>
                </div>
                ${!isCorrect ? `
                <div class="response-answer-row">
                    <span class="response-answer-label">정답:</span>
                    <span class="response-answer-value correct">
                        ${answer.options[answer.correctAnswer - 1]}
                    </span>
                </div>
                ` : ''}
            </div>
            
            ${renderResponseOptionsExplanation(answer)}
        </div>
    `;
    
    return html;
}

// 보기 상세 해설 렌더링
function renderResponseOptionsExplanation(answer) {
    const toggleId = `response-toggle-q${answer.questionNum}`;
    
    let html = `
        <div class="options-explanation-section">
            <button class="toggle-explanation-btn" onclick="toggleResponseOptions('${toggleId}')">
                <span class="toggle-text">보기 상세 해설 펼치기</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            
            <div id="${toggleId}" class="options-details" style="display: none;">
    `;
    
    answer.options.forEach((option, idx) => {
        const isCorrect = (idx + 1) === answer.correctAnswer;
        const translation = answer.optionTranslations && answer.optionTranslations[idx] ? answer.optionTranslations[idx] : '';
        const explanation = answer.optionExplanations && answer.optionExplanations[idx] ? answer.optionExplanations[idx] : '';
        
        const optionLabel = String.fromCharCode(65 + idx); // A, B, C, D
        html += `
            <div class="option-detail ${isCorrect ? 'correct' : 'incorrect'}">
                <div class="option-text"><span class="option-marker">${optionLabel}</span>${option}</div>
                ${translation ? `<div class="option-translation">${translation}</div>` : ''}
                ${explanation ? `
                <div class="option-explanation ${isCorrect ? 'correct' : 'incorrect'}">
                    <strong>${isCorrect ? '정답 이유:' : '오답 이유:'}</strong>${explanation}
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

// Script에 툴팁 추가
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

// 정규식 특수문자 이스케이프
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// HTML 이스케이프 함수
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 툴팁 표시
function showResponseTooltip(event) {
    const word = event.target;
    const translation = word.getAttribute('data-translation');
    const explanation = word.getAttribute('data-explanation');
    
    // 기존 툴팁 제거
    const existingTooltip = document.querySelector('.response-tooltip');
    if (existingTooltip) {
        existingTooltip.remove();
    }
    
    // 새 툴팁 생성
    const tooltip = document.createElement('div');
    tooltip.className = 'response-tooltip';
    tooltip.innerHTML = `
        <div class="tooltip-translation">${translation}</div>
        ${explanation ? `<div class="tooltip-explanation">${explanation}</div>` : ''}
    `;
    
    document.body.appendChild(tooltip);
    
    // 위치 계산
    const rect = word.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
}

// 툴팁 숨기기
function hideResponseTooltip() {
    const tooltip = document.querySelector('.response-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

// 보기 해설 토글
function toggleResponseOptions(toggleId) {
    const content = document.getElementById(toggleId);
    const btn = content.previousElementSibling;
    const icon = btn.querySelector('i');
    const text = btn.querySelector('.toggle-text');
    
    if (content.style.display === 'none') {
        content.style.display = 'flex';
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

// 응답고르기 오디오 컨트롤 함수들
function toggleResponseAudio(audioId) {
    const audio = document.getElementById(audioId);
    const icon = document.getElementById(audioId + '-icon');
    
    if (!audio) {
        console.error('❌ 오디오 요소를 찾을 수 없음:', audioId);
        return;
    }
    
    if (audio.paused) {
        // 다른 모든 오디오 정지
        document.querySelectorAll('audio').forEach(a => {
            if (a.id !== audioId && !a.paused) {
                a.pause();
            }
        });
        
        // 모든 재생 버튼 초기화
        document.querySelectorAll('.audio-play-btn').forEach(btn => {
            const btnIcon = btn.querySelector('i');
            if (btnIcon) {
                btnIcon.classList.remove('fa-pause');
                btnIcon.classList.add('fa-play');
            }
        });
        
        // 현재 오디오 재생
        audio.play();
        icon.classList.remove('fa-play');
        icon.classList.add('fa-pause');
    } else {
        audio.pause();
        icon.classList.remove('fa-pause');
        icon.classList.add('fa-play');
    }
}

// 시간 포맷 함수 (초 → 분:초)
function formatResponseTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 오디오 시크바 클릭 시 이동
function seekResponseAudio(audioId, event) {
    const audio = document.getElementById(audioId);
    const seekBar = document.getElementById(audioId + '-seek');
    
    if (!audio || !seekBar) return;
    
    const rect = seekBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    
    audio.currentTime = audio.duration * percentage;
}

// 오디오 이벤트 리스너 설정
const setupResponseAudioListeners = (() => {
    const setupFlags = {};
    
    return function(audioId) {
        const audio = document.getElementById(audioId);
        const progress = document.getElementById(audioId + '-progress');
        const currentTimeEl = document.getElementById(audioId + '-current');
        const durationEl = document.getElementById(audioId + '-duration');
        const icon = document.getElementById(audioId + '-icon');
        
        if (!audio) return;
        
        // 이미 설정되었으면 다시 설정하지 않음
        if (setupFlags[audioId]) return;
        
        // 로드 완료 시 총 시간 표시
        audio.addEventListener('loadedmetadata', () => {
            if (durationEl) {
                durationEl.textContent = formatResponseTime(audio.duration);
            }
        });
        
        // 오디오 로드 가능 시점에도 시간 표시
        audio.addEventListener('canplay', () => {
            if (durationEl && audio.duration) {
                durationEl.textContent = formatResponseTime(audio.duration);
            }
        });
        
        // 재생 중 시간 업데이트
        audio.addEventListener('timeupdate', () => {
            if (currentTimeEl) {
                currentTimeEl.textContent = formatResponseTime(audio.currentTime);
            }
            if (progress && audio.duration) {
                const percentage = (audio.currentTime / audio.duration) * 100;
                progress.style.width = percentage + '%';
            }
        });
        
        // 재생 종료 시
        audio.addEventListener('ended', () => {
            if (icon) {
                icon.classList.remove('fa-pause');
                icon.classList.add('fa-play');
            }
            if (progress) {
                progress.style.width = '0%';
            }
            if (currentTimeEl) {
                currentTimeEl.textContent = '0:00';
            }
        });
        
        setupFlags[audioId] = true;
    };
})();

// 학습 일정으로 돌아가기
function backToScheduleFromResponseResult() {
    sessionStorage.removeItem('responseResults');
    backToScheduleFromResult();
}
