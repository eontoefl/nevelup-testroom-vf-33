/**
 * repeat-loader.js
 * 스피킹 - 따라말하기 데이터 로더
 * 
 * Supabase에서 tr_speaking_repeat 테이블 데이터를 로드하고
 * 세트별로 구조화하여 반환합니다.
 */

// 캐시 시스템
let cachedRepeatData = null;

// 캐시 초기화 함수 (디버깅용)
window.clearRepeatCache = function() {
    console.log('🔄 [repeat-loader] 캐시 초기화');
    cachedRepeatData = null;
};

/**
 * 따라말하기 데이터 로드
 * @param {boolean} forceReload - 캐시 무시하고 강제 로드
 * @returns {Object|null} { type, sets } 또는 null
 */
async function loadRepeatData(forceReload = false) {
    console.log('[repeat-loader] 데이터 로드 시작');
    
    // 캐시 확인
    if (!forceReload && cachedRepeatData) {
        console.log('✅ [repeat-loader] 캐시된 데이터 사용');
        return cachedRepeatData;
    }
    
    // Supabase에서 로드
    const result = await _loadRepeatFromSupabase();
    if (result) {
        cachedRepeatData = result;
        return result;
    }
    
    console.error('[repeat-loader] 데이터 로드 실패');
    return null;
}

/**
 * Supabase에서 따라말하기 데이터 로드
 * @private
 */
async function _loadRepeatFromSupabase() {
    if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) return null;
    if (typeof supabaseSelect !== 'function') return null;
    
    try {
        console.log('📥 [repeat-loader] Supabase에서 데이터 로드...');
        const rows = await supabaseSelect('tr_speaking_repeat', 'select=*&order=id.asc');
        
        if (!rows || rows.length === 0) {
            console.warn('⚠️ [repeat-loader] Supabase 데이터 없음');
            return null;
        }
        
        console.log(`✅ [repeat-loader] Supabase에서 ${rows.length}개 세트 로드 성공`);
        
        const sets = rows.map(row => {
            const narration = {
                audio: row.narration_audio || '',
                baseImage: row.narration_image || ''
            };
            
            const audios = [];
            for (let n = 1; n <= 7; n++) {
                audios.push({
                    audio: row[`audio${n}_url`] || '',
                    image: row[`audio${n}_image`] || '',
                    script: row[`audio${n}_script`] || '',
                    translation: row[`audio${n}_translation`] || '',
                    responseTime: parseInt(row[`audio${n}_response_time`]) || 10
                });
            }
            
            return {
                id: row.id,
                contextText: row.context_text || '',
                narration: narration,
                audios: audios
            };
        });
        
        return { type: 'speaking_repeat', sets };
        
    } catch (error) {
        console.error('❌ [repeat-loader] Supabase 로드 실패:', error);
        return null;
    }
}

// 전역 노출
window.loadRepeatData = loadRepeatData;
console.log('[repeat-loader] 로드 완료');
