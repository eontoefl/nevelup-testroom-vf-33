// ================================================
// 이메일 작성 채점 화면 로직
// ================================================

var _emailRewriteMode = null;
var _emailDbContext = null;

/**
 * 이메일 채점 화면 표시
 * @param {Object} data - 채점 데이터
 * @param {string} mode - 'initial' | 'current'
 */
function showEmailResult(data, mode) {
    console.log('📧 [이메일 채점] 결과 화면 표시');

    if (!data) {
        console.error('❌ 채점 데이터가 없습니다.');
        return;
    }

    _emailRewriteMode = mode || null;
    _emailDbContext = data._dbContext || null;
    var existingRewrite = data._rewrite || null;
    var isRewriteTarget = (mode === 'initial' && !existingRewrite);

    // 단어 수 표시
    var wordCountElement = document.getElementById('emailResultWordCount');
    if (wordCountElement) {
        wordCountElement.textContent = data.wordCount || 0;
    }

    var wordCountFeedbackElement = document.getElementById('emailWordCountFeedback');
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
        var situationElement = document.getElementById('emailResultSituation');
        if (situationElement && (data.question.scenario || data.question.situation)) {
            situationElement.textContent = data.question.scenario || data.question.situation;
        }

        var taskElement = document.getElementById('emailResultTask');
        if (taskElement && data.question.task) {
            taskElement.textContent = data.question.task;
        }

        if (data.question.instructions && Array.isArray(data.question.instructions)) {
            data.question.instructions.forEach(function(instruction, index) {
                var instructionElement = document.getElementById('emailResultInstruction' + (index + 1));
                if (instructionElement) {
                    instructionElement.textContent = instruction;
                }
            });
        }

        var toElement = document.getElementById('emailResultTo');
        if (toElement && data.question.to) {
            toElement.textContent = data.question.to;
        }

        var subjectElement = document.getElementById('emailResultSubject');
        if (subjectElement && data.question.subject) {
            subjectElement.textContent = data.question.subject;
        }
    }

    // ── Your Draft 영역 ──
    var userAnswerContainer = document.getElementById('emailResultUserAnswer');
    if (userAnswerContainer) {
        if (isRewriteTarget) {
            // 재작성 모드: bullet 힌트 + textarea
            var bullets = (data.question && data.question.bullets) || [];
            var hintsHTML = '';
            if (bullets.length > 0) {
                hintsHTML = '<div class="rewrite-hints">' +
                    '<div class="rewrite-hints-title"><i class="fas fa-lightbulb"></i> 만점 포인트를 참고하여 다시 작성해보세요</div>';
                bullets.forEach(function(bullet) {
                    hintsHTML += '<div class="rewrite-hint-item">' +
                        '<span class="rewrite-hint-badge">Bullet ' + bullet.bulletNum + '</span>' +
                        '<span class="rewrite-hint-text">' + (bullet.must || bullet.key || '') + '</span>' +
                    '</div>';
                });
                hintsHTML += '</div>';
            }

            userAnswerContainer.outerHTML =
                '<div id="emailResultUserAnswer" class="rewrite-area">' +
                    hintsHTML +
                    '<textarea class="rewrite-textarea" id="emailRewriteTextarea" placeholder="여기에 다시 작성해보세요...">' +
                    '</textarea>' +
                    '<div class="rewrite-actions">' +
                        '<span class="rewrite-wordcount" id="emailRewriteWordCount">0 words</span>' +
                        '<button class="rewrite-save-btn" onclick="handleEmailRewriteSave()">' +
                            '<i class="fas fa-save"></i> 저장하기' +
                        '</button>' +
                    '</div>' +
                    '<div class="rewrite-feedback" id="emailRewriteFeedback"></div>' +
                '</div>';

            // textarea 단어 수 카운트
            var textarea = document.getElementById('emailRewriteTextarea');
            if (textarea) {
                textarea.addEventListener('input', function() {
                    var words = this.value.trim().split(/\s+/).filter(function(w) { return w.length > 0; });
                    var countEl = document.getElementById('emailRewriteWordCount');
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

    // 내 답안 메타 정보 (To, Subject)
    var userToElement = document.getElementById('emailResultUserTo');
    var userSubjectElement = document.getElementById('emailResultUserSubject');
    if (userToElement && data.question && data.question.to) {
        userToElement.textContent = data.question.to;
    }
    if (userSubjectElement && data.question && data.question.subject) {
        userSubjectElement.textContent = data.question.subject;
    }

    // ── Model Answer + Bullets 영역 (재작성 대상이면 잠금) ──
    var answersRow = document.querySelector('#emailExplainScreen .email-answers-row');
    var modelSection = answersRow ? answersRow.querySelector('.email-result-section:last-child') : null;
    var bulletsSection = document.getElementById('emailResultBullets');

    if (isRewriteTarget) {
        // Model Answer 잠금
        if (modelSection) modelSection.style.display = 'none';
        if (bulletsSection) bulletsSection.parentElement.style.display = 'none';
    } else {
        if (modelSection) modelSection.style.display = '';
        if (bulletsSection) bulletsSection.parentElement.style.display = '';
    }

    // 모범 답안 표시 (Bullet 하이라이트 추가)
    _renderEmailSampleAnswer(data);

    // Bullet 피드백 데이터 저장
    window.emailBulletsData = data.question && data.question.bullets ? data.question.bullets : [];

    // 피드백 박스 초기화
    if (bulletsSection) {
        bulletsSection.classList.remove('show');
        bulletsSection.innerHTML = '';
    }

    // Your Draft 라벨 업데이트
    var draftLabel = answersRow ? answersRow.querySelector('.email-result-section:first-child .email-result-label') : null;
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
 * 모범 답안 렌더링 (내부 함수)
 */
function _renderEmailSampleAnswer(data) {
    var sampleAnswerElement = document.getElementById('emailResultSampleAnswer');
    if (!sampleAnswerElement || !data.question || !data.question.sampleAnswer) return;

    var formattedAnswer = data.question.sampleAnswer.replace(/<br\s*\/?>/gi, '\n');

    if (data.question.bullets && Array.isArray(data.question.bullets)) {
        var sortedBullets = data.question.bullets.slice().sort(function(a, b) {
            return (b.sample ? b.sample.length : 0) - (a.sample ? a.sample.length : 0);
        });

        sortedBullets.forEach(function(bullet) {
            if (bullet.sample) {
                var sampleText = bullet.sample.replace(/<br\s*\/?>/gi, '\n');
                if (formattedAnswer.indexOf(sampleText) !== -1) {
                    formattedAnswer = formattedAnswer.replace(
                        sampleText,
                        '{{HL_S_' + bullet.bulletNum + '}}' + sampleText + '{{HL_E_' + bullet.bulletNum + '}}'
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
            '<span class="bullet-highlight" data-bullet="' + i + '" onclick="showBulletFeedback(' + i + ', event)">$1</span>'
        );
    }

    sampleAnswerElement.innerHTML = htmlContent;

    // 모범 답안 메타 정보
    var sampleToElement = document.getElementById('emailResultSampleTo');
    var sampleSubjectElement = document.getElementById('emailResultSampleSubject');
    if (sampleToElement && data.question.to) sampleToElement.textContent = data.question.to;
    if (sampleSubjectElement && data.question.subject) sampleSubjectElement.textContent = data.question.subject;
}

/**
 * 재작성 저장
 */
async function handleEmailRewriteSave() {
    var textarea = document.getElementById('emailRewriteTextarea');
    var feedbackEl = document.getElementById('emailRewriteFeedback');
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
    var ctx = _emailDbContext;
    if (!ctx) {
        if (feedbackEl) {
            feedbackEl.innerHTML = '<i class="fas fa-times-circle"></i> 저장 정보를 찾을 수 없습니다';
            feedbackEl.className = 'rewrite-feedback rewrite-feedback-warn';
        }
        return;
    }

    // 저장 버튼 비활성
    var saveBtn = document.querySelector('#emailExplainScreen .rewrite-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

    try {
        // 기존 rewrite_record 가져오기 (다른 유형의 rewrite 보존)
        var existing = await getStudyResultV3(ctx.userId, ctx.sectionType, ctx.moduleNumber, ctx.week, ctx.day);
        var rewriteRecord = (existing && existing.rewrite_record) ? existing.rewrite_record : {};
        rewriteRecord.email = {
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
        var answersRow = document.querySelector('#emailExplainScreen .email-answers-row');
        var modelSection = answersRow ? answersRow.querySelector('.email-result-section:last-child') : null;
        var bulletsParent = document.getElementById('emailResultBullets');

        setTimeout(function() {
            if (modelSection) modelSection.style.display = '';
            if (bulletsParent) bulletsParent.parentElement.style.display = '';
        }, 500);

    } catch (err) {
        console.error('❌ [이메일] rewrite 저장 실패:', err);
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
function showBulletFeedback(bulletNum, event) {
    var bulletsElement = document.getElementById('emailResultBullets');
    if (!bulletsElement || !window.emailBulletsData) return;

    var bullet = window.emailBulletsData.find(function(b) { return b.bulletNum === bulletNum; });
    if (!bullet) return;

    document.querySelectorAll('.bullet-highlight').forEach(function(h) { h.classList.remove('active'); });
    event.target.classList.add('active');

    bulletsElement.innerHTML =
        '<span class="bullet-badge">Bullet ' + bullet.bulletNum + '</span>' +
        '<div class="bullet-section">' +
            '<div class="bullet-label"><i class="fas fa-thumbtack"></i> 꼭 말해야하는 부분</div>' +
            bullet.must +
        '</div>' +
        '<div class="bullet-section">' +
            '<div class="bullet-label"><i class="fas fa-award"></i> 만점 포인트들</div>' +
            bullet.points +
        '</div>' +
        '<div class="bullet-section">' +
            '<div class="bullet-label"><i class="fas fa-key"></i> 핵심</div>' +
            '<span class="key-text">' + bullet.key + '</span>' +
        '</div>';

    bulletsElement.classList.add('show');
    setTimeout(function() { bulletsElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100);
}

/**
 * 문제 보기 토글
 */
function toggleEmailProblem() {
    var problemDiv = document.getElementById('emailResultProblem');
    var toggleIcon = document.getElementById('emailProblemToggleIcon');
    var toggleButton = document.querySelector('.email-result-toggle');

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

// 전역 노출
window.showEmailResult = showEmailResult;
window.handleEmailRewriteSave = handleEmailRewriteSave;

console.log('✅ [Writing] email-result.js 로드 완료');
