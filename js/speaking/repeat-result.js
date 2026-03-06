/**
 * repeat-result.js
 * 스피킹 - 따라말하기 복습(결과) 화면
 * 
 * 완전 독립형: 컴포넌트 없이 데이터만으로 복습 화면을 표시합니다.
 * 오디오 재생을 자체적으로 처리합니다.
 */

// 내부 상태
let _repeatResultAudio = null;
let _repeatResultCurrentIndex = 0;

/**
 * 복습 화면 표시
 * @param {Object} data - { set: { contextText, audios: [{audio, image, script, translation}] } }
 */
function showRepeatResult(data) {
    console.log('🎯 [repeat-result] showRepeatResult 호출', data);
    
    if (!data || !data.set) {
        console.error('❌ [repeat-result] 복습 데이터 없음');
        return;
    }
    
    const set = data.set;
    _repeatResultCurrentIndex = 0;
    
    // Context 표시
    const contextEl = document.getElementById('repeatResultContext');
    if (contextEl) {
        contextEl.textContent = set.contextText;
    }
    
    // 첫 번째 오디오 표시
    showRepeatResultNarration(set, 0);
}

/**
 * 나레이션 표시 (복습 화면)
 * @param {Object} set - 세트 데이터
 * @param {number} index - 오디오 인덱스
 */
function showRepeatResultNarration(set, index) {
    console.log(`🎯 [repeat-result] 오디오 ${index + 1} 표시`);
    
    _repeatResultCurrentIndex = index;
    const audio = set.audios[index];
    
    // 진행 상태 업데이트
    const progressEl = document.getElementById('repeatResultProgress');
    if (progressEl) {
        progressEl.textContent = `Question ${index + 1} of ${set.audios.length}`;
    }
    
    // 이미지 표시
    const illustrationImg = document.getElementById('repeatResultIllustration');
    if (illustrationImg) {
        if (audio.image && audio.image !== 'PLACEHOLDER') {
            illustrationImg.src = audio.image;
            illustrationImg.style.display = 'block';
        } else {
            illustrationImg.style.display = 'none';
        }
    }
    
    // Script 표시
    const scriptEl = document.getElementById('repeatResultScript');
    if (scriptEl) {
        scriptEl.textContent = audio.script;
    }
    
    // Translation 표시
    const translationEl = document.getElementById('repeatResultTranslation');
    if (translationEl) {
        translationEl.textContent = audio.translation;
    }
    
    // 다시 듣기 버튼 설정
    const listenBtn = document.getElementById('repeatResultListenBtn');
    if (listenBtn) {
        listenBtn.onclick = () => playRepeatResultAudio(audio.audio);
    }
    
    // 이전/다음 버튼 표시
    const prevBtn = document.getElementById('repeatResultPrevBtn');
    const nextBtn = document.getElementById('repeatResultNextBtn');
    
    if (prevBtn) {
        if (index === 0) {
            prevBtn.style.display = 'none';
        } else {
            prevBtn.style.display = 'inline-block';
            prevBtn.onclick = () => showRepeatResultNarration(set, index - 1);
        }
    }
    
    if (nextBtn) {
        if (index === set.audios.length - 1) {
            nextBtn.textContent = '완료';
            nextBtn.onclick = () => completeRepeatResult();
        } else {
            nextBtn.textContent = '다음';
            nextBtn.onclick = () => showRepeatResultNarration(set, index + 1);
        }
    }
}

/**
 * 오디오 재생 (복습 화면 - 독립 재생)
 * @param {string} audioUrl - 오디오 URL
 */
function playRepeatResultAudio(audioUrl) {
    console.log('🔊 [repeat-result] 오디오 재생:', audioUrl);
    
    // 기존 오디오 정지
    if (_repeatResultAudio) {
        _repeatResultAudio.pause();
        _repeatResultAudio = null;
    }
    
    // PLACEHOLDER 또는 빈 URL이면 재생 안 함
    if (!audioUrl || audioUrl === 'PLACEHOLDER') {
        console.log('⏭️ [repeat-result] PLACEHOLDER 오디오, 건너뜀');
        return;
    }
    
    // 새 오디오 재생
    _repeatResultAudio = new Audio(audioUrl);
    _repeatResultAudio.play().catch(error => {
        console.error('❌ [repeat-result] 오디오 재생 실패:', error);
    });
}

/**
 * 복습 완료
 */
function completeRepeatResult() {
    console.log('✅ [repeat-result] 복습 완료');
    
    // 오디오 정지
    if (_repeatResultAudio) {
        _repeatResultAudio.pause();
        _repeatResultAudio = null;
    }
    
    // backToSchedule는 Module이 제공
    return true;
}

/**
 * Cleanup (화면 전환 시 호출)
 */
function cleanupRepeatResult() {
    console.log('🧹 [repeat-result] Cleanup');
    if (_repeatResultAudio) {
        _repeatResultAudio.pause();
        _repeatResultAudio = null;
    }
    _repeatResultCurrentIndex = 0;
}

// 전역 노출
window.showRepeatResult = showRepeatResult;
window.showRepeatResultNarration = showRepeatResultNarration;
window.playRepeatResultAudio = playRepeatResultAudio;
window.completeRepeatResult = completeRepeatResult;
window.cleanupRepeatResult = cleanupRepeatResult;

console.log('✅ [repeat-result] 로드 완료');
