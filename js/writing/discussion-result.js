// ================================================
// 토론형 글쓰기 채점 화면 로직
// ================================================

var _discussionRewriteMode = null;
var _discussionDbContext = null;

/**
 * 토론형 채점 화면 표시
 * @param {Object} data - 채점 데이터
 * @param {string} mode - 'initial' | 'current'
 */
function showDiscussionResult(data, mode) {
    console.log('💬 [토론형 채점] 결과 화면 표시');

    if (!data) {
        console.error('❌ 채점 데이터가 없습니다.');
        return;
    }

    _discussionRewriteMode = mode || null;
    _discussionDbContext = data._dbContext || null;
    var existingRewrite = data._rewrite || null;
    var isRewriteTarget = (mode === 'initial' && !existingRewrite);

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

    // ── Your Draft 영역 ──
    var userAnswerContainer = document.getElementById('discussionResultUserAnswer');
    if (userAnswerContainer) {
        if (isRewriteTarget) {
            // 재작성 모드: bullet 힌트 + textarea
            var bullets = (data.question && data.question.bullets) || [];
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

            userAnswerContainer.outerHTML =
                '<div id="discussionResultUserAnswer" class="rewrite-area">' +
                    hintsHTML +
                    '<textarea class="rewrite-textarea" id="discussionRewriteTextarea" placeholder="여기에 다시 작성해보세요...">' +
                    '</textarea>' +
                    '<div class="rewrite-actions">' +
                        '<span class="rewrite-wordcount" id="discussionRewriteWordCount">0 words</span>' +
                        '<button class="rewrite-save-btn" onclick="handleDiscussionRewriteSave()">' +
                            '<i class="fas fa-save"></i> 저장하기' +
                        '</button>' +
                    '</div>' +
                    '<div class="rewrite-feedback" id="discussionRewriteFeedback"></div>' +
                '</div>';

            // textarea 단어 수 카운트
            var textarea = document.getElementById('discussionRewriteTextarea');
            if (textarea) {
                textarea.addEventListener('input', function() {
                    var words = this.value.trim().split(/\s+/).filter(function(w) { return w.length > 0; });
                    var countEl = document.getElementById('discussionRewriteWordCount');
                    if (countEl) countEl.textContent = words.length + ' words';
                });
            }
        } else if (existingRewrite) {
            // 이미 재작성 완료: 재작성본 표시
            userAnswerContainer.textContent = existingRewrite.text || data.userAnswer || '(답안이 없습니다)';
        } else {
            // current 모드 또는 기본: 원본 답안 표시
            userAnswerContainer.textContent = data.userAnswer || '(답안이 없습니다)';
        }
    }

    // ── Model Answer + Bullets 영역 (재작성 대상이면 잠금) ──
    var answersRow = document.querySelector('#discussionExplainScreen .discussion-answers-row');
    var modelSection = answersRow ? answersRow.querySelector('.discussion-result-section:last-child') : null;
    var bulletsSection = document.getElementById('discussionResultBullets');

    if (isRewriteTarget) {
        if (modelSection) modelSection.style.display = 'none';
        if (bulletsSection) bulletsSection.parentElement.style.display = 'none';
    } else {
        if (modelSection) modelSection.style.display = '';
        if (bulletsSection) bulletsSection.parentElement.style.display = '';
    }

    // 모범 답안 표시 (Bullet 하이라이트 추가)
    _renderDiscussionSampleAnswer(data, profiles);

    // Bullet 피드백 데이터 저장
    window.discussionBulletsData = data.question && data.question.bullets ? data.question.bullets : [];

    // 피드백 박스 초기화
    if (bulletsSection) {
        bulletsSection.classList.remove('show');
        bulletsSection.innerHTML = '';
    }

    // Your Draft 라벨 업데이트
    var draftLabel = answersRow ? answersRow.querySelector('.discussion-result-section:first-child .discussion-result-label') : null;
    if (draftLabel) {
        if (isRewriteTarget) {
            draftLabel.textContent = 'Rewrite';
        } else if (existingRewrite) {
            draftLabel.textContent = 'Your Rewrite';
        } else {
            draftLabel.textContent = 'Your Draft';
        }
    }
}

/**
 * 프로필 정보 가져오기 (data → sessionStorage → window → 기본값)
 */
function _getDiscussionProfiles(data) {
    if (data.profiles && data.profiles.student1 && data.profiles.student2) {
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

/**
 * 모범 답안 렌더링 (내부 함수)
 */
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

/**
 * 재작성 저장
 */
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

    // 저장 버튼 비활성
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

        if (feedbackEl) {
            feedbackEl.innerHTML = '<i class="fas fa-check-circle"></i> 저장되었습니다!';
            feedbackEl.className = 'rewrite-feedback rewrite-feedback-correct';
        }

        // textarea 비활성
        textarea.disabled = true;

        // 잠금 해제: Model Answer + Bullets 표시
        var answersRow = document.querySelector('#discussionExplainScreen .discussion-answers-row');
        var modelSection = answersRow ? answersRow.querySelector('.discussion-result-section:last-child') : null;
        var bulletsParent = document.getElementById('discussionResultBullets');

        setTimeout(function() {
            if (modelSection) modelSection.style.display = '';
            if (bulletsParent) bulletsParent.parentElement.style.display = '';
        }, 500);

    } catch (err) {
        console.error('❌ [토론형] rewrite 저장 실패:', err);
        if (feedbackEl) {
            feedbackEl.innerHTML = '<i class="fas fa-times-circle"></i> 저장에 실패했습니다';
            feedbackEl.className = 'rewrite-feedback rewrite-feedback-warn';
        }
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장하기'; }
    }
}

/**
 * Bullet 피드백 표시 (하이라이트 클릭 시)
 */
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

/**
 * 문제 보기 토글
 */
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
