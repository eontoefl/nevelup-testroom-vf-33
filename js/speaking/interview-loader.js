/**
 * interview-loader.js
 * 스피킹 - 인터뷰 데이터 로더
 * 
 * Supabase에서 tr_speaking_interview 테이블 데이터를 로드하고
 * 세트별로 구조화하여 반환합니다.
 */

// 캐시 시스템
let cachedInterviewData = null;

// 캐시 초기화 함수 (디버깅용)
window.clearInterviewCache = function() {
    console.log('🔄 [interview-loader] 캐시 초기화');
    cachedInterviewData = null;
};

/**
 * 인터뷰 데이터 로드
 * @param {boolean} forceReload - 캐시 무시하고 강제 로드
 * @returns {Object|null} { type, sets } 또는 null
 */
async function loadInterviewData(forceReload = false) {
    console.log('[interview-loader] 데이터 로드 시작');
    
    // 캐시 확인
    if (!forceReload && cachedInterviewData) {
        console.log('✅ [interview-loader] 캐시된 데이터 사용');
        return cachedInterviewData;
    }
    
    // Supabase에서 로드
    const result = await _loadInterviewFromSupabase();
    if (result) {
        cachedInterviewData = result;
        return result;
    }
    
    console.error('[interview-loader] 데이터 로드 실패');
    return null;
}

/**
 * Supabase에서 인터뷰 데이터 로드
 * @private
 */
async function _loadInterviewFromSupabase() {
    if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) return null;
    if (typeof supabaseSelect !== 'function') return null;
    
    try {
        console.log('📥 [interview-loader] Supabase에서 데이터 로드...');
        const rows = await supabaseSelect('tr_speaking_interview', 'select=*&order=id.asc');
        
        if (!rows || rows.length === 0) {
            console.warn('⚠️ [interview-loader] Supabase 데이터 없음');
            return null;
        }
        
        console.log(`✅ [interview-loader] Supabase에서 ${rows.length}개 세트 로드 성공`);
        
        const sets = rows.map(row => {
            const videos = [];
            for (let v = 1; v <= 4; v++) {
                videos.push({
                    video: row[`v${v}_video`] || '',
                    script: row[`v${v}_script`] || '',
                    translation: row[`v${v}_translation`] || '',
                    modelAnswer: row[`v${v}_model_answer`] || '',
                    modelAnswerTranslation: row[`v${v}_model_answer_trans`] || '',
                    modelAnswerAudio: row[`v${v}_model_answer_audio`] || '',
                    highlights: _parseHighlights(row[`v${v}_highlights`] || '{}')
                });
            }
            
            return {
                id: row.id,
                contextText: row.context_text || '',
                contextTranslation: row.translation || '',
                contextAudio: row.context_audio || '',
                contextImage: row.context_image || '',
                noddingVideo: row.nodding_video || '',
                videos: videos
            };
        });
        
        return { type: 'speaking_interview', sets };
        
    } catch (error) {
        console.error('❌ [interview-loader] Supabase 로드 실패:', error);
        return null;
    }
}

/**
 * Highlights JSON 파싱 (2가지 형식 지원)
 * @private
 */
function _parseHighlights(highlightsStr) {
    if (!highlightsStr || highlightsStr.trim() === '') {
        console.warn('⚠️ [interview-loader] highlights 빈 문자열');
        return {};
    }
    
    try {
        let cleanStr = highlightsStr.trim();
        
        // 방법 1: JSON 형식 시도
        if (cleanStr.startsWith('{') && cleanStr.endsWith('}')) {
            // Google Sheets 이스케이프 해제
            if (cleanStr.startsWith('"') && cleanStr.endsWith('"')) {
                cleanStr = cleanStr.slice(1, -1).replace(/""/g, '"');
            }
            
            try {
                const parsed = JSON.parse(cleanStr);
                console.log('✅ [interview-loader] highlights 파싱 성공 (JSON):', Object.keys(parsed).length, '개');
                return parsed;
            } catch (e) {
                console.warn('⚠️ [interview-loader] JSON 파싱 실패, :: 구분자 시도');
            }
        }
        
        // 방법 2: :: 구분자 파싱
        const highlights = {};
        const entries = cleanStr.split('||').map(s => s.trim()).filter(s => s);
        
        for (const entry of entries) {
            const parts = entry.split('::').map(s => s.trim());
            if (parts.length === 3) {
                const [key, title, description] = parts;
                highlights[key] = {
                    title: title,
                    description: description
                };
            }
        }
        
        if (Object.keys(highlights).length > 0) {
            console.log('✅ [interview-loader] highlights 파싱 성공 (:: 구분자):', Object.keys(highlights).length, '개');
            return highlights;
        }
        
        console.warn('⚠️ [interview-loader] highlights 파싱 실패: 알 수 없는 형식');
        return {};
        
    } catch (e) {
        console.error('❌ [interview-loader] highlights 파싱 실패:', e);
        console.error('❌ [interview-loader] 원본 데이터:', highlightsStr);
        return {};
    }
}

// 전역 노출
window.loadInterviewData = loadInterviewData;
console.log('[interview-loader] 로드 완료');
