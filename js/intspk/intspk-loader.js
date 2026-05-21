let cachedIntspkData = null;

window.clearIntspkCache = function() {
    console.log('[intspk-loader] 캐시 초기화');
    cachedIntspkData = null;
};

async function loadIntspkData(forceReload) {
    if (!forceReload && cachedIntspkData) {
        console.log('[intspk-loader] 캐시된 데이터 사용');
        return cachedIntspkData;
    }

    if (typeof supabaseSelect !== 'function') return null;

    try {
        console.log('[intspk-loader] Supabase에서 데이터 로드...');
        var rows = await supabaseSelect('aus_intspk', 'select=*&order=id.asc');

        if (!rows || rows.length === 0) {
            console.warn('[intspk-loader] 데이터 없음');
            return null;
        }

        var items = rows.map(function(row) {
            return {
                id: row.id,
                type: row.type,
                title: row.title || '',
                passage: row.passage || '',
                readingAudioUrl: row.reading_audio_url || '',
                dialogAudioUrl: row.dialog_audio_url || '',
                dialogImageUrl: row.dialog_image_url || '',
                problemText: row.problem_text || '',
                problemAudioUrl: row.problem_audio_url || ''
            };
        });

        cachedIntspkData = { items: items };
        console.log('[intspk-loader] ' + rows.length + '개 항목 로드 완료');
        return cachedIntspkData;

    } catch (e) {
        console.error('[intspk-loader] 로드 실패:', e);
        return null;
    }
}

window.loadIntspkData = loadIntspkData;
console.log('[IntSpk] intspk-loader.js 로드 완료');
