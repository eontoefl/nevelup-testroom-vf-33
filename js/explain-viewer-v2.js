/**
 * ================================================
 * explain-viewer-v2.js
 * 해설보기 버튼 전용 — 유형별 해설 화면
 * ================================================
 * 
 * V2 리팩토링: reading-retake-result.js의 세부결과/해설 부분을 분리
 * 데이터는 StageSelector.firstAttemptResult / secondAttemptResult에서 읽음
 */

console.log('🔵 [V2] explain-viewer-v2.js 로드 시작');

/**
 * 해설보기 메인 함수 — showExplainV2()에서 호출됨
 */
function showReadingExplainV2() {
    console.log('📖 [V2] 리딩 해설 화면 표시');

    var firstResult = window.StageSelector && window.StageSelector.firstAttemptResult;
    var secondResult = window.StageSelector && window.StageSelector.secondAttemptResult;

    if (!firstResult) {
        alert('1차 풀이를 먼저 완료해주세요.');
        return;
    }

    // 데이터 준비: 기존 코드와 호환되는 형태로 설정
    // secondAttemptAnswers 추출
    var secondAttemptAnswers = {};
    if (secondResult && secondResult.secondAttemptAnswers) {
        secondAttemptAnswers = secondResult.secondAttemptAnswers;
    }

    // 기존 해설 렌더링 함수들이 사용하는 전역 변수 설정
    window.currentSecondAttemptAnswers = secondAttemptAnswers;
    window.currentResultData = secondResult || null;

    // 해설 탭 화면 표시
    showExplainTabScreen(firstResult, secondResult, secondAttemptAnswers);
}

/**
 * 해설 탭 화면 — 빈칸채우기 / 일상리딩1 / 일상리딩2 / 아카데믹 탭
 */
function showExplainTabScreen(firstResult, secondResult, secondAttemptAnswers) {
    // 모든 화면 숨기기
    document.querySelectorAll('.screen, .result-screen, .test-screen').forEach(function(s) {
        s.style.display = 'none';
    });

    // 기존 세부결과 HTML 화면들을 탭 방식으로 전환
    // 먼저 첫 번째 탭(빈칸채우기) 표시
    showExplainTab('fillblanks', firstResult, secondResult, secondAttemptAnswers);
}

/**
 * 특정 유형의 해설 탭 표시
 */
function showExplainTab(componentType, firstResult, secondResult, secondAttemptAnswers) {
    console.log('📖 [V2] 해설 탭 표시:', componentType);

    var screenMap = {
        'fillblanks': 'readingRetakeDetailFillBlanksScreen',
        'daily1': 'readingRetakeDetailDaily1Screen',
        'daily2': 'readingRetakeDetailDaily2Screen',
        'academic': 'readingRetakeDetailAcademicScreen'
    };

    // 모든 화면 숨기기
    document.querySelectorAll('.screen, .result-screen, .test-screen').forEach(function(s) {
        s.style.display = 'none';
    });

    var screenId = screenMap[componentType];
    if (!screenId) {
        console.error('❌ [V2] 알 수 없는 componentType:', componentType);
        return;
    }

    // 1차 결과에서 componentResults 추출
    var componentResults = firstResult.componentResults || [];

    // 1차/2차 결과 배열 구성
    var firstResults = [];
    var secondResults = [];

    if (secondResult) {
        firstResults = secondResult.firstAttempt ? secondResult.firstAttempt.results : [];
        secondResults = secondResult.secondAttempt ? secondResult.secondAttempt.results : [];
    }

    // 해당 컴포넌트 필터링
    var targetComponents = componentResults.filter(function(comp) {
        return comp.componentType === componentType;
    });

    if (targetComponents.length === 0) {
        console.warn('⚠️ [V2] 해당 유형의 컴포넌트 없음:', componentType);
        alert('해당 유형의 문제 데이터가 없습니다.');
        return;
    }

    // 시작 인덱스 계산
    var startIndex = 0;
    for (var i = 0; i < componentResults.length; i++) {
        if (componentResults[i].componentType === componentType) break;
        var ans = componentResults[i].answers || [];
        startIndex += ans.length;
    }

    // 통계 계산
    var stats = calculateComponentStats(componentType, componentResults, secondAttemptAnswers);

    // 유형별 렌더링 분기
    switch (componentType) {
        case 'fillblanks':
            renderFillBlanksExplain(targetComponents, secondAttemptAnswers, componentResults, firstResults, secondResults, startIndex, stats);
            break;
        case 'daily1':
            renderDaily1Explain(targetComponents, secondAttemptAnswers, componentResults, firstResults, secondResults, startIndex, stats);
            break;
        case 'daily2':
            renderDaily2Explain(targetComponents, secondAttemptAnswers, componentResults, firstResults, secondResults, startIndex, stats);
            break;
        case 'academic':
            renderAcademicExplain(targetComponents, secondAttemptAnswers, componentResults, firstResults, secondResults, startIndex, stats);
            break;
    }

    // 화면 표시
    var screen = document.getElementById(screenId);
    if (screen) {
        screen.style.display = 'block';
    }

    // 뒤로가기 버튼을 "과제 화면으로" 로 변경
    replaceBackButtons(screen);

    // 네비게이션 탭 추가
    addExplainTabNavigation(screen, componentType, firstResult, secondResult, secondAttemptAnswers);
}

/**
 * 컴포넌트별 통계 계산
 */
function calculateComponentStats(componentType, componentResults, secondAttemptAnswers) {
    var firstTotal = 0, firstCorrect = 0;
    var secondTotal = 0, secondCorrect = 0;
    var globalIndex = 0;

    componentResults.forEach(function(comp) {
        var answers = comp.answers || [];
        answers.forEach(function(answer) {
            if (comp.componentType === componentType) {
                firstTotal++;
                if (answer.isCorrect) firstCorrect++;

                var secondAnswer = secondAttemptAnswers['q' + globalIndex];
                secondTotal++;
                if (secondAnswer) {
                    if (secondAnswer.isCorrect) secondCorrect++;
                } else {
                    if (answer.isCorrect) secondCorrect++;
                }
            }
            globalIndex++;
        });
    });

    return {
        firstTotal: firstTotal,
        firstCorrect: firstCorrect,
        secondTotal: secondTotal,
        secondCorrect: secondCorrect,
        firstPercent: firstTotal > 0 ? Math.round((firstCorrect / firstTotal) * 100) : 0,
        secondPercent: secondTotal > 0 ? Math.round((secondCorrect / secondTotal) * 100) : 0,
        improvement: secondCorrect - firstCorrect
    };
}

/**
 * 빈칸채우기 해설 렌더링
 */
function renderFillBlanksExplain(components, secondAttemptAnswers, allResults, firstResults, secondResults, startIndex, stats) {
    // 요약 정보 표시
    setTextIfExists('fillBlanksTotal', stats.firstTotal);
    setTextIfExists('fillBlanksFirst', stats.firstCorrect + '/' + stats.firstTotal + ' (' + stats.firstPercent + '%)');
    setTextIfExists('fillBlanksSecond', stats.secondCorrect + '/' + stats.secondTotal + ' (' + stats.secondPercent + '%)');
    setTextIfExists('fillBlanksImprovement', (stats.improvement > 0 ? '+' : '') + stats.improvement + '문제');

    // sessionStorage에 1차 결과 설정 (기존 렌더링 함수 호환용)
    var firstAttemptCompat = {
        componentResults: allResults
    };

    // 세트별 렌더링
    var container = document.getElementById('fillBlanksDetailSets');
    if (!container) return;
    container.innerHTML = '';

    components.forEach(function(comp, setIndex) {
        var setBlock = document.createElement('div');
        setBlock.className = 'result-section';

        var answers = comp.answers || [];
        var firstCorrect = answers.filter(function(a) { return a.isCorrect; }).length;

        // 2차 정답 계산
        var secondCorrect = 0;
        answers.forEach(function(answer, localIndex) {
            var qIndex = startIndex + setIndex * 10 + localIndex;
            var sa = secondAttemptAnswers['q' + qIndex];
            if (sa) { if (sa.isCorrect) secondCorrect++; }
            else { if (answer.isCorrect) secondCorrect++; }
        });

        setBlock.innerHTML = '<div class="result-section-title" style="white-space:nowrap;overflow:visible;">' +
            '<i class="fas fa-pen"></i> Fill in the Blanks - Set ' + (setIndex + 1) +
            '<span style="margin-left:auto;font-size:14px;color:#6c757d;white-space:nowrap;">' +
            '1차: ' + firstCorrect + '/' + answers.length + ' → 2차: ' + secondCorrect + '/' + answers.length +
            '</span></div>';

        // 1차/2차 답안 맵 생성
        var firstAttemptMap = {};
        var secondAnswerMap = {};
        answers.forEach(function(answer, localIndex) {
            var qIndex = startIndex + setIndex * 10 + localIndex;
            var wasCorrectInFirst = firstResults[qIndex] || false;

            firstAttemptMap[answer.blankId] = Object.assign({}, answer, { isCorrect: wasCorrectInFirst });

            var sa = secondAttemptAnswers['q' + qIndex];
            var isCorrectInSecond = secondResults[qIndex] || false;

            if (sa) {
                secondAnswerMap[answer.blankId] = {
                    blankId: answer.blankId,
                    prefix: answer.prefix,
                    userAnswer: sa.userAnswer,
                    correctAnswer: answer.correctAnswer,
                    isCorrect: isCorrectInSecond,
                    wasCorrectInFirst: wasCorrectInFirst,
                    explanation: answer.explanation,
                    commonMistakes: answer.commonMistakes || '',
                    mistakesExplanation: answer.mistakesExplanation || ''
                };
            } else {
                secondAnswerMap[answer.blankId] = Object.assign({}, answer, {
                    isCorrect: firstResults[qIndex] || false,
                    wasCorrectInFirst: firstResults[qIndex] || false
                });
            }
        });

        // comp에 blanks 없으면 전역 데이터에서 가져오기
        if (!comp.blanks) {
            var fillBlanksData = window.readingFillBlanksData;
            if (fillBlanksData && fillBlanksData.sets) {
                var actualSet = fillBlanksData.sets.find(function(s) { return s.id === comp.setId; });
                if (actualSet) {
                    comp.passage = actualSet.passage;
                    comp.blanks = actualSet.blanks;
                }
            }
        }

        // 지문 + 해설 렌더링 (기존 컴포넌트 함수 재사용)
        var passageHTML = (typeof window.renderPassageWithAnswers === 'function') ?
            window.renderPassageWithAnswers(comp, secondAnswerMap, firstAttemptMap) :
            '<p>지문 렌더링 함수를 찾을 수 없습니다.</p>';

        var explanationHTML = (typeof window.renderBlankExplanations === 'function') ?
            window.renderBlankExplanations(comp, secondAnswerMap) : '';

        setBlock.innerHTML += '<div class="result-passage">' + passageHTML + '</div>' + explanationHTML;
        container.appendChild(setBlock);
    });
}

/**
 * 일상리딩1 해설 렌더링
 */
function renderDaily1Explain(components, secondAttemptAnswers, allResults, firstResults, secondResults, startIndex, stats) {
    setTextIfExists('daily1Total', stats.firstTotal);
    setTextIfExists('daily1First', stats.firstCorrect + '/' + stats.firstTotal + ' (' + stats.firstPercent + '%)');
    setTextIfExists('daily1Second', stats.secondCorrect + '/' + stats.secondTotal + ' (' + stats.secondPercent + '%)');
    setTextIfExists('daily1Improvement', (stats.improvement > 0 ? '+' : '') + stats.improvement + '문제');

    var container = document.getElementById('daily1DetailSets');
    if (!container) return;
    container.innerHTML = '';

    components.forEach(function(comp, setIndex) {
        var setBlock = document.createElement('div');
        setBlock.className = 'result-section';
        var answers = comp.answers || [];
        var firstCorrect = answers.filter(function(a) { return a.isCorrect; }).length;

        var secondCorrect = 0;
        answers.forEach(function(answer, localIndex) {
            var qIndex = startIndex + setIndex * answers.length + localIndex;
            var sa = secondAttemptAnswers['q' + qIndex];
            if (sa) { if (sa.isCorrect) secondCorrect++; }
            else { if (answer.isCorrect) secondCorrect++; }
        });

        setBlock.innerHTML = '<div class="result-section-title" style="white-space:nowrap;overflow:visible;">' +
            '<i class="fas fa-book-reader"></i> Daily Reading 1 - Set ' + (setIndex + 1) +
            '<span style="margin-left:auto;font-size:14px;color:#6c757d;white-space:nowrap;">' +
            '1차: ' + firstCorrect + '/' + answers.length + ' → 2차: ' + secondCorrect + '/' + answers.length +
            '</span></div>';

        if (typeof window.renderDaily1SetResult === 'function') {
            setBlock.innerHTML += window.renderDaily1SetResult(comp, secondAttemptAnswers, firstResults, secondResults, startIndex + setIndex * answers.length);
        } else {
            setBlock.innerHTML += '<p>일상리딩1 렌더링 함수를 찾을 수 없습니다.</p>';
        }

        container.appendChild(setBlock);
    });

    // 툴팁 이벤트 바인딩
    if (typeof window.bindDaily1ToggleEvents === 'function') {
        setTimeout(function() { window.bindDaily1ToggleEvents(); }, 100);
    }
}

/**
 * 일상리딩2 해설 렌더링
 */
function renderDaily2Explain(components, secondAttemptAnswers, allResults, firstResults, secondResults, startIndex, stats) {
    setTextIfExists('daily2Total', stats.firstTotal);
    setTextIfExists('daily2First', stats.firstCorrect + '/' + stats.firstTotal + ' (' + stats.firstPercent + '%)');
    setTextIfExists('daily2Second', stats.secondCorrect + '/' + stats.secondTotal + ' (' + stats.secondPercent + '%)');
    setTextIfExists('daily2Improvement', (stats.improvement > 0 ? '+' : '') + stats.improvement + '문제');

    var container = document.getElementById('daily2DetailSets');
    if (!container) return;
    container.innerHTML = '';

    components.forEach(function(comp, setIndex) {
        var setBlock = document.createElement('div');
        setBlock.className = 'result-section';
        var answers = comp.answers || [];
        var firstCorrect = answers.filter(function(a) { return a.isCorrect; }).length;

        var secondCorrect = 0;
        answers.forEach(function(answer, localIndex) {
            var qIndex = startIndex + setIndex * answers.length + localIndex;
            var sa = secondAttemptAnswers['q' + qIndex];
            if (sa) { if (sa.isCorrect) secondCorrect++; }
            else { if (answer.isCorrect) secondCorrect++; }
        });

        setBlock.innerHTML = '<div class="result-section-title" style="white-space:nowrap;overflow:visible;">' +
            '<i class="fas fa-book-reader"></i> Daily Reading 2 - Set ' + (setIndex + 1) +
            '<span style="margin-left:auto;font-size:14px;color:#6c757d;white-space:nowrap;">' +
            '1차: ' + firstCorrect + '/' + answers.length + ' → 2차: ' + secondCorrect + '/' + answers.length +
            '</span></div>';

        if (typeof window.renderDaily2SetResult === 'function') {
            setBlock.innerHTML += window.renderDaily2SetResult(comp, secondAttemptAnswers, firstResults, secondResults, startIndex + setIndex * answers.length);
        } else {
            setBlock.innerHTML += '<p>일상리딩2 렌더링 함수를 찾을 수 없습니다.</p>';
        }

        container.appendChild(setBlock);
    });

    if (typeof window.bindDaily2ToggleEvents === 'function') {
        setTimeout(function() { window.bindDaily2ToggleEvents(); }, 100);
    }
}

/**
 * 아카데믹 리딩 해설 렌더링
 */
function renderAcademicExplain(components, secondAttemptAnswers, allResults, firstResults, secondResults, startIndex, stats) {
    setTextIfExists('academicTotal', stats.firstTotal);
    setTextIfExists('academicFirst', stats.firstCorrect + '/' + stats.firstTotal + ' (' + stats.firstPercent + '%)');
    setTextIfExists('academicSecond', stats.secondCorrect + '/' + stats.secondTotal + ' (' + stats.secondPercent + '%)');
    setTextIfExists('academicImprovement', (stats.improvement > 0 ? '+' : '') + stats.improvement + '문제');

    var container = document.getElementById('academicDetailSets');
    if (!container) return;
    container.innerHTML = '';

    components.forEach(function(comp, setIndex) {
        var setBlock = document.createElement('div');
        setBlock.className = 'result-section';
        var answers = comp.answers || [];
        var firstCorrect = answers.filter(function(a) { return a.isCorrect; }).length;

        var secondCorrect = 0;
        answers.forEach(function(answer, localIndex) {
            var qIndex = startIndex + setIndex * answers.length + localIndex;
            var sa = secondAttemptAnswers['q' + qIndex];
            if (sa) { if (sa.isCorrect) secondCorrect++; }
            else { if (answer.isCorrect) secondCorrect++; }
        });

        setBlock.innerHTML = '<div class="result-section-title" style="white-space:nowrap;overflow:visible;">' +
            '<i class="fas fa-graduation-cap"></i> Academic Reading - Set ' + (setIndex + 1) +
            '<span style="margin-left:auto;font-size:14px;color:#6c757d;white-space:nowrap;">' +
            '1차: ' + firstCorrect + '/' + answers.length + ' → 2차: ' + secondCorrect + '/' + answers.length +
            '</span></div>';

        if (typeof window.renderAcademicSetResult === 'function') {
            setBlock.innerHTML += window.renderAcademicSetResult(comp, secondAttemptAnswers, firstResults, secondResults, startIndex + setIndex * answers.length);
        } else {
            setBlock.innerHTML += '<p>아카데믹 리딩 렌더링 함수를 찾을 수 없습니다.</p>';
        }

        container.appendChild(setBlock);
    });

    if (typeof window.bindAcademicToggleEvents === 'function') {
        setTimeout(function() { window.bindAcademicToggleEvents(); }, 100);
    }
}

/**
 * 해설 화면 내 탭 네비게이션 추가
 */
function addExplainTabNavigation(screen, activeTab, firstResult, secondResult, secondAttemptAnswers) {
    if (!screen) return;

    // 기존 탭 네비게이션 제거
    var existingNav = screen.querySelector('.v2-explain-tabs');
    if (existingNav) existingNav.remove();

    var tabs = [
        { key: 'fillblanks', label: '빈칸채우기', icon: 'fas fa-pen' },
        { key: 'daily1', label: '일상리딩 1', icon: 'fas fa-book-reader' },
        { key: 'daily2', label: '일상리딩 2', icon: 'fas fa-book-reader' },
        { key: 'academic', label: '아카데믹', icon: 'fas fa-graduation-cap' }
    ];

    var navHTML = '<div class="v2-explain-tabs" style="display:flex;gap:8px;padding:12px 16px;background:#f8f9fa;border-bottom:1px solid #e2e8f0;overflow-x:auto;">';
    tabs.forEach(function(tab) {
        var isActive = tab.key === activeTab;
        navHTML += '<button class="v2-tab-btn" data-tab="' + tab.key + '" style="' +
            'padding:8px 16px;border-radius:8px;border:1px solid ' + (isActive ? '#9480c5' : '#e2e8f0') + ';' +
            'background:' + (isActive ? '#9480c5' : '#fff') + ';color:' + (isActive ? '#fff' : '#64748b') + ';' +
            'font-size:13px;font-weight:' + (isActive ? '600' : '400') + ';cursor:pointer;white-space:nowrap;">' +
            '<i class="' + tab.icon + '" style="margin-right:4px;"></i>' + tab.label + '</button>';
    });

    // 과제 화면으로 돌아가기 버튼
    navHTML += '<button class="v2-tab-return" style="' +
        'padding:8px 16px;border-radius:8px;border:1px solid #e2e8f0;margin-left:auto;' +
        'background:#fff;color:#9480c5;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">' +
        '📋 과제 화면</button>';

    navHTML += '</div>';

    // 화면 맨 위에 삽입
    screen.insertAdjacentHTML('afterbegin', navHTML);

    // 탭 클릭 이벤트
    screen.querySelectorAll('.v2-tab-btn').forEach(function(btn) {
        btn.onclick = function() {
            showExplainTab(btn.getAttribute('data-tab'), firstResult, secondResult, secondAttemptAnswers);
        };
    });

    // 과제 화면 복귀
    var returnBtn = screen.querySelector('.v2-tab-return');
    if (returnBtn) {
        returnBtn.onclick = function() {
            if (typeof backToStageSelect === 'function') {
                backToStageSelect();
            }
        };
    }
}

/**
 * 뒤로가기 버튼을 "과제 화면으로" 로 교체
 */
function replaceBackButtons(screen) {
    if (!screen) return;

    screen.querySelectorAll('.btn-back').forEach(function(btn) {
        btn.onclick = function() {
            if (typeof backToStageSelect === 'function') {
                backToStageSelect();
            }
        };
        // 텍스트 변경
        var textNode = btn.childNodes[btn.childNodes.length - 1];
        if (textNode && textNode.nodeType === 3) {
            textNode.textContent = ' 과제 화면';
        }
    });
}

/**
 * 유틸: 안전하게 텍스트 설정
 */
function setTextIfExists(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
}

// ========================================
// 리스닝 해설 화면 (방법 B — 기존 렌더링 코드 활용)
// ========================================

/**
 * 리스닝 해설보기 메인 함수 — showExplainV2()에서 호출됨
 * StageSelector의 데이터를 기존 코드가 읽는 전역 변수에 세팅한 뒤,
 * 기존 showListeningRetakeDetailPage()를 호출한다.
 * → listening-retake-detail.js (2000줄)은 한 글자도 수정하지 않음.
 */
function showListeningExplainV2() {
    console.log('📖 [V2] 리스닝 해설 화면 표시');

    var firstResult = window.StageSelector && window.StageSelector.firstAttemptResult;
    var secondResult = window.StageSelector && window.StageSelector.secondAttemptResult;

    if (!firstResult) {
        alert('1차 풀이를 먼저 완료해주세요.');
        return;
    }

    // ① 기존 코드가 읽는 sessionStorage에 1차 결과 세팅
    var firstAttemptCompat = {
        sectionType: 'listening',
        componentResults: firstResult.componentResults,
        totalCorrect: firstResult.totalCorrect,
        totalQuestions: firstResult.totalQuestions,
        weekInfo: {
            weekName: 'Week ' + (window.currentTest && window.currentTest.currentWeek || 1),
            dayName: window.currentTest && window.currentTest.currentDay || '일'
        }
    };
    sessionStorage.setItem('listening_firstAttempt', JSON.stringify(firstAttemptCompat));
    console.log('  ✅ sessionStorage listening_firstAttempt 세팅 완료');

    // ② 기존 코드가 읽는 window.currentListeningResultData 세팅
    if (secondResult) {
        window.currentListeningResultData = secondResult;
        console.log('  ✅ window.currentListeningResultData 세팅 완료');
    } else {
        // 2차 결과 없으면 빈 구조체 (1차만으로도 해설 진입 가능하도록)
        window.currentListeningResultData = {
            firstAttempt: { results: [], score: 0 },
            secondAttempt: { results: [], score: 0 },
            secondAttemptAnswers: {},
            improvement: {}
        };
        console.log('  ⚠️ 2차 결과 없음 — 빈 구조체 세팅');
    }

    // ③ 리스닝 해설 탭 화면 표시 (기존 showListeningRetakeDetailPage 대신 V2 탭 방식)
    showListeningExplainTabScreen();
}

/**
 * 리스닝 해설 탭 화면 — 응답 / 대화 / 공지 / 강의 탭
 */
function showListeningExplainTabScreen() {
    // 모든 화면 숨기기
    document.querySelectorAll('.screen, .result-screen, .test-screen').forEach(function(s) {
        s.style.display = 'none';
    });

    // 첫 번째 탭(응답고르기)부터 표시
    showListeningExplainPage(1);
}

/**
 * 리스닝 해설 페이지 표시 (기존 렌더링 함수 호출 + V2 탭 네비게이션 추가)
 */
function showListeningExplainPage(pageIndex) {
    console.log('📖 [V2] 리스닝 해설 페이지:', pageIndex);

    // 기존 showListeningRetakeDetailPage 호출 — 렌더링은 기존 코드가 처리
    if (typeof window.showListeningRetakeDetailPage === 'function') {
        window.showListeningRetakeDetailPage(pageIndex);
    } else {
        console.error('❌ showListeningRetakeDetailPage 함수를 찾을 수 없습니다');
        alert('리스닝 해설 화면을 불러올 수 없습니다.');
        return;
    }

    // 기존 코드가 표시한 화면 위에 V2 탭 네비게이션 추가
    setTimeout(function() {
        addListeningExplainTabNav(pageIndex);
    }, 400);
}

/**
 * 리스닝 해설 화면에 V2 탭 네비게이션 추가
 */
function addListeningExplainTabNav(activePageIndex) {
    var tabs = [
        { page: 1, label: '응답고르기', icon: 'fas fa-headphones' },
        { page: 2, label: '대화', icon: 'fas fa-comments' },
        { page: 3, label: '공지사항', icon: 'fas fa-bullhorn' },
        { page: 4, label: '강의', icon: 'fas fa-chalkboard-teacher' }
    ];

    // 현재 보이는 화면 찾기
    var visibleScreen = null;
    var possibleScreens = [
        'finalExplainScreen',
        'listeningRetakeDetailResponseScreen',
        'listeningRetakeDetailConverScreen',
        'listeningRetakeDetailAnnouncementScreen',
        'listeningLectureResultScreen'
    ];
    for (var i = 0; i < possibleScreens.length; i++) {
        var el = document.getElementById(possibleScreens[i]);
        if (el && el.style.display !== 'none') {
            visibleScreen = el;
            break;
        }
    }
    if (!visibleScreen) return;

    // 기존 V2 탭 네비게이션 제거
    var existingNav = visibleScreen.querySelector('.v2-listening-explain-tabs');
    if (existingNav) existingNav.remove();

    // 탭 네비게이션 생성
    var navHTML = '<div class="v2-listening-explain-tabs" style="display:flex;gap:8px;padding:12px 16px;background:#f8f9fa;border-bottom:1px solid #e2e8f0;overflow-x:auto;position:sticky;top:0;z-index:100;">';
    tabs.forEach(function(tab) {
        var isActive = tab.page === activePageIndex;
        navHTML += '<button class="v2-ltab-btn" data-page="' + tab.page + '" style="' +
            'padding:8px 16px;border-radius:8px;border:1px solid ' + (isActive ? '#9480c5' : '#e2e8f0') + ';' +
            'background:' + (isActive ? '#9480c5' : '#fff') + ';color:' + (isActive ? '#fff' : '#64748b') + ';' +
            'font-size:13px;font-weight:' + (isActive ? '600' : '400') + ';cursor:pointer;white-space:nowrap;">' +
            '<i class="' + tab.icon + '" style="margin-right:4px;"></i>' + tab.label + '</button>';
    });

    // 과제 화면으로 돌아가기 버튼
    navHTML += '<button class="v2-ltab-return" style="' +
        'padding:8px 16px;border-radius:8px;border:1px solid #e2e8f0;margin-left:auto;' +
        'background:#fff;color:#9480c5;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">' +
        '📋 과제 화면</button>';

    navHTML += '</div>';

    // 화면 맨 위에 삽입
    visibleScreen.insertAdjacentHTML('afterbegin', navHTML);

    // 탭 클릭 이벤트
    visibleScreen.querySelectorAll('.v2-ltab-btn').forEach(function(btn) {
        btn.onclick = function() {
            showListeningExplainPage(parseInt(btn.getAttribute('data-page')));
        };
    });

    // 과제 화면 복귀 버튼
    var returnBtn = visibleScreen.querySelector('.v2-ltab-return');
    if (returnBtn) {
        returnBtn.onclick = function() {
            if (typeof backToStageSelect === 'function') {
                backToStageSelect();
            }
        };
    }
}

// 전역 노출
window.showReadingExplainV2 = showReadingExplainV2;
window.showListeningExplainV2 = showListeningExplainV2;
window.showExplainTab = showExplainTab;

console.log('✅ [V2] explain-viewer-v2.js 로드 완료');
console.log('   - showReadingExplainV2() → 유형별 해설 탭 화면');
console.log('   - showListeningExplainV2() → 리스닝 해설 탭 화면');
