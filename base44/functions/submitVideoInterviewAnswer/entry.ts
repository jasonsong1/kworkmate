import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendEmail, brandedEmail } from '../../shared/email.ts';
import {
  appendAnswer,
  followUpFor,
  followUpNeeded,
  followUpTurn,
  plannedTopics,
  resumePoint,
  transcribeAnswer,
  turnsOf
} from '../../shared/interview.ts';

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const token = String(body.token || '').trim();
    const fileUri = String(body.file_uri || '');
    if (!token || !fileUri) {
      return Response.json({ error: 'token and file_uri are required' }, { status: 400 });
    }

    const found = await base44.asServiceRole.entities.Applicant.filter({ video_interview_token: token });
    const applicant = found[0];
    if (!applicant) return Response.json({ error: 'Interview link not found' }, { status: 404 });
    if (applicant.video_interview_status === 'completed') {
      return Response.json({ ok: true, completed: true, turns: turnsOf(applicant, 'video') });
    }

    const company = applicant.company_id
      ? await base44.asServiceRole.entities.Company.get(applicant.company_id).catch(() => null)
      : null;
    const job = applicant.job_id
      ? await base44.asServiceRole.entities.Job.get(applicant.job_id).catch(() => null)
      : null;
    const branch = applicant.branch_id
      ? await base44.asServiceRole.entities.Branch.get(applicant.branch_id).catch(() => null)
      : null;

    const topics = plannedTopics(company, 'video');
    const before = turnsOf(applicant, 'video');
    const pending = resumePoint(topics, before);

    // The question being answered is the one the interviewer is waiting on, worked out from the
    // conversation itself, so a reload or a double tap can never record an answer twice or skip a
    // topic.
    const asked = pending || {
      question: String(body.question || ''),
      topic_index: Number(body.index) || 0,
      kind: 'planned',
      seconds: 60
    };

    const transcript = await transcribeAnswer(base44, fileUri);
    let turns = appendAnswer(before, {
      question: asked.question,
      kind: asked.kind,
      topicIndex: asked.topic_index,
      seconds: asked.seconds,
      fileUri,
      transcript
    });

    const topic = topics[asked.topic_index];
    if (topic && followUpNeeded(turns, asked.topic_index, asked.kind, transcript)) {
      const question = await followUpFor({
        base44,
        topic,
        transcript,
        jobTitle: job ? job.title : '',
        candidateName: applicant.full_name,
        asked: turns.filter((turn: any) => turn.role === 'interviewer').map((turn: any) => turn.question)
      });
      if (question) turns = [...turns, followUpTurn(question, asked.topic_index, asked.seconds)];
    }

    const next = resumePoint(topics, turns);
    const last = !next;

    await base44.asServiceRole.entities.Applicant.update(applicant.id, {
      video_interview_responses: turns,
      video_interview_status: last ? 'completed' : 'sent',
      video_interview_completed_at: last ? new Date().toISOString() : applicant.video_interview_completed_at,
      ...(last && ['submitted', 'top10', 'mini_interview'].includes(applicant.status)
        ? { status: 'final_interview' }
        : {})
    });

    if (last) {
      const recipients = [...new Set(((branch && branch.manager_emails) || []) as string[])]
        .filter(Boolean)
        .slice(0, 3) as string[];
      for (const to of recipients) {
        await sendEmail(base44, {
          to,
          subject: `Video interview completed — ${applicant.full_name}`,
          html: brandedEmail({
            heading: 'A candidate finished their video interview',
            brandColor: job ? job.brand_color : undefined,
            lines: [
              `<b>${applicant.full_name}</b> talked through all ${topics.length} topics for ${
                job ? job.title : 'your role'
              }.`,
              'Open the applicant in kworkmate to watch the conversation and read the transcripts.'
            ],
            footer: `${company ? company.name : ''} · kworkmate`
          })
        });
      }
    }

    return Response.json({ ok: true, completed: last, turns, next: next || null, transcript });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}