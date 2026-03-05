// ================================================
// 이메일 작성 채점 화면 로직
// ================================================

/**
 * 이메일 채점 화면 표시
 * @param {Object} data - 채점 데이터
 */
function showEmailResult(data) {
    console.log('📧 [이메일 채점] 결과 화면 표시:', data);
    
    // 필수 데이터 확인
    if (!data) {
        console.error('❌ 채점 데이터가 없습니다.');
        return;
    }
    
    // 화면 전환
    showScreen('writingEmailResultScreen');
    
    // 제목 업데이트
    const titleElement = document.getElementById('emailResultTitle');
    if (titleElement) {
        titleElement.textContent = data.weekDay || 'Week 1, 월요일';
    }
    
    // 단어 수 표시
    const wordCountElement = document.getElementById('emailResultWordCount');
    const wordCountFeedbackElement = document.getElementById('emailWordCountFeedback');
    
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
        // Scenario
        const situationElement = document.getElementById('emailResultSituation');
        if (situationElement && (data.question.scenario || data.question.situation)) {
            situationElement.textContent = data.question.scenario || data.question.situation;
        }
        
        // Task
        const taskElement = document.getElementById('emailResultTask');
        if (taskElement && data.question.task) {
            taskElement.textContent = data.question.task;
        }
        
        // Instructions
        if (data.question.instructions && Array.isArray(data.question.instructions)) {
            data.question.instructions.forEach((instruction, index) => {
                const instructionElement = document.getElementById(`emailResultInstruction${index + 1}`);
                if (instructionElement) {
                    instructionElement.textContent = instruction;
                }
            });
        }
        
        // To
        const toElement = document.getElementById('emailResultTo');
        if (toElement && data.question.to) {
            toElement.textContent = data.question.to;
        }
        
        // Subject
        const subjectElement = document.getElementById('emailResultSubject');
        if (subjectElement && data.question.subject) {
            subjectElement.textContent = data.question.subject;
        }
    }
    
    // 내 답안 표시
    const userAnswerElement = document.getElementById('emailResultUserAnswer');
    if (userAnswerElement) {
        userAnswerElement.textContent = data.userAnswer || '(답안이 없습니다)';
    }
    
    // 내 답안 메타 정보 (To, Subject)
    const userToElement = document.getElementById('emailResultUserTo');
    const userSubjectElement = document.getElementById('emailResultUserSubject');
    if (userToElement && data.question && data.question.to) {
        userToElement.textContent = data.question.to;
    }
    if (userSubjectElement && data.question && data.question.subject) {
        userSubjectElement.textContent = data.question.subject;
    }
    
    // 모범 답안 표시 (Bullet 하이라이트 추가)
    const sampleAnswerElement = document.getElementById('emailResultSampleAnswer');
    if (sampleAnswerElement && data.question && data.question.sampleAnswer) {
        // <br> 태그를 실제 줄바꿈으로 변환
        let formattedAnswer = data.question.sampleAnswer.replace(/<br\s*\/?>/gi, '\n');
        
        // Bullet 하이라이트 추가
        if (data.question.bullets && Array.isArray(data.question.bullets)) {
            // bullets를 역순으로 처리 (긴 텍스트 먼저 처리해야 짧은 텍스트에 포함되는 문제 방지)
            const sortedBullets = [...data.question.bullets].sort((a, b) => {
                return (b.sample?.length || 0) - (a.sample?.length || 0);
            });
            
            sortedBullets.forEach(bullet => {
                if (bullet.sample) {
                    // <br> 태그를 줄바꿈으로 변환한 sample 텍스트
                    const sampleText = bullet.sample.replace(/<br\s*\/?>/gi, '\n');
                    
                    // 모범 답안에서 해당 부분을 찾아 하이라이트 마커 추가
                    if (formattedAnswer.includes(sampleText)) {
                        formattedAnswer = formattedAnswer.replace(
                            sampleText,
                            `{{HIGHLIGHT_START_${bullet.bulletNum}}}${sampleText}{{HIGHLIGHT_END_${bullet.bulletNum}}}`
                        );
                    }
                }
            });
        }
        
        // 텍스트로 설정 후 하이라이트를 HTML로 변환
        sampleAnswerElement.textContent = formattedAnswer;
        let htmlContent = sampleAnswerElement.innerHTML;
        
        // 하이라이트 마커를 실제 HTML 요소로 변환
        for (let i = 1; i <= 3; i++) {
            const regex = new RegExp(`\\{\\{HIGHLIGHT_START_${i}\\}\\}([\\s\\S]*?)\\{\\{HIGHLIGHT_END_${i}\\}\\}`, 'g');
            htmlContent = htmlContent.replace(
                regex,
                `<span class="bullet-highlight" data-bullet="${i}" onclick="showBulletFeedback(${i})">$1</span>`
            );
        }
        
        sampleAnswerElement.innerHTML = htmlContent;
    }
    
    // 모범 답안 메타 정보 (To, Subject)
    const sampleToElement = document.getElementById('emailResultSampleTo');
    const sampleSubjectElement = document.getElementById('emailResultSampleSubject');
    if (sampleToElement && data.question && data.question.to) {
        sampleToElement.textContent = data.question.to;
    }
    if (sampleSubjectElement && data.question && data.question.subject) {
        sampleSubjectElement.textContent = data.question.subject;
    }
    
    // Bullet 피드백 데이터 저장 (전역 변수로)
    window.emailBulletsData = data.question && data.question.bullets ? data.question.bullets : [];
    
    // 피드백 박스는 처음에 숨김
    const bulletsElement = document.getElementById('emailResultBullets');
    if (bulletsElement) {
        bulletsElement.classList.remove('show');
        bulletsElement.innerHTML = '';
    }
}

/**
 * Bullet 피드백 표시 (하이라이트 클릭 시)
 * @param {number} bulletNum - Bullet 번호 (1, 2, 3)
 */
function showBulletFeedback(bulletNum) {
    console.log(`🎯 Bullet ${bulletNum} 클릭됨`);
    
    const bulletsElement = document.getElementById('emailResultBullets');
    if (!bulletsElement || !window.emailBulletsData) return;
    
    // 해당 Bullet 찾기
    const bullet = window.emailBulletsData.find(b => b.bulletNum === bulletNum);
    if (!bullet) return;
    
    // 모든 하이라이트의 active 클래스 제거
    document.querySelectorAll('.bullet-highlight').forEach(highlight => {
        highlight.classList.remove('active');
    });
    
    // 클릭한 하이라이트에 active 클래스 추가
    event.target.classList.add('active');
    
    // Bullet 피드백 HTML 생성 (모범답안 해당 부분 제외)
    const bulletHtml = `
        <div class="bullet-item">
            <div class="bullet-header">
                <span class="bullet-number">Bullet ${bullet.bulletNum}</span>
            </div>
            <div class="bullet-content">
                <div class="bullet-section">
                    <div class="bullet-label">📌 꼭 말해야하는 부분</div>
                    <div class="bullet-text">${bullet.must}</div>
                </div>
                <div class="bullet-section">
                    <div class="bullet-label">⭐ 만점 포인트들</div>
                    <div class="bullet-text">${bullet.points}</div>
                </div>
                <div class="bullet-section">
                    <div class="bullet-label">🔑 핵심</div>
                    <div class="bullet-text key-text">${bullet.key}</div>
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
function toggleEmailProblem() {
    const problemDiv = document.getElementById('emailResultProblem');
    const toggleIcon = document.getElementById('emailProblemToggleIcon');
    const toggleButton = document.querySelector('.email-result-toggle');
    
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
