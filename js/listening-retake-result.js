// Listening Module - 2차 결과 화면 로직
// 리딩 모듈의 reading-retake-result.js와 동일한 구조

/**
 * 리스닝 2차 결과 화면 표시
 * @param {Object} resultData - { firstAttempt, secondAttempt, improvement, secondAttemptAnswers }
 */
function showListeningRetakeResult(resultData) {
    console.log('📊 [리스닝 2차 결과] 화면 표시 시작', resultData);
    console.log('  - secondAttemptAnswers:', resultData.secondAttemptAnswers);
    console.log('  - secondAttemptAnswers 키 개수:', Object.keys(resultData.secondAttemptAnswers || {}).length);
    
    // ✅ secondAttemptAnswers와 resultData를 전역으로 저장
    window.currentListeningSecondAttemptAnswers = resultData.secondAttemptAnswers || {};
    window.currentListeningResultData = resultData;
    
    // 화면 전환
    document.querySelectorAll('.screen, .result-screen, .test-screen').forEach(screen => {
        screen.style.display = 'none';
    });
    document.getElementById('listeningRetakeResultScreen').style.display = 'block';
    
    // 데이터 렌더링
    renderListeningQuestionComparison(resultData);
    renderListeningStatsComparison(resultData);
    renderListeningMotivationMessage(resultData);
}

// ✅ 즉시 전역으로 노출
window.showListeningRetakeResult = showListeningRetakeResult;
console.log('✅ listening-retake-result.js v20260215_004 로드 완료');

/**
 * 32문제 O/X 비교표 렌더링
 */
function renderListeningQuestionComparison(resultData) {
    const totalQuestions = 32;
    const firstResults = resultData.firstAttempt.results; // [true, false, ...]
    const secondResults = resultData.secondAttempt.results; // [true, true, ...]
    
    // 문제번호 생성
    const questionNumbersEl = document.getElementById('listeningQuestionNumbers');
    questionNumbersEl.innerHTML = '';
    for (let i = 1; i <= totalQuestions; i++) {
        const numEl = document.createElement('div');
        numEl.className = 'question-number';
        numEl.textContent = i;
        questionNumbersEl.appendChild(numEl);
    }
    
    // 1차 결과
    const firstResultsEl = document.getElementById('listeningFirstAttemptResults');
    firstResultsEl.innerHTML = '';
    firstResults.forEach((isCorrect) => {
        const resultEl = document.createElement('div');
        resultEl.className = `question-result ${isCorrect ? 'correct' : 'incorrect'}`;
        resultEl.textContent = isCorrect ? '✓' : '✗';
        firstResultsEl.appendChild(resultEl);
    });
    
    // 2차 결과 (상태 표시 포함 - 개선 / 여전히 틀림만)
    const secondResultsEl = document.getElementById('listeningSecondAttemptResults');
    secondResultsEl.innerHTML = '';
    secondResults.forEach((isCorrect, index) => {
        const resultEl = document.createElement('div');
        const firstCorrect = firstResults[index];
        const secondCorrect = secondResults[index];
        
        // 상태 결정 (2가지만)
        let statusClass = '';
        if (!firstCorrect && secondCorrect) {
            statusClass = 'improved'; // ✗ → ✓
        } else if (!firstCorrect && !secondCorrect) {
            statusClass = 'still-wrong'; // ✗ → ✗
        }
        // ✓ → ✓ 는 아무 상태 없음 (1차에 맞아서 2차에 안 풀음)
        
        resultEl.className = `question-result ${secondCorrect ? 'correct' : 'incorrect'} ${statusClass}`;
        resultEl.textContent = secondCorrect ? '✓' : '✗';
        secondResultsEl.appendChild(resultEl);
    });
}

/**
 * 점수/정답률/레벨 비교표 렌더링
 */
function renderListeningStatsComparison(resultData) {
    const first = resultData.firstAttempt;
    const second = resultData.secondAttempt;
    const improvement = resultData.improvement;
    
    // 1차 (레벨은 항상 소수점 1자리)
    document.getElementById('listeningFirstScore').textContent = `${first.score}/32`;
    document.getElementById('listeningFirstPercent').textContent = `${first.percentage}%`;
    document.getElementById('listeningFirstLevel').textContent = first.level.toFixed(1);
    
    // 2차 (레벨은 항상 소수점 1자리)
    document.getElementById('listeningSecondScore').textContent = `${second.score}/32`;
    document.getElementById('listeningSecondPercent').textContent = `${second.percentage}%`;
    document.getElementById('listeningSecondLevel').textContent = second.level.toFixed(1);
    
    // 개선
    const scoreDiffEl = document.getElementById('listeningScoreDiff');
    const percentDiffEl = document.getElementById('listeningPercentDiff');
    const levelDiffEl = document.getElementById('listeningLevelDiff');
    
    if (improvement.scoreDiff > 0) {
        scoreDiffEl.textContent = `+${improvement.scoreDiff} 문제`;
        percentDiffEl.textContent = `+${improvement.percentDiff}%`;
        levelDiffEl.textContent = `+${Math.abs(improvement.levelDiff).toFixed(1)}`;
    } else if (improvement.scoreDiff === 0) {
        scoreDiffEl.textContent = '변화 없음';
        percentDiffEl.textContent = '0%';
        levelDiffEl.textContent = '0.0';
    } else {
        scoreDiffEl.textContent = `${improvement.scoreDiff} 문제`;
        percentDiffEl.textContent = `${improvement.percentDiff}%`;
        levelDiffEl.textContent = `${Math.abs(improvement.levelDiff).toFixed(1)}`;
    }
}

/**
 * 리스닝 레벨 계산 (32문제 기준)
 * 구간표:
 * 0~2개: 1.0
 * 3~5개: 1.5
 * 6~8개: 2.0
 * 9~11개: 2.5
 * 12~15개: 3.0
 * 16~18개: 3.5
 * 19~21개: 4.0
 * 22~24개: 4.5
 * 25~27개: 5.0
 * 28~29개: 5.5
 * 30~32개: 6.0
 */
function calculateListeningLevel(correctCount) {
    if (correctCount <= 2) return 1.0;
    if (correctCount <= 5) return 1.5;
    if (correctCount <= 8) return 2.0;
    if (correctCount <= 11) return 2.5;
    if (correctCount <= 15) return 3.0;
    if (correctCount <= 18) return 3.5;
    if (correctCount <= 21) return 4.0;
    if (correctCount <= 24) return 4.5;
    if (correctCount <= 27) return 5.0;
    if (correctCount <= 29) return 5.5;
    return 6.0; // 30~32개
}

/**
 * 격려 메시지 렌더링
 */
function renderListeningMotivationMessage(resultData) {
    const improvement = resultData.improvement;
    const scoreDiff = improvement.scoreDiff;
    const percentDiff = improvement.percentDiff;
    const levelDiff = improvement.levelDiff;
    
    const messageEl = document.getElementById('listeningMotivationMessage');
    
    if (scoreDiff > 0) {
        messageEl.innerHTML = `
            <p>🎉 축하합니다!</p>
            <p>다시 한번 집중해서 듣는 것만으로 ${scoreDiff}문제를 더 맞혔어요!</p>
            <p>정답률이 ${percentDiff}% 상승했고, ${levelDiff.toFixed(1)} 레벨이 올랐어요!</p>
        `;
    } else {
        // scoreDiff === 0 (점수가 떨어지는 경우는 없음)
        messageEl.innerHTML = `
            <p>👍 이번에는 개선이 없었지만 괜찮아요.</p>
            <p>한번 더 시도해보면 더 나은 결과를 얻을 수 있을 거예요!</p>
            <p>포기하지 마세요! 😊</p>
        `;
    }
}

// ✅ 테스트용 더미 데이터 함수
function testListeningRetakeResult() {
    const dummyData = {
        firstAttempt: {
            totalCorrect: 20,
            results: [
                true, false, true, false, true, true, false, true,
                false, true, true, false, true, false, true, true,
                false, true, true, false, true, false, true, true,
                false, true, false, true, true, false, true, false
            ]
        },
        secondAttempt: {
            totalCorrect: 25,
            results: [
                true, true, true, false, true, true, true, true,
                false, true, true, true, true, false, true, true,
                true, true, true, false, true, false, true, true,
                true, true, false, true, true, false, true, true
            ]
        },
        secondAttemptAnswers: {}
    };
    
    showListeningRetakeResult(dummyData);
}

window.testListeningRetakeResult = testListeningRetakeResult;
console.log('✅ testListeningRetakeResult 함수 노출 완료');

console.log('✅ listening-retake-result.js 로드 완료');
