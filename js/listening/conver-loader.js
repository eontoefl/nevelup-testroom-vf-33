/**
 * conver-loader.js
 * 리스닝 - 컨버(Conversation) 데이터 로더
 * 
 * Supabase에서 tr_listening_conversation 테이블 데이터를 로드합니다.
 */

// 캐시 시스템
let cachedConverData = null; // 받는 중이거나 받은 요청(Promise)

// 캐시 초기화 함수 (디버깅용)
window.clearConverCache = function() {
  console.log('🔄 [conver-loader] 캐시 초기화');
  cachedConverData = null;
};

/**
 * 컨버 데이터 로드
 * @param {boolean} forceReload - 캐시 무시하고 강제 로드
 * @returns {Object|null} { type, timeLimit, sets } 또는 null
 */
async function loadConverData(forceReload = false) {
  console.log('[conver-loader] 데이터 로드 시작');
  
  // 표는 한 번만 받는다 — 보낸 요청을 캐시해서 동시에 불러도 같은 요청을 기다린다(못 받으면 비워서 다음에 새로 받음)
  if (forceReload || !cachedConverData) {
    const request = _loadConverFromSupabase();
    cachedConverData = request;
    const clearIfFailed = (data) => { if (cachedConverData === request && !data) cachedConverData = null; };
    request.then(clearIfFailed, () => clearIfFailed(null));
  } else {
    console.log('✅ [conver-loader] 캐시된 데이터 사용');
  }
  
  const result = await cachedConverData;
  if (result) {
    return result;
  }
  
  console.error('[conver-loader] 데이터 로드 실패');
  return null;
}

/**
 * Supabase에서 컨버 데이터 로드
 * @private
 */
async function _loadConverFromSupabase() {
  if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) return null;
  if (typeof supabaseSelect !== 'function') return null;
  
  try {
    console.log('📥 [conver-loader] Supabase에서 데이터 로드...');
    const rows = await supabaseSelect('tr_listening_conversation', 'select=*&order=id.asc');
    
    if (!rows || rows.length === 0) {
      console.warn('⚠️ [conver-loader] Supabase 데이터 없음');
      return null;
    }
    
    console.log(`✅ [conver-loader] Supabase에서 ${rows.length}개 세트 로드 성공`);
    
    const sets = rows.map(row => {
      // scriptHighlights 파싱
      let scriptHighlights = [];
      if (row.script_highlights && row.script_highlights.trim()) {
        const items = row.script_highlights.split('##');
        items.forEach(item => {
          const parts = item.split('::');
          if (parts.length >= 3) {
            scriptHighlights.push({
              word: parts[0].trim(),
              translation: parts[1].trim(),
              explanation: parts[2].trim()
            });
          }
        });
      }
      
      return {
        setId: row.id,
        audioUrl: row.audio_url || '',
        script: row.script || '',
        scriptTrans: row.script_trans || '',
        scriptHighlights: scriptHighlights,
        questions: [
          {
            questionText: row.q1_question || '',
            questionTrans: row.q1_question_trans || '',
            options: [row.q1_opt1 || '', row.q1_opt2 || '', row.q1_opt3 || '', row.q1_opt4 || ''],
            correctAnswer: parseInt(row.q1_answer) || 1,
            optionTranslations: [row.q1_opt_trans1 || '', row.q1_opt_trans2 || '', row.q1_opt_trans3 || '', row.q1_opt_trans4 || ''],
            optionExplanations: [row.q1_opt_exp1 || '', row.q1_opt_exp2 || '', row.q1_opt_exp3 || '', row.q1_opt_exp4 || '']
          },
          {
            questionText: row.q2_question || '',
            questionTrans: row.q2_question_trans || '',
            options: [row.q2_opt1 || '', row.q2_opt2 || '', row.q2_opt3 || '', row.q2_opt4 || ''],
            correctAnswer: parseInt(row.q2_answer) || 1,
            optionTranslations: [row.q2_opt_trans1 || '', row.q2_opt_trans2 || '', row.q2_opt_trans3 || '', row.q2_opt_trans4 || ''],
            optionExplanations: [row.q2_opt_exp1 || '', row.q2_opt_exp2 || '', row.q2_opt_exp3 || '', row.q2_opt_exp4 || '']
          }
        ]
      };
    });
    
    sets.sort((a, b) => {
      const numA = parseInt(a.setId.replace(/\D/g, ''));
      const numB = parseInt(b.setId.replace(/\D/g, ''));
      return numA - numB;
    });
    
    return { type: 'listening_conver', timeLimit: 20, sets };
    
  } catch (error) {
    console.error('❌ [conver-loader] Supabase 로드 실패:', error);
    return null;
  }
}

// 전역 노출
window.loadConverData = loadConverData;
console.log('[conver-loader] 로드 완료');
