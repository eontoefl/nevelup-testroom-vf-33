/**
 * ================================================
 * book-viewer.js — PDF 뷰어 핵심 로직
 * ================================================
 * 
 * 기능:
 * 1. PDF.js로 PDF 렌더링
 * 2. 페이지 넘기기 (버튼 + 스와이프)
 * 3. 줌 (확대/축소/핀치줌)
 * 4. 목차(TOC) 사이드바 — DB에서 로드
 * 5. 북마크 CRUD — DB 연동
 * 6. 메모 CRUD — DB 연동
 * 7. 읽기 진도 저장/복원 + 완독 체크
 * 8. 다운로드 차단
 * 9. 인증 확인
 * 10. 전체화면
 * 11. 페이지 점프 모달
 * 
 * 의존성:
 * - supabase-client.js (supabaseSelect, supabaseInsert, supabaseUpdate, supabaseUpsert)
 * - auth.js (getCurrentUser, getCurrentUserId)
 * - PDF.js (CDN)
 */

// ================================================
// 0. 인증 확인 — auth.js가 처리하므로 여기서는 기본 세션 체크만
// ================================================
// auth_token이 있으면 auth.js가 인증 후 authReady 이벤트를 발행함.
// 세션이 이미 있으면 auth.js가 authReady를 발행함.
// 둘 다 없으면 auth.js가 공홈으로 리다이렉트함.

// ================================================
// 1. 전역 상태
// ================================================

const BookViewer = {
    // PDF.js
    pdfDoc: null,
    currentPage: 1,
    totalPages: 0,
    rendering: false,
    pendingPage: null,

    // 줌
    scale: 1.0,
    minScale: 0.5,
    maxScale: 3.0,
    scaleStep: 0.25,
    fitScale: 1.0, // 화면에 맞춘 기본 배율

    // 책 정보 (DB에서 로드)
    bookId: null,
    bookData: null,    // tr_book_documents row
    progressData: null, // tr_book_progress row
    memos: {},          // { pageNumber: { id, content, ... } }

    // 유저
    userId: null,

    // 스와이프
    touchStartX: 0,
    touchStartY: 0,
    touchMoved: false,

    // 핀치줌
    initialPinchDistance: 0,
    initialPinchScale: 1,

    // 자동저장 타이머
    saveTimer: null,

    // PDF URL (Supabase Storage 또는 직접 경로)
    pdfUrl: null,

    // ── 과제 상태 바 관련 ──
    taskParams: null,     // { current, total, week, day, deadline }
    requiredMemos: 0,     // current × 2
    isCertified: false,   // 인증 완료 여부
};

// ================================================
// 2. DOM 참조
// ================================================
const DOM = {};

function cacheDom() {
    // 상단바
    DOM.btnBack = document.getElementById('btnBack');
    DOM.bookTitle = document.getElementById('bookTitle');
    DOM.btnBookmark = document.getElementById('btnBookmark');
    DOM.btnSidebar = document.getElementById('btnSidebar');

    // 진행률 바
    DOM.progressFill = document.getElementById('progressFill');

    // 과제 상태 바
    DOM.taskBar = document.getElementById('taskBar');
    DOM.taskBarText = document.getElementById('taskBarText');

    // 사이드바
    DOM.sidebar = document.getElementById('sidebar');
    DOM.sidebarOverlay = document.getElementById('sidebarOverlay');
    DOM.tocList = document.getElementById('tocList');
    DOM.bookmarkList = document.getElementById('bookmarkList');
    DOM.bookmarkEmpty = document.getElementById('bookmarkEmpty');
    DOM.sidebarTabs = document.querySelectorAll('.book-sidebar-tab');
    DOM.tabToc = document.getElementById('tabToc');
    DOM.tabBookmarks = document.getElementById('tabBookmarks');

    // 뷰어
    DOM.bookViewer = document.getElementById('bookViewer');
    DOM.bookLoading = document.getElementById('bookLoading');
    DOM.canvasWrapper = document.getElementById('canvasWrapper');
    DOM.pdfCanvas = document.getElementById('pdfCanvas');
    DOM.btnPrevPage = document.getElementById('btnPrevPage');
    DOM.btnNextPage = document.getElementById('btnNextPage');

    // 하단 툴바
    DOM.currentPage = document.getElementById('currentPage');
    DOM.totalPages = document.getElementById('totalPages');
    DOM.btnPageJump = document.getElementById('btnPageJump');
    DOM.btnZoomIn = document.getElementById('btnZoomIn');
    DOM.btnZoomOut = document.getElementById('btnZoomOut');
    DOM.zoomLevel = document.getElementById('zoomLevel');
    DOM.btnMemo = document.getElementById('btnMemo');
    DOM.memoDot = document.getElementById('memoDot');
    DOM.btnFullscreen = document.getElementById('btnFullscreen');

    // 메모 사이드바 (왼쪽)
    DOM.memoSidebar = document.getElementById('memoSidebar');
    DOM.memoSidebarOverlay = document.getElementById('memoSidebarOverlay');
    DOM.memoPageLabel = document.getElementById('memoPageLabel');
    DOM.memoTextarea = document.getElementById('memoTextarea');
    DOM.memoCharCount = document.getElementById('memoCharCount');
    DOM.btnMemoClose = document.getElementById('btnMemoClose');
    DOM.btnMemoSave = document.getElementById('btnMemoSave');
    DOM.btnMemoDelete = document.getElementById('btnMemoDelete');

    // 페이지 점프 모달
    DOM.pageJumpOverlay = document.getElementById('pageJumpOverlay');
    DOM.pageJumpInput = document.getElementById('pageJumpInput');
    DOM.pageJumpMax = document.getElementById('pageJumpMax');
    DOM.btnPageJumpConfirm = document.getElementById('btnPageJumpConfirm');
    DOM.btnPageJumpCancel = document.getElementById('btnPageJumpCancel');

    // 완독 모달
    DOM.completeOverlay = document.getElementById('completeOverlay');
    DOM.btnCompleteClose = document.getElementById('btnCompleteClose');
}

// ================================================
// 3. 초기화
// ================================================
async function init() {
    console.log('📖 [BookViewer] 초기화 시작');
    cacheDom();
    bindEvents();
    preventDownload();

    // 유저 정보 — auth.js가 authReady 발행 시점에는 반드시 sessionStorage에 저장되어 있음
    const user = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!user) {
        console.log('❌ [BookViewer] 세션 없음 — 종료');
        return;
    }
    BookViewer.userId = user.id;
    BookViewer.isBookOnly = user.programType === 'book_only';

    // book_only 사용자 UI 조정
    if (BookViewer.isBookOnly) {
        setupBookOnlyUI();
    }

    // URL 파라미터 파싱 (과제 모드 여부 판단)
    parseTaskParams();

    // DB에서 책 정보 로드
    const loaded = await loadBookData();
    if (!loaded) {
        DOM.bookLoading.querySelector('p').textContent = '입문서를 찾을 수 없습니다.';
        return;
    }

    // PDF 로드 + 렌더링
    await loadPdf();

    // 진도 복원
    await loadProgress();

    // 메모 전체 로드
    await loadAllMemos();

    // 과제 상태 바 초기화 (메모 로드 후) — book_only 사용자는 과제 바 숨김
    if (!BookViewer.isBookOnly) {
        await initTaskBar();
    }

    // 로딩 숨기기
    DOM.bookLoading.classList.add('hidden');

    // 페이지 이동 (저장된 진도로)
    if (BookViewer.progressData && BookViewer.progressData.last_page > 1) {
        goToPage(BookViewer.progressData.last_page);
    } else {
        goToPage(1);
    }

    console.log('📖 [BookViewer] 초기화 완료');
}

// ================================================
// 4. DB: 책 정보 로드
// ================================================
async function loadBookData() {
    console.log('📖 [BookViewer] 책 정보 로드');

    const books = await supabaseSelect(
        'tr_book_documents',
        'is_active=eq.true&order=sort_order.asc&limit=1'
    );

    if (!books || books.length === 0) {
        console.error('❌ [BookViewer] 활성 책 없음');
        return false;
    }

    BookViewer.bookData = books[0];
    BookViewer.bookId = books[0].id;
    BookViewer.totalPages = books[0].total_pages;

    // 타이틀 업데이트
    DOM.bookTitle.textContent = books[0].title || '입문서';
    DOM.totalPages.textContent = BookViewer.totalPages;
    DOM.pageJumpMax.textContent = BookViewer.totalPages;

    // PDF URL 생성 — Supabase Storage (private bucket)
    BookViewer.pdfUrl = SUPABASE_CONFIG.url 
        + '/storage/v1/object/authenticated/' 
        + books[0].storage_path;

    // 목차 렌더링
    renderToc(books[0].toc || []);

    console.log('✅ [BookViewer] 책 로드:', books[0].title, '(' + books[0].total_pages + '페이지)');
    return true;
}

// ================================================
// 5. PDF.js: PDF 로드 + 렌더링
// ================================================
async function loadPdf() {
    console.log('📖 [BookViewer] PDF 로드 시작');

    // PDF.js 워커 설정
    pdfjsLib.GlobalWorkerOptions.workerSrc = 
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    try {
        const loadingTask = pdfjsLib.getDocument({
            url: BookViewer.pdfUrl,
            httpHeaders: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': 'Bearer ' + SUPABASE_CONFIG.anonKey
            }
        });

        BookViewer.pdfDoc = await loadingTask.promise;
        BookViewer.totalPages = BookViewer.pdfDoc.numPages;
        DOM.totalPages.textContent = BookViewer.totalPages;
        DOM.pageJumpMax.textContent = BookViewer.totalPages;

        console.log('✅ [BookViewer] PDF 로드 완료:', BookViewer.totalPages + '페이지');
    } catch (err) {
        console.error('❌ [BookViewer] PDF 로드 실패:', err);
        DOM.bookLoading.querySelector('p').textContent = 'PDF를 불러올 수 없습니다. 새로고침 해주세요.';
        throw err;
    }
}

async function renderPage(pageNum) {
    if (BookViewer.rendering) {
        BookViewer.pendingPage = pageNum;
        return;
    }

    BookViewer.rendering = true;

    try {
        const page = await BookViewer.pdfDoc.getPage(pageNum);
        const canvas = DOM.pdfCanvas;
        const ctx = canvas.getContext('2d');

        // 뷰어 영역(바깥 컨테이너) 기준으로 fitScale 계산
        const viewport0 = page.getViewport({ scale: 1 });
        const viewer = DOM.bookViewer;
        const viewerW = viewer.clientWidth - 60; // padding 30px * 2
        const viewerH = viewer.clientHeight - 60;

        const fitScaleW = viewerW / viewport0.width;
        const fitScaleH = viewerH / viewport0.height;
        BookViewer.fitScale = Math.min(fitScaleW, fitScaleH);

        const effectiveScale = BookViewer.fitScale * BookViewer.scale;
        const viewport = page.getViewport({ scale: effectiveScale });

        // HiDPI 처리
        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;

    } catch (err) {
        console.error('❌ [BookViewer] 페이지 렌더링 실패:', err);
    }

    BookViewer.rendering = false;

    if (BookViewer.pendingPage !== null) {
        const next = BookViewer.pendingPage;
        BookViewer.pendingPage = null;
        renderPage(next);
    }
}

// ================================================
// 6. 페이지 이동
// ================================================
function goToPage(pageNum) {
    pageNum = Math.max(1, Math.min(pageNum, BookViewer.totalPages));
    BookViewer.currentPage = pageNum;

    // UI 업데이트
    DOM.currentPage.textContent = pageNum;
    updateProgressBar();
    updateBookmarkIcon();
    updateMemoDot();
    updatePageButtons();

    // 메모 사이드바가 열려있으면 현재 페이지 메모로 자동 갱신
    if (isMemoSidebarOpen()) {
        updateMemoContent();
    }

    // 스크롤 위치 초기화 (확대 상태에서 페이지 넘길 때)
    DOM.bookViewer.scrollTop = 0;
    DOM.bookViewer.scrollLeft = 0;

    // 렌더링
    renderPage(pageNum);

    // 진도 자동저장 (디바운스)
    debounceSaveProgress();
}

function nextPage() {
    if (BookViewer.currentPage < BookViewer.totalPages) {
        goToPage(BookViewer.currentPage + 1);
    }
}

function prevPage() {
    if (BookViewer.currentPage > 1) {
        goToPage(BookViewer.currentPage - 1);
    }
}

function updatePageButtons() {
    DOM.btnPrevPage.style.opacity = BookViewer.currentPage <= 1 ? '0.3' : '1';
    DOM.btnPrevPage.style.pointerEvents = BookViewer.currentPage <= 1 ? 'none' : 'auto';
    DOM.btnNextPage.style.opacity = BookViewer.currentPage >= BookViewer.totalPages ? '0.3' : '1';
    DOM.btnNextPage.style.pointerEvents = BookViewer.currentPage >= BookViewer.totalPages ? 'none' : 'auto';
}

// ================================================
// 7. 줌
// ================================================
function zoomIn() {
    if (BookViewer.scale < BookViewer.maxScale) {
        BookViewer.scale = Math.min(BookViewer.maxScale, +(BookViewer.scale + BookViewer.scaleStep).toFixed(2));
        updateZoomUI();
        renderPage(BookViewer.currentPage);
    }
}

function zoomOut() {
    if (BookViewer.scale > BookViewer.minScale) {
        BookViewer.scale = Math.max(BookViewer.minScale, +(BookViewer.scale - BookViewer.scaleStep).toFixed(2));
        updateZoomUI();
        renderPage(BookViewer.currentPage);
    }
}

function setZoom(newScale) {
    BookViewer.scale = Math.max(BookViewer.minScale, Math.min(BookViewer.maxScale, +newScale.toFixed(2)));
    updateZoomUI();
    renderPage(BookViewer.currentPage);
}

function updateZoomUI() {
    DOM.zoomLevel.textContent = Math.round(BookViewer.scale * 100) + '%';
}

// ================================================
// 8. 진행률
// ================================================
function updateProgressBar() {
    const pct = BookViewer.totalPages > 0
        ? Math.round((BookViewer.currentPage / BookViewer.totalPages) * 100)
        : 0;
    DOM.progressFill.style.width = pct + '%';
}

// ================================================
// 9. DB: 진도 로드 / 저장
// ================================================
async function loadProgress() {
    if (!BookViewer.userId || !BookViewer.bookId) return;

    const rows = await supabaseSelect(
        'tr_book_progress',
        'user_id=eq.' + BookViewer.userId 
        + '&book_id=eq.' + BookViewer.bookId 
        + '&limit=1'
    );

    if (rows && rows.length > 0) {
        BookViewer.progressData = rows[0];
        console.log('📖 [BookViewer] 진도 복원: 페이지', rows[0].last_page);
    } else {
        // 첫 방문 — 레코드 생성
        const newRow = await supabaseInsert('tr_book_progress', {
            user_id: BookViewer.userId,
            book_id: BookViewer.bookId,
            last_page: 1,
            max_page_reached: 1,
            is_completed: false,
            bookmarks: []
        });
        BookViewer.progressData = newRow;
        console.log('📖 [BookViewer] 진도 신규 생성');
    }
}

function debounceSaveProgress() {
    if (BookViewer.saveTimer) clearTimeout(BookViewer.saveTimer);
    BookViewer.saveTimer = setTimeout(() => {
        saveProgress();
    }, 1000);
}

async function saveProgress() {
    if (!BookViewer.progressData) return;

    const maxReached = Math.max(
        BookViewer.progressData.max_page_reached || 1,
        BookViewer.currentPage
    );

    const isCompleted = maxReached >= BookViewer.totalPages;
    const wasCompleted = BookViewer.progressData.is_completed;

    const updateData = {
        last_page: BookViewer.currentPage,
        max_page_reached: maxReached,
        is_completed: isCompleted,
        updated_at: new Date().toISOString()
    };

    // 완독 시점 기록
    if (isCompleted && !wasCompleted) {
        updateData.completed_at = new Date().toISOString();
    }

    const result = await supabaseUpdate(
        'tr_book_progress',
        'id=eq.' + BookViewer.progressData.id,
        updateData
    );

    if (result) {
        BookViewer.progressData.last_page = BookViewer.currentPage;
        BookViewer.progressData.max_page_reached = maxReached;
        BookViewer.progressData.is_completed = isCompleted;

        // 완독 축하 (최초 1회)
        if (isCompleted && !wasCompleted) {
            showCompleteModal();
        }
    }
}

// ================================================
// 10. 북마크
// ================================================
function getBookmarks() {
    if (!BookViewer.progressData || !BookViewer.progressData.bookmarks) return [];
    return BookViewer.progressData.bookmarks;
}

function isBookmarked(pageNum) {
    return getBookmarks().includes(pageNum);
}

async function toggleBookmark() {
    const page = BookViewer.currentPage;
    let bookmarks = [...getBookmarks()];

    if (isBookmarked(page)) {
        bookmarks = bookmarks.filter(p => p !== page);
    } else {
        bookmarks.push(page);
        bookmarks.sort((a, b) => a - b);
    }

    // DB 업데이트
    const result = await supabaseUpdate(
        'tr_book_progress',
        'id=eq.' + BookViewer.progressData.id,
        { bookmarks: bookmarks, updated_at: new Date().toISOString() }
    );

    if (result) {
        BookViewer.progressData.bookmarks = bookmarks;
        updateBookmarkIcon();
        renderBookmarkList();
        showToast(isBookmarked(page) ? '북마크 추가됨' : '북마크 해제됨');
    } else {
        showToast('저장 실패. 다시 시도해주세요.', true);
    }
}

function updateBookmarkIcon() {
    const icon = DOM.btnBookmark.querySelector('i');
    if (isBookmarked(BookViewer.currentPage)) {
        icon.className = 'fa-solid fa-bookmark';
        DOM.btnBookmark.classList.add('bookmarked');
    } else {
        icon.className = 'fa-regular fa-bookmark';
        DOM.btnBookmark.classList.remove('bookmarked');
    }
}

function renderBookmarkList() {
    const bookmarks = getBookmarks();
    DOM.bookmarkList.innerHTML = '';

    if (bookmarks.length === 0) {
        DOM.bookmarkEmpty.classList.remove('hidden');
        return;
    }

    DOM.bookmarkEmpty.classList.add('hidden');

    bookmarks.forEach(page => {
        const li = document.createElement('li');
        li.className = 'book-bookmark-item';
        li.innerHTML = `
            <div class="book-bookmark-item-left">
                <i class="fa-solid fa-bookmark book-bookmark-icon"></i>
                <span>${page}페이지</span>
            </div>
            <button class="book-bookmark-remove" data-page="${page}" title="북마크 삭제">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;
        // 페이지 이동 (왼쪽 클릭)
        li.querySelector('.book-bookmark-item-left').addEventListener('click', () => {
            goToPage(page);
            closeSidebar();
        });
        // 삭제 버튼
        li.querySelector('.book-bookmark-remove').addEventListener('click', async (e) => {
            e.stopPropagation();
            await removeBookmark(page);
        });

        DOM.bookmarkList.appendChild(li);
    });
}

async function removeBookmark(page) {
    let bookmarks = getBookmarks().filter(p => p !== page);
    const result = await supabaseUpdate(
        'tr_book_progress',
        'id=eq.' + BookViewer.progressData.id,
        { bookmarks: bookmarks, updated_at: new Date().toISOString() }
    );
    if (result) {
        BookViewer.progressData.bookmarks = bookmarks;
        updateBookmarkIcon();
        renderBookmarkList();
        showToast('북마크 해제됨');
    }
}

// ================================================
// 11. 목차 (TOC)
// ================================================
function renderToc(toc) {
    DOM.tocList.innerHTML = '';

    if (!toc || toc.length === 0) {
        DOM.tocList.innerHTML = '<li style="padding:20px;color:var(--bv-text-muted);text-align:center;">목차 없음</li>';
        return;
    }

    toc.forEach(item => {
        const li = document.createElement('li');
        li.className = 'book-toc-item';
        li.dataset.page = item.page;

        li.innerHTML = `
            <div class="book-toc-label-wrap">
                <span class="book-toc-label">${item.title}</span>
            </div>
            <span class="book-toc-page">${item.page}p</span>
        `;

        li.addEventListener('click', () => {
            goToPage(item.page);
            closeSidebar();
        });

        DOM.tocList.appendChild(li);
    });
}

function updateTocActive() {
    const items = DOM.tocList.querySelectorAll('.book-toc-item');
    const toc = BookViewer.bookData?.toc || [];

    items.forEach((item, idx) => {
        const startPage = toc[idx]?.page || 0;
        const endPage = toc[idx + 1]?.page ? toc[idx + 1].page - 1 : BookViewer.totalPages;
        const isCurrent = BookViewer.currentPage >= startPage && BookViewer.currentPage <= endPage;
        item.classList.toggle('active', isCurrent);
    });
}

// ================================================
// 12. 메모
// ================================================
async function loadAllMemos() {
    if (!BookViewer.userId || !BookViewer.bookId) return;

    const rows = await supabaseSelect(
        'tr_book_memos',
        'user_id=eq.' + BookViewer.userId 
        + '&book_id=eq.' + BookViewer.bookId
    );

    BookViewer.memos = {};
    if (rows) {
        rows.forEach(m => {
            BookViewer.memos[m.page_number] = m;
        });
    }

    console.log('📝 [BookViewer] 메모 로드:', Object.keys(BookViewer.memos).length + '개');
}

function updateMemoDot() {
    const hasMemo = !!BookViewer.memos[BookViewer.currentPage];
    DOM.memoDot.classList.toggle('hidden', !hasMemo);
}

function openMemoSidebar() {
    updateMemoContent();
    DOM.memoSidebar.classList.add('active');
    DOM.memoSidebarOverlay.classList.add('active');
    setTimeout(() => DOM.memoTextarea.focus(), 400);
}

function closeMemoSidebar() {
    DOM.memoSidebar.classList.remove('active');
    DOM.memoSidebarOverlay.classList.remove('active');
}

function isMemoSidebarOpen() {
    return DOM.memoSidebar.classList.contains('active');
}

/** 현재 페이지 메모 내용으로 사이드바 갱신 */
function updateMemoContent() {
    const page = BookViewer.currentPage;
    const memo = BookViewer.memos[page];

    DOM.memoPageLabel.textContent = page + '페이지 메모';
    DOM.memoTextarea.value = memo ? memo.content : '';
    DOM.memoCharCount.textContent = DOM.memoTextarea.value.length;
    DOM.btnMemoDelete.classList.toggle('hidden', !memo);
}

async function saveMemo() {
    const page = BookViewer.currentPage;
    const content = DOM.memoTextarea.value.trim();

    if (!content) {
        showToast('메모 내용을 입력해주세요.', true);
        return;
    }

    if (content.length > 1000) {
        showToast('메모는 1000자까지 입력 가능합니다.', true);
        return;
    }

    DOM.btnMemoSave.disabled = true;
    DOM.btnMemoSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...';

    const existing = BookViewer.memos[page];

    let result;
    if (existing) {
        // 수정
        result = await supabaseUpdate(
            'tr_book_memos',
            'id=eq.' + existing.id,
            { content: content, updated_at: new Date().toISOString() }
        );
    } else {
        // 신규
        result = await supabaseInsert('tr_book_memos', {
            user_id: BookViewer.userId,
            book_id: BookViewer.bookId,
            page_number: page,
            content: content,
            week: BookViewer.taskParams?.week ? parseInt(BookViewer.taskParams.week) : null,
            day: BookViewer.taskParams?.day || null
        });
    }

    DOM.btnMemoSave.disabled = false;
    DOM.btnMemoSave.innerHTML = '<i class="fa-regular fa-floppy-disk"></i> 저장하기';

    if (result) {
        BookViewer.memos[page] = result;
        updateMemoDot();
        updateTaskBar();
        closeMemoSidebar();
        showToast('메모가 저장되었습니다.');

        // 신규 메모일 때만 인증 판정 (수정은 개수 변화 없음)
        if (!existing) {
            await checkAndCertify();
        }
    } else {
        showToast('저장 실패. 다시 시도해주세요.', true);
    }
}

async function deleteMemo() {
    const page = BookViewer.currentPage;
    const existing = BookViewer.memos[page];
    if (!existing) return;

    if (!confirm('이 메모를 삭제하시겠습니까?')) return;

    DOM.btnMemoDelete.disabled = true;

    const endpoint = '/rest/v1/tr_book_memos?id=eq.' + existing.id;
    const result = await supabaseRequest(endpoint, { method: 'DELETE' });

    DOM.btnMemoDelete.disabled = false;

    if (result !== null) {
        delete BookViewer.memos[page];
        updateMemoDot();
        updateTaskBar();
        closeMemoSidebar();
        showToast('메모가 삭제되었습니다.');
    } else {
        showToast('삭제 실패. 다시 시도해주세요.', true);
    }
}

// ================================================
// 13. 사이드바
// ================================================
function openSidebar() {
    DOM.sidebar.classList.add('active');
    DOM.sidebarOverlay.classList.add('active');
    updateTocActive();
    renderBookmarkList();
}

function closeSidebar() {
    DOM.sidebar.classList.remove('active');
    DOM.sidebarOverlay.classList.remove('active');
}

function switchSidebarTab(tabName) {
    DOM.sidebarTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    DOM.tabToc.classList.toggle('hidden', tabName !== 'toc');
    DOM.tabBookmarks.classList.toggle('hidden', tabName !== 'bookmarks');
}

// ================================================
// 14. 페이지 점프 모달
// ================================================
function openPageJump() {
    DOM.pageJumpInput.value = '';
    DOM.pageJumpInput.max = BookViewer.totalPages;
    DOM.pageJumpOverlay.classList.remove('hidden');
    setTimeout(() => DOM.pageJumpInput.focus(), 200);
}

function closePageJump() {
    DOM.pageJumpOverlay.classList.add('hidden');
}

function confirmPageJump() {
    const val = parseInt(DOM.pageJumpInput.value, 10);
    if (isNaN(val) || val < 1 || val > BookViewer.totalPages) {
        showToast('1 ~ ' + BookViewer.totalPages + ' 사이 숫자를 입력해주세요.', true);
        return;
    }
    goToPage(val);
    closePageJump();
}

// ================================================
// 15. 완독 모달
// ================================================
function showCompleteModal() {
    // book_only 사용자 → 유도 팝업 표시
    if (BookViewer.isBookOnly) {
        showBookOnlyCompletePopup();
        return;
    }
    DOM.completeOverlay.classList.remove('hidden');
}

function closeCompleteModal() {
    DOM.completeOverlay.classList.add('hidden');
}

// ================================================
// 16. 전체화면
// ================================================
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        DOM.btnFullscreen.querySelector('i').className = 'fa-solid fa-compress';
    } else {
        document.exitFullscreen().catch(() => {});
        DOM.btnFullscreen.querySelector('i').className = 'fa-solid fa-expand';
    }
}

document.addEventListener('fullscreenchange', () => {
    const icon = DOM.btnFullscreen?.querySelector('i');
    if (icon) {
        icon.className = document.fullscreenElement
            ? 'fa-solid fa-compress'
            : 'fa-solid fa-expand';
    }
});

// ================================================
// 17. 토스트 메시지
// ================================================
function showToast(message, isError = false) {
    // 기존 토스트 제거
    const existing = document.querySelector('.book-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'book-toast' + (isError ? ' book-toast-error' : '');
    toast.innerHTML = `<i class="fa-solid ${isError ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i> ${message}`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 2500);
}

// ================================================
// 18. 다운로드 차단
// ================================================
function preventDownload() {
    // 우클릭 방지
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });

    // 키보드 단축키 방지 (Ctrl+S, Ctrl+P, Ctrl+Shift+I 등)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (
            e.key === 's' || e.key === 'S' ||
            e.key === 'p' || e.key === 'P' ||
            e.key === 'u' || e.key === 'U'
        )) {
            e.preventDefault();
            return false;
        }
    });

    // 드래그 방지
    document.addEventListener('dragstart', (e) => e.preventDefault());
}

// ================================================
// 19. 이벤트 바인딩
// ================================================
function bindEvents() {
    // 상단바
    DOM.btnBack.addEventListener('click', () => {
        saveProgress().then(() => {
            // URL 파라미터에서 week/day 가져와서 해시에 포함
            var tp = BookViewer.taskParams;
            if (tp && tp.week && tp.day) {
                window.location.href = 'index.html#taskList/' + tp.week + '/' + encodeURIComponent(tp.day);
            } else {
                window.location.href = 'index.html#taskList';
            }
        });
    });
    DOM.btnBookmark.addEventListener('click', () => toggleBookmark());
    DOM.btnSidebar.addEventListener('click', () => {
        DOM.sidebar.classList.contains('active') ? closeSidebar() : openSidebar();
    });

    // 사이드바
    DOM.sidebarOverlay.addEventListener('click', closeSidebar);
    DOM.sidebarTabs.forEach(tab => {
        tab.addEventListener('click', () => switchSidebarTab(tab.dataset.tab));
    });

    // 페이지 넘기기 버튼
    DOM.btnPrevPage.addEventListener('click', prevPage);
    DOM.btnNextPage.addEventListener('click', nextPage);

    // 하단 툴바
    DOM.btnZoomIn.addEventListener('click', zoomIn);
    DOM.btnZoomOut.addEventListener('click', zoomOut);
    DOM.btnPageJump.addEventListener('click', openPageJump);
    DOM.btnMemo.addEventListener('click', () => {
        isMemoSidebarOpen() ? closeMemoSidebar() : openMemoSidebar();
    });
    DOM.btnFullscreen.addEventListener('click', toggleFullscreen);

    // 메모 사이드바
    DOM.btnMemoClose.addEventListener('click', closeMemoSidebar);
    DOM.memoSidebarOverlay.addEventListener('click', closeMemoSidebar);
    DOM.btnMemoSave.addEventListener('click', saveMemo);
    DOM.btnMemoDelete.addEventListener('click', deleteMemo);
    DOM.memoTextarea.addEventListener('input', () => {
        DOM.memoCharCount.textContent = DOM.memoTextarea.value.length;
    });

    // 페이지 점프 모달
    DOM.btnPageJumpConfirm.addEventListener('click', confirmPageJump);
    DOM.btnPageJumpCancel.addEventListener('click', closePageJump);
    DOM.pageJumpOverlay.addEventListener('click', (e) => {
        if (e.target === DOM.pageJumpOverlay) closePageJump();
    });
    DOM.pageJumpInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmPageJump();
    });

    // 완독 모달
    DOM.btnCompleteClose.addEventListener('click', closeCompleteModal);

    // 키보드 단축키
    document.addEventListener('keydown', (e) => {
        // 모달이나 메모 사이드바가 열려있으면 무시
        if (!DOM.pageJumpOverlay.classList.contains('hidden')) return;
        if (isMemoSidebarOpen()) return;

        switch (e.key) {
            case 'ArrowLeft':
                prevPage();
                break;
            case 'ArrowRight':
                nextPage();
                break;
            case '+':
            case '=':
                zoomIn();
                break;
            case '-':
                zoomOut();
                break;
        }
    });

    // ── 모바일 스와이프 ──
    DOM.canvasWrapper.addEventListener('touchstart', handleTouchStart, { passive: true });
    DOM.canvasWrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
    DOM.canvasWrapper.addEventListener('touchend', handleTouchEnd, { passive: true });

    // 창 리사이즈 시 다시 렌더링
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (BookViewer.pdfDoc) renderPage(BookViewer.currentPage);
        }, 200);
    });

    // 페이지 떠날 때 진도 저장
    window.addEventListener('beforeunload', () => {
        saveProgress();
    });
}

// ================================================
// 20. 터치/스와이프 처리
// ================================================
function handleTouchStart(e) {
    if (e.touches.length === 2) {
        // 핀치 줌 시작
        BookViewer.initialPinchDistance = getPinchDistance(e.touches);
        BookViewer.initialPinchScale = BookViewer.scale;
        return;
    }

    BookViewer.touchStartX = e.touches[0].clientX;
    BookViewer.touchStartY = e.touches[0].clientY;
    BookViewer.touchMoved = false;
}

function handleTouchMove(e) {
    if (e.touches.length === 2) {
        // 핀치 줌
        e.preventDefault();
        const dist = getPinchDistance(e.touches);
        const ratio = dist / BookViewer.initialPinchDistance;
        setZoom(BookViewer.initialPinchScale * ratio);
        return;
    }

    BookViewer.touchMoved = true;
}

function handleTouchEnd(e) {
    if (!BookViewer.touchMoved) return;
    if (e.changedTouches.length === 0) return;

    // 확대 상태에서는 스크롤 이동이므로 페이지 넘기기 비활성화
    if (BookViewer.scale > 1.0) return;

    const dx = e.changedTouches[0].clientX - BookViewer.touchStartX;
    const dy = e.changedTouches[0].clientY - BookViewer.touchStartY;

    // 수직 스와이프보다 수평 스와이프가 더 크면 페이지 넘기기
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
        if (dx < 0) {
            nextPage(); // 왼쪽 스와이프 → 다음 페이지
        } else {
            prevPage(); // 오른쪽 스와이프 → 이전 페이지
        }
    }
}

function getPinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// ================================================
// 21. 과제 상태 바 (메모 카운트 + 자동 인증)
// ================================================

/**
 * URL 파라미터 파싱 — book.html?current=2&total=3&week=1&day=월
 * 파라미터가 없으면 일반 열람 모드 (상태 바 숨김)
 */
function parseTaskParams() {
    var params = new URLSearchParams(window.location.search);
    var current = parseInt(params.get('current'), 10);
    var total = parseInt(params.get('total'), 10);

    if (!current || !total) {
        BookViewer.taskParams = null;
        console.log('📖 [TaskBar] URL 파라미터 없음 — 일반 열람 모드');
        return;
    }

    BookViewer.taskParams = {
        current: current,
        total: total,
        week: params.get('week') || '1',
        day: params.get('day') || '월',
        deadline: params.get('deadline') || null
    };
    BookViewer.requiredMemos = current * 2;

    console.log('📖 [TaskBar] 과제 모드:', current + '/' + total + '일차, 필요 메모:', BookViewer.requiredMemos);
}

/**
 * 상태 바 초기화
 * - 파라미터 없으면 숨김
 * - DB에서 기존 인증 여부 확인
 * - 상태 바 텍스트 + 스타일 설정
 */
async function initTaskBar() {
    if (!BookViewer.taskParams) return;

    // body에 클래스 추가 (CSS 레이아웃 조정용)
    document.body.classList.add('has-task-bar');
    DOM.taskBar.classList.remove('hidden');

    // DB에서 인증 여부 확인
    try {
        if (BookViewer.userId && BookViewer.userId !== 'dev-user-001' && typeof getStudyResultV3 === 'function') {
            var tp = BookViewer.taskParams;
            var result = await getStudyResultV3(BookViewer.userId, 'intro-book', tp.current, tp.week, tp.day);
            if (result && result.locked_auth_rate === 100) {
                BookViewer.isCertified = true;
                console.log('📖 [TaskBar] 이미 인증 완료');
            }
        }
    } catch (e) {
        console.warn('📖 [TaskBar] 인증 조회 실패:', e);
    }

    updateTaskBar();
}

/**
 * 상태 바 텍스트 + 스타일 업데이트
 * - 인증완료: ✅ 오늘 과제 인증 완료
 * - 마감지남: ⚠️ 마감 지남 — 인증 불가
 * - 진행중:  📝 오늘 메모 X/Y
 */
function updateTaskBar() {
    if (!BookViewer.taskParams || !DOM.taskBar) return;

    var memoCount = getMemoCount();
    var required = BookViewer.requiredMemos;

    // 클래스 초기화
    DOM.taskBar.classList.remove('certified', 'deadline-passed');

    if (BookViewer.isCertified) {
        DOM.taskBarText.textContent = '✅ 오늘 과제 인증 완료';
        DOM.taskBar.classList.add('certified');
    } else if (BookViewer.taskParams.deadline === 'passed') {
        DOM.taskBarText.textContent = '⚠️ 마감 지남 — 메모 작성은 가능하지만 인증 불가';
        DOM.taskBar.classList.add('deadline-passed');
    } else {
        DOM.taskBarText.textContent = '📝 오늘 메모 ' + memoCount + '/' + required;
    }
}

/**
 * 현재 메모 총 개수 반환
 */
function getMemoCount() {
    return Object.keys(BookViewer.memos).length;
}

/**
 * 메모 저장 후 인증 판정
 * - 과제 파라미터 없으면 무시
 * - 이미 인증됐으면 무시
 * - 마감 지났으면 무시
 * - 메모 수 ≥ requiredMemos 이면 인증 처리
 */
async function checkAndCertify() {
    if (!BookViewer.taskParams) return;
    if (BookViewer.isCertified) return;
    if (BookViewer.taskParams.deadline === 'passed') return;

    var memoCount = getMemoCount();
    var required = BookViewer.requiredMemos;

    if (memoCount < required) return;

    console.log('🎉 [TaskBar] 인증 조건 충족! 메모:', memoCount, '/', required);

    var tp = BookViewer.taskParams;

    // 개발 모드 체크
    if (!BookViewer.userId || BookViewer.userId === 'dev-user-001') {
        console.log('📖 [TaskBar] 개발 모드 — DB 저장 생략');
        BookViewer.isCertified = true;
        updateTaskBar();
        showToast('🎉 오늘 과제가 인증되었습니다!');
        return;
    }

    // DB 저장
    try {
        if (typeof upsertInitialRecord === 'function') {
            await upsertInitialRecord(
                BookViewer.userId,
                'intro-book',
                tp.current,
                tp.week,
                tp.day,
                { memo_count: memoCount, completedAt: new Date().toISOString() },
                { locked_auth_rate: 100 }
            );
            console.log('✅ [TaskBar] study_results_v3 저장 완료');
        }

        BookViewer.isCertified = true;
        updateTaskBar();
        showToast('🎉 오늘 과제가 인증되었습니다!');
    } catch (e) {
        console.error('❌ [TaskBar] 인증 저장 실패:', e);
        showToast('인증 저장에 실패했습니다. 다시 시도해주세요.', true);
    }
}

// ================================================
// 22. book_only 사용자 전용 UI 설정
// ================================================

/**
 * book_only 사용자 UI 초기 설정
 * 3-a: "내 대시보드" 버튼 추가
 * 3-b: 로그아웃 아이콘 추가
 * 3-c: task-bar 숨김
 * 3-f: 뒤로가기 버튼 동작 변경
 */
function setupBookOnlyUI() {
    console.log('📖 [BookOnly] UI 초기화');

    // 3-c: task-bar 숨김 (hidden 유지, initTaskBar 호출도 안 함)
    const taskBar = document.getElementById('taskBar');
    if (taskBar) taskBar.classList.add('hidden');
    // 마감 배너, 인증률 등 과제 관련 요소 숨김
    document.querySelectorAll('.book-task-bar, .deadline-banner, .cert-rate').forEach(el => {
        el.style.display = 'none';
    });

    // 3-a: 뒤로가기 버튼 숨기고 그 자리(상단 좌측)에 "대시보드" 버튼 배치
    const btnBack = document.getElementById('btnBack');
    if (btnBack) {
        btnBack.style.display = 'none';

        const btnDashboard = document.createElement('button');
        btnDashboard.className = 'book-topbar-btn book-btn-dashboard';
        btnDashboard.title = '대시보드';
        btnDashboard.innerHTML = '<i class="fa-solid fa-th-large"></i> <span class="book-only-btn-label">대시보드</span>';
        btnDashboard.addEventListener('click', () => {
            saveProgress().then(() => {
                window.location.href = 'https://eonfl.com/my-dashboard.html';
            });
        });

        btnBack.parentNode.insertBefore(btnDashboard, btnBack);
    }

    // 3-b: 로그아웃 아이콘 추가
    const btnLogout = document.createElement('button');
    btnLogout.className = 'book-topbar-btn book-btn-logout';
    btnLogout.title = '로그아웃';
    btnLogout.innerHTML = '<i class="fa-solid fa-sign-out-alt"></i>';
    btnLogout.addEventListener('click', () => {
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('courseMode');
        window.location.href = 'https://eonfl.com';
    });

    // topbar-actions 영역에 추가
    const topbarActions = document.querySelector('.book-topbar-actions');
    if (topbarActions) {
        topbarActions.insertBefore(btnLogout, topbarActions.firstChild);
    }

    // book_only 전용 스타일 주입
    injectBookOnlyStyles();
}

/**
 * book_only 전용 CSS 주입
 */
function injectBookOnlyStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* 대시보드 버튼 (상단 좌측) */
        .book-btn-dashboard {
            width: auto;
            height: auto;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            font-size: 13px;
            color: var(--bv-text, #333);
            padding: 6px 10px;
            border-radius: 8px;
            white-space: nowrap;
            transition: background 0.2s;
        }
        .book-btn-dashboard:hover {
            background: rgba(0,0,0,0.06);
        }
        .book-btn-dashboard i {
            font-size: 15px;
        }
        .book-only-btn-label {
            font-weight: 600;
        }

        /* 로그아웃 버튼 */
        .book-btn-logout {
            width: 36px;
            height: 36px;
            color: var(--bv-text-muted, #999);
            font-size: 14px;
            padding: 0;
            border-radius: 8px;
            transition: background 0.2s, color 0.2s;
        }
        .book-btn-logout:hover {
            background: rgba(0,0,0,0.06);
            color: #e74c3c;
        }

        /* book_only 완독 유도 팝업 */
        .book-only-popup-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            padding: 20px;
        }
        .book-only-popup {
            background: #fff;
            border-radius: 16px;
            padding: 32px 28px;
            max-width: 400px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        }
        .book-only-popup-icon {
            font-size: 48px;
            color: #9480c5;
            margin-bottom: 16px;
        }
        .book-only-popup-title {
            font-size: 18px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 20px;
            line-height: 1.5;
        }
        .book-only-popup-desc {
            font-size: 15px;
            color: #475569;
            line-height: 1.7;
            margin-bottom: 28px;
            word-break: keep-all;
        }
        .book-only-popup-actions {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .book-only-popup-btn {
            padding: 14px 20px;
            border: none;
            border-radius: 10px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.15s, box-shadow 0.15s;
        }
        .book-only-popup-btn:active {
            transform: scale(0.97);
        }
        .book-only-popup-btn-primary {
            background: #9480c5;
            color: #fff;
            box-shadow: 0 4px 12px rgba(148,128,197,0.35);
        }
        .book-only-popup-btn-primary:hover {
            box-shadow: 0 6px 20px rgba(148,128,197,0.45);
        }
        .book-only-popup-btn-secondary {
            background: #f1f5f9;
            color: #64748b;
        }
        .book-only-popup-btn-secondary:hover {
            background: #e2e8f0;
        }

        @media (max-width: 420px) {
            .book-only-btn-label { display: none; }
            .book-btn-dashboard { padding: 6px 8px; }
        }
    `;
    document.head.appendChild(style);
}

/**
 * 3-e: 완독 시 유도 팝업 (book_only 전용)
 * 마지막 페이지 도달 → is_completed true + 팝업 표시
 */
function showBookOnlyCompletePopup() {
    // 이미 팝업이 있으면 무시
    if (document.querySelector('.book-only-popup-overlay')) return;

    const overlay = document.createElement('div');
    overlay.className = 'book-only-popup-overlay';
    overlay.innerHTML = `
        <div class="book-only-popup">
            <div class="book-only-popup-icon">
                <i class="fa-solid fa-book-open-reader"></i>
            </div>
            <div class="book-only-popup-title">입문서 읽기 완료!</div>
            <div class="book-only-popup-desc">
                입문서는 레시피, 내벨업챌린지는 요리 실습입니다.<br>
                레시피를 백날 째려봐도 요리 실력은 늘지 않습니다.<br>
                이제 직접 문제를 풀어볼 차례입니다.
            </div>
            <div class="book-only-popup-actions">
                <button class="book-only-popup-btn book-only-popup-btn-primary" id="btnBookOnlyCTA">
                    내벨업챌린지 알아보기
                </button>
                <button class="book-only-popup-btn book-only-popup-btn-secondary" id="btnBookOnlyContinue">
                    계속 읽기
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // CTA 버튼 → 프로그램 소개 페이지
    document.getElementById('btnBookOnlyCTA').addEventListener('click', () => {
        window.location.href = 'https://eonfl.com/programs.html#basic';
    });

    // 계속 읽기 → 팝업 닫기
    document.getElementById('btnBookOnlyContinue').addEventListener('click', () => {
        overlay.remove();
    });

    // 오버레이 클릭으로 닫기
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

// ================================================
// 23. 시작 — auth.js의 authReady 이벤트를 받은 후 초기화
// ================================================
window.addEventListener('authReady', init);
