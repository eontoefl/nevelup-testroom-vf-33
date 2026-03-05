// Reading - 빈칸채우기 (Fill in the Blanks) 데이터 구조
// v3 - Supabase 우선 → Google Sheets 폴백 방식

// Google Sheets 설정 (폴백용)
const FILLBLANKS_SHEET_CONFIG = { spreadsheetId: '12EmtpZUXLyqyHH8iFfBiBgw7DVzP15LUWcIEaQLuOfY', sheetGid: '0' };

// ========== Supabase → Google Sheets 폴백 ==========
async function fetchFillBlanksFromSheet() {
    // 1) Supabase 우선 시도
    const supabaseResult = await _fetchFillBlanksFromSupabase();
    if (supabaseResult) return supabaseResult;
    
    // 2) 실패 시 Google Sheets 폴백
    console.log('🔄 [FillBlanks] Google Sheets 폴백 시도...');
    return await _fetchFillBlanksFromGoogleSheets();
}

// --- Supabase에서 로드 ---
async function _fetchFillBlanksFromSupabase() {
    if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) {
        console.log('📋 [FillBlanks] Supabase 비활성화 → 건너뜀');
        return null;
    }
    if (typeof supabaseSelect !== 'function') {
        console.warn('⚠️ [FillBlanks] supabaseSelect 함수 없음 → 건너뜀');
        return null;
    }
    
    try {
        console.log('📥 [FillBlanks] Supabase에서 데이터 로드...');
        const rows = await supabaseSelect('tr_reading_fillblanks', 'select=id,passage_with_markers&order=id.asc');
        
        if (!rows || rows.length === 0) {
            console.warn('⚠️ [FillBlanks] Supabase 데이터 없음');
            return null;
        }
        
        console.log(`✅ [FillBlanks] Supabase에서 ${rows.length}개 세트 로드 성공`);
        
        const sets = rows.map(row => {
            const parsedData = parsePassageWithMarkers(row.passage_with_markers);
            return {
                id: row.id,
                title: 'Fill in the missing letters in the paragraph.',
                passage: parsedData.cleanPassage,
                blanks: parsedData.blanks
            };
        });
        
        return { type: 'fill_blanks', timeLimit: 180, sets };
        
    } catch (error) {
        console.error('❌ [FillBlanks] Supabase 로드 실패:', error);
        return null;
    }
}

// --- Google Sheets에서 로드 (원본 코드) ---
async function _fetchFillBlanksFromGoogleSheets() {
    try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${FILLBLANKS_SHEET_CONFIG.spreadsheetId}/export?format=csv&gid=${FILLBLANKS_SHEET_CONFIG.sheetGid}`;
        console.log('📥 [FillBlanks] Google Sheets CSV URL:', csvUrl);
        
        const response = await fetch(csvUrl);
        if (!response.ok) {
            console.warn('⚠️ [FillBlanks] Google Sheets HTTP 에러:', response.status);
            return null;
        }
        
        const csvText = await response.text();
        console.log(`✅ [FillBlanks] Google Sheets CSV 다운로드 완료 (${csvText.length} bytes)`);
        
        return parseFillBlanksCSV(csvText);
        
    } catch (error) {
        console.error('❌ [FillBlanks] Google Sheets 로드 실패:', error);
        return null;
    }
}

// CSV를 빈칸채우기 데이터로 변환
function parseFillBlanksCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const sets = [];
    
    // 첫 줄은 헤더이므로 건너뛰기
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = parseCSVLine(line);
        
        if (values.length >= 2) {
            let setId = values[0].trim();
            const passageWithMarkers = values[1].trim();
            
            // ✅ 빈 행 스킵 (setId가 비어있으면 무시)
            if (!setId) {
                continue;
            }
            
            // ✅ Set ID 강제 정규화: fillblank_set_1 → fillblank_set_0001
            if (setId) {
                const match = setId.match(/fillblank_set_(\d+)/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    setId = `fillblank_set_${String(num).padStart(4, '0')}`;
                    console.log(`  ✅ Set ID 정규화: ${match[0]} → ${setId}`);
                }
            }
            
            // 마커에서 빈칸 정보 추출 (각 빈칸마다 해설 포함)
            const parsedData = parsePassageWithMarkers(passageWithMarkers);
            
            sets.push({
                id: setId,
                title: 'Fill in the missing letters in the paragraph.', // 고정 제목
                passage: parsedData.cleanPassage,
                blanks: parsedData.blanks // blanks에 각각의 explanation 포함
            });
        }
    }
    
    // ✅ Set ID 기준으로 정렬 (fillblank_set_0001, fillblank_set_0002, ...)
    sets.sort((a, b) => {
        // fillblank_set_ 뒤의 숫자만 추출
        const numA = parseInt(a.id.replace('fillblank_set_', ''));
        const numB = parseInt(b.id.replace('fillblank_set_', ''));
        console.log(`  [FillBlanks] 정렬 비교: ${a.id} (${numA}) vs ${b.id} (${numB}) → ${numA - numB}`);
        return numA - numB;
    });
    
    console.log('📊 [FillBlanks] 정렬된 세트 순서:', sets.map(s => s.id));
    
    return {
        type: 'fill_blanks',
        timeLimit: 180,
        sets: sets
    };
}

// 마커가 포함된 지문 파싱 {{prefix|answer|explanation}}
function parsePassageWithMarkers(text) {
    const blanks = [];
    let cleanPassage = '';
    let currentIndex = 0;
    let blankId = 1;
    
    console.log('=== 파싱 시작 ===');
    console.log('원본 텍스트:', text.substring(0, 200) + '...');
    
    // 정규식: {{prefix|answer|explanation|(commonMistakes)|(mistakesExplanation)}} 형태 찾기
    // explanation, commonMistakes, mistakesExplanation은 선택사항
    const markerRegex = /\{\{([^|{}]+)\|([^|{}]+)(?:\|([^|]*?))?(?:\|([^|]*?))?(?:\|([^}]*))?\}\}/g;
    let match;
    let lastIndex = 0;
    
    while ((match = markerRegex.exec(text)) !== null) {
        const fullMatch = match[0]; // {{mi|ght|추측을 나타내는 조동사|(may, can)|(추측의 정도 차이를...)}}
        const prefix = match[1].trim(); // mi
        const answer = match[2].trim(); // ght
        const explanation = match[3] ? match[3].trim() : '해설이 준비 중입니다.'; // 추측을 나타내는 조동사
        const commonMistakes = match[4] ? match[4].trim() : ''; // (may, can)
        const mistakesExplanation = match[5] ? match[5].trim() : ''; // (추측의 정도 차이를...)
        
        console.log(`매칭 ${blankId}:`, { fullMatch, prefix, answer, explanation: explanation.substring(0, 30), commonMistakes, mistakesExplanation });
        
        // 마커 앞의 텍스트 추가
        const beforeText = text.substring(lastIndex, match.index);
        cleanPassage += beforeText;
        currentIndex = cleanPassage.length;
        
        // 빈칸 정보 저장
        blanks.push({
            id: blankId++,
            startIndex: currentIndex,
            prefix: prefix,
            answer: answer,
            blankCount: answer.length,
            explanation: explanation, // 각 빈칸마다 해설 추가
            commonMistakes: commonMistakes, // 자주 보이는 오답 단어들
            mistakesExplanation: mistakesExplanation // 오답 설명
        });
        
        // 클린 지문에는 prefix + 빈칸 플레이스홀더 추가
        cleanPassage += prefix;
        for (let i = 0; i < answer.length; i++) {
            cleanPassage += '_';
        }
        
        lastIndex = match.index + fullMatch.length;
    }
    
    // 마지막 텍스트 추가
    cleanPassage += text.substring(lastIndex);
    
    console.log('총 빈칸 개수:', blanks.length);
    console.log('클린 지문:', cleanPassage.substring(0, 200) + '...');
    console.log('=== 파싱 완료 ===');
    
    return {
        cleanPassage: cleanPassage,
        blanks: blanks
    };
}

// ✅ 데이터 캐시 (정렬된 데이터를 메모리에 저장)
let cachedFillBlanksData = null;

// Google Sheets에서 데이터 로드 또는 데모 데이터 사용
async function loadFillBlanksData() {
    console.log('🔄 [loadFillBlanksData] 시작');
    
    // 캐시가 있으면 재사용
    if (cachedFillBlanksData) {
        console.log('✅ [loadFillBlanksData] 캐시된 데이터 사용');
        console.log('📊 [loadFillBlanksData] 캐시 데이터 세트 순서:', cachedFillBlanksData.sets.map(s => s.id));
        return cachedFillBlanksData;
    }
    
    const sheetsData = await fetchFillBlanksFromSheet();
    
    if (sheetsData && sheetsData.sets.length > 0) {
        console.log('✅ Google Sheets에서 빈칸채우기 데이터를 불러왔습니다.');
        console.log('📊 [loadFillBlanksData] 반환 데이터 세트 순서:', sheetsData.sets.map(s => s.id));
        cachedFillBlanksData = sheetsData; // 캐시 저장
        return sheetsData;
    } else {
        console.log('⚠️ 빈칸채우기 데모 데이터를 사용합니다.');
        return readingFillBlanksDataDemo;
    }
}

// 데모 데이터 (Google Sheets가 없을 때 사용)
const readingFillBlanksDataDemo = {
    type: 'fill_blanks',
    timeLimit: 180,
    
    sets: [
        {
            id: 'fb_set_1',
            title: 'Fill in the missing letters in the paragraph.',
            passage: `We know from drawings that have been preserved in caves for over 10,000 years that early humans performed dances as a group activity. We mi___ think th__ prehistoric peo___ concentrated on__ on ba___ survival. How____, it is clear fr__ the rec____ that dan____ was important to them. They recorded more drawings of dances than any other group activity. Dances served various purposes, including ritualistic communication with the div___, storytelling, and social cohesion.`,
            blanks: [
                { id: 1, startIndex: 157, prefix: 'mi', answer: 'ght', blankCount: 3, explanation: '"might"는 추측을 나타내는 조동사로, "~일지도 모른다"는 의미입니다.', commonMistakes: 'may, can, could', mistakesExplanation: '추측의 정도 차이를 혼동하기 쉽습니다. might는 가장 약한 추측을 나타냅니다.' },
                { id: 2, startIndex: 172, prefix: 'th', answer: 'at', blankCount: 2, explanation: '"that"은 종속절을 이끄는 접속사로 사용되었습니다.', commonMistakes: '', mistakesExplanation: '' },
                { id: 3, startIndex: 189, prefix: 'peo', answer: 'ple', blankCount: 3, explanation: '"people"은 "사람들"을 의미하는 명사입니다.', commonMistakes: '', mistakesExplanation: '' },
                { id: 4, startIndex: 218, prefix: 'on', answer: 'ly', blankCount: 2, explanation: '"only"는 "오직, 단지"를 의미하는 부사입니다.', commonMistakes: '', mistakesExplanation: '' },
                { id: 5, startIndex: 228, prefix: 'ba', answer: 'sic', blankCount: 3, explanation: '"basic"은 "기본적인"을 의미하는 형용사입니다.', commonMistakes: 'base, basis', mistakesExplanation: 'base(명사: 기반)나 basis(명사: 근거)와 혼동하지 않도록 주의하세요.' },
                { id: 6, startIndex: 248, prefix: 'How', answer: 'ever', blankCount: 4, explanation: '"However"는 "그러나"를 의미하는 접속부사로, 앞 문장과 대조되는 내용을 이어줍니다.', commonMistakes: '', mistakesExplanation: '' },
                { id: 7, startIndex: 274, prefix: 'fr', answer: 'om', blankCount: 2, explanation: '"from"은 출처나 근거를 나타내는 전치사입니다.', commonMistakes: '', mistakesExplanation: '' },
                { id: 8, startIndex: 285, prefix: 'rec', answer: 'ords', blankCount: 4, explanation: '"records"는 "기록"을 의미하는 명사로, 역사적 증거를 나타냅니다.', commonMistakes: '', mistakesExplanation: '' },
                { id: 9, startIndex: 299, prefix: 'dan', answer: 'cing', blankCount: 4, explanation: '"dancing"은 "춤추기"를 의미하는 동명사입니다.', commonMistakes: '', mistakesExplanation: '' },
                { id: 10, startIndex: 430, prefix: 'div', answer: 'ine', blankCount: 3, explanation: '"divine"은 "신성한"을 의미하는 형용사로, 종교적 의식을 나타냅니다.', commonMistakes: '', mistakesExplanation: '' }
            ]
        },
        {
            id: 'fb_set_2',
            title: 'Fill in the missing letters in the paragraph.',
            passage: `Climate change is one of the most pre_____ issues facing our pla___ today. Scientists ag___ that human act_______ are the primary cau__ of global war____. The bur____ of fossil fue__ releases greenhouse gas__ into the atmosphere, tra_____ heat and raising temperatures worldwide.`,
            blanks: [
                { id: 1, startIndex: 42, prefix: 'pre', answer: 'ssing', blankCount: 5, explanation: '"pressing"은 "긴급한, 시급한"을 의미하는 형용사입니다.', commonMistakes: 'pressing, present', mistakesExplanation: '이중 자음 ss를 빠뜨리거나 present와 혼동하기 쉽습니다.' },
                { id: 2, startIndex: 67, prefix: 'pla', answer: 'net', blankCount: 3, explanation: '"planet"은 "행성"을 의미하며, 여기서는 지구를 가리킵니다.', commonMistakes: '', mistakesExplanation: '' },
                { id: 3, startIndex: 89, prefix: 'ag', answer: 'ree', blankCount: 3, explanation: '"agree"는 "동의하다"를 의미하는 동사입니다.', commonMistakes: '', mistakesExplanation: '' },
                { id: 4, startIndex: 105, prefix: 'act', answer: 'ivities', blankCount: 7, explanation: '"activities"는 "활동"을 의미하는 명사의 복수형입니다.', commonMistakes: '', mistakesExplanation: '' },
                { id: 5, startIndex: 133, prefix: 'cau', answer: 'se', blankCount: 2, explanation: '"cause"는 "원인"을 의미하는 명사입니다.', commonMistakes: '', mistakesExplanation: '' },
                { id: 6, startIndex: 150, prefix: 'war', answer: 'ming', blankCount: 4, explanation: '"warming"은 "온난화"를 의미하는 명사로, global warming은 지구 온난화를 뜻합니다.', commonMistakes: '', mistakesExplanation: '' },
                { id: 7, startIndex: 160, prefix: 'bur', answer: 'ning', blankCount: 4, explanation: '"burning"은 "연소"를 의미하는 동명사입니다.', commonMistakes: '', mistakesExplanation: '' },
                { id: 8, startIndex: 178, prefix: 'fue', answer: 'ls', blankCount: 2, explanation: '"fuels"는 "연료"를 의미하는 명사의 복수형입니다.', commonMistakes: '', mistakesExplanation: '' },
                { id: 9, startIndex: 203, prefix: 'gas', answer: 'es', blankCount: 2, explanation: '"gases"는 "기체"를 의미하는 명사의 복수형입니다.', commonMistakes: '', mistakesExplanation: '' },
                { id: 10, startIndex: 233, prefix: 'tra', answer: 'pping', blankCount: 5, explanation: '"trapping"은 "가두다"를 의미하는 동명사로, 열을 가두는 현상을 설명합니다.', commonMistakes: 'traping, trapin', mistakesExplanation: 'p를 하나만 쓰거나 -ing를 빠뜨리는 실수가 많습니다.' }
            ]
        }
    ]
};

// 실제 사용할 데이터
let readingFillBlanksData = readingFillBlanksDataDemo;

// 빈칸채우기 사용자 답안 저장
let fillBlanksAnswers = {};

// 페이지 로드 시 데이터 초기화
async function initFillBlanksDataOnLoad() {
    readingFillBlanksData = await loadFillBlanksData();
    // ✅ Google Sheets 데이터를 window에도 업데이트
    window.readingFillBlanksData = readingFillBlanksData;
    console.log('✅ [FillBlanks] window.readingFillBlanksData 업데이트 완료:', readingFillBlanksData.sets.map(s => s.id));
}

// 전역으로 노출
window.readingFillBlanksData = readingFillBlanksData;

// 자동 실행 (선택사항)
// window.addEventListener('DOMContentLoaded', initFillBlanksDataOnLoad);
