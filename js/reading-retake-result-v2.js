/**
 * ================================================
 * reading-retake-result-v2.js
 * 2차 풀이 결과 화면 — 점수 비교표만 표시
 * ================================================
 * 
 * V2 리팩토링: 해설/세부결과는 explain-viewer-v2.js로 분리
 * 이 파일은 순수하게 2차 결과 비교 화면만 담당
 */

console.log('🔵 [V2] reading-retake-result-v2.js 로드 시작');

/**
 * 2차 결과 화면 표시
 * @param {Object} resultData - { firstAttempt, secondAttempt, improvement, secondAttemptAnswers }
 */
function showReadingRetakeResult(resultData) {
    console.log('📊 [V2] 2차 결과 화면 표시', resultData);

    // 화면 전환
    document.querySelectorAll('.screen, .result-screen, .test-screen').forEach(function(s) {
        s.style.display = 'none';
    });

    var screen = document.getElementById('readingRetakeResultScreen');
    if (screen) {
        screen.style.display = 'block';
    } else {
        console.error('❌ [V2] readingRetakeResultScreen을 찾을 수 없습니다');
        return;
    }

    // 렌더링
    renderQuestionComparison(resultData);
    renderStatsComparison(resultData);
    renderMotivationMessage(resultData);

    // 네비게이션: "과제 화면으로 돌아가기" 버튼만 표시
    renderRetakeNavigation();
}

/**
 * 35문제 O/X 비교표
 */
function renderQuestionComparison(resultData) {
    var totalQuestions = 35;
    var firstResults = resultData.firstAttempt.results;
    var secondResults = resultData.secondAttempt.results;

    // 문제 번호
    var questionNumbersEl = document.getElementById('questionNumbers');
    if (!questionNumbersEl) return;
    questionNumbersEl.innerHTML = '';
    for (var i = 1; i <= totalQuestions; i++) {
        var numEl = document.createElement('div');
        numEl.className = 'question-number';
        numEl.textContent = i;
        questionNumbersEl.appendChild(numEl);
    }

    // 1차 결과
    var firstResultsEl = document.getElementById('firstAttemptResults');
    if (!firstResultsEl) return;
    firstResultsEl.innerHTML = '';
    firstResults.forEach(function(isCorrect) {
        var el = document.createElement('div');
        el.className = 'question-result ' + (isCorrect ? 'correct' : 'incorrect');
        el.textContent = isCorrect ? '✓' : '✗';
        firstResultsEl.appendChild(el);
    });

    // 2차 결과 (상태 표시 포함)
    var secondResultsEl = document.getElementById('secondAttemptResults');
    if (!secondResultsEl) return;
    secondResultsEl.innerHTML = '';
    secondResults.forEach(function(isCorrect, index) {
        var el = document.createElement('div');
        var firstCorrect = firstResults[index];

        var statusClass = '';
        if (!firstCorrect && isCorrect) statusClass = 'improved';
        else if (!firstCorrect && !isCorrect) statusClass = 'still-wrong';
        else if (firstCorrect && !isCorrect) statusClass = 'worsened';

        el.className = 'question-result ' + (isCorrect ? 'correct' : 'incorrect') + ' ' + statusClass;
        el.textContent = isCorrect ? '✓' : '✗';
        secondResultsEl.appendChild(el);
    });
}

/**
 * 점수/정답률/레벨 비교
 */
function renderStatsComparison(resultData) {
    var first = resultData.firstAttempt;
    var second = resultData.secondAttempt;
    var improvement = resultData.improvement;

    // 1차
    var el;
    el = document.getElementById('firstScore');
    if (el) el.textContent = first.score + '/35';
    el = document.getElementById('firstPercent');
    if (el) el.textContent = first.percentage + '%';
    el = document.getElementById('firstLevel');
    if (el) el.textContent = first.level.toFixed(1);

    // 2차
    el = document.getElementById('secondScore');
    if (el) el.textContent = second.score + '/35';
    el = document.getElementById('secondPercent');
    if (el) el.textContent = second.percentage + '%';
    el = document.getElementById('secondLevel');
    if (el) el.textContent = second.level.toFixed(1);

    // 개선
    var scoreDiffEl = document.getElementById('scoreDiff');
    var percentDiffEl = document.getElementById('percentDiff');
    var levelDiffEl = document.getElementById('levelDiff');

    if (improvement.scoreDiff > 0) {
        if (scoreDiffEl) scoreDiffEl.textContent = '+' + improvement.scoreDiff + ' 문제';
        if (percentDiffEl) percentDiffEl.textContent = '+' + improvement.percentDiff + '%';
        if (levelDiffEl) levelDiffEl.textContent = '+' + Math.abs(improvement.levelDiff).toFixed(1);
    } else if (improvement.scoreDiff === 0) {
        if (scoreDiffEl) scoreDiffEl.textContent = '변화 없음';
        if (percentDiffEl) percentDiffEl.textContent = '0%';
        if (levelDiffEl) levelDiffEl.textContent = '0.0';
    } else {
        if (scoreDiffEl) scoreDiffEl.textContent = improvement.scoreDiff + ' 문제';
        if (percentDiffEl) percentDiffEl.textContent = improvement.percentDiff + '%';
        if (levelDiffEl) levelDiffEl.textContent = Math.abs(improvement.levelDiff).toFixed(1);
    }
}

/**
 * 축하/격려 메시지
 */
function renderMotivationMessage(resultData) {
    var improvement = resultData.improvement;
    var second = resultData.secondAttempt;
    var messageEl = document.getElementById('motivationMessage');
    if (!messageEl) return;

    var message = '';
    var messageClass = '';

    if (second.score === 35) {
        message = '<p>🏆 완벽해요!</p><p>모든 문제를 정복했습니다!</p><p>당신의 노력이 빛을 발했어요! ⭐</p>';
        messageClass = 'perfect';
    } else if (improvement.scoreDiff > 0) {
        message = '<p>🎉 축하합니다!</p><p>조금 더 생각하는 것만으로 ' + improvement.scoreDiff + '문제를 더 맞혔어요!</p><p>정답률이 ' + improvement.percentDiff + '% 상승했고, ' + improvement.levelDiff + ' 레벨이 올랐어요!</p>';
        messageClass = '';
    } else if (improvement.scoreDiff === 0) {
        message = '<p>💪 이번에는 개선이 없었지만 괜찮아요.</p><p>한 번 더 차분히 도전해보세요!</p><p>포기하지 마세요! 😊</p>';
        messageClass = 'no-improvement';
    } else {
        message = '<p>😅 이번에는 점수가 조금 낮아졌네요.</p><p>괜찮아요! 집중력이 흐트러졌을 수 있어요.</p><p>다시 한 번 도전해봐요!</p>';
        messageClass = 'worsened';
    }

    messageEl.innerHTML = message;
    messageEl.className = 'motivation-message ' + messageClass;
}

/**
 * 네비게이션 영역 — "과제 화면으로 돌아가기" 버튼만 표시
 */
function renderRetakeNavigation() {
    var screen = document.getElementById('readingRetakeResultScreen');
    if (!screen) return;

    // 기존 네비게이션 영역이 있으면 사용, 없으면 새로 생성
    var navArea = screen.querySelector('.retake-navigation');
    if (!navArea) {
        navArea = document.createElement('div');
        navArea.className = 'retake-navigation';
        navArea.style.cssText = 'padding:20px; text-align:center;';
        screen.appendChild(navArea);
    }

    navArea.innerHTML = '';

    var returnBtn = document.createElement('button');
    returnBtn.className = 'btn btn-primary btn-large v2-return-btn';
    returnBtn.style.cssText = 'width:90%; max-width:400px; padding:14px 24px; font-size:16px; font-weight:600; border-radius:12px; cursor:pointer; background:#9480c5; color:#fff; border:none;';
    returnBtn.textContent = '📋 과제 화면으로 돌아가기';
    returnBtn.onclick = function() {
        if (typeof returnToStageSelectAfterRetake === 'function') {
            returnToStageSelectAfterRetake(window.StageSelector && window.StageSelector.secondAttemptResult);
        } else {
            // fallback
            document.querySelectorAll('.screen, .result-screen, .test-screen').forEach(function(s) { s.style.display = 'none'; });
            var stageScreen = document.getElementById('stageSelectScreen');
            if (stageScreen) stageScreen.style.display = 'block';
        }
    };
    navArea.appendChild(returnBtn);
    
    console.log('✅ [V2] "과제 화면으로 돌아가기" 버튼 렌더링 완료');
}

// 전역 노출
window.showReadingRetakeResult = showReadingRetakeResult;

console.log('✅ [V2] reading-retake-result-v2.js 로드 완료');
console.log('   - showReadingRetakeResult() → 2차 점수 비교표만 표시');
