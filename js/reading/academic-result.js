// ============================================
// Reading - Academic 결과(해설) 화면
// v2 — 유형별 뱃지, 지문확인 버튼, insertion 재풀이
// ============================================

/**
 * 번역 수에 맞춰 원문을 문장 단위로 분리 (academic 전용)
 * ※ cleanContent에는 마커가 **이미 제거된** 순수 텍스트가 전달되어야 함
 */
function splitToMatchTranslations_ac(cleanContent, translationCount) {
    if (translationCount <= 0) {
        return cleanContent.split(/\n\n+/).filter(s => s.trim());
    }
    
    if (cleanContent.includes('#|#') || cleanContent.includes('##')) {
        let raw = cleanContent.replace(/<<([^>]+)>>/g, '$1').replace(/\[\[([^\]]+)\]\]/g, '$1');
        const sentences = raw.split(/(?:##|#\|\|#|#\|#)/).map(s => s.trim()).filter(s => s);
        if (sentences.length === translationCount) return sentences;
    }
    
    const paragraphs = cleanContent.split(/\n\n+/).filter(s => s.trim());
    if (paragraphs.length === translationCount) return paragraphs;
    
    const allText = cleanContent.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    const rawSplit = allText.split(/(?<=[.!?](?:\s*\([A-Z]\))?)\s+(?=[A-Z\("])/).filter(s => s.trim());
    const merged = [];
    rawSplit.forEach(s => {
        if (/^\([A-Z]\)$/.test(s.trim()) && merged.length > 0) {
            merged[merged.length - 1] += ' ' + s.trim();
        } else {
            merged.push(s);
        }
    });
    if (merged.length === translationCount) return merged;
    
    const simpleSplit = allText.split(/(?<=[.!?])\s+(?=[A-Z\("])/).filter(s => s.trim());
    const merged2 = [];
    simpleSplit.forEach(s => {
        if (/^\([A-Z]\)$/.test(s.trim()) && merged2.length > 0) {
            merged2[merged2.length - 1] += ' ' + s.trim();
        } else {
            merged2.push(s);
        }
    });
    if (merged2.length === translationCount) return merged2;
    
    const diffs = [
        { s: paragraphs, d: Math.abs(paragraphs.length - translationCount) },
        { s: merged, d: Math.abs(merged.length - translationCount) },
        { s: merged2, d: Math.abs(merged2.length - translationCount) }
    ];
    diffs.sort((a, b) => a.d - b.d);
    return diffs[0].s;
}

// ── 유형 뱃지 라벨 매핑 ──
var _AC_TYPE_BADGE = {
    highlight: 'Vocabulary',
    simplification: 'Simplification',
    insertion: 'Insertion',
    select_sentence: 'Select Sentence'
};

// 현재 해설 모드 저장 (재풀이 판정용)
var _academicExplainMode = null;

// 현재 활성화된 지문확인 상태 (setIdx + qIdx)
var _acPassageHighlight = { setIdx: null, qIdx: null };

// insertion 재풀이용 이벤트 리스너 정리 추적
var _acInsertionRetryCleanup = null;

// ============================================================
// 결과 화면 표시 (진입점)
// ============================================================

function showAcademicResults(data, mode) {
    console.log('📊 [아카데믹리딩] 결과 화면 표시');
    
    if (!data) {
        console.error('❌ 결과 데이터가 없습니다');
        return;
    }
    
    _academicExplainMode = mode || null;
    _acPassageHighlight = { setIdx: null, qIdx: null };
    _acInsertionRetryCleanup = null;
    const academicResults = data;
    
    let totalCorrect = 0;
    let totalQuestions = 0;
    
    academicResults.forEach(setResult => {
        setResult.answers.forEach(answer => {
            totalQuestions++;
            if (answer.isCorrect) totalCorrect++;
        });
    });
    
    const totalIncorrect = totalQuestions - totalCorrect;
    const totalScore = Math.round((totalCorrect / totalQuestions) * 100);
    
    document.getElementById('academicResultScoreValue').textContent = totalScore + '%';
    document.getElementById('academicResultCorrectCount').textContent = totalCorrect;
    document.getElementById('academicResultIncorrectCount').textContent = totalIncorrect;
    document.getElementById('academicResultTotalCount').textContent = totalQuestions;
    
    const detailsContainer = document.getElementById('academicResultDetails');
    let detailsHTML = '';
    
    academicResults.forEach((setResult, setIdx) => {
        detailsHTML += renderAcademicSetResult(setResult, setIdx, mode);
    });
    
    detailsContainer.innerHTML = detailsHTML;
    bindAcademicToggleEvents();
}

// ============================================================
// 세트별 결과 렌더링
// ============================================================

function renderAcademicSetResult(setResult, setIdx, mode) {
    const rawContent = setResult.passage.contentRaw || setResult.passage.content;
    let baseContent = rawContent.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

    // ── 1) 번역 매칭용 cleanContent: 모든 마커 제거 (기존 로직 유지) ──
    let cleanContent = baseContent
        .replace(/\([A-D]\)\s*/g, '')
        .replace(/\{[A-D]\}\s*/g, '')
        .replace(/<<([^>]+)>>/g, '$1')
        .replace(/\[\[([^\]]+)\]\]/g, '$1');

    const translations = setResult.passage.translations || [];
    const sentences = splitToMatchTranslations_ac(cleanContent, translations.length);
    
    // ── 2) 번역 쌍 HTML (기존과 동일) ──
    let sentencesHTML = '';
    sentences.forEach((sentence, idx) => {
        const translation = translations[idx] || '';
        
        let highlightedSentence = escapeHtml(sentence).replace(/\n/g, '<br>');
        if (setResult.passage.interactiveWords) {
            setResult.passage.interactiveWords.forEach(wordObj => {
                const regex = new RegExp(`(?<![\\w-])${wordObj.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'gi');
                highlightedSentence = highlightedSentence.replace(regex, 
                    (match) => `<span class="interactive-word" data-word="${wordObj.word}" data-translation="${escapeHtml(wordObj.translation)}" data-explanation="${escapeHtml(wordObj.explanation)}">${match}</span>`
                );
            });
        }
        
        sentencesHTML += `
            <div class="sentence-pair">
                <div class="sentence-original">${highlightedSentence}</div>
                ${translation && translation.trim() ? `<div class="sentence-translation">${escapeHtml(translation)}</div>` : ''}
            </div>
        `;
    });

    // ── 3) 지문확인용 HTML: 마커를 숨겨진 span으로 변환 (새 로직) ──
    let markerHTML = _buildPassageMarkerHTML(baseContent, setIdx);
    
    // ── 4) 문제 카드 HTML ──
    let answersHTML = '';
    setResult.answers.forEach((answer, qIdx) => {
        answersHTML += renderAcademicAnswers(answer, qIdx, setResult.setId || setIdx, mode, setIdx);
    });
    
    const setUniqueId = 'ac-set-' + setIdx;
    
    return `
        <div class="result-set-section" id="${setUniqueId}">
            <h3 class="result-section-title">
                <i class="fas fa-book-open"></i> Set ${setIdx + 1}: ${escapeHtml(setResult.mainTitle)}
            </h3>
            
            <div class="rd-passage-panel" id="${setUniqueId}-passage">
                <h4 class="result-passage-title">${escapeHtml(setResult.passage.title)}</h4>
                <div class="ac-passage-marker-layer" id="${setUniqueId}-marker-layer" style="display:none;">
                    ${markerHTML}
                </div>
                <div class="sentence-translations">
                    ${sentencesHTML}
                </div>
            </div>
            
            ${answersHTML}
        </div>
    `;
}

// ============================================================
// 지문 마커 HTML 빌드 (숨겨진 상태, 활성화 시에만 보임)
// ============================================================

function _buildPassageMarkerHTML(baseContent, setIdx) {
    // 구분자 → 줄바꿈 변환
    let text = baseContent
        .replace(/#\|\|#/g, '\n')
        .replace(/#\|#/g, ' ')
        .replace(/##/g, '\n\n')
        .replace(/\\n/g, '\n');

    // 마커를 플레이스홀더로 임시 치환 → 수동 이스케이프 → 플레이스홀더를 HTML span으로 교체
    // escapeHtml()은 DOM 기반이라 null 문자가 안전하지 않을 수 있으므로 수동 이스케이프 사용
    var placeholders = [];
    var phIndex = 0;

    function addPlaceholder(htmlSpan) {
        var ph = '%%ACPH' + phIndex + '%%';
        placeholders.push({ ph: ph, html: htmlSpan });
        phIndex++;
        return ph;
    }

    // <<단어>> → placeholder
    text = text.replace(/<<([^>]+)>>/g, function(match, word) {
        return addPlaceholder('<span class="ac-res-highlight-word" data-set="' + setIdx + '">' + _escapeHtmlManual(word) + '</span>');
    });

    // [[문장]] → placeholder
    text = text.replace(/\[\[([^\]]+)\]\]/g, function(match, sentence) {
        return addPlaceholder('<span class="ac-res-simplification" data-set="' + setIdx + '">' + _escapeHtmlManual(sentence) + '</span>');
    });

    // (A)~(D) → placeholder
    text = text.replace(/\(([A-D])\)/g, function(match, letter) {
        var markerNum = letter.charCodeAt(0) - 64;
        return addPlaceholder('<span class="ac-res-insertion-marker" data-set="' + setIdx + '" data-marker="' + markerNum + '">' + letter + '</span>');
    });

    // {A}~{D} → placeholder
    text = text.replace(/\{([A-D])\}/g, function(match, letter) {
        var markerNum = letter.charCodeAt(0) - 64;
        return addPlaceholder('<span class="ac-res-ss-marker" data-set="' + setIdx + '" data-marker="' + markerNum + '">' + letter + '</span>');
    });

    // 일반 텍스트 수동 이스케이프 (%%ACPH...%% 플레이스홀더는 영향 없음)
    var html = _escapeHtmlManual(text);

    // 플레이스홀더를 실제 HTML span으로 교체
    placeholders.forEach(function(item) {
        html = html.replace(item.ph, item.html);
    });

    // 줄바꿈 처리
    html = html.replace(/\n/g, '<br>');

    return html;
}

/* escapeHtml_passagePreserve 삭제 — _buildPassageMarkerHTML에서 placeholder 방식으로 대체 */

// ============================================================
// 문제별 결과 렌더링
// ============================================================

function renderAcademicAnswers(answer, qIdx, setId, mode, setIdx) {
    var qType = answer.questionType || 'normal';
    var isCorrect = answer.isCorrect;
    var isRetryTarget = (mode === 'initial' && !isCorrect);
    
    // insertion 유형의 재풀이는 별도 렌더링
    if (isRetryTarget && qType === 'insertion') {
        return _renderInsertionRetryQuestion(answer, qIdx, setId, setIdx);
    }
    
    // 기타 유형의 재풀이는 기존 방식
    if (isRetryTarget) {
        return _renderAcademicRetryQuestion(answer, qIdx, setId, setIdx);
    }
    
    // 맞은 문제 또는 current 모드
    return _renderAcademicCorrectOrReviewed(answer, qIdx, setId, isCorrect, qType, setIdx);
}

// ── 맞은 문제 / current 모드 렌더링 ──
function _renderAcademicCorrectOrReviewed(answer, qIdx, setId, isCorrect, qType, setIdx) {
    var correctIcon = isCorrect 
        ? '<i class="fas fa-check-circle"></i>' 
        : '<i class="fas fa-times-circle"></i>';
    
    var questionNum = answer.questionNum || 'Q' + (qIdx + 1);
    var toggleId = 'rd-toggle-' + setId + '-' + qIdx;
    
    var userAnswerText = answer.userAnswer && answer.options && answer.options[answer.userAnswer - 1]
        ? answer.options[answer.userAnswer - 1].label + ') ' + answer.options[answer.userAnswer - 1].text
        : '미응답';
    
    var correctAnswerText = answer.options && answer.options[answer.correctAnswer - 1]
        ? answer.options[answer.correctAnswer - 1].label + ') ' + answer.options[answer.correctAnswer - 1].text
        : '정답 없음';

    // 유형 뱃지 (normal 제외)
    var badgeHTML = _renderTypeBadge(qType);

    // "지문에서 확인하기" 버튼 (normal 제외)
    var passageBtnHTML = _renderPassageCheckButton(qType, setIdx, qIdx, answer);

    // insertion 유형: 삽입 문장 박스 + 정답 위치
    var insertionInfoHTML = '';
    if (qType === 'insertion') {
        var sentenceText = _extractInsertionSentence(answer.question || '');
        var correctLabel = getLabelFromIndex(answer.correctAnswer);
        insertionInfoHTML = '<div class="ac-res-insertion-box">' +
            '<div class="ac-res-insertion-box-label"><i class="fas fa-quote-left"></i> 삽입 대상 문장</div>' +
            '<div class="ac-res-insertion-box-text">' + escapeHtml(sentenceText) + '</div>' +
            '</div>' +
            '<div class="rd-answer-row">' +
                '<span class="rd-answer-label">✓ 정답 위치:</span>' +
                '<span class="rd-answer-value correct">(' + correctLabel + ') 위치</span>' +
            '</div>';
    }
    
    return '<div class="rd-result-item ' + (isCorrect ? 'correct' : 'incorrect') + '" id="ac-q-' + setIdx + '-' + qIdx + '">' +
        '<div class="rd-result-icon">' + correctIcon + '</div>' +
        '<div class="rd-result-content">' +
            '<div class="rd-question-text">' +
                '<strong>' + questionNum + '.</strong> ' +
                badgeHTML +
                escapeHtml(answer.question) +
            '</div>' +
            (answer.questionTranslation ? '<div class="question-translation"><i class="fas fa-comment-dots"></i> 문제 해석: ' + escapeHtml(answer.questionTranslation) + '</div>' : '') +
            insertionInfoHTML +
            '<div class="rd-answer-row">' +
                '<span class="rd-answer-label">' + (isCorrect ? '✓' : '✗') + ' 내 답변:</span>' +
                '<span class="rd-answer-value ' + (isCorrect ? 'correct' : 'incorrect') + '">' + escapeHtml(userAnswerText) + '</span>' +
            '</div>' +
            (!isCorrect ? '<div class="rd-answer-row"><span class="rd-answer-label">✓ 정답:</span><span class="rd-answer-value correct">' + escapeHtml(correctAnswerText) + '</span></div>' : '') +
            passageBtnHTML +
            renderAcademicOptionsExplanation(answer, toggleId) +
        '</div>' +
    '</div>';
}

// ── 일반 재풀이 렌더링 (normal/highlight/simplification/select_sentence) ──
function _renderAcademicRetryQuestion(answer, qIdx, setId, setIdx) {
    var qType = answer.questionType || 'normal';
    var retryId = 'retry-ac-' + setId + '-' + qIdx;
    var questionNum = answer.questionNum || 'Q' + (qIdx + 1);
    var userOpt = answer.options && answer.options[(answer.userAnswer || 0) - 1];
    var userAnswerText = userOpt ? userOpt.label + ') ' + userOpt.text : '미응답';

    var badgeHTML = _renderTypeBadge(qType);
    var passageBtnHTML = _renderPassageCheckButton(qType, setIdx, qIdx, answer);
    
    var optionBtnsHTML = '';
    if (Array.isArray(answer.options)) {
        answer.options.forEach(function(option, idx) {
            var label = option.label || getLabelFromIndex(idx + 1);
            var text = option.text || option;
            optionBtnsHTML += '<button class="retry-option-btn" ' +
                'data-retry-id="' + retryId + '" ' +
                'data-selected-index="' + (idx + 1) + '" ' +
                'data-correct-answer="' + answer.correctAnswer + '" ' +
                'onclick="handleRetrySelect(this)">' +
                '<span class="retry-option-label">' + label + ')</span>' +
                '<span class="retry-option-text">' + escapeHtml(typeof text === 'string' ? text : text) + '</span>' +
                '</button>';
        });
    }
    
    var toggleId = 'rd-toggle-' + setId + '-' + qIdx;
    var hiddenExplanation = renderAcademicOptionsExplanation(answer, toggleId);
    
    return '<div class="rd-result-item incorrect" id="' + retryId + '-container" data-set-idx="' + setIdx + '" data-q-idx="' + qIdx + '">' +
        '<div class="rd-result-icon"><i class="fas fa-times-circle"></i></div>' +
        '<div class="rd-result-content">' +
            '<div class="rd-question-text"><strong>' + questionNum + '.</strong> ' + badgeHTML + escapeHtml(answer.question) + '</div>' +
            (answer.questionTranslation ? '<div class="question-translation"><i class="fas fa-comment-dots"></i> 문제 해석: ' + escapeHtml(answer.questionTranslation) + '</div>' : '') +
            '<div class="rd-answer-row">' +
                '<span class="rd-answer-label">\u2717 1차 답변:</span>' +
                '<span class="rd-answer-value incorrect">' + escapeHtml(userAnswerText) + '</span>' +
            '</div>' +
            passageBtnHTML +
            '<div class="retry-section" id="' + retryId + '">' +
                '<div class="retry-header"><i class="fas fa-redo"></i> 다시 풀어보기</div>' +
                '<div class="retry-feedback" id="' + retryId + '-feedback"></div>' +
                '<div class="retry-options">' + optionBtnsHTML + '</div>' +
            '</div>' +
            '<div class="retry-locked-area" id="' + retryId + '-locked">' +
                '<div class="rd-answer-row" id="' + retryId + '-correct-row" style="display:none;">' +
                    '<span class="rd-answer-label">\u2713 정답:</span>' +
                    '<span class="rd-answer-value correct" id="' + retryId + '-correct-text"></span>' +
                '</div>' +
                '<div id="' + retryId + '-explanation" style="display:none;">' + hiddenExplanation + '</div>' +
            '</div>' +
        '</div>' +
    '</div>';
}

// ============================================================
// insertion 재풀이 — 지문 마커 클릭 방식
// ============================================================

function _renderInsertionRetryQuestion(answer, qIdx, setId, setIdx) {
    var retryId = 'retry-ac-' + setId + '-' + qIdx;
    var questionNum = answer.questionNum || 'Q' + (qIdx + 1);
    var userOpt = answer.options && answer.options[(answer.userAnswer || 0) - 1];
    var userAnswerText = userOpt ? userOpt.label + ') ' + userOpt.text : '미응답';
    var userLabel = getLabelFromIndex(answer.userAnswer);

    var sentenceText = _extractInsertionSentence(answer.question || '');
    var badgeHTML = _renderTypeBadge('insertion');

    var toggleId = 'rd-toggle-' + setId + '-' + qIdx;
    var hiddenExplanation = renderAcademicOptionsExplanation(answer, toggleId);

    return '<div class="rd-result-item incorrect" id="' + retryId + '-container" data-set-idx="' + setIdx + '" data-q-idx="' + qIdx + '">' +
        '<div class="rd-result-icon"><i class="fas fa-times-circle"></i></div>' +
        '<div class="rd-result-content">' +
            '<div class="rd-question-text"><strong>' + questionNum + '.</strong> ' + badgeHTML + escapeHtml(answer.question) + '</div>' +
            (answer.questionTranslation ? '<div class="question-translation"><i class="fas fa-comment-dots"></i> 문제 해석: ' + escapeHtml(answer.questionTranslation) + '</div>' : '') +
            '<div class="ac-res-insertion-box">' +
                '<div class="ac-res-insertion-box-label"><i class="fas fa-quote-left"></i> 삽입 대상 문장</div>' +
                '<div class="ac-res-insertion-box-text">' + escapeHtml(sentenceText) + '</div>' +
            '</div>' +
            '<div class="rd-answer-row">' +
                '<span class="rd-answer-label">\u2717 1차 답변:</span>' +
                '<span class="rd-answer-value incorrect">(' + escapeHtml(userLabel) + ') 위치</span>' +
            '</div>' +
            '<div class="retry-section" id="' + retryId + '">' +
                '<div class="retry-header"><i class="fas fa-redo"></i> 다시 풀어보기</div>' +
                '<div class="retry-feedback" id="' + retryId + '-feedback"></div>' +
                '<div class="ac-res-insertion-retry-guide">' +
                    '<p>지문에서 올바른 삽입 위치를 다시 선택해보세요.</p>' +
                    '<button class="ac-res-btn-passage ac-res-btn-retry-insertion" ' +
                        'onclick="_acStartInsertionRetry(' + setIdx + ',' + qIdx + ',\'' + retryId + '\',' + answer.correctAnswer + ',' + answer.userAnswer + ')">' +
                        '<i class="fas fa-map-marker-alt"></i> 지문에서 다시 풀기' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="retry-locked-area" id="' + retryId + '-locked">' +
                '<div class="rd-answer-row" id="' + retryId + '-correct-row" style="display:none;">' +
                    '<span class="rd-answer-label">\u2713 정답:</span>' +
                    '<span class="rd-answer-value correct" id="' + retryId + '-correct-text"></span>' +
                '</div>' +
                '<div id="' + retryId + '-explanation" style="display:none;">' + hiddenExplanation + '</div>' +
            '</div>' +
        '</div>' +
    '</div>';
}

/**
 * insertion 재풀이: "지문에서 다시 풀기" 버튼 클릭 시
 */
function _acStartInsertionRetry(setIdx, qIdx, retryId, correctAnswer, firstAnswer) {
    var setUniqueId = 'ac-set-' + setIdx;
    var passagePanel = document.getElementById(setUniqueId + '-passage');
    var markerLayer = document.getElementById(setUniqueId + '-marker-layer');
    if (!passagePanel || !markerLayer) return;

    // 이전 하이라이트 정리
    _acClearAllPassageHighlights();

    // 마커 레이어 표시
    markerLayer.style.display = '';

    // insertion 마커만 활성화 (클릭 가능 상태)
    var markers = markerLayer.querySelectorAll('.ac-res-insertion-marker[data-set="' + setIdx + '"]');
    markers.forEach(function(m) {
        m.classList.add('ac-res-marker-active', 'ac-res-marker-clickable');
        m.classList.remove('ac-res-marker-correct', 'ac-res-marker-wrong');
    });

    // 플로팅 삽입 문장 표시
    var questionCard = document.getElementById(retryId + '-container');
    var sentenceBox = questionCard ? questionCard.querySelector('.ac-res-insertion-box-text') : null;
    var sentenceText = sentenceBox ? sentenceBox.textContent : '';
    _acShowFloatingInsertionSentence(passagePanel, sentenceText);

    // 지문으로 스크롤
    passagePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 이전 이벤트 정리
    if (_acInsertionRetryCleanup) {
        _acInsertionRetryCleanup();
        _acInsertionRetryCleanup = null;
    }

    // 마커 클릭 핸들러 등록
    var wrongAttempts = [];
    function onMarkerClick(e) {
        var marker = e.target.closest('.ac-res-insertion-marker.ac-res-marker-clickable');
        if (!marker) return;

        var clickedNum = parseInt(marker.dataset.marker, 10);
        if (!clickedNum) return;

        // 이미 오답으로 처리된 마커 무시
        if (wrongAttempts.indexOf(clickedNum) !== -1) return;

        var feedbackEl = document.getElementById(retryId + '-feedback');

        if (clickedNum === correctAnswer) {
            // ── 정답 ──
            marker.classList.add('ac-res-marker-correct');
            marker.classList.remove('ac-res-marker-clickable');

            // 나머지 마커 비활성화
            markers.forEach(function(m) {
                var mn = parseInt(m.dataset.marker, 10);
                m.classList.remove('ac-res-marker-clickable');
                if (mn !== correctAnswer) {
                    m.classList.add('ac-res-marker-wrong');
                }
            });

            if (feedbackEl) {
                feedbackEl.innerHTML = '<span class="retry-feedback-correct"><i class="fas fa-check-circle"></i> 정답입니다!</span>';
            }

            // 플로팅 제거
            _acRemoveFloatingInsertionSentence(passagePanel);

            // 이벤트 정리
            markerLayer.removeEventListener('click', onMarkerClick);
            _acInsertionRetryCleanup = null;

            // 컨테이너 스타일 변경
            var container = document.getElementById(retryId + '-container');
            if (container) {
                container.classList.remove('incorrect');
                container.classList.add('correct');
                var iconEl = container.querySelector('.rd-result-icon');
                if (iconEl) iconEl.innerHTML = '<i class="fas fa-check-circle"></i>';
            }

            // 2차 답변 표시
            var retrySection = document.getElementById(retryId);
            if (retrySection) {
                var correctLabel = getLabelFromIndex(correctAnswer);
                var answerRow = document.createElement('div');
                answerRow.className = 'rd-answer-row';
                answerRow.innerHTML = '<span class="rd-answer-label">\u2713 2차 답변:</span>' +
                    '<span class="rd-answer-value correct">(' + correctLabel + ') 위치</span>';
                retrySection.parentNode.insertBefore(answerRow, retrySection);
            }

            // 1차 시도 이력
            if (wrongAttempts.length > 0) {
                var historyRow = document.createElement('div');
                historyRow.className = 'rd-answer-row';
                var historyLabels = wrongAttempts.map(function(n) { return '(' + getLabelFromIndex(n) + ')'; }).join(', ');
                historyRow.innerHTML = '<span class="rd-answer-label">2차 오답 시도:</span>' +
                    '<span class="rd-answer-value incorrect">' + historyLabels + '</span>';
                retrySection.parentNode.insertBefore(historyRow, retrySection);
            }

            // 정답 행 + 해설 공개
            var correctRow = document.getElementById(retryId + '-correct-row');
            var correctTextEl = document.getElementById(retryId + '-correct-text');
            if (correctRow && correctTextEl) {
                correctTextEl.textContent = '(' + getLabelFromIndex(correctAnswer) + ') 위치';
                correctRow.style.display = '';
            }
            var explanationArea = document.getElementById(retryId + '-explanation');
            if (explanationArea) explanationArea.style.display = '';

            // 재풀이 섹션 비활성
            if (retrySection) {
                retrySection.style.opacity = '0.5';
                retrySection.style.pointerEvents = 'none';
            }

            // 문제 카드로 스크롤 복귀
            setTimeout(function() {
                var card = document.getElementById(retryId + '-container');
                if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 800);

        } else {
            // ── 오답 ──
            marker.classList.add('ac-res-marker-wrong');
            marker.classList.remove('ac-res-marker-clickable');
            wrongAttempts.push(clickedNum);

            if (feedbackEl) {
                feedbackEl.innerHTML = '<span class="retry-feedback-wrong"><i class="fas fa-times-circle"></i> (' + getLabelFromIndex(clickedNum) + ') 위치가 아닙니다. 다시 선택해보세요.</span>';
            }
        }
    }

    markerLayer.addEventListener('click', onMarkerClick);

    // 정리 함수 등록
    _acInsertionRetryCleanup = function() {
        markerLayer.removeEventListener('click', onMarkerClick);
        _acRemoveFloatingInsertionSentence(passagePanel);
    };
}

/**
 * 플로팅 삽입 문장 표시
 */
function _acShowFloatingInsertionSentence(passagePanel, sentenceText) {
    _acRemoveFloatingInsertionSentence(passagePanel);
    var floating = document.createElement('div');
    floating.className = 'ac-res-floating-sentence';
    floating.innerHTML = '<div class="ac-res-floating-label"><i class="fas fa-quote-left"></i> 삽입할 문장</div>' +
        '<div class="ac-res-floating-text">' + escapeHtml(sentenceText) + '</div>';
    passagePanel.insertBefore(floating, passagePanel.firstChild);
}

function _acRemoveFloatingInsertionSentence(passagePanel) {
    if (!passagePanel) return;
    var existing = passagePanel.querySelector('.ac-res-floating-sentence');
    if (existing) existing.remove();
}

// ============================================================
// 유형 뱃지 렌더링 (normal 제외)
// ============================================================

function _renderTypeBadge(qType) {
    if (qType === 'normal' || !_AC_TYPE_BADGE[qType]) return '';
    return '<span class="ac-res-type-badge ac-res-badge-' + qType + '">' + _AC_TYPE_BADGE[qType] + '</span> ';
}

// ============================================================
// "지문에서 확인하기" 버튼 렌더링 (normal 제외)
// ============================================================

function _renderPassageCheckButton(qType, setIdx, qIdx, answer) {
    if (qType === 'normal') return '';
    return '<button class="ac-res-btn-passage" onclick="_acShowInPassage(' + setIdx + ',' + qIdx + ',\'' + qType + '\',' + answer.correctAnswer + ',' + (answer.userAnswer || 0) + ',' + (answer.isCorrect ? 'true' : 'false') + ')">' +
        '<i class="fas fa-search"></i> 지문에서 확인하기' +
    '</button>';
}

// ============================================================
// "지문에서 확인하기" 클릭 핸들러
// ============================================================

function _acShowInPassage(setIdx, qIdx, qType, correctAnswer, userAnswer, isCorrect) {
    var setUniqueId = 'ac-set-' + setIdx;
    var passagePanel = document.getElementById(setUniqueId + '-passage');
    var markerLayer = document.getElementById(setUniqueId + '-marker-layer');
    if (!passagePanel || !markerLayer) return;

    // 이전 하이라이트 + insertion 재풀이 정리
    _acClearAllPassageHighlights();
    if (_acInsertionRetryCleanup) {
        _acInsertionRetryCleanup();
        _acInsertionRetryCleanup = null;
    }

    // 마커 레이어 표시
    markerLayer.style.display = '';

    // 지문으로 스크롤
    passagePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 유형별 활성화
    switch (qType) {
        case 'highlight':
            markerLayer.querySelectorAll('.ac-res-highlight-word[data-set="' + setIdx + '"]').forEach(function(el) {
                el.classList.add('ac-res-highlight-active');
            });
            _acPassageHighlight = { setIdx: setIdx, qIdx: qIdx };
            break;

        case 'simplification':
            markerLayer.querySelectorAll('.ac-res-simplification[data-set="' + setIdx + '"]').forEach(function(el) {
                el.classList.add('ac-res-simplification-active');
            });
            _acPassageHighlight = { setIdx: setIdx, qIdx: qIdx };
            break;

        case 'insertion':
            markerLayer.querySelectorAll('.ac-res-insertion-marker[data-set="' + setIdx + '"]').forEach(function(m) {
                var mn = parseInt(m.dataset.marker, 10);
                m.classList.add('ac-res-marker-active');
                if (mn === correctAnswer) {
                    m.classList.add('ac-res-marker-correct');
                } else if (!isCorrect && mn === userAnswer) {
                    m.classList.add('ac-res-marker-wrong');
                }
            });
            _acPassageHighlight = { setIdx: setIdx, qIdx: qIdx };
            break;

        case 'select_sentence':
            markerLayer.querySelectorAll('.ac-res-ss-marker[data-set="' + setIdx + '"]').forEach(function(m) {
                var mn = parseInt(m.dataset.marker, 10);
                m.classList.add('ac-res-marker-active');
                if (mn === correctAnswer) {
                    m.classList.add('ac-res-marker-correct');
                } else if (!isCorrect && mn === userAnswer) {
                    m.classList.add('ac-res-marker-wrong');
                }
            });
            _acPassageHighlight = { setIdx: setIdx, qIdx: qIdx };
            break;
    }
}

/**
 * 모든 세트의 지문 하이라이트 초기화
 */
function _acClearAllPassageHighlights() {
    // highlight words
    document.querySelectorAll('.ac-res-highlight-word.ac-res-highlight-active').forEach(function(el) {
        el.classList.remove('ac-res-highlight-active');
    });
    // simplification
    document.querySelectorAll('.ac-res-simplification.ac-res-simplification-active').forEach(function(el) {
        el.classList.remove('ac-res-simplification-active');
    });
    // insertion markers
    document.querySelectorAll('.ac-res-insertion-marker').forEach(function(el) {
        el.classList.remove('ac-res-marker-active', 'ac-res-marker-correct', 'ac-res-marker-wrong', 'ac-res-marker-clickable');
    });
    // select_sentence markers
    document.querySelectorAll('.ac-res-ss-marker').forEach(function(el) {
        el.classList.remove('ac-res-marker-active', 'ac-res-marker-correct', 'ac-res-marker-wrong');
    });
    // marker layers
    document.querySelectorAll('.ac-passage-marker-layer').forEach(function(el) {
        el.style.display = 'none';
    });
    // floating sentence
    document.querySelectorAll('.ac-res-floating-sentence').forEach(function(el) {
        el.remove();
    });

    _acPassageHighlight = { setIdx: null, qIdx: null };
}

// ============================================================
// 보기 상세 해설 렌더링 (변경 없음)
// ============================================================

function renderAcademicOptionsExplanation(answer, toggleId) {
    if (!answer.options || answer.options.length === 0 || !answer.options[0].label) {
        return '';
    }
    
    const userAnswerLabel = getLabelFromIndex(answer.userAnswer);
    const correctAnswerLabel = getLabelFromIndex(answer.correctAnswer);
    
    let optionsHTML = '';
    answer.options.forEach((option) => {
        const isCorrectOption = option.label === correctAnswerLabel;
        const isUserAnswer = option.label === userAnswerLabel;
        
        let badge = '';
        if (isCorrectOption) {
            badge = '<span class="option-badge correct-badge">\u2713 정답</span>';
        } else if (isUserAnswer) {
            badge = '<span class="option-badge incorrect-badge">\u2717 내가 선택한 오답</span>';
        }
        
        optionsHTML += `
            <div class="option-item">
                <div class="option-header">
                    <span class="option-label">${option.label})</span>
                    <span class="option-text">${escapeHtml(option.text)}</span>
                    ${badge}
                </div>
                ${option.translation ? `<div class="option-translation">${escapeHtml(option.translation)}</div>` : ''}
                ${option.explanation ? `
                <div class="option-explanation ${isCorrectOption ? 'correct' : 'incorrect'}">
                    <strong><i class="fas ${isCorrectOption ? 'fa-lightbulb' : 'fa-circle-exclamation'}"></i> ${isCorrectOption ? '정답 이유:' : '오답 이유:'}</strong><br>${escapeHtml(option.explanation)}
                </div>
                ` : ''}
            </div>
        `;
    });
    
    return `
        <div class="options-explanation-container">
            <button class="btn-toggle-options" onclick="toggleAcademicOptions('${toggleId}')">
                <span class="toggle-text">보기 상세 해설 펼치기</span>
                <i class="fas fa-chevron-down"></i>
            </button>
            <div class="options-explanation-content" id="${toggleId}" style="display: none;">
                ${optionsHTML}
            </div>
        </div>
    `;
}

// ============================================================
// 유틸리티
// ============================================================

/**
 * 수동 HTML 이스케이프 (DOM 불필요, 플레이스홀더 안전)
 */
function _escapeHtmlManual(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 문제 텍스트에서 삽입 대상 문장 추출 ("..." 안의 문장)
 */
function _extractInsertionSentence(questionText) {
    var match = questionText.match(/"([^"]+)"/);
    return match ? match[1] : '';
}

// ============================================================
// 전역 노출
// ============================================================

window.showAcademicResults = showAcademicResults;
window.renderAcademicSetResult = renderAcademicSetResult;
window.renderAcademicAnswers = renderAcademicAnswers;
window.renderAcademicOptionsExplanation = renderAcademicOptionsExplanation;
window._acShowInPassage = _acShowInPassage;
window._acStartInsertionRetry = _acStartInsertionRetry;

console.log('✅ [Reading] academic-result.js v2 로드 완료');
