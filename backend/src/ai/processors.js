import { OpenAI } from 'openai';
import { Queue } from 'bull';

const openai = new OpenAI();
const postProcessQueue = new Queue('post-processing', process.env.REDIS_URL);

// Process meeting completion jobs
postProcessQueue.process('generate-followup', async (job) => {
  const { meetingId, summary } = job.data;
  
  // Generate follow-up email
  const email = await generateFollowUpEmail(summary);
  
  // Save to database
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { followUpEmail: email }
  });
  
  // Send notification if enabled
  await sendEmailNotification(meetingId, email);
});

postProcessQueue.process('crm-sync', async (job) => {
  const { meetingId, userId } = job.data;
  
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { integrations: true }
  });
  
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { summary: true, actionItems: true }
  });
  
  // Sync to HubSpot if connected
  const hubspotIntegration = user.integrations.find(i => i.type === 'hubspot');
  if (hubspotIntegration) {
    await syncToHubSpot(hubspotIntegration.config, meeting);
  }
  
  // Sync to Salesforce if connected
  const salesforceIntegration = user.integrations.find(i => i.type === 'salesforce');
  if (salesforceIntegration) {
    await syncToSalesforce(salesforceIntegration.config, meeting);
  }
});

async function generateFollowUpEmail(summary) {
  const prompt = `
  Generate a professional follow-up email based on this meeting summary:
  
  ${summary.summary}
  
  Key points discussed:
  ${summary.keyPoints.join('\n')}
  
  Action items:
  ${summary.actionItems?.map(a => `- ${a.task} (${a.owner})`).join('\n')}
  
  Write a concise, professional follow-up email that:
  1. Thanks participants
  2. Summarizes key decisions
  3. Lists action items with owners
  4. Suggests next meeting if applicable
  
  Return only the email body, no subject line.`;
  
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7
  });
  
  return completion.choices[0].message.content;
}

async function syncToHubSpot(config, meeting) {
  const hubspot = new HubSpotAPI(config.apiKey);
  
  // Create engagement (call/meeting note)
  await hubspot.crm.engagements.basicApi.create({
    properties: {
      hs_timestamp: meeting.startedAt.toISOString(),
      hs_meeting_title: meeting.title,
      hs_meeting_body: meeting.summary?.summary,
      hubspot_owner_id: config.ownerId
    }
  });
  
  // Associate with contacts/deals if specified
  if (meeting.crmDealId) {
    // Link to deal
  }
}
