/**
 * ================================================
 * toefl-score.js -- 실제 TOEFL iBT 성적 관리
 * ================================================
 * 
 * 의존: supabase-client.js, mypage.js (mpUser 전역변수)
 * DB: toefl_actual_scores
 * Storage: toefl-score-images 버킷
 * 
 * 2026년 개편 TOEFL iBT 기준:
 *   영역별 1.0~6.0 (0.5 단위), Overall = 4개 영역 평균의 0.5 단위 반올림
 *   전환기(2026~2028): 기존 0-120 점수도 성적표에 병기 (legacy_total)
 */

// ================================================
// 전역 상태
// ================================================
let toeflScores = [];
let toeflChartInstance = null;

// ================================================
// 데이터 로드
// ================================================
async function loadToeflScores() {
    if (!mpUser || !mpUser.id) return;
    try {
        toeflScores = await supabaseSelect(
            'toefl_actual_scores',
            'user_id=eq.' + mpUser.id + '&order=test_date.asc'
        ) || [];
        console.log('🎯 [TOEFL] 성적 ' + toeflScores.length + '건 로드');
    } catch (err) {
        console.error('❌ [TOEFL] 로드 실패:', err);
        toeflScores = [];
    }
}

// ================================================
// 전체 섹션 렌더링
// ================================================
function renderToeflSection() {
    renderToeflStatus();
    renderToeflScoreList();
    renderToeflChart();
}

// ================================================
// 필수 응시 현황
// ================================================
function renderToeflStatus() {
    var el = document.getElementById('toeflStatusBadge');
    if (!el) return;
    var count = toeflScores.length;

    if (count === 0) {
        el.innerHTML =
            '<div class="toefl-status toefl-status-warning">' +
                '<i class="fa-solid fa-triangle-exclamation"></i>' +
                '<span>아직 등록된 토플 성적이 없습니다 <strong>(필수 2회)</strong></span>' +
            '</div>';
    } else if (count === 1) {
        el.innerHTML =
            '<div class="toefl-status toefl-status-caution">' +
                '<i class="fa-solid fa-clock"></i>' +
                '<span>필수 2회 중 <strong>1회 완료</strong> -- 1회 더 등록해주세요!</span>' +
            '</div>';
    } else {
        el.innerHTML =
            '<div class="toefl-status toefl-status-complete">' +
                '<i class="fa-solid fa-circle-check"></i>' +
                '<span>필수 응시 완료! <strong>' + count + '회 등록됨</strong></span>' +
            '</div>';
    }
}

// ================================================
// 성적 목록 (컴팩트 테이블형)
// ================================================
function renderToeflScoreList() {
    var el = document.getElementById('toeflScoreList');
    if (!el) return;

    if (toeflScores.length === 0) {
        el.innerHTML =
            '<div class="toefl-empty">' +
                '<i class="fa-solid fa-file-circle-plus"></i>' +
                '<p>등록된 성적이 없습니다</p>' +
                '<p class="toefl-empty-sub">위의 [성적 등록] 버튼으로 토플 성적을 등록해보세요.</p>' +
            '</div>';
        return;
    }

    // 시간순 오름차순: 1회차(가장 오래된)가 위, 최신이 아래
    var sorted = toeflScores.slice().sort(function(a, b) {
        return new Date(a.test_date) - new Date(b.test_date);
    });

    // 테이블 헤더
    var html =
        '<div class="toefl-table">' +
            '<div class="toefl-table-header">' +
                '<span class="toefl-th toefl-th-order">#</span>' +
                '<span class="toefl-th toefl-th-date">날짜</span>' +
                '<span class="toefl-th toefl-th-score">R</span>' +
                '<span class="toefl-th toefl-th-score">L</span>' +
                '<span class="toefl-th toefl-th-score">W</span>' +
                '<span class="toefl-th toefl-th-score">S</span>' +
                '<span class="toefl-th toefl-th-overall">Overall</span>' +
                '<span class="toefl-th toefl-th-actions"></span>' +
            '</div>';

    sorted.forEach(function(s, idx) {
        var d = new Date(s.test_date + 'T00:00:00');
        var dateStr = (d.getMonth() + 1) + '/' + d.getDate();
        var orderNum = idx + 1;
        var legacyStr = s.legacy_total
            ? '<span class="toefl-legacy-inline">(' + s.legacy_total + ')</span>'
            : '';
        var memoAttr = s.memo ? ' data-memo="' + escapeHtmlToefl(s.memo).replace(/"/g, '&quot;') + '"' : '';

        // 이전 회차와 비교하여 변화 표시
        var prev = idx > 0 ? sorted[idx - 1] : null;

        html +=
            '<div class="toefl-table-row' + (idx % 2 === 1 ? ' toefl-row-alt' : '') + '"' + memoAttr + '>' +
                '<span class="toefl-td toefl-td-order"><span class="toefl-order-badge">' + orderNum + '회</span></span>' +
                '<span class="toefl-td toefl-td-date">' + dateStr + '</span>' +
                '<span class="toefl-td toefl-td-score">' + Number(s.reading).toFixed(1) + buildDelta(prev ? s.reading - prev.reading : null) + '</span>' +
                '<span class="toefl-td toefl-td-score">' + Number(s.listening).toFixed(1) + buildDelta(prev ? s.listening - prev.listening : null) + '</span>' +
                '<span class="toefl-td toefl-td-score">' + Number(s.writing).toFixed(1) + buildDelta(prev ? s.writing - prev.writing : null) + '</span>' +
                '<span class="toefl-td toefl-td-score">' + Number(s.speaking).toFixed(1) + buildDelta(prev ? s.speaking - prev.speaking : null) + '</span>' +
                '<span class="toefl-td toefl-td-overall"><strong>' + Number(s.overall).toFixed(1) + '</strong>' + legacyStr + buildDelta(prev ? s.overall - prev.overall : null) + '</span>' +
                '<span class="toefl-td toefl-td-actions">' +
                    (s.memo ? '<button class="toefl-btn-icon toefl-btn-memo" onclick="toggleToeflMemo(this)" title="메모"><i class="fa-solid fa-message"></i></button>' : '') +
                    (s.score_image ? '<button class="toefl-btn-icon" onclick="openToeflImageViewer(\'' + s.score_image + '\')" title="성적표 보기"><i class="fa-solid fa-image"></i></button>' : '') +
                    '<button class="toefl-btn-icon toefl-btn-icon-danger" onclick="deleteToeflScore(\'' + s.id + '\')" title="삭제"><i class="fa-solid fa-trash-can"></i></button>' +
                '</span>' +
            '</div>' +
            (s.memo ? '<div class="toefl-memo-row" style="display:none;"><i class="fa-solid fa-message"></i> ' + escapeHtmlToefl(s.memo) + '</div>' : '');
    });

    html += '</div>';
    el.innerHTML = html;
}

/**
 * 이전 회차 대비 변화량 표시
 */
function buildDelta(diff) {
    if (diff === null || diff === undefined) return '';
    var rounded = Math.round(diff * 10) / 10;
    if (rounded === 0) return '';
    if (rounded > 0) return '<span class="toefl-delta toefl-delta-up">+' + rounded.toFixed(1) + '</span>';
    return '<span class="toefl-delta toefl-delta-down">' + rounded.toFixed(1) + '</span>';
}

/**
 * 메모 행 토글
 */
function toggleToeflMemo(btn) {
    var row = btn.closest('.toefl-table-row');
    if (!row) return;
    var memoRow = row.nextElementSibling;
    if (memoRow && memoRow.classList.contains('toefl-memo-row')) {
        var isVisible = memoRow.style.display !== 'none';
        memoRow.style.display = isVisible ? 'none' : 'flex';
        btn.classList.toggle('toefl-btn-memo-active', !isVisible);
    }
}

// ================================================
// 성적 추이 차트 (Chart.js + annotation)
// ================================================
function renderToeflChart() {
    var canvas = document.getElementById('toeflChart');
    var emptyEl = document.getElementById('toeflChartEmpty');
    if (!canvas) return;

    if (toeflScores.length === 0) {
        canvas.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'flex';
        if (toeflChartInstance) { toeflChartInstance.destroy(); toeflChartInstance = null; }
        return;
    }

    canvas.style.display = '';
    if (emptyEl) emptyEl.style.display = 'none';

    // 시험일 오름차순 정렬
    var sorted = toeflScores.slice().sort(function(a, b) {
        return new Date(a.test_date) - new Date(b.test_date);
    });

    var labels = [];
    var readingData = [], listeningData = [], speakingData = [], writingData = [], overallData = [];

    sorted.forEach(function(s) {
        var d = new Date(s.test_date + 'T00:00:00');
        labels.push((d.getMonth() + 1) + '/' + d.getDate());
        readingData.push(Number(s.reading));
        listeningData.push(Number(s.listening));
        speakingData.push(Number(s.speaking));
        writingData.push(Number(s.writing));
        overallData.push(Number(s.overall));
    });

    // 챌린지 시작일 annotation -- labels에 삽입 + null 데이터포인트
    var annotations = {};
    if (mpUser && mpUser.startDate) {
        var sd = new Date(mpUser.startDate + 'T00:00:00');
        var startLabel = (sd.getMonth() + 1) + '/' + sd.getDate();

        // labels에 이미 존재하는지 확인
        var existingIdx = labels.indexOf(startLabel);

        if (existingIdx === -1) {
            // 시작일이 labels에 없으면 올바른 위치에 삽입
            var startTime = sd.getTime();
            var insertIdx = 0;
            for (var i = 0; i < sorted.length; i++) {
                var dd = new Date(sorted[i].test_date + 'T00:00:00');
                if (dd.getTime() < startTime) {
                    insertIdx = i + 1;
                } else {
                    break;
                }
            }

            // labels 배열에 시작일 라벨 삽입
            labels.splice(insertIdx, 0, startLabel);

            // 모든 dataset의 data 배열에 해당 인덱스에 null 삽입
            readingData.splice(insertIdx, 0, null);
            listeningData.splice(insertIdx, 0, null);
            speakingData.splice(insertIdx, 0, null);
            writingData.splice(insertIdx, 0, null);
            overallData.splice(insertIdx, 0, null);
        }

        // annotation은 label 매칭으로 동작 (이제 labels에 반드시 존재)
        annotations.challengeStart = {
            type: 'line',
            xMin: startLabel,
            xMax: startLabel,
            borderColor: 'rgba(148, 128, 197, 0.5)',
            borderWidth: 2,
            borderDash: [6, 4],
            label: {
                display: true,
                content: '챌린지 시작',
                position: 'start',
                backgroundColor: 'rgba(148, 128, 197, 0.85)',
                color: '#fff',
                font: { size: 11, weight: '600', family: 'Pretendard' },
                padding: { x: 8, y: 4 },
                borderRadius: 6
            }
        };
    }

    if (toeflChartInstance) { toeflChartInstance.destroy(); }

    toeflChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Overall',
                    data: overallData,
                    borderColor: '#1e1b2e',
                    backgroundColor: 'rgba(30, 27, 46, 0.04)',
                    borderWidth: 3,
                    pointRadius: 6,
                    pointBackgroundColor: '#1e1b2e',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 8,
                    tension: 0.3,
                    fill: false,
                    order: 0,
                    spanGaps: true
                },
                {
                    label: 'Reading',
                    data: readingData,
                    borderColor: '#9480c5',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#9480c5',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    tension: 0.3,
                    fill: false,
                    order: 1,
                    spanGaps: true
                },
                {
                    label: 'Listening',
                    data: listeningData,
                    borderColor: '#77bf7e',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#77bf7e',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    tension: 0.3,
                    fill: false,
                    order: 2,
                    spanGaps: true
                },
                {
                    label: 'Writing',
                    data: writingData,
                    borderColor: '#e8875a',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#e8875a',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    tension: 0.3,
                    fill: false,
                    order: 3,
                    spanGaps: true
                },
                {
                    label: 'Speaking',
                    data: speakingData,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    tension: 0.3,
                    fill: false,
                    order: 4,
                    spanGaps: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 20,
                        font: { size: 12, weight: '600', family: 'Pretendard' },
                        generateLabels: function(chart) {
                            var datasets = chart.data.datasets;
                            return datasets.map(function(ds, i) {
                                var meta = chart.getDatasetMeta(i);
                                return {
                                    text: ds.label,
                                    fillStyle: meta.hidden ? 'rgba(180,180,180,0.3)' : ds.borderColor,
                                    strokeStyle: meta.hidden ? 'rgba(180,180,180,0.3)' : ds.borderColor,
                                    lineWidth: 2,
                                    pointStyle: 'circle',
                                    hidden: false,
                                    datasetIndex: i,
                                    fontColor: meta.hidden ? '#bbb' : undefined
                                };
                            });
                        }
                    },
                    onHover: function(e, legendItem, legend) {
                        legend.chart.canvas.style.cursor = 'pointer';
                    },
                    onLeave: function(e, legendItem, legend) {
                        legend.chart.canvas.style.cursor = 'default';
                    }
                },
                tooltip: {
                    backgroundColor: '#1e1b2e',
                    titleFont: { size: 13, weight: '600', family: 'Pretendard' },
                    bodyFont: { size: 13, family: 'Pretendard' },
                    padding: 12,
                    cornerRadius: 10,
                    displayColors: true,
                    callbacks: {
                        label: function(ctx) {
                            if (ctx.raw === null) return null;
                            return ' ' + ctx.dataset.label + ': ' + ctx.raw.toFixed(1);
                        }
                    }
                },
                annotation: { annotations: annotations }
            },
            scales: {
                y: {
                    min: 1.0,
                    max: 6.0,
                    ticks: {
                        stepSize: 0.5,
                        callback: function(v) { return v.toFixed(1); },
                        font: { size: 12, weight: '500', family: 'Pretendard' },
                        color: '#99aabb'
                    },
                    grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
                    border: { display: false }
                },
                x: {
                    ticks: {
                        font: { size: 12, weight: '600', family: 'Pretendard' },
                        color: '#5c6878'
                    },
                    grid: { display: false },
                    border: { display: false }
                }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });

    console.log('📊 [TOEFL] 차트 렌더링 완료 - ' + sorted.length + '건');
}

// ================================================
// 모달: 열기/닫기
// ================================================
function openToeflScoreModal() {
    var overlay = document.getElementById('toeflScoreModalOverlay');
    if (overlay) overlay.classList.add('show');
    var form = document.getElementById('toeflScoreForm');
    if (form) form.reset();
    var overall = document.getElementById('toeflOverallDisplay');
    if (overall) overall.textContent = '-';
    var preview = document.getElementById('toeflImagePreview');
    if (preview) { preview.style.display = 'none'; preview.src = ''; }

    // 날짜 입력 제한: min=2024-01-01, max=오늘
    var dateInput = document.getElementById('toeflTestDate');
    if (dateInput) {
        dateInput.setAttribute('max', new Date().toISOString().split('T')[0]);
        dateInput.setAttribute('min', '2024-01-01');
    }
}

function closeToeflScoreModal() {
    var overlay = document.getElementById('toeflScoreModalOverlay');
    if (overlay) overlay.classList.remove('show');
}

// ================================================
// Overall 자동 계산
// ================================================
function calculateToeflOverall() {
    var r = parseFloat(document.getElementById('toeflReading').value) || 0;
    var l = parseFloat(document.getElementById('toeflListening').value) || 0;
    var s = parseFloat(document.getElementById('toeflSpeaking').value) || 0;
    var w = parseFloat(document.getElementById('toeflWriting').value) || 0;
    var el = document.getElementById('toeflOverallDisplay');

    if (r === 0 || l === 0 || s === 0 || w === 0) {
        el.textContent = '-';
        return;
    }
    var avg = (r + l + s + w) / 4;
    var overall = Math.round(avg * 2) / 2;
    el.textContent = overall.toFixed(1);
}

// ================================================
// 이미지 프리뷰
// ================================================
function previewToeflImage(input) {
    var preview = document.getElementById('toeflImagePreview');
    if (!preview || !input.files || !input.files[0]) {
        if (preview) preview.style.display = 'none';
        return;
    }
    var file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
        alert('이미지 파일 크기는 5MB 이하로 업로드해주세요.');
        input.value = '';
        preview.style.display = 'none';
        return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
        preview.src = e.target.result;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

// ================================================
// 성적 등록 제출
// ================================================
async function submitToeflScore() {
    var submitBtn = document.getElementById('toeflSubmitBtn');
    if (!mpUser || !mpUser.id) { alert('로그인 정보가 없습니다.'); return; }

    var testDate = document.getElementById('toeflTestDate').value;
    var reading = parseFloat(document.getElementById('toeflReading').value);
    var listening = parseFloat(document.getElementById('toeflListening').value);
    var speaking = parseFloat(document.getElementById('toeflSpeaking').value);
    var writing = parseFloat(document.getElementById('toeflWriting').value);
    var legacyTotal = document.getElementById('toeflLegacyTotal').value
        ? parseInt(document.getElementById('toeflLegacyTotal').value) : null;
    var memo = document.getElementById('toeflMemo').value.trim();
    var imageInput = document.getElementById('toeflScoreImage');

    if (!testDate) { alert('시험 날짜를 선택해주세요.'); return; }
    if (!reading || !listening || !speaking || !writing) {
        alert('4개 영역 점수를 모두 선택해주세요.'); return;
    }
    if (!imageInput.files || !imageInput.files[0]) {
        alert('성적표 캡쳐 이미지를 첨부해주세요.'); return;
    }

    var avg = (reading + listening + speaking + writing) / 4;
    var overall = Math.round(avg * 2) / 2;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 등록 중...';

    try {
        // 1) 이미지 업로드
        var file = imageInput.files[0];
        var ext = file.name.split('.').pop().toLowerCase();
        var fileName = mpUser.id + '/' + Date.now() + '.' + ext;
        var uploadPath = await supabaseStorageUpload('toefl-score-images', fileName, file);
        if (!uploadPath) {
            alert('이미지 업로드에 실패했습니다.'); resetToeflSubmitBtn(); return;
        }
        var imageUrl = supabaseStorageUrl('toefl-score-images', uploadPath);

        // 2) DB 저장
        var result = await supabaseInsert('toefl_actual_scores', {
            user_id: mpUser.id,
            user_email: mpUser.email,
            user_name: mpUser.name,
            reading: reading, listening: listening,
            speaking: speaking, writing: writing,
            overall: overall,
            legacy_total: legacyTotal,
            test_date: testDate,
            score_image: imageUrl,
            memo: memo || null
        });
        if (!result) {
            alert('성적 등록에 실패했습니다.'); resetToeflSubmitBtn(); return;
        }

        // 3) 관리자 알림
        await sendToeflAdminNotification(overall, testDate);

        // 4) 완료
        alert('토플 성적이 등록되었습니다!');
        closeToeflScoreModal();
        await loadToeflScores();
        renderToeflSection();

    } catch (err) {
        console.error('❌ [TOEFL] 등록 실패:', err);
        alert('성적 등록 중 오류가 발생했습니다.');
    } finally {
        resetToeflSubmitBtn();
    }
}

function resetToeflSubmitBtn() {
    var btn = document.getElementById('toeflSubmitBtn');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> 등록하기';
    }
}

// ================================================
// 관리자 알림 발송
// ================================================
async function sendToeflAdminNotification(overall, testDate) {
    try {
        var admins = await supabaseSelect('users', 'role=eq.admin&select=id');
        if (!admins || admins.length === 0) return;

        var title = '📊 ' + mpUser.name + '님이 토플 성적을 등록했습니다';
        var message = mpUser.name + '님이 실제 TOEFL 성적을 등록했습니다.\n\n' +
            '시험 날짜: ' + testDate + '\n' +
            'Overall: ' + overall + '\n\n' +
            '학습관리2 → 해당 학생 상세에서 확인하세요.';

        for (var i = 0; i < admins.length; i++) {
            await supabaseInsert('tr_notifications', {
                user_id: admins[i].id,
                title: title,
                message: message,
                created_by: mpUser.name,
                is_read: false
            });
        }
        console.log('🔔 [TOEFL] 관리자 알림 발송 완료');
    } catch (err) {
        console.warn('⚠️ [TOEFL] 알림 발송 실패 (무시):', err);
    }
}

// ================================================
// 성적 삭제 (Storage 이미지 + DB 레코드 함께 삭제)
// ================================================
async function deleteToeflScore(scoreId) {
    if (!confirm('이 성적을 삭제하시겠습니까?')) return;
    try {
        // 1) 삭제할 레코드에서 이미지 경로 추출
        var target = toeflScores.find(function(s) { return s.id === scoreId; });

        // 2) Storage 이미지 삭제 시도 (실패해도 DB 삭제는 진행)
        if (target && target.score_image) {
            var baseUrl = supabaseStorageUrl('toefl-score-images', '');
            var imagePath = target.score_image.replace(baseUrl, '');
            if (imagePath) {
                await supabaseStorageDelete('toefl-score-images', imagePath);
            }
        }

        // 3) DB 레코드 삭제
        var ok = await supabaseDelete('toefl_actual_scores', 'id=eq.' + scoreId);
        if (ok) {
            await loadToeflScores();
            renderToeflSection();
        } else {
            alert('삭제에 실패했습니다.');
        }
    } catch (err) {
        console.error('❌ [TOEFL] 삭제 실패:', err);
        alert('삭제 중 오류가 발생했습니다.');
    }
}

// ================================================
// 이미지 뷰어
// ================================================
function openToeflImageViewer(imageUrl) {
    var overlay = document.getElementById('toeflImageViewerOverlay');
    var img = document.getElementById('toeflImageViewerImg');
    if (overlay && img) {
        img.src = imageUrl;
        overlay.classList.add('show');
    }
}
function closeToeflImageViewer() {
    var overlay = document.getElementById('toeflImageViewerOverlay');
    if (overlay) overlay.classList.remove('show');
}

// ================================================
// 유틸
// ================================================
function escapeHtmlToefl(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

console.log('✅ toefl-score.js 로드 완료');
