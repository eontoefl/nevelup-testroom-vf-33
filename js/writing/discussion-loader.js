/**
 * discussion-loader.js
 * 라이팅 - 토론형 글쓰기 데이터 로더
 * 
 * Supabase에서 tr_writing_discussion 테이블 데이터를 로드하여 반환합니다.
 */

// 캐시 시스템
let cachedDiscussionData = null;

// 캐시 초기화 함수 (디버깅용)
window.clearDiscussionCache = function() {
    console.log('🔄 [discussion-loader] 캐시 초기화');
    cachedDiscussionData = null;
};

/**
 * 토론형 글쓰기 데이터 로드
 * @param {boolean} forceReload - 캐시 무시하고 강제 로드
 * @returns {Array|null} 세트 배열 또는 null
 */
async function loadDiscussionData(forceReload = false) {
    console.log('[discussion-loader] 데이터 로드 시작');
    
    // 캐시 확인
    if (!forceReload && cachedDiscussionData) {
        console.log('✅ [discussion-loader] 캐시된 데이터 사용');
        return cachedDiscussionData;
    }
    
    // Supabase에서 로드
    const result = await _loadDiscussionFromSupabase();
    if (result) {
        cachedDiscussionData = result;
        return result;
    }
    
    console.error('[discussion-loader] 데이터 로드 실패');
    return null;
}

/**
 * Supabase에서 토론형 데이터 로드
 * @private
 */
async function _loadDiscussionFromSupabase() {
    if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) return null;
    if (typeof supabaseSelect !== 'function') return null;
    
    try {
        console.log('📥 [discussion-loader] Supabase에서 데이터 로드...');
        const rows = await supabaseSelect('tr_writing_discussion', 'select=*&order=id.asc');
        
        if (!rows || rows.length === 0) {
            console.warn('⚠️ [discussion-loader] Supabase 데이터 없음');
            return null;
        }
        
        console.log(`✅ [discussion-loader] Supabase에서 ${rows.length}개 세트 로드 성공`);
        
        const sets = rows.map(row => {
            const setData = {
                setNumber: row.id || '',
                classContext: row.class_context || '',
                topic: row.topic || '',
                student1Opinion: row.student1_opinion || '',
                student2Opinion: row.student2_opinion || '',
                sampleAnswer: row.sample_answer || '',
                bullet1Sentence: row.bullet1_sentence || '',
                bullet1ETS: row.bullet1_ets || '',
                bullet1Strategy: row.bullet1_strategy || '',
                bullet2Sentence: row.bullet2_sentence || '',
                bullet2ETS: row.bullet2_ets || '',
                bullet2Strategy: row.bullet2_strategy || '',
                bullet3Sentence: row.bullet3_sentence || '',
                bullet3ETS: row.bullet3_ets || '',
                bullet3Strategy: row.bullet3_strategy || '',
                bullet4Sentence: row.bullet4_sentence || '',
                bullet4ETS: row.bullet4_ets || '',
                bullet4Strategy: row.bullet4_strategy || '',
                bullet5Sentence: row.bullet5_sentence || '',
                bullet5ETS: row.bullet5_ets || '',
                bullet5Strategy: row.bullet5_strategy || ''
            };
            
            // Bullets 배열 구성 (빈 값 제외)
            setData.bullets = [];
            for (let i = 1; i <= 5; i++) {
                const sentence = setData[`bullet${i}Sentence`];
                if (sentence && sentence.trim()) {
                    setData.bullets.push({
                        bulletNum: i,
                        sentence: sentence,
                        ets: setData[`bullet${i}ETS`] || '',
                        strategy: setData[`bullet${i}Strategy`] || ''
                    });
                }
            }
            
            return setData;
        });
        
        return sets;
        
    } catch (error) {
        console.error('❌ [discussion-loader] Supabase 로드 실패:', error);
        return null;
    }
}

// 전역 노출
window.loadDiscussionData = loadDiscussionData;
console.log('[discussion-loader] 로드 완료');
