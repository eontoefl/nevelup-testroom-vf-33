// ================================================
// Speaking - 따라말하기 어댑터 (v=20250212-001)
// ================================================
// Module 책임: 화면 전환, 진행률, 초기화 시 화면 설정, 복습 완료 후 이동

// ============================================
// 전역 컴포넌트 인스턴스
// ============================================
let currentRepeatComponent = null;

// ============================================
// 테스트 함수: 따라말하기 복습 화면 바로 보기
// ============================================
async function testRepeatResultScreen() {
    console.log('🧪 [테스트] 따라말하기 복습 화면 테스트 시작');
    
    // 컴포넌트 생성
    currentRepeatComponent = new RepeatComponent();
    window.currentRepeatComponent = currentRepeatComponent;
    
    // 데이터 로드
    await currentRepeatComponent.loadRepeatData();
    
    // 모든 화면 숨기기
    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.display = 'none';
    });
    
    // 복습 화면 표시
    const repeatResultScreen = document.getElementById('speakingRepeatResultScreen');
    repeatResultScreen.style.display = 'block';
    
    // 첫 번째 세트의 데이터로 복습 화면 표시
    const set = currentRepeatComponent.speakingRepeatData.sets[0];
    currentRepeatComponent.showRepeatResult({ set: set });
    
    console.log('✅ [테스트] 따라말하기 복습 화면 표시 완료');
}

// ============================================
// 모듈 시스템용 초기화
// ============================================
async function initRepeatComponent(setId, onCompleteCallback) {
    console.log(`📦 [모듈] initRepeatComponent - setId: ${setId}`);
    
    // ★ 이전 컴포넌트가 있으면 정리 후 제거
    if (currentRepeatComponent) {
        console.log(`🧹 [모듈] 이전 Repeat Component 정리`);
        if (typeof currentRepeatComponent.cleanup === 'function') {
            currentRepeatComponent.cleanup();
        }
        currentRepeatComponent = null;
        window.currentRepeatComponent = null;
    }
    
    currentRepeatComponent = new RepeatComponent();
    window.currentRepeatComponent = currentRepeatComponent;
    
    // 완료 콜백 설정
    currentRepeatComponent.onComplete = function(results) {
        console.log(`✅ [모듈] Repeat Component 완료`);
        if (onCompleteCallback) onCompleteCallback(results);
    };
    
    await currentRepeatComponent.init(setId);
}

// ============================================
// 초기화
// ============================================
async function initSpeakingRepeat() {
    console.log('🎤 [Repeat] 초기화 시작...');
    
    // 컴포넌트 생성
    currentRepeatComponent = new RepeatComponent();
    window.currentRepeatComponent = currentRepeatComponent;
    
    // 데이터 로드
    await currentRepeatComponent.loadRepeatData();
    
    // 화면 전환 (Module 책임)
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        screen.style.display = 'none';
    });
    
    const repeatScreen = document.getElementById('speakingRepeatScreen');
    repeatScreen.classList.add('active');
    repeatScreen.style.display = 'block';
    
    console.log('speakingRepeatScreen 표시 완료');
    
    // 인트로 화면 표시 (Component 책임)
    currentRepeatComponent.showIntroScreen();
    
    console.log('✅ [Repeat] 초기화 완료');
}

// ============================================
// 완료 (Module 책임: 화면 전환)
// ============================================
function completeSpeakingRepeat() {
    console.log('📤 [Repeat Module] 완료 시작...');
    
    if (!currentRepeatComponent) {
        console.error('❌ 컴포넌트가 초기화되지 않았습니다.');
        return;
    }
    
    // 컴포넌트 완료 실행
    const resultData = currentRepeatComponent.completeSpeakingRepeat();
    
    // 화면 전환 (Module 책임)
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    document.getElementById('speakingRepeatResultScreen').classList.add('active');
    
    // 복습 화면 표시 (Component 책임)
    currentRepeatComponent.showRepeatResult(resultData);
    
    console.log('✅ [Repeat Module] 완료');
}

// ============================================
// 복습 완료 (Module 책임: backToSchedule 호출)
// ============================================
function completeRepeatResult() {
    console.log('✅ [복습 화면] 복습 완료');
    
    if (!currentRepeatComponent) {
        console.error('❌ 컴포넌트가 초기화되지 않았습니다.');
        return;
    }
    
    // 컴포넌트 복습 완료 실행
    const completed = currentRepeatComponent.completeRepeatResult();
    
    if (completed) {
        // 학습 일정으로 돌아가기 (Module 책임)
        backToSchedule();
    }
}

// ============================================
// Cleanup (Module 책임: 화면 전환 시 호출)
// ============================================
function cleanupSpeakingRepeat() {
    console.log('🧹 [Repeat Module] Cleanup...');
    
    if (currentRepeatComponent) {
        currentRepeatComponent.cleanup();
        currentRepeatComponent = null;
        window.currentRepeatComponent = null;
    }
}

window.initRepeatComponent = initRepeatComponent;
window.initSpeakingRepeat = initSpeakingRepeat;
window.completeSpeakingRepeat = completeSpeakingRepeat;
window.completeRepeatResult = completeRepeatResult;
window.cleanupSpeakingRepeat = cleanupSpeakingRepeat;

// ============================================
// 전역 등록
// ============================================
window.initSpeakingRepeat = initSpeakingRepeat;
window.cleanupSpeakingRepeat = cleanupSpeakingRepeat;

console.log('✅ Speaking-Repeat 어댑터 로드 완료 (v=20250212-001)');
console.log('✅ initSpeakingRepeat 타입:', typeof initSpeakingRepeat);
console.log('✅ window.initSpeakingRepeat 타입:', typeof window.initSpeakingRepeat);
