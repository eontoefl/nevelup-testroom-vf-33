/**
 * ================================================
 * DiscussionComponent.js v=001
 * 토론형 글쓰기 컴포넌트
 * ================================================
 * 
 * 책임:
 * - 데이터 처리 (6): Sheet 로드/파싱/Demo 데이터
 * - 프로필 이미지 관리 (7): 교수/학생 이미지 + 이름 치환
 * - 문제 화면 (5): 수업 주제 + 학생 의견 렌더링
 * - 텍스트 편집 (7): 입력/저장/Undo/Redo/Cut/Paste
 * - 단어 수 관리 (4): 계산/표시/토글/1,000 단어 제한
 * - 제출 & 결과 (5): 제출/TXT 다운로드/결과 데이터 생성
 * - 내부 상태 (2): currentSet/Question
 * - 결과 화면 (7): 결과 표시/Bullet 하이라이트/문제 토글
 * 
 * 총 42개 요소
 */

class DiscussionComponent {
    constructor(setNumber) {
        console.log(`[DiscussionComponent] 생성 - setNumber: ${setNumber}`);
        
        this.setNumber = setNumber;
        // ============================================
        // 1. 데이터 처리 (6개)
        // ============================================
        
        // 데이터 저장
        this.writingDiscussionData = null;
        
        
        // ============================================
        // 2. 프로필 이미지 관리 (7개)
        // ============================================
        
        // 교수 프로필 (남/녀)
        this.PROFESSOR_PROFILES = {
            male: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_prof_M.png',
            female: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_prof_F.png'
        };
        
        // 여학생 프로필 (7명)
        this.FEMALE_STUDENT_PROFILES = [
            { name: 'Amy', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_F1.png' },
            { name: 'Emma', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_F2.png' },
            { name: 'Anna', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_F3.png' },
            { name: 'Lucy', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_F4.png' },
            { name: 'Mia', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_F5.png' },
            { name: 'Lily', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_F6.png' },
            { name: 'Sarah', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_F7.png' }
        ];
        
        // 남학생 프로필 (7명)
        this.MALE_STUDENT_PROFILES = [
            { name: 'Tom', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_M1.png' },
            { name: 'Jack', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_M2.png' },
            { name: 'Ben', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_M3.png' },
            { name: 'Sam', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_M4.png' },
            { name: 'John', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_M5.png' },
            { name: 'Paul', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_M6.png' },
            { name: 'Mark', image: 'https://eontoefl.github.io/toefl-audio/writing/discussion/image/discussion_image_M7.png' }
        ];
        
        // 현재 세트의 프로필 정보
        this.currentDiscussionProfiles = null;
        
        // ============================================
        // 3. 텍스트 편집 (답안 처리 포함, 7개)
        // ============================================
        
        // 답안 저장
        this.discussionAnswers = [];
        
        // Undo/Redo 스택
        this.discussionUndoStack = [];
        this.discussionRedoStack = [];
        
        // ============================================
        // 4. 단어 수 관리 (4개)
        // ============================================
        
        // 최대 단어 수 제한
        this.DISCUSSION_WORD_LIMIT = 1000;
        
        // ============================================
        // 5. 내부 상태 + 타이머 (6개)
        // ============================================
        
        // 현재 세트/문제 번호
        this.currentDiscussionSet = 0;
        this.currentDiscussionQuestion = 0;
        

    }
    
    // ============================================
    // 데이터 처리 함수
    // ============================================
    
    /**
     * 컴포넌트 초기화 (데이터 로드 + 세트 찾기 + 문제 표시)
     */
    async init() {
        console.log('[DiscussionComponent] 초기화 시작');
        
        try {
            // 1. 데이터 로드 (외부 로더 사용)
            this.writingDiscussionData = await window.loadDiscussionData();
            if (!this.writingDiscussionData) {
                throw new Error('데이터를 불러올 수 없습니다');
            }
            
            // 2. 세트 찾기 (setNumber → 배열 인덱스 변환)
            const setIndex = this.setNumber - 1;
            if (setIndex < 0 || setIndex >= this.writingDiscussionData.sets.length) {
                throw new Error(`세트를 찾을 수 없습니다: ${this.setNumber}`);
            }
            
            // 3. 문제 로드
            this.loadDiscussionQuestion(setIndex);
            
        } catch (error) {
            console.error('[DiscussionComponent] 초기화 실패:', error);
            alert('토론 작성 데이터를 불러오는데 실패했습니다.');
        }
    }
    
    // ============================================
    // 프로필 이미지 관리 함수 (7개)
    // ============================================
    
    /**
     * 랜덤 프로필 선택 (교수 1명 + 학생 2명, 남/녀 조합)
     */
    getRandomProfiles() {
        // 교수 랜덤 (남/녀)
        const professorGender = Math.random() < 0.5 ? 'male' : 'female';
        const professorImage = this.PROFESSOR_PROFILES[professorGender];
        
        // 학생 2명 (남/녀 조합)
        const femaleStudent = this.FEMALE_STUDENT_PROFILES[Math.floor(Math.random() * this.FEMALE_STUDENT_PROFILES.length)];
        const maleStudent = this.MALE_STUDENT_PROFILES[Math.floor(Math.random() * this.MALE_STUDENT_PROFILES.length)];
        
        // 순서 랜덤 (50% 확률)
        const students = Math.random() < 0.5
            ? [femaleStudent, maleStudent]
            : [maleStudent, femaleStudent];
        
        return {
            professor: { image: professorImage },
            student1: students[0],
            student2: students[1]
        };
    }
    
    /**
     * 텍스트 내 학생 이름 치환 ({name1}, {name2} → 실제 이름)
     */
    replaceStudentNames(text, profiles) {
        if (!text || !profiles) return text;
        
        return text
            .replace(/\{name1\}/g, profiles.student1.name)
            .replace(/\{name2\}/g, profiles.student2.name);
    }
    
    /**
     * 결과 화면용 이름 치환
     */
    replaceStudentNamesInResult(text, profiles) {
        return this.replaceStudentNames(text, profiles);
    }
    
    // ============================================
    // 문제 화면 함수 (5개)
    // ============================================
    
    /**
     * 문제 로드
     */
    loadDiscussionQuestion(setIndex) {
        console.log(`📄 [Discussion] 문제 로드: Set ${setIndex}`);
        
        if (!this.writingDiscussionData || setIndex >= this.writingDiscussionData.sets.length) {
            console.error('❌ 유효하지 않은 세트 인덱스:', setIndex);
            return;
        }
        
        this.currentDiscussionSet = setIndex;
        this.currentDiscussionQuestion = 0; // Discussion은 세트당 1문제
        
        // 프로필 선택: 2차 풀이면 1차에서 저장한 프로필 재사용, 아니면 랜덤 생성
        const savedProfiles = sessionStorage.getItem('discussionProfiles');
        if (window.isSecondAttempt && savedProfiles) {
            try {
                this.currentDiscussionProfiles = JSON.parse(savedProfiles);
                console.log('♻️ [Discussion] 1차 프로필 재사용:', this.currentDiscussionProfiles.student1.name, this.currentDiscussionProfiles.student2.name);
            } catch (e) {
                console.warn('⚠️ [Discussion] 프로필 복원 실패, 랜덤 생성');
                this.currentDiscussionProfiles = this.getRandomProfiles();
            }
        } else {
            this.currentDiscussionProfiles = this.getRandomProfiles();
            // 1차 풀이: sessionStorage에 저장 (ko-모범답안 & 2차 풀이에서 재사용)
            sessionStorage.setItem('discussionProfiles', JSON.stringify(this.currentDiscussionProfiles));
            console.log('💾 [Discussion] 프로필 저장:', this.currentDiscussionProfiles.student1.name, this.currentDiscussionProfiles.student2.name);
        }
        
        // 전역 저장 (결과 화면에서 재사용)
        window.currentDiscussionProfiles = this.currentDiscussionProfiles;
        
        this.renderDiscussionQuestion();
    }
    
    /**
     * 문제 화면 렌더링
     */
    renderDiscussionQuestion() {
        const setData = this.writingDiscussionData.sets[this.currentDiscussionSet];
        // sessionStorage 우선 → 인스턴스 → window → 기본값
        let profiles = null;
        const _renderSavedProfiles = sessionStorage.getItem('discussionProfiles');
        if (_renderSavedProfiles) {
            try { profiles = JSON.parse(_renderSavedProfiles); } catch(e) {}
        }
        if (!profiles) {
            profiles = this.currentDiscussionProfiles || window.currentDiscussionProfiles;
        }
        if (!profiles) {
            profiles = { student1: { name: 'Student 1' }, student2: { name: 'Student 2' } };
        }
        
        console.log('🎨 [Discussion] 문제 렌더링:', setData);
        
        // Context 표시
        const contextElement = document.getElementById('discussionClassContext');
        if (contextElement) {
            contextElement.textContent = setData.classContext || '';
        }
        
        // Topic 표시
        const topicElement = document.getElementById('discussionTopic');
        if (topicElement) {
            topicElement.textContent = setData.topic || '';
        }
        
        // 교수 이미지
        const professorImageElement = document.getElementById('discussionProfessorImage');
        if (professorImageElement) {
            professorImageElement.src = profiles.professor.image;
        }
        
        // 학생 1
        const student1ImageElement = document.getElementById('discussionStudent1Image');
        const student1NameElement = document.getElementById('discussionStudent1Name');
        const student1OpinionElement = document.getElementById('discussionStudent1Opinion');
        
        if (student1ImageElement) {
            student1ImageElement.src = profiles.student1.image;
        }
        if (student1NameElement) {
            student1NameElement.textContent = profiles.student1.name;
        }
        if (student1OpinionElement) {
            const opinion = this.replaceStudentNames(setData.student1Opinion, profiles);
            student1OpinionElement.textContent = opinion;
        }
        
        // 학생 2
        const student2ImageElement = document.getElementById('discussionStudent2Image');
        const student2NameElement = document.getElementById('discussionStudent2Name');
        const student2OpinionElement = document.getElementById('discussionStudent2Opinion');
        
        if (student2ImageElement) {
            student2ImageElement.src = profiles.student2.image;
        }
        if (student2NameElement) {
            student2NameElement.textContent = profiles.student2.name;
        }
        if (student2OpinionElement) {
            const opinion = this.replaceStudentNames(setData.student2Opinion, profiles);
            student2OpinionElement.textContent = opinion;
        }
        
        // Textarea 복원
        const textarea = document.getElementById('discussionTextarea');
        if (textarea) {
            textarea.value = this.discussionAnswers[this.currentDiscussionSet] || '';
            
            // 입력 이벤트 바인딩
            textarea.oninput = () => this.onDiscussionTextInput();
            
            // 단어 수 업데이트
            this.updateDiscussionWordCount();
        }
    }
    
    // ============================================
    // 텍스트 편집 함수 (7개)
    // ============================================
    
    /**
     * Textarea 입력 이벤트
     */
    onDiscussionTextInput() {
        const textarea = document.getElementById('discussionTextarea');
        if (!textarea) return;
        
        // 답안 저장
        this.discussionAnswers[this.currentDiscussionSet] = textarea.value;
        
        // Undo 스택에 푸시
        this.discussionUndoStack.push(textarea.value);
        
        // Redo 스택 초기화
        this.discussionRedoStack = [];
        
        // 단어 수 업데이트
        this.updateDiscussionWordCount();
    }
    
    /**
     * 잘라내기
     */
    cutDiscussion() {
        const textarea = document.getElementById('discussionTextarea');
        if (!textarea) return;
        
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        
        if (start === end) return; // 선택 없음
        
        const selectedText = textarea.value.substring(start, end);
        
        // 클립보드에 복사
        navigator.clipboard.writeText(selectedText).then(() => {
            console.log('✂️ 잘라내기 완료');
            
            // 선택 텍스트 삭제
            textarea.value = textarea.value.substring(0, start) + textarea.value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start;
            
            this.onDiscussionTextInput();
        }).catch(err => {
            console.error('❌ 잘라내기 실패:', err);
        });
    }
    
    /**
     * 붙여넣기
     */
    pasteDiscussion() {
        const textarea = document.getElementById('discussionTextarea');
        if (!textarea) return;
        
        navigator.clipboard.readText().then(clipboardText => {
            console.log('📋 붙여넣기:', clipboardText);
            
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            
            // 현재 커서 위치에 삽입
            textarea.value = textarea.value.substring(0, start) + clipboardText + textarea.value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + clipboardText.length;
            
            this.onDiscussionTextInput();
        }).catch(err => {
            console.error('❌ 붙여넣기 실패:', err);
        });
    }
    
    /**
     * 실행 취소 (Undo)
     */
    undoDiscussion() {
        if (this.discussionUndoStack.length === 0) {
            console.log('⚠️ Undo 스택이 비어있습니다.');
            return;
        }
        
        const textarea = document.getElementById('discussionTextarea');
        if (!textarea) return;
        
        // 현재 상태를 Redo 스택에 푸시
        this.discussionRedoStack.push(textarea.value);
        
        // Undo 스택에서 이전 상태 가져오기
        const previousState = this.discussionUndoStack.pop();
        textarea.value = previousState || '';
        
        this.discussionAnswers[this.currentDiscussionSet] = textarea.value;
        this.updateDiscussionWordCount();
        
        console.log('↶ Undo 완료');
    }
    
    /**
     * 다시 실행 (Redo)
     */
    redoDiscussion() {
        if (this.discussionRedoStack.length === 0) {
            console.log('⚠️ Redo 스택이 비어있습니다.');
            return;
        }
        
        const textarea = document.getElementById('discussionTextarea');
        if (!textarea) return;
        
        // 현재 상태를 Undo 스택에 푸시
        this.discussionUndoStack.push(textarea.value);
        
        // Redo 스택에서 다음 상태 가져오기
        const nextState = this.discussionRedoStack.pop();
        textarea.value = nextState || '';
        
        this.discussionAnswers[this.currentDiscussionSet] = textarea.value;
        this.updateDiscussionWordCount();
        
        console.log('↷ Redo 완료');
    }
    
    // ============================================
    // 단어 수 관리 함수 (4개)
    // ============================================
    
    /**
     * 단어 수 계산 및 표시
     */
    updateDiscussionWordCount() {
        const textarea = document.getElementById('discussionTextarea');
        const wordCountElement = document.getElementById('discussionWordCount');
        
        if (!textarea || !wordCountElement) return;
        
        const text = textarea.value.trim();
        const wordCount = text ? text.split(/\s+/).length : 0;
        
        wordCountElement.textContent = wordCount;
        
        // 1,000단어 초과 시 경고
        if (wordCount > this.DISCUSSION_WORD_LIMIT) {
            wordCountElement.style.color = '#e74c3c';
            console.warn(`⚠️ 단어 수 초과: ${wordCount}/${this.DISCUSSION_WORD_LIMIT}`);
            
            // 입력 차단 (선택 사항)
            // textarea.value = textarea.value.split(/\s+/).slice(0, this.DISCUSSION_WORD_LIMIT).join(' ');
        } else {
            wordCountElement.style.color = '';
        }
    }
    
    /**
     * 단어 수 표시/숨김 토글
     */
    toggleDiscussionWordCount() {
        const wordCountContainer = document.getElementById('discussionWordCountContainer');
        if (!wordCountContainer) return;
        
        if (wordCountContainer.style.display === 'none') {
            wordCountContainer.style.display = 'block';
            console.log('👁️ 단어 수 표시');
        } else {
            wordCountContainer.style.display = 'none';
            console.log('🙈 단어 수 숨김');
        }
    }
    
    // ============================================
    // 타이머 함수 (6개 중 2개)
    // ============================================
    

    
    // ============================================
    // 제출 & 결과 함수 (5개)
    // ============================================
    
    /**
     * 제출
     */
    submit() {
        console.log('📤 [Discussion] 제출 시작...');
        
        
        const setData = this.writingDiscussionData.sets[this.currentDiscussionSet];
        const userAnswer = this.discussionAnswers[this.currentDiscussionSet] || '';
        const wordCount = userAnswer.trim() ? userAnswer.trim().split(/\s+/).length : 0;
        
        console.log('📝 답안:', userAnswer);
        console.log('📊 단어 수:', wordCount);
        
        // 결과 데이터 생성 (프로필 포함 - 리플레이 시 이름 일관성 보장)
        const profiles = this.currentDiscussionProfiles || window.currentDiscussionProfiles || {
            student1: { name: 'Student 1' },
            student2: { name: 'Student 2' }
        };
        const resultData = {
            weekDay: setData.weekDay || 'Week 1, 월요일',
            wordCount: wordCount,
            userAnswer: userAnswer,
            profiles: profiles,
            question: {
                classContext: setData.classContext || '',
                topic: setData.topic || '',
                student1Opinion: setData.student1Opinion || '',
                student2Opinion: setData.student2Opinion || '',
                sampleAnswer: setData.sampleAnswer || '',
                bullets: setData.bullets || []
            }
        };
        
        console.log('✅ [Discussion] 결과 데이터:', resultData);
        
        return resultData;
    }
    
    /**
     * TXT 파일 다운로드
     */
    downloadDiscussion() {
        // 내부 데이터에서 직접 읽기
        const setData = this.writingDiscussionData.sets[this.currentDiscussionSet];
        const userAnswer = this.discussionAnswers[this.currentDiscussionSet] || '';
        const wordCount = userAnswer.trim() ? userAnswer.trim().split(/\s+/).length : 0;
        
        const now = new Date();
        const dateStr = now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');
        
        const filename = `Writing_Discussion_${window.currentAttemptNumber === 2 ? '2차' : '1차'}_${dateStr}.txt`;
        
        // sessionStorage 우선 → 인스턴스 → window → 기본값
        let profiles = null;
        const _dlSavedProfiles = sessionStorage.getItem('discussionProfiles');
        if (_dlSavedProfiles) {
            try { profiles = JSON.parse(_dlSavedProfiles); } catch(e) {}
        }
        if (!profiles) {
            profiles = this.currentDiscussionProfiles || window.currentDiscussionProfiles;
        }
        if (!profiles) {
            profiles = { student1: { name: 'Student 1' }, student2: { name: 'Student 2' } };
        }
        
        let content = '='.repeat(60) + '\n';
        content += `토론형 글쓰기 답안 (${window.currentAttemptNumber === 2 ? '2차 작성' : '1차 작성'})\n`;
        content += '='.repeat(60) + '\n\n';
        content += `작성일시: ${now.toLocaleString('ko-KR')}\n`;
        content += `단어 수: ${wordCount}\n\n`;
        content += '-'.repeat(60) + '\n';
        content += '수업 정보\n';
        content += '-'.repeat(60) + '\n';
        content += `${setData.classContext}\n\n`;
        content += `토론 주제: ${setData.topic}\n\n`;
        content += '-'.repeat(60) + '\n';
        content += '학생 의견\n';
        content += '-'.repeat(60) + '\n';
        content += `${profiles.student1.name}: ${this.replaceStudentNames(setData.student1Opinion, profiles)}\n\n`;
        content += `${profiles.student2.name}: ${this.replaceStudentNames(setData.student2Opinion, profiles)}\n\n`;
        content += '-'.repeat(60) + '\n';
        content += '내 답안\n';
        content += '-'.repeat(60) + '\n';
        content += userAnswer + '\n\n';
        content += '='.repeat(60) + '\n';
        
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`💾 [Discussion] 파일 다운로드: ${filename}`);
    }
    

}

// ============================================
// 전역 스코프에 노출
// ============================================
window.DiscussionComponent = DiscussionComponent;

// index.html에서 호출하는 편집 도구 전역 함수
function cutDiscussionText() {
    if (window.currentDiscussionComponent) {
        window.currentDiscussionComponent.cutDiscussion();
    }
}

function pasteDiscussionText() {
    if (window.currentDiscussionComponent) {
        window.currentDiscussionComponent.pasteDiscussion();
    }
}

function undoDiscussionText() {
    if (window.currentDiscussionComponent) {
        window.currentDiscussionComponent.undoDiscussion();
    }
}

function redoDiscussionText() {
    if (window.currentDiscussionComponent) {
        window.currentDiscussionComponent.redoDiscussion();
    }
}

function toggleDiscussionWordCount() {
    if (window.currentDiscussionComponent) {
        window.currentDiscussionComponent.toggleDiscussionWordCount();
    }
}

function onDiscussionTextInput() {
    if (window.currentDiscussionComponent) {
        window.currentDiscussionComponent.onDiscussionTextInput();
    }
}

console.log('✅ DiscussionComponent 클래스 로드 완료 (v=001)');
