// ================================================
// 토론형 글쓰기 채점 화면 로직
// ================================================

/**
 * 토론형 채점 화면 표시
 * @param {Object} data - 채점 데이터
 */
function showDiscussionResult(data) {
    console.log('💬 [토론형 채점] 결과 화면 표시:', data);
    
    // 필수 데이터 확인
    if (!data) {
        console.error('❌ 채점 데이터가 없습니다.');
        return;
    }
    
    // 프로필 정보 가져오기 (data 내장 → sessionStorage → window → 기본값)
    let profiles = null;
    
    // 1) 결과 데이터에 프로필이 포함된 경우 (리플레이 시 가장 신뢰)
    if (data.profiles && data.profiles.student1 && data.profiles.student2) {
        profiles = data.profiles;
        console.log('💬 [토론형 채점] data.profiles에서 프로필 사용:', profiles.student1?.name, profiles.student2?.name);
    }
    
    // 2) sessionStorage (현재 세션에서 1차 풀이 시 저장된 것)
    if (!profiles) {
        const savedProfiles = sessionStorage.getItem('discussionProfiles');
        if (savedProfiles) {
            try { 
                profiles = JSON.parse(savedProfiles); 
                console.log('💬 [토론형 채점] sessionStorage에서 프로필 복원:', profiles.student1?.name, profiles.student2?.name);
            } catch(e) {
                console.warn('💬 [토론형 채점] sessionStorage 프로필 파싱 실패:', e);
            }
        }
    }
    
    // 3) window 전역 변수
    if (!profiles) {
        profiles = window.currentDiscussionProfiles;
        if (profiles) {
            console.log('💬 [토론형 채점] window에서 프로필 사용:', profiles.student1?.name, profiles.student2?.name);
        }
    }
    
    // 4) 기본값
    if (!profiles) {
        profiles = { student1: { name: 'Student 1' }, student2: { name: 'Student 2' } };
        console.warn('💬 [토론형 채점] 프로필 없음 - 기본값 사용');
    }
    
    // 화면 전환
    showScreen('writingDiscussionResultScreen');
    
    // 제목 업데이트
    const titleElement = document.getElementById('discussionResultTitle');
    if (titleElement) {
        titleElement.textContent = data.weekDay || 'Week 1, 월요일';
    }
    
    // 단어 수 표시
    const wordCountElement = document.getElementById('discussionResultWordCount');
    const wordCountFeedbackElement = document.getElementById('discussionWordCountFeedback');
    
    if (wordCountElement) {
        wordCountElement.textContent = data.wordCount || 0;
    }
    
    // 단어 수 피드백
    if (wordCountFeedbackElement && data.wordCount) {
        const wordCount = data.wordCount;
        let feedbackText = '';
        let feedbackClass = '';
        
        if (wordCount >= 100 && wordCount <= 120) {
            // 완벽한 범위
            feedbackText = '✨ Perfect! 최적의 단어 수입니다!';
            feedbackClass = 'perfect';
        } else if (wordCount < 100) {
            // 너무 적음
            feedbackText = '💡 100~120단어가 만점 비율이 가장 높습니다. 조금 더 작성해보세요!';
            feedbackClass = 'too-short';
        } else {
            // 너무 많음
            feedbackText = '⚠️ 너무 많은 글은 퀄리티를 낮춥니다. 100~120단어가 충분합니다!';
            feedbackClass = 'too-long';
        }
        
        wordCountFeedbackElement.textContent = feedbackText;
        wordCountFeedbackElement.className = `word-count-feedback ${feedbackClass}`;
    }
    
    // 문제 정보 표시
    if (data.question) {
        // Context
        const contextElement = document.getElementById('discussionResultContext');
        if (contextElement && data.question.classContext) {
            contextElement.textContent = data.question.classContext;
        }
        
        // Topic (이름 치환 적용)
        const topicElement = document.getElementById('discussionResultTopic');
        if (topicElement && data.question.topic) {
            topicElement.textContent = replaceStudentNamesInResult(data.question.topic, profiles);
        }
        
        // ★ 학생 의견 표시 (이름 치환 적용)
        const opinionsContainer = document.getElementById('discussionResultStudentOpinions');
        if (opinionsContainer) {
            let opinionsHtml = '';
            if (data.question.student1Opinion) {
                const s1Text = replaceStudentNamesInResult(data.question.student1Opinion, profiles);
                opinionsHtml += `
                    <div style="background:#f0f4ff; border-radius:6px; padding:10px 12px; margin-bottom:8px; border-left:3px solid #42a5f5;">
                        <div style="font-size:12px; color:#1976d2; font-weight:600; margin-bottom:4px;">🙋 ${profiles.student1.name}</div>
                        <div style="color:#444; font-size:14px; line-height:1.5;">${s1Text}</div>
                    </div>`;
            }
            if (data.question.student2Opinion) {
                const s2Text = replaceStudentNamesInResult(data.question.student2Opinion, profiles);
                opinionsHtml += `
                    <div style="background:#fff5f5; border-radius:6px; padding:10px 12px; border-left:3px solid #ef5350;">
                        <div style="font-size:12px; color:#c62828; font-weight:600; margin-bottom:4px;">🙋 ${profiles.student2.name}</div>
                        <div style="color:#444; font-size:14px; line-height:1.5;">${s2Text}</div>
                    </div>`;
            }
            opinionsContainer.innerHTML = opinionsHtml;
        }
    }
    
    // 내 답안 표시
    const userAnswerElement = document.getElementById('discussionResultUserAnswer');
    if (userAnswerElement) {
        userAnswerElement.textContent = data.userAnswer || '(답안이 없습니다)';
    }
    
    // 모범 답안 표시 (Bullet 하이라이트 추가)
    const sampleAnswerElement = document.getElementById('discussionResultSampleAnswer');
    if (sampleAnswerElement && data.question && data.question.sampleAnswer) {
        // <br> 태그를 실제 줄바꿈으로 변환
        let formattedAnswer = data.question.sampleAnswer.replace(/<br\s*\/?>/gi, '\n');
        
        // 학생 이름 치환
        formattedAnswer = replaceStudentNamesInResult(formattedAnswer, profiles);
        
        // Bullet 하이라이트 추가
        if (data.question.bullets && Array.isArray(data.question.bullets)) {
            // bullets를 역순으로 처리 (긴 텍스트 먼저 처리해야 짧은 텍스트에 포함되는 문제 방지)
            const sortedBullets = [...data.question.bullets].sort((a, b) => {
                return (b.sentence?.length || 0) - (a.sentence?.length || 0);
            });
            
            sortedBullets.forEach(bullet => {
                if (bullet.sentence) {
                    // <br> 태그를 줄바꿈으로 변환한 sentence 텍스트
                    const sentenceText = bullet.sentence.replace(/<br\s*\/?>/gi, '\n');
                    
                    // 학생 이름 치환
                    const replacedSentence = replaceStudentNamesInResult(sentenceText, profiles);
                    
                    // 모범 답안에서 해당 부분을 찾아 하이라이트 마커 추가
                    if (formattedAnswer.includes(replacedSentence)) {
                        formattedAnswer = formattedAnswer.replace(
                            replacedSentence,
                            `{{HIGHLIGHT_START_${bullet.bulletNum}}}${replacedSentence}{{HIGHLIGHT_END_${bullet.bulletNum}}}`
                        );
                    }
                }
            });
        }
        
        // 텍스트로 설정 후 하이라이트를 HTML로 변환
        sampleAnswerElement.textContent = formattedAnswer;
        let htmlContent = sampleAnswerElement.innerHTML;
        
        // 하이라이트 마커를 실제 HTML 요소로 변환 (최대 8개)
        for (let i = 1; i <= 8; i++) {
            const regex = new RegExp(`\\{\\{HIGHLIGHT_START_${i}\\}\\}([\\s\\S]*?)\\{\\{HIGHLIGHT_END_${i}\\}\\}`, 'g');
            htmlContent = htmlContent.replace(
                regex,
                `<span class="bullet-highlight" data-bullet="${i}" onclick="showDiscussionBulletFeedback(${i})">$1</span>`
            );
        }
        
        sampleAnswerElement.innerHTML = htmlContent;
    }
    
    // Bullet 피드백 데이터 저장 (전역 변수로)
    window.discussionBulletsData = data.question && data.question.bullets ? data.question.bullets : [];
    
    // 피드백 박스는 처음에 숨김
    const bulletsElement = document.getElementById('discussionResultBullets');
    if (bulletsElement) {
        bulletsElement.classList.remove('show');
        bulletsElement.innerHTML = '';
    }
}

/**
 * Bullet 피드백 표시 (하이라이트 클릭 시)
 * @param {number} bulletNum - Bullet 번호 (1, 2, 3)
 */
function showDiscussionBulletFeedback(bulletNum) {
    console.log(`🎯 Bullet ${bulletNum} 클릭됨`);
    
    const bulletsElement = document.getElementById('discussionResultBullets');
    if (!bulletsElement || !window.discussionBulletsData) return;
    
    // 해당 Bullet 찾기
    const bullet = window.discussionBulletsData.find(b => b.bulletNum === bulletNum);
    if (!bullet) return;
    
    // 모든 하이라이트의 active 클래스 제거
    document.querySelectorAll('.bullet-highlight').forEach(highlight => {
        highlight.classList.remove('active');
    });
    
    // 클릭한 하이라이트에 active 클래스 추가
    event.target.classList.add('active');
    
    // Bullet 피드백 HTML 생성 (sentence, ets, strategy만 표시)
    const bulletHtml = `
        <div class="bullet-item">
            <div class="bullet-header">
                <span class="bullet-number">📝 문장 ${bullet.bulletNum}</span>
            </div>
            <div class="bullet-content">
                <div class="bullet-section">
                    <div class="bullet-label">✅ ETS가 요구하는 필수 요소</div>
                    <div class="bullet-text">${bullet.ets}</div>
                </div>
                <div class="bullet-section">
                    <div class="bullet-label">🎯 효과적인 작성 전략</div>
                    <div class="bullet-text strategy-text">${bullet.strategy}</div>
                </div>
            </div>
        </div>
    `;
    
    bulletsElement.innerHTML = bulletHtml;
    bulletsElement.classList.add('show');
    
    // 피드백 박스로 부드럽게 스크롤
    setTimeout(() => {
        bulletsElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

/**
 * 문제 보기 토글
 */
function toggleDiscussionProblem() {
    const problemDiv = document.getElementById('discussionResultProblem');
    const toggleIcon = document.getElementById('discussionProblemToggleIcon');
    const toggleButton = document.querySelector('.discussion-result-toggle');
    
    if (problemDiv && toggleIcon) {
        if (problemDiv.style.display === 'none') {
            problemDiv.style.display = 'block';
            toggleIcon.classList.add('fa-chevron-up');
            toggleIcon.classList.remove('fa-chevron-down');
            if (toggleButton) toggleButton.classList.add('active');
        } else {
            problemDiv.style.display = 'none';
            toggleIcon.classList.add('fa-chevron-down');
            toggleIcon.classList.remove('fa-chevron-up');
            if (toggleButton) toggleButton.classList.remove('active');
        }
    }
}

/**
 * 학생 이름 치환 함수 (채점 화면용)
 * @param {string} text - 치환할 텍스트
 * @param {Object} profiles - 학생 프로필 정보
 * @returns {string} - 치환된 텍스트
 */
function replaceStudentNamesInResult(text, profiles) {
    if (!text) return text;
    
    // {name1} → 학생1 이름, {name2} → 학생2 이름
    return text
        .replace(/\{name1\}/g, profiles.student1.name)
        .replace(/\{name2\}/g, profiles.student2.name);
}
