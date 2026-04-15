/**
 * arrange-result.js
 * 라이팅 - 단어배열 결과 화면
 */

var _arrangeRetryMode = null;
var _arrangeRetryCountMap = {}; // 문제별 재풀이 시도 횟수 { retryId: count }

/**
 * 결과 화면 표시
 * @param {Object} data - 채점 결과 데이터 (explain-viewer.js에서 전달)
 * @param {string} mode - 'initial' | 'current' (explain-viewer.js에서 전달)
 */
function showArrangeResult(data, mode) {
    console.log('[arrange-result] 결과 화면 표시');

    if (!data) {
        console.error('❌ [arrange-result] 결과 데이터 없음');
        return;
    }

    _arrangeRetryMode = mode || null;
    _arrangeRetryCountMap = {}; // 초기화
    var resultsData = data;

    // 점수 표시
    document.getElementById('arrangeResultScoreValue').textContent = resultsData.accuracy + '%';
    document.getElementById('arrangeResultCorrectCount').textContent = resultsData.correct;
    document.getElementById('arrangeResultIncorrectCount').textContent = resultsData.total - resultsData.correct;
    document.getElementById('arrangeResultTotalCount').textContent = resultsData.total;

    // 세부 결과 렌더링
    var detailsContainer = document.getElementById('arrangeResultDetails');
    var html = '';

    resultsData.results.forEach(function(result, index) {
        html += renderArrangeResultItem(result, index);
    });

    detailsContainer.innerHTML = html;
}

/**
 * 개별 문제 결과 렌더링
 */
function renderArrangeResultItem(result, index) {
    var isCorrect = result.isCorrect;
    var isRetry = (_arrangeRetryMode === 'initial' && !isCorrect);
    var statusClass = isCorrect ? 'correct' : 'incorrect';
    var statusIcon = isCorrect
        ? '<i class="fas fa-check-circle"></i>'
        : '<i class="fas fa-times-circle"></i>';

    var profilePair = result.profilePair || {
        first: { gender: 'female', image: '' },
        second: { gender: 'male', image: '' }
    };

    var retryId = 'arrange-retry-' + index;

    // 오답 + initial: 내 답변/정답/해설 잠금, 재풀이 UI 표시
    var lockedDisplay = isRetry ? ' style="display:none"' : '';

    var html =
        '<div class="arrange-result-item" id="' + retryId + '-container">' +
            '<div class="arrange-result-header ' + statusClass + '">' +
                '<div class="arrange-question-number">Question ' + result.questionNum + '</div>' +
                '<div class="arrange-result-status ' + statusClass + '">' + statusIcon + '</div>' +
            '</div>' +

            '<div class="arrange-result-content">' +
                // 주어진 문장 (항상 표시)
                '<div class="arrange-given-section">' +
                    '<div class="arrange-result-profile-row">' +
                        '<div class="arrange-result-profile ' + profilePair.first.gender + '">' +
                            '<img src="' + profilePair.first.image + '" alt="' + profilePair.first.gender + '" />' +
                        '</div>' +
                        '<div class="arrange-result-text-area">' +
                            '<div class="arrange-given-text">' + escapeHtml_writing(result.givenSentence) + '</div>' +
                            (result.givenTranslation ?
                                '<div class="arrange-translation">' + escapeHtml_writing(result.givenTranslation) + '</div>'
                            : '') +
                        '</div>' +
                    '</div>' +
                '</div>' +

                '<div class="arrange-divider"></div>' +

                // 재풀이 영역 (initial + 오답만)
                (isRetry ? _renderArrangeRetry(result, index, retryId, profilePair) : '') +

                // 잠금 영역: 내 답변 + 정답 + 주어진 단어 + 해설
                '<div class="arrange-locked-content" id="' + retryId + '-locked"' + lockedDisplay + '>' +

                    // 내 답변 (오답일 경우)
                    (!isCorrect ?
                        '<div class="arrange-user-answer-section">' +
                            '<div class="arrange-answer-label">내 답변</div>' +
                            '<div class="arrange-result-profile-row">' +
                                '<div class="arrange-result-profile ' + profilePair.second.gender + '">' +
                                    '<img src="' + profilePair.second.image + '" alt="' + profilePair.second.gender + '" />' +
                                '</div>' +
                                '<div class="arrange-user-sentence">' +
                                    renderArrangeAnswerStructure(result, false) +
                                '</div>' +
                            '</div>' +
                        '</div>'
                    : '') +

                    // 정답
                    '<div class="arrange-answer-section">' +
                        '<div class="arrange-answer-label">정답</div>' +
                        '<div class="arrange-result-profile-row">' +
                            '<div class="arrange-result-profile ' + profilePair.second.gender + '">' +
                                '<img src="' + profilePair.second.image + '" alt="' + profilePair.second.gender + '" />' +
                            '</div>' +
                            '<div class="arrange-result-text-area">' +
                                '<div class="arrange-correct-sentence">' +
                                    renderArrangeAnswerStructure(result, true) +
                                '</div>' +
                                (result.correctTranslation ?
                                    '<div class="arrange-correct-translation">' + escapeHtml_writing(result.correctTranslation) + '</div>'
                                : '') +
                            '</div>' +
                        '</div>' +
                    '</div>' +

                    // 주어진 단어
                    '<div class="arrange-options-display">' +
                        '<div class="arrange-options-label">주어진 단어</div>' +
                        '<div class="arrange-options-list">' +
                            (result.optionWords ? result.optionWords.map(function(word) {
                                return '<span class="arrange-option-display">' + escapeHtml_writing(word) + '</span>';
                            }).join('') : '') +
                        '</div>' +
                    '</div>' +

                    // 해설
                    (result.explanation ?
                        '<div class="arrange-divider"></div>' +
                        '<div class="arrange-explanation-section">' +
                            '<div class="arrange-explanation-title">' +
                                '<i class="fas fa-lightbulb"></i> 해설' +
                            '</div>' +
                            '<div class="arrange-explanation-text">' + escapeHtml_writing(result.explanation) + '</div>' +
                        '</div>'
                    : '') +

                '</div>' +
            '</div>' +
        '</div>';

    return html;
}

/**
 * 재풀이 UI 렌더링
 */
function _renderArrangeRetry(result, index, retryId, profilePair) {
    var presentedWords = result.presentedWords || [];
    var optionWords = result.optionWords || [];
    var blankCount = 0;

    presentedWords.forEach(function(w) { if (w === '_') blankCount++; });

    // 문장 구조: 고정 단어 + 빈칸 슬롯
    var sentenceHTML = '';
    var slotIndex = 0;
    presentedWords.forEach(function(word, i) {
        if (word === '_') {
            sentenceHTML +=
                '<span class="ar-retry-slot" data-retry-id="' + retryId + '" data-slot="' + slotIndex + '" onclick="handleArrangeSlotClick(this)">' +
                    '<span class="ar-retry-slot-text"></span>' +
                '</span> ';
            slotIndex++;
        } else {
            sentenceHTML += '<span class="arrange-result-given">' + escapeHtml_writing(word) + '</span> ';
        }
    });

    if (result.endPunctuation) {
        sentenceHTML += '<span class="arrange-result-punctuation">' + result.endPunctuation + '</span>';
    }

    // 단어 버튼
    var wordBtnsHTML = '';
    optionWords.forEach(function(word, i) {
        wordBtnsHTML +=
            '<button class="ar-retry-word" data-retry-id="' + retryId + '" data-word-index="' + i + '" onclick="handleArrangeWordClick(this)">' +
                escapeHtml_writing(word) +
            '</button>';
    });

    // 정답 배열을 data 속성에 저장 (큰따옴표를 &quot;로 치환해야 HTML 속성 충돌 방지)
    var correctJSON = JSON.stringify(result.correctAnswerArray || []).replace(/"/g, '&quot;');

    return '<div class="ar-retry-area" id="' + retryId + '" data-correct="' + correctJSON + '" data-blank-count="' + blankCount + '">' +
            '<div class="ar-retry-first-answer">' +
                '<i class="fas fa-times-circle"></i> 1차 답변: ' +
                '<span class="ar-retry-wrong-text">' + _renderUserAnswerInline(result) + '</span>' +
            '</div>' +
            '<div class="ar-retry-prompt">다시 배열해보세요:</div>' +
            '<div class="ar-retry-sentence">' +
                '<div class="arrange-result-profile-row">' +
                    '<div class="arrange-result-profile ' + profilePair.second.gender + '">' +
                        '<img src="' + profilePair.second.image + '" alt="' + profilePair.second.gender + '" />' +
                    '</div>' +
                    '<div class="ar-retry-sentence-area">' + sentenceHTML + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="ar-retry-wordbank">' +
                '<div class="arrange-options-label">단어를 클릭하여 빈칸에 넣으세요</div>' +
                '<div class="ar-retry-words">' + wordBtnsHTML + '</div>' +
            '</div>' +
            '<button class="ar-retry-submit" onclick="handleArrangeRetrySubmit(\'' + retryId + '\')">' +
                '<i class="fas fa-check"></i> 확인' +
            '</button>' +
            '<div class="ar-retry-feedback" id="' + retryId + '-feedback"></div>' +
        '</div>';
}

/**
 * 1차 답변 인라인 텍스트
 */
function _renderUserAnswerInline(result) {
    if (!result.presentedWords) {
        return escapeHtml_writing(result.userAnswer || '');
    }
    var parts = [];
    var idx = 0;
    result.presentedWords.forEach(function(word, i) {
        if (word === '_') {
            var filled = (result.userFilledWords && result.userFilledWords[i]) || '___';
            parts.push(filled);
            idx++;
        } else {
            parts.push(word);
        }
    });
    if (result.endPunctuation) parts.push(result.endPunctuation);
    return escapeHtml_writing(parts.join(' '));
}

// ── 단어 클릭 → 다음 빈 슬롯에 배치 ──

function handleArrangeWordClick(btn) {
    var retryId = btn.getAttribute('data-retry-id');
    if (btn.disabled) return;

    // 다음 빈 슬롯 찾기
    var slots = document.querySelectorAll('.ar-retry-slot[data-retry-id="' + retryId + '"]');
    var targetSlot = null;
    for (var i = 0; i < slots.length; i++) {
        if (!slots[i].getAttribute('data-filled')) {
            targetSlot = slots[i];
            break;
        }
    }
    if (!targetSlot) return; // 슬롯이 다 찼음

    // 슬롯에 단어 채우기
    var textEl = targetSlot.querySelector('.ar-retry-slot-text');
    textEl.textContent = btn.textContent;
    targetSlot.setAttribute('data-filled', btn.getAttribute('data-word-index'));
    targetSlot.classList.add('filled');

    // 단어 버튼 비활성화
    btn.disabled = true;
    btn.classList.add('used');
}

// ── 슬롯 클릭 → 단어 제거, 버튼 복귀 ──

function handleArrangeSlotClick(slot) {
    var filledIndex = slot.getAttribute('data-filled');
    if (!filledIndex) return;

    var retryId = slot.getAttribute('data-retry-id');

    // 슬롯 비우기
    var textEl = slot.querySelector('.ar-retry-slot-text');
    textEl.textContent = '';
    slot.removeAttribute('data-filled');
    slot.classList.remove('filled');

    // 단어 버튼 다시 활성화
    var btn = document.querySelector('.ar-retry-word[data-retry-id="' + retryId + '"][data-word-index="' + filledIndex + '"]');
    if (btn) {
        btn.disabled = false;
        btn.classList.remove('used');
    }
}

// ── 확인 버튼 ──

function handleArrangeRetrySubmit(retryId) {
    var area = document.getElementById(retryId);
    if (!area) return;

    var blankCount = parseInt(area.getAttribute('data-blank-count'));
    var correctArr = JSON.parse(area.getAttribute('data-correct'));
    var feedbackEl = document.getElementById(retryId + '-feedback');

    // 슬롯에서 답변 수집
    var slots = document.querySelectorAll('.ar-retry-slot[data-retry-id="' + retryId + '"]');
    var userArr = [];
    var allFilled = true;

    for (var i = 0; i < slots.length; i++) {
        var filledIdx = slots[i].getAttribute('data-filled');
        if (!filledIdx && filledIdx !== '0') {
            allFilled = false;
            break;
        }
        var textEl = slots[i].querySelector('.ar-retry-slot-text');
        userArr.push(textEl.textContent.trim());
    }

    if (!allFilled) {
        if (feedbackEl) {
            feedbackEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> 모든 빈칸을 채워주세요';
            feedbackEl.className = 'ar-retry-feedback ar-retry-feedback-warn';
        }
        return;
    }

    // 정답 비교
    var isCorrect = true;
    for (var j = 0; j < correctArr.length; j++) {
        if ((userArr[j] || '').toLowerCase() !== (correctArr[j] || '').toLowerCase()) {
            isCorrect = false;
            break;
        }
    }

    if (isCorrect) {
        if (feedbackEl) {
            feedbackEl.innerHTML = '<i class="fas fa-check-circle"></i> 정답입니다!';
            feedbackEl.className = 'ar-retry-feedback ar-retry-feedback-correct';
        }

        // 슬롯/버튼 비활성
        slots.forEach(function(s) { s.style.pointerEvents = 'none'; s.classList.add('correct'); });
        var wordBtns = document.querySelectorAll('.ar-retry-word[data-retry-id="' + retryId + '"]');
        wordBtns.forEach(function(b) { b.disabled = true; });
        var submitBtn = area.querySelector('.ar-retry-submit');
        if (submitBtn) submitBtn.disabled = true;

        // 헤더 아이콘 업데이트
        var container = document.getElementById(retryId + '-container');
        if (container) {
            var statusEl = container.querySelector('.arrange-result-status');
            if (statusEl) statusEl.innerHTML = '<i class="fas fa-check-circle"></i>';
        }

        // 잠금 해제
        setTimeout(function() {
            var locked = document.getElementById(retryId + '-locked');
            if (locked) locked.style.display = '';
        }, 500);
    } else {
        // 오답 → 시도 횟수 증가
        if (!_arrangeRetryCountMap[retryId]) _arrangeRetryCountMap[retryId] = 0;
        _arrangeRetryCountMap[retryId]++;
        var count = _arrangeRetryCountMap[retryId];

        if (feedbackEl) {
            feedbackEl.innerHTML = '<i class="fas fa-times-circle"></i> 다시 생각해보세요 (' + count + '/5)';
            feedbackEl.className = 'ar-retry-feedback ar-retry-feedback-wrong';
        }

        // 5회 실패 → 정답 보기 버튼 표시
        if (count >= 5) {
            var revealBtnId = retryId + '-reveal';
            if (!document.getElementById(revealBtnId) && feedbackEl) {
                var revealBtn = document.createElement('button');
                revealBtn.id = revealBtnId;
                revealBtn.className = 'ar-retry-reveal';
                revealBtn.innerHTML = '<i class="fas fa-eye"></i> 정답 보기';
                revealBtn.onclick = function() {
                    handleArrangeRevealAnswer(retryId);
                };
                feedbackEl.parentNode.insertBefore(revealBtn, feedbackEl.nextSibling);
            }
        }

        // 슬롯 전체 초기화
        slots.forEach(function(s) {
            var textEl = s.querySelector('.ar-retry-slot-text');
            textEl.textContent = '';
            s.removeAttribute('data-filled');
            s.classList.remove('filled');
        });
        var wordBtns = document.querySelectorAll('.ar-retry-word[data-retry-id="' + retryId + '"]');
        wordBtns.forEach(function(b) { b.disabled = false; b.classList.remove('used'); });
    }
}

/**
 * 답변 구조 렌더링 (주어진 단어 + 내가 채운 빈칸 구분)
 */
function renderArrangeAnswerStructure(result, isCorrectAnswer) {
    if (!result.presentedWords) {
        return escapeHtml_writing(isCorrectAnswer ? result.correctAnswer : result.userAnswer);
    }

    var presentedWords = result.presentedWords;
    var userFilledWords = result.userFilledWords || {};
    var correctWords = result.correctAnswerArray || [];
    var html = '';
    var correctIndex = 0;

    presentedWords.forEach(function(word, index) {
        if (word === '_') {
            if (isCorrectAnswer) {
                html += '<span class="arrange-result-blank correct-blank">' + escapeHtml_writing(correctWords[correctIndex] || '') + '</span> ';
            } else {
                var userWord = userFilledWords[index] || '___';
                var isWrong = userWord.toLowerCase() !== (correctWords[correctIndex] || '').toLowerCase();
                html += '<span class="arrange-result-blank user-blank ' + (isWrong ? 'wrong-blank' : 'correct-blank') + '">' + escapeHtml_writing(userWord) + '</span> ';
            }
            correctIndex++;
        } else {
            html += '<span class="arrange-result-given">' + escapeHtml_writing(word) + '</span> ';
        }
    });

    if (result.endPunctuation) {
        html += '<span class="arrange-result-punctuation">' + result.endPunctuation + '</span>';
    }

    return html;
}

// ── 정답 보기 핸들러 ──

function handleArrangeRevealAnswer(retryId) {
    var area = document.getElementById(retryId);
    if (!area) return;

    var correctArr = JSON.parse(area.getAttribute('data-correct'));
    var slots = document.querySelectorAll('.ar-retry-slot[data-retry-id="' + retryId + '"]');
    var wordBtns = document.querySelectorAll('.ar-retry-word[data-retry-id="' + retryId + '"]');

    // 슬롯에 정답 채우기
    for (var i = 0; i < slots.length; i++) {
        var textEl = slots[i].querySelector('.ar-retry-slot-text');
        textEl.textContent = correctArr[i] || '';
        slots[i].setAttribute('data-filled', 'revealed');
        slots[i].classList.add('filled', 'correct');
        slots[i].style.pointerEvents = 'none';
    }

    // 단어 버튼 전체 비활성화
    wordBtns.forEach(function(b) { b.disabled = true; b.classList.add('used'); });

    // 확인 버튼 비활성화
    var submitBtn = area.querySelector('.ar-retry-submit');
    if (submitBtn) submitBtn.disabled = true;

    // 정답 보기 버튼 비활성화
    var revealBtn = document.getElementById(retryId + '-reveal');
    if (revealBtn) {
        revealBtn.disabled = true;
        revealBtn.innerHTML = '<i class="fas fa-eye"></i> 정답이 표시되었습니다';
    }

    // 피드백 메시지
    var feedbackEl = document.getElementById(retryId + '-feedback');
    if (feedbackEl) {
        feedbackEl.innerHTML = '<i class="fas fa-info-circle"></i> 정답을 확인하세요';
        feedbackEl.className = 'ar-retry-feedback ar-retry-feedback-reveal';
    }

    // 잠금 해제 (내 답변 + 정답 + 해설 표시)
    setTimeout(function() {
        var locked = document.getElementById(retryId + '-locked');
        if (locked) locked.style.display = '';
    }, 500);
}

// 전역 노출
window.showArrangeResult = showArrangeResult;
window.handleArrangeWordClick = handleArrangeWordClick;
window.handleArrangeSlotClick = handleArrangeSlotClick;
window.handleArrangeRetrySubmit = handleArrangeRetrySubmit;
window.handleArrangeRevealAnswer = handleArrangeRevealAnswer;

console.log('✅ [Writing] arrange-result.js 로드 완료');
