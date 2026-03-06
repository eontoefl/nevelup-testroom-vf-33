// 학습 일정으로 돌아가기
// V2: 팝업 규칙 삭제 — 개별 화면에서 자체 팝업 처리 후 호출
function backToSchedule() {
    console.log('🔙 [뒤로가기] 학습 일정으로 돌아가기 시작');
    
    // ★ 오답노트 패널 정리
    if (typeof ErrorNote !== 'undefined') {
        ErrorNote.hide();
    }
    
    // beforeunload 경고 해제
    if (window._beforeUnloadHandler) {
        window.removeEventListener('beforeunload', window._beforeUnloadHandler);
        window._beforeUnloadHandler = null;
        console.log('🚪 beforeunload 경고 해제 (뒤로가기)');
    }
    
    // 모든 미디어 즉시 중지
    stopAllMedia();
    
    // 모든 섹션 cleanup 호출
    if (typeof cleanupListeningConver === 'function') {
        cleanupListeningConver();
    }
    if (typeof cleanupListeningAnnouncement === 'function') {
        cleanupListeningAnnouncement();
    }
    if (typeof cleanupListeningResponse === 'function') {
        cleanupListeningResponse();
    }
    if (typeof cleanupListeningLecture === 'function') {
        cleanupListeningLecture();
    }
    if (typeof cleanupSpeakingRepeat === 'function') {
        cleanupSpeakingRepeat();
    }
    if (typeof cleanupSpeakingInterview === 'function') {
        cleanupSpeakingInterview();
    }
    if (typeof cleanupVocabTest === 'function') {
        cleanupVocabTest();
    }
    
    // 타이머 정지
    stopAllTimers();
    
    // 2차 풀이 플로팅 UI 제거
    const retakeFloating = document.getElementById('retakeFloatingUI');
    if (retakeFloating) retakeFloating.remove();
    
    // 모든 화면 숨기기 (inline style 제거)
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        screen.style.display = ''; // inline style 제거!
    });
    
    // result-screen, test-screen도 숨기기 (.screen 클래스가 아닌 해설/결과 화면)
    document.querySelectorAll('.result-screen, .test-screen').forEach(screen => {
        screen.style.display = 'none';
    });
    
    // 학습 일정 화면 표시
    const scheduleScreen = document.getElementById('scheduleScreen');
    scheduleScreen.classList.add('active');
    
    // 학습 일정 초기화
    if (currentUser) {
        initScheduleScreen();
    }
    
    console.log('✅ [뒤로가기] 학습 일정으로 돌아가기 완료');
}

// 모든 미디어 즉시 중지
function stopAllMedia() {
    console.log('🛑 모든 미디어 중지 시작');
    
    // 모든 Audio 요소 중지
    document.querySelectorAll('audio').forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
        audio.src = '';
    });
    
    // 모든 Video 요소 중지
    document.querySelectorAll('video').forEach(video => {
        video.pause();
        video.currentTime = 0;
        video.src = '';
    });
    
    console.log('✅ 모든 미디어 중지 완료');
}

// [V3] 삭제됨: backToScheduleFromResult — "시험 완료!" 트로피 화면 제거로 불필요
