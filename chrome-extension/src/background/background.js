// Service Worker - Orchestrates meeting detection, auth, and audio streaming

import { MeetingDetector } from './meeting-detector.js';
import { AudioStreamManager } from './audio-manager.js';
import { AuthManager } from './auth.js';
import { Storage } from '../shared/storage.js';

class BackgroundService {
  constructor() {
    this.detector = new MeetingDetector();
    this.audioManager = new AudioStreamManager();
    this.auth = new AuthManager();
    this.activeMeetings = new Map();
    
    this.init();
  }

  init() {
    // Listen for meeting start/end from content scripts
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    
    // Calendar sync alarm
    chrome.alarms.create('calendarSync', { periodInMinutes: 5 });
    chrome.alarms.onAlarm.addListener(this.handleAlarm.bind(this));
    
    // Tab monitoring for auto-join
    chrome.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this));
    
    // Install handler
    chrome.runtime.onInstalled.addListener(this.handleInstall.bind(this));
  }

  async handleMessage(request, sender, sendResponse) {
    switch (request.type) {
      case 'MEETING_DETECTED':
        await this.handleMeetingDetected(request.data, sender.tab.id);
        break;
      case 'MEETING_ENDED':
        await this.handleMeetingEnded(sender.tab.id);
        break;
      case 'START_RECORDING':
        await this.startRecording(sender.tab.id);
        break;
      case 'STOP_RECORDING':
        await this.stopRecording(sender.tab.id);
        break;
      case 'GET_AUTH_TOKEN':
        const token = await this.auth.getToken();
        sendResponse({ token });
        break;
      case 'TRANSCRIPT_CHUNK':
        this.handleTranscriptChunk(request.data, sender.tab.id);
        break;
    }
    return true;
  }

  async handleMeetingDetected(data, tabId) {
    const settings = await Storage.get('settings');
    
    // Check auto-record preference
    if (settings.autoRecord) {
      await this.startRecording(tabId, data);
    } else {
      // Show notification to start recording
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/icon48.png',
        title: 'Meeting Detected',
        message: `Join "${data.title}"? Click to start recording.`,
        buttons: [{ title: 'Start Recording' }],
        requireInteraction: true
      });
    }
    
    this.activeMeetings.set(tabId, {
      ...data,
      startTime: Date.now(),
      recording: false
    });
  }

  async startRecording(tabId, meetingData) {
    try {
      // Create offscreen document for audio capture (Manifest V3 requirement)
      await this.setupOffscreenDocument();
      
      // Send message to offscreen doc to start capture
      await chrome.runtime.sendMessage({
        type: 'START_CAPTURE',
        target: 'offscreen',
        data: { tabId }
      });

      // Update meeting state
      const meeting = this.activeMeetings.get(tabId);
      if (meeting) {
        meeting.recording = true;
        meeting.meetingId = this.generateMeetingId();
        
        // Initialize WebSocket connection to backend
        this.initWebSocket(meeting.meetingId);
        
        // Notify content script to show UI
        chrome.tabs.sendMessage(tabId, {
          type: 'RECORDING_STARTED',
          meetingId: meeting.meetingId
        });
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }

  async setupOffscreenDocument() {
    // Check if offscreen document exists
    if (await this.hasOffscreenDocument()) return;
    
    await chrome.offscreen.createDocument({
      url: 'src/offscreen/offscreen.html',
      reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
      justification: 'Recording meeting audio for transcription'
    });
  }

  async hasOffscreenDocument() {
    const clients = await self.clients.matchAll();
    return clients.some(client => client.url.includes('offscreen.html'));
  }

  initWebSocket(meetingId) {
    const ws = new WebSocket(`wss://api.meetingmind.ai/stream/${meetingId}`);
    
    ws.onopen = () => {
      console.log('WebSocket connected for meeting:', meetingId);
      this.audioManager.setWebSocket(ws);
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleServerMessage(data, meetingId);
    };
  }

  handleServerMessage(data, meetingId) {
    // Handle real-time transcript, summary updates from backend
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        const meeting = this.activeMeetings.get(tab.id);
        if (meeting && meeting.meetingId === meetingId) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'TRANSCRIPT_UPDATE',
            data: data
          });
        }
      });
    });
  }

  handleAlarm(alarm) {
    if (alarm.name === 'calendarSync') {
      this.syncCalendar();
    }
  }

  async syncCalendar() {
    const token = await this.auth.getToken();
    if (!token) return;
    
    // Fetch upcoming meetings from backend
    const response = await fetch('https://api.meetingmind.ai/calendar/upcoming', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const meetings = await response.json();
    await Storage.set('upcomingMeetings', meetings);
    
    // Check for meetings starting soon (within 2 minutes)
    meetings.forEach(meeting => {
      const startTime = new Date(meeting.start).getTime();
      const now = Date.now();
      if (startTime - now > 0 && startTime - now < 120000) {
        this.notifyUpcomingMeeting(meeting);
      }
    });
  }

  generateMeetingId() {
    return `mt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

new BackgroundService();
