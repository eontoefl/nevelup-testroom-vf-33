/**
 * module-controller-v2.js await 적용 검증 스크립트
 * 
 * 사용법: index_v2.html을 브라우저에서 연 후,
 *        개발자 도구(F12) → Console 탭에 이 내용을 전부 붙여넣고 Enter
 * 
 * 검증 항목:
 * 1. initComponent가 async 함수로 바뀌었는지
 * 2. _initComponentWithRetry가 initComponent를 await하는지
 * 3. ModuleController 클래스가 정상 로드되었는지
 */

(function() {
    console.log('========================================');
    console.log('🔍 module-controller-v2.js 검증 시작');
    console.log('========================================');
    
    let pass = 0;
    let fail = 0;
    
    // --- 검증 1: ModuleController 클래스 존재 여부 ---
    if (typeof ModuleController === 'function') {
        console.log('✅ [1/5] ModuleController 클래스가 정상 로드됨');
        pass++;
    } else {
        console.error('❌ [1/5] ModuleController 클래스를 찾을 수 없음');
        fail++;
        console.log('⛔ 나머지 검증 불가. 파일 로드 상태를 확인하세요.');
        return;
    }
    
    // --- 검증 2: initComponent가 async 함수인지 ---
    const proto = ModuleController.prototype;
    const initComp = proto.initComponent;
    
    if (initComp && initComp.constructor.name === 'AsyncFunction') {
        console.log('✅ [2/5] initComponent가 async 함수로 변경됨');
        pass++;
    } else if (initComp) {
        console.error('❌ [2/5] initComponent가 존재하지만 async가 아님 (일반 함수)');
        fail++;
    } else {
        console.error('❌ [2/5] initComponent 함수를 찾을 수 없음');
        fail++;
    }
    
    // --- 검증 3: _initComponentWithRetry가 async 함수인지 ---
    const retryFn = proto._initComponentWithRetry;
    
    if (retryFn && retryFn.constructor.name === 'AsyncFunction') {
        console.log('✅ [3/5] _initComponentWithRetry가 async 함수임');
        pass++;
    } else if (retryFn) {
        console.error('❌ [3/5] _initComponentWithRetry가 async가 아님');
        fail++;
    } else {
        console.error('❌ [3/5] _initComponentWithRetry 함수를 찾을 수 없음');
        fail++;
    }
    
    // --- 검증 4: _initComponentWithRetry 안에서 await this.initComponent가 있는지 ---
    if (retryFn) {
        const fnBody = retryFn.toString();
        if (fnBody.includes('await this.initComponent')) {
            console.log('✅ [4/5] _initComponentWithRetry가 initComponent를 await로 호출함');
            pass++;
        } else if (fnBody.includes('this.initComponent')) {
            console.error('❌ [4/5] initComponent를 호출하지만 await가 빠져 있음');
            fail++;
        } else {
            console.error('❌ [4/5] initComponent 호출 자체를 찾을 수 없음');
            fail++;
        }
    }
    
    // --- 검증 5: loadPreviousComponentAtLastQuestion도 async인지 (기존 안전한 방식 확인) ---
    const prevFn = proto.loadPreviousComponentAtLastQuestion;
    
    if (prevFn && prevFn.constructor.name === 'AsyncFunction') {
        console.log('✅ [5/5] loadPreviousComponentAtLastQuestion도 async 유지됨 (뒤로가기 정상)');
        pass++;
    } else if (prevFn) {
        console.error('❌ [5/5] loadPreviousComponentAtLastQuestion이 async가 아님');
        fail++;
    } else {
        console.error('❌ [5/5] loadPreviousComponentAtLastQuestion 함수를 찾을 수 없음');
        fail++;
    }
    
    // --- 결과 요약 ---
    console.log('');
    console.log('========================================');
    if (fail === 0) {
        console.log(`🎉 전체 통과! (${pass}/${pass + fail})`);
        console.log('   앞으로 가기(initComponent)와 뒤로 가기 모두');
        console.log('   데이터 로딩을 기다린 후 화면을 보여줍니다.');
    } else {
        console.error(`⚠️ ${fail}개 실패 (${pass} 통과 / ${fail} 실패)`);
        console.log('   위의 ❌ 항목을 확인하세요.');
    }
    console.log('========================================');
})();
