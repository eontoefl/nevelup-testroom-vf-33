// Reading - 일상리딩2 (Daily Reading 2) 데이터 구조
// v3 - Supabase 우선 → Google Sheets 폴백 방식

// Google Sheets 설정 (폴백용)
const DAILY2_SHEET_CONFIG = { spreadsheetId: '12EmtpZUXLyqyHH8iFfBiBgw7DVzP15LUWcIEaQLuOfY', sheetGid: '840514208' };

// ========== Supabase → Google Sheets 폴백 ==========
async function fetchDaily2FromSheet() {
    // 1) Supabase 우선 시도
    const supabaseResult = await _fetchDaily2FromSupabase();
    if (supabaseResult) return supabaseResult;
    
    // 2) 실패 시 Google Sheets 폴백
    console.log('🔄 [Daily2] Google Sheets 폴백 시도...');
    return await _fetchDaily2FromGoogleSheets();
}

// --- Supabase에서 로드 ---
async function _fetchDaily2FromSupabase() {
    if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) {
        console.log('📋 [Daily2] Supabase 비활성화 → 건너뜀');
        return null;
    }
    if (typeof supabaseSelect !== 'function') {
        console.warn('⚠️ [Daily2] supabaseSelect 함수 없음 → 건너뜀');
        return null;
    }
    
    try {
        console.log('📥 [Daily2] Supabase에서 데이터 로드...');
        const rows = await supabaseSelect('tr_reading_daily2', 'select=*&order=id.asc');
        
        if (!rows || rows.length === 0) {
            console.warn('⚠️ [Daily2] Supabase 데이터 없음');
            return null;
        }
        
        console.log(`✅ [Daily2] Supabase에서 ${rows.length}개 세트 로드 성공`);
        
        const sets = rows.map(row => {
            const translations = row.sentence_translations ? row.sentence_translations.split('##') : [];
            
            const interactiveWordsList = [];
            if (row.interactive_words) {
                row.interactive_words.split('##').forEach(wordStr => {
                    const parts = wordStr.split('::');
                    if (parts.length >= 2) {
                        interactiveWordsList.push({
                            word: parts[0].trim(),
                            translation: parts[1].trim(),
                            explanation: parts.length >= 3 ? parts[2].trim() : ''
                        });
                    }
                });
            }
            
            const question1 = parseDaily2QuestionData(row.question1);
            const question2 = parseDaily2QuestionData(row.question2);
            const question3 = parseDaily2QuestionData(row.question3);
            const questions = [];
            if (question1) questions.push(question1);
            if (question2) questions.push(question2);
            if (question3) questions.push(question3);
            
            return {
                id: row.id,
                mainTitle: row.main_title,
                passage: {
                    title: row.passage_title,
                    content: row.passage_content,
                    translations,
                    interactiveWords: interactiveWordsList
                },
                questions
            };
        });
        
        return { type: 'daily_reading_2', timeLimit: 80, sets };
        
    } catch (error) {
        console.error('❌ [Daily2] Supabase 로드 실패:', error);
        return null;
    }
}

// --- Google Sheets에서 로드 (원본 코드) ---
async function _fetchDaily2FromGoogleSheets() {
    try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${DAILY2_SHEET_CONFIG.spreadsheetId}/export?format=csv&gid=${DAILY2_SHEET_CONFIG.sheetGid}`;
        console.log('📥 [Daily2] Google Sheets CSV URL:', csvUrl);
        
        const response = await fetch(csvUrl);
        if (!response.ok) {
            console.warn('⚠️ [Daily2] Google Sheets HTTP 에러:', response.status);
            return null;
        }
        
        const csvText = await response.text();
        console.log(`✅ [Daily2] Google Sheets CSV 다운로드 완료 (${csvText.length} bytes)`);
        
        return parseDaily2CSV(csvText);
        
    } catch (error) {
        console.error('❌ [Daily2] Google Sheets 로드 실패:', error);
        return null;
    }
}

// 문제 데이터 파싱 (Q번호::문제원문::문제해석::정답번호::보기데이터##보기데이터...)
function parseDaily2QuestionData(questionStr) {
    console.log('🔍 [일상리딩2] 문제 파싱 시작:', questionStr.substring(0, 100) + '...');
    
    if (!questionStr || questionStr.trim() === '') {
        console.warn('⚠️ [일상리딩2] 문제 데이터가 비어있습니다');
        return null;
    }
    
    const parts = questionStr.split('::');
    console.log('📊 [일상리딩2] 분할된 파트 개수:', parts.length);
    
    if (parts.length < 5) {
        console.error('❌ [일상리딩2] 파트가 5개 미만입니다');
        return null;
    }
    
    const questionNum = parts[0].trim();
    const questionText = parts[1].trim();
    const questionTranslation = parts[2].trim();
    const correctAnswer = parseInt(parts[3].trim());
    
    // 5번째 요소부터 끝까지 전부 합치기 (보기 설명에 ::가 포함될 수 있음)
    const optionsStr = parts.slice(4).join('::').trim();
    
    console.log('✅ [일상리딩2] 문제 번호:', questionNum);
    console.log('✅ [일상리딩2] 보기 문자열 (전체):', optionsStr.substring(0, 150) + '...');
    
    // 보기 파싱 (A)보기원문::보기해석::보기설명##B)...)
    const optionParts = optionsStr.split('##');
    console.log('📝 [일상리딩2] 보기 개수:', optionParts.length);
    
    const options = optionParts.map((optStr, idx) => {
        const optParts = optStr.split('::');
        console.log(`  보기 ${idx + 1} 파트 개수:`, optParts.length);
        
        if (optParts.length < 3) {
            console.warn(`  ⚠️ 보기 ${idx + 1} 파트가 3개 미만입니다`);
            return null;
        }
        
        const optionText = optParts[0].trim();
        const optionTranslation = optParts[1].trim();
        
        // 3번째 요소부터 끝까지 전부 합치기
        const optionExplanation = optParts.slice(2).join('::').trim();
        
        const match = optionText.match(/^([A-D])\)(.*)/);
        if (!match) {
            console.warn(`  ⚠️ 보기 ${idx + 1} 형식이 잘못됨:`, optionText);
            return null;
        }
        
        const result = {
            label: match[1],
            text: match[2].trim(),
            translation: optionTranslation,
            explanation: optionExplanation
        };
        
        console.log(`  ✅ 보기 ${idx + 1} 파싱 완료`);
        return result;
    }).filter(opt => opt !== null);
    
    console.log('🎯 [일상리딩2] 최종 파싱된 보기 개수:', options.length);
    
    return {
        questionNum,
        question: questionText,
        questionTranslation,
        correctAnswer,
        options
    };
}

// CSV를 일상리딩2 데이터로 변환
function parseDaily2CSV(csvText) {
    console.log('📄 [일상리딩2] CSV 원본 (첫 500자):', csvText.substring(0, 500));
    
    const lines = csvText.trim().split('\n');
    console.log('📊 [일상리딩2] 총 라인 수:', lines.length);
    
    const sets = [];
    
    // 첫 줄은 헤더이므로 건너뛰기
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        console.log(`\n🔍 [일상리딩2] 라인 ${i} 원본:`, line.substring(0, 100) + '...');
        
        const values = parseCSVLine(line);
        console.log(`📦 [일상리딩2] 파싱된 values 개수:`, values.length);
        
        if (values.length >= 9) {
            let setId = values[0].trim();
            let mainTitle = values[1].trim();
            let passageTitle = values[2].trim();
            let passageContent = values[3].trim();
            let sentenceTranslations = values[4].trim();
            let interactiveWords = values[5].trim();
            let question1Str = values[6].trim();
            let question2Str = values[7].trim();
            let question3Str = values[8].trim(); // 일상리딩2는 문제 3개
            
            // ✅ 빈 행 스킵 (setId가 비어있으면 무시)
            if (!setId) {
                continue;
            }
            
            // CSV 파싱 시 따옴표로 감싸진 경우 제거 및 이스케이프 처리
            const removeQuotes = (str) => {
                if (str.startsWith('"') && str.endsWith('"')) {
                    str = str.slice(1, -1);
                    str = str.replace(/""/g, '"');
                }
                return str;
            };
            
            setId = removeQuotes(setId);
            mainTitle = removeQuotes(mainTitle);
            passageTitle = removeQuotes(passageTitle);
            passageContent = removeQuotes(passageContent);
            sentenceTranslations = removeQuotes(sentenceTranslations);
            interactiveWords = removeQuotes(interactiveWords);
            question1Str = removeQuotes(question1Str);
            question2Str = removeQuotes(question2Str);
            question3Str = removeQuotes(question3Str);
            
            console.log('📦 [일상리딩2] 파싱된 문제 1 문자열:', question1Str.substring(0, 80) + '...');
            console.log('📦 [일상리딩2] 파싱된 문제 2 문자열:', question2Str.substring(0, 80) + '...');
            console.log('📦 [일상리딩2] 파싱된 문제 3 문자열:', question3Str.substring(0, 80) + '...');
            
            // 문장별 해석 파싱
            const translations = sentenceTranslations ? sentenceTranslations.split('##') : [];
            
            // 인터랙티브 단어 파싱
            const interactiveWordsList = [];
            if (interactiveWords) {
                const wordParts = interactiveWords.split('##');
                wordParts.forEach(wordStr => {
                    const parts = wordStr.split('::');
                    if (parts.length >= 2) {
                        interactiveWordsList.push({
                            word: parts[0].trim(),
                            translation: parts[1].trim(),
                            explanation: parts.length >= 3 ? parts[2].trim() : ''
                        });
                    }
                });
            }
            
            // 문제 파싱
            const question1 = parseDaily2QuestionData(question1Str);
            const question2 = parseDaily2QuestionData(question2Str);
            const question3 = parseDaily2QuestionData(question3Str);
            
            const questions = [];
            if (question1) questions.push(question1);
            if (question2) questions.push(question2);
            if (question3) questions.push(question3);
            
            // ✅ Set ID 강제 정규화: daily2_set_1 → daily2_set_0001
            if (setId) {
                const match = setId.match(/daily2_set_(\d+)/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    setId = `daily2_set_${String(num).padStart(4, '0')}`;
                    console.log(`  ✅ Set ID 정규화: ${match[0]} → ${setId}`);
                }
            }
            
            sets.push({
                id: setId,
                mainTitle: mainTitle,
                passage: {
                    title: passageTitle,
                    content: passageContent,
                    translations: translations,
                    interactiveWords: interactiveWordsList
                },
                questions: questions
            });
        }
    }
    
    // ✅ Set ID 기준으로 정렬 (daily2_set_0001, daily2_set_0002, ...)
    console.log('🔄 [Daily2] 정렬 전 순서:', sets.map(s => s.id));
    
    sets.sort((a, b) => {
        // daily2_set_ 뒤의 숫자만 추출
        const numA = parseInt(a.id.replace('daily2_set_', ''));
        const numB = parseInt(b.id.replace('daily2_set_', ''));
        console.log(`  정렬 비교: ${a.id} (${numA}) vs ${b.id} (${numB}) → ${numA - numB}`);
        return numA - numB;
    });
    
    console.log('📊 [Daily2] 정렬 후 순서:', sets.map(s => s.id));
    console.log('📊 [Daily2] 최종 데이터 검증:');
    sets.forEach((set, idx) => {
        console.log(`  [${idx}] ${set.id} - ${set.mainTitle} - ${set.questions.length}문제`);
    });
    
    return {
        type: 'daily_reading_2',
        timeLimit: 80, // 1분 20초
        sets: sets
    };
}

// CSV 라인 파싱 헬퍼 함수 (쉼표 구분, 따옴표 처리)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
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

// ✅ 데이터 캐시 (정렬된 데이터를 메모리에 저장)
let cachedDaily2Data = null;

// 🔧 캐시 강제 초기화 함수 (디버깅용)
window.clearDaily2Cache = function() {
    cachedDaily2Data = null;
    console.log('🗑️ Daily2 캐시 초기화 완료');
};

// Google Sheets에서 데이터 로드 또는 데모 데이터 사용
async function loadDaily2Data(forceReload = false) {
    console.log('🔄 [loadDaily2Data] 시작 (forceReload:', forceReload, ')');
    
    // 강제 리로드가 아니고 캐시가 있으면 재사용
    if (!forceReload && cachedDaily2Data) {
        console.log('✅ [loadDaily2Data] 캐시된 데이터 사용');
        console.log('📊 [loadDaily2Data] 캐시 데이터 세트 순서:', cachedDaily2Data.sets.map(s => s.id));
        console.log('📊 [loadDaily2Data] 캐시 데이터 상세:');
        cachedDaily2Data.sets.forEach((set, idx) => {
            console.log(`  [${idx}] ${set.id} | ${set.mainTitle} | ${set.questions.length}문제`);
        });
        return cachedDaily2Data;
    }
    
    console.log('📥 Google Sheets에서 새로 데이터 로드 중...');
    const sheetsData = await fetchDaily2FromSheet();
    
    if (sheetsData && sheetsData.sets.length > 0) {
        console.log('✅ Google Sheets에서 일상리딩2 데이터를 불러왔습니다.');
        console.log('📊 [loadDaily2Data] 반환 데이터 세트 순서:', sheetsData.sets.map(s => s.id));
        console.log('📊 [loadDaily2Data] 반환 데이터 상세:');
        sheetsData.sets.forEach((set, idx) => {
            console.log(`  [${idx}] ${set.id} | ${set.mainTitle} | ${set.questions.length}문제 | Q1: ${set.questions[0]?.question.substring(0, 50)}`);
        });
        cachedDaily2Data = sheetsData; // 캐시 저장
        return sheetsData;
    } else {
        console.log('⚠️ 일상리딩2 데모 데이터를 사용합니다.');
        return readingDaily2DataDemo;
    }
}

// 데모 데이터 (Google Sheets가 없을 때 사용)
const readingDaily2DataDemo = {
    type: 'daily_reading_2',
    timeLimit: 80,
    
    sets: [
        {
            id: 'daily2_set_1',
            mainTitle: 'Read a social media post.',
            passage: {
                title: 'Sofia Baker',
                content: 'Every Saturday our local farmer\'s market is the place to be! Fresh fruits, veggies, homemade cheeses, and unique crafts await you. The Thompson family\'s organic produce is a must-try. Don\'t miss the bakery stall—get there early for the best bread and pastries. In addition to food, the market sells handmade crafts. Plus, enjoy live music while you shop!',
                translations: [
                    '매주 토요일 우리 지역 파머스 마켓이 최고입니다!',
                    '신선한 과일, 채소, 수제 치즈, 그리고 독특한 공예품이 여러분을 기다립니다.',
                    '톰슨 가족의 유기농 농산물은 꼭 먹어봐야 합니다.',
                    '빵집 가판대를 놓치지 마세요—최고의 빵과 페이스트리를 위해 일찍 가세요.',
                    '음식 외에도 시장에서는 수제 공예품을 판매합니다.',
                    '게다가 쇼핑하는 동안 라이브 음악을 즐기세요!'
                ],
                interactiveWords: [
                    { word: 'organic', translation: '유기농의', explanation: '화학 비료나 농약을 사용하지 않고 재배한' },
                    { word: 'crafts', translation: '공예품', explanation: '손으로 만든 예술 작품이나 장식품' },
                    { word: 'pastries', translation: '페이스트리', explanation: '빵과 과자류를 통칭하는 말' }
                ]
            },
            questions: [
                {
                    questionNum: 'Q1',
                    question: 'What is the main purpose of the post?',
                    questionTranslation: '이 게시물의 주요 목적은 무엇인가요?',
                    correctAnswer: 2,
                    options: [
                        {
                            label: 'A',
                            text: 'To explain the benefits of organic farming',
                            translation: '유기농 농업의 이점을 설명하기 위해',
                            explanation: '게시물은 유기농 농업에 대해 자세히 설명하지 않고 시장의 다양한 제품을 소개합니다.'
                        },
                        {
                            label: 'B',
                            text: 'To describe the variety of products available at the farmer\'s market',
                            translation: '파머스 마켓에서 구할 수 있는 다양한 제품을 설명하기 위해',
                            explanation: '게시물은 과일, 채소, 치즈, 빵, 공예품 등 시장에서 판매하는 다양한 제품을 소개하고 있습니다. 이것이 주요 목적입니다.'
                        },
                        {
                            label: 'C',
                            text: 'To compare different farmer\'s markets in the area',
                            translation: '지역의 다른 파머스 마켓을 비교하기 위해',
                            explanation: '게시물에서는 다른 시장과의 비교는 언급되지 않습니다.'
                        },
                        {
                            label: 'D',
                            text: 'To offer advice on starting a stall at the farmer\'s market',
                            translation: '파머스 마켓에서 가판대를 시작하는 방법에 대한 조언을 제공하기 위해',
                            explanation: '게시물은 방문자에게 정보를 제공하는 것이지 판매자에게 조언하는 것이 아닙니다.'
                        }
                    ]
                },
                {
                    questionNum: 'Q2',
                    question: 'What is mentioned about the Thompson family?',
                    questionTranslation: '톰슨 가족에 대해 언급된 것은 무엇인가요?',
                    correctAnswer: 2,
                    options: [
                        {
                            label: 'A',
                            text: 'They sell baked goods',
                            translation: '그들은 구운 제품을 판매합니다',
                            explanation: '빵집 가판대는 별도로 언급되며 톰슨 가족과는 연결되지 않습니다.'
                        },
                        {
                            label: 'B',
                            text: 'They offer organic produce',
                            translation: '그들은 유기농 농산물을 제공합니다',
                            explanation: '게시물에 "The Thompson family\'s organic produce is a must-try"라고 명시되어 있습니다.'
                        },
                        {
                            label: 'C',
                            text: 'They play live music',
                            translation: '그들은 라이브 음악을 연주합니다',
                            explanation: '라이브 음악은 언급되지만 톰슨 가족과는 관련이 없습니다.'
                        },
                        {
                            label: 'D',
                            text: 'They make handmade crafts',
                            translation: '그들은 수제 공예품을 만듭니다',
                            explanation: '수제 공예품은 언급되지만 톰슨 가족이 만드는 것은 아닙니다.'
                        }
                    ]
                },
                {
                    questionNum: 'Q3',
                    question: 'According to the post, what should visitors do to get the best bread?',
                    questionTranslation: '게시물에 따르면 방문자가 최고의 빵을 얻으려면 무엇을 해야 하나요?',
                    correctAnswer: 2,
                    options: [
                        {
                            label: 'A',
                            text: 'Order in advance',
                            translation: '미리 주문하기',
                            explanation: '사전 주문에 대한 언급은 없습니다.'
                        },
                        {
                            label: 'B',
                            text: 'Arrive early',
                            translation: '일찍 도착하기',
                            explanation: '게시물에 "get there early for the best bread"라고 명시되어 있습니다.'
                        },
                        {
                            label: 'C',
                            text: 'Visit on Sunday',
                            translation: '일요일에 방문하기',
                            explanation: '시장은 토요일에 열린다고 했으므로 일요일은 틀렸습니다.'
                        },
                        {
                            label: 'D',
                            text: 'Bring their own bags',
                            translation: '자신의 가방을 가져오기',
                            explanation: '가방에 대한 언급은 게시물에 없습니다.'
                        }
                    ]
                }
            ]
        }
    ]
};

// 실제 사용할 데이터
let readingDaily2Data = readingDaily2DataDemo;

// 일상리딩2 사용자 답안 저장
let daily2Answers = {};

// 페이지 로드 시 데이터 초기화
async function initDaily2DataOnLoad() {
    readingDaily2Data = await loadDaily2Data();
}
