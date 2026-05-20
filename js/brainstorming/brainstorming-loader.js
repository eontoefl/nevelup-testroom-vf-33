/**
 * brainstorming-loader.js
 * 브레인스토밍 데이터 로더
 *
 * Supabase aus_brainstorm 테이블에서 Day별 주제 2개를 로드
 */

let cachedBrainstormData = null;

window.clearBrainstormCache = function() {
    console.log('[brainstorm-loader] 캐시 초기화');
    cachedBrainstormData = null;
};

async function loadBrainstormData(forceReload) {
    if (!forceReload && cachedBrainstormData) {
        console.log('[brainstorm-loader] 캐시된 데이터 사용');
        return cachedBrainstormData;
    }

    if (typeof supabaseSelect !== 'function') return null;

    try {
        console.log('[brainstorm-loader] Supabase에서 데이터 로드...');
        var rows = await supabaseSelect('aus_brainstorm', 'select=*&order=id.asc');

        if (!rows || rows.length === 0) {
            console.warn('[brainstorm-loader] 데이터 없음');
            return null;
        }

        var days = rows.map(function(row) {
            return {
                dayId: row.id,
                topics: [
                    {
                        text: row.topic1_text || '',
                        audioUrl: row.topic1_audio_url || ''
                    },
                    {
                        text: row.topic2_text || '',
                        audioUrl: row.topic2_audio_url || ''
                    }
                ]
            };
        });

        cachedBrainstormData = { days: days };
        console.log('[brainstorm-loader] ' + rows.length + '개 Day 로드 완료');
        return cachedBrainstormData;

    } catch (e) {
        console.error('[brainstorm-loader] 로드 실패:', e);
        return null;
    }
}

window.loadBrainstormData = loadBrainstormData;
console.log('[Brainstorming] brainstorming-loader.js 로드 완료');
