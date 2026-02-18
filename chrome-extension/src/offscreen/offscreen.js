// Offscreen document - Handles audio capture (required for Manifest V3)
// This runs in isolation but can access getDisplayMedia/getUserMedia

class AudioCapture {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.audioContext = null;
    this.ws = null;
    this.tabId = null;
    
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }

  async handleMessage(request) {
    if (request.target !== 'offscreen') return;
    
    switch (request.type) {
      case 'START_CAPTURE':
        await this.startCapture(request.data.tabId);
        break;
      case 'STOP_CAPTURE':
        await this.stopCapture();
        break;
    }
  }

  async startCapture(tabId) {
    this.tabId = tabId;
    
    try {
      // Request tab audio capture
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 16000
        },
        preferCurrentTab: true
      });
      
      // Stop video track, we only need audio
      this.stream.getVideoTracks().forEach(track => track.stop());
      
      // Setup AudioContext for processing
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.stream);
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      source.connect(processor);
      processor.connect(this.audioContext.destination);
      
      // Connect to WebSocket via background script
      this.setupWebSocket();
      
      // Process audio chunks
      processor.onaudioprocess = (e) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert to 16-bit PCM
        const pcmData = this.floatTo16BitPCM(inputData);
        this.ws.send(pcmData);
      };
      
      // Handle stream end (user stops sharing)
      this.stream.getAudioTracks()[0].onended = () => {
        this.stopCapture();
        chrome.runtime.sendMessage({ type: 'CAPTURE_ENDED', tabId: this.tabId });
      };
      
    } catch (error) {
      console.error('Audio capture failed:', error);
      chrome.runtime.sendMessage({ type: 'CAPTURE_ERROR', error: error.message });
    }
  }

  setupWebSocket() {
    // Connect through background script to maintain persistent connection
    chrome.runtime.sendMessage({ type: 'INIT_WEBSOCKET', tabId: this.tabId }, (response) => {
      if (response && response.url) {
        this.ws = new WebSocket(response.url);
        
        this.ws.onopen = () => {
          console.log('Audio WebSocket connected');
        };
      }
    });
  }

  floatTo16BitPCM(input) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output.buffer;
  }

  async stopCapture() {
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}

new AudioCapture();
