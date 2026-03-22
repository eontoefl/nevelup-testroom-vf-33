// ============================================
// Reading - FillBlanks 결과(해설) 화면
// ============================================

// 모듈 스코프 변수
var _fbRetryMode = null; // 'initial' | 'current' | null
var _fbAnswerMap = {};   // 정답 데이터 저장 { 'setId_blankId': answer }

// 정답채점 결과 화면 표시
// @param {Array} data - 세트별 결과 배열 (explain-viewer.js에서 전달)
// @param {string} mode - 'initial' | 'current' (explain-viewer.js에서 전달)
function showFillBlanksExplainScreen(data, mode) {
    var fillBlanksResults = data || [];
    _fbRetryMode = mode || null;

    // 전체 통계 계산
    var totalCorrect = 0;
    var totalQuestions = 0;

    fillBlanksResults.forEach(function(setResult) {
        setResult.answers.forEach(function(answer) {
            totalQuestions++;
            if (answer.isCorrect) totalCorrect++;
        });
    });

    var totalIncorrect = totalQuestions - totalCorrect;
    var totalScore = Math.round((totalCorrect / totalQuestions) * 100);

    // 결과 화면 업데이트
    document.getElementById('resultTotalScore').textContent = totalScore + '%';
    document.getElementById('resultCorrectCount').textContent = totalCorrect;
    document.getElementById('resultIncorrectCount').textContent = totalIncorrect;
    document.getElementById('resultTotalCount').textContent = totalQuestions;

    // 세부 결과 렌더링
    var detailsContainer = document.getElementById('resultDetails');
    var detailsHTML = '';

    _fbAnswerMap = {}; // 초기화

    fillBlanksResults.forEach(function(setResult, setIndex) {
        var answerMap = {};
        setResult.answers.forEach(function(answer) {
            answerMap[answer.blankId] = answer;
            var entry = { answer: answer, retryCount: 0 };
            _fbAnswerMap[setResult.setId + '_' + answer.blankId] = entry;
        });

        detailsHTML +=
            '<div class="result-section">' +
                '<div class="result-section-title">' +
                    '<i class="fas fa-book-open"></i> Set ' + (setIndex + 1) + ': ' + setResult.setTitle +
                '</div>' +
                '<div class="result-passage">' +
                    renderPassageWithAnswers(setResult, answerMap) +
                '</div>' +
                renderBlankExplanations(setResult, answerMap) +
            '</div>';
    });

    detailsContainer.innerHTML = detailsHTML;
}

// 지문을 답안과 함께 렌더링
function renderPassageWithAnswers(setResult, answerMap) {
    var passage = setResult.passage;
    var html = '';
    var lastIndex = 0;
    var blanks = setResult.blanks;

    if (!blanks || blanks.length === 0) {
        return escapeHtml(passage);
    }

    var sortedBlanks = blanks.slice().sort(function(a, b) { return a.startIndex - b.startIndex; });

    sortedBlanks.forEach(function(blank) {
        var answer = answerMap[blank.id];
        html += escapeHtml(passage.substring(lastIndex, blank.startIndex));

        var isCorrect = answer && answer.isCorrect;
        var userAnswer = answer ? answer.userAnswer : '';
        var blankClass = isCorrect ? 'result-blank correct' : 'result-blank incorrect';
        var icon = isCorrect
            ? '<i class="fas fa-check-circle"></i>'
            : '<i class="fas fa-times-circle"></i>';

        // 사용자 답안 표시
        var displayAnswer = '';
        for (var i = 0; i < blank.blankCount; i++) {
            var ch = (userAnswer && userAnswer[i]) ? userAnswer[i] : '_';
            displayAnswer += ch;
            if (i < blank.blankCount - 1 && ch === '_') {
                var nextCh = (userAnswer && userAnswer[i + 1]) ? userAnswer[i + 1] : '_';
                if (nextCh === '_') displayAnswer += ' ';
            }
        }

        html +=
            '<span class="' + blankClass + '" data-blank-id="' + blank.id + '"' +
            ' onclick="toggleBlankExplanation(event, ' + blank.id + ', \'' + setResult.setId + '\')"' +
            ' style="cursor:pointer;">' +
                icon +
                '<span class="blank-given">' + escapeHtml(blank.prefix) + '</span>' +
                '<span class="blank-user">' + escapeHtml(displayAnswer) + '</span>' +
            '</span>';

        lastIndex = blank.startIndex + blank.prefix.length + blank.answer.length;
    });

    html += escapeHtml(passage.substring(lastIndex));
    return html;
}

// 각 빈칸별 해설 영역 렌더링
function renderBlankExplanations(setResult, answerMap) {
    var html = '';

    Object.values(answerMap).forEach(function(answer) {
        var isRetry = (_fbRetryMode === 'initial' && !answer.isCorrect);
        var incorrectClass = answer.isCorrect ? '' : 'incorrect-answer';
        var hasCommonMistakes = answer.commonMistakes && answer.commonMistakes.trim() !== '';

        // 해설 본문 (retry일 때 숨김)
        var explanationDisplay = isRetry ? ' style="display:none"' : '';
        var retryDisplay = isRetry ? '' : ' style="display:none"';

        html +=
            '<div class="blank-explanation-box" id="blank_exp_' + setResult.setId + '_' + answer.blankId + '" style="display:none;">' +

                // ── 재풀이 영역 (initial + 오답만) ──
                '<div class="fb-retry-area" id="fb_retry_' + setResult.setId + '_' + answer.blankId + '"' + retryDisplay + '>' +
                    '<div class="fb-retry-first-answer">' +
                        '<i class="fas fa-times-circle"></i> 1차 답변: ' +
                        '<span class="fb-retry-wrong-word">' + escapeHtml(answer.prefix + (answer.userAnswer || '')) + '</span>' +
                    '</div>' +
                    '<div class="fb-retry-prompt">다시 입력해보세요:</div>' +
                    '<div class="fb-retry-input-row">' +
                        '<span class="fb-retry-prefix">' + escapeHtml(answer.prefix) + '</span>' +
                        _renderRetryInputs(setResult.setId, answer) +
                        '<button class="fb-retry-submit" onclick="handleFbRetrySubmit(\'' + setResult.setId + '\',' + answer.blankId + ')">' +
                            '확인' +
                        '</button>' +
                    '</div>' +
                    '<div class="fb-retry-feedback" id="fb_feedback_' + setResult.setId + '_' + answer.blankId + '"></div>' +
                    '<div class="fb-retry-locked">' +
                        '<i class="fas fa-lock"></i> 정답을 입력하면 해설이 열립니다' +
                    '</div>' +
                '</div>' +

                // ── 해설 영역 (정답이면 바로 표시, 오답+initial이면 잠금) ──
                '<div class="fb-explain-content" id="fb_explain_' + setResult.setId + '_' + answer.blankId + '"' + explanationDisplay + '>' +
                    '<div class="explanation-header">' +
                        '<div class="explanation-word">' +
                            '<strong>정답:</strong> ' +
                            '<span class="correct-word ' + incorrectClass + '">' + escapeHtml(answer.prefix + answer.correctAnswer) + '</span>' +
                        '</div>' +
                        '<button class="btn-close-explanation" onclick="closeBlankExplanation(\'' + setResult.setId + '\',' + answer.blankId + ')">' +
                            '<i class="fas fa-times"></i>' +
                        '</button>' +
                    '</div>' +
                    '<div class="explanation-text">' +
                        '<i class="fas fa-lightbulb"></i>' +
                        '<p>' + answer.explanation + '</p>' +
                    '</div>' +
                    (hasCommonMistakes ?
                        '<div class="common-mistakes-section">' +
                            '<div class="common-mistakes-header-row">' +
                                '<div class="common-mistakes-header">' +
                                    '<i class="fas fa-exclamation-triangle"></i>' +
                                    '<strong>자주 보이는 오답</strong>' +
                                '</div>' +
                                '<div class="common-mistakes-words">' +
                                    answer.commonMistakes.split(',').map(function(word) {
                                        return '<span class="mistake-word">' + escapeHtml(word.trim()) + '</span>';
                                    }).join('') +
                                '</div>' +
                            '</div>' +
                            (answer.mistakesExplanation && answer.mistakesExplanation.trim() !== '' ?
                                '<p class="common-mistakes-text">' + escapeHtml(answer.mistakesExplanation) + '</p>'
                            : '') +
                        '</div>'
                    : '') +
                '</div>' +

            '</div>';
    });

    return html;
}

// 재풀이 입력칸 렌더링
function _renderRetryInputs(setId, answer) {
    var count = answer.correctAnswer.length;
    var html = '<span class="fb-retry-inputs" data-set-id="' + setId + '" data-blank-id="' + answer.blankId + '">';
    for (var i = 0; i < count; i++) {
        html +=
            '<input type="text" class="fb-retry-char" ' +
            'data-index="' + i + '" ' +
            'maxlength="1" autocomplete="off" spellcheck="false" ' +
            'onkeydown="handleFbRetryKeydown(event,' + i + ',' + count + ')" ' +
            'oninput="handleFbRetryInput(event,' + i + ',' + count + ')">';
    }
    html += '</span>';
    return html;
}

// ── 입력 이벤트 핸들러 ──

function handleFbRetryInput(event, charIndex, totalChars) {
    var input = event.target;
    input.value = input.value.toLowerCase();

    if (input.value.length === 1 && charIndex < totalChars - 1) {
        var container = input.parentElement;
        var nextInput = container.querySelector('[data-index="' + (charIndex + 1) + '"]');
        if (nextInput) nextInput.focus();
    }
}

function handleFbRetryKeydown(event, charIndex, totalChars) {
    var input = event.target;
    var container = input.parentElement;

    if (event.key === 'Backspace' && input.value === '' && charIndex > 0) {
        event.preventDefault();
        var prevInput = container.querySelector('[data-index="' + (charIndex - 1) + '"]');
        if (prevInput) {
            prevInput.focus();
            prevInput.value = '';
        }
    }

    if (event.key === 'Enter') {
        event.preventDefault();
        var submitBtn = container.parentElement.querySelector('.fb-retry-submit');
        if (submitBtn) submitBtn.click();
    }
}

// ── 확인 버튼 핸들러 ──

function handleFbRetrySubmit(setId, blankId) {
    var container = document.querySelector('.fb-retry-inputs[data-set-id="' + setId + '"][data-blank-id="' + blankId + '"]');
    if (!container) return;

    var inputs = container.querySelectorAll('.fb-retry-char');
    var userValue = '';
    inputs.forEach(function(inp) { userValue += inp.value; });

    var feedbackEl = document.getElementById('fb_feedback_' + setId + '_' + blankId);
    var retryArea = document.getElementById('fb_retry_' + setId + '_' + blankId);
    var explainContent = document.getElementById('fb_explain_' + setId + '_' + blankId);

    // 빈칸 체크
    if (userValue.length < inputs.length) {
        if (feedbackEl) {
            feedbackEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> 모든 칸을 입력해주세요';
            feedbackEl.className = 'fb-retry-feedback fb-retry-feedback-warn';
        }
        return;
    }

    // 원본 record 데이터에서 정답 가져오기
    var entry = _fbAnswerMap[setId + '_' + blankId];
    var correctAnswer = entry ? entry.answer.correctAnswer : '';

    var isCorrect = userValue.toLowerCase() === correctAnswer.toLowerCase();

    if (isCorrect) {
        // 정답 → 해설 잠금 해제
        if (feedbackEl) {
            feedbackEl.innerHTML = '<i class="fas fa-check-circle"></i> 정답입니다!';
            feedbackEl.className = 'fb-retry-feedback fb-retry-feedback-correct';
        }
        // 입력 비활성화
        inputs.forEach(function(inp) { inp.disabled = true; });
        var submitBtn = retryArea ? retryArea.querySelector('.fb-retry-submit') : null;
        if (submitBtn) submitBtn.disabled = true;

        // 잠금 메시지 숨김
        var lockedEl = retryArea ? retryArea.querySelector('.fb-retry-locked') : null;
        if (lockedEl) lockedEl.style.display = 'none';

        // 해설 표시
        setTimeout(function() {
            if (explainContent) explainContent.style.display = '';
        }, 500);

        // 지문 내 빈칸 아이콘 업데이트
        var blankSpan = document.querySelector('.result-blank[data-blank-id="' + blankId + '"]');
        if (blankSpan) {
            blankSpan.classList.add('retried');
            var iconEl = blankSpan.querySelector('i');
            if (iconEl) {
                iconEl.className = 'fas fa-check-circle';
            }
        }
    } else {
        // 오답 → 시도 횟수 증가
        if (entry) entry.retryCount++;
        var count = entry ? entry.retryCount : 0;

        if (feedbackEl) {
            feedbackEl.innerHTML = '<i class="fas fa-times-circle"></i> 다시 생각해보세요 (' + count + '/3)';
            feedbackEl.className = 'fb-retry-feedback fb-retry-feedback-wrong';
        }

        // 3회 실패 → 정답 보기 버튼 표시
        if (count >= 3) {
            var revealBtnId = 'fb_reveal_' + setId + '_' + blankId;
            if (!document.getElementById(revealBtnId) && retryArea) {
                var revealBtn = document.createElement('button');
                revealBtn.id = revealBtnId;
                revealBtn.className = 'fb-retry-reveal';
                revealBtn.innerHTML = '<i class="fas fa-eye"></i> 정답 보기';
                revealBtn.onclick = function() {
                    handleFbRevealAnswer(setId, blankId);
                };
                // feedback 아래에 삽입
                feedbackEl.parentNode.insertBefore(revealBtn, feedbackEl.nextSibling);
            }
        }

        // 입력 초기화
        inputs.forEach(function(inp) { inp.value = ''; });
        if (inputs[0]) inputs[0].focus();
    }
}

// ── 정답 보기 핸들러 ──

function handleFbRevealAnswer(setId, blankId) {
    var entry = _fbAnswerMap[setId + '_' + blankId];
    if (!entry) return;

    var retryArea = document.getElementById('fb_retry_' + setId + '_' + blankId);
    var explainContent = document.getElementById('fb_explain_' + setId + '_' + blankId);

    // 입력칸에 정답 채우기
    var container = document.querySelector('.fb-retry-inputs[data-set-id="' + setId + '"][data-blank-id="' + blankId + '"]');
    if (container) {
        var inputs = container.querySelectorAll('.fb-retry-char');
        var correctAnswer = entry.answer.correctAnswer;
        inputs.forEach(function(inp, i) {
            inp.value = correctAnswer[i] || '';
            inp.disabled = true;
        });
    }

    // 확인 버튼 비활성화
    var submitBtn = retryArea ? retryArea.querySelector('.fb-retry-submit') : null;
    if (submitBtn) submitBtn.disabled = true;

    // 정답 보기 버튼 비활성화
    var revealBtn = document.getElementById('fb_reveal_' + setId + '_' + blankId);
    if (revealBtn) {
        revealBtn.disabled = true;
        revealBtn.innerHTML = '<i class="fas fa-eye"></i> 정답이 입력되었습니다';
    }

    // 피드백 메시지
    var feedbackEl = document.getElementById('fb_feedback_' + setId + '_' + blankId);
    if (feedbackEl) {
        feedbackEl.innerHTML = '<i class="fas fa-info-circle"></i> 정답을 확인하세요';
        feedbackEl.className = 'fb-retry-feedback fb-retry-feedback-reveal';
    }

    // 잠금 메시지 숨김
    var lockedEl = retryArea ? retryArea.querySelector('.fb-retry-locked') : null;
    if (lockedEl) lockedEl.style.display = 'none';

    // 해설 표시
    if (explainContent) explainContent.style.display = '';
}

// ── 빈칸 해설 토글 ──

function toggleBlankExplanation(event, blankId, setId) {
    event.stopPropagation();

    var explanationBox = document.getElementById('blank_exp_' + setId + '_' + blankId);
    if (!explanationBox) return;

    if (explanationBox.style.display === 'none') {
        // 다른 해설 닫기
        document.querySelectorAll('.blank-explanation-box').forEach(function(box) {
            box.style.display = 'none';
        });
        explanationBox.style.display = 'block';
        explanationBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // 재풀이 영역에 포커스
        var retryArea = document.getElementById('fb_retry_' + setId + '_' + blankId);
        if (retryArea && retryArea.style.display !== 'none') {
            var firstInput = retryArea.querySelector('.fb-retry-char');
            if (firstInput && !firstInput.disabled) {
                setTimeout(function() { firstInput.focus(); }, 300);
            }
        }
    } else {
        explanationBox.style.display = 'none';
    }
}

// 빈칸 해설 닫기
function closeBlankExplanation(setId, blankId) {
    var explanationBox = document.getElementById('blank_exp_' + setId + '_' + blankId);
    if (explanationBox) explanationBox.style.display = 'none';
}

// 전역 노출
window.showFillBlanksExplainScreen = showFillBlanksExplainScreen;
window.toggleBlankExplanation = toggleBlankExplanation;
window.closeBlankExplanation = closeBlankExplanation;
window.handleFbRetrySubmit = handleFbRetrySubmit;
window.handleFbRevealAnswer = handleFbRevealAnswer;
window.handleFbRetryInput = handleFbRetryInput;
window.handleFbRetryKeydown = handleFbRetryKeydown;

console.log('✅ [Reading] fillblanks-result.js 로드 완료');
