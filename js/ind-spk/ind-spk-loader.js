/**
 * ind-spk-loader.js
 * 독립형 스피킹 데이터 로더
 *
 * Supabase aus_indspk 테이블에서 토픽 로드 (세트당 1개)
 */

let cachedIndSpkData = null;

window.clearIndSpkCache = function() {
    console.log('[ind-spk-loader] 캐시 초기화');
    cachedIndSpkData = null;
};

async function loadIndSpkData(forceReload) {
    if (!forceReload && cachedIndSpkData) {
        console.log('[ind-spk-loader] 캐시된 데이터 사용');
        return cachedIndSpkData;
    }

    if (typeof supabaseSelect !== 'function') return null;

    try {
        console.log('[ind-spk-loader] Supabase에서 데이터 로드...');
        var rows = await supabaseSelect('aus_indspk', 'select=*&order=id.asc');

        if (!rows || rows.length === 0) {
            console.warn('[ind-spk-loader] 데이터 없음');
            return null;
        }

        var items = rows.map(function(row) {
            return {
                id: row.id,
                text: row.topic_text || '',
                audioUrl: row.topic_audio_url || ''
            };
        });

        cachedIndSpkData = { items: items };
        console.log('[ind-spk-loader] ' + rows.length + '개 토픽 로드 완료');
        return cachedIndSpkData;

    } catch (e) {
        console.error('[ind-spk-loader] 로드 실패:', e);
        return null;
    }
}

window.loadIndSpkData = loadIndSpkData;
console.log('[IndSpk] ind-spk-loader.js 로드 완료');
