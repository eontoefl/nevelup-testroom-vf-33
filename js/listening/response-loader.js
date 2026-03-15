/**
 * response-loader.js
 * 리스닝 - 응답고르기 데이터 로더
 * 
 * Supabase에서 tr_listening_response 테이블 데이터를 로드하고
 * 세트별로 그룹화하여 반환합니다.
 */

// 캐시 시스템
let cachedResponseData = null;

// 캐시 초기화 함수 (디버깅용)
window.clearResponseCache = function() {
  console.log('🔄 [response-loader] 캐시 초기화');
  cachedResponseData = null;
};

/**
 * 응답고르기 데이터 로드
 * @param {boolean} forceReload - 캐시 무시하고 강제 로드
 * @returns {Object|null} { type, timeLimit, sets } 또는 null
 */
async function loadResponseData(forceReload = false) {
  console.log('[response-loader] 데이터 로드 시작');
  
  // 캐시 확인
  if (!forceReload && cachedResponseData) {
    console.log('✅ [response-loader] 캐시된 데이터 사용');
    console.log('  캐시 데이터 세트 순서:', cachedResponseData.sets.map(s => s.setId));
    return cachedResponseData;
  }
  
  // Supabase에서 로드
  const result = await _loadResponseFromSupabase();
  if (result) {
    cachedResponseData = result;
    return result;
  }
  
  console.error('[response-loader] 데이터 로드 실패');
  return null;
}

/**
 * Supabase에서 응답고르기 데이터 로드
 * @private
 */
async function _loadResponseFromSupabase() {
  if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) return null;
  if (typeof supabaseSelect !== 'function') return null;
  
  try {
    console.log('📥 [response-loader] Supabase에서 데이터 로드...');
    const rows = await supabaseSelect('tr_listening_response', 'select=*&order=set_id.asc,question_num.asc');
    
    if (!rows || rows.length === 0) {
      console.warn('⚠️ [response-loader] Supabase 데이터 없음');
      return null;
    }
    
    console.log(`✅ [response-loader] Supabase에서 ${rows.length}개 행 로드 성공`);
    
    // 행 데이터를 세트별로 그룹화
    const setsMap = {};
    rows.forEach(row => {
      const setId = row.set_id;
      if (!setsMap[setId]) {
        setsMap[setId] = { setId: setId, questions: [] };
      }
      
      let scriptHighlights = [];
      if (row.script_highlights) {
        try { scriptHighlights = JSON.parse(row.script_highlights); } catch(e) {}
      }
      
      setsMap[setId].questions.push({
        questionNum: parseInt(row.question_num) || 1,
        audioUrl: row.audio_url || '',
        gender: row.gender || '',
        options: [row.option1 || '', row.option2 || '', row.option3 || '', row.option4 || ''],
        answer: parseInt(row.answer) || 1,
        script: row.script || '',
        scriptTrans: row.script_trans || '',
        scriptHighlights: scriptHighlights,
        optionTranslations: [row.option_trans1 || '', row.option_trans2 || '', row.option_trans3 || '', row.option_trans4 || ''],
        optionExplanations: [row.option_exp1 || '', row.option_exp2 || '', row.option_exp3 || '', row.option_exp4 || '']
      });
    });
    
    const sets = Object.values(setsMap);
    sets.forEach(set => set.questions.sort((a, b) => a.questionNum - b.questionNum));
    sets.sort((a, b) => {
      const numA = parseInt(a.setId.replace(/\D/g, ''));
      const numB = parseInt(b.setId.replace(/\D/g, ''));
      return numA - numB;
    });
    
    return { type: 'listening_response', timeLimit: 20, sets };
    
  } catch (error) {
    console.error('❌ [response-loader] Supabase 로드 실패:', error);
    return null;
  }
}

// 전역 노출
window.loadResponseData = loadResponseData;
console.log('[response-loader] 로드 완료');
