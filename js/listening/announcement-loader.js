/**
 * announcement-loader.js
 * 리스닝 - 공지사항 데이터 로더
 * 
 * Supabase에서 tr_listening_announcement 테이블 데이터를 로드합니다.
 */

// 캐시 시스템
let cachedAnnouncementData = null;

// 캐시 초기화 함수 (디버깅용)
window.clearAnnouncementCache = function() {
  console.log('🔄 [announcement-loader] 캐시 초기화');
  cachedAnnouncementData = null;
};

/**
 * 공지사항 데이터 로드
 * @param {boolean} forceReload - 캐시 무시하고 강제 로드
 * @returns {Object|null} { type, sets } 또는 null
 */
async function loadAnnouncementData(forceReload = false) {
  console.log('[announcement-loader] 데이터 로드 시작');
  
  // 캐시 확인
  if (!forceReload && cachedAnnouncementData) {
    console.log('✅ [announcement-loader] 캐시된 데이터 사용');
    console.log('  캐시 데이터 세트 순서:', cachedAnnouncementData.sets.map(s => s.setId));
    return cachedAnnouncementData;
  }
  
  // Supabase에서 로드
  const result = await _loadAnnouncementFromSupabase();
  if (result) {
    cachedAnnouncementData = result;
    return result;
  }
  
  console.error('[announcement-loader] 데이터 로드 실패');
  return null;
}

/**
 * Supabase에서 공지사항 데이터 로드
 * @private
 */
async function _loadAnnouncementFromSupabase() {
  if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) return null;
  if (typeof supabaseSelect !== 'function') return null;
  
  try {
    console.log('📥 [announcement-loader] Supabase에서 데이터 로드...');
    const rows = await supabaseSelect('tr_listening_announcement', 'select=*&order=id.asc');
    
    if (!rows || rows.length === 0) {
      console.warn('⚠️ [announcement-loader] Supabase 데이터 없음');
      return null;
    }
    
    console.log(`✅ [announcement-loader] Supabase에서 ${rows.length}개 세트 로드 성공`);
    
    const sets = rows.map(row => {
      // scriptHighlights 파싱
      let scriptHighlights = '';
      if (row.script_highlights) scriptHighlights = row.script_highlights;
      
      return {
        setId: row.id,
        gender: row.gender || '',
        narrationUrl: row.narration_url || '',
        audioUrl: row.audio_url || '',
        script: row.script || '',
        scriptTrans: row.script_trans || '',
        scriptHighlights: scriptHighlights,
        questions: [
          {
            questionText: row.q1_question_text || '',
            questionTextTrans: row.q1_question_text_trans || '',
            options: [row.q1_opt1 || '', row.q1_opt2 || '', row.q1_opt3 || '', row.q1_opt4 || ''],
            correctAnswer: parseInt(row.q1_correct_answer) || 1,
            translations: [row.q1_trans1 || '', row.q1_trans2 || '', row.q1_trans3 || '', row.q1_trans4 || ''],
            explanations: [row.q1_exp1 || '', row.q1_exp2 || '', row.q1_exp3 || '', row.q1_exp4 || '']
          },
          {
            questionText: row.q2_question_text || '',
            questionTextTrans: row.q2_question_text_trans || '',
            options: [row.q2_opt1 || '', row.q2_opt2 || '', row.q2_opt3 || '', row.q2_opt4 || ''],
            correctAnswer: parseInt(row.q2_correct_answer) || 1,
            translations: [row.q2_trans1 || '', row.q2_trans2 || '', row.q2_trans3 || '', row.q2_trans4 || ''],
            explanations: [row.q2_exp1 || '', row.q2_exp2 || '', row.q2_exp3 || '', row.q2_exp4 || '']
          }
        ]
      };
    });
    
    sets.sort((a, b) => {
      const numA = parseInt(a.setId.replace(/\D/g, ''));
      const numB = parseInt(b.setId.replace(/\D/g, ''));
      return numA - numB;
    });
    
    return { type: 'listening_announcement', sets };
    
  } catch (error) {
    console.error('❌ [announcement-loader] Supabase 로드 실패:', error);
    return null;
  }
}

// 전역 노출
window.loadAnnouncementData = loadAnnouncementData;
console.log('[announcement-loader] 로드 완료');
