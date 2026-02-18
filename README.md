# MeetingMind AI - Setup Guide

## Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- Chrome Extension Developer Account
- OpenAI API Key
- Deepgram API Key

## Quick Start

### 1. Backend Setup
```bash
cd backend
npm install
npx prisma migrate dev
npx prisma generate
npm run dev
