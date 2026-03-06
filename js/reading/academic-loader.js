// Reading - 아카데믹리딩 (Academic Reading) 데이터 로더
// Supabase 전용 (구글 시트 폴백 제거 완료)

// ========== Supabase 데이터 로드 ==========
async function fetchAcademicFromSheet() {
    return await _fetchAcademicFromSupabase();
}

// --- Supabase에서 로드 ---
async function _fetchAcademicFromSupabase() {
    if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) {
        console.log('📋 [Academic] Supabase 비활성화 → 건너뜀');
        return null;
    }
    if (typeof supabaseSelect !== 'function') {
        console.warn('⚠️ [Academic] supabaseSelect 함수 없음 → 건너뜀');
        return null;
    }
    
    try {
        console.log('📥 [Academic] Supabase에서 데이터 로드...');
        const rows = await supabaseSelect('tr_reading_academic', 'select=*&order=id.asc');
        
        if (!rows || rows.length === 0) {
            console.warn('⚠️ [Academic] Supabase 데이터 없음');
            return null;
        }
        
        console.log(`✅ [Academic] Supabase에서 ${rows.length}개 세트 로드 성공`);
        
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
            
            const questions = [];
            [row.question1, row.question2, row.question3, row.question4, row.question5].forEach(qStr => {
                if (qStr) {
                    const q = parseAcademicQuestionData(qStr);
                    if (q) questions.push(q);
                }
            });
            
            if (questions.length !== 5) {
                console.warn(`⚠️ [Academic] ${row.id}: ${questions.length}/5 문제만 파싱됨 - 건너뜀`);
                return null;
            }
            
            return {
                id: row.id,
                mainTitle: row.main_title,
                passage: {
                    title: row.passage_title,
                    content: convertAcademicPassage(row.passage_content),
                    contentRaw: row.passage_content,  // result screen용 원시 문자열
                    translations,
                    interactiveWords: interactiveWordsList
                },
                questions
            };
        }).filter(s => s !== null);
        
        return sets; // fetchAcademicFromSheet는 sets 배열만 반환
        
    } catch (error) {
        console.error('❌ [Academic] Supabase 로드 실패:', error);
        return null;
    }
}

// 아카데믹 지문 변환 (<<text>> → 하이라이트, #||# → <br>)
function convertAcademicPassage(raw) {
    if (!raw) return '';
    return raw
        .replace(/<<([^>]+)>>/g, '<span class="highlight-word">$1</span>')
        .replace(/#\|\|#/g, '<br>');
}

// 문제 데이터 파싱 (Q번호::문제원문::문제해석::정답번호::보기데이터##보기데이터...)
function parseAcademicQuestionData(questionStr) {
    if (!questionStr || questionStr.trim() === '') {
        console.warn('⚠️ [Academic] 문제 데이터가 비어있습니다');
        return null;
    }
    
    const parts = questionStr.split('::');
    
    if (parts.length < 5) {
        console.error('❌ [Academic] 파트가 5개 미만입니다');
        return null;
    }
    
    const questionNum = parts[0].trim();
    const questionText = parts[1].trim();
    const questionTranslation = parts[2].trim();
    const correctAnswer = parseInt(parts[3].trim());
    
    // 5번째 요소부터 끝까지 전부 합치기 (보기 설명에 ::가 포함될 수 있음)
    const optionsStr = parts.slice(4).join('::').trim();
    
    // 보기 파싱 (A)보기원문::보기해석::보기설명##B)...)
    const optionParts = optionsStr.split('##');
    
    const options = optionParts.map((optStr, idx) => {
        const optParts = optStr.split('::');
        
        if (optParts.length < 3) {
            console.warn(`  ⚠️ [Academic] 보기 ${idx + 1} 파트가 3개 미만입니다`);
            return null;
        }
        
        const optionText = optParts[0].trim();
        const optionTranslation = optParts[1].trim();
        const optionExplanation = optParts.slice(2).join('::').trim();
        
        const match = optionText.match(/^([A-D])\)(.*)/);
        if (!match) {
            console.warn(`  ⚠️ [Academic] 보기 ${idx + 1} 형식이 잘못됨:`, optionText);
            return null;
        }
        
        return {
            label: match[1],
            text: match[2].trim(),
            translation: optionTranslation,
            explanation: optionExplanation
        };
    }).filter(opt => opt !== null);
    
    return {
        questionNum,
        question: questionText,
        questionTranslation,
        correctAnswer,
        options
    };
}

// 데모 데이터 (Supabase 로드 실패 시 사용)
const readingAcademicDataDemo = {
    type: 'academic_reading',
    timeLimit: 120, // 120초 (2분) - 세트마다
    sets: [
        {
            id: 'academic_set_1',
            mainTitle: 'Read an academic passage about climate change.',
            passage: {
                title: 'The Effects of Climate Change on Ocean Ecosystems',
                content: 'Climate change is having profound effects on ocean ecosystems worldwide. Rising temperatures are causing coral bleaching events to occur more frequently. Many fish species are migrating to cooler waters. Ocean acidification is threatening shellfish populations. Scientists warn that without immediate action, these changes could become irreversible.',
                translations: [
                    '기후 변화는 전 세계 해양 생태계에 심각한 영향을 미치고 있습니다.',
                    '상승하는 온도는 산호 백화 현상을 더 자주 발생시키고 있습니다.',
                    '많은 어종들이 더 차가운 물로 이동하고 있습니다.',
                    '해양 산성화는 조개류 개체수를 위협하고 있습니다.',
                    '과학자들은 즉각적인 조치가 없으면 이러한 변화가 돌이킬 수 없게 될 수 있다고 경고합니다.'
                ],
                interactiveWords: [
                    { word: 'profound', translation: '심각한', explanation: '매우 깊고 중요한 영향을 의미합니다.' },
                    { word: 'coral bleaching', translation: '산호 백화', explanation: '산호가 하얗게 변하는 현상으로 스트레스의 신호입니다.' },
                    { word: 'acidification', translation: '산성화', explanation: '바다가 더 산성으로 변하는 현상입니다.' }
                ]
            },
            questions: [
                {
                    questionNum: 'Q1',
                    question: 'What is the main topic of the passage?',
                    questionTranslation: '지문의 주요 주제는 무엇인가요?',
                    correctAnswer: 1,
                    options: [
                        {
                            label: 'A',
                            text: 'The effects of climate change on ocean ecosystems',
                            translation: '기후 변화가 해양 생태계에 미치는 영향',
                            explanation: '지문 전체가 기후 변화가 해양 생태계에 미치는 다양한 영향을 설명하고 있습니다.'
                        },
                        {
                            label: 'B',
                            text: 'How to prevent ocean pollution',
                            translation: '해양 오염을 방지하는 방법',
                            explanation: '지문은 오염 방지가 아니라 기후 변화의 영향에 초점을 맞추고 있습니다.'
                        },
                        {
                            label: 'C',
                            text: 'The life cycle of coral reefs',
                            translation: '산호초의 생명 주기',
                            explanation: '산호 백화는 언급되지만 생명 주기는 주제가 아닙니다.'
                        },
                        {
                            label: 'D',
                            text: 'Fish migration patterns',
                            translation: '물고기 이동 패턴',
                            explanation: '물고기 이동은 한 예시일 뿐 주요 주제가 아닙니다.'
                        }
                    ]
                },
                {
                    questionNum: 'Q2',
                    question: 'According to the passage, what is causing coral bleaching?',
                    questionTranslation: '지문에 따르면 산호 백화를 일으키는 원인은 무엇인가요?',
                    correctAnswer: 2,
                    options: [
                        {
                            label: 'A',
                            text: 'Ocean pollution',
                            translation: '해양 오염',
                            explanation: '지문에서 오염은 언급되지 않았습니다.'
                        },
                        {
                            label: 'B',
                            text: 'Rising temperatures',
                            translation: '상승하는 온도',
                            explanation: '지문에 "Rising temperatures are causing coral bleaching"이라고 명시되어 있습니다.'
                        },
                        {
                            label: 'C',
                            text: 'Overfishing',
                            translation: '과도한 어획',
                            explanation: '과도한 어획은 지문에서 다루지 않았습니다.'
                        },
                        {
                            label: 'D',
                            text: 'Plastic waste',
                            translation: '플라스틱 쓰레기',
                            explanation: '플라스틱 쓰레기는 언급되지 않았습니다.'
                        }
                    ]
                },
                {
                    questionNum: 'Q3',
                    question: 'What are fish species doing in response to temperature changes?',
                    questionTranslation: '온도 변화에 대응하여 어종들은 무엇을 하고 있나요?',
                    correctAnswer: 3,
                    options: [
                        {
                            label: 'A',
                            text: 'They are reproducing more',
                            translation: '더 많이 번식하고 있다',
                            explanation: '번식에 대한 언급은 없습니다.'
                        },
                        {
                            label: 'B',
                            text: 'They are becoming extinct',
                            translation: '멸종되고 있다',
                            explanation: '멸종은 직접적으로 언급되지 않았습니다.'
                        },
                        {
                            label: 'C',
                            text: 'They are migrating to cooler waters',
                            translation: '더 차가운 물로 이동하고 있다',
                            explanation: '지문에 "Many fish species are migrating to cooler waters"라고 명시되어 있습니다.'
                        },
                        {
                            label: 'D',
                            text: 'They are changing their diet',
                            translation: '식단을 바꾸고 있다',
                            explanation: '식단 변화는 언급되지 않았습니다.'
                        }
                    ]
                },
                {
                    questionNum: 'Q4',
                    question: 'What is threatening shellfish populations?',
                    questionTranslation: '조개류 개체수를 위협하는 것은 무엇인가요?',
                    correctAnswer: 2,
                    options: [
                        {
                            label: 'A',
                            text: 'Predators',
                            translation: '포식자',
                            explanation: '포식자는 언급되지 않았습니다.'
                        },
                        {
                            label: 'B',
                            text: 'Ocean acidification',
                            translation: '해양 산성화',
                            explanation: '지문에 "Ocean acidification is threatening shellfish populations"라고 명시되어 있습니다.'
                        },
                        {
                            label: 'C',
                            text: 'Habitat loss',
                            translation: '서식지 손실',
                            explanation: '서식지 손실은 직접적으로 언급되지 않았습니다.'
                        },
                        {
                            label: 'D',
                            text: 'Disease',
                            translation: '질병',
                            explanation: '질병은 언급되지 않았습니다.'
                        }
                    ]
                },
                {
                    questionNum: 'Q5',
                    question: 'What do scientists warn about?',
                    questionTranslation: '과학자들은 무엇에 대해 경고하나요?',
                    correctAnswer: 1,
                    options: [
                        {
                            label: 'A',
                            text: 'Changes could become irreversible without immediate action',
                            translation: '즉각적인 조치가 없으면 변화가 돌이킬 수 없게 될 수 있다',
                            explanation: '지문의 마지막 문장이 이 내용을 명확하게 담고 있습니다.'
                        },
                        {
                            label: 'B',
                            text: 'More research funding is needed',
                            translation: '더 많은 연구 자금이 필요하다',
                            explanation: '연구 자금은 언급되지 않았습니다.'
                        },
                        {
                            label: 'C',
                            text: 'Ocean temperatures will drop',
                            translation: '해양 온도가 떨어질 것이다',
                            explanation: '온도 하락은 언급되지 않았으며 오히려 상승하고 있습니다.'
                        },
                        {
                            label: 'D',
                            text: 'Fish populations will increase',
                            translation: '물고기 개체수가 증가할 것이다',
                            explanation: '개체수 증가는 언급되지 않았습니다.'
                        }
                    ]
                }
            ]
        }
    ]
};

// 실제 사용할 데이터
let readingAcademicData = null;
let academicAnswers = {};

// ✅ 캐시 시스템 추가 (정렬된 데이터 재사용)
let cachedAcademicData = null;

/**
 * 아카데믹 리딩 데이터 로드 (Supabase → 데모 폴백)
 * window.readingAcademicData에 배열 형태로 저장
 * @param {boolean} forceReload - true면 캐시 무시하고 재로드
 */
async function loadAcademicData(forceReload = false) {
    console.log('📥 [아카데믹리딩] 데이터 로드 시작...');
    
    // ✅ 캐시 확인
    if (!forceReload && cachedAcademicData) {
        console.log('✅ [아카데믹리딩] 캐시된 데이터 사용 (이미 정렬됨)');
        window.readingAcademicData = cachedAcademicData;
        console.log('  캐시 데이터 세트 순서:', cachedAcademicData.map(s => s.id));
        return;
    }
    
    try {
        const sheetSets = await fetchAcademicFromSheet();
        
        // Supabase 데이터가 유효한 배열이면 사용
        if (sheetSets && Array.isArray(sheetSets) && sheetSets.length > 0) {
            console.log(`✅ [아카데믹리딩] Supabase 데이터 사용 (${sheetSets.length}개 세트)`);
            window.readingAcademicData = sheetSets;
            cachedAcademicData = sheetSets; // ✅ 캐시 저장
            return;
        }
        
        console.log('⚠️ [아카데믹리딩] Supabase 데이터 없음, 데모 데이터로 전환');
        
    } catch (error) {
        console.error('❌ [아카데믹리딩] 로드 중 예외 발생:', error);
    }
    
    // 데모 데이터 사용 (폴백)
    if (readingAcademicDataDemo && readingAcademicDataDemo.sets) {
        console.log(`📝 [아카데믹리딩] 데모 데이터 사용 (${readingAcademicDataDemo.sets.length}개 세트)`);
        window.readingAcademicData = readingAcademicDataDemo.sets;
        cachedAcademicData = readingAcademicDataDemo.sets; // ✅ 캐시 저장
    } else {
        console.error('❌ [아카데믹리딩] 데모 데이터도 없음!');
        window.readingAcademicData = [];
        cachedAcademicData = [];
    }
}

// 캐시 초기화 함수 (디버깅용)
window.clearAcademicCache = function() {
    console.log('🔄 [아카데믹리딩] 캐시 초기화');
    cachedAcademicData = null;
};

// 페이지 로드 시 데이터 초기화
async function initAcademicDataOnLoad() {
    await loadAcademicData();
    console.log('✅ [아카데믹리딩] 데이터 초기화 완료');
}

// 페이지 로드 시 자동 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAcademicDataOnLoad);
} else {
    initAcademicDataOnLoad();
}
