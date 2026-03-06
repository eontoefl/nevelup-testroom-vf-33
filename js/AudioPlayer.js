/**
 * AudioPlayer.js
 * 2차 풀이용 오디오 플레이어 (재생/일시정지 버튼 + 프로그레스바 + 시크바)
 */

class AudioPlayer {
  constructor(containerId, audioUrl) {
    this.containerId = containerId;
    this.audioUrl = audioUrl;
    this.audio = null;
    this.isPlaying = false;
    this.container = null;
    
    this.init();
  }
  
  init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      console.error(`❌ AudioPlayer: 컨테이너를 찾을 수 없습니다 - ${this.containerId}`);
      return;
    }
    
    // 오디오 플레이어 UI 생성 (항상 표시)
    this.renderUI();
    
    // Audio 객체 생성 (URL이 있을 때만)
    if (this.audioUrl && this.audioUrl !== 'PLACEHOLDER' && this.audioUrl.trim() !== '') {
      this.audio = new Audio(this.convertGoogleDriveUrl(this.audioUrl));
      this.setupEventListeners();
      console.log('✅ AudioPlayer: 오디오 로드 완료');
    } else {
      console.warn('⚠️ AudioPlayer: 오디오 URL 없음 - UI만 표시');
      // URL 없어도 버튼 이벤트는 설정 (클릭 시 경고)
      this.setupUIOnlyListeners();
    }
  }
  
  /**
   * Google Drive URL 변환
   */
  convertGoogleDriveUrl(url) {
    if (!url || typeof url !== 'string') return url;
    
    // Google Drive 공유 링크 변환
    if (url.includes('drive.google.com/file/d/')) {
      const fileId = url.match(/\/d\/([^\/]+)/)?.[1];
      if (fileId) {
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
      }
    }
    
    return url;
  }
  
  /**
   * UI 렌더링
   */
  renderUI() {
    this.container.innerHTML = `
      <style>
        /* 시크바 노브 스타일 */
        .audio-seekbar {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 8px;
          border-radius: 4px;
          background: linear-gradient(to right, #4a90e2 0%, #4a90e2 0%, #ddd 0%, #ddd 100%);
          outline: none;
          cursor: pointer;
        }
        
        /* Chrome, Safari, Opera */
        .audio-seekbar::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #4a90e2;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          transition: transform 0.1s;
        }
        
        .audio-seekbar::-webkit-slider-thumb:hover {
          transform: scale(1.2);
          background: #357abd;
        }
        
        /* Firefox */
        .audio-seekbar::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #4a90e2;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          transition: transform 0.1s;
        }
        
        .audio-seekbar::-moz-range-thumb:hover {
          transform: scale(1.2);
          background: #357abd;
        }
        
        /* IE/Edge */
        .audio-seekbar::-ms-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #4a90e2;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .audio-seekbar::-ms-track {
          width: 100%;
          height: 8px;
          cursor: pointer;
          background: transparent;
          border-color: transparent;
          color: transparent;
        }
      </style>
      
      <div class="audio-player-retake" style="
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        margin: 16px 0;
      ">
        <button id="${this.containerId}_playBtn" class="audio-play-btn" style="
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #4a90e2;
          color: white;
          border: none;
          cursor: pointer;
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.2s;
        ">
          ▶
        </button>
        
        <div class="audio-controls" style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
          <div class="audio-time" style="display: flex; justify-content: space-between; font-size: 14px; color: #666;">
            <span id="${this.containerId}_currentTime">00:00</span>
            <span id="${this.containerId}_duration">00:00</span>
          </div>
          
          <input 
            type="range" 
            id="${this.containerId}_seekbar" 
            class="audio-seekbar"
            min="0" 
            max="100" 
            value="0"
          >
        </div>
      </div>
    `;
  }
  
  /**
   * 이벤트 리스너 설정
   */
  setupEventListeners() {
    // 재생/일시정지 버튼
    const playBtn = document.getElementById(`${this.containerId}_playBtn`);
    if (playBtn) {
      playBtn.addEventListener('click', () => this.togglePlay());
      
      // 호버 효과
      playBtn.addEventListener('mouseenter', () => {
        playBtn.style.background = '#357abd';
      });
      playBtn.addEventListener('mouseleave', () => {
        playBtn.style.background = '#4a90e2';
      });
    }
    
    // 시크바
    const seekbar = document.getElementById(`${this.containerId}_seekbar`);
    if (seekbar) {
      seekbar.addEventListener('input', (e) => {
        if (this.audio) {
          const percentage = e.target.value;
          const seekTime = (percentage / 100) * this.audio.duration;
          this.audio.currentTime = seekTime;
          // 시크바 배경 업데이트
          e.target.style.background = `linear-gradient(to right, #4a90e2 0%, #4a90e2 ${percentage}%, #ddd ${percentage}%, #ddd 100%)`;
        }
      });
    }
    
    // 오디오 이벤트
    if (this.audio) {
      // 메타데이터 로드 완료
      this.audio.addEventListener('loadedmetadata', () => {
        const durationEl = document.getElementById(`${this.containerId}_duration`);
        if (durationEl) {
          durationEl.textContent = this.formatTime(this.audio.duration);
        }
      });
      
      // 재생 중
      this.audio.addEventListener('timeupdate', () => {
        this.updateProgress();
      });
      
      // 재생 완료
      this.audio.addEventListener('ended', () => {
        this.isPlaying = false;
        const playBtn = document.getElementById(`${this.containerId}_playBtn`);
        if (playBtn) {
          playBtn.textContent = '▶';
        }
      });
      
      // 에러 처리
      this.audio.addEventListener('error', (e) => {
        console.error('❌ AudioPlayer: 오디오 로드 실패', e);
        console.error('❌ AudioPlayer: URL:', this.audioUrl);
      });
    }
  }
  
  /**
   * UI 전용 이벤트 리스너 (오디오 없을 때)
   */
  setupUIOnlyListeners() {
    // 재생/일시정지 버튼
    const playBtn = document.getElementById(`${this.containerId}_playBtn`);
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        console.log('⚠️ 오디오 URL이 없습니다');
      });
      
      // 호버 효과
      playBtn.addEventListener('mouseenter', () => {
        playBtn.style.background = '#357abd';
      });
      playBtn.addEventListener('mouseleave', () => {
        playBtn.style.background = '#4a90e2';
      });
    }
    
    // 시크바 (UI만 작동)
    const seekbar = document.getElementById(`${this.containerId}_seekbar`);
    if (seekbar) {
      seekbar.addEventListener('input', (e) => {
        const percentage = e.target.value;
        // 배경만 업데이트
        e.target.style.background = `linear-gradient(to right, #4a90e2 0%, #4a90e2 ${percentage}%, #ddd ${percentage}%, #ddd 100%)`;
        
        // 프로그레스바도 업데이트
        const progressEl = document.getElementById(`${this.containerId}_progress`);
        if (progressEl) {
          progressEl.style.width = `${percentage}%`;
        }
        
        // 시간 표시 업데이트 (가짜)
        const totalDuration = 120; // 가짜 2분
        const currentTime = (percentage / 100) * totalDuration;
        const currentTimeEl = document.getElementById(`${this.containerId}_currentTime`);
        if (currentTimeEl) {
          currentTimeEl.textContent = this.formatTime(currentTime);
        }
      });
    }
    
    // duration 가짜로 표시
    const durationEl = document.getElementById(`${this.containerId}_duration`);
    if (durationEl) {
      durationEl.textContent = '02:00'; // 가짜 2분
    }
  }
  
  /**
   * 재생/일시정지 토글
   */
  togglePlay() {
    if (!this.audio) return;
    
    const playBtn = document.getElementById(`${this.containerId}_playBtn`);
    
    if (this.isPlaying) {
      this.audio.pause();
      this.isPlaying = false;
      if (playBtn) playBtn.textContent = '▶';
    } else {
      this.audio.play();
      this.isPlaying = true;
      if (playBtn) playBtn.textContent = '⏸';
    }
  }
  
  /**
   * 진행 상황 업데이트
   */
  updateProgress() {
    if (!this.audio) return;
    
    const currentTime = this.audio.currentTime;
    const duration = this.audio.duration;
    
    if (duration > 0) {
      const percentage = (currentTime / duration) * 100;
      
      // 시크바
      const seekbar = document.getElementById(`${this.containerId}_seekbar`);
      if (seekbar) {
        seekbar.value = percentage;
        // 시크바 배경 그라디언트 업데이트
        seekbar.style.background = `linear-gradient(to right, #4a90e2 0%, #4a90e2 ${percentage}%, #ddd ${percentage}%, #ddd 100%)`;
      }
      
      // 현재 시간
      const currentTimeEl = document.getElementById(`${this.containerId}_currentTime`);
      if (currentTimeEl) {
        currentTimeEl.textContent = this.formatTime(currentTime);
      }
    }
  }
  
  /**
   * 시간 포맷 (초 → MM:SS)
   */
  formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  /**
   * Cleanup
   */
  destroy() {
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// 전역으로 노출
window.AudioPlayer = AudioPlayer;
console.log('✅ AudioPlayer 클래스 정의 완료');
