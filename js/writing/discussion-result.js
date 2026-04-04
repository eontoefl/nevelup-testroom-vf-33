// ================================================
// 토론형 글쓰기 채점 화면 로직
// ================================================
//
// 실전풀이 해설 (mode=initial) 3단계:
//   ① 원본 글 확인 → ② 재작성 → ③ 비교 (원본 vs 재작성) + 모범답안
//   이미 재작성 있으면 바로 ③
//
// 다시풀기 해설 (mode=current):
//   원본 글 + 모범답안 (재작성 없음, 기존과 동일)
// ================================================

var _discussionDbContext = null;
var _discussionData = null;

/**
 * 토론형 채점 화면 표시
 */
function showDiscussionResult(data, mode) {
    console.log('💬 [토론형 채점] 결과 화면 표시, mode=' + mode);

    if (!data) {
        console.error('❌ 채점 데이터가 없습니다.');
        return;
    }

    _discussionDbContext = data._dbContext || null;
    _discussionData = data;
    var existingRewrite = data._rewrite || null;

    // 프로필 정보 가져오기
    var profiles = _getDiscussionProfiles(data);

    // 단어 수 표시
    var wordCountElement = document.getElementById('discussionResultWordCount');
    if (wordCountElement) {
        wordCountElement.textContent = data.wordCount || 0;
    }

    // 단어 수 피드백
    var wordCountFeedbackElement = document.getElementById('discussionWordCountFeedback');
    if (wordCountFeedbackElement && data.wordCount) {
        var wordCount = data.wordCount;
        var feedbackText = '';
        var feedbackClass = '';

        if (wordCount >= 100 && wordCount <= 120) {
            feedbackText = '✨ Perfect! 최적의 단어 수입니다!';
            feedbackClass = 'perfect';
        } else if (wordCount < 100) {
            feedbackText = '💡 100~120단어가 만점 비율이 가장 높습니다. 조금 더 작성해보세요!';
            feedbackClass = 'too-short';
        } else {
            feedbackText = '⚠️ 너무 많은 글은 퀄리티를 낮춥니다. 100~120단어가 충분합니다!';
            feedbackClass = 'too-long';
        }

        wordCountFeedbackElement.textContent = feedbackText;
        wordCountFeedbackElement.className = 'word-count-feedback ' + feedbackClass;
    }

    // 문제 정보 표시
    if (data.question) {
        var contextElement = document.getElementById('discussionResultContext');
        if (contextElement && data.question.classContext) {
            contextElement.textContent = data.question.classContext;
        }

        var topicElement = document.getElementById('discussionResultTopic');
        if (topicElement && data.question.topic) {
            topicElement.textContent = replaceStudentNamesInResult(data.question.topic, profiles);
        }

        var opinionsContainer = document.getElementById('discussionResultStudentOpinions');
        if (opinionsContainer) {
            var opinionsHtml = '';
            if (data.question.student1Opinion) {
                var s1Text = replaceStudentNamesInResult(data.question.student1Opinion, profiles);
                opinionsHtml +=
                    '<div class="discussion-opinion">' +
                        '<div class="discussion-opinion-name">' + profiles.student1.name + '</div>' +
                        '<div class="discussion-opinion-text">' + s1Text + '</div>' +
                    '</div>';
            }
            if (data.question.student2Opinion) {
                var s2Text = replaceStudentNamesInResult(data.question.student2Opinion, profiles);
                opinionsHtml +=
                    '<div class="discussion-opinion">' +
                        '<div class="discussion-opinion-name">' + profiles.student2.name + '</div>' +
                        '<div class="discussion-opinion-text">' + s2Text + '</div>' +
                    '</div>';
            }
            opinionsContainer.innerHTML = opinionsHtml;
        }
    }

    // 모범 답안 렌더링 (어느 단계에서든 준비해둠)
    _renderDiscussionSampleAnswer(data, profiles);

    // Bullet 피드백 데이터 저장
    window.discussionBulletsData = data.question && data.question.bullets ? data.question.bullets : [];

    // 피드백 박스 초기화
    var bulletsSection = document.getElementById('discussionResultBullets');
    if (bulletsSection) {
        bulletsSection.classList.remove('show');
        bulletsSection.innerHTML = '';
    }

    // ── 단계 분기 ──
    if (mode === 'initial') {
        if (existingRewrite) {
            _showDiscussionCompare(data.userAnswer, existingRewrite.text);
        } else {
            _showDiscussionOriginal(data.userAnswer);
        }
    } else {
        _showDiscussionDraft(data.userAnswer);
    }
}

// ============================================================
// ① 원본 글 보기 (실전풀이, 재작성 전)
// ============================================================

function _showDiscussionOriginal(userAnswer) {
    var container = document.getElementById('discussionResultUserAnswer');
    var answersRow = document.querySelector('#discussionExplainScreen .discussion-answers-row');
    var draftLabel = answersRow ? answersRow.querySelector('.discussion-result-section:first-child .discussion-result-label') : null;

    if (draftLabel) draftLabel.textContent = 'Your Draft';

    if (container) {
        var hasAnswer = userAnswer && userAnswer.trim();
        container.classList.remove('rewrite-area');
        container.innerHTML = '';

        var pre = document.createElement('pre');
        pre.className = 'discussion-original-text';
        pre.textContent = hasAnswer ? userAnswer : '작성한 답안이 없습니다.';
        if (!hasAnswer) pre.className += ' empty-answer';
        container.appendChild(pre);

        var btn = document.createElement('button');
        btn.className = 'rewrite-start-btn';
        btn.innerHTML = '<i class="fas fa-pen"></i> ' + (hasAnswer ? '다시 작성하기' : '작성해보기');
        btn.addEventListener('click', function() {
            _showDiscussionRewrite(null);
        });
        container.appendChild(btn);
    }

    _toggleDiscussionModelAnswer(false);
}

// ============================================================
// ② 재작성 화면
// ============================================================

function _showDiscussionRewrite(prefillText) {
    var container = document.getElementById('discussionResultUserAnswer');
    var answersRow = document.querySelector('#discussionExplainScreen .discussion-answers-row');
    var draftLabel = answersRow ? answersRow.querySelector('.discussion-result-section:first-child .discussion-result-label') : null;

    if (draftLabel) draftLabel.textContent = 'Rewrite';

    if (!container) return;

    var data = _discussionData;
    var profiles = _getDiscussionProfiles(data);
    var bullets = (data && data.question && data.question.bullets) || [];

    var hintsHTML = '';
    if (bullets.length > 0) {
        hintsHTML = '<div class="rewrite-hints">' +
            '<div class="rewrite-hints-title"><i class="fas fa-lightbulb"></i> 만점 포인트를 참고하여 다시 작성해보세요</div>';
        bullets.forEach(function(bullet) {
            var hintText = replaceStudentNamesInResult(bullet.ets || bullet.must || bullet.key || '', profiles);
            hintsHTML += '<div class="rewrite-hint-item">' +
                '<span class="rewrite-hint-badge">Bullet ' + bullet.bulletNum + '</span>' +
                '<span class="rewrite-hint-text">' + hintText + '</span>' +
            '</div>';
        });
        hintsHTML += '</div>';
    }

    container.classList.add('rewrite-area');
    container.innerHTML = hintsHTML +
        '<textarea class="rewrite-textarea" id="discussionRewriteTextarea" placeholder="여기에 다시 작성해보세요..."></textarea>' +
        '<div class="rewrite-actions">' +
            '<span class="rewrite-wordcount" id="discussionRewriteWordCount">0 words</span>' +
            '<button class="rewrite-save-btn" onclick="handleDiscussionRewriteSave()">' +
                '<i class="fas fa-save"></i> 저장하기' +
            '</button>' +
        '</div>' +
        '<div class="rewrite-feedback" id="discussionRewriteFeedback"></div>';

    var textarea = document.getElementById('discussionRewriteTextarea');
    if (textarea && prefillText) {
        textarea.value = prefillText;
        var words = prefillText.trim().split(/\s+/).filter(function(w) { return w.length > 0; });
        var countEl = document.getElementById('discussionRewriteWordCount');
        if (countEl) countEl.textContent = words.length + ' words';
    }

    if (textarea) {
        textarea.addEventListener('input', function() {
            var words = this.value.trim().split(/\s+/).filter(function(w) { return w.length > 0; });
            var countEl = document.getElementById('discussionRewriteWordCount');
            if (countEl) countEl.textContent = words.length + ' words';
        });
    }

    _toggleDiscussionModelAnswer(false);
}

// ============================================================
// ③ 비교 화면 (원본 vs 재작성 + 모범답안)
// ============================================================

function _showDiscussionCompare(userAnswer, rewriteText) {
    var container = document.getElementById('discussionResultUserAnswer');
    var answersRow = document.querySelector('#discussionExplainScreen .discussion-answers-row');
    var draftLabel = answersRow ? answersRow.querySelector('.discussion-result-section:first-child .discussion-result-label') : null;

    if (draftLabel) draftLabel.textContent = 'Your Writing';

    if (container) {
        var hasOriginal = userAnswer && userAnswer.trim();
        container.classList.remove('rewrite-area');

        container.innerHTML =
            '<div class="compare-block">' +
                '<div class="compare-label">Your Draft</div>' +
                '<pre class="compare-text">' + _escapeHtmlDiscussion(hasOriginal ? userAnswer : '(답안이 없습니다)') + '</pre>' +
            '</div>' +
            '<div class="compare-block compare-block-rewrite">' +
                '<div class="compare-label">Your Rewrite</div>' +
                '<pre class="compare-text">' + _escapeHtmlDiscussion(rewriteText || '(답안이 없습니다)') + '</pre>' +
            '</div>' +
            '<button class="rewrite-start-btn" onclick="_discussionRewriteAgain()">' +
                '<i class="fas fa-pen"></i> 다시 작성하기' +
            '</button>';
    }

    _toggleDiscussionModelAnswer(true);
}

// ============================================================
// 공통 헬퍼
// ============================================================

function _toggleDiscussionModelAnswer(show) {
    var answersRow = document.querySelector('#discussionExplainScreen .discussion-answers-row');
    var modelSection = answersRow ? answersRow.querySelector('.discussion-result-section:last-child') : null;
    var bulletsSection = document.getElementById('discussionResultBullets');

    if (modelSection) modelSection.style.display = show ? '' : 'none';
    if (bulletsSection) bulletsSection.parentElement.style.display = show ? '' : 'none';
}

function _showDiscussionDraft(userAnswer) {
    var container = document.getElementById('discussionResultUserAnswer');
    var answersRow = document.querySelector('#discussionExplainScreen .discussion-answers-row');
    var draftLabel = answersRow ? answersRow.querySelector('.discussion-result-section:first-child .discussion-result-label') : null;

    if (draftLabel) draftLabel.textContent = 'Your Draft';
    if (container) {
        container.classList.remove('rewrite-area');
        container.innerHTML = '';
        var pre = document.createElement('pre');
        pre.className = 'discussion-original-text';
        pre.textContent = userAnswer || '(답안이 없습니다)';
        container.appendChild(pre);
    }

    _toggleDiscussionModelAnswer(true);
}

function _escapeHtmlDiscussion(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window._discussionRewriteAgain = function() {
    var rewriteBlock = document.querySelector('#discussionExplainScreen .compare-block-rewrite .compare-text');
    var prefill = rewriteBlock ? rewriteBlock.textContent : '';
    if (prefill === '(답안이 없습니다)') prefill = '';
    _showDiscussionRewrite(prefill);
};

/**
 * 프로필 정보 가져오기 (data → sessionStorage → window → 기본값)
 */
function _getDiscussionProfiles(data) {
    if (data && data.profiles && data.profiles.student1 && data.profiles.student2) {
        return data.profiles;
    }

    var saved = sessionStorage.getItem('discussionProfiles');
    if (saved) {
        try { return JSON.parse(saved); } catch(e) { /* ignore */ }
    }

    if (window.currentDiscussionProfiles) {
        return window.currentDiscussionProfiles;
    }

    return { student1: { name: 'Student 1' }, student2: { name: 'Student 2' } };
}

// ============================================================
// 모범 답안 렌더링
// ============================================================

function _renderDiscussionSampleAnswer(data, profiles) {
    var sampleAnswerElement = document.getElementById('discussionResultSampleAnswer');
    if (!sampleAnswerElement || !data.question || !data.question.sampleAnswer) return;

    var formattedAnswer = data.question.sampleAnswer.replace(/<br\s*\/?>/gi, '\n');
    formattedAnswer = replaceStudentNamesInResult(formattedAnswer, profiles);

    if (data.question.bullets && Array.isArray(data.question.bullets)) {
        var sortedBullets = data.question.bullets.slice().sort(function(a, b) {
            return (b.sentence ? b.sentence.length : 0) - (a.sentence ? a.sentence.length : 0);
        });

        sortedBullets.forEach(function(bullet) {
            if (bullet.sentence) {
                var sentenceText = bullet.sentence.replace(/<br\s*\/?>/gi, '\n');
                var replacedSentence = replaceStudentNamesInResult(sentenceText, profiles);

                if (formattedAnswer.indexOf(replacedSentence) !== -1) {
                    formattedAnswer = formattedAnswer.replace(
                        replacedSentence,
                        '{{HL_S_' + bullet.bulletNum + '}}' + replacedSentence + '{{HL_E_' + bullet.bulletNum + '}}'
                    );
                }
            }
        });
    }

    sampleAnswerElement.textContent = formattedAnswer;
    var htmlContent = sampleAnswerElement.innerHTML;

    var bulletCount = (data.question.bullets || []).length;
    for (var i = 1; i <= bulletCount; i++) {
        var regex = new RegExp('\\{\\{HL_S_' + i + '\\}\\}([\\s\\S]*?)\\{\\{HL_E_' + i + '\\}\\}', 'g');
        htmlContent = htmlContent.replace(
            regex,
            '<span class="bullet-highlight" data-bullet="' + i + '" onclick="showDiscussionBulletFeedback(' + i + ', event)">$1</span>'
        );
    }

    sampleAnswerElement.innerHTML = htmlContent;
}

// ============================================================
// 재작성 저장
// ============================================================

async function handleDiscussionRewriteSave() {
    var textarea = document.getElementById('discussionRewriteTextarea');
    var feedbackEl = document.getElementById('discussionRewriteFeedback');
    if (!textarea) return;

    var text = textarea.value.trim();
    if (!text) {
        if (feedbackEl) {
            feedbackEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> 내용을 입력해주세요';
            feedbackEl.className = 'rewrite-feedback rewrite-feedback-warn';
        }
        return;
    }

    var words = text.split(/\s+/).filter(function(w) { return w.length > 0; });
    var ctx = _discussionDbContext;
    if (!ctx) {
        if (feedbackEl) {
            feedbackEl.innerHTML = '<i class="fas fa-times-circle"></i> 저장 정보를 찾을 수 없습니다';
            feedbackEl.className = 'rewrite-feedback rewrite-feedback-warn';
        }
        return;
    }

    var saveBtn = document.querySelector('#discussionExplainScreen .rewrite-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

    try {
        var existing = await getStudyResultV3(ctx.userId, ctx.sectionType, ctx.moduleNumber, ctx.week, ctx.day);
        var rewriteRecord = (existing && existing.rewrite_record) ? existing.rewrite_record : {};
        rewriteRecord.discussion = {
            text: text,
            wordCount: words.length,
            savedAt: new Date().toISOString()
        };

        await upsertRewriteRecord(ctx.userId, ctx.sectionType, ctx.moduleNumber, ctx.week, ctx.day, rewriteRecord);

        // 저장 성공 → ③ 비교 화면으로 전환
        var userAnswer = _discussionData ? _discussionData.userAnswer : '';
        _showDiscussionCompare(userAnswer, text);

    } catch (err) {
        console.error('❌ [토론형] rewrite 저장 실패:', err);
        if (feedbackEl) {
            feedbackEl.innerHTML = '<i class="fas fa-times-circle"></i> 저장에 실패했습니다';
            feedbackEl.className = 'rewrite-feedback rewrite-feedback-warn';
        }
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장하기'; }
    }
}

// ============================================================
// Bullet 피드백 / 문제 토글
// ============================================================

function showDiscussionBulletFeedback(bulletNum, event) {
    var bulletsElement = document.getElementById('discussionResultBullets');
    if (!bulletsElement || !window.discussionBulletsData) return;

    var bullet = window.discussionBulletsData.find(function(b) { return b.bulletNum === bulletNum; });
    if (!bullet) return;

    document.querySelectorAll('.bullet-highlight').forEach(function(h) { h.classList.remove('active'); });
    event.target.classList.add('active');

    bulletsElement.innerHTML =
        '<span class="bullet-badge">Bullet ' + bullet.bulletNum + '</span>' +
        '<div class="bullet-section">' +
            '<div class="bullet-label"><i class="fas fa-thumbtack"></i> ETS가 요구하는 필수 요소</div>' +
            bullet.ets +
        '</div>' +
        '<div class="bullet-section">' +
            '<div class="bullet-label"><i class="fas fa-award"></i> 효과적인 작성 전략</div>' +
            '<span class="key-text">' + bullet.strategy + '</span>' +
        '</div>';

    bulletsElement.classList.add('show');
    setTimeout(function() { bulletsElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100);
}

function toggleDiscussionProblem() {
    var problemDiv = document.getElementById('discussionResultProblem');
    var toggleIcon = document.getElementById('discussionProblemToggleIcon');
    var toggleButton = document.querySelector('.discussion-result-toggle');

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
 */
function replaceStudentNamesInResult(text, profiles) {
    if (!text) return text;
    return text
        .replace(/\{name1\}/g, profiles.student1.name)
        .replace(/\{name2\}/g, profiles.student2.name);
}

// 전역 노출
window.showDiscussionResult = showDiscussionResult;
window.handleDiscussionRewriteSave = handleDiscussionRewriteSave;

console.log('✅ [Writing] discussion-result.js 로드 완료');
