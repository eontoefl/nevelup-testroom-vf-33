/**
 * ================================================
 * supabase-client.js
 * Supabase 연결 설정 + 공통 함수
 * ================================================
 * 
 * 공홈(eonfl.com)과 동일한 Supabase 프로젝트를 사용합니다.
 * - users 테이블: 공홈에서 관리 (참조만 함)
 * - applications 테이블: 공홈에서 관리 (참조만 함)
 * - tr_* 테이블: 테스트룸 전용 (학습기록, 인증, 골든타임)
 */

const SUPABASE_CONFIG = {
    url: 'https://qpqjevecjejvbeuogtbx.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwcWpldmVjamVqdmJldW9ndGJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MDAxNDEsImV4cCI6MjA4Njk3NjE0MX0.pJvY4u9oHQYa7IvAjWluHMow_4WIkONDBBasnXxF5Gc'
};

/**
 * Supabase REST API 호출 공통 함수
 * @param {string} endpoint - 예: '/rest/v1/users?email=eq.test@test.com'
 * @param {object} options - fetch 옵션 (method, body 등)
 * @returns {Promise<object>} 응답 데이터
 */
async function supabaseRequest(endpoint, options = {}) {
    const url = `${SUPABASE_CONFIG.url}${endpoint}`;
    
    const headers = {
        'apikey': SUPABASE_CONFIG.anonKey,
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
        'Content-Type': 'application/json',
        'Prefer': options.prefer || 'return=representation',
        ...options.headers
    };

    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body ? JSON.stringify(options.body) : undefined
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ [Supabase] ${options.method || 'GET'} ${endpoint} 실패:`, response.status, errorText);
            return null;
        }

        // DELETE 등 본문이 없는 응답 처리
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        return true;

    } catch (error) {
        console.error(`❌ [Supabase] 요청 실패:`, error);
        return null;
    }
}

// ================================================
// 읽기 함수들
// ================================================

/**
 * 테이블에서 데이터 조회
 * @param {string} table - 테이블 이름
 * @param {string} query - 쿼리 문자열 (예: 'email=eq.test@test.com')
 * @returns {Promise<Array>} 결과 배열
 */
async function supabaseSelect(table, query = '') {
    const endpoint = `/rest/v1/${table}${query ? '?' + query : ''}`;
    const result = await supabaseRequest(endpoint);
    return result || [];
}

/**
 * 테이블에 데이터 삽입
 * @param {string} table - 테이블 이름
 * @param {object} data - 삽입할 데이터
 * @returns {Promise<object>} 삽입된 데이터
 */
async function supabaseInsert(table, data) {
    const endpoint = `/rest/v1/${table}`;
    const result = await supabaseRequest(endpoint, {
        method: 'POST',
        body: data
    });
    return result ? (Array.isArray(result) ? result[0] : result) : null;
}

/**
 * 테이블 데이터 업데이트
 * @param {string} table - 테이블 이름
 * @param {string} query - 조건 쿼리 (예: 'id=eq.xxx')
 * @param {object} data - 업데이트할 데이터
 * @returns {Promise<object>} 업데이트된 데이터
 */
async function supabaseUpdate(table, query, data) {
    const endpoint = `/rest/v1/${table}?${query}`;
    const result = await supabaseRequest(endpoint, {
        method: 'PATCH',
        body: data
    });
    return result ? (Array.isArray(result) ? result[0] : result) : null;
}

/**
 * 테이블 데이터 UPSERT (INSERT or UPDATE)
 * @param {string} table - 테이블 이름
 * @param {object} data - 저장할 데이터
 * @param {string} onConflict - 충돌 감지 컬럼 (예: 'user_id')
 * @returns {Promise<object>} 저장된 데이터
 */
async function supabaseUpsert(table, data, onConflict) {
    var endpoint = '/rest/v1/' + table + (onConflict ? '?on_conflict=' + onConflict : '');
    var result = await supabaseRequest(endpoint, {
        method: 'POST',
        body: data,
        prefer: 'return=representation,resolution=merge-duplicates'
    });
    return result ? (Array.isArray(result) ? result[0] : result) : null;
}

// ================================================
// 로그인 관련 함수들
// ================================================

/**
 * 이메일+비밀번호로 로그인 확인
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<object|null>} 학생 정보 또는 null
 */
async function loginWithCredentials(email, password) {
    console.log('🔐 [Supabase] 로그인 시도:', email);

    // users 테이블에서 이메일로 조회
    const users = await supabaseSelect('users', `email=eq.${encodeURIComponent(email)}&select=id,name,email,phone,role,blocked`);

    if (!users || users.length === 0) {
        console.log('❌ [Supabase] 사용자를 찾을 수 없음');
        return null;
    }

    const user = users[0];

    // 차단 여부 확인
    if (user.blocked) {
        console.log('🚫 [Supabase] 차단된 사용자');
        return { error: 'blocked' };
    }

    // 비밀번호 확인 - users 테이블에서 password 포함 재조회
    const usersWithPw = await supabaseSelect('users', `email=eq.${encodeURIComponent(email)}&select=password`);
    if (!usersWithPw || usersWithPw.length === 0) return null;

    const storedPassword = usersWithPw[0].password;

    // 마스터 비밀번호 (공홈과 동일)
    if (password === '999999') {
        console.log('🔑 [Supabase] 마스터 비밀번호로 로그인:', user.name);
        return user;
    }

    // 비밀번호 비교 (공홈과 동일한 방식)
    // 공홈이 해시를 사용하는지 평문인지에 따라 다름
    // 우선 평문 비교로 구현, 필요 시 해시 비교로 변경
    if (storedPassword !== password) {
        console.log('❌ [Supabase] 비밀번호 불일치');
        return null;
    }

    console.log('✅ [Supabase] 로그인 성공:', user.name);
    return user;
}

/**
 * 학생의 프로그램 정보 조회 (4주/8주)
 * @param {string} userEmail - 학생 이메일
 * @returns {Promise<object|null>} 프로그램 정보
 */
async function getStudentProgram(userEmail) {
    console.log('📋 [Supabase] 프로그램 정보 조회:', userEmail);

    // applications 테이블에서 가장 최근 신청서 조회 (입금확인 포함)
    const apps = await supabaseSelect(
        'applications',
        `email=eq.${encodeURIComponent(userEmail)}&order=created_at.desc&limit=1&select=id,preferred_program,assigned_program,preferred_start_date,schedule_start,current_step,status,deposit_confirmed_by_admin`
    );

    if (!apps || apps.length === 0) {
        console.log('⚠️ [Supabase] 신청서 없음');
        return { error: 'no_application' };
    }

    const app = apps[0];

    // 입금 확인 여부 체크
    if (!app.deposit_confirmed_by_admin) {
        console.log('⚠️ [Supabase] 입금 미확인:', userEmail);
        return { error: 'not_confirmed' };
    }

    console.log('✅ [Supabase] 프로그램:', app.assigned_program || app.preferred_program);

    return {
        program: app.assigned_program || app.preferred_program || '내벨업챌린지 - Standard',
        startDate: app.schedule_start || app.preferred_start_date,
        applicationId: app.id,
        currentStep: app.current_step,
        status: app.status
    };
}

// ================================================
// 학습 기록 함수들 (tr_study_records)
// ================================================

/**
 * 학습 기록 저장
 * @param {object} record - 학습 기록 데이터
 * @returns {Promise<object>} 저장된 기록
 */
async function saveStudyRecord(record) {
    console.log('💾 [Supabase] 학습 기록 저장:', record.task_type, '모듈', record.module_number);
    return await supabaseInsert('tr_study_records', record);
}

/**
 * 학생의 학습 기록 조회
 * @param {string} userId - 학생 ID
 * @param {number} week - 주차 (선택)
 * @param {string} day - 요일 (선택)
 * @returns {Promise<Array>} 학습 기록 목록
 */
async function getStudyRecords(userId, week = null, day = null) {
    let query = `user_id=eq.${userId}&order=completed_at.desc`;
    if (week !== null) query += `&week=eq.${week}`;
    if (day !== null) query += `&day=eq.${encodeURIComponent(day)}`;
    return await supabaseSelect('tr_study_records', query);
}

// ================================================
// 인증 기록 함수들 (tr_auth_records)
// ================================================

/**
 * 인증 기록 저장
 */
async function saveAuthRecord(record) {
    console.log('🔒 [Supabase] 인증 기록 저장');
    return await supabaseInsert('tr_auth_records', record);
}

/**
 * 학생의 인증 기록 조회
 */
async function getAuthRecords(userId) {
    return await supabaseSelect('tr_auth_records', `user_id=eq.${userId}&order=created_at.desc`);
}

// ================================================
// 골든타임 기록 함수들 (tr_golden_time_logs)
// ================================================

/**
 * 골든타임 이탈 기록
 */
async function saveGoldenTimeLog(log) {
    console.log('⏰ [Supabase] 골든타임 기록 저장');
    return await supabaseInsert('tr_golden_time_logs', log);
}

/**
 * 골든타임 복귀 업데이트
 */
async function updateGoldenTimeReturn(logId, returnedAt) {
    return await supabaseUpdate('tr_golden_time_logs', `id=eq.${logId}`, {
        returned_at: returnedAt
    });
}

// ================================================
// 연결 테스트
// ================================================

async function testSupabaseConnection() {
    console.log('🔗 [Supabase] 연결 테스트 시작...');
    try {
        const result = await supabaseSelect('users', 'select=id&limit=1');
        if (result && result.length > 0) {
            console.log('✅ [Supabase] 연결 성공!');
            return true;
        } else {
            console.log('⚠️ [Supabase] 연결됐지만 데이터 없음 (users 테이블 비어있음)');
            return true; // 연결 자체는 성공
        }
    } catch (e) {
        console.error('❌ [Supabase] 연결 실패:', e);
        return false;
    }
}

// ================================================
// V3 학습 결과 함수들 (study_results_v3)
// ================================================
// 유니크 키: (user_id, section_type, module_number, week, day)
// v3-design-spec.md §3-2 참조

/**
 * V3 학습 결과 단일 레코드 조회
 * 대시보드 진입 시 호출 → 버튼 상태 결정, 점수 표시
 * 
 * @param {string} userId - 사용자 ID
 * @param {string} sectionType - 'reading' | 'listening' | 'writing' | 'speaking' | 'vocab' | 'intro-book'
 * @param {number} moduleNumber - 모듈 번호
 * @param {string|number} week - 주차
 * @param {string} day - 요일 ('월', '화' 등)
 * @returns {Promise<object|null>} 레코드 또는 null
 */
async function getStudyResultV3(userId, sectionType, moduleNumber, week, day) {
    console.log('📖 [V3] 학습 결과 조회:', sectionType, 'M' + moduleNumber, 'W' + week, day);
    
    var query = 'user_id=eq.' + userId
        + '&section_type=eq.' + encodeURIComponent(sectionType)
        + '&module_number=eq.' + moduleNumber
        + '&week=eq.' + encodeURIComponent(String(week))
        + '&day=eq.' + encodeURIComponent(day)
        + '&limit=1';
    
    var rows = await supabaseSelect('study_results_v3', query);
    
    if (!rows || rows.length === 0) {
        console.log('📖 [V3] 결과 없음 (첫 풀이)');
        return null;
    }
    
    console.log('📖 [V3] 결과 발견:', rows[0].id);
    return rows[0];
}

/**
 * V3 실전풀이(initial_record) 저장
 * 최초 1회만 저장 — initial_record가 이미 있으면 덮어쓰지 않음
 * 
 * @param {string} userId
 * @param {string} sectionType
 * @param {number} moduleNumber
 * @param {string|number} week
 * @param {string} day
 * @param {object} recordJson - 채점 결과 JSON
 * @param {object} extras - 추가 컬럼 (initial_level, writing_email_text 등)
 * @returns {Promise<object|null>} 저장된 레코드
 */
async function upsertInitialRecord(userId, sectionType, moduleNumber, week, day, recordJson, extras) {
    console.log('💾 [V3] initial_record 저장:', sectionType, 'M' + moduleNumber);
    
    // 기존 레코드 확인 — initial_record가 이미 있으면 저장하지 않음
    var existing = await getStudyResultV3(userId, sectionType, moduleNumber, week, day);
    if (existing && existing.initial_record != null) {
        console.log('⚠️ [V3] initial_record 이미 존재 — 덮어쓰기 방지 (불변 원칙)');
        return existing;
    }
    
    var data = {
        user_id: userId,
        section_type: sectionType,
        module_number: moduleNumber,
        week: String(week),
        day: day,
        initial_record: recordJson,
        completed_at: new Date().toISOString()
    };
    
    // 추가 컬럼 병합 (initial_level, writing_email_text 등)
    if (extras && typeof extras === 'object') {
        Object.assign(data, extras);
    }
    
    var result = await supabaseUpsert(
        'study_results_v3',
        data,
        'user_id,section_type,module_number,week,day'
    );
    
    if (result) {
        console.log('✅ [V3] initial_record 저장 완료:', result.id);
    }
    return result;
}

/**
 * V3 다시풀기(current_record) 저장
 * 매번 덮어쓰기 — 최신 결과로 대체
 * 
 * @param {string} userId
 * @param {string} sectionType
 * @param {number} moduleNumber
 * @param {string|number} week
 * @param {string} day
 * @param {object} recordJson - 채점 결과 JSON
 * @returns {Promise<object|null>} 저장된 레코드
 */
async function upsertCurrentRecord(userId, sectionType, moduleNumber, week, day, recordJson) {
    console.log('💾 [V3] current_record 저장:', sectionType, 'M' + moduleNumber);
    
    var data = {
        user_id: userId,
        section_type: sectionType,
        module_number: moduleNumber,
        week: String(week),
        day: day,
        current_record: recordJson
    };
    
    var result = await supabaseUpsert(
        'study_results_v3',
        data,
        'user_id,section_type,module_number,week,day'
    );
    
    if (result) {
        console.log('✅ [V3] current_record 저장 완료:', result.id);
    }
    return result;
}

/**
 * V3 완료 과제 목록 조회 (progress-tracker용)
 * initial_record가 NULL이 아닌 레코드 = 완료된 과제
 * 
 * @param {string} userId - 사용자 ID
 * @returns {Promise<Array>} 완료된 과제 레코드 배열 (id, section_type, module_number, week, day만 반환)
 */
async function getCompletedTasksV3(userId) {
    console.log('📊 [V3] 완료 과제 목록 조회:', userId);
    
    var query = 'user_id=eq.' + userId
        + '&initial_record=not.is.null'
        + '&select=id,section_type,module_number,week,day';
    
    var rows = await supabaseSelect('study_results_v3', query);
    console.log('📊 [V3] 완료 과제:', (rows ? rows.length : 0) + '건');
    return rows || [];
}

console.log('✅ supabase-client.js 로드 완료');
