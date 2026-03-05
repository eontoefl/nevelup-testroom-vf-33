/**
 * ================================================
 * review-panel.js
 * Review 패널 - 리딩/리스닝 1차 풀이 중 문제 목록 확인 + 이동
 * ================================================
 * 
 * v4 - 2026-03-02 컴포넌트 이동 시 componentResults 복원 버그 수정
 * v3 - 2026-02-24 전면 재설계
 * 
 * ★ 핵심 원칙: 
 *   - _answerStore[compIndex] 에 모든 컴포넌트의 답안을 한 번만 기록, 절대 삭제하지 않음
 *   - componentResults / allAnswers를 splice/pop 하지 않고, 컴포넌트 이동 시에는
 *     _answerStore 에서 읽어 인스턴스에 복원
 *   - onComponentComplete에서 push 대신 인덱스 기반 덮어쓰기로 중복 방지
 * 
 * 변경사항:
 * - _reviewBackup 제거 → _answerStore로 통합
 * - navigateToPreviousComponent(): splice/pop 기반 → 인덱스 이동만 수행
 * - goToPreviousComponent() 패치: module-controller 의 pop/splice 전에 답안을 _answerStore에 보관
 * - _patchOnComponentComplete(): push 중복 방지, _answerStore에서 자동 복원
 * - 모든 checkAnswered()에서 _answerStore 우선 참조
 * 
 * 기능:
 * - 전체 문제 목록을 테이블로 표시
 * - 각 문제의 Answered / Not Answered 상태 표시
 * - 행 클릭 시 해당 문제로 이동
 * - 1차 풀이에서만 표시 (2차, 결과, 해설에서는 숨김)
 */

const ReviewPanel = {
    isOpen: false,

    // ★ 영구 답안 저장소: { compIndex: { type, answers: [...] } }
    // 한번 기록되면 삭제되지 않으며, 학생이 다시 풀면 덮어쓰기
    _answerStore: {},

    // ★ 최대 도달 컴포넌트 인덱스 (뒤로 이동해도 줄어들지 않음)
    _maxReachedCompIndex: -1,

    /**
     * 전체 답안 저장소 갱신
     * - componentResults의 완료된 답안 반영
     * - 현재 진행 중 컴포넌트의 인스턴스 답안 수집
     */
    _syncAnswerStore(mc) {
        // 1) 완료된 컴포넌트들의 답안 동기화
        mc.componentResults.forEach((result, idx) => {
            if (result && result.answers && result.answers.length > 0) {
                this._answerStore[idx] = {
                    type: result.componentType,
                    answers: JSON.parse(JSON.stringify(result.answers))
                };
            }
        });

        // 2) 현재 진행 중 컴포넌트 답안 수집
        const currentComp = mc.config.components[mc.currentComponentIndex];
        if (currentComp) {
            const currentInstance = this.getCurrentComponentInstance(currentComp.type);
            if (currentInstance) {
                const currentAnswers = this.collectCurrentAnswers(currentInstance, currentComp);
                if (currentAnswers.length > 0 && currentAnswers.some(a => a !== null && a !== '' && a !== undefined)) {
                    this._answerStore[mc.currentComponentIndex] = {
                        type: currentComp.type,
                        answers: JSON.parse(JSON.stringify(currentAnswers))
                    };
                }
            }
        }

        // 3) _maxReachedCompIndex 갱신
        if (mc.currentComponentIndex > this._maxReachedCompIndex) {
            this._maxReachedCompIndex = mc.currentComponentIndex;
        }
    },

    /**
     * Review 패널 열기
     */
    async open() {
        const mc = window.moduleController;
        if (!mc) {
            console.warn('⚠️ [Review] moduleController가 없습니다');
            return;
        }

        console.log('📋 [Review] 패널 열기');

        // ★ 답안 저장소 동기화
        this._syncAnswerStore(mc);

        console.log('📋 [Review] _answerStore 상태:', Object.keys(this._answerStore).map(k => 
            `[${k}]:${this._answerStore[k].type}(${this._answerStore[k].answers.length}개)`
        ).join(', '));

        // 패널 먼저 표시 (로딩 상태)
        const panel = document.getElementById('reviewPanel');
        if (panel) {
            panel.style.display = 'flex';
            this.isOpen = true;
        }

        // 미래 컴포넌트 데이터 미리 로드 (캐시된 데이터 사용)
        await this.preloadComponentData(mc);

        // 전체 문제 데이터 수집
        const reviewData = this.collectReviewData(mc);
        
        // 테이블 렌더링
        this.renderTable(reviewData, mc);

        // Summary 업데이트
        this.updateSummary(reviewData);
    },

    /**
     * Review 패널 닫기
     */
    close() {
        const panel = document.getElementById('reviewPanel');
        if (panel) {
            panel.style.display = 'none';
            this.isOpen = false;
        }
        console.log('📋 [Review] 패널 닫기');
    },

    /**
     * 전체 문제 데이터 수집
     * 각 컴포넌트에서 문제 텍스트 + 답변 여부를 가져옴
     */
    collectReviewData(mc) {
        const reviewData = [];
        let globalQuestionNum = 0;

        const maxReached = this._maxReachedCompIndex;

        mc.config.components.forEach((comp, compIndex) => {
            const isCurrent = compIndex === mc.currentComponentIndex;
            // 현재이거나, 이전에 도달했던 컴포넌트는 모두 "도달한" 것
            const isReached = compIndex <= maxReached;
            const isFuture = compIndex > maxReached;

            // 컴포넌트 인스턴스 가져오기
            let instance = null;
            if (isCurrent) {
                instance = this.getCurrentComponentInstance(comp.type);
            }

            // 캐시 데이터에서 문제 목록 가져오기
            let preloadedQuestions = null;
            if (!instance || isFuture || !isCurrent) {
                preloadedQuestions = this.getPreloadedQuestions(comp);
            }

            for (let qIdx = 0; qIdx < comp.questionsPerSet; qIdx++) {
                globalQuestionNum++;
                
                const questionText = this.getQuestionText(comp, compIndex, qIdx, mc, instance, isReached, isCurrent, preloadedQuestions);
                const isAnswered = this.checkAnswered(comp, compIndex, qIdx, mc, instance, isReached, isCurrent);

                reviewData.push({
                    number: globalQuestionNum,
                    questionText: questionText,
                    isAnswered: isAnswered,
                    componentIndex: compIndex,
                    questionIndex: qIdx,
                    componentType: comp.type,
                    setId: comp.setId
                });
            }
        });

        return reviewData;
    },

    /**
     * 미래 컴포넌트 데이터 미리 로드 (캐시된 데이터 사용, 없으면 로드)
     */
    async preloadComponentData(mc) {
        const types = new Set(mc.config.components.map(c => c.type));
        const promises = [];

        if (types.has('daily1') && typeof loadDaily1Data === 'function') {
            promises.push(loadDaily1Data().then(d => { this._cachedDaily1 = d; }).catch(() => {}));
        }
        if (types.has('daily2') && typeof loadDaily2Data === 'function') {
            promises.push(loadDaily2Data().then(d => { this._cachedDaily2 = d; }).catch(() => {}));
        }
        if (types.has('academic') && typeof loadAcademicData === 'function') {
            promises.push(loadAcademicData().then(() => {
                this._cachedAcademic = window.readingAcademicData;
            }).catch(() => {}));
        }
        if (types.has('fillblanks') && typeof loadFillBlanksData === 'function') {
            promises.push(loadFillBlanksData().then(d => { this._cachedFillBlanks = d; }).catch(() => {}));
        }

        // 리스닝 컴포넌트 캐시 로드
        if (types.has('response') && typeof ResponseComponent === 'function') {
            promises.push(
                new ResponseComponent(1).loadData().then(d => { this._cachedResponse = d; }).catch(() => {})
            );
        }
        if (types.has('conver') && typeof ConverComponent === 'function') {
            promises.push(
                new ConverComponent(1).loadData().then(d => { this._cachedConver = d; }).catch(() => {})
            );
        }
        if (types.has('announcement') && typeof AnnouncementComponent === 'function') {
            const tempAnnounce = new AnnouncementComponent(1);
            promises.push(
                tempAnnounce.loadData().then(() => { this._cachedAnnouncement = tempAnnounce.data; }).catch(() => {})
            );
        }
        if (types.has('lecture') && typeof LectureComponent === 'function') {
            const tempLecture = new LectureComponent(1);
            promises.push(
                tempLecture.loadData().then(() => { this._cachedLecture = tempLecture.data; }).catch(() => {})
            );
        }

        await Promise.all(promises);
    },

    /**
     * 미리 로드된 데이터에서 문제 목록 가져오기
     */
    getPreloadedQuestions(comp) {
        try {
            const idx = (typeof comp.setId === 'number' ? comp.setId : parseInt(comp.setId)) - 1;

            if (comp.type === 'fillblanks' && this._cachedFillBlanks) {
                const sets = this._cachedFillBlanks.sets || this._cachedFillBlanks;
                const set = Array.isArray(sets) ? sets[idx] : null;
                if (set && set.blanks) return set.blanks;
            }
            if (comp.type === 'daily1' && this._cachedDaily1) {
                const sets = this._cachedDaily1.sets || [];
                const set = sets[idx];
                if (set && set.questions) return set.questions;
            }
            if (comp.type === 'daily2' && this._cachedDaily2) {
                const sets = this._cachedDaily2.sets || [];
                const set = sets[idx];
                if (set && set.questions) return set.questions;
            }
            if (comp.type === 'academic' && this._cachedAcademic) {
                const sets = Array.isArray(this._cachedAcademic) ? this._cachedAcademic : (this._cachedAcademic.sets || []);
                const set = sets[idx];
                if (set && set.questions) return set.questions;
            }

            // 리스닝 컴포넌트
            if (comp.type === 'response' && this._cachedResponse) {
                const sets = this._cachedResponse.sets || [];
                const set = sets[idx];
                if (set && set.questions) return set.questions;
            }
            if (comp.type === 'conver' && this._cachedConver) {
                const sets = this._cachedConver.sets || [];
                const set = sets[idx];
                if (set && set.questions) return set.questions;
            }
            if (comp.type === 'announcement' && this._cachedAnnouncement) {
                const sets = this._cachedAnnouncement.sets || [];
                const set = sets[idx];
                if (set && set.questions) return set.questions;
            }
            if (comp.type === 'lecture' && this._cachedLecture) {
                const sets = this._cachedLecture.sets || [];
                const set = sets[idx];
                if (set && set.questions) return set.questions;
            }
        } catch (e) {
            console.warn('⚠️ [Review] 미리로드 데이터 가져오기 실패:', e);
        }
        return null;
    },

    /**
     * 현재 활성 컴포넌트 인스턴스 가져오기
     */
    getCurrentComponentInstance(type) {
        switch (type) {
            case 'fillblanks': return window.currentFillBlanksComponent;
            case 'daily1': return window.currentDaily1Component;
            case 'daily2': return window.currentDaily2Component;
            case 'academic': return window.currentAcademicComponent;
            case 'response': return window.currentResponseComponent;
            case 'conver': return window.currentConverComponent;
            case 'announcement': return window.currentAnnouncementComponent;
            case 'lecture': return window.currentLectureComponent;
            default: return null;
        }
    },

    /**
     * 문제 텍스트 가져오기
     */
    getQuestionText(comp, compIndex, qIdx, mc, instance, isReached, isCurrent, preloadedQuestions) {
        // 현재 컴포넌트에서 가져오기
        if (isCurrent && instance) {
            const text = this.getTextFromInstance(instance, comp.type, qIdx);
            if (text && !text.startsWith('Fill in the blank') && !text.startsWith('Question ')) {
                return text;
            }
        }

        // _answerStore에서 문제 텍스트 추출 (완료된 컴포넌트)
        if (isReached && this._answerStore[compIndex]) {
            const stored = this._answerStore[compIndex];
            if (stored.answers && stored.answers[qIdx]) {
                const a = stored.answers[qIdx];
                if (typeof a === 'object' && a.question) return this.formatBlankQuestion(a, comp.type);
                if (typeof a === 'object' && a.questionText) return a.questionText;
            }
        }

        // allAnswers에서 추출
        if (isReached) {
            let prevQuestions = 0;
            for (let i = 0; i < compIndex; i++) {
                prevQuestions += mc.config.components[i].questionsPerSet;
            }
            const answerObj = mc.allAnswers[prevQuestions + qIdx];
            if (answerObj && typeof answerObj === 'object') {
                if (answerObj.question) return this.formatBlankQuestion(answerObj, comp.type);
                if (answerObj.questionText) return answerObj.questionText;
            }
            // componentResults에서도 시도
            const result = mc.componentResults[compIndex];
            if (result && result.answers && result.answers[qIdx]) {
                const a = result.answers[qIdx];
                if (typeof a === 'object' && a.question) return this.formatBlankQuestion(a, comp.type);
            }
        }

        // 미리 로드된 데이터에서 가져오기
        if (preloadedQuestions && preloadedQuestions[qIdx]) {
            const q = preloadedQuestions[qIdx];
            if (comp.type === 'fillblanks') {
                return this.formatBlankQuestion(q, comp.type);
            }
            if (comp.type === 'response') {
                return `🎧 Response Q${qIdx + 1}`;
            }
            return q.question || q.questionText || `Question ${qIdx + 1}`;
        }

        // 폴백
        if (comp.type === 'response') {
            return `🎧 Response Q${qIdx + 1}`;
        }
        const typeName = this.getComponentTypeName(comp.type);
        return `[${typeName}] Question ${qIdx + 1}`;
    },

    /**
     * 빈칸채우기 문제 포맷
     */
    formatBlankQuestion(item, type) {
        if (type !== 'fillblanks') {
            return item.question || item.questionText || '';
        }
        
        const prefix = item.prefix || '';
        const answer = item.correctAnswer || item.answer || '';
        const blankCount = answer.length || item.blankCount || 0;
        
        if (prefix && blankCount > 0) {
            const blanks = Array(blankCount).fill('_').join(' ');
            return `${prefix}${blanks}`;
        }
        
        if (item.question) {
            return item.question
                .replace(/\(\d+글자\)/, '')
                .replace(/_{2,}/g, match => Array(match.length).fill('_').join(' '))
                .trim();
        }
        
        return `Blank ${item.blankId || ''}`;
    },

    /**
     * 컴포넌트 타입 한글명
     */
    getComponentTypeName(type) {
        const names = {
            'fillblanks': '빈칸채우기',
            'daily1': '일상지문 1',
            'daily2': '일상지문 2',
            'academic': '학술지문',
            'response': '응답고르기',
            'conver': '대화',
            'announcement': '공지사항',
            'lecture': '렉쳐'
        };
        return names[type] || type;
    },

    /**
     * 컴포넌트 인스턴스에서 문제 텍스트 추출
     */
    getTextFromInstance(instance, type, qIdx) {
        try {
            if (type === 'fillblanks') {
                if (instance.currentSet && instance.currentSet.blanks && instance.currentSet.blanks[qIdx]) {
                    return this.formatBlankQuestion(instance.currentSet.blanks[qIdx], 'fillblanks');
                }
                return `Fill in the blank ${qIdx + 1}`;
            }

            let questions = null;
            if (instance.currentSet && instance.currentSet.questions) {
                questions = instance.currentSet.questions;
            } else if (instance.currentSetData && instance.currentSetData.questions) {
                questions = instance.currentSetData.questions;
            } else if (instance.setData && instance.setData.questions) {
                questions = instance.setData.questions;
            }

            if (questions && questions[qIdx]) {
                const q = questions[qIdx];
                if (type === 'response') {
                    return `🎧 Response Q${qIdx + 1}`;
                }
                return q.question || q.questionText || `Question ${qIdx + 1}`;
            }
        } catch (e) {
            console.warn(`⚠️ [Review] 문제 텍스트 추출 실패 (${type}, idx:${qIdx}):`, e);
        }
        return `Question ${qIdx + 1}`;
    },

    /**
     * ★★★ 답변 여부 확인 (가장 중요한 함수)
     * 
     * 우선순위:
     * 1. _answerStore (영구 저장소) — 이동 후에도 정확
     * 2. 현재 컴포넌트 인스턴스 (실시간)
     * 3. allAnswers / componentResults (정상 흐름)
     */
    checkAnswered(comp, compIndex, qIdx, mc, instance, isReached, isCurrent) {
        // ── 1차: _answerStore에서 확인 ──
        if (this._answerStore[compIndex]) {
            const stored = this._answerStore[compIndex];
            if (stored.answers && stored.answers[qIdx] !== undefined) {
                const ans = stored.answers[qIdx];
                if (ans && typeof ans === 'object') {
                    const userAns = ans.userAnswer ?? ans.answer ?? '';
                    return userAns !== undefined && userAns !== null && String(userAns).trim() !== '';
                }
                if (typeof ans === 'string') {
                    return ans.trim() !== '';
                }
                if (ans !== undefined && ans !== null && ans !== '') {
                    return true;
                }
            }
        }

        // ── 2차: 현재 컴포넌트 인스턴스에서 확인 ──
        if (isCurrent && instance) {
            return this.checkInstanceAnswered(instance, comp.type, qIdx);
        }

        // ── 3차: allAnswers에서 확인 ──
        if (isReached) {
            let prevQuestions = 0;
            for (let i = 0; i < compIndex; i++) {
                prevQuestions += mc.config.components[i].questionsPerSet;
            }
            const answer = mc.allAnswers[prevQuestions + qIdx];
            if (answer && typeof answer === 'object') {
                const userAns = answer.userAnswer ?? answer.answer ?? '';
                return userAns !== undefined && userAns !== null && String(userAns).trim() !== '';
            }
            if (answer !== undefined && answer !== null && answer !== '') {
                return true;
            }
        }

        return false;
    },

    /**
     * 컴포넌트 인스턴스에서 답변 여부 확인
     */
    checkInstanceAnswered(instance, type, qIdx) {
        try {
            if (type === 'fillblanks') {
                if (instance.currentSet && instance.currentSet.blanks && instance.currentSet.blanks[qIdx]) {
                    const blankId = instance.currentSet.blanks[qIdx].id;
                    const answer = instance.answers[blankId];
                    return answer !== undefined && answer !== null && String(answer).trim() !== '';
                }
                return false;
            }

            if (instance.answers) {
                const key1 = `q${qIdx + 1}`;
                if (instance.answers[key1] !== undefined && instance.answers[key1] !== null) {
                    return true;
                }
                if (instance.answers[qIdx] !== undefined && instance.answers[qIdx] !== null && instance.answers[qIdx] !== '') {
                    return true;
                }
                if (instance.setData || instance.currentSetData) {
                    const setId = (instance.setData && instance.setData.id) || 
                                  (instance.currentSetData && instance.currentSetData.setId) || '';
                    const key2 = `${setId}_q${qIdx + 1}`;
                    const key3 = `${setId}_a${qIdx + 1}`;
                    if ((instance.answers[key2] !== undefined && instance.answers[key2] !== null) ||
                        (instance.answers[key3] !== undefined && instance.answers[key3] !== null)) {
                        return true;
                    }
                }
            }
        } catch (e) {
            console.warn(`⚠️ [Review] 답변 확인 실패 (${type}, idx:${qIdx}):`, e);
        }
        return false;
    },

    /**
     * 테이블 렌더링
     */
    renderTable(reviewData, mc) {
        const tbody = document.getElementById('reviewTableBody');
        if (!tbody) return;

        const totalQuestions = mc.config.totalQuestions;
        const sectionType = mc.config.sectionType;
        
        const headerEl = document.getElementById('reviewPanelTitle');
        if (headerEl) {
            const sectionName = sectionType === 'reading' ? 'Reading' : 'Listening';
            headerEl.textContent = `${sectionName} Review (${totalQuestions} Questions)`;
        }

        tbody.innerHTML = '';

        reviewData.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = item.isAnswered ? 'review-row answered' : 'review-row not-answered';
            
            const currentGlobal = mc.getGlobalQuestionNumber(
                mc.currentComponentInstance?.currentQuestion || 0
            );
            if (item.number === currentGlobal) {
                tr.classList.add('review-row-current');
            }

            const tdNum = document.createElement('td');
            tdNum.className = 'review-cell-num';
            tdNum.textContent = item.number;
            tr.appendChild(tdNum);

            const tdText = document.createElement('td');
            tdText.className = 'review-cell-text';
            tdText.textContent = item.questionText || `Question ${item.number}`;
            tr.appendChild(tdText);

            const tdStatus = document.createElement('td');
            tdStatus.className = 'review-cell-status';
            tdStatus.innerHTML = item.isAnswered 
                ? '<span class="review-badge answered">Answered</span>'
                : '<span class="review-badge not-answered">Not Answered</span>';
            tr.appendChild(tdStatus);

            // 클릭 이벤트
            if (sectionType === 'listening') {
                tr.style.cursor = 'default';
            } else {
                tr.addEventListener('click', () => {
                    this.navigateToQuestion(item, mc);
                });
            }

            tbody.appendChild(tr);
        });
    },

    /**
     * 해당 문제로 이동
     */
    navigateToQuestion(item, mc) {
        console.log(`📋 [Review] 문제 ${item.number}로 이동 (컴포넌트: ${item.componentType}, idx: ${item.questionIndex})`);

        const targetCompIndex = item.componentIndex;
        const targetQIdx = item.questionIndex;

        // 같은 컴포넌트 내 이동
        if (targetCompIndex === mc.currentComponentIndex) {
            const instance = this.getCurrentComponentInstance(item.componentType);
            if (instance && typeof instance.loadQuestion === 'function') {
                instance.loadQuestion(targetQIdx);
                mc.updateCurrentQuestionInComponent(targetQIdx);
            }
            this.close();
            return;
        }

        // 다른 컴포넌트로 이동
        const maxReached = this._maxReachedCompIndex;
        
        if (targetCompIndex > maxReached) {
            alert('아직 도달하지 않은 문제입니다. Next 버튼으로 진행해주세요.');
            return;
        }

        // 이전 또는 이미 도달한 컴포넌트로 이동
        this.navigateToPreviousComponent(mc, targetCompIndex, targetQIdx, item.componentType);
    },

    /**
     * ★★★ 컴포넌트 이동 (v4 — _answerStore 기반 완전 복원)
     * 
     * 핵심 원칙:
     * 1. 현재 답안을 _answerStore에 저장
     * 2. componentResults / allAnswers를 처음부터 재구성
     *    → _answerStore에서 target 이전 모든 파트의 채점 기록을 복원
     *    → 뒤로 갔다가 다시 앞으로 점프해도 중간 파트 기록이 유실되지 않음
     * 3. 대상 컴포넌트를 재초기화하고, _answerStore에서 답안 복원
     * 4. onComponentComplete를 패치하여 다음 컴포넌트도 자동 복원
     */
    async navigateToPreviousComponent(mc, targetCompIndex, targetQIdx, targetType) {
        console.log(`📋 [Review] 컴포넌트 이동: ${mc.currentComponentIndex} → ${targetCompIndex}`);

        // ── 0. 현재 상태를 _answerStore에 저장 ──
        this._syncAnswerStore(mc);

        console.log(`📋 [Review] _answerStore 백업 완료:`, Object.keys(this._answerStore).map(k => 
            `[${k}]:${this._answerStore[k].type}(${this._answerStore[k].answers.length}개)`
        ).join(', '));

        // ── 1. 대상 컴포넌트의 답안 추출 ──
        const targetStore = this._answerStore[targetCompIndex];
        const savedAnswers = targetStore ? targetStore.answers : [];
        console.log(`📋 [Review] 대상(comp ${targetCompIndex}) 저장된 답안: ${savedAnswers.length}개`);

        // ── 2. componentResults / allAnswers를 대상 지점으로 재구성 ──
        //    v4: splice로 자른 후, _answerStore에서 target 이전 파트들의 채점 기록을 복원
        //    → 뒤로 갔다가 다시 앞으로 점프해도 중간 파트 기록이 유실되지 않음
        mc.componentResults = [];
        mc.allAnswers = [];
        
        for (let i = 0; i < targetCompIndex; i++) {
            const comp = mc.config.components[i];
            const store = this._answerStore[i];
            
            if (store && store.answers && store.answers.length > 0) {
                // _answerStore에서 채점 기록 복원
                mc.componentResults.push({
                    componentType: comp.type,
                    setId: comp.setId,
                    answers: JSON.parse(JSON.stringify(store.answers))
                });
                mc.allAnswers.push(...JSON.parse(JSON.stringify(store.answers)));
                console.log(`📋 [Review] comp[${i}] ${comp.type}(setId:${comp.setId}) 복원 완료 - 답안 ${store.answers.length}개`);
            } else {
                // 답안이 없는 파트는 빈 결과로 채움 (인덱스 정합성 유지)
                mc.componentResults.push({
                    componentType: comp.type,
                    setId: comp.setId,
                    answers: []
                });
                console.log(`📋 [Review] comp[${i}] ${comp.type}(setId:${comp.setId}) 답안 없음 - 빈 결과 삽입`);
            }
        }
        
        let answersBeforeTarget = mc.allAnswers.length;
        console.log(`📋 [Review] componentResults ${mc.componentResults.length}개 복원, allAnswers ${answersBeforeTarget}개 복원`);

        // ── 3. 컴포넌트 인덱스 이동 ──
        mc.currentComponentIndex = targetCompIndex;
        mc.currentQuestionNumber = answersBeforeTarget;

        // ── 4. 대상 컴포넌트 로드 ──
        const targetComp = mc.config.components[targetCompIndex];
        mc.updateProgress();
        mc.updateHeaderTitle(targetComp.type);

        const initOptions = {
            startQuestionNumber: mc.currentQuestionNumber + 1,
            totalModuleQuestions: mc.config.totalQuestions
        };

        switch (targetComp.type) {
            case 'fillblanks':
                mc.currentComponentInstance = window.FillBlanksComponent;
                if (window.initFillBlanksComponent) {
                    await window.initFillBlanksComponent(targetComp.setId, mc.onComponentComplete.bind(mc), initOptions);
                }
                mc.updateNavigationButtons(targetComp.type, 0, targetComp.questionsPerSet);
                break;
            case 'daily1':
                mc.currentComponentInstance = window.Daily1Component;
                if (window.initDaily1Component) {
                    await window.initDaily1Component(targetComp.setId, mc.onComponentComplete.bind(mc), initOptions);
                }
                break;
            case 'daily2':
                mc.currentComponentInstance = window.Daily2Component;
                if (window.initDaily2Component) {
                    await window.initDaily2Component(targetComp.setId, mc.onComponentComplete.bind(mc), initOptions);
                }
                break;
            case 'academic':
                mc.currentComponentInstance = window.AcademicComponent;
                if (window.initAcademicComponent) {
                    await window.initAcademicComponent(targetComp.setId, mc.onComponentComplete.bind(mc), initOptions);
                }
                break;
        }

        // ── 5. 답안 복원 (init 완료 후) ──
        await new Promise(resolve => setTimeout(resolve, 300));
        this.restoreAnswersToInstance(targetComp.type, savedAnswers, targetComp);

        // ── 6. 대상 문제로 이동 ──
        const instance = this.getCurrentComponentInstance(targetComp.type);
        if (instance && typeof instance.loadQuestion === 'function') {
            instance.loadQuestion(targetQIdx);
            mc.updateCurrentQuestionInComponent(targetQIdx);
        }

        // ── 7. onComponentComplete 패치 (다음 컴포넌트 자동 복원) ──
        this._patchOnComponentComplete(mc);

        console.log(`📋 [Review] 이동 완료`);
        this.close();
    },

    /**
     * ★ onComponentComplete 패치: 다음 컴포넌트 진입 시 _answerStore에서 자동 복원
     * 
     * 패치 내용:
     * - 원본 onComponentComplete 실행 후
     * - 다음 컴포넌트 인덱스가 _answerStore에 있으면 자동 복원
     */
    _patchOnComponentComplete(mc) {
        // 이미 패치했으면 스킵
        if (mc._reviewPatched) return;
        mc._reviewPatched = true;

        const originalOnComplete = mc.onComponentComplete.bind(mc);
        const self = this;

        mc.onComponentComplete = function(componentResult) {
            // ★ 현재 컴포넌트의 답안을 _answerStore에 저장 (submit 된 최종 버전)
            const currentIdx = mc.currentComponentIndex;
            const currentComp = mc.config.components[currentIdx];
            if (currentComp && componentResult && componentResult.answers) {
                self._answerStore[currentIdx] = {
                    type: currentComp.type,
                    answers: JSON.parse(JSON.stringify(componentResult.answers))
                };
            }

            // 원본 로직 실행 (push → currentComponentIndex++ → loadNextComponent)
            originalOnComplete(componentResult);

            // 다음 컴포넌트에 _answerStore 답안 복원
            const nextIndex = mc.currentComponentIndex;
            if (self._answerStore[nextIndex]) {
                const store = self._answerStore[nextIndex];
                const nextComp = mc.config.components[nextIndex];
                if (nextComp) {
                    console.log(`📋 [Review] 자동 복원 시작: 컴포넌트 ${nextIndex} (${store.type}), 답안 ${store.answers.length}개`);
                    setTimeout(() => {
                        self.restoreAnswersToInstance(nextComp.type, store.answers, nextComp);
                        // UI 갱신
                        const inst = self.getCurrentComponentInstance(nextComp.type);
                        if (inst && typeof inst.loadQuestion === 'function' && inst.currentQuestion !== undefined) {
                            inst.loadQuestion(inst.currentQuestion);
                        }
                    }, 500);
                }
            }
        };
    },

    /**
     * ★★★ 백업한 답안을 새 인스턴스에 복원
     * 
     * 두 가지 답안 형태를 처리:
     * A) componentResults 기반: { blankId: 'b1', userAnswer: 'fr', ... } (객체 배열)
     * B) collectCurrentAnswers 기반: 'fr' (문자열 배열)
     */
    restoreAnswersToInstance(type, savedAnswers, comp) {
        if (!savedAnswers || savedAnswers.length === 0) {
            console.log(`📋 [Review] 복원할 답안 없음 (type: ${type})`);
            return;
        }

        console.log(`📋 [Review] 답안 복원 시작: type=${type}, 답안 ${savedAnswers.length}개`);

        try {
            if (type === 'fillblanks') {
                const instance = window.currentFillBlanksComponent;
                if (!instance || !instance.currentSet || !instance.currentSet.blanks) {
                    console.warn('⚠️ [Review] FillBlanks 인스턴스/currentSet/blanks 없음');
                    return;
                }

                const blanks = instance.currentSet.blanks;
                
                // 답안 형태 감지
                const hasBlankId = savedAnswers.some(a => a && typeof a === 'object' && a.blankId);
                
                if (hasBlankId) {
                    // 형태 A: blankId 기반 객체 → blankId로 정확 매칭
                    savedAnswers.forEach((ans) => {
                        if (!ans || typeof ans !== 'object' || !ans.blankId) return;
                        const userAns = ans.userAnswer || ans.answer || '';
                        if (!userAns) return;
                        
                        instance.answers[ans.blankId] = userAns;
                        const blank = blanks.find(b => String(b.id) === String(ans.blankId));
                        if (blank) {
                            this.restoreFillBlanksUI(blank, userAns, instance);
                        } else {
                            console.warn(`⚠️ [Review] blankId=${ans.blankId} 매칭 실패, blanks:`, blanks.map(b=>b.id));
                        }
                    });
                } else {
                    // 형태 B: 인덱스 기반 문자열 → blanks 배열 순서로 매칭
                    savedAnswers.forEach((ans, idx) => {
                        const blank = blanks[idx];
                        if (!blank) return;
                        const userAns = (typeof ans === 'string') ? ans : 
                                       (ans && typeof ans === 'object') ? (ans.userAnswer || ans.answer || '') : '';
                        if (!userAns) return;
                        
                        instance.answers[blank.id] = userAns;
                        this.restoreFillBlanksUI(blank, userAns, instance);
                    });
                }

                console.log(`📋 [Review] FillBlanks 답안 복원 완료:`, Object.keys(instance.answers).length, '개');
                console.log(`📋 [Review] FillBlanks answers:`, JSON.stringify(instance.answers));

            } else {
                // daily1, daily2, academic
                const instanceMap = {
                    'daily1': window.currentDaily1Component,
                    'daily2': window.currentDaily2Component,
                    'academic': window.currentAcademicComponent
                };
                const instance = instanceMap[type];
                if (!instance) {
                    console.warn(`⚠️ [Review] ${type} 인스턴스 없음`);
                    return;
                }

                savedAnswers.forEach((ans, idx) => {
                    const val = (typeof ans === 'object') 
                        ? (ans.userAnswer || ans.answer || '') 
                        : ans;

                    if (val === undefined || val === null || val === '') return;

                    if (type === 'academic') {
                        instance.answers[idx] = val;
                    } else {
                        const key = `q${idx + 1}`;
                        instance.answers[key] = val;
                    }
                });
                console.log(`📋 [Review] ${type} 답안 복원 완료:`, JSON.stringify(instance.answers));
            }
        } catch (e) {
            console.warn(`⚠️ [Review] 답안 복원 실패:`, e);
        }
    },

    /**
     * FillBlanks UI 복원 (input 필드에 값 채우기)
     */
    restoreFillBlanksUI(blank, userAnswer, instance) {
        try {
            if (!userAnswer || typeof userAnswer !== 'string') {
                console.warn(`⚠️ [Review] userAnswer가 유효하지 않음:`, userAnswer);
                return;
            }
            const chars = userAnswer.split('');
            const setId = instance && instance.currentSet ? instance.currentSet.id : '';
            
            let restoredCount = 0;
            chars.forEach((char, charIdx) => {
                let input = null;
                
                // 정확한 ID로 먼저 시도
                if (setId) {
                    const exactId = `blank_${setId}_${blank.id}_${charIdx}`;
                    input = document.getElementById(exactId);
                }
                // 폴백: 와일드카드 검색
                if (!input) {
                    const inputs = document.querySelectorAll(`input[id*="_${blank.id}_${charIdx}"]`);
                    input = inputs[0] || null;
                }
                // 폴백2: blank.id로 모든 입력 필드를 찾고 인덱스로 접근
                if (!input) {
                    const inputs = document.querySelectorAll(`input[id*="_${blank.id}_"]`);
                    input = inputs[charIdx] || null;
                }
                
                if (input) {
                    input.value = char;
                    input.classList.add('filled');
                    restoredCount++;
                }
            });
            
            if (restoredCount < chars.length) {
                console.warn(`⚠️ [Review] FillBlanks UI 부분 복원: ${restoredCount}/${chars.length}, blank.id=${blank.id}`);
            }
        } catch (e) {
            console.warn(`⚠️ [Review] FillBlanks UI 복원 실패:`, e);
        }
    },

    /**
     * 현재 컴포넌트의 답변 수집 (submit 없이)
     */
    collectCurrentAnswers(instance, comp) {
        const answers = [];
        
        if (comp.type === 'fillblanks' && instance.currentSet) {
            for (let i = 0; i < comp.questionsPerSet; i++) {
                const blank = instance.currentSet.blanks[i];
                if (blank) {
                    answers.push(instance.answers[blank.id] || '');
                } else {
                    answers.push('');
                }
            }
        } else if (instance.answers) {
            // setId 추출 (리스닝 컴포넌트: ${setId}_q1 형식)
            const setId = (instance.setData && instance.setData.id) || 
                          (instance.currentSetData && instance.currentSetData.setId) || '';
            
            for (let i = 0; i < comp.questionsPerSet; i++) {
                const key1 = `q${i + 1}`;
                let answer = instance.answers[key1] ?? instance.answers[i] ?? null;
                
                // setId 기반 키도 시도 (리스닝 컴포넌트용)
                if (answer === null && setId) {
                    answer = instance.answers[`${setId}_q${i + 1}`] ?? 
                             instance.answers[`${setId}_a${i + 1}`] ?? null;
                }
                
                answers.push(answer);
            }
        }

        return answers;
    },

    /**
     * Summary 업데이트
     */
    updateSummary(reviewData) {
        const summaryEl = document.getElementById('reviewSummary');
        if (!summaryEl) return;

        const answered = reviewData.filter(d => d.isAnswered).length;
        const notAnswered = reviewData.length - answered;

        summaryEl.innerHTML = `
            <span class="review-summary-item review-summary-answered">✅ Answered: ${answered}</span>
            <span class="review-summary-item review-summary-not-answered">⬜ Not Answered: ${notAnswered}</span>
        `;
    },

    /**
     * Review 버튼 표시/숨김
     */
    updateButtonVisibility() {
        const buttons = document.querySelectorAll('.review-btn');
        
        const mc = window.moduleController;
        const sectionType = mc?.config?.sectionType || '';
        
        // V2: RetakeController가 돌고 있으면 2차 풀이, 없으면 1차 풀이
        const isSecondAttempt = !!window.retakeController;
        
        const shouldShow = mc && 
                          !isSecondAttempt &&
                          (sectionType === 'reading' || sectionType === 'listening');

        buttons.forEach(btn => {
            btn.style.display = shouldShow ? 'inline-flex' : 'none';
        });
    }
};

// 전역 함수 노출
window.openReviewPanel = function() { ReviewPanel.open(); };
window.closeReviewPanel = function() { ReviewPanel.close(); };

// Review 버튼 표시/숨김 — 외부에서 호출하는 방식 (타이머 제거)
// stage-selector.js 등에서 풀이 시작/종료 시점에 ReviewPanel.updateButtonVisibility() 호출

console.log('✅ review-panel.js v3 로드 완료');
