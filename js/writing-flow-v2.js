/**
 * ================================================
 * writing-flow-v2.js (V2 전용)
 * 라이팅 플로우 컨트롤러 (대시보드 중심, 3개 독립 진입점)
 * ================================================
 * 
 * 진입점 3개:
 *   startFirst(moduleNumber, moduleConfig, onComplete)
 *     → arrange 1차 → email 1차 → discussion 1차 → 완료 화면 → onComplete
 *   startSecond(moduleNumber, moduleConfig, onComplete)
 *     → arrange 오답 → 이메일 한국어번역 → email 2차 → 토론 한국어번역 → discussion 2차 → 완료 화면 → onComplete
 *   startExplain(moduleNumber, moduleConfig, onComplete)
 *     → arrange 해설 → [다음] → email 해설(모범답안) → [다음] → discussion 해설(모범답안) → onComplete
 * 
 * stage-selector.js에서 호출하며, 완료 시 onComplete 콜백으로 대시보드 복귀를 처리합니다.
 * 
 * ★ 삭제된 규칙 (V1 대비):
 *   - AutoSave 호출 → StudySave로 대체 (stage-selector에서 처리)
 *   - showGuidePopup → 불필요
 *   - backToSchedule → onComplete 콜백으로 대체
 *   - 전역 isSecondAttempt, currentAttemptNumber → config로 전달
 *   - 전역 writingFlowNoTimer → initXxx 호출 전 직접 설정/해제
 *   - ErrorNote.show → 대시보드에서 처리
 *   - DOM 직접 주입 (답안 비교 섹션, 네비 버튼) → 최소화
 *   - 12단계 자동 체인 → 3개 독립 플로우
 */

console.log('✅ [V2] writing-flow-v2.js 로드 시작');

const WritingFlowV2 = {
    // 상태
    moduleNumber: null,
    moduleConfig: null,
    onComplete: null,  // 완료 시 stage-selector로 돌아가는 콜백
    
    // 데이터 저장
    arrange1stResult: null,
    arrange2ndResult: null,
    email1stText: '',
    email1stData: null,
    email2ndText: '',
    email2ndData: null,
    discussion1stText: '',
    discussion1stData: null,
    discussion2ndText: '',
    discussion2ndData: null,
    koData: null,
    
    // activeController 제거 — ModuleController 사용하지 않음
    
    // ========================================
    // 유틸리티
    // ========================================
    hideAllScreens() {
        document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
        document.querySelectorAll('.result-screen').forEach(s => s.style.display = 'none');
        document.querySelectorAll('.test-screen').forEach(s => s.style.display = 'none');
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    /**
     * 동적 화면 생성/가져오기
     */
    getOrCreateScreen(id, headerHtml) {
        let screen = document.getElementById(id);
        if (!screen) {
            screen = document.createElement('div');
            screen.id = id;
            screen.className = 'screen';
            screen.style.display = 'none';
            screen.innerHTML = `
                <div class="test-header">
                    <div class="test-title">${headerHtml}</div>
                </div>
                <div class="test-content" style="overflow-y:auto; height:calc(100vh - 60px); padding:20px;">
                </div>
            `;
            document.body.appendChild(screen);
        }
        return screen;
    },
    
    /**
     * 한국어 번역 데이터 로드
     */
    async _loadKoData() {
        try {
            if (window.WritingKoData) {
                this.koData = await WritingKoData.load();
                console.log('📦 [WritingFlowV2] 한글 번역 데이터 로드 완료');
            } else {
                console.warn('⚠️ [WritingFlowV2] WritingKoData 객체가 없음');
                this.koData = { email: {}, discussion: {} };
            }
        } catch (e) {
            console.warn('⚠️ [WritingFlowV2] 한글 번역 데이터 로드 실패:', e);
            this.koData = { email: {}, discussion: {} };
        }
    },
    
    /**
     * 타이머 전체 정리
     */
    _clearAllTimers() {
        if (window._arrangeTimerInterval) {
            clearInterval(window._arrangeTimerInterval);
            window._arrangeTimerInterval = null;
        }
        if (window._emailTimerInterval) {
            clearInterval(window._emailTimerInterval);
            window._emailTimerInterval = null;
        }
        if (window.currentDiscussionComponent) {
            try { window.currentDiscussionComponent.stopDiscussionTimer(); } catch(e) {}
        }
    },
    
    /**
     * 전역 플래그 초기화
     */
    _resetGlobalFlags() {
        window.isArrangeRetake = false;
        window.arrangeRetakeWrongIndices = null;
        window.writingFlowNoTimer = false;
        window.currentAttemptNumber = 1;
    },
    
    // ====================================================================
    // ★ 진입점 1: 1차 풀이
    //    arrange(1차) → email(1차) → discussion(1차) → 완료 화면
    // ====================================================================
    async startFirst(moduleNumber, moduleConfig, onComplete) {
        console.log('='.repeat(60));
        console.log(`✏️ [WritingFlowV2] 1차 풀이 시작: Writing ${moduleNumber}`);
        console.log('='.repeat(60));
        
        this.moduleNumber = moduleNumber;
        this.moduleConfig = moduleConfig;
        this.onComplete = onComplete;
        
        // 1차 데이터 초기화
        this.arrange1stResult = null;
        this.email1stText = '';
        this.email1stData = null;
        this.discussion1stText = '';
        this.discussion1stData = null;
        
        // 전역 플래그 리셋 (1차는 타이머 있음)
        this._resetGlobalFlags();
        window.writingFlowNoTimer = false;
        
        this._runArrange1st();
    },
    
    /**
     * 단어 배열 1차 (10문제, 타이머 있음)
     */
    _runArrange1st() {
        console.log('📝 [WritingFlowV2] arrange 1차 시작');
        
        const arrangeComp = this.moduleConfig.components.find(c => c.type === 'arrange');
        if (!arrangeComp) {
            console.error('❌ [WritingFlowV2] arrange 컴포넌트 설정 없음');
            this._runEmail1st();
            return;
        }
        
        const setId = arrangeComp.setId || 1;
        
        if (typeof window.initArrangeComponent !== 'function') {
            console.error('❌ [WritingFlowV2] initArrangeComponent 함수 없음');
            this._runEmail1st();
            return;
        }
        
        // 1차는 타이머 있음
        window.writingFlowNoTimer = false;
        
        window.initArrangeComponent(setId, (result) => {
            console.log('✅ [WritingFlowV2] arrange 1차 완료', result);
            // arrange 결과는 sessionStorage에도 저장됨 (ArrangeComponent가 저장)
            this.arrange1stResult = result || JSON.parse(sessionStorage.getItem('arrangeResults') || 'null');
            this._runEmail1st();
        });
    },
    
    /**
     * 이메일 1차 (타이머 있음)
     */
    _runEmail1st() {
        console.log('📧 [WritingFlowV2] email 1차 시작');
        
        const emailComp = this.moduleConfig.components.find(c => c.type === 'email');
        if (!emailComp) {
            console.error('❌ [WritingFlowV2] email 컴포넌트 설정 없음');
            this._runDiscussion1st();
            return;
        }
        
        const setId = emailComp.setId || 1;
        
        if (typeof window.initEmailComponent !== 'function') {
            console.error('❌ [WritingFlowV2] initEmailComponent 함수 없음');
            this._runDiscussion1st();
            return;
        }
        
        // 1차는 타이머 있음
        window.writingFlowNoTimer = false;
        
        window.initEmailComponent(setId, (result) => {
            console.log('✅ [WritingFlowV2] email 1차 완료', result);
            this._extractEmailResultDirect(result, '1st');
            this._runDiscussion1st();
        });
    },
    
    /**
     * 토론 1차 (타이머 있음)
     */
    _runDiscussion1st() {
        console.log('💬 [WritingFlowV2] discussion 1차 시작');
        
        const discComp = this.moduleConfig.components.find(c => c.type === 'discussion');
        if (!discComp) {
            console.error('❌ [WritingFlowV2] discussion 컴포넌트 설정 없음');
            this._showFirstCompleteScreen();
            return;
        }
        
        const setId = discComp.setId || 1;
        
        if (typeof window.initDiscussionComponent !== 'function') {
            console.error('❌ [WritingFlowV2] initDiscussionComponent 함수 없음');
            this._showFirstCompleteScreen();
            return;
        }
        
        // 1차는 타이머 있음
        window.writingFlowNoTimer = false;
        
        window.initDiscussionComponent(setId, (result) => {
            console.log('✅ [WritingFlowV2] discussion 1차 완료', result);
            this._extractDiscussionResultDirect(result, '1st');
            this._showFirstCompleteScreen();
        });
    },
    
    /**
     * 1차 완료 화면
     */
    _showFirstCompleteScreen() {
        console.log('📊 [WritingFlowV2] 1차 완료 화면 표시');
        this.hideAllScreens();
        this._clearAllTimers();
        
        const r = this.arrange1stResult;
        const correct = r ? r.correct : 0;
        const total = r ? r.total : 10;
        
        const screen = this.getOrCreateScreen(
            'writingV2CompleteScreen',
            '<i class="fas fa-check-circle"></i> <span>1차 풀이 완료</span>'
        );
        
        const content = screen.querySelector('.test-content');
        content.innerHTML = `
            <div style="max-width:500px; margin:40px auto; text-align:center;">
                <div style="background:#fff; border-radius:16px; padding:32px; box-shadow:0 4px 20px rgba(0,0,0,0.08); margin-bottom:24px;">
                    <div style="font-size:48px; margin-bottom:16px;">🎉</div>
                    <h2 style="color:#333; margin-bottom:24px;">1차 풀이 완료!</h2>
                    
                    <div style="text-align:left; max-width:300px; margin:0 auto;">
                        <div style="display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid #eee;">
                            <span style="color:#666;"><i class="fas fa-puzzle-piece"></i> 단어 배열</span>
                            <span style="font-weight:600; color:#333;">${correct}/${total}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid #eee;">
                            <span style="color:#666;"><i class="fas fa-envelope"></i> 이메일</span>
                            <span style="font-weight:600; color:${this.email1stText ? '#10b981' : '#f59e0b'};">${this.email1stText ? '✅ 제출됨' : '⚠️ 미제출'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; padding:12px 0;">
                            <span style="color:#666;"><i class="fas fa-comments"></i> 토론</span>
                            <span style="font-weight:600; color:${this.discussion1stText ? '#10b981' : '#f59e0b'};">${this.discussion1stText ? '✅ 제출됨' : '⚠️ 미제출'}</span>
                        </div>
                    </div>
                </div>
                
                <button onclick="WritingFlowV2._finishAndReturn('1st')"
                    style="padding:14px 40px; font-size:16px; background:#9480c5; color:white; border:none; border-radius:8px; cursor:pointer; width:100%; max-width:360px;">
                    📋 과제 화면으로 돌아가기
                </button>
            </div>
        `;
        
        screen.style.display = 'block';
    },
    
    // ====================================================================
    // ★ 진입점 2: 2차 풀이
    //    arrange 오답 → 이메일 번역 → email 2차 → 토론 번역 → discussion 2차 → 완료 화면
    // ====================================================================
    async startSecond(moduleNumber, moduleConfig, onComplete) {
        console.log('='.repeat(60));
        console.log(`🔄 [WritingFlowV2] 2차 풀이 시작: Writing ${moduleNumber}`);
        console.log('='.repeat(60));
        
        this.moduleNumber = moduleNumber;
        this.moduleConfig = moduleConfig;
        this.onComplete = onComplete;
        
        // 2차 데이터 초기화
        this.arrange2ndResult = null;
        this.email2ndText = '';
        this.email2ndData = null;
        this.discussion2ndText = '';
        this.discussion2ndData = null;
        
        // ★ 2차 풀이 표시용 전역 변수 (EmailComponent, DiscussionComponent가 파일명에 사용)
        window.currentAttemptNumber = 2;
        
        // 한국어 번역 데이터 로드
        await this._loadKoData();
        
        // 단어 배열 오답부터 시작
        this._runArrange2nd();
    },
    
    /**
     * 단어 배열 2차 (오답만, 타이머 없음)
     */
    _runArrange2nd() {
        console.log('🔄 [WritingFlowV2] arrange 2차 시작');
        
        if (!this.arrange1stResult) {
            console.warn('⚠️ [WritingFlowV2] 1차 결과 없음, 이메일 번역으로 이동');
            this._showEmailKoTranslation();
            return;
        }
        
        const wrongIndices = [];
        if (this.arrange1stResult.results) {
            this.arrange1stResult.results.forEach((r, i) => {
                if (!r.isCorrect) wrongIndices.push(i);
            });
        }
        
        if (wrongIndices.length === 0) {
            console.log('🎉 [WritingFlowV2] 틀린 문제 없음, 이메일 번역으로 이동');
            this._showEmailKoTranslation();
            return;
        }
        
        const arrangeComp = this.moduleConfig.components.find(c => c.type === 'arrange');
        const setId = arrangeComp ? arrangeComp.setId : 1;
        
        if (typeof window.initArrangeComponent !== 'function') {
            console.error('❌ [WritingFlowV2] initArrangeComponent 함수 없음');
            this._showEmailKoTranslation();
            return;
        }
        
        // ★ 2차 arrange: 전역 플래그 설정 (arrange-logic.js가 참조)
        window.isArrangeRetake = true;
        window.arrangeRetakeWrongIndices = wrongIndices;
        window.writingFlowNoTimer = true;
        
        window.initArrangeComponent(setId, (result) => {
            console.log('✅ [WritingFlowV2] arrange 2차 완료', result);
            window.isArrangeRetake = false;
            window.arrangeRetakeWrongIndices = null;
            
            // 플로팅 UI 제거
            const floatingUI = document.getElementById('arrangeRetakeFloating');
            if (floatingUI) floatingUI.remove();
            
            this.arrange2ndResult = result || JSON.parse(sessionStorage.getItem('arrangeResults') || 'null');
            this._showEmailKoTranslation();
        });
    },
    
    /**
     * 이메일 한국어 번역 표시 (2차 풀기 전 참고)
     */
    _showEmailKoTranslation() {
        console.log('📖 [WritingFlowV2] 이메일 한국어 번역 보기');
        this.hideAllScreens();
        this._clearAllTimers();
        
        const screen = document.getElementById('writingEmailExplainScreen');
        if (screen) {
            screen.style.display = 'block';
            this._renderEmailKo(screen);
        } else {
            console.warn('⚠️ writingEmailExplainScreen 없음, 이메일 2차로 이동');
            this._runEmail2nd();
        }
    },
    
    _renderEmailKo(screen) {
        const content = screen.querySelector('.test-content') || screen;
        const emailComp = this.moduleConfig.components.find(c => c.type === 'email');
        const setId = emailComp ? `email_set_${String(emailComp.setId).padStart(4, '0')}` : 'email_set_0001';
        
        const koText = this.koData?.email?.[setId] || '(한글 번역 데이터가 아직 준비되지 않았습니다)';
        const question = this.email1stData?.question || {};
        
        content.innerHTML = `
            <div style="max-width:800px; margin:0 auto; padding:20px;">
                <h2 style="text-align:center; margin-bottom:8px; color:#333;">
                    <i class="fas fa-envelope"></i> 이메일 작성 - 모범답안 번역
                </h2>
                <p style="text-align:center; color:#888; font-size:14px; margin-bottom:12px;">
                    아래 한글 번역을 참고하여 2차 작성에서 영작해보세요
                </p>
                <div style="background:#e8f4fd; border-radius:8px; padding:14px 16px; margin-bottom:24px; font-size:13px; color:#1565c0; line-height:1.7;">
                    <i class="fas fa-info-circle"></i>
                    모범답안을 <b>한글로 번역</b>했습니다. 머릿속에서 영작할 수 있도록 한국어로 준비했습니다.
                </div>
                
                ${question.scenario ? `
                <div style="background:#f0f4ff; border-radius:8px; padding:16px; margin-bottom:16px;">
                    <div style="font-size:13px; color:#666; margin-bottom:4px;">📋 상황</div>
                    <div style="color:#333;">${this.escapeHtml(question.scenario)}</div>
                </div>` : ''}
                
                <div style="background:#fff8e1; border:2px solid #ffc107; border-radius:12px; padding:24px; margin-bottom:24px;">
                    <div style="font-size:14px; color:#f57f17; font-weight:bold; margin-bottom:12px;">📌 모범답안 한글 번역</div>
                    <div style="color:#333; font-size:15px; line-height:1.8; white-space:pre-wrap;">${this.escapeHtml(koText)}</div>
                </div>
                
                ${this.email1stText ? `
                <div style="background:#f5f5f5; border-radius:8px; padding:16px; margin-bottom:24px;">
                    <div style="font-size:13px; color:#666; margin-bottom:8px;">📝 나의 1차 작성</div>
                    <div style="color:#555; font-size:14px; line-height:1.6; white-space:pre-wrap;">${this.escapeHtml(this.email1stText)}</div>
                </div>` : ''}
                
                <div style="text-align:center; margin-top:32px;">
                    <button onclick="WritingFlowV2._runEmail2nd()"
                        style="padding:14px 40px; font-size:16px; background:#4A90D9; color:white; border:none; border-radius:8px; cursor:pointer;">
                        <i class="fas fa-pen"></i> 이메일 2차 작성하기
                    </button>
                </div>
            </div>
        `;
    },
    
    /**
     * 이메일 2차 (타이머 없음)
     */
    _runEmail2nd() {
        console.log('📧 [WritingFlowV2] email 2차 시작');
        
        const emailComp = this.moduleConfig.components.find(c => c.type === 'email');
        if (!emailComp) {
            console.error('❌ [WritingFlowV2] email 컴포넌트 설정 없음');
            this._showDiscussionKoTranslation();
            return;
        }
        
        const setId = emailComp.setId || 1;
        
        if (typeof window.initEmailComponent !== 'function') {
            console.error('❌ [WritingFlowV2] initEmailComponent 함수 없음');
            this._showDiscussionKoTranslation();
            return;
        }
        
        // ★ 2차: 타이머 없음
        window.writingFlowNoTimer = true;
        
        window.initEmailComponent(setId, (result) => {
            console.log('✅ [WritingFlowV2] email 2차 완료', result);
            window.writingFlowNoTimer = false;
            this._extractEmailResultDirect(result, '2nd');
            this._showDiscussionKoTranslation();
        });
    },
    
    /**
     * 토론 한국어 번역 표시 (2차 풀기 전 참고)
     */
    _showDiscussionKoTranslation() {
        console.log('📖 [WritingFlowV2] 토론 한국어 번역 보기');
        this.hideAllScreens();
        this._clearAllTimers();
        
        const screen = document.getElementById('writingDiscussionExplainScreen');
        if (screen) {
            screen.style.display = 'block';
            this._renderDiscussionKo(screen);
        } else {
            console.warn('⚠️ writingDiscussionExplainScreen 없음, 토론 2차로 이동');
            this._runDiscussion2nd();
        }
    },
    
    _renderDiscussionKo(screen) {
        const content = screen.querySelector('.test-content') || screen;
        const discComp = this.moduleConfig.components.find(c => c.type === 'discussion');
        const setId = discComp ? `discussion_set_${String(discComp.setId).padStart(4, '0')}` : 'discussion_set_0001';
        
        let koText = this.koData?.discussion?.[setId] || '(한글 번역 데이터가 아직 준비되지 않았습니다)';
        const question = this.discussion1stData?.question || {};
        
        // 프로필 이름 치환
        let profiles = null;
        try {
            const savedProfiles = sessionStorage.getItem('discussionProfiles');
            if (savedProfiles) profiles = JSON.parse(savedProfiles);
        } catch(e) {}
        if (!profiles) profiles = window.currentDiscussionProfiles;
        if (!profiles) profiles = { student1: { name: 'Student 1' }, student2: { name: 'Student 2' } };
        
        const replaceName = (text) => {
            if (!text) return text;
            return text.replace(/\{name1\}/g, profiles.student1.name).replace(/\{name2\}/g, profiles.student2.name);
        };
        
        koText = replaceName(koText);
        const topicText = replaceName(question.topic || '');
        const student1Text = replaceName(question.student1Opinion || '');
        const student2Text = replaceName(question.student2Opinion || '');
        
        content.innerHTML = `
            <div style="max-width:800px; margin:0 auto; padding:20px;">
                <h2 style="text-align:center; margin-bottom:8px; color:#333;">
                    <i class="fas fa-comments"></i> 토론형 글쓰기 - 모범답안 번역
                </h2>
                <p style="text-align:center; color:#888; font-size:14px; margin-bottom:24px;">
                    아래 한글 번역을 참고하여 2차 작성에서 영작해보세요
                </p>
                
                ${topicText ? `
                <div style="background:#f0f4ff; border-radius:8px; padding:16px; margin-bottom:16px;">
                    <div style="font-size:13px; color:#666; margin-bottom:4px;">💬 토론 주제</div>
                    <div style="color:#333; margin-bottom:12px;">${this.escapeHtml(topicText)}</div>
                    ${student1Text ? `
                    <div style="background:#fff; border-radius:6px; padding:10px 12px; margin-bottom:8px; border-left:3px solid #42a5f5;">
                        <div style="font-size:12px; color:#1976d2; font-weight:600; margin-bottom:4px;">🙋 ${this.escapeHtml(profiles.student1.name)}</div>
                        <div style="color:#444; font-size:14px; line-height:1.5;">${this.escapeHtml(student1Text)}</div>
                    </div>` : ''}
                    ${student2Text ? `
                    <div style="background:#fff; border-radius:6px; padding:10px 12px; border-left:3px solid #ef5350;">
                        <div style="font-size:12px; color:#c62828; font-weight:600; margin-bottom:4px;">🙋 ${this.escapeHtml(profiles.student2.name)}</div>
                        <div style="color:#444; font-size:14px; line-height:1.5;">${this.escapeHtml(student2Text)}</div>
                    </div>` : ''}
                </div>` : ''}
                
                <div style="background:#fff8e1; border:2px solid #ffc107; border-radius:12px; padding:24px; margin-bottom:24px;">
                    <div style="font-size:14px; color:#f57f17; font-weight:bold; margin-bottom:12px;">📌 모범답안 한글 번역</div>
                    <div style="color:#333; font-size:15px; line-height:1.8; white-space:pre-wrap;">${this.escapeHtml(koText)}</div>
                </div>
                
                ${this.discussion1stText ? `
                <div style="background:#f5f5f5; border-radius:8px; padding:16px; margin-bottom:24px;">
                    <div style="font-size:13px; color:#666; margin-bottom:8px;">📝 나의 1차 작성</div>
                    <div style="color:#555; font-size:14px; line-height:1.6; white-space:pre-wrap;">${this.escapeHtml(this.discussion1stText)}</div>
                </div>` : ''}
                
                <div style="text-align:center; margin-top:32px;">
                    <button onclick="WritingFlowV2._runDiscussion2nd()"
                        style="padding:14px 40px; font-size:16px; background:#4A90D9; color:white; border:none; border-radius:8px; cursor:pointer;">
                        <i class="fas fa-pen"></i> 토론 2차 작성하기
                    </button>
                </div>
            </div>
        `;
    },
    
    /**
     * 토론 2차 (타이머 없음)
     */
    _runDiscussion2nd() {
        console.log('💬 [WritingFlowV2] discussion 2차 시작');
        
        const discComp = this.moduleConfig.components.find(c => c.type === 'discussion');
        if (!discComp) {
            console.error('❌ [WritingFlowV2] discussion 컴포넌트 설정 없음');
            this._showSecondCompleteScreen();
            return;
        }
        
        const setId = discComp.setId || 1;
        
        if (typeof window.initDiscussionComponent !== 'function') {
            console.error('❌ [WritingFlowV2] initDiscussionComponent 함수 없음');
            this._showSecondCompleteScreen();
            return;
        }
        
        // ★ 2차: 타이머 없음
        window.writingFlowNoTimer = true;
        
        window.initDiscussionComponent(setId, (result) => {
            console.log('✅ [WritingFlowV2] discussion 2차 완료', result);
            window.writingFlowNoTimer = false;
            this._extractDiscussionResultDirect(result, '2nd');
            this._showSecondCompleteScreen();
        });
    },
    
    /**
     * 2차 완료 화면
     */
    _showSecondCompleteScreen() {
        console.log('📊 [WritingFlowV2] 2차 완료 화면 표시');
        this.hideAllScreens();
        this._clearAllTimers();
        this._resetGlobalFlags();
        
        const r1 = this.arrange1stResult;
        const r2 = this.arrange2ndResult;
        const correct1st = r1 ? r1.correct : 0;
        const total = r1 ? r1.total : 10;
        
        // 2차 최종 점수 계산: 1차에서 맞은 것 + 2차에서 새로 맞은 것
        let correct2nd = correct1st;
        if (r2 && r2.results && r1 && r1.results) {
            r1.results.forEach((q1, idx) => {
                if (!q1.isCorrect) {
                    const q2 = r2.results[idx];
                    if (q2 && q2.isCorrect) correct2nd++;
                }
            });
        }
        
        const screen = this.getOrCreateScreen(
            'writingV2CompleteScreen',
            '<i class="fas fa-check-circle"></i> <span>2차 풀이 완료</span>'
        );
        
        // 제목 업데이트 (재사용 시)
        const titleEl = screen.querySelector('.test-title');
        if (titleEl) titleEl.innerHTML = '<i class="fas fa-check-circle"></i> <span>2차 풀이 완료</span>';
        
        const content = screen.querySelector('.test-content');
        content.innerHTML = `
            <div style="max-width:500px; margin:40px auto; text-align:center;">
                <div style="background:#fff; border-radius:16px; padding:32px; box-shadow:0 4px 20px rgba(0,0,0,0.08); margin-bottom:24px;">
                    <div style="font-size:48px; margin-bottom:16px;">🎉</div>
                    <h2 style="color:#333; margin-bottom:24px;">2차 풀이 완료!</h2>
                    
                    <div style="text-align:left; max-width:320px; margin:0 auto;">
                        <div style="display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid #eee;">
                            <span style="color:#666;"><i class="fas fa-puzzle-piece"></i> 단어 배열</span>
                            <span style="font-weight:600; color:#333;">${correct1st}/${total} → <span style="color:#10b981;">${correct2nd}/${total}</span></span>
                        </div>
                        <div style="display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid #eee;">
                            <span style="color:#666;"><i class="fas fa-envelope"></i> 이메일 2차</span>
                            <span style="font-weight:600; color:${this.email2ndText ? '#10b981' : '#f59e0b'};">${this.email2ndText ? '✅ 제출됨' : '⚠️ 미제출'}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; padding:12px 0;">
                            <span style="color:#666;"><i class="fas fa-comments"></i> 토론 2차</span>
                            <span style="font-weight:600; color:${this.discussion2ndText ? '#10b981' : '#f59e0b'};">${this.discussion2ndText ? '✅ 제출됨' : '⚠️ 미제출'}</span>
                        </div>
                    </div>
                </div>
                
                <button onclick="WritingFlowV2._finishAndReturn('2nd')"
                    style="padding:14px 40px; font-size:16px; background:#9480c5; color:white; border:none; border-radius:8px; cursor:pointer; width:100%; max-width:360px;">
                    📋 과제 화면으로 돌아가기
                </button>
            </div>
        `;
        
        screen.style.display = 'block';
    },
    
    // ====================================================================
    // ★ 진입점 3: 해설 보기
    //    arrange 해설 → [다음] → email 해설(모범답안) → [다음] → discussion 해설(모범답안)
    // ====================================================================
    async startExplain(moduleNumber, moduleConfig, onComplete) {
        console.log('='.repeat(60));
        console.log(`📖 [WritingFlowV2] 해설 보기 시작: Writing ${moduleNumber}`);
        console.log('='.repeat(60));
        
        this.moduleNumber = moduleNumber;
        this.moduleConfig = moduleConfig;
        this.onComplete = onComplete;
        
        this._showArrangeExplain();
    },
    
    /**
     * 단어 배열 해설
     */
    _showArrangeExplain() {
        console.log('📖 [WritingFlowV2] 단어 배열 해설');
        this.hideAllScreens();
        
        // 기존 HTML 화면 사용
        const screen = document.getElementById('writingArrangeCompareScreen') || this.getOrCreateScreen(
            'writingArrangeCompareScreen',
            '<i class="fas fa-lightbulb"></i> <span>단어배열 해설</span>'
        );
        
        screen.style.display = 'block';
        this._renderArrangeExplain(screen);
    },
    
    _renderArrangeExplain(screen) {
        const r1 = this.arrange1stResult;
        const r2 = this.arrange2ndResult;
        const content = screen.querySelector('.test-content') || screen;
        
        const total = r1 ? r1.total : 10;
        const first1stCorrect = r1 ? r1.correct : 0;
        
        // 2차에서 새로 맞은 개수
        let retakeCorrect = 0;
        if (r2 && r2.results && r1 && r1.results) {
            r1.results.forEach((q1, idx) => {
                if (!q1.isCorrect) {
                    const q2 = r2.results[idx];
                    if (q2 && q2.isCorrect) retakeCorrect++;
                }
            });
        }
        const combinedCorrect = first1stCorrect + retakeCorrect;
        
        // OX 비교 테이블
        let thCells = '', row1stCells = '', row2ndCells = '';
        for (let i = 0; i < total; i++) {
            const q1Correct = r1 && r1.results && r1.results[i] ? r1.results[i].isCorrect : false;
            let q2Correct = null;
            if (!q1Correct && r2 && r2.results && r2.results[i]) {
                q2Correct = r2.results[i].isCorrect;
            }
            thCells += `<th style="padding:8px 6px; font-size:12px; color:#666; font-weight:600; min-width:36px;">${i + 1}</th>`;
            row1stCells += `<td style="padding:8px 6px; text-align:center; font-size:18px;">${q1Correct ? '<span style="color:#4CAF50;">O</span>' : '<span style="color:#F44336;">X</span>'}</td>`;
            if (q1Correct) {
                row2ndCells += `<td style="padding:8px 6px; text-align:center; font-size:18px;"><span style="color:#4CAF50;">O</span></td>`;
            } else if (q2Correct === true) {
                row2ndCells += `<td style="padding:8px 6px; text-align:center; font-size:18px;"><span style="color:#2196F3;">O</span></td>`;
            } else if (q2Correct === false) {
                row2ndCells += `<td style="padding:8px 6px; text-align:center; font-size:18px;"><span style="color:#F44336;">X</span></td>`;
            } else {
                row2ndCells += `<td style="padding:8px 6px; text-align:center; font-size:14px; color:#ccc;">-</td>`;
            }
        }
        
        // 1차 결과 없으면 안내 메시지
        if (!r1) {
            content.innerHTML = `
                <div style="max-width:600px; margin:60px auto; text-align:center; color:#666;">
                    <div style="font-size:48px; margin-bottom:16px;">📋</div>
                    <h3>풀이 데이터가 없습니다</h3>
                    <p>1차 풀이를 먼저 완료한 뒤 해설을 확인하세요.</p>
                    <button onclick="WritingFlowV2._finishAndReturn('explain')"
                        style="margin-top:24px; padding:12px 32px; background:#9480c5; color:white; border:none; border-radius:8px; cursor:pointer; font-size:15px;">
                        과제 화면으로 돌아가기
                    </button>
                </div>
            `;
            return;
        }
        
        content.innerHTML = `
            <div style="max-width:800px; margin:0 auto; padding:20px;">
                <h2 style="text-align:center; margin-bottom:24px; color:#333;">
                    <i class="fas fa-chart-bar"></i> 단어배열 - 1차 vs 2차 비교
                </h2>
                
                <div style="display:flex; gap:16px; margin-bottom:24px; justify-content:center; flex-wrap:wrap;">
                    <div style="flex:1; min-width:160px; max-width:200px; background:#f8f9fa; border-radius:12px; padding:16px; text-align:center; border:2px solid #dee2e6;">
                        <div style="font-size:13px; color:#666; margin-bottom:6px;">1차</div>
                        <div style="font-size:32px; font-weight:bold; color:#333;">${first1stCorrect}/${total}</div>
                    </div>
                    <div style="display:flex; align-items:center; font-size:24px; color:#999;">→</div>
                    <div style="flex:1; min-width:160px; max-width:200px; background:#e8f5e9; border-radius:12px; padding:16px; text-align:center; border:2px solid #81c784;">
                        <div style="font-size:13px; color:#2e7d32; margin-bottom:6px;">최종</div>
                        <div style="font-size:32px; font-weight:bold; color:#2e7d32;">${combinedCorrect}/${total}</div>
                    </div>
                </div>
                
                <div style="overflow-x:auto; margin-bottom:32px;">
                    <table style="width:100%; border-collapse:collapse; text-align:center; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.06);">
                        <thead><tr style="background:#f8f9fa; border-bottom:2px solid #dee2e6;">
                            <th style="padding:10px 12px; font-size:13px; color:#666; font-weight:600; text-align:left; min-width:50px;"></th>${thCells}
                        </tr></thead>
                        <tbody>
                            <tr style="border-bottom:1px solid #eee;"><td style="padding:10px 12px; font-size:13px; font-weight:600; color:#333; text-align:left;">1차</td>${row1stCells}</tr>
                            <tr><td style="padding:10px 12px; font-size:13px; font-weight:600; color:#333; text-align:left;">2차</td>${row2ndCells}</tr>
                        </tbody>
                    </table>
                </div>
                
                <hr style="border:none; border-top:2px solid #eee; margin:32px 0;">
                
                <h3 style="margin-bottom:16px; color:#555;"><i class="fas fa-lightbulb"></i> 전체 문제 해설</h3>
                <div class="result-container">
                    <div class="result-details" id="v2ArrangeExplainDetails"></div>
                </div>
                
                <div style="text-align:center; margin-top:32px;">
                    <button onclick="WritingFlowV2._showEmailExplain()"
                        style="padding:14px 40px; font-size:16px; background:#4A90D9; color:white; border:none; border-radius:8px; cursor:pointer;">
                        <i class="fas fa-arrow-right"></i> 다음: 이메일 해설
                    </button>
                </div>
            </div>
        `;
        
        // 문제별 해설 렌더링
        const detailsContainer = document.getElementById('v2ArrangeExplainDetails');
        if (detailsContainer && r1 && r1.results) {
            let detailHtml = '';
            r1.results.forEach((result, index) => {
                if (typeof window.renderArrangeResultItem === 'function') {
                    detailHtml += window.renderArrangeResultItem(result, index);
                } else if (typeof renderArrangeResultItem === 'function') {
                    detailHtml += renderArrangeResultItem(result, index);
                }
            });
            detailsContainer.innerHTML = detailHtml;
        }
    },
    
    /**
     * 이메일 해설 (모범답안 표시)
     */
    _showEmailExplain() {
        console.log('📖 [WritingFlowV2] 이메일 해설');
        this.hideAllScreens();
        
        const emailData = this.email2ndData || this.email1stData;
        
        if (typeof window.showEmailResult === 'function' && emailData) {
            window.showEmailResult(emailData);
        } else {
            const screen = document.getElementById('writingEmailResultScreen');
            if (screen) screen.style.display = 'block';
        }
        
        // "다음: 토론 해설" 버튼 추가
        setTimeout(() => {
            const screen = document.getElementById('writingEmailResultScreen');
            if (!screen) return;
            
            // 헤더의 뒤로가기 버튼을 토론 해설로 변경
            const headerBackBtn = screen.querySelector('.test-header .btn-back-to-schedule');
            if (headerBackBtn) {
                headerBackBtn.onclick = (e) => { e.preventDefault(); WritingFlowV2._showDiscussionExplain(); };
                headerBackBtn.innerHTML = '<i class="fas fa-arrow-right"></i> 토론 해설';
            }
            
            // 하단 이동 버튼
            let nextBtn = document.getElementById('v2EmailToDiscBtn');
            if (!nextBtn) {
                const resultContainer = screen.querySelector('.result-container');
                if (resultContainer) {
                    nextBtn = document.createElement('div');
                    nextBtn.id = 'v2EmailToDiscBtn';
                    nextBtn.style.cssText = 'text-align:center; padding:24px 0;';
                    nextBtn.innerHTML = `
                        <button onclick="WritingFlowV2._showDiscussionExplain()"
                            style="padding:14px 40px; font-size:16px; background:#4A90D9; color:white; border:none; border-radius:8px; cursor:pointer;">
                            <i class="fas fa-arrow-right"></i> 다음: 토론 해설
                        </button>
                    `;
                    resultContainer.appendChild(nextBtn);
                }
            }
        }, 300);
    },
    
    /**
     * 토론 해설 (모범답안 표시)
     */
    _showDiscussionExplain() {
        console.log('📖 [WritingFlowV2] 토론 해설');
        this.hideAllScreens();
        
        // 이전 해설에서 추가한 동적 버튼 제거
        const prevBtn = document.getElementById('v2EmailToDiscBtn');
        if (prevBtn) prevBtn.remove();
        
        const discData = this.discussion2ndData || this.discussion1stData;
        
        if (typeof window.showDiscussionResult === 'function' && discData) {
            window.showDiscussionResult(discData);
        } else {
            const screen = document.getElementById('writingDiscussionResultScreen');
            if (screen) screen.style.display = 'block';
        }
        
        // "과제 화면으로" 버튼 추가
        setTimeout(() => {
            const screen = document.getElementById('writingDiscussionResultScreen');
            if (!screen) return;
            
            // 헤더 뒤로가기 → 과제 화면
            const headerBackBtn = screen.querySelector('.test-header .btn-back-to-schedule');
            if (headerBackBtn) {
                headerBackBtn.onclick = (e) => { e.preventDefault(); WritingFlowV2._finishAndReturn('explain'); };
                headerBackBtn.innerHTML = '<i class="fas fa-arrow-left"></i> 과제 화면';
            }
            
            // 하단 완료 버튼
            let finishBtn = document.getElementById('v2DiscFinishBtn');
            if (!finishBtn) {
                const resultContainer = screen.querySelector('.result-container');
                if (resultContainer) {
                    finishBtn = document.createElement('div');
                    finishBtn.id = 'v2DiscFinishBtn';
                    finishBtn.style.cssText = 'text-align:center; padding:24px 0;';
                    finishBtn.innerHTML = `
                        <button onclick="WritingFlowV2._finishAndReturn('explain')"
                            style="padding:14px 40px; font-size:16px; background:#9480c5; color:white; border:none; border-radius:8px; cursor:pointer;">
                            📋 과제 화면으로 돌아가기
                        </button>
                    `;
                    resultContainer.appendChild(finishBtn);
                }
            }
        }, 300);
    },
    
    // ====================================================================
    // 결과 추출 헬퍼
    // ====================================================================
    
    /**
     * 컴포넌트 직접 콜백에서 이메일 데이터 추출
     * (initEmailComponent 콜백이 직접 resultData를 전달)
     */
    _extractEmailResultDirect(result, attempt) {
        if (!result) {
            console.warn(`⚠️ [WritingFlowV2] email ${attempt} 결과 없음`);
            return;
        }
        if (attempt === '1st') {
            this.email1stData = result;
            this.email1stText = result.userAnswer || '';
            console.log(`📧 [WritingFlowV2] email 1차 텍스트: ${this.email1stText.length}자`);
        } else {
            this.email2ndData = result;
            this.email2ndText = result.userAnswer || '';
            console.log(`📧 [WritingFlowV2] email 2차 텍스트: ${this.email2ndText.length}자`);
        }
    },
    
    /**
     * 컴포넌트 직접 콜백에서 토론 데이터 추출
     * (initDiscussionComponent 콜백이 직접 resultData를 전달)
     */
    _extractDiscussionResultDirect(result, attempt) {
        if (!result) {
            console.warn(`⚠️ [WritingFlowV2] discussion ${attempt} 결과 없음`);
            return;
        }
        if (attempt === '1st') {
            this.discussion1stData = result;
            this.discussion1stText = result.userAnswer || '';
            console.log(`💬 [WritingFlowV2] discussion 1차 텍스트: ${this.discussion1stText.length}자`);
        } else {
            this.discussion2ndData = result;
            this.discussion2ndText = result.userAnswer || '';
            console.log(`💬 [WritingFlowV2] discussion 2차 텍스트: ${this.discussion2ndText.length}자`);
        }
    },
    
    // ====================================================================
    // 완료 처리 + 대시보드 복귀
    // ====================================================================
    _finishAndReturn(type) {
        console.log('🏠 [WritingFlowV2] 완료 → 대시보드 복귀 (type:', type, ')');
        
        // 동적 버튼 정리
        ['v2EmailToDiscBtn', 'v2DiscFinishBtn'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
        
        // 동적 스크린 숨기기
        const dynScreen = document.getElementById('writingV2CompleteScreen');
        if (dynScreen) dynScreen.style.display = 'none';
        
        // 타이머 정리
        this._clearAllTimers();
        
        // 전역 플래그 리셋
        this._resetGlobalFlags();
        
        // 콜백 호출 (stage-selector에서 대시보드 복귀 처리)
        if (this.onComplete) {
            this.onComplete(type, this.getResult());
        }
    },
    
    /**
     * 결과 데이터 반환 (stage-selector용)
     */
    getResult() {
        const r1 = this.arrange1stResult;
        const r2 = this.arrange2ndResult;
        const arrangeCorrect1st = r1 ? r1.correct : 0;
        const arrangeTotal = r1 ? r1.total : 10;
        
        // 2차 최종 점수
        let arrangeCorrect2nd = arrangeCorrect1st;
        if (r2 && r2.results && r1 && r1.results) {
            r1.results.forEach((q1, idx) => {
                if (!q1.isCorrect) {
                    const q2 = r2.results[idx];
                    if (q2 && q2.isCorrect) arrangeCorrect2nd++;
                }
            });
        }
        
        return {
            arrange1st: this.arrange1stResult,
            arrange2nd: this.arrange2ndResult,
            arrangeCorrect1st: arrangeCorrect1st,
            arrangeCorrect2nd: arrangeCorrect2nd,
            arrangeTotal: arrangeTotal,
            email1stSubmitted: !!this.email1stText,
            email2ndSubmitted: !!this.email2ndText,
            discussion1stSubmitted: !!this.discussion1stText,
            discussion2ndSubmitted: !!this.discussion2ndText,
            // ★ 실제 작성 텍스트 (DB 저장 + 열람용)
            email1stText: this.email1stText || '',
            email2ndText: this.email2ndText || '',
            discussion1stText: this.discussion1stText || '',
            discussion2ndText: this.discussion2ndText || '',
            // ★ 문제 정보 (해설 화면용 — DB에 함께 저장)
            email1stData: this.email1stData || null,
            email2ndData: this.email2ndData || null,
            discussion1stData: this.discussion1stData || null,
            discussion2ndData: this.discussion2ndData || null
        };
    },
    
    /**
     * 상태 조회 (디버깅용)
     */
    getStatus() {
        return {
            moduleNumber: this.moduleNumber,
            hasArrange1st: !!this.arrange1stResult,
            hasArrange2nd: !!this.arrange2ndResult,
            hasEmail1st: !!this.email1stText,
            hasEmail2nd: !!this.email2ndText,
            hasDiscussion1st: !!this.discussion1stText,
            hasDiscussion2nd: !!this.discussion2ndText,
            hasKoData: !!this.koData
        };
    },
    
    /**
     * cleanup (외부에서 호출 가능)
     */
    cleanup() {
        console.log('🧹 [WritingFlowV2] cleanup');
        this._clearAllTimers();
        this._resetGlobalFlags();
        
        // 현재 활성 컴포넌트 정리
        if (window.currentArrangeComponent && typeof window.currentArrangeComponent.cleanup === 'function') {
            try { window.currentArrangeComponent.cleanup(); } catch(e) {}
        }
        this.arrange1stResult = null;
        this.arrange2ndResult = null;
        this.email1stText = '';
        this.email1stData = null;
        this.email2ndText = '';
        this.email2ndData = null;
        this.discussion1stText = '';
        this.discussion1stData = null;
        this.discussion2ndText = '';
        this.discussion2ndData = null;
        this.koData = null;
        
        // 동적 요소 제거
        ['v2EmailToDiscBtn', 'v2DiscFinishBtn'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
        
        // sessionStorage 정리
        try { sessionStorage.removeItem('discussionProfiles'); } catch(e) {}
        window.currentDiscussionProfiles = null;
    }
};

window.WritingFlowV2 = WritingFlowV2;

console.log('✅ [V2] writing-flow-v2.js 로드 완료');
