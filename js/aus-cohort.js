/**
 * ================================================
 * aus-cohort.js
 * 호주과정 "신규 수집/인증" 코호트 게이트
 * ================================================
 *
 * 기준일(AUS_COLLECT_CUTOFF) 이후(포함)에 호주과정을 시작한 학생부터
 * 신규 수집 기능(브레인스토밍 메모, 스피킹 녹음, 라이팅 답안, 자동 인증률)을 적용한다.
 *
 * - 기준일 이전 시작자 = 기존 동작(수집 없음). 진행 중 학생 영향 0.
 * - standard/fast 구별 없이 "호주 시작일" 하나로만 판단.
 * - 시작일 값이 비어 있으면 안전하게 "기존 동작"으로 처리(false).
 */

// 실제 적용 기준일 — 이 날(포함) 이후 호주 시작자부터 신규 수집/인증 적용.
// 이 값은 건드리지 않는다.
var AUS_COLLECT_CUTOFF = '2026-06-14';

// ★ 기준일 게이트 ON/OFF 스위치
//   - true  : 기준일(AUS_COLLECT_CUTOFF) 적용 (실서비스, 기본값)
//   - false : 기준일 무시 → 모든 호주 학생에게 적용 (로컬 테스트 전용)
var AUS_GATE_ENABLED = true;

/**
 * 현재 로그인한 학생에게 신규 수집/인증을 적용할지 여부
 * @returns {boolean}
 */
function isAusCollectEnabled() {
    // 호주과정에서만 동작
    if (window.courseMode !== 'australia') return false;

    // 게이트 OFF(테스트 모드): 기준일 따지지 않고 모든 호주 학생에게 적용
    if (!AUS_GATE_ENABLED) return true;

    // 게이트 ON(실서비스): 호주 시작일이 기준일 이후인 학생만
    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : (window.currentUser || null);
    var start = user && user.australiaStartDate;
    if (!start) return false; // 시작일 없으면 안전하게 기존 동작

    // 'YYYY-MM-DD' 문자열 비교 = 날짜 비교 (시간 성분이 붙어도 앞 10자리로 비교)
    var startDay = String(start).slice(0, 10);
    return startDay >= AUS_COLLECT_CUTOFF;
}

window.AUS_COLLECT_CUTOFF = AUS_COLLECT_CUTOFF;
window.AUS_GATE_ENABLED = AUS_GATE_ENABLED;
window.isAusCollectEnabled = isAusCollectEnabled;

console.log('✅ aus-cohort.js 로드 (게이트 ' + (AUS_GATE_ENABLED ? 'ON, 기준일 ' + AUS_COLLECT_CUTOFF : 'OFF — 테스트 모드, 전원 적용') + ')');
