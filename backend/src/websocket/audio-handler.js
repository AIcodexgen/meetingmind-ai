import WebSocket from 'ws';
import { Deepgram } from '@deepgram/sdk';
import { OpenAI } from 'openai';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);

export class AudioStreamHandler {
  constructor(wss) {
    this.wss = wss;
    this.activeStreams = new Map(); // meetingId -> stream info
    
    this.setupWebSocketServer();
  }

  setupWebSocketServer() {
    this.wss.on('connection', (ws, req) => {
      const meetingId = req.url.split('/').pop();
      console.log(`WebSocket connected for meeting: ${meetingId}`);
      
      this.handleConnection(ws, meetingId);
    });
  }

  async handleConnection(ws, meetingId) {
    // Initialize Deepgram streaming
    const dgConnection = deepgram.transcription.live({
      punctuate: true,
      diarize: true,
      language: 'en-US',
      model: 'nova-2',
      smart_format: true,
      interim_results: true,
    });

    const transcriptBuffer = [];
    let currentSpeaker = null;

    dgConnection.on('transcriptReceived', async (transcription) => {
      const { channel } = transcription;
      if (!channel || !channel.alternatives[0]) return;
      
      const alternative = channel.alternatives[0];
      const text = alternative.transcript;
      const isFinal = transcription.is_final;
      const words = alternative.words || [];
      
      // Speaker diarization
      const speaker = words[0]?.speaker || 0;
      
      const transcriptData = {
        id: uuidv4(),
        meetingId,
        text,
        speaker: `Speaker ${speaker + 1}`,
        timestamp: new Date(),
        isFinal,
        confidence: alternative.confidence
      };

      if (isFinal) {
        transcriptBuffer.push(transcriptData);
        
        // Save to database
        await prisma.transcript.create({
          data: {
            meetingId,
            content: text,
            speaker: transcriptData.speaker,
            timestamp: transcriptData.timestamp,
            confidence: transcriptData.confidence
          }
        });

        // Process with LLM for real-time insights (every 30 seconds)
        if (transcriptBuffer.length % 5 === 0) {
          this.processRealtimeInsights(meetingId, transcriptBuffer);
        }
      }

      // Send to all connected clients (extension + dashboard)
      this.broadcast(meetingId, {
        type: 'TRANSCRIPT',
        data: transcriptData
      });
    });

    // Handle audio chunks from extension
    ws.on('message', (data) => {
      if (Buffer.isBuffer(data)) {
        dgConnection.send(data);
      }
    });

    ws.on('close', () => {
      console.log(`WebSocket closed for meeting: ${meetingId}`);
      dgConnection.finish();
      this.finalizeMeeting(meetingId, transcriptBuffer);
    });

    // Store reference
    this.activeStreams.set(meetingId, {
      ws,
      dgConnection,
      startTime: Date.now(),
      transcriptBuffer
    });
  }

  async processRealtimeInsights(meetingId, buffer) {
    const recentText = buffer.slice(-5).map(t => t.text).join(' ');
    
    // Async processing for action items detection
    const prompt = `
    Analyze this meeting segment and extract:
    1. Any action items (who needs to do what by when)
    2. Key decisions made
    3. Important topics discussed
    
    Text: "${recentText}"
    
    Return JSON format:
    {
      "actionItems": [{"task": "", "owner": "", "deadline": ""}],
      "decisions": [],
      "topics": []
    }`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });
      
      const insights = JSON.parse(completion.choices[0].message.content);
      
      // Broadcast insights
      this.broadcast(meetingId, {
        type: 'INSIGHTS',
        data: insights
      });
      
      // Store action items
      if (insights.actionItems?.length) {
        await prisma.actionItem.createMany({
          data: insights.actionItems.map(item => ({
            meetingId,
            task: item.task,
            owner: item.owner,
            deadline: item.deadline ? new Date(item.deadline) : null,
            status: 'PENDING'
          }))
        });
      }
    } catch (error) {
      console.error('Insight processing error:', error);
    }
  }

  async finalizeMeeting(meetingId, transcriptBuffer) {
    const fullTranscript = transcriptBuffer.map(t => t.text).join(' ');
    
    // Generate final summary
    const summary = await this.generateSummary(fullTranscript);
    
    // Update meeting record
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: 'COMPLETED',
        endedAt: new Date(),
        summary: summary.summary,
        keyPoints: summary.keyPoints,
        duration: Math.floor((Date.now() - this.activeStreams.get(meetingId).startTime) / 1000)
      }
    });

    // Trigger follow-up jobs (email generation, CRM sync)
    await this.queuePostProcessing(meetingId, summary);
    
    this.activeStreams.delete(meetingId);
  }

  async generateSummary(transcript) {
    const prompt = `
    Generate a comprehensive meeting summary from this transcript:
    
    ${transcript.substring(0, 15000)} // Limit tokens
    
    Return:
    1. Executive summary (2-3 sentences)
    2. Key discussion points (bullet points)
    3. Decisions made
    4. Action items with owners
    5. Follow-up topics
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }]
    });

    const content = completion.choices[0].message.content;
    
    // Parse structured content
    return {
      summary: this.extractSection(content, 'Executive summary'),
      keyPoints: this.extractList(content, 'Key discussion points'),
      decisions: this.extractList(content, 'Decisions made')
    };
  }

  async queuePostProcessing(meetingId, summary) {
    // Add to Bull queue for async processing
    const Queue = require('bull');
    const postProcessQueue = new Queue('post-processing', process.env.REDIS_URL);
    
    await postProcessQueue.add('generate-followup', {
      meetingId,
      summary
    });
    
    await postProcessQueue.add('crm-sync', {
      meetingId
    });
  }

  broadcast(meetingId, message) {
    // Send to all clients subscribed to this meeting
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        // In production, track meetingId per client
        client.send(JSON.stringify(message));
      }
    });
  }

  extractSection(text, section) {
    const regex = new RegExp(`${section}:?\\s*([^\\n]+)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  }

  extractList(text, section) {
    const regex = new RegExp(`${section}:?\\s*([\\s\\S]*?)(?=\\n\\n|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('•')) : [];
  }
}
