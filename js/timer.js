// 타이머 관리
class Timer {
    constructor(duration, displayElement, onComplete) {
        this.duration = duration; // 초 단위
        this.remaining = duration;
        this.displayElement = displayElement;
        this.onComplete = onComplete;
        this.interval = null;
        this.isPaused = false;
    }

    start() {
        this.updateDisplay();
        this.interval = setInterval(() => {
            if (!this.isPaused) {
                this.remaining--;
                this.updateDisplay();
                
                if (this.remaining <= 0) {
                    this.stop();
                    if (this.onComplete) {
                        this.onComplete();
                    }
                }
            }
        }, 1000);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
    }

    reset(duration) {
        this.stop();
        this.duration = duration;
        this.remaining = duration;
        this.updateDisplay();
    }

    updateDisplay() {
        if (this.displayElement) {
            const minutes = Math.floor(this.remaining / 60);
            const seconds = this.remaining % 60;
            this.displayElement.textContent = 
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            // 시간이 1분 미만일 때 경고 색상
            if (this.remaining < 60) {
                this.displayElement.style.color = '#ef4444';
            } else {
                this.displayElement.style.color = '#9480c5';
            }
        }
    }

    getRemaining() {
        return this.remaining;
    }
}

// 각 섹션별 타이머 인스턴스
let sectionTimers = {
    reading: null,
    listening: null,
    speaking: null,
    writing: null
};

// 타이머 생성 함수
function createSectionTimer(section, duration) {
    const timerElement = document.getElementById(`${section}Timer`);
    
    if (sectionTimers[section]) {
        sectionTimers[section].stop();
    }
    
    sectionTimers[section] = new Timer(duration * 60, timerElement, () => {
        alert(`Time is up for ${section} section!`);
        submitSection();
    });
    
    return sectionTimers[section];
}

// 준비 시간 타이머 (Speaking용)
function createPreparationTimer(seconds, displayElement, onComplete) {
    let remaining = seconds;
    
    const updateDisplay = () => {
        displayElement.textContent = remaining;
        if (remaining < 6) {
            displayElement.style.color = '#ef4444';
        }
    };
    
    updateDisplay();
    
    const interval = setInterval(() => {
        remaining--;
        updateDisplay();
        
        if (remaining <= 0) {
            clearInterval(interval);
            if (onComplete) {
                onComplete();
            }
        }
    }, 1000);
    
    return interval;
}

// 녹음 시간 타이머 (Speaking용)
function createRecordingTimer(seconds, displayElement, onComplete) {
    let remaining = seconds;
    
    const updateDisplay = () => {
        displayElement.textContent = remaining;
    };
    
    updateDisplay();
    
    const interval = setInterval(() => {
        remaining--;
        updateDisplay();
        
        if (remaining <= 0) {
            clearInterval(interval);
            if (onComplete) {
                onComplete();
            }
        }
    }, 1000);
    
    return interval;
}

// 모든 타이머 정지
function stopAllTimers() {
    Object.values(sectionTimers).forEach(timer => {
        if (timer) {
            timer.stop();
        }
    });
}
