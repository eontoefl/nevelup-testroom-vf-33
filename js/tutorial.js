/**
 * tutorial.js — 온보딩 튜토리얼 모달
 * 
 * 첫 로그인 시 8페이지 가이드를 표시합니다.
 * "다시 보지 않기" 체크 시 localStorage에 저장하여 이후 표시하지 않습니다.
 */

const TutorialSystem = (() => {
    const STORAGE_KEY = 'nevelup_tutorial_completed';
    let currentPage = 0;
    let overlayEl = null;

    // ── 튜토리얼 페이지 데이터 ──
    const pages = [
        {
            step: '시작',
            emoji: '👋',
            title: '내벨업 테스트룸에 오신 걸 환영해요!',
            subtitle: '약 2분이면 주요 기능을 모두 둘러볼 수 있어요.',
            image: 'screenshots/02-schedule.png',
            content: `
                <p class="tutorial-content-text">
                    <strong>내벨업 테스트룸</strong>은 매일 정해진 과제를 풀고, 오답을 정리하며 실력을 키워가는 학습 공간입니다.<br><br>
                    지금부터 화면별로 사용법을 안내해 드릴게요.
                </p>
            `
        },
        {
            step: '학습 일정',
            emoji: '📅',
            title: '학습 일정 화면',
            subtitle: '로그인 후 가장 먼저 보이는 메인 화면이에요.',
            image: 'screenshots/02-schedule.png',
            highlights: [
                { text: '유저 정보', top: '1%', left: '2%' },
                { text: '🔔 알림', top: '1%', right: '12%' },
                { text: '📊 마이페이지', top: '1%', right: '5%' }
            ],
            content: `
                <p class="tutorial-content-text">
                    주차별·요일별 과제가 표시됩니다. 날짜 카드를 누르면 해당 요일의 과제 목록으로 이동해요.
                </p>
                <div class="tutorial-dot-legend">
                    <div class="tutorial-dot-legend-item"><span class="dot green"></span> 초록: 모든 과제 완료</div>
                    <div class="tutorial-dot-legend-item"><span class="dot orange"></span> 주황: 일부 완료</div>
                    <div class="tutorial-dot-legend-item"><span class="dot gray"></span> 회색: 미시작 / 예정</div>
                    <div class="tutorial-dot-legend-item"><span class="dot red"></span> 빨강: 마감 후 미제출</div>
                </div>
            `
        },
        {
            step: '과제 목록',
            emoji: '📋',
            title: '과제 목록 화면',
            subtitle: '날짜를 누르면 해당 요일의 과제가 보여요.',
            image: 'screenshots/03-tasklist.png',
            content: `
                <p class="tutorial-content-text">
                    해당 요일에 배정된 과제 카드가 표시됩니다. 과제 유형은 다음과 같아요:
                </p>
                <ul class="tutorial-bullet-list">
                    <li><strong>내벨업보카</strong> — 단어 시험 (정답률 30% 이상이면 인증)</li>
                    <li><strong>입문서 정독</strong> — PDF 읽기 + 메모 작성 (메모를 남기면 인증)</li>
                    <li><strong>리딩 / 리스닝 / 라이팅 / 스피킹</strong> — 4대 영역 모듈</li>
                </ul>
                <p class="tutorial-content-text">
                    카드 우측 상단에 <span class="highlight">✅ 완료</span> 표시가 보이면 실전풀이가 완료된 과제입니다.
                </p>
            `
        },
        {
            step: '과제 대시보드',
            emoji: '🎯',
            title: '과제 대시보드',
            subtitle: '과제 카드를 누르면 풀이·해설·채점 결과를 한눈에 볼 수 있어요.',
            image: 'screenshots/06-task-dashboard.png',
            content: `
                <p class="tutorial-content-text">
                    과제 대시보드에서는 세 가지를 할 수 있어요:
                </p>
                <ul class="tutorial-bullet-list">
                    <li><strong>풀이</strong> — 실전풀이 또는 다시풀기를 시작합니다</li>
                    <li><strong>해설</strong> — 풀이 완료 후 해설과 오답노트를 확인합니다</li>
                    <li><strong>채점 결과</strong> — 실전풀이 점수와 다시풀기 점수가 표시됩니다</li>
                </ul>
            `
        },
        {
            step: '실전풀이 & 다시풀기',
            emoji: '📝',
            title: '실전풀이는 단 한 번!',
            subtitle: '실전풀이와 다시풀기의 차이를 꼭 알아두세요.',
            image: 'screenshots/04-dashboard.png',
            content: `
                <div class="tutorial-info-box danger">
                    <strong>⚠️ 실전풀이</strong>는 <strong>딱 한 번</strong>만 기록됩니다.<br>
                    중간에 나가거나 새로고침하면 <strong>다시 할 수 없으며</strong>, 그 상태로 영구 저장됩니다.<br>
                    실전풀이 결과는 차트와 포트폴리오에 반영돼요.
                </div>
                <div class="tutorial-info-box">
                    <strong>🔄 다시풀기</strong>는 실전풀이 완료 후 <strong>무한정</strong> 가능합니다.<br>
                    단, <strong>가장 최근 기록만</strong> 대시보드에 표시됩니다.
                </div>
            `
        },
        {
            step: '오답노트 & 인증',
            emoji: '✍️',
            title: '오답노트까지 써야 100%!',
            subtitle: '실전풀이만으로는 인증이 완료되지 않아요.',
            image: null,
            content: `
                <p class="tutorial-content-text">
                    해설 화면에서는 정답 해설과 함께 <strong>오답노트</strong>를 작성할 수 있어요.
                </p>
                <div class="tutorial-info-box warning">
                    <strong>인증률 기준:</strong><br>
                    ・ 실전풀이만 완료 → <strong>50%</strong><br>
                    ・ 실전풀이 + 오답노트 제출 → <strong>100%</strong><br><br>
                    오답노트는 마감 전까지 수정할 수 있고, 마감 후에는 잠겨요.
                </div>
                <p class="tutorial-content-text" style="margin-top: 12px;">
                    <strong>내벨업보카</strong>와 <strong>입문서 정독</strong>은 별도의 오답노트가 없으며,<br>
                    각각 <span class="highlight">정답률 30% 이상</span>, <span class="highlight">메모 작성</span> 시 바로 100% 인증됩니다.
                </p>
            `
        },
        {
            step: '마감 & 알림',
            emoji: '⏰',
            title: '마감과 주간체크',
            subtitle: '과제 마감 시간과 알림 기능을 알려드릴게요.',
            image: 'screenshots/07-notification-bell.png',
            content: `
                <div class="tutorial-info-box">
                    <strong>📌 마감 시간:</strong> 각 요일의 과제는 <strong>다음 날 새벽 4시</strong>까지 제출해야 해요.<br>
                    예) 월요일 과제 마감 → 화요일 오전 4:00<br><br>
                    마감 후에는 인증률이 확정되며, 이후에는 다시풀기만 가능해요.
                </div>
                <p class="tutorial-content-text" style="margin-top: 12px;">
                    <strong>📣 주간체크(포트폴리오):</strong><br>
                    매주 월~수요일 사이에 화면 우측 상단의 <span class="highlight">🔔 알림</span>으로 주간체크를 보내드려요.
                </p>
            `
        },
        {
            step: '마이페이지',
            emoji: '📊',
            title: '마이페이지',
            subtitle: '나의 학습 현황을 한눈에 확인하세요.',
            image: 'screenshots/05-mypage-full.png',
            content: `
                <p class="tutorial-content-text">
                    학습 일정 화면 우측 상단의 <span class="highlight">📊 아이콘</span>을 누르면 마이페이지로 이동해요.
                </p>
                <ul class="tutorial-bullet-list">
                    <li><strong>출석 잔디</strong> — 날짜별 과제 완료 현황을 색으로 확인 (진한 초록 = 100%, 연한 초록 = 50%, 빨강 = 미제출)</li>
                    <li><strong>인증률</strong> — 전체 인증 달성 비율</li>
                    <li><strong>성적 추이</strong> — 리딩/리스닝 모듈별 레벨 변화 차트</li>
                </ul>
            `
        }
    ];

    // ── 렌더링 함수 ──
    function render() {
        const page = pages[currentPage];
        const totalPages = pages.length;
        const isFirst = currentPage === 0;
        const isLast = currentPage === totalPages - 1;

        // Step label
        overlayEl.querySelector('.tutorial-step-label').textContent = 
            `${currentPage + 1} / ${totalPages}  ·  ${page.step}`;

        // Body
        const body = overlayEl.querySelector('.tutorial-modal-body');
        let html = '';

        // Title
        html += `<div class="tutorial-page-title">
            <span class="tutorial-emoji">${page.emoji}</span> ${page.title}
        </div>`;
        html += `<p class="tutorial-page-subtitle">${page.subtitle}</p>`;

        // Screenshot
        if (page.image) {
            html += `<div class="tutorial-screenshot-wrap">
                <img src="${page.image}" alt="${page.title}" loading="lazy">`;
            if (page.highlights) {
                page.highlights.forEach(h => {
                    let style = '';
                    if (h.top) style += `top:${h.top};`;
                    if (h.left) style += `left:${h.left};`;
                    if (h.right) style += `right:${h.right};`;
                    if (h.bottom) style += `bottom:${h.bottom};`;
                    html += `<span class="tutorial-highlight-badge" style="${style}">${h.text}</span>`;
                });
            }
            html += `</div>`;
        }

        // Content
        html += page.content;

        body.innerHTML = html;
        body.scrollTop = 0;

        // Page indicators
        const indicators = overlayEl.querySelector('.tutorial-page-indicators');
        indicators.innerHTML = '';
        for (let i = 0; i < totalPages; i++) {
            const dot = document.createElement('div');
            dot.className = 'dot' + (i === currentPage ? ' active' : '');
            dot.addEventListener('click', () => goToPage(i));
            indicators.appendChild(dot);
        }

        // Buttons
        const prevBtn = overlayEl.querySelector('.tutorial-btn-prev');
        const nextBtn = overlayEl.querySelector('.tutorial-btn-next');

        prevBtn.style.display = isFirst ? 'none' : 'flex';
        
        if (isLast) {
            nextBtn.innerHTML = '시작하기 🚀';
            nextBtn.classList.add('finish');
        } else {
            nextBtn.innerHTML = '다음 →';
            nextBtn.classList.remove('finish');
        }
    }

    function goToPage(idx) {
        if (idx < 0 || idx >= pages.length) return;
        currentPage = idx;
        render();
    }

    function nextPage() {
        if (currentPage < pages.length - 1) {
            currentPage++;
            render();
        } else {
            close();
        }
    }

    function prevPage() {
        if (currentPage > 0) {
            currentPage--;
            render();
        }
    }

    function close() {
        if (!overlayEl) return;

        // "다시 보지 않기" 체크 여부 확인
        const checkbox = overlayEl.querySelector('#tutorialDontShowAgain');
        if (checkbox && checkbox.checked) {
            try {
                localStorage.setItem(STORAGE_KEY, 'true');
                console.log('📘 [튜토리얼] "다시 보지 않기" 저장됨');
            } catch (e) {
                console.warn('튜토리얼 완료 저장 실패:', e);
            }
        }

        overlayEl.classList.remove('active');
        setTimeout(() => {
            overlayEl.remove();
            overlayEl = null;
        }, 350);
    }

    // ── 모달 DOM 생성 ──
    function createModal() {
        const overlay = document.createElement('div');
        overlay.className = 'tutorial-overlay';
        overlay.innerHTML = `
            <div class="tutorial-modal">
                <div class="tutorial-modal-header">
                    <span class="tutorial-step-label"></span>
                    <button class="tutorial-close-btn" title="닫기">✕</button>
                </div>
                <div class="tutorial-modal-body"></div>
                <div class="tutorial-modal-footer">
                    <div class="tutorial-footer-top">
                        <div class="tutorial-page-indicators"></div>
                        <div class="tutorial-nav-buttons">
                            <button class="tutorial-btn tutorial-btn-prev">← 이전</button>
                            <button class="tutorial-btn tutorial-btn-next">다음 →</button>
                        </div>
                    </div>
                    <label class="tutorial-dont-show">
                        <input type="checkbox" id="tutorialDontShowAgain">
                        <span>다시 보지 않기</span>
                    </label>
                </div>
            </div>
        `;

        // 이벤트 바인딩
        overlay.querySelector('.tutorial-close-btn').addEventListener('click', close);
        overlay.querySelector('.tutorial-btn-prev').addEventListener('click', prevPage);
        overlay.querySelector('.tutorial-btn-next').addEventListener('click', nextPage);

        // 오버레이 바깥 클릭으로 닫지 않음 (튜토리얼 중요)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                // 흔들림 효과로 모달 닫지 않음을 알려줌
                const modal = overlay.querySelector('.tutorial-modal');
                modal.style.animation = 'tutorialShake 0.3s ease';
                setTimeout(() => modal.style.animation = '', 300);
            }
        });

        return overlay;
    }

    // ── 공개 API ──
    function show(force = false) {
        // 이미 완료한 경우 표시하지 않음
        if (!force) {
            try {
                if (localStorage.getItem(STORAGE_KEY) === 'true') {
                    console.log('📘 [튜토리얼] 이미 완료됨 — 건너뜀');
                    return;
                }
            } catch (e) {}
        }

        if (overlayEl) return; // 중복 방지

        currentPage = 0;
        overlayEl = createModal();
        document.body.appendChild(overlayEl);

        // 트랜지션을 위해 약간의 딜레이
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                overlayEl.classList.add('active');
                render();
            });
        });

        console.log('📘 [튜토리얼] 온보딩 가이드 표시');
    }

    function reset() {
        try {
            localStorage.removeItem(STORAGE_KEY);
            console.log('📘 [튜토리얼] 완료 기록 초기화됨');
        } catch (e) {}
    }

    return { show, close, reset };
})();
