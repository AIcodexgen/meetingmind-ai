// Content script for Google Meet injection

class GoogleMeetController {
  constructor() {
    this.meetingId = null;
    this.participants = new Set();
    this.observer = null;
    this.init();
  }

  init() {
    // Wait for meeting UI to load
    this.waitForMeetingStart();
    this.injectTranscriptPanel();
  }

  waitForMeetingStart() {
    const checkInterval = setInterval(() => {
      // Detect meeting header or participant count
      const header = document.querySelector('[data-meeting-title]') || 
                    document.querySelector('[jsname="NeC6gb"]');
      const participantsBtn = document.querySelector('[jsname="HiaYvf"]');
      
      if (header || participantsBtn) {
        clearInterval(checkInterval);
        this.detectMeetingDetails();
      }
    }, 2000);
  }

  detectMeetingDetails() {
    // Extract meeting title
    const titleEl = document.querySelector('[data-meeting-title]') || 
                   document.querySelector('div[role="heading"]');
    const title = titleEl ? titleEl.textContent : 'Google Meet';
    
    // Extract meeting code from URL
    const urlParams = new URLSearchParams(window.location.search);
    const meetingCode = urlParams.get('jid') || window.location.pathname.split('/').pop();
    
    this.meetingData = {
      platform: 'google-meet',
      title: title,
      meetingCode: meetingCode,
      url: window.location.href,
      detectedAt: new Date().toISOString()
    };
    
    // Notify background script
    chrome.runtime.sendMessage({
      type: 'MEETING_DETECTED',
      data: this.meetingData
    });
    
    this.setupMeetingEndDetection();
    this.monitorParticipants();
  }

  setupMeetingEndDetection() {
    // Detect when user leaves meeting
    window.addEventListener('beforeunload', () => {
      chrome.runtime.sendMessage({ type: 'MEETING_ENDED' });
    });
    
    // Also detect "Leave call" button click
    document.addEventListener('click', (e) => {
      if (e.target.closest('[jsname="CQylAd"]') || // Leave button
          e.target.closest('[jsname="jER0hd"]')) { // End call for all
        chrome.runtime.sendMessage({ type: 'MEETING_ENDED' });
      }
    });
  }

  monitorParticipants() {
    // Watch for participant changes
    this.observer = new MutationObserver((mutations) => {
      const participantElements = document.querySelectorAll('[data-participant-id]');
      const currentParticipants = new Set();
      
      participantElements.forEach(el => {
        const name = el.textContent;
        if (name) currentParticipants.add(name);
      });
      
      if (currentParticipants.size !== this.participants.size) {
        this.participants = currentParticipants;
        this.updateParticipantCount();
      }
    });
    
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  injectTranscriptPanel() {
    const panel = document.createElement('div');
    panel.id = 'meetingmind-panel';
    panel.innerHTML = `
      <div class="mm-header">
        <span class="mm-status">● Recording</span>
        <button id="mm-minimize">_</button>
      </div>
      <div class="mm-transcript">
        <div class="mm-placeholder">Transcript will appear here...</div>
      </div>
      <div class="mm-controls">
        <button id="mm-pause">Pause</button>
        <button id="mm-stop">Stop</button>
      </div>
    `;
    
    document.body.appendChild(panel);
    
    // Apply styles
    panel.style.cssText = `
      position: fixed;
      right: 20px;
      top: 80px;
      width: 320px;
      height: 400px;
      background: rgba(30, 30, 30, 0.95);
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: white;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;
    
    this.setupPanelInteractions(panel);
    
    // Listen for transcript updates from background
    chrome.runtime.onMessage.addListener((request) => {
      if (request.type === 'TRANSCRIPT_UPDATE') {
        this.updateTranscript(request.data);
      } else if (request.type === 'RECORDING_STARTED') {
        panel.querySelector('.mm-status').textContent = '● Recording';
      }
    });
  }

  setupPanelInteractions(panel) {
    let isMinimized = false;
    
    panel.querySelector('#mm-minimize').addEventListener('click', () => {
      isMinimized = !isMinimized;
      panel.style.height = isMinimized ? '40px' : '400px';
    });
    
    panel.querySelector('#mm-stop').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
      panel.remove();
    });
    
    panel.querySelector('#mm-pause').addEventListener('click', (e) => {
      const isPaused = e.target.textContent === 'Resume';
      e.target.textContent = isPaused ? 'Pause' : 'Resume';
      chrome.runtime.sendMessage({ 
        type: isPaused ? 'RESUME_RECORDING' : 'PAUSE_RECORDING' 
      });
    });
  }

  updateTranscript(data) {
    const container = document.querySelector('.mm-transcript');
    const placeholder = container.querySelector('.mm-placeholder');
    if (placeholder) placeholder.remove();
    
    const entry = document.createElement('div');
    entry.className = 'mm-entry';
    entry.innerHTML = `
      <span class="mm-speaker">${data.speaker || 'Speaker'}:</span>
      <span class="mm-text">${data.text}</span>
      <span class="mm-time">${new Date().toLocaleTimeString()}</span>
    `;
    
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
  }

  updateParticipantCount() {
    // Send participant updates to backend for better diarization
    chrome.runtime.sendMessage({
      type: 'PARTICIPANTS_UPDATE',
      count: this.participants.size,
      names: Array.from(this.participants)
    });
  }
}

// Initialize
if (window.location.hostname.includes('meet.google.com')) {
  new GoogleMeetController();
}
