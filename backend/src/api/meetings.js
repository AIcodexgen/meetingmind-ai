import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get all meetings for user
router.get('/', authenticateToken, async (req, res) => {
  const meetings = await prisma.meeting.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      transcripts: { orderBy: { timestamp: 'asc' } },
      actionItems: true,
      participants: true
    }
  });
  
  res.json(meetings);
});

// Get single meeting with details
router.get('/:id', authenticateToken, async (req, res) => {
  const meeting = await prisma.meeting.findFirst({
    where: { 
      id: req.params.id,
      userId: req.user.id
    },
    include: {
      transcripts: true,
      actionItems: true,
      summary: true,
      shareLinks: true
    }
  });
  
  if (!meeting) return res.status(404).json({ error: 'Not found' });
  res.json(meeting);
});

// Create shareable link
router.post('/:id/share', authenticateToken, async (req, res) => {
  const { expiresInDays = 7, includeRecording = false } = req.body;
  
  const shareLink = await prisma.shareLink.create({
    data: {
      meetingId: req.params.id,
      token: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
      includeRecording
    }
  });
  
  res.json({
    url: `https://meetingmind.ai/m/${shareLink.token}`,
    expiresAt: shareLink.expiresAt
  });
});

// Update CRM integration
router.post('/:id/sync-crm', authenticateToken, async (req, res) => {
  const { crmType, dealId } = req.body;
  
  // Queue CRM sync job
  const job = await crmSyncQueue.add('sync-meeting', {
    meetingId: req.params.id,
    userId: req.user.id,
    crmType,
    dealId
  });
  
  res.json({ jobId: job.id, status: 'queued' });
});

export default router;
