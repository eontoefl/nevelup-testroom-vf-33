// 내벨업보카 시험 로직 - 페이지별 분할 시스템

// 전역 변수
let vocabTestData = [];
let vocabUserAnswers = {};
let currentPages = '';
let currentPageIndex = 0;
let pageGroups = [];
let currentWeekId = null;
let currentDayId = null;

// Google Sheets 설정
const VOCAB_SPREADSHEET_ID = '1I9R-yNiRrp12lDQ_pIk6_tUFO2KcxkG_akrwPj3zKws';
const VOCAB_SHEET_GID = '0';

// CSV 파싱 함수
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"' && inQuotes && nextChar === '"') {
            current += '"';
            i++;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

// 페이지 범위 파싱 (예: "5-6" → [5, 6], "5,7,9" → [5,7,9], "5-7" → [5,6,7])
function parsePageRange(pageRange) {
    const str = String(pageRange).trim();
    
    // 쉼표 구분 (예: "5,6,7" 또는 "5, 6, 7")
    if (str.includes(',')) {
        return str.split(',').map(p => parseInt(p.trim())).filter(n => !isNaN(n));
    }
    
    // 하이픈 범위 (예: "5-7")
    if (str.includes('-')) {
        const [start, end] = str.split('-').map(p => parseInt(p.trim()));
        const pages = [];
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    }
    
    // 단일 페이지
    return [parseInt(str)].filter(n => !isNaN(n));
}

// --- Supabase에서 보카 데이터 로드 ---
async function _loadVocabFromSupabase(pages) {
    if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) return null;
    if (typeof supabaseSelect !== 'function') return null;
    
    // 시험 대상 페이지가 없으면 조회 자체를 생략
    if (!pages || pages.length === 0) {
        console.warn('⚠️ [Vocab] 조회할 페이지 없음');
        return null;
    }

    try {
        console.log('📥 [Vocab] Supabase에서 데이터 로드... (페이지:', pages.join(', '), ')');
        // 🎯 필요한 페이지만 서버에서 직접 필터링 → 전체 행(1000개 제한) 조회 방지
        const pageFilter = `page=in.(${pages.join(',')})`;
        const rows = await supabaseSelect('tr_vocab', `select=*&${pageFilter}&order=page.asc,id.asc`);

        if (!rows || rows.length === 0) {
            console.warn('⚠️ [Vocab] Supabase 데이터 없음');
            return null;
        }

        console.log(`✅ [Vocab] Supabase에서 ${rows.length}개 행 로드`);

        // 단어 가공 (페이지 필터는 서버에서 이미 적용됨)
        const filtered = [];
        rows.forEach(row => {
            const page = parseInt(row.page);
            const headword = (row.headword || '').trim();

            if (pages.includes(page) && headword) {
                const synonyms = [];
                for (let j = 1; j <= 8; j++) {
                    const syn = row[`synonym${j}`];
                    if (syn && syn.trim()) {
                        synonyms.push(syn.trim());
                    }
                }
                
                if (synonyms.length > 0) {
                    filtered.push({ page, headword, synonyms });
                }
            }
        });
        
        console.log(`✅ [Vocab] Supabase 필터링 결과: ${filtered.length}개 단어 (페이지: ${pages.join(', ')})`);
        return filtered;
        
    } catch (error) {
        console.error('❌ [Vocab] Supabase 로드 실패:', error);
        return null;
    }
}

// 데이터 로드
async function loadVocabData(pageRange) {
    console.log('📚 내벨업보카 데이터 로드 시작 - 페이지:', pageRange);
    currentPages = pageRange;
    
    const pages = parsePageRange(pageRange);
    console.log('📖 시험 페이지:', pages.join(', '));
    
    // 1) Supabase 우선 시도
    const supabaseResult = await _loadVocabFromSupabase(pages);
    if (supabaseResult && supabaseResult.length > 0) {
        vocabTestData = supabaseResult;
        console.log(`✅ ${vocabTestData.length}개의 단어 로드 완료 (Supabase)`);
        return;
    }
    
    // 2) Google Sheets 폴백
    console.log('🔄 [Vocab] Google Sheets 폴백 시도...');
    try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${VOCAB_SPREADSHEET_ID}/export?format=csv&gid=${VOCAB_SHEET_GID}`;
        console.log('CSV URL:', csvUrl);
        
        const response = await fetch(csvUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const csvText = await response.text();
        const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
        
        vocabTestData = [];
        
        // 첫 행은 헤더이므로 건너뛰기
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            
            if (values.length >= 2) {
                const page = parseInt(values[0]);
                const headword = values[1].trim();
                
                // 해당 페이지의 단어만 필터링
                if (pages.includes(page) && headword) {
                    const synonyms = [];
                    
                    // synonym1부터 synonym8까지 (최대 8개)
                    for (let j = 2; j <= 9; j++) {
                        if (values[j] && values[j].trim()) {
                            synonyms.push(values[j].trim());
                        }
                    }
                    
                    if (synonyms.length > 0) {
                        vocabTestData.push({
                            page: page,
                            headword: headword,
                            synonyms: synonyms
                        });
                    }
                }
            }
        }
        
        console.log(`✅ ${vocabTestData.length}개의 단어 로드 완료 (Google Sheets)`);
    } catch (error) {
        console.error('❌ Google Sheets 로드 실패:', error);
        alert('데이터를 불러오는데 실패했습니다. 다시 시도해주세요.');
    }
}

// 내벨업보카 섹션 초기화
async function initVocabTest(pageRange, weekId, dayId, practiceNum) {
    console.log(`📚 내벨업보카 섹션 초기화 - 페이지: ${pageRange}`);
    
    // 주차/요일 정보 저장
    currentWeekId = weekId || null;
    currentDayId = dayId || null;
    // 연습코스 practice number 저장
    window._vocabPracticeNumber = practiceNum || null;
    
    // 데이터 로드
    await loadVocabData(pageRange);
    
    // 화면 표시
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    const vocabScreen = document.getElementById('vocabTestScreen');
    vocabScreen.classList.add('active');
    vocabScreen.style.display = 'block';
    
    console.log('✅ vocabTestScreen 화면 전환 완료');
    
    // 페이지별로 그룹화
    const pages = parsePageRange(pageRange);
    pageGroups = [];
    pages.forEach(page => {
        const pageData = vocabTestData.filter(item => item.page === page);
        if (pageData.length > 0) {
            pageGroups.push({
                page: page,
                data: pageData
            });
        }
    });
    currentPageIndex = 0;
    
    console.log(`✅ 총 ${pageGroups.length}개 페이지로 분할됨`);
    
    // 시험 제목 업데이트
    updateVocabTestTitle(pageRange);
    
    // 소개 화면 업데이트
    updateIntroScreen(pageRange);
    
    // 소개 화면 표시
    document.getElementById('vocabTestIntro').style.display = 'block';
    document.getElementById('vocabTestMain').style.display = 'none';
}

// 인트로 화면 업데이트
function updateIntroScreen(pageRange) {
    // Week N - X요일 표시
    const weekDayElement = document.querySelector('#vocabTestIntro .intro-week-day');
    if (weekDayElement && currentWeekId && currentDayId) {
        weekDayElement.textContent = `Week ${currentWeekId} - ${currentDayId}요일`;
        weekDayElement.style.display = 'block';
    }
    
    // 페이지 정보 표시
    const pageInfoElement = document.querySelector('#vocabTestIntro .intro-page-info');
    if (pageInfoElement) {
        // 🎯 "5-6" → "5, 6" 형식으로 변환
        const formattedPageRange = pageRange.replace('-', ', ');
        pageInfoElement.textContent = `페이지 ${formattedPageRange} (총 ${vocabTestData.length}개 단어)`;
        pageInfoElement.style.display = 'block';
    }
}

// 시험 제목 업데이트
function updateVocabTestTitle(pageRange) {
    const titleElement = document.querySelector('#vocabTestScreen .test-title span');
    if (titleElement) {
        titleElement.textContent = `내벨업보카 시험 (p.${pageRange})`;
    }
}

// 시험 시작
function startVocabTest() {
    console.log('✅ 내벨업보카 시험 시작');
    
    // ★ 데이터가 없으면 시작 불가
    if (!pageGroups || pageGroups.length === 0) {
        console.error('❌ 단어 데이터가 없습니다. 데이터 로드를 확인하세요.');
        alert('단어 데이터를 불러오지 못했습니다. 페이지를 새로고침 후 다시 시도해주세요.');
        return;
    }
    
    // 사용자 답안 초기화
    vocabUserAnswers = {};
    currentPageIndex = 0;
    
    // 소개 화면 숨기고 시험 화면 표시
    document.getElementById('vocabTestIntro').style.display = 'none';
    document.getElementById('vocabTestMain').style.display = 'block';
    
    // 첫 페이지 렌더링
    renderCurrentPage();
}

// 현재 페이지 렌더링
function renderCurrentPage() {
    const currentGroup = pageGroups[currentPageIndex];
    const container = document.getElementById('vocabTestContainer');
    container.innerHTML = '';
    
    // ★ 방어 코드: 데이터가 없으면 중단
    if (!currentGroup || !currentGroup.data) {
        console.error('❌ renderCurrentPage: 현재 페이지 데이터 없음', { currentPageIndex, pageGroupsLength: pageGroups.length });
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#999;"><p>📭 해당 페이지의 단어 데이터가 없습니다.</p><p>데이터 로드에 실패했을 수 있습니다.</p></div>';
        return;
    }
    
    // 진행 상태 업데이트 - 🎯 구조화된 HTML로 변경
    const progressHTML = `
        <span class="vocab-progress-page">페이지 ${currentGroup.page}</span>
        <span class="vocab-progress-divider">•</span>
        <span class="vocab-progress-count">${currentPageIndex + 1}/${pageGroups.length}</span>
        <span class="vocab-progress-divider">•</span>
        <span class="vocab-progress-words">${currentGroup.data.length}개 단어</span>
    `;
    document.getElementById('vocabTestProgressText').innerHTML = progressHTML;
    
    // 🎯 이전 페이지 버튼 표시/숨김
    const prevBtn = document.querySelector('.vocab-prev-btn');
    if (prevBtn) {
        if (currentPageIndex > 0) {
            prevBtn.style.display = 'inline-block';
        } else {
            prevBtn.style.display = 'none';
        }
    }
    
    // 제출 버튼 텍스트 변경
    const submitBtn = document.querySelector('.vocab-submit-btn');
    if (submitBtn) {
        if (currentPageIndex < pageGroups.length - 1) {
            submitBtn.innerHTML = '<i class="fas fa-arrow-right"></i>'; /* 🎯 아이콘만 */
        } else {
            submitBtn.innerHTML = '<i class="fas fa-check"></i>'; /* 🎯 아이콘만 */
        }
    }
    
    // 🎯 컬럼 헤더 추가
    const headerDiv = document.createElement('div');
    headerDiv.className = 'vocab-header';
    headerDiv.innerHTML = `
        <div class="vocab-header-headword">표제어</div>
        <div class="vocab-header-synonyms">동의어</div>
    `;
    container.appendChild(headerDiv);
    
    // 문제 렌더링
    currentGroup.data.forEach((item) => {
        const globalIndex = vocabTestData.indexOf(item);
        
        const itemDiv = document.createElement('div');
        itemDiv.className = 'vocab-item';
        itemDiv.dataset.index = globalIndex;
        
        // 🎯 표제어 부분 (라벨 제거)
        const headwordDiv = document.createElement('div');
        headwordDiv.className = 'vocab-headword';
        headwordDiv.innerHTML = `
            <div class="vocab-headword-text">${item.headword}</div>
        `;
        
        // 🎯 동의어 입력 부분 (라벨 제거)
        const synonymsDiv = document.createElement('div');
        synonymsDiv.className = 'vocab-synonyms';
        
        item.synonyms.forEach((_, synIndex) => {
            const inputWrapper = document.createElement('div');
            inputWrapper.className = 'vocab-synonym-input-wrapper';
            
            inputWrapper.innerHTML = `
                <input 
                    type="text" 
                    class="vocab-synonym-input" 
                    data-word-index="${globalIndex}" 
                    data-synonym-index="${synIndex}"
                    placeholder="동의어를 입력하세요"
                    autocomplete="off"
                    value="${vocabUserAnswers[globalIndex] && vocabUserAnswers[globalIndex][synIndex] || ''}"
                >
            `;
            
            synonymsDiv.appendChild(inputWrapper);
        });
        
        itemDiv.appendChild(headwordDiv);
        itemDiv.appendChild(synonymsDiv);
        container.appendChild(itemDiv);
    });
    
    // 입력 이벤트 리스너 추가
    document.querySelectorAll('.vocab-synonym-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const wordIdx = parseInt(e.target.dataset.wordIndex);
            const synIdx = parseInt(e.target.dataset.synonymIndex);
            
            if (!vocabUserAnswers[wordIdx]) {
                vocabUserAnswers[wordIdx] = {};
            }
            
            // trim 적용
            vocabUserAnswers[wordIdx][synIdx] = e.target.value.trim();
        });
    });
}

// 🎯 이전 페이지로 이동
function goToPrevPage() {
    if (currentPageIndex > 0) {
        currentPageIndex--;
        renderCurrentPage();
        // 페이지 상단으로 스크롤
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// 시험 제출 또는 다음 페이지
function submitVocabTest() {
    // 다음 페이지가 있으면 다음 페이지로
    if (currentPageIndex < pageGroups.length - 1) {
        currentPageIndex++;
        renderCurrentPage();
        // 페이지 상단으로 스크롤
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }
    
    // 마지막 페이지면 제출
    if (!confirm('제출하시겠습니까?')) {
        return;
    }
    
    // 채점 화면으로 이동
    showVocabTestResult();
}

// 채점 결과 화면 표시
async function showVocabTestResult() {
    console.log('📊 채점 결과 표시');
    
    // 채점
    const results = [];
    let correctCount = 0;
    let totalCount = vocabTestData.length;
    
    // 결과 줄은 "학생이 쓴 칸" 순서 그대로, 칸마다 한 줄. 채점(점수)은 칸 순서와 무관하게 정답 목록과 대조한다.
    // 칸 상태: ok(맞힘) / typo(어느 정답의 오타) / wrong(어느 정답과도 안 비슷함) / blank(비움) / dup(이미 맞힌 정답을 또 씀).
    // 틀린 칸(typo·wrong·blank·dup)에는 못 맞힌 교재 정답을 하나씩 붙인다 — typo는 가장 비슷한 정답, 나머지는 남은 정답을 교재 순서대로.
    vocabTestData.forEach((item, index) => {
        const userAnswer = vocabUserAnswers[index] || {};

        // 정답 칸마다 허용 변형 목록 ('|' 구분, 정오표/과도기 복수정답 지원) + 소문자 비교용
        //   하이픈 든 정답은 하이픈 자리에 '-' / 띄어쓰기 / 없음 전부 인정 (man-made ← man made, manmade). 화면은 교재 표기.
        const answerSlots = item.synonyms.map(s => {
            const variants = s.split('|').map(x => x.trim()).filter(Boolean);
            const vs = variants.length ? variants : [s.trim()];
            const lower = [];
            vs.forEach(v => {
                const l = v.toLowerCase();
                lower.push(l);
                if (l.includes('-')) lower.push(l.replace(/-/g, ' '), l.replace(/-/g, ''));
            });
            return { variants: vs, lower: lower };
        });

        // 칸마다 학생 답 정리본(앞뒤 공백 제거, 겹띄어쓰기는 한 칸, 끝의 문장부호 제거). 빈칸은 ''.
        const rows = item.synonyms.map((_, synIndex) => ({
            userAnswer: _vocabCleanInput(userAnswer[synIndex] || ''),
            status: null,
            answer: null
        }));

        // ① 순서 무관 채점 — 각 답을 아직 안 쓰인 정답과 정확히 대조. 점수는 여기서만 정해진다(기존과 동일).
        const matchedAnswer = new Array(answerSlots.length).fill(null); // 정답 칸 → 맞힌 학생 답
        rows.forEach(r => {
            if (!r.userAnswer) { r.status = 'blank'; return; }
            const low = r.userAnswer.toLowerCase();
            const cIdx = answerSlots.findIndex((slot, i) => matchedAnswer[i] === null && slot.lower.includes(low));
            if (cIdx >= 0) {
                matchedAnswer[cIdx] = r.userAnswer;
                r.status = 'ok';
                r.answer = answerSlots[cIdx].variants.find(v => v.toLowerCase() === low) || answerSlots[cIdx].variants[0];
            }
        });
        const matchedCount = matchedAnswer.filter(a => a !== null).length;
        const allCorrect = matchedCount === answerSlots.length;
        if (allCorrect) {
            correctCount++;
        }

        // ② 못 맞힌 칸 분류 — 이미 맞힌 정답과 같은 답은 dup, 나머지는 남은 정답과 오타 짝맞춤 후보
        const candidates = [];                               // { row, text }
        rows.forEach(r => {
            if (r.status) return;
            const low = r.userAnswer.toLowerCase();
            const dupOf = answerSlots.findIndex((slot, i) => matchedAnswer[i] !== null && slot.lower.includes(low));
            if (dupOf >= 0) r.status = 'dup'; else candidates.push(r);
        });
        const openIdx = answerSlots.map((_, i) => i).filter(i => matchedAnswer[i] === null);
        const pairing = _vocabPairLeftovers(candidates.map(c => c.userAnswer), openIdx.map(i => answerSlots[i].variants));
        const openUsed = new Array(openIdx.length).fill(false);
        pairing.pairs.forEach(p => {
            candidates[p.t].status = 'typo';
            candidates[p.t].answer = p.variant;
            openUsed[p.a] = true;
        });
        pairing.extras.forEach(ti => { candidates[ti].status = 'wrong'; });

        // ③ 아직 정답이 안 붙은 틀린 칸(wrong·blank·dup)에 남은 정답을 교재 순서대로 하나씩.
        //    틀린 칸 수 = 못 맞힌 정답 수라서 항상 1:1로 떨어진다.
        let next = 0;
        rows.forEach(r => {
            if (r.answer !== null) return;
            while (next < openIdx.length && openUsed[next]) next++;
            r.answer = next < openIdx.length ? answerSlots[openIdx[next]].variants[0] : '';
            if (next < openIdx.length) openUsed[next] = true;
        });

        results.push({
            headword: item.headword,
            total: answerSlots.length,
            matched: matchedCount,
            allCorrect: allCorrect,
            answers: rows
        });
    });
    
    const percentage = Math.round((correctCount / totalCount) * 100);
    
    // ── Supabase에 보카 학습 기록 저장 ──
    try {
        await saveVocabRecord(correctCount, totalCount, percentage, results);
    } catch(e) {
        console.error('📝 [Vocab] 저장 에러:', e);
    }
    
    // 결과 렌더링
    renderVocabResult(results, correctCount, totalCount, percentage);
    
    // 결과 화면으로 전환
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    const resultScreen = document.getElementById('vocabResultScreen');
    resultScreen.classList.add('active');
    resultScreen.style.display = 'block';
}

// ── 오답 글자단위 diff ─────────────────────────────────────────────
// 학생 오답이 정답과 "어디가" 다른지(빠진 글자/틀린 글자/불필요한 글자) 짚어주기 위한 유틸.
// 채점 자체는 바꾸지 않는다. 표시 전용이며 대소문자는 무시하고 비교, 화면 글자는 원문 유지.

// HTML 이스케이프 (한 글자씩 innerHTML로 주입하므로 안전 처리)
function _vocabEsc(s) {
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// 편집거리 백트레이스로 정렬 결과(op 목록) 산출
// op: {t:'eq'|'sub'|'del'|'ins', a?, b?}  (a=학생답 글자, b=정답 글자)
//   eq  = 일치, sub = 자리 틀림, del = 학생만 가짐(불필요), ins = 정답만 가짐(빠뜨림)
function _vocabAlign(a, b) {
    const al = a.toLowerCase(), bl = b.toLowerCase();
    const n = a.length, m = b.length;
    const dp = Array.from({length: n + 1}, () => new Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) dp[i][0] = i;
    for (let j = 0; j <= m; j++) dp[0][j] = j;
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
        const cost = al[i - 1] === bl[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
    let i = n, j = m; const ops = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (al[i - 1] === bl[j - 1] ? 0 : 1)) {
            ops.push({t: al[i - 1] === bl[j - 1] ? 'eq' : 'sub', a: a[i - 1], b: b[j - 1]});
            i--; j--;
        } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
            ops.push({t: 'del', a: a[i - 1]});
            i--;
        } else {
            ops.push({t: 'ins', b: b[j - 1]});
            j--;
        }
    }
    return ops.reverse();
}

// 두 문자열의 편집거리 (복수정답 중 가장 가까운 변형 고르기용)
function _vocabEditDistance(a, b) {
    const al = a.toLowerCase(), bl = b.toLowerCase(), n = al.length, m = bl.length;
    let prev = Array.from({length: m + 1}, (_, j) => j);
    for (let i = 1; i <= n; i++) {
        const cur = [i];
        for (let j = 1; j <= m; j++) {
            const cost = al[i - 1] === bl[j - 1] ? 0 : 1;
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = cur;
    }
    return prev[m];
}

// 복수정답(|)일 때 학생 답과 가장 가까운 변형 반환
function _vocabClosestVariant(userAnswer, variants) {
    let best = variants[0], bestD = Infinity;
    for (const v of variants) {
        const d = _vocabEditDistance(userAnswer, v);
        if (d < bestD) { bestD = d; best = v; }
    }
    return best;
}

// 학생 답 정리: 앞뒤 공백 제거 · 겹띄어쓰기는 한 칸 · 끝의 마침표/쉼표 등 문장부호 제거 (대표 결정: 손가락 실수는 봐줌)
function _vocabCleanInput(raw) {
    return String(raw).replace(/\s+/g, ' ').trim().replace(/[.,;:!?]+$/, '').trim();
}

// 남은 학생 답 ↔ 남은 정답 오타 짝맞춤 (표시 전용, 점수와 무관)
//   후보: 정답 변형 중 가장 가까운 것과의 편집거리 d가 d×2 ≤ 변형 길이 (10/08 "가까운 오타" 기준과 동일)
//   목표: 짝 수 최대 → 그다음 거리 합 최소. 동의어가 최대 8개라 전수 탐색으로 충분.
//   반환: { pairs: [{ t: typed 인덱스, a: openVariants 인덱스, variant }], extras: [짝 못 지은 typed 인덱스] }
function _vocabPairLeftovers(typed, openVariants) {
    const cand = typed.map(t => openVariants.map(vs => {
        let best = null;
        vs.forEach(v => {
            const d = _vocabEditDistance(t, v);
            if (d * 2 <= v.length && (!best || d < best.d)) best = { d: d, variant: v };
        });
        return best;
    }));
    let best = { pairs: [], score: Infinity };
    const used = new Array(openVariants.length).fill(false);
    const cur = [];
    (function go(ti, dist) {
        if (ti === typed.length) {
            const score = -cur.length * 1000 + dist;
            if (score < best.score) best = { pairs: cur.slice(), score: score };
            return;
        }
        cand[ti].forEach((c, ai) => {                       // 짝 짓는 쪽을 먼저 봐서, 동점이면 앞 칸이 짝을 가져간다
            if (!c || used[ai]) return;
            used[ai] = true; cur.push({ t: ti, a: ai, variant: c.variant });
            go(ti + 1, dist + c.d);
            cur.pop(); used[ai] = false;
        });
        go(ti + 1, dist);                                   // 이 답은 짝 안 지음
    })(0, 0);
    const paired = new Set(best.pairs.map(p => p.t));
    return { pairs: best.pairs, extras: typed.map((_, i) => i).filter(i => !paired.has(i)) };
}

// diff 박스 안 글자 하나 — 공백은 강조 칸이 보이도록 &nbsp;로
function _vocabDiffChar(c) {
    return c === ' ' ? '&nbsp;' : _vocabEsc(c);
}

// "내가 쓴 답" 박스용: 맞은 글자 그대로 · 다른 글자 형광펜 · 불필요 글자 형광펜+취소선 · 빠진 자리 형광펜 '_'
// (틀린 데 표시는 내가 쓴 답 위에만. 정답은 교재 표기 그대로 보여준다)
function _renderDiffMine(ops) {
    let html = '';
    for (const o of ops) {
        if (o.t === 'eq')       html += _vocabDiffChar(o.a);
        else if (o.t === 'sub') html += `<span class="dc-wrong">${_vocabDiffChar(o.a)}</span>`;
        else if (o.t === 'del') html += `<span class="dc-extra">${_vocabDiffChar(o.a)}</span>`;
        else if (o.t === 'ins') html += `<span class="dc-gap">_</span>`;
    }
    return html;
}

// 결과 렌더링
function renderVocabResult(results, correctCount, totalCount, percentage) {
    const container = document.getElementById('vocabResultContainer');
    
    // 점수 카드
    const scoreCard = `
        <div class="vocab-score-card">
            <div class="vocab-score-title">시험 결과 (p.${currentPages})</div>
            <div class="vocab-score-percentage">${percentage}%</div>
            <div class="vocab-score-stats">
                <div class="vocab-stat-item">
                    <div class="vocab-stat-label">정답</div>
                    <div class="vocab-stat-value vocab-stat-correct">${correctCount}</div>
                </div>
                <div class="vocab-stat-item">
                    <div class="vocab-stat-label">오답</div>
                    <div class="vocab-stat-value vocab-stat-wrong">${totalCount - correctCount}</div>
                </div>
                <div class="vocab-stat-item">
                    <div class="vocab-stat-label">총 문제</div>
                    <div class="vocab-stat-value">${totalCount}</div>
                </div>
            </div>
        </div>
    `;
    
    // 결과 리스트
    let resultsList = '<div class="vocab-results-list">';
    resultsList += '<div class="vocab-results-header">문제별 결과</div>';
    
    // 줄 조립: [내가 쓴 답(입력칸 모양)] [✓/✗] → [교재 정답]. 문구는 "같은 답을 두 번 썼어요" 하나만(형광펜으로 못 보여주는 유일한 경우).
    const okMark  = '<span class="ans-mark ok"><i class="fas fa-check"></i></span>';
    const badMark = '<span class="ans-mark bad"><i class="fas fa-times"></i></span>';
    const inBox   = html => `<span class="ans-in">${html}</span>`;
    const emptyBox = text => `<span class="ans-in empty">${text}</span>`;
    const answerPart = answer => `<span class="ans-arrow">→</span><span class="ans-word">${_vocabEsc(answer)}</span>`;

    results.forEach((result) => {
        const statusClass = result.allCorrect ? 'correct' : 'wrong';
        const statusText = result.allCorrect ? '정답' : '오답';
        // "N개 중 M개" — 동의어 2개 이상인 단어만. 점수와 무관한 정보 표시.
        const countHtml = result.total >= 2
            ? `<span class="vocab-result-count">${result.total}개 중 ${result.matched}개</span>`
            : '';

        // 학생이 쓴 칸 순서로 한 줄씩. 맞힘은 내 답 + ✓. 틀림은 내 답(오타면 틀린 글자 형광펜, 빈칸은 "(비워 둠)") ✗ → 정답.
        let rows = '';
        result.answers.forEach(a => {
            if (a.status === 'ok') {
                rows += `<div class="ans-row ok">${inBox(_vocabEsc(a.userAnswer))}${okMark}</div>`;
            } else if (a.status === 'typo') {
                rows += `<div class="ans-row bad">${inBox(_renderDiffMine(_vocabAlign(a.userAnswer, a.answer)))}${badMark}${answerPart(a.answer)}</div>`;
            } else if (a.status === 'blank') {
                rows += `<div class="ans-row bad">${emptyBox('(비워 둠)')}${badMark}${answerPart(a.answer)}</div>`;
            } else if (a.status === 'dup') {
                rows += `<div class="ans-row bad">${inBox(_vocabEsc(a.userAnswer))}${badMark}${answerPart(a.answer)}<span class="syn-hint">같은 답을 두 번 썼어요</span></div>`;
            } else {
                rows += `<div class="ans-row bad">${inBox(_vocabEsc(a.userAnswer))}${badMark}${answerPart(a.answer)}</div>`;
            }
        });

        resultsList += `
            <div class="vocab-result-item ${statusClass}">
                <div class="vocab-result-header">
                    <div class="vocab-result-headword">
                        <div class="vocab-result-headword-text">${result.headword}</div>
                        ${countHtml}
                    </div>
                    <div class="vocab-result-status ${statusClass}">${statusText}</div>
                </div>
                <div class="vocab-result-answers">
                    ${rows}
                </div>
            </div>
        `;
    });
    
    resultsList += '</div>';
    
    container.innerHTML = scoreCard + resultsList;
}

// Cleanup 함수
function cleanupVocabTest() {
    vocabTestData = [];
    vocabUserAnswers = {};
    currentPages = '';
    currentPageIndex = 0;
    pageGroups = [];
    currentWeekId = null;
    currentDayId = null;
}

// ========================================
// Supabase 보카 기록 저장
// ========================================
async function saveVocabRecord(correctCount, totalCount, percentage, results) {
    console.log('📝 [Vocab] saveVocabRecord 시작:', correctCount, '/', totalCount, '=', percentage + '%');
    
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user || !user.id) {
        console.log('📝 [Vocab] 사용자 없음 — 저장 생략');
        return;
    }
    
    if (user.id === 'dev-user-001') {
        console.log('📝 [Vocab] 개발 모드 — 저장 생략');
        return;
    }

    var scheduleInfo = { week: 1, day: '월' };
    var ct = window.currentTest;
    if (ct && ct.currentWeek) {
        scheduleInfo = { week: ct.currentWeek, day: ct.currentDay || '월' };
    } else if (currentWeekId && currentDayId) {
        scheduleInfo = { week: currentWeekId, day: currentDayId };
    }

    // V3 인증률: 정답률 30% 이상 → 100, 미만 → 0
    var authRate = (percentage < 30) ? 0 : 100;

    // V3 JSON 구조 생성
    var recordJson = {
        score: correctCount,
        total: totalCount,
        accuracy: percentage,
        pages: currentPages,
        completedAt: new Date().toISOString(),
        words: results || []   // 단어별 답안(학생이 쓴 칸 순서): [{ headword, total, matched, allCorrect, answers: [{ userAnswer, status: ok|typo|wrong|blank|dup, answer: 그 칸에 붙은 교재 정답 }] }]
    };

    try {
        var inPractice = typeof isPracticeMode === 'function' && isPracticeMode();
        var vocabPNum = window._vocabPracticeNumber;
        
        if (inPractice && vocabPNum) {
            // 연습코스: study_results_practice에 저장
            // 자동 재시도 → 최종 실패 시 보고 팝업 (SaveGuard)
            // ※ locked_auth_rate 컬럼은 이 테이블에 없으므로 넘기지 않는다 (넘기면 400).
            var vocabSaveOk = await SaveGuard.attempt(function() {
                return window._deadlinePassedMode
                    ? upsertCurrentRecordPractice(user.id, 'vocab', 1, vocabPNum, recordJson)
                    : upsertInitialRecordPractice(user.id, 'vocab', 1, vocabPNum, recordJson);
            });
            if (!vocabSaveOk) {
                SaveGuard.showFailurePopup({
                    sectionType: 'vocab',
                    moduleNumber: 1,
                    practiceNumber: vocabPNum,
                    taskLabel: '내벨업보카 ' + (currentPages || '') + 'pg (P' + vocabPNum + ')',
                    record: recordJson
                    // onDone 없음 — 팝업 닫으면 채점 결과 화면 유지
                });
                return;
            }
            console.log('📝 [Vocab] 연습코스 기록 저장 완료');
        } else if (window._deadlinePassedMode || window._pausedMode) {
            // 마감 후 제출(또는 일시정지 중 다시풀기) → current_record에 저장 (연습 기록, 인증률 무관)
            await upsertCurrentRecord(user.id, 'vocab', 1, scheduleInfo.week, scheduleInfo.day, recordJson);
            console.log('📝 [Vocab] 마감 후 제출 — current_record 저장 완료');
        } else {
            // 마감 전 제출 → initial_record에 저장 + locked_auth_rate 즉시 확정
            await upsertInitialRecord(user.id, 'vocab', 1, scheduleInfo.week, scheduleInfo.day, recordJson, {
                locked_auth_rate: authRate
            });
            console.log('📝 [Vocab] 기록 저장 완료, 인증률:', authRate + '%');
        }

        if (window.ProgressTracker) {
            ProgressTracker.markCompleted('vocab', 1);
        }
    } catch (e) {
        console.error('📝 [Vocab] 저장 실패:', e);
    }

    if (percentage < 30) {
        setTimeout(function() {
            var container = document.getElementById('vocabResultContainer');
            if (container) {
                var notice = document.createElement('div');
                notice.style.cssText = 'background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:16px;margin:16px 0;text-align:center;color:#856404;font-size:14px;';
                notice.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 정답률이 30% 미만이므로 미인정 처리되었습니다.';
                container.insertBefore(notice, container.firstChild.nextSibling);
            }
        }, 100);
    }
}

console.log('✅ vocab-test-logic.js 로드 완료');

// ========================================
// 보카 시험 중 나가기 확인 팝업
// showGuidePopup 스타일과 동일한 UI
// ========================================
function confirmLeaveVocab() {
    // 오버레이
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';

    // 팝업
    var popup = document.createElement('div');
    popup.style.cssText = 'background:#fff;border-radius:20px;max-width:380px;width:90%;padding:36px 28px 28px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:slideUp 0.3s ease;';

    popup.innerHTML =
        '<div style="font-size:48px;margin-bottom:16px;">⚠️</div>' +
        '<h3 style="margin:0 0 12px;font-size:18px;font-weight:700;color:#1a1a1a;">시험을 중단하시겠습니까?</h3>' +
        '<p style="margin:0 0 24px;font-size:14px;color:#666;line-height:1.7;">' +
            '지금 나가면 작성한 답안이 <b style="color:#ef4444;">모두 삭제</b>되며,<br>' +
            '처음부터 다시 풀어야 합니다.' +
        '</p>' +
        '<div style="display:flex;gap:10px;">' +
            '<button id="vocabLeaveCancel" style="flex:1;padding:13px;border-radius:12px;border:1.5px solid #ddd;background:#fff;font-size:14px;font-weight:600;color:#666;cursor:pointer;">계속 풀기</button>' +
            '<button id="vocabLeaveConfirm" style="flex:1;padding:13px;border-radius:12px;border:none;background:#f97316;font-size:14px;font-weight:600;color:#fff;cursor:pointer;">나가기</button>' +
        '</div>';

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // 계속 풀기
    document.getElementById('vocabLeaveCancel').onclick = function() {
        overlay.remove();
    };

    // 나가기
    document.getElementById('vocabLeaveConfirm').onclick = function() {
        overlay.remove();
        backToSchedule();
    };

    // 오버레이 배경 클릭 시 닫기
    overlay.onclick = function(e) {
        if (e.target === overlay) overlay.remove();
    };
}
