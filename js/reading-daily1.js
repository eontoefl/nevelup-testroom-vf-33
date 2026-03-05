// Reading - 일상리딩1 (Daily Reading 1) 데이터 구조
// v3 - Supabase 우선 → Google Sheets 폴백 방식

// Google Sheets 설정 (폴백용)
const DAILY1_SHEET_CONFIG = { spreadsheetId: '12EmtpZUXLyqyHH8iFfBiBgw7DVzP15LUWcIEaQLuOfY', sheetGid: '1189725287' };

// ========== Supabase → Google Sheets 폴백 ==========
async function fetchDaily1FromSheet() {
    // 1) Supabase 우선 시도
    const supabaseResult = await _fetchDaily1FromSupabase();
    if (supabaseResult) return supabaseResult;
    
    // 2) 실패 시 Google Sheets 폴백
    console.log('🔄 [Daily1] Google Sheets 폴백 시도...');
    return await _fetchDaily1FromGoogleSheets();
}

// --- Supabase에서 로드 ---
async function _fetchDaily1FromSupabase() {
    if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) {
        console.log('📋 [Daily1] Supabase 비활성화 → 건너뜀');
        return null;
    }
    if (typeof supabaseSelect !== 'function') {
        console.warn('⚠️ [Daily1] supabaseSelect 함수 없음 → 건너뜀');
        return null;
    }
    
    try {
        console.log('📥 [Daily1] Supabase에서 데이터 로드...');
        const rows = await supabaseSelect('tr_reading_daily1', 'select=*&order=id.asc');
        
        if (!rows || rows.length === 0) {
            console.warn('⚠️ [Daily1] Supabase 데이터 없음');
            return null;
        }
        
        console.log(`✅ [Daily1] Supabase에서 ${rows.length}개 세트 로드 성공`);
        
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
            
            const question1 = parseQuestionData(row.question1);
            const question2 = parseQuestionData(row.question2);
            const questions = [];
            if (question1) questions.push(question1);
            if (question2) questions.push(question2);
            
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
        
        return { type: 'daily_reading_1', timeLimit: 60, sets };
        
    } catch (error) {
        console.error('❌ [Daily1] Supabase 로드 실패:', error);
        return null;
    }
}

// --- Google Sheets에서 로드 (원본 코드) ---
async function _fetchDaily1FromGoogleSheets() {
    try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${DAILY1_SHEET_CONFIG.spreadsheetId}/export?format=csv&gid=${DAILY1_SHEET_CONFIG.sheetGid}`;
        console.log('📥 [Daily1] Google Sheets CSV URL:', csvUrl);
        
        const response = await fetch(csvUrl);
        if (!response.ok) {
            console.warn('⚠️ [Daily1] Google Sheets HTTP 에러:', response.status);
            return null;
        }
        
        const csvText = await response.text();
        console.log(`✅ [Daily1] Google Sheets CSV 다운로드 완료 (${csvText.length} bytes)`);
        
        return parseDaily1CSV(csvText);
        
    } catch (error) {
        console.error('❌ [Daily1] Google Sheets 로드 실패:', error);
        return null;
    }
}

// 문제 데이터 파싱 (Q번호::문제원문::문제해석::정답번호::보기데이터##보기데이터...)
function parseQuestionData(questionStr) {
    console.log('🔍 문제 파싱 시작:', questionStr);
    
    if (!questionStr || questionStr.trim() === '') {
        console.warn('⚠️ 문제 데이터가 비어있습니다');
        return null;
    }
    
    const parts = questionStr.split('::');
    console.log('📊 분할된 파트 개수:', parts.length);
    console.log('📊 파트 내용:', parts);
    
    if (parts.length < 5) {
        console.error('❌ 파트가 5개 미만입니다. 최소 5개 필요 (Q번호::문제::해석::정답번호::보기들)');
        return null;
    }
    
    const questionNum = parts[0].trim(); // Q1, Q2
    const questionText = parts[1].trim();
    const questionTranslation = parts[2].trim();
    const correctAnswer = parseInt(parts[3].trim());
    
    // ✅ 중요: 5번째 요소부터 끝까지 전부 합치기 (보기 설명에 ::가 포함될 수 있음)
    const optionsStr = parts.slice(4).join('::').trim();
    
    console.log('✅ 문제 번호:', questionNum);
    console.log('✅ 문제 원문:', questionText);
    console.log('✅ 문제 해석:', questionTranslation);
    console.log('✅ 정답 번호:', correctAnswer);
    console.log('✅ 보기 문자열 (전체):', optionsStr.substring(0, 200) + '...');
    
    // 보기 파싱 (A)보기원문::보기해석::보기설명##B)...)
    const optionParts = optionsStr.split('##');
    console.log('📝 보기 개수:', optionParts.length);
    
    const options = optionParts.map((optStr, idx) => {
        console.log(`  보기 ${idx + 1} 원본:`, optStr.substring(0, 100) + '...');
        
        const optParts = optStr.split('::');
        console.log(`  보기 ${idx + 1} 파트 개수:`, optParts.length);
        
        if (optParts.length < 3) {
            console.warn(`  ⚠️ 보기 ${idx + 1} 파트가 3개 미만입니다 (필요: 원문::해석::설명)`);
            return null;
        }
        
        const optionText = optParts[0].trim(); // A)Free yoga classes
        const optionTranslation = optParts[1].trim();
        
        // ✅ 중요: 3번째 요소부터 끝까지 전부 합치기 (설명에 ::가 포함될 수 있음)
        const optionExplanation = optParts.slice(2).join('::').trim();
        
        // A), B) 등에서 레이블 추출
        const match = optionText.match(/^([A-D])\)(.*)/);
        if (!match) {
            console.warn(`  ⚠️ 보기 ${idx + 1} 형식이 잘못됨:`, optionText, '(예상: A)텍스트)');
            return null;
        }
        
        const result = {
            label: match[1], // A, B, C, D
            text: match[2].trim(),
            translation: optionTranslation,
            explanation: optionExplanation
        };
        
        console.log(`  ✅ 보기 ${idx + 1} 파싱 완료:`, result);
        return result;
    }).filter(opt => opt !== null);
    
    console.log('🎯 최종 파싱된 보기 개수:', options.length);
    
    return {
        questionNum,
        question: questionText,
        questionTranslation,
        correctAnswer,
        options
    };
}

// CSV를 일상리딩1 데이터로 변환
function parseDaily1CSV(csvText) {
    console.log('📄 CSV 원본 (첫 500자):', csvText.substring(0, 500));
    
    const lines = csvText.trim().split('\n');
    console.log('📊 총 라인 수:', lines.length);
    
    const sets = [];
    
    // 첫 줄은 헤더이므로 건너뛰기
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        console.log(`\n🔍 라인 ${i} 원본:`, line);
        
        const values = parseCSVLine(line);
        console.log(`📦 파싱된 values 개수:`, values.length);
        values.forEach((val, idx) => {
            console.log(`  [${idx}]: ${val.substring(0, 100)}${val.length > 100 ? '...' : ''}`);
        });
        
        if (values.length >= 8) {
            let setId = values[0].trim();
            let mainTitle = values[1].trim();
            let passageTitle = values[2].trim();
            let passageContent = values[3].trim();
            let sentenceTranslations = values[4].trim(); // 문장별 해석 (##로 구분)
            let interactiveWords = values[5].trim(); // 인터랙티브 단어 (단어::해석::설명##...)
            let question1Str = values[6].trim();
            let question2Str = values[7].trim();
            
            // ✅ 빈 행 스킵 (setId가 비어있으면 무시)
            if (!setId) {
                continue;
            }
            
            // CSV 파싱 시 따옴표로 감싸진 경우 제거 및 이스케이프 처리
            const removeQuotes = (str) => {
                if (str.startsWith('"') && str.endsWith('"')) {
                    // 따옴표 제거
                    str = str.slice(1, -1);
                    // CSV 이스케이프된 따옴표 복원 ("" -> ")
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
            
            console.log('📦 파싱된 문제 1 문자열:', question1Str.substring(0, 100) + '...');
            console.log('📦 파싱된 문제 2 문자열:', question2Str.substring(0, 100) + '...');
            
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
            const question1 = parseQuestionData(question1Str);
            const question2 = parseQuestionData(question2Str);
            
            const questions = [];
            if (question1) questions.push(question1);
            if (question2) questions.push(question2);
            
            // ✅ Set ID 강제 정규화: daily1_set_1 → daily1_set_0001
            // Google Sheets에서 어떤 형식으로 들어와도 0001 형식으로 통일
            if (setId) {
                // daily1_set_ 뒤의 숫자 추출
                const match = setId.match(/daily1_set_(\d+)/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    setId = `daily1_set_${String(num).padStart(4, '0')}`;
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
    
    // ✅ Set ID 기준으로 정렬 (daily1_set_0001, daily1_set_0002, ...)
    console.log('🔄 [Daily1] 정렬 전 순서:', sets.map(s => s.id));
    
    sets.sort((a, b) => {
        // daily1_set_ 뒤의 숫자만 추출
        const numA = parseInt(a.id.replace('daily1_set_', ''));
        const numB = parseInt(b.id.replace('daily1_set_', ''));
        console.log(`  정렬 비교: ${a.id} (${numA}) vs ${b.id} (${numB}) → ${numA - numB}`);
        return numA - numB;
    });
    
    console.log('📊 [Daily1] 정렬 후 순서:', sets.map(s => s.id));
    console.log('📊 [Daily1] 최종 데이터 검증:');
    sets.forEach((set, idx) => {
        console.log(`  [${idx}] ${set.id} - ${set.mainTitle} - ${set.questions.length}문제`);
    });
    
    return {
        type: 'daily_reading_1',
        timeLimit: 60, // 1분
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
let cachedDaily1Data = null;

// 🔧 캐시 강제 초기화 함수 (디버깅용)
window.clearDaily1Cache = function() {
    cachedDaily1Data = null;
    console.log('🗑️ Daily1 캐시 초기화 완료');
};

// Google Sheets에서 데이터 로드 또는 데모 데이터 사용
async function loadDaily1Data(forceReload = false) {
    console.log('🔄 [loadDaily1Data] 시작 (forceReload:', forceReload, ')');
    
    // 강제 리로드가 아니고 캐시가 있으면 재사용
    if (!forceReload && cachedDaily1Data) {
        console.log('✅ [loadDaily1Data] 캐시된 데이터 사용');
        console.log('📊 [loadDaily1Data] 캐시 데이터 세트 순서:', cachedDaily1Data.sets.map(s => s.id));
        console.log('📊 [loadDaily1Data] 캐시 데이터 상세:');
        cachedDaily1Data.sets.forEach((set, idx) => {
            console.log(`  [${idx}] ${set.id} | ${set.mainTitle} | ${set.questions.length}문제`);
        });
        return cachedDaily1Data;
    }
    
    console.log('📥 Google Sheets에서 새로 데이터 로드 중...');
    const sheetsData = await fetchDaily1FromSheet();
    
    if (sheetsData && sheetsData.sets.length > 0) {
        console.log('✅ Google Sheets에서 일상리딩1 데이터를 불러왔습니다.');
        console.log('📊 [loadDaily1Data] 반환 데이터 세트 순서:', sheetsData.sets.map(s => s.id));
        console.log('📊 [loadDaily1Data] 반환 데이터 상세:');
        sheetsData.sets.forEach((set, idx) => {
            console.log(`  [${idx}] ${set.id} | ${set.mainTitle} | ${set.questions.length}문제 | Q1: ${set.questions[0]?.question.substring(0, 50)}`);
        });
        cachedDaily1Data = sheetsData; // 캐시 저장
        return sheetsData;
    } else {
        console.log('⚠️ 일상리딩1 데모 데이터를 사용합니다.');
        return readingDaily1DataDemo;
    }
}

// 데모 데이터 (Google Sheets가 없을 때 사용)
const readingDaily1DataDemo = {
    type: 'daily_reading_1',
    timeLimit: 60,
    
    sets: [
        {
            id: 'daily1_set_1',
            mainTitle: 'Read a notice.',
            passage: {
                title: 'Library Renovation Notice',
                content: 'The city library will be closed for renovations from March 1st to March 15th. During this time, all materials must be returned by February 28th. Late fees will be waived for items returned during the closure period. The online catalog and e-book services will remain available. For questions, please contact us at library@city.gov or call 555-0123.',
                translations: [
                    '시립 도서관은 3월 1일부터 3월 15일까지 보수 공사로 인해 폐쇄됩니다.',
                    '이 기간 동안 모든 자료는 2월 28일까지 반납해야 합니다.',
                    '폐쇄 기간 동안 반납된 물품에 대해서는 연체료가 면제됩니다.',
                    '온라인 카탈로그와 전자책 서비스는 계속 이용 가능합니다.',
                    '문의 사항이 있으시면 library@city.gov로 이메일을 보내시거나 555-0123으로 전화주세요.'
                ],
                interactiveWords: [
                    { word: 'renovations', translation: '보수 공사', explanation: '건물이나 시설을 수리하고 개선하는 작업' },
                    { word: 'waived', translation: '면제되다', explanation: '요금이나 의무를 면제해주다는 의미' },
                    { word: 'e-book', translation: '전자책', explanation: '디지털 형태로 읽을 수 있는 책' }
                ]
            },
            questions: [
                {
                    questionNum: 'Q1',
                    question: 'When will the library reopen?',
                    questionTranslation: '도서관은 언제 다시 문을 여나요?',
                    correctAnswer: 3,
                    options: [
                        {
                            label: 'A',
                            text: 'February 28th',
                            translation: '2월 28일',
                            explanation: '이 날짜는 자료를 반납해야 하는 마감일입니다. 도서관이 문을 여는 날이 아닙니다. 날짜의 용도를 혼동하지 않도록 주의하세요.'
                        },
                        {
                            label: 'B',
                            text: 'March 1st',
                            translation: '3월 1일',
                            explanation: '이 날짜는 도서관이 폐쇄되기 시작하는 날입니다. 다시 여는 날이 아니라 공사가 시작되는 날이므로 오답입니다.'
                        },
                        {
                            label: 'C',
                            text: 'March 15th',
                            translation: '3월 15일',
                            explanation: '지문에 "closed from March 1st to March 15th"라고 나와 있습니다. \'to March 15th\'는 3월 15일까지 폐쇄된다는 의미이므로, 3월 16일부터 다시 문을 열 것입니다. 하지만 보기 중에 March 16th가 없으므로 March 15th가 폐쇄의 마지막 날이라는 점에서 정답으로 볼 수 있습니다.'
                        },
                        {
                            label: 'D',
                            text: 'March 30th',
                            translation: '3월 30일',
                            explanation: '지문에 언급되지 않은 날짜입니다. 도서관 폐쇄 기간과 관련이 없습니다.'
                        }
                    ]
                },
                {
                    questionNum: 'Q2',
                    question: 'What will remain available during the closure?',
                    questionTranslation: '폐쇄 기간 동안 무엇이 계속 이용 가능한가요?',
                    correctAnswer: 2,
                    options: [
                        {
                            label: 'A',
                            text: 'Physical book borrowing',
                            translation: '실제 책 대출',
                            explanation: '도서관이 폐쇄되는 동안에는 물리적인 책을 빌릴 수 없습니다. "will be closed"는 건물에 들어갈 수 없다는 의미이므로 실제 책 대출은 불가능합니다.'
                        },
                        {
                            label: 'B',
                            text: 'Online catalog and e-books',
                            translation: '온라인 카탈로그와 전자책',
                            explanation: '지문에 "The online catalog and e-book services will remain available"라고 명시되어 있습니다. \'remain available\'은 \'계속 이용 가능하다\'는 뜻입니다. 온라인 서비스는 건물 폐쇄와 관계없이 이용할 수 있습니다.'
                        },
                        {
                            label: 'C',
                            text: 'In-person assistance',
                            translation: '대면 지원',
                            explanation: '도서관이 폐쇄되면 직원들도 현장에 없으므로 대면 지원을 받을 수 없습니다. 전화나 이메일로만 문의가 가능합니다.'
                        },
                        {
                            label: 'D',
                            text: 'Study room reservations',
                            translation: '스터디룸 예약',
                            explanation: '건물이 폐쇄되었으므로 스터디룸도 사용할 수 없습니다. 물리적 공간 이용은 모두 불가능합니다.'
                        }
                    ]
                }
            ]
        }
    ]
};

// 실제 사용할 데이터
let readingDaily1Data = readingDaily1DataDemo;

// 일상리딩1 사용자 답안 저장
let daily1Answers = {};

// 페이지 로드 시 데이터 초기화
async function initDaily1DataOnLoad() {
    readingDaily1Data = await loadDaily1Data();
}
