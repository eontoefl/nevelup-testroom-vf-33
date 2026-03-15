/**
 * lecture-loader.js
 * 리스닝 - 렉쳐 데이터 로더
 * 
 * Supabase에서 tr_listening_lecture 테이블 데이터를 로드합니다.
 */

// 캐시 시스템
let cachedLectureData = null;

// 캐시 초기화 함수 (디버깅용)
window.clearLectureCache = function() {
  console.log('🔄 [lecture-loader] 캐시 초기화');
  cachedLectureData = null;
};

/**
 * 렉쳐 데이터 로드
 * @param {boolean} forceReload - 캐시 무시하고 강제 로드
 * @returns {Object|null} { type, sets } 또는 null
 */
async function loadLectureData(forceReload = false) {
  console.log('[lecture-loader] 데이터 로드 시작');
  
  // 캐시 확인
  if (!forceReload && cachedLectureData) {
    console.log('✅ [lecture-loader] 캐시된 데이터 사용');
    console.log('  캐시 데이터 세트 순서:', cachedLectureData.sets.map(s => s.setId));
    return cachedLectureData;
  }
  
  // Supabase에서 로드
  const result = await _loadLectureFromSupabase();
  if (result) {
    cachedLectureData = result;
    return result;
  }
  
  console.error('[lecture-loader] 데이터 로드 실패');
  return null;
}

/**
 * Supabase에서 렉쳐 데이터 로드
 * @private
 */
async function _loadLectureFromSupabase() {
  if (typeof USE_SUPABASE !== 'undefined' && !USE_SUPABASE) return null;
  if (typeof supabaseSelect !== 'function') return null;
  
  try {
    console.log('📥 [lecture-loader] Supabase에서 데이터 로드...');
    const rows = await supabaseSelect('tr_listening_lecture', 'select=*&order=id.asc');
    
    if (!rows || rows.length === 0) {
      console.warn('⚠️ [lecture-loader] Supabase 데이터 없음');
      return null;
    }
    
    console.log(`✅ [lecture-loader] Supabase에서 ${rows.length}개 세트 로드 성공`);
    
    const sets = rows.map(row => {
      // scriptHighlights 파싱
      let scriptHighlights = [];
      if (row.script_highlights && row.script_highlights.trim()) {
        try {
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
        } catch(e) {}
      }
      
      // 4개 문제 구성
      const makeQ = (prefix) => ({
        questionText: row[`${prefix}_question_text`] || '',
        questionTrans: row[`${prefix}_question_trans`] || '',
        options: [row[`${prefix}_opt1`] || '', row[`${prefix}_opt2`] || '', row[`${prefix}_opt3`] || '', row[`${prefix}_opt4`] || ''],
        correctAnswer: parseInt(row[`${prefix}_correct_answer`]) || 1,
        optionTranslations: [row[`${prefix}_trans1`] || '', row[`${prefix}_trans2`] || '', row[`${prefix}_trans3`] || '', row[`${prefix}_trans4`] || ''],
        optionExplanations: [row[`${prefix}_exp1`] || '', row[`${prefix}_exp2`] || '', row[`${prefix}_exp3`] || '', row[`${prefix}_exp4`] || '']
      });
      
      return {
        setId: row.id,
        gender: row.gender || '',
        lectureTitle: row.lecture_title || '',
        narrationUrl: row.narration_url || '',
        audioUrl: row.audio_url || '',
        script: row.script || '',
        scriptTrans: row.script_trans || '',
        scriptHighlights: scriptHighlights,
        questions: [makeQ('q1'), makeQ('q2'), makeQ('q3'), makeQ('q4')]
      };
    });
    
    sets.sort((a, b) => {
      const numA = parseInt(a.setId.replace(/\D/g, ''));
      const numB = parseInt(b.setId.replace(/\D/g, ''));
      return numA - numB;
    });
    
    return { type: 'listening_lecture', sets };
    
  } catch (error) {
    console.error('❌ [lecture-loader] Supabase 로드 실패:', error);
    return null;
  }
}

// 전역 노출
window.loadLectureData = loadLectureData;
console.log('[lecture-loader] 로드 완료');
