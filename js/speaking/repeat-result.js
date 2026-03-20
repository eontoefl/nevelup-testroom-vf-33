/**
 * repeat-result.js
 * 스피킹 - 따라말하기 복습(결과) 화면
 * 
 * 완전 독립형: 컴포넌트 없이 데이터만으로 복습 화면을 표시합니다.
 * 오디오 재생을 자체적으로 처리합니다.
 * 
 * 네비게이션:
 *   - 이전/다음 문제 전환은 explain-viewer.js의 하단 플로팅 네비가 담당
 *   - explain-viewer가 showRepeatResultNarration(set, index)를 직접 호출
 *   - 이 파일은 데이터 표시 + 오디오 재생만 담당
 */

// 내부 상태
let _repeatResultAudio = null;
let _repeatResultCurrentIndex = 0;

/**
 * 복습 화면 표시 (초기 렌더링)
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
 * explain-viewer.js에서 문제 전환 시 직접 호출
 * @param {Object} set - 세트 데이터
 * @param {number} index - 오디오 인덱스
 */
function showRepeatResultNarration(set, index) {
    console.log(`🎯 [repeat-result] 오디오 ${index + 1}/${set.audios.length} 표시`);
    
    // 기존 오디오 정지
    if (_repeatResultAudio) {
        _repeatResultAudio.pause();
        _repeatResultAudio = null;
    }
    
    _repeatResultCurrentIndex = index;
    const audio = set.audios[index];
    
    // Context 표시 (문제 전환 시에도 갱신)
    const contextEl = document.getElementById('repeatResultContext');
    if (contextEl) {
        contextEl.textContent = set.contextText;
    }
    
    // 이미지 표시
    const illustrationImg = document.getElementById('repeatResultIllustration');
    const noImageEl = document.getElementById('repeatResultNoImage');
    if (illustrationImg) {
        if (audio.image && audio.image !== 'PLACEHOLDER') {
            illustrationImg.src = audio.image;
            illustrationImg.style.display = 'block';
            if (noImageEl) noImageEl.style.display = 'none';
        } else {
            illustrationImg.style.display = 'none';
            if (noImageEl) noImageEl.style.display = 'flex';
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
        _resetListenBtnUI(listenBtn);
        listenBtn.onclick = () => _toggleRepeatResultAudio(audio.audio, listenBtn);
    }
}

/**
 * 버튼 UI를 재생 상태로 리셋
 */
function _resetListenBtnUI(btn) {
    if (!btn) return;
    const icon = btn.querySelector('i');
    const label = btn.querySelector('span');
    if (icon) { icon.className = 'fas fa-play-circle'; }
    if (label) { label.textContent = 'Listen Again'; }
}

/**
 * 재생/일시정지 토글
 */
function _toggleRepeatResultAudio(audioUrl, btn) {
    // 현재 재생 중이면 일시정지
    if (_repeatResultAudio && !_repeatResultAudio.paused) {
        _repeatResultAudio.pause();
        _resetListenBtnUI(btn);
        return;
    }
    
    // 일시정지 상태에서 같은 오디오면 이어서 재생
    if (_repeatResultAudio && _repeatResultAudio.paused && _repeatResultAudio._srcUrl === audioUrl) {
        _repeatResultAudio.play().catch(e => console.error('❌ [repeat-result] 재생 실패:', e));
        _setListenBtnPause(btn);
        return;
    }
    
    // 새 오디오 재생
    playRepeatResultAudio(audioUrl);
    _setListenBtnPause(btn);
    
    // 재생 완료 시 버튼 복원
    if (_repeatResultAudio) {
        _repeatResultAudio.onended = () => _resetListenBtnUI(btn);
    }
}

function _setListenBtnPause(btn) {
    if (!btn) return;
    const icon = btn.querySelector('i');
    const label = btn.querySelector('span');
    if (icon) { icon.className = 'fas fa-pause-circle'; }
    if (label) { label.textContent = 'Pause'; }
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
    _repeatResultAudio._srcUrl = audioUrl;
    _repeatResultAudio.play().catch(error => {
        console.error('❌ [repeat-result] 오디오 재생 실패:', error);
    });
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
    _resetListenBtnUI(document.getElementById('repeatResultListenBtn'));
}

// 전역 노출
window.showRepeatResult = showRepeatResult;
window.showRepeatResultNarration = showRepeatResultNarration;

console.log('✅ [Speaking] repeat-result.js 로드 완료');
