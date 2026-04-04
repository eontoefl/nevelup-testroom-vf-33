// ================================================
// 이메일 작성 채점 화면 로직
// ================================================
//
// 실전풀이 해설 (mode=initial) 3단계:
//   ① 원본 글 확인 → ② 재작성 → ③ 비교 (원본 vs 재작성) + 모범답안
//   이미 재작성 있으면 바로 ③
//
// 다시풀기 해설 (mode=current):
//   원본 글 + 모범답안 (재작성 없음, 기존과 동일)
// ================================================

var _emailDbContext = null;
var _emailData = null;

/**
 * 이메일 채점 화면 표시
 */
function showEmailResult(data, mode) {
    console.log('📧 [이메일 채점] 결과 화면 표시, mode=' + mode);

    if (!data) {
        console.error('❌ 채점 데이터가 없습니다.');
        return;
    }

    _emailDbContext = data._dbContext || null;
    _emailData = data;
    var existingRewrite = data._rewrite || null;

    // 단어 수 표시
    var wordCountElement = document.getElementById('emailResultWordCount');
    if (wordCountElement) {
        wordCountElement.textContent = data.wordCount || 0;
    }

    // 단어 수 피드백
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

    // 모범 답안 렌더링 (어느 단계에서든 준비해둠)
    _renderEmailSampleAnswer(data);

    // Bullet 피드백 데이터 저장
    window.emailBulletsData = data.question && data.question.bullets ? data.question.bullets : [];

    // 피드백 박스 초기화
    var bulletsSection = document.getElementById('emailResultBullets');
    if (bulletsSection) {
        bulletsSection.classList.remove('show');
        bulletsSection.innerHTML = '';
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

    // ── 단계 분기 ──
    if (mode === 'initial') {
        if (existingRewrite) {
            // 이미 재작성 있음 → 바로 ③ 비교
            _showEmailCompare(data.userAnswer, existingRewrite.text);
        } else {
            // 재작성 없음 → ① 원본 보기
            _showEmailOriginal(data.userAnswer);
        }
    } else {
        // current 모드 (다시풀기): 원본 + 모범답안, 재작성 없음
        _showEmailDraft(data.userAnswer);
    }
}

// ============================================================
// ① 원본 글 보기 (실전풀이, 재작성 전)
// ============================================================

function _showEmailOriginal(userAnswer) {
    var container = document.getElementById('emailResultUserAnswer');
    var answersRow = document.querySelector('#emailExplainScreen .email-answers-row');
    var draftLabel = answersRow ? answersRow.querySelector('.email-result-section:first-child .email-result-label') : null;

    // 라벨
    if (draftLabel) draftLabel.textContent = 'Your Draft';

    // 원본 글 + 다시 작성하기 버튼
    if (container) {
        var hasAnswer = userAnswer && userAnswer.trim();
        container.innerHTML = '';

        // 원본 글 표시
        var pre = document.createElement('pre');
        pre.className = 'email-original-text';
        pre.textContent = hasAnswer ? userAnswer : '작성한 답안이 없습니다.';
        if (!hasAnswer) pre.className += ' empty-answer';
        container.appendChild(pre);

        // 다시 작성하기 버튼
        var btn = document.createElement('button');
        btn.className = 'rewrite-start-btn';
        btn.innerHTML = '<i class="fas fa-pen"></i> ' + (hasAnswer ? '다시 작성하기' : '작성해보기');
        btn.addEventListener('click', function() {
            _showEmailRewrite(null);
        });
        container.appendChild(btn);
    }

    // 모범답안 + Bullet 숨김
    _toggleEmailModelAnswer(false);
}

// ============================================================
// ② 재작성 화면
// ============================================================

function _showEmailRewrite(prefillText) {
    var container = document.getElementById('emailResultUserAnswer');
    var answersRow = document.querySelector('#emailExplainScreen .email-answers-row');
    var draftLabel = answersRow ? answersRow.querySelector('.email-result-section:first-child .email-result-label') : null;

    if (draftLabel) draftLabel.textContent = 'Rewrite';

    if (!container) return;

    var data = _emailData;
    var bullets = (data && data.question && data.question.bullets) || [];

    // 힌트 생성
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

    container.innerHTML = hintsHTML +
        '<textarea class="rewrite-textarea" id="emailRewriteTextarea" placeholder="여기에 다시 작성해보세요..."></textarea>' +
        '<div class="rewrite-actions">' +
            '<span class="rewrite-wordcount" id="emailRewriteWordCount">0 words</span>' +
            '<button class="rewrite-save-btn" onclick="handleEmailRewriteSave()">' +
                '<i class="fas fa-save"></i> 저장하기' +
            '</button>' +
        '</div>' +
        '<div class="rewrite-feedback" id="emailRewriteFeedback"></div>';

    // 이전 재작성 글 프리필
    var textarea = document.getElementById('emailRewriteTextarea');
    if (textarea && prefillText) {
        textarea.value = prefillText;
        var words = prefillText.trim().split(/\s+/).filter(function(w) { return w.length > 0; });
        var countEl = document.getElementById('emailRewriteWordCount');
        if (countEl) countEl.textContent = words.length + ' words';
    }

    // 단어 수 카운트 이벤트
    if (textarea) {
        textarea.addEventListener('input', function() {
            var words = this.value.trim().split(/\s+/).filter(function(w) { return w.length > 0; });
            var countEl = document.getElementById('emailRewriteWordCount');
            if (countEl) countEl.textContent = words.length + ' words';
        });
    }

    // 모범답안 + Bullet 숨김 유지
    _toggleEmailModelAnswer(false);
}

// ============================================================
// ③ 비교 화면 (원본 vs 재작성 + 모범답안)
// ============================================================

function _showEmailCompare(userAnswer, rewriteText) {
    var container = document.getElementById('emailResultUserAnswer');
    var answersRow = document.querySelector('#emailExplainScreen .email-answers-row');
    var draftLabel = answersRow ? answersRow.querySelector('.email-result-section:first-child .email-result-label') : null;

    if (draftLabel) draftLabel.textContent = 'Your Writing';

    if (container) {
        var hasOriginal = userAnswer && userAnswer.trim();

        container.innerHTML =
            '<div class="compare-block">' +
                '<div class="compare-label">Your Draft</div>' +
                '<pre class="compare-text">' + _escapeHtmlEmail(hasOriginal ? userAnswer : '(답안이 없습니다)') + '</pre>' +
            '</div>' +
            '<div class="compare-block compare-block-rewrite">' +
                '<div class="compare-label">Your Rewrite</div>' +
                '<pre class="compare-text">' + _escapeHtmlEmail(rewriteText || '(답안이 없습니다)') + '</pre>' +
            '</div>' +
            '<button class="rewrite-start-btn" onclick="_emailRewriteAgain()">' +
                '<i class="fas fa-pen"></i> 다시 작성하기' +
            '</button>';
    }

    // 모범답안 + Bullet 표시
    _toggleEmailModelAnswer(true);
}

// ============================================================
// 공통 헬퍼
// ============================================================

/** 모범답안 + Bullet 보이기/숨기기 */
function _toggleEmailModelAnswer(show) {
    var answersRow = document.querySelector('#emailExplainScreen .email-answers-row');
    var modelSection = answersRow ? answersRow.querySelector('.email-result-section:last-child') : null;
    var bulletsSection = document.getElementById('emailResultBullets');

    if (modelSection) modelSection.style.display = show ? '' : 'none';
    if (bulletsSection) bulletsSection.parentElement.style.display = show ? '' : 'none';
}

/** 다시풀기(current) 모드: 단순 원본 표시 */
function _showEmailDraft(userAnswer) {
    var container = document.getElementById('emailResultUserAnswer');
    var answersRow = document.querySelector('#emailExplainScreen .email-answers-row');
    var draftLabel = answersRow ? answersRow.querySelector('.email-result-section:first-child .email-result-label') : null;

    if (draftLabel) draftLabel.textContent = 'Your Draft';
    if (container) {
        container.innerHTML = '';
        var pre = document.createElement('pre');
        pre.className = 'email-original-text';
        pre.textContent = userAnswer || '(답안이 없습니다)';
        container.appendChild(pre);
    }

    // 모범답안 + Bullet 표시
    _toggleEmailModelAnswer(true);
}

/** HTML 이스케이프 */
function _escapeHtmlEmail(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/** ③에서 "다시 작성하기" 클릭 → ②로 (기존 재작성 프리필) */
window._emailRewriteAgain = function() {
    // 비교 화면의 재작성 글을 가져옴
    var rewriteBlock = document.querySelector('#emailExplainScreen .compare-block-rewrite .compare-text');
    var prefill = rewriteBlock ? rewriteBlock.textContent : '';
    if (prefill === '(답안이 없습니다)') prefill = '';
    _showEmailRewrite(prefill);
};

// ============================================================
// 모범 답안 렌더링
// ============================================================

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

// ============================================================
// 재작성 저장
// ============================================================

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

    var saveBtn = document.querySelector('#emailExplainScreen .rewrite-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }

    try {
        var existing = await getStudyResultV3(ctx.userId, ctx.sectionType, ctx.moduleNumber, ctx.week, ctx.day);
        var rewriteRecord = (existing && existing.rewrite_record) ? existing.rewrite_record : {};
        rewriteRecord.email = {
            text: text,
            wordCount: words.length,
            savedAt: new Date().toISOString()
        };

        await upsertRewriteRecord(ctx.userId, ctx.sectionType, ctx.moduleNumber, ctx.week, ctx.day, rewriteRecord);

        // 저장 성공 → ③ 비교 화면으로 전환
        var userAnswer = _emailData ? _emailData.userAnswer : '';
        _showEmailCompare(userAnswer, text);

    } catch (err) {
        console.error('❌ [이메일] rewrite 저장 실패:', err);
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
