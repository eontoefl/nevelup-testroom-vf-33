var cachedAusDiscussionData = null;

window.clearAusDiscussionCache = function() {
    console.log('[aus-discussion-loader] 캐시 초기화');
    cachedAusDiscussionData = null;
};

async function loadAusDiscussionData(forceReload) {
    if (!forceReload && cachedAusDiscussionData) {
        console.log('[aus-discussion-loader] 캐시된 데이터 사용');
        return cachedAusDiscussionData;
    }

    if (typeof supabaseSelect !== 'function') return null;

    try {
        console.log('[aus-discussion-loader] Supabase에서 데이터 로드...');
        var rows = await supabaseSelect('aus_discussion', 'select=*&order=id.asc');

        if (!rows || rows.length === 0) {
            console.warn('[aus-discussion-loader] 데이터 없음');
            return null;
        }

        var items = rows.map(function(row) {
            return {
                id: row.id,
                classContext: row.class_context || '',
                topic: row.topic || '',
                student1Opinion: row.student1_opinion || '',
                student2Opinion: row.student2_opinion || ''
            };
        });

        cachedAusDiscussionData = { items: items };
        console.log('[aus-discussion-loader] ' + rows.length + '개 항목 로드 완료');
        return cachedAusDiscussionData;

    } catch (e) {
        console.error('[aus-discussion-loader] 로드 실패:', e);
        return null;
    }
}

window.loadAusDiscussionData = loadAusDiscussionData;
console.log('[AusDisc] aus-discussion-loader.js 로드 완료');
