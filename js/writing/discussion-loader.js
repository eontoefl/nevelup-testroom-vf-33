/**
 * discussion-loader.js
 * 라이팅 - 토론형 글쓰기 데이터 로더
 * 
 * Supabase에서 tr_writing_discussion 테이블 데이터를 로드하여 반환합니다.
 */

// 캐시 시스템
let cachedDiscussionData = null;

/**
 * 토론형 글쓰기 데이터 로드
 * @param {boolean} forceReload - 캐시 무시하고 강제 로드
 * @returns {Object|null} { type, sets } 또는 null
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
            // Bullets 배열 구성 (빈 값 제외)
            const bullets = [];
            for (let i = 1; i <= 5; i++) {
                const sentence = row[`bullet${i}_sentence`] || '';
                if (sentence.trim()) {
                    bullets.push({
                        bulletNum: i,
                        sentence: sentence,
                        ets: row[`bullet${i}_ets`] || '',
                        strategy: row[`bullet${i}_strategy`] || ''
                    });
                }
            }
            
            return {
                setNumber: row.id || '',
                classContext: row.class_context || '',
                topic: row.topic || '',
                student1Opinion: row.student1_opinion || '',
                student2Opinion: row.student2_opinion || '',
                sampleAnswer: row.sample_answer || '',
                bullets: bullets
            };
        });
        
        return { type: 'writing_discussion', sets };
        
    } catch (error) {
        console.error('❌ [discussion-loader] Supabase 로드 실패:', error);
        return null;
    }
}

// 전역 노출
window.loadDiscussionData = loadDiscussionData;
console.log('[discussion-loader] 로드 완료');
