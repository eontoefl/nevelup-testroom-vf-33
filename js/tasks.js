// Google Sheets 과제 데이터 연동 시스템
// 추후 과제 데이터를 Google Sheets로 관리하기 위한 준비

const TASKS_SHEET_CONFIG = {
    // 과제 데이터 시트 ID (두 번째 시트)
    spreadsheetId: '1vyi3LV5bZNQ0dxsZOjpde94BD8aTwtu-MvzCVgtxOIE',
    sheetGid: '1', // 두 번째 시트 (과제 데이터용)
};

// Google Sheets에서 과제 데이터 가져오기 (추후 구현)
async function fetchTasksFromSheet() {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${TASKS_SHEET_CONFIG.spreadsheetId}/export?format=csv&gid=${TASKS_SHEET_CONFIG.sheetGid}`;
    
    try {
        const response = await fetch(csvUrl);
        
        if (!response.ok) {
            console.warn('과제 데이터 시트에 접근할 수 없습니다. 데모 데이터를 사용합니다.');
            return null;
        }
        
        const csvText = await response.text();
        return parseTasksCSV(csvText);
        
    } catch (error) {
        console.error('과제 데이터 로드 실패:', error);
        return null;
    }
}

// CSV를 과제 데이터로 변환 (추후 구현)
function parseTasksCSV(csvText) {
    // 추후 구현 예정
    // CSV 형식:
    // 프로그램, 주차, 요일, 섹션1, 섹션2, 섹션3, 섹션4, 설명
    // 일반, 1, 일, reading, listening, , , Reading & Listening
    // 일반, 1, 월, writing, , , , Writing
    
    const lines = csvText.trim().split('\n');
    const tasks = {
        '내벨업챌린지 - Standard': {},
        '내벨업챌린지 - Fast': {}
    };
    
    // 첫 줄은 헤더이므로 건너뛰기
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = parseCSVLine(line);
        
        if (values.length >= 8) {
            const program = values[0].trim();
            const week = `week${values[1].trim()}`;
            const day = values[2].trim();
            
            const sections = [];
            for (let j = 3; j <= 6; j++) {
                if (values[j] && values[j].trim()) {
                    sections.push(values[j].trim());
                }
            }
            
            const description = values[7].trim();
            
            if (!tasks[program][week]) {
                tasks[program][week] = {};
            }
            
            tasks[program][week][day] = {
                sections,
                description
            };
        }
    }
    
    return tasks;
}

// Google Sheets에서 과제 데이터를 불러오고, 실패 시 데모 데이터 사용
async function loadTasksData() {
    const sheetsData = await fetchTasksFromSheet();
    
    if (sheetsData) {
        console.log('Google Sheets에서 과제 데이터를 불러왔습니다.');
        return sheetsData;
    } else {
        console.log('데모 데이터를 사용합니다.');
        return demoTasks;
    }
}

// 현재 사용 중인 과제 데이터
let activeTasks = demoTasks;

// 과제 데이터 초기화 (페이지 로드 시 실행)
async function initTasksData() {
    activeTasks = await loadTasksData();
}

// 페이지 로드 시 과제 데이터 초기화 (선택사항)
// window.addEventListener('DOMContentLoaded', initTasksData);
