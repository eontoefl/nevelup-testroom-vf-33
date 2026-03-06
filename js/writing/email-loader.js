/**
 * email-loader.js
 * 라이팅 - 이메일 작성 데이터 로더
 * 
 * Supabase에서 tr_writing_email 테이블 데이터를 로드하여 반환합니다.
 */

// 캐시 시스템
let cachedEmailData = null;

// 캐시 초기화 함수 (디버깅용)
window.clearEmailCache = function() {
    console.log('🔄 [email-loader] 캐시 초기화');
    cachedEmailData = null;
};

/**
 * 이메일 작성 데이터 로드
 * @param {boolean} forceReload - 캐시 무시하고 강제 로드
 * @returns {Object|null} { type, timeLimit, sets } 또는 null
 */
async function loadEmailData(forceReload = false) {
    console.log('[email-loader] 데이터 로드 시작');
    
    // 캐시 확인
    if (!forceReload && cachedEmailData) {
        console.log('✅ [email-loader] 캐시된 데이터 사용');
        return cachedEmailData;
    }
    
    // Supabase에서 로드
    const result = await _loadEmailFromSupabase();
    if (result) {
        cachedEmailData = result;
        return result;
    }
    
    console.error('[email-loader] 데이터 로드 실패');
    return null;
}

/**
 * Supabase에서 이메일 데이터 로드
 * @private
 */
async function _loadEmailFromSupabase() {
    if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) return null;
    if (typeof supabaseSelect !== 'function') return null;
    
    try {
        console.log('📥 [email-loader] Supabase에서 데이터 로드...');
        const rows = await supabaseSelect('tr_writing_email', 'select=*&order=id.asc');
        
        if (!rows || rows.length === 0) {
            console.warn('⚠️ [email-loader] Supabase 데이터 없음');
            return null;
        }
        
        console.log(`✅ [email-loader] Supabase에서 ${rows.length}개 세트 로드 성공`);
        
        const sets = rows.map(row => {
            const bullets = [];
            for (let b = 1; b <= 3; b++) {
                bullets.push({
                    bulletNum: b,
                    must: row[`bullet${b}_must`] || '',
                    sample: row[`bullet${b}_sample`] || '',
                    points: row[`bullet${b}_points`] || '',
                    key: row[`bullet${b}_key`] || ''
                });
            }
            
            return {
                id: row.id,
                scenario: row.scenario || '',
                task: row.task || '',
                instruction1: row.instruction1 || '',
                instruction2: row.instruction2 || '',
                instruction3: row.instruction3 || '',
                to: row.to_recipient || '',
                subject: row.subject || '',
                sampleAnswer: row.sample_answer || '',
                bullets: bullets
            };
        });
        
        return { type: 'writing_email', timeLimit: 420, sets };
        
    } catch (error) {
        console.error('❌ [email-loader] Supabase 로드 실패:', error);
        return null;
    }
}

// 전역 노출
window.loadEmailData = loadEmailData;
console.log('[email-loader] 로드 완료');
