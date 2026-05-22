/**
 * commentary-viewer.js — 해설 PDF 뷰어 (경량판)
 *
 * book-viewer.js에서 PDF 렌더링/줌/스와이프/페이지 이동만 추출.
 * 메모, 북마크, 진도 저장, 인증 기능 없음.
 *
 * URL: commentary.html?category=리딩&week=1&day=월
 */

var AUS_COMMENTARY_MAP = {
    '리딩':       { path: 'books/aus_reading.pdf',     title: '리딩 해설' },
    '리스닝':     { path: 'books/aus_listening.pdf',    title: '리스닝 해설' },
    '브레인스토밍': { path: 'books/aus_brainstorm.pdf',   title: '브레인스토밍 해설' },
    '독스':       { path: 'books/aus_indspk.pdf',      title: '독스 해설' },
    '통스':       { path: 'books/aus_intspk.pdf',      title: '통스 해설' },
    '통라':       { path: 'books/aus_intwrt.pdf',      title: '통라 해설' },
    '토라':       { path: 'books/aus_discussion.pdf',   title: '토라 해설' }
};

var CV = {
    pdfDoc: null,
    currentPage: 1,
    totalPages: 0,
    rendering: false,
    pendingPage: null,

    scale: 1.0,
    minScale: 0.5,
    maxScale: 3.0,
    scaleStep: 0.25,
    fitScale: 1.0,

    pdfUrl: null,
    category: null,
    week: null,
    day: null,
    bookData: null,

    touchStartX: 0,
    touchStartY: 0,
    touchMoved: false,
    initialPinchDistance: 0,
    initialPinchScale: 1
};

var DOM = {};

function cacheDom() {
    DOM.btnBack = document.getElementById('btnBack');
    DOM.bookTitle = document.getElementById('bookTitle');
    DOM.progressFill = document.getElementById('progressFill');
    DOM.bookViewer = document.getElementById('bookViewer');
    DOM.bookLoading = document.getElementById('bookLoading');
    DOM.canvasWrapper = document.getElementById('canvasWrapper');
    DOM.pdfCanvas = document.getElementById('pdfCanvas');
    DOM.btnPrevPage = document.getElementById('btnPrevPage');
    DOM.btnNextPage = document.getElementById('btnNextPage');
    DOM.currentPage = document.getElementById('currentPage');
    DOM.totalPages = document.getElementById('totalPages');
    DOM.btnPageJump = document.getElementById('btnPageJump');
    DOM.btnZoomIn = document.getElementById('btnZoomIn');
    DOM.btnZoomOut = document.getElementById('btnZoomOut');
    DOM.zoomLevel = document.getElementById('zoomLevel');
    DOM.btnFullscreen = document.getElementById('btnFullscreen');
    DOM.pageJumpOverlay = document.getElementById('pageJumpOverlay');
    DOM.pageJumpInput = document.getElementById('pageJumpInput');
    DOM.pageJumpMax = document.getElementById('pageJumpMax');
    DOM.btnPageJumpConfirm = document.getElementById('btnPageJumpConfirm');
    DOM.btnPageJumpCancel = document.getElementById('btnPageJumpCancel');
    DOM.btnSidebar = document.getElementById('btnSidebar');
    DOM.sidebar = document.getElementById('sidebar');
    DOM.sidebarOverlay = document.getElementById('sidebarOverlay');
    DOM.tocList = document.getElementById('tocList');
}

function parseParams() {
    var params = new URLSearchParams(window.location.search);
    CV.category = params.get('category');
    CV.week = params.get('week') || '1';
    CV.day = params.get('day') || '월';

    var entry = CV.category ? AUS_COMMENTARY_MAP[CV.category] : null;
    if (!entry) {
        console.error('❌ [Commentary] 알 수 없는 카테고리:', CV.category);
        return false;
    }

    CV.storagePath = entry.path;
    DOM.bookTitle.textContent = entry.title;
    CV.pdfUrl = SUPABASE_CONFIG.url + '/storage/v1/object/authenticated/' + entry.path;
    return true;
}

async function loadBookData() {
    if (!CV.storagePath) return;

    try {
        var rows = await supabaseSelect(
            'tr_book_documents',
            'storage_path=eq.' + CV.storagePath + '&is_active=eq.true&limit=1'
        );
        if (rows && rows.length > 0) {
            CV.bookData = rows[0];
            renderToc(rows[0].toc || []);
        }
    } catch (e) {
        console.warn('[Commentary] 목차 로드 실패:', e);
    }
}

function renderToc(toc) {
    DOM.tocList.innerHTML = '';
    if (!toc || toc.length === 0) {
        DOM.tocList.innerHTML = '<li style="padding:20px;color:var(--bv-text-muted);text-align:center;">목차 없음</li>';
        return;
    }
    toc.forEach(function(item) {
        var li = document.createElement('li');
        li.className = 'book-toc-item';
        li.dataset.page = item.page;
        li.innerHTML = '<div class="book-toc-label-wrap"><span class="book-toc-label">' + item.title + '</span></div><span class="book-toc-page">' + item.page + 'p</span>';
        li.addEventListener('click', function() {
            goToPage(item.page);
            closeSidebar();
        });
        DOM.tocList.appendChild(li);
    });
}

function updateTocActive() {
    var items = DOM.tocList.querySelectorAll('.book-toc-item');
    var toc = (CV.bookData && CV.bookData.toc) ? CV.bookData.toc : [];
    items.forEach(function(item, idx) {
        var startPage = toc[idx] ? toc[idx].page : 0;
        var endPage = (toc[idx + 1] && toc[idx + 1].page) ? toc[idx + 1].page - 1 : CV.totalPages;
        var isCurrent = CV.currentPage >= startPage && CV.currentPage <= endPage;
        item.classList.toggle('active', isCurrent);
    });
}

function openSidebar() {
    DOM.sidebar.classList.add('active');
    DOM.sidebarOverlay.classList.add('active');
    updateTocActive();
}

function closeSidebar() {
    DOM.sidebar.classList.remove('active');
    DOM.sidebarOverlay.classList.remove('active');
}

async function loadPdf() {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    try {
        var loadingTask = pdfjsLib.getDocument({
            url: CV.pdfUrl,
            httpHeaders: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': 'Bearer ' + SUPABASE_CONFIG.anonKey
            }
        });

        CV.pdfDoc = await loadingTask.promise;
        CV.totalPages = CV.pdfDoc.numPages;
        DOM.totalPages.textContent = CV.totalPages;
        DOM.pageJumpMax.textContent = CV.totalPages;
    } catch (err) {
        console.error('❌ [Commentary] PDF 로드 실패:', err);
        DOM.bookLoading.querySelector('p').textContent = 'PDF를 불러올 수 없습니다. 새로고침 해주세요.';
        throw err;
    }
}

async function renderPage(pageNum) {
    if (CV.rendering) {
        CV.pendingPage = pageNum;
        return;
    }
    CV.rendering = true;

    try {
        var page = await CV.pdfDoc.getPage(pageNum);
        var canvas = DOM.pdfCanvas;
        var ctx = canvas.getContext('2d');

        var viewport0 = page.getViewport({ scale: 1 });
        var viewer = DOM.bookViewer;
        var viewerW = viewer.clientWidth - 60;
        var viewerH = viewer.clientHeight - 60;

        var fitScaleW = viewerW / viewport0.width;
        var fitScaleH = viewerH / viewport0.height;
        CV.fitScale = Math.min(fitScaleW, fitScaleH);

        var effectiveScale = CV.fitScale * CV.scale;
        var viewport = page.getViewport({ scale: effectiveScale });

        var dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = viewport.width + 'px';
        canvas.style.height = viewport.height + 'px';

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    } catch (err) {
        console.error('❌ [Commentary] 렌더링 실패:', err);
    }

    CV.rendering = false;

    if (CV.pendingPage !== null) {
        var next = CV.pendingPage;
        CV.pendingPage = null;
        renderPage(next);
    }
}

function goToPage(pageNum) {
    pageNum = Math.max(1, Math.min(pageNum, CV.totalPages));
    CV.currentPage = pageNum;
    DOM.currentPage.textContent = pageNum;
    updateProgressBar();
    updatePageButtons();
    DOM.bookViewer.scrollTop = 0;
    DOM.bookViewer.scrollLeft = 0;
    renderPage(pageNum);
}

function nextPage() {
    if (CV.currentPage < CV.totalPages) goToPage(CV.currentPage + 1);
}

function prevPage() {
    if (CV.currentPage > 1) goToPage(CV.currentPage - 1);
}

function updatePageButtons() {
    DOM.btnPrevPage.style.opacity = CV.currentPage <= 1 ? '0.3' : '1';
    DOM.btnPrevPage.style.pointerEvents = CV.currentPage <= 1 ? 'none' : 'auto';
    DOM.btnNextPage.style.opacity = CV.currentPage >= CV.totalPages ? '0.3' : '1';
    DOM.btnNextPage.style.pointerEvents = CV.currentPage >= CV.totalPages ? 'none' : 'auto';
}

function zoomIn() {
    if (CV.scale < CV.maxScale) {
        CV.scale = Math.min(CV.maxScale, +(CV.scale + CV.scaleStep).toFixed(2));
        updateZoomUI();
        renderPage(CV.currentPage);
    }
}

function zoomOut() {
    if (CV.scale > CV.minScale) {
        CV.scale = Math.max(CV.minScale, +(CV.scale - CV.scaleStep).toFixed(2));
        updateZoomUI();
        renderPage(CV.currentPage);
    }
}

function setZoom(newScale) {
    CV.scale = Math.max(CV.minScale, Math.min(CV.maxScale, +newScale.toFixed(2)));
    updateZoomUI();
    renderPage(CV.currentPage);
}

function updateZoomUI() {
    DOM.zoomLevel.textContent = Math.round(CV.scale * 100) + '%';
}

function updateProgressBar() {
    var pct = CV.totalPages > 0 ? Math.round((CV.currentPage / CV.totalPages) * 100) : 0;
    DOM.progressFill.style.width = pct + '%';
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(function() {});
        DOM.btnFullscreen.querySelector('i').className = 'fa-solid fa-compress';
    } else {
        document.exitFullscreen().catch(function() {});
        DOM.btnFullscreen.querySelector('i').className = 'fa-solid fa-expand';
    }
}

document.addEventListener('fullscreenchange', function() {
    var icon = DOM.btnFullscreen ? DOM.btnFullscreen.querySelector('i') : null;
    if (icon) {
        icon.className = document.fullscreenElement ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
    }
});

function openPageJump() {
    DOM.pageJumpInput.value = '';
    DOM.pageJumpInput.max = CV.totalPages;
    DOM.pageJumpOverlay.classList.remove('hidden');
    setTimeout(function() { DOM.pageJumpInput.focus(); }, 200);
}

function closePageJump() {
    DOM.pageJumpOverlay.classList.add('hidden');
}

function confirmPageJump() {
    var val = parseInt(DOM.pageJumpInput.value, 10);
    if (isNaN(val) || val < 1 || val > CV.totalPages) {
        showToast('1 ~ ' + CV.totalPages + ' 사이 숫자를 입력해주세요.', true);
        return;
    }
    goToPage(val);
    closePageJump();
}

function showToast(message, isError) {
    var existing = document.querySelector('.book-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'book-toast' + (isError ? ' book-toast-error' : '');
    toast.innerHTML = '<i class="fa-solid ' + (isError ? 'fa-circle-exclamation' : 'fa-circle-check') + '"></i> ' + message;
    document.body.appendChild(toast);

    requestAnimationFrame(function() { toast.classList.add('show'); });

    setTimeout(function() {
        toast.classList.remove('show');
        setTimeout(function() { toast.remove(); }, 400);
    }, 2500);
}

function preventDownload() {
    document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && ('sSPpUu'.indexOf(e.key) !== -1)) {
            e.preventDefault();
        }
    });
    document.addEventListener('dragstart', function(e) { e.preventDefault(); });
}

// 터치/스와이프
function handleTouchStart(e) {
    if (e.touches.length === 2) {
        CV.initialPinchDistance = getPinchDistance(e.touches);
        CV.initialPinchScale = CV.scale;
        return;
    }
    CV.touchStartX = e.touches[0].clientX;
    CV.touchStartY = e.touches[0].clientY;
    CV.touchMoved = false;
}

function handleTouchMove(e) {
    if (e.touches.length === 2) {
        e.preventDefault();
        var dist = getPinchDistance(e.touches);
        var ratio = dist / CV.initialPinchDistance;
        setZoom(CV.initialPinchScale * ratio);
        return;
    }
    CV.touchMoved = true;
}

function handleTouchEnd(e) {
    if (!CV.touchMoved) return;
    if (e.changedTouches.length === 0) return;
    if (CV.scale > 1.0) return;

    var dx = e.changedTouches[0].clientX - CV.touchStartX;
    var dy = e.changedTouches[0].clientY - CV.touchStartY;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
        if (dx < 0) nextPage();
        else prevPage();
    }
}

function getPinchDistance(touches) {
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function bindEvents() {
    DOM.btnBack.addEventListener('click', function() {
        if (CV.week && CV.day) {
            window.location.href = 'index.html#taskList/' + CV.week + '/' + encodeURIComponent(CV.day);
        } else {
            window.location.href = 'index.html#taskList';
        }
    });

    DOM.btnSidebar.addEventListener('click', function() {
        DOM.sidebar.classList.contains('active') ? closeSidebar() : openSidebar();
    });
    DOM.sidebarOverlay.addEventListener('click', closeSidebar);

    DOM.btnPrevPage.addEventListener('click', prevPage);
    DOM.btnNextPage.addEventListener('click', nextPage);

    DOM.btnZoomIn.addEventListener('click', zoomIn);
    DOM.btnZoomOut.addEventListener('click', zoomOut);
    DOM.btnPageJump.addEventListener('click', openPageJump);
    DOM.btnFullscreen.addEventListener('click', toggleFullscreen);

    DOM.btnPageJumpConfirm.addEventListener('click', confirmPageJump);
    DOM.btnPageJumpCancel.addEventListener('click', closePageJump);
    DOM.pageJumpOverlay.addEventListener('click', function(e) {
        if (e.target === DOM.pageJumpOverlay) closePageJump();
    });
    DOM.pageJumpInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') confirmPageJump();
    });

    document.addEventListener('keydown', function(e) {
        if (!DOM.pageJumpOverlay.classList.contains('hidden')) return;
        switch (e.key) {
            case 'ArrowLeft': prevPage(); break;
            case 'ArrowRight': nextPage(); break;
            case '+': case '=': zoomIn(); break;
            case '-': zoomOut(); break;
        }
    });

    DOM.canvasWrapper.addEventListener('touchstart', handleTouchStart, { passive: true });
    DOM.canvasWrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
    DOM.canvasWrapper.addEventListener('touchend', handleTouchEnd, { passive: true });

    var resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            if (CV.pdfDoc) renderPage(CV.currentPage);
        }, 200);
    });
}

async function init() {
    cacheDom();
    bindEvents();
    preventDownload();

    if (!parseParams()) {
        DOM.bookLoading.querySelector('p').textContent = '해설을 찾을 수 없습니다.';
        return;
    }

    await loadBookData();
    await loadPdf();

    DOM.bookLoading.classList.add('hidden');
    goToPage(1);
}

window.addEventListener('authReady', init);
