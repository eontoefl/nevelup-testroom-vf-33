// Listening - 공지사항 채점 화면 로직 (컨버와 동일)

// 결과 화면 표시
// @param {Array} data - 세트별 결과 배열 (explain-viewer.js에서 전달)
function showAnnouncementResults(data) {
    console.log('📊 [공지사항] 결과 화면 표시');
    
    if (!data) {
        console.error('❌ 결과 데이터가 없습니다');
        return;
    }
    
    const announcementResults = data;
    
    // 전체 정답/오답 계산
    let totalCorrect = 0;
    let totalQuestions = 0;
    
    announcementResults.forEach(setResult => {
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
    document.getElementById('announcementResultScoreValue').textContent = totalScore + '%';
    document.getElementById('announcementResultCorrectCount').textContent = totalCorrect;
    document.getElementById('announcementResultIncorrectCount').textContent = totalIncorrect;
    document.getElementById('announcementResultTotalCount').textContent = totalQuestions;
    
    // Week/Day 정보
    const week = window.currentTest ? window.currentTest.currentWeek : 1;
    const day = window.currentTest ? window.currentTest.currentDay : '월';
    const dayTitle = `Week ${week}, ${day}요일 - 공지사항`;
    document.getElementById('announcementResultDayTitle').textContent = dayTitle;
    
    // 세부 결과 렌더링
    const detailsContainer = document.getElementById('announcementResultDetails');
    let detailsHTML = '';
    
    announcementResults.forEach((setResult, setIdx) => {
        detailsHTML += renderAnnouncementSetResult(setResult, setIdx);
    });
    
    detailsContainer.innerHTML = detailsHTML;
    
    // 오디오 리스너 초기화 (DOM 렌더링 후)
    setTimeout(() => {
        console.log('🔧 오디오 리스너 초기화 시작...');
        initAnnouncementResultAudioListeners();
        console.log('✅ 오디오 리스너 초기화 완료');
        
        // 툴팁 이벤트 리스너 추가
        const highlightedWords = document.querySelectorAll('.announce-keyword');
        highlightedWords.forEach(word => {
            word.addEventListener('mouseenter', showAnnouncementTooltip);
            word.addEventListener('mouseleave', hideAnnouncementTooltip);
        });
        console.log(`✅ 툴팁 이벤트 리스너 추가 완료: ${highlightedWords.length}개`);
        
        // 초기화 후 결과 데이터 정리 완료
    }, 500); // 300ms → 500ms로 증가
}

// 세트별 결과 렌더링
function renderAnnouncementSetResult(setResult, setIdx) {
    const audioId = `announcement-main-audio-${setIdx}`;
    
    // audioUrl: 세트 레벨 또는 answer[0] 레벨 모두 확인
    const audioUrl = setResult.audioUrl || (setResult.answers[0] && setResult.answers[0].audioUrl) || '';
    const script = setResult.script || (setResult.answers[0] && setResult.answers[0].script) || '';
    const scriptTrans = setResult.scriptTrans || (setResult.answers[0] && setResult.answers[0].scriptTrans) || '';
    const scriptHighlights = setResult.scriptHighlights || (setResult.answers[0] && setResult.answers[0].scriptHighlights) || [];
    
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
            ${audioUrl ? `
            <div class="announce-audio-section">
                <div class="announce-audio-title">
                    <i class="fas fa-volume-up"></i>
                    <span>안내문 다시 듣기</span>
                </div>
                <div class="announce-audio-player">
                    <button class="announce-play-btn" onclick="toggleAnnouncementAudio('${audioId}')">
                        <i class="fas fa-play" id="${audioId}-icon"></i>
                    </button>
                    <div class="announce-seek-container">
                        <div class="announce-seek-bar" id="${audioId}-seek" onclick="seekAnnouncementAudio('${audioId}', event)">
                            <div class="announce-seek-progress" id="${audioId}-progress" style="width: 0%">
                                <div class="announce-seek-handle"></div>
                            </div>
                        </div>
                        <div class="announce-audio-time">
                            <span id="${audioId}-current">0:00</span> <span id="${audioId}-duration">0:00</span>
                        </div>
                    </div>
                    <audio id="${audioId}" src="${audioUrl}"></audio>
                </div>
            </div>
            ` : ''}
            
            <!-- 전체 스크립트 -->
            ${script ? `
            <div class="announce-script-section">
                <button class="announce-script-toggle" onclick="toggleAnnounceScriptSection('announce-script-${setIdx}')">
                    <i class="fas fa-file-alt"></i>
                    <span class="toggle-text">안내문 전체 스크립트 보기</span>
                    <i class="fas fa-chevron-down" id="announce-script-${setIdx}-icon"></i>
                </button>
                <div id="announce-script-${setIdx}" class="announce-script-body" style="display: none;">
                    ${renderAnnouncementScript(script, scriptTrans, scriptHighlights)}
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
        html += renderAnnouncementAnswer(answer, qIdx, setIdx);
    });
    
    // 안내문 요약 (데이터에 summaryText가 있는 경우)
    if (setResult.summaryText) {
        html += `
            <div class="announce-summary-section">
                <div class="announce-summary-title">
                    <i class="fas fa-lightbulb"></i>
                    <span>안내문 핵심 포인트</span>
                </div>
                <div class="announce-summary-text">${setResult.summaryText}</div>
                ${setResult.keyPoints ? `
                <div class="announce-key-points">
                    ${setResult.keyPoints.map(point => `<div class="announce-key-point">${point}</div>`).join('')}
                </div>
                ` : ''}
            </div>
        `;
    }
    
    html += `
        </div>
    `;
    
    return html;
}

// 스크립트 렌더링 (안내문 단락 구조)
function renderAnnouncementScript(script, scriptTrans, scriptHighlights = []) {
    if (!script) return '';
    
    // "Woman:" 제거 + \n 처리
    let cleanScript = script.replace(/^Woman:\s*/i, '').trim()
        .replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
    
    // 한국어 번역 \n 처리
    let cleanTrans = scriptTrans ? scriptTrans.replace(/\\n/g, '\n').replace(/\r\n/g, '\n') : '';
    
    // 단락(\n\n) 기준 분리 → 실패 시 문장 기준 폴백
    let sentences = cleanScript.split(/\n\n+/).filter(s => s.trim());
    let translations = cleanTrans ? cleanTrans.split(/\n\n+/).filter(s => s.trim()) : [];
    
    // 단락 분리가 안 되면 문장 기준 폴백
    if (sentences.length <= 1) {
        sentences = cleanScript.split(/(?<=[.!?])(?:\s*\n|\s{2,})/).filter(s => s.trim());
        translations = cleanTrans ? cleanTrans.split(/(?<=[.!?])(?:\s*\n|\s{2,})/).filter(s => s.trim()) : [];
    }
    if (sentences.length <= 1) {
        sentences = cleanScript.split(/(?<=[.!?])\s+/).filter(s => s.trim());
        translations = cleanTrans ? cleanTrans.split(/(?<=[.!?])\s+/).filter(s => s.trim()) : [];
    }
    
    let html = '';
    
    // 각 문장마다 단락 구조로 표시
    sentences.forEach((sentence, index) => {
        const translation = translations[index] || '';
        
        html += `
            <div class="announce-paragraph">
                <div class="announce-paragraph-text">
                    ${highlightAnnouncementScript(sentence.replace(/\n/g, '<br>'), scriptHighlights)}
                </div>
                ${translation ? `<span class="announce-paragraph-translation">${translation.replace(/\n/g, '<br>')}</span>` : ''}
            </div>
        `;
    });
    
    return html;
}

// Script에 툴팁 추가
function highlightAnnouncementScript(scriptText, highlights) {
    // highlights가 문자열이면 파싱
    if (typeof highlights === 'string' && highlights.length > 0) {
        try {
            highlights = highlights.split('##').map(function(item) {
                var parts = item.split('::');
                return {
                    word: (parts[0] || '').trim(),
                    translation: (parts[1] || '').trim(),
                    explanation: (parts[2] || '').trim()
                };
            });
        } catch(e) {
            highlights = [];
        }
    }
    
    if (!highlights || !Array.isArray(highlights) || highlights.length === 0) {
        return escapeHtml_announcement(scriptText);
    }
    
    let highlightedText = escapeHtml_announcement(scriptText);
    
    // 각 하이라이트 단어/구문에 대해 처리
    highlights.forEach((highlight, index) => {
        const word = highlight.word || '';
        const translation = highlight.translation || '';
        const explanation = highlight.explanation || '';
        
        if (!word) return;
        
        // 단어/구문을 찾아서 하이라이트 추가
        const regex = new RegExp(`\\b(${escapeRegex_announcement(word)})\\b`, 'gi');
        const beforeReplace = highlightedText;
        highlightedText = highlightedText.replace(regex, (match) => {
            return `<span class="announce-keyword" data-translation="${escapeHtml_announcement(translation)}" data-explanation="${escapeHtml_announcement(explanation)}">${match}</span>`;
        });
    });
    
    return highlightedText;
}

// 문제별 답안 렌더링
function renderAnnouncementAnswer(answer, qIdx, setIdx) {
    const isCorrect = answer.isCorrect;
    const statusClass = isCorrect ? 'correct' : 'incorrect';
    const statusIcon = isCorrect ? 'fa-check-circle' : 'fa-times-circle';
    const statusText = isCorrect ? '정답' : '오답';
    
    // 옵션 A, B, C, D 레이블
    const optionLabels = ['A', 'B', 'C', 'D'];
    
    const correctIcon = isCorrect 
        ? '<i class="fas fa-check-circle" style="color: #77bf7e;"></i>' 
        : '<i class="fas fa-times-circle" style="color: #e74c5e;"></i>';
    
    return `
        <div class="announce-question">
            <div class="announce-question-header">
                <span class="announce-q-number">Question ${answer.questionNum || (qIdx + 1)}</span>
                <span class="announce-q-status">${correctIcon}</span>
            </div>
            <div class="announce-q-text">${answer.questionText || ''}</div>
            ${answer.questionTrans ? `<div class="announce-q-translation">${answer.questionTrans}</div>` : ''}
            
            <div class="announce-answer-summary">
                <div class="announce-answer-row">
                    <span class="announce-answer-label">내 답변:</span>
                    <span class="announce-answer-value ${isCorrect ? 'correct' : 'incorrect'}">${answer.userAnswer ? answer.options[answer.userAnswer - 1] : '미선택'}</span>
                </div>
                <div class="announce-answer-row">
                    <span class="announce-answer-label">정답:</span>
                    <span class="announce-answer-value correct">${answer.options[(answer.correctAnswer || 1) - 1]}</span>
                </div>
            </div>
            
            ${renderAnnouncementOptionsExplanation(answer, qIdx, setIdx)}
        </div>
    `;
}

// 선택지 설명 렌더링
function renderAnnouncementOptionsExplanation(answer, qIdx, setIdx) {
    const optionLabels = ['A', 'B', 'C', 'D'];
    const options = answer.options || [];
    
    if (!options.length) return '';
    
    const toggleId = `announce-toggle-q${setIdx || 0}-${qIdx || 0}`;
    
    let optionsHtml = '';
    options.forEach((option, idx) => {
        const isCorrect = (idx + 1) === answer.correctAnswer;
        const translation = (answer.optionTranslations || [])[idx] || '';
        const explanation = (answer.optionExplanations || [])[idx] || '';
        const optionLetter = optionLabels[idx];
        
        optionsHtml += `
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
    
    return `
            <button class="announce-toggle-btn" onclick="toggleAnnouncementExplanationById('${toggleId}')">
                <span class="toggle-text">보기 상세 해설 펼치기</span>
                <i class="fas fa-chevron-down" id="${toggleId}-icon"></i>
            </button>
            <div id="${toggleId}" class="announce-options-details" style="display: none;">
                ${optionsHtml}
            </div>
    `;
}

// 툴팁 표시
function showAnnouncementTooltip(e) {
    const translation = e.target.dataset.translation;
    const explanation = e.target.dataset.explanation;
    
    if (!translation && !explanation) return;
    
    // 기존 툴팁 제거
    hideAnnouncementTooltip();
    
    // 툴팁 생성
    const tooltip = document.createElement('div');
    tooltip.className = 'announcement-tooltip';
    tooltip.innerHTML = `
        ${translation ? `<div class="tooltip-translation">${translation}</div>` : ''}
        ${explanation ? `<div class="tooltip-explanation">${explanation}</div>` : ''}
    `;
    
    document.body.appendChild(tooltip);
    
    // 위치 계산
    const rect = e.target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    let top = rect.top - tooltipRect.height - 10 + window.scrollY;
    
    // 화면 밖으로 나가지 않도록 조정
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.opacity = '1';
}

// 해설 토글 (ID 기반)
function toggleAnnouncementExplanationById(toggleId) {
    const content = document.getElementById(toggleId);
    const icon = document.getElementById(toggleId + '-icon');
    const btn = content.previousElementSibling;
    const text = btn.querySelector('.toggle-text');
    
    if (content.style.display === 'none') {
        content.style.display = 'flex';
        if (icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
        if (text) text.textContent = '보기 상세 해설 접기';
    } else {
        content.style.display = 'none';
        if (icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
        if (text) text.textContent = '보기 상세 해설 펼치기';
    }
}

// 스크립트 토글
function toggleAnnounceScriptSection(scriptId) {
    const content = document.getElementById(scriptId);
    const icon = document.getElementById(scriptId + '-icon');
    const btn = content.previousElementSibling;
    const text = btn.querySelector('.toggle-text');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        if (icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
        if (text) text.textContent = '안내문 전체 스크립트 접기';
    } else {
        content.style.display = 'none';
        if (icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
        if (text) text.textContent = '안내문 전체 스크립트 보기';
    }
}


// 툴팁 숨기기
function hideAnnouncementTooltip() {
    const existingTooltips = document.querySelectorAll('.announcement-tooltip');
    existingTooltips.forEach(tooltip => tooltip.remove());
}

// 오디오 재생/일시정지
function toggleAnnouncementAudio(audioId) {
    const audio = document.getElementById(audioId);
    const icon = document.getElementById(`${audioId}-icon`);
    
    if (!audio) return;
    
    if (audio.paused) {
        // 모든 오디오 정지
        document.querySelectorAll('audio').forEach(a => {
            if (a.id !== audioId) {
                a.pause();
                const otherIcon = document.getElementById(`${a.id}-icon`);
                if (otherIcon) {
                    otherIcon.classList.remove('fa-pause');
                    otherIcon.classList.add('fa-play');
                }
            }
        });
        
        audio.play();
        icon.classList.remove('fa-play');
        icon.classList.add('fa-pause');
    } else {
        audio.pause();
        icon.classList.remove('fa-pause');
        icon.classList.add('fa-play');
    }
}

// 오디오 시크
function seekAnnouncementAudio(audioId, event) {
    const audio = document.getElementById(audioId);
    const seekBar = document.getElementById(`${audioId}-seek`);
    
    if (!audio || !seekBar) return;
    
    const rect = seekBar.getBoundingClientRect();
    const pos = (event.clientX - rect.left) / rect.width;
    audio.currentTime = pos * audio.duration;
}

// 오디오 이벤트 리스너 초기화
function initAnnouncementResultAudioListeners() {
    const audios = document.querySelectorAll('audio[id^="announcement-main-audio-"]');
    
    audios.forEach((audio) => {
        const audioId = audio.id;
        
        const progressBar = document.getElementById(`${audioId}-progress`);
        const currentTimeSpan = document.getElementById(`${audioId}-current`);
        const durationSpan = document.getElementById(`${audioId}-duration`);
        
        // 재생 시간 업데이트
        audio.addEventListener('timeupdate', () => {
            if (audio.duration) {
                const progress = (audio.currentTime / audio.duration) * 100;
                if (progressBar) progressBar.style.width = progress + '%';
                if (currentTimeSpan) {
                    currentTimeSpan.textContent = formatAnnouncementTime(audio.currentTime);
                }
            }
        });
        
        // 메타데이터 로드 (재생 시간 표시)
        audio.addEventListener('loadedmetadata', () => {
            if (durationSpan) durationSpan.textContent = formatAnnouncementTime(audio.duration);
        });
        
        // 이미 로드된 경우 즉시 duration 표시
        if (audio.readyState >= 1 && audio.duration) {
            if (durationSpan) durationSpan.textContent = formatAnnouncementTime(audio.duration);
        } else {
            audio.load();
        }
        
        // 재생 종료
        audio.addEventListener('ended', () => {
            const icon = document.getElementById(`${audioId}-icon`);
            if (icon) {
                icon.classList.remove('fa-pause');
                icon.classList.add('fa-play');
            }
        });
    });
}

// 시간 포맷팅
function formatAnnouncementTime(seconds) {
    if (isNaN(seconds) || seconds === Infinity) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// HTML 이스케이프
function escapeHtml_announcement(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 정규표현식 이스케이프
function escapeRegex_announcement(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


