/**
 * ================================================
 * progress-tracker.js
 * 진도율 추적 시스템
 * ================================================
 * 
 * 기능:
 * 1. study_results_v3에서 완료 과제 조회 (V3)
 * 2. 과제 목록 화면: 완료 과제에 CSS 체크 아이콘 표시
 * 3. 요일별 진도 계산 (main.js에서 getDayProgress() 호출)
 * 
 * ★ 인증률(auth rate)과 독립 — 여기서는 "기록이 존재하면 완료"만 판단
 */

var ProgressTracker = {
    // 캐시: { 'reading_1': true, 'writing_3': true, ... }
    _completedTasks: {},
    _loaded: false,
    _loading: false,

    // ========================================
    // Supabase에서 학습 기록 조회 → 캐시
    // ========================================
    async loadCompletedTasks() {
        if (this._loading) return;
        this._loading = true;

        var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : window.currentUser;
        if (!user || !user.id || user.id === 'dev-user-001') {
            console.log('📊 [ProgressTracker] 개발 모드 — 진도 조회 생략');
            this._loading = false;
            this._loaded = true;
            return;
        }

        console.log('📊 [ProgressTracker] 학습 기록 조회 시작...');

        try {
            var records = await getCompletedTasksV3(user.id);
            
            // ★ markCompleted()로 캐시에 넣은 로컬 데이터 보존
            var localCache = {};
            var existingKeys = Object.keys(this._completedTasks || {});
            existingKeys.forEach(function(k) {
                if (ProgressTracker._completedTasks[k] && ProgressTracker._completedTasks[k]._local) {
                    localCache[k] = ProgressTracker._completedTasks[k];
                }
            });
            
            this._completedTasks = {};

            if (records && records.length > 0) {
                records.forEach(function(rec) {
                    if (rec.section_type && rec.module_number) {
                        // 키: "reading_1", "writing_3" 등
                        var key = rec.section_type + '_' + rec.module_number;
                        // week+day도 함께 저장 (일 단위 진도 계산용)
                        if (!ProgressTracker._completedTasks[key]) {
                            ProgressTracker._completedTasks[key] = {
                                week: rec.week,
                                day: rec.day,
                                completedAt: rec.completed_at
                            };
                        }
                        // vocab, intro-book은 week_day 키도 추가 (날짜별 구분)
                        if ((rec.section_type === 'vocab' || rec.section_type === 'intro-book') && rec.week && rec.day) {
                            var wdKey = rec.section_type + '_w' + rec.week + '_' + rec.day;
                            ProgressTracker._completedTasks[wdKey] = {
                                week: rec.week,
                                day: rec.day,
                                completedAt: rec.completed_at
                            };
                        }
                    }
                });
            }

            // ★ DB 결과에 없는 로컬 캐시 복원 (비동기 저장 완료 전 보호)
            Object.keys(localCache).forEach(function(k) {
                if (!ProgressTracker._completedTasks[k]) {
                    ProgressTracker._completedTasks[k] = localCache[k];
                    console.log('📊 [ProgressTracker] 로컬 캐시 복원:', k);
                }
            });
            
            this._loaded = true;
            console.log('📊 [ProgressTracker] 완료 과제:', Object.keys(this._completedTasks).length, '건');

        } catch (e) {
            console.error('❌ [ProgressTracker] 조회 실패:', e);
        }

        this._loading = false;
    },


    // ========================================
    // 특정 과제가 완료되었는지 판단
    // ========================================
    isTaskCompleted(taskType, moduleNumber) {
        var key = taskType + '_' + moduleNumber;
        return !!this._completedTasks[key];
    },

    // ========================================
    // 과제명(스케줄 텍스트)으로 완료 여부 확인
    // ========================================
    isTaskNameCompleted(taskName) {
        var parsed = (typeof parseTaskName === 'function') ? parseTaskName(taskName) : null;
        if (!parsed) return false;

        var type = parsed.type;
        var moduleNum = null;

        if (type === 'reading' || type === 'listening') {
            moduleNum = parsed.params.module;
        } else if (type === 'writing' || type === 'speaking') {
            moduleNum = parsed.params.number;
        } else if (type === 'vocab' || type === 'intro-book') {
            // vocab, intro-book은 week_day 기반으로 판단
            var ct = window.currentTest;
            if (ct && ct.currentWeek && ct.currentDay) {
                var wdKey = type + '_w' + ct.currentWeek + '_' + ct.currentDay;
                return !!this._completedTasks[wdKey];
            }
            return false;
        } else {
            return false;
        }

        if (!moduleNum) return false;
        return this.isTaskCompleted(type, moduleNum);
    },

    // ========================================
    // 특정 날짜의 진도율 계산
    // ========================================
    getDayProgress(programType, week, dayEn) {
        if (typeof getDayTasks !== 'function') return { completed: 0, total: 0 };

        var tasks = getDayTasks(programType, week, dayEn);
        var total = 0;
        var completed = 0;

        // 요일 영문 → 한글 매핑 (study_records의 day는 한글)
        var dayEnToKr = {
            sunday: '일', monday: '월', tuesday: '화',
            wednesday: '수', thursday: '목', friday: '금', saturday: '토'
        };
        var dayKr = dayEnToKr[dayEn] || '';

        tasks.forEach(function(taskName) {
            var parsed = (typeof parseTaskName === 'function') ? parseTaskName(taskName) : null;
            if (!parsed) return;

            // unknown 타입만 제외
            if (parsed.type === 'unknown') {
                return;
            }

            total++;

            // vocab, intro-book은 week_day 키로 날짜별 완료 확인
            if (parsed.type === 'vocab' || parsed.type === 'intro-book') {
                var wdKey = parsed.type + '_w' + week + '_' + dayKr;
                if (ProgressTracker._completedTasks[wdKey]) {
                    completed++;
                }
            } else if (ProgressTracker.isTaskNameCompleted(taskName)) {
                completed++;
            }
        });

        return { completed: completed, total: total };
    },

    // ========================================
    // UI: 과제 목록(section-card)에 체크 아이콘 추가
    // ========================================
    updateTaskCards() {
        if (!this._loaded) return;

        var cards = document.querySelectorAll('#taskListScreen .section-card');
        cards.forEach(function(card) {
            // 기존 체크 제거
            var existingCheck = card.querySelector('.task-complete-badge');
            if (existingCheck) existingCheck.remove();

            // h3에서 과제명 추출
            var h3 = card.querySelector('h3');
            if (!h3) return;
            var taskName = h3.textContent.trim();

            if (ProgressTracker.isTaskNameCompleted(taskName)) {
                // 완료 배지 추가
                var badge = document.createElement('div');
                badge.className = 'task-complete-badge';
                badge.innerHTML = '<span class="check-icon check-icon-sm"></span>';
                card.appendChild(badge);
                card.classList.add('task-completed');
            } else {
                card.classList.remove('task-completed');
            }
        });
    },

    // ========================================
    // 과제 완료 후 캐시 즉시 갱신 (재조회 없이)
    // ========================================
    markCompleted(taskType, moduleNumber) {
        var key = taskType + '_' + moduleNumber;
        var ct = window.currentTest;
        var week = ct ? ct.currentWeek : 1;
        var day = ct ? ct.currentDay : '월';
        this._completedTasks[key] = {
            week: week,
            day: day,
            completedAt: new Date().toISOString(),
            _local: true  // ★ 로컬 캐시 표시 (DB 재조회 시 보존용)
        };
        // vocab, intro-book은 week_day 키도 추가
        if (taskType === 'vocab' || taskType === 'intro-book') {
            var wdKey = taskType + '_w' + week + '_' + day;
            this._completedTasks[wdKey] = {
                week: week,
                day: day,
                completedAt: new Date().toISOString(),
                _local: true
            };
            console.log('📊 [ProgressTracker] 캐시 업데이트:', wdKey);
        }
        console.log('📊 [ProgressTracker] 캐시 업데이트:', key);
    }
};

// ========================================
// 자동 연동: showTaskListScreen에 체크 표시
// ★ AuthMonitor 연동 제거됨 (V3에서 auth-monitor.js 미사용)
// ========================================
(function() {
    var setupDone = false;

    function setup() {
        if (setupDone) return;

        // showTaskListScreen 감싸기 (과제 목록에 체크 표시)
        if (typeof window.showTaskListScreen === 'function') {
            var originalShowTaskList = window.showTaskListScreen;
            window.showTaskListScreen = function(week, dayKr, tasks) {
                originalShowTaskList(week, dayKr, tasks);
                // 과제 카드 렌더링 후 체크 표시
                setTimeout(function() {
                    ProgressTracker.updateTaskCards();
                }, 100);
            };
            console.log('📊 [ProgressTracker] showTaskListScreen 연동 완료');
        }

        setupDone = true;
    }

    // 페이지 로드 후 연결
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(setup, 800);
        });
    } else {
        setTimeout(setup, 800);
    }

    // 반복 체크
    var checkCount = 0;
    var checkInterval = setInterval(function() {
        if (setupDone || checkCount > 20) {
            clearInterval(checkInterval);
            return;
        }
        setup();
        checkCount++;
    }, 1000);
})();

console.log('✅ progress-tracker.js 로드 완료');
