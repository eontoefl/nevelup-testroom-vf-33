/**
 * arrange-loader.js
 * 라이팅 - 단어배열 데이터 로더
 * 
 * Supabase에서 tr_writing_arrange 테이블 데이터를 로드하고
 * 세트별로 그룹화하여 반환합니다.
 */

// 캐시 시스템
let cachedArrangeData = null;

// 캐시 초기화 함수 (디버깅용)
window.clearArrangeCache = function() {
    console.log('🔄 [arrange-loader] 캐시 초기화');
    cachedArrangeData = null;
};

/**
 * 단어배열 데이터 로드
 * @param {boolean} forceReload - 캐시 무시하고 강제 로드
 * @returns {Object|null} { type, timeLimit, sets } 또는 null
 */
async function loadArrangeData(forceReload = false) {
    console.log('[arrange-loader] 데이터 로드 시작');
    
    // 캐시 확인
    if (!forceReload && cachedArrangeData) {
        console.log('✅ [arrange-loader] 캐시된 데이터 사용');
        return cachedArrangeData;
    }
    
    // Supabase에서 로드
    const result = await _loadArrangeFromSupabase();
    if (result) {
        cachedArrangeData = result;
        return result;
    }
    
    console.error('[arrange-loader] 데이터 로드 실패');
    return null;
}

/**
 * Supabase에서 단어배열 데이터 로드
 * @private
 */
async function _loadArrangeFromSupabase() {
    if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) return null;
    if (typeof supabaseSelect !== 'function') return null;
    
    try {
        console.log('📥 [arrange-loader] Supabase에서 데이터 로드...');
        const rows = await supabaseSelect('tr_writing_arrange', 'select=*&order=set_id.asc,question_num.asc');
        
        if (!rows || rows.length === 0) {
            console.warn('⚠️ [arrange-loader] Supabase 데이터 없음');
            return null;
        }
        
        console.log(`✅ [arrange-loader] Supabase에서 ${rows.length}개 행 로드 성공`);
        
        // 행 데이터를 세트별로 그룹화
        const setsMap = {};
        rows.forEach(row => {
            const setId = row.set_id;
            if (!setsMap[setId]) {
                setsMap[setId] = {
                    setId: setId,
                    week: row.week || 'Week 1',
                    day: row.day || '월',
                    questions: []
                };
            }
            setsMap[setId].questions.push({
                questionNum: parseInt(row.question_num) || 1,
                givenSentence: row.given_sentence || '',
                givenTranslation: row.given_translation || '',
                correctAnswer: (row.correct_answer || '').split('|'),
                correctTranslation: row.correct_translation || '',
                presentedWords: (row.presented_words || '').split('|'),
                optionWords: (row.option_words || '').split('|'),
                endPunctuation: row.end_punctuation || '.',
                explanation: row.explanation || ''
            });
        });
        
        const setsArray = Object.values(setsMap).map(set => {
            set.questions.sort((a, b) => a.questionNum - b.questionNum);
            return set;
        });
        
        // 세트 ID 숫자 기준 정렬
        setsArray.sort((a, b) => {
            const numA = parseInt(a.setId.replace(/\D/g, ''));
            const numB = parseInt(b.setId.replace(/\D/g, ''));
            return numA - numB;
        });
        
        return { type: 'writing_arrange', timeLimit: 410, sets: setsArray };
        
    } catch (error) {
        console.error('❌ [arrange-loader] Supabase 로드 실패:', error);
        return null;
    }
}

// 전역 노출
window.loadArrangeData = loadArrangeData;
console.log('[arrange-loader] 로드 완료');
