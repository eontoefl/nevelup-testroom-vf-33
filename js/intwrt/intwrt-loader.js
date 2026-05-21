let cachedIntwrtData = null;

window.clearIntwrtCache = function() {
    console.log('[intwrt-loader] 캐시 초기화');
    cachedIntwrtData = null;
};

async function loadIntwrtData(forceReload) {
    if (!forceReload && cachedIntwrtData) {
        console.log('[intwrt-loader] 캐시된 데이터 사용');
        return cachedIntwrtData;
    }

    if (typeof supabaseSelect !== 'function') return null;

    try {
        console.log('[intwrt-loader] Supabase에서 데이터 로드...');
        var rows = await supabaseSelect('aus_intwrt', 'select=*&order=id.asc');

        if (!rows || rows.length === 0) {
            console.warn('[intwrt-loader] 데이터 없음');
            return null;
        }

        var items = rows.map(function(row) {
            return {
                id: row.id,
                passage: row.passage || '',
                lectureAudioUrl: row.lecture_audio_url || '',
                lectureImageUrl: row.lecture_image_url || ''
            };
        });

        cachedIntwrtData = { items: items };
        console.log('[intwrt-loader] ' + rows.length + '개 항목 로드 완료');
        return cachedIntwrtData;

    } catch (e) {
        console.error('[intwrt-loader] 로드 실패:', e);
        return null;
    }
}

window.loadIntwrtData = loadIntwrtData;
console.log('[IntWrt] intwrt-loader.js 로드 완료');
