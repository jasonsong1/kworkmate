import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendEmail, brandedEmail } from '../../shared/email.ts';

const DEFAULT_QUESTIONS = [
  { id: 'v1', question: 'Tell us about yourself and your hospitality experience.', seconds: 60 },
  { id: 'v2', question: 'Describe a busy shift you handled and what you did.', seconds: 60 },
  { id: 'v3', question: 'How do you handle an unhappy customer?', seconds: 45 },
  { id: 'v4', question: 'Why would you like to work with us, and when can you start?', seconds: 45 }
];

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const token = String(body.token || '').trim();
    const index = Number(body.index) || 0;
    const fileUri = String(body.file_uri || '');
    if (!token || !fileUri) {
      return Response.json({ error: 'token and file_uri are required' }, { status: 400 });
    }

    const found = await base44.asServiceRole.entities.Applicant.filter({ video_interview_token: token });
    const applicant = found[0];
    if (!applicant) return Response.json({ error: 'Interview link not found' }, { status: 404 });
    if (applicant.video_interview_status === 'completed') {
      return Response.json({ ok: true, completed: true });
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

    const source =
      company && Array.isArray(company.video_interview_questions) && company.video_interview_questions.length > 0
        ? company.video_interview_questions
        : DEFAULT_QUESTIONS;
    const total = source.filter((q: any) => q && q.question).length || 1;

    let transcript = '';
    try {
      const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
        file_uri: fileUri,
        expires_in: 900
      });
      const result = await base44.asServiceRole.integrations.Core.TranscribeAudio({
        audio_url: signed.signed_url
      });
      transcript = typeof result === 'string' ? result : '';
    } catch (error: any) {
      console.error('transcription failed', error && error.message);
    }

    const responses = Array.isArray(applicant.video_interview_responses)
      ? [...applicant.video_interview_responses]
      : [];
    responses[index] = {
      question: body.question || (source[index] ? source[index].question : ''),
      file_uri: fileUri,
      transcript,
      answered_at: new Date().toISOString()
    };

    const last = index >= total - 1;
    await base44.asServiceRole.entities.Applicant.update(applicant.id, {
      video_interview_responses: responses,
      video_interview_status: last ? 'completed' : 'sent',
      video_interview_completed_at: last ? new Date().toISOString() : applicant.video_interview_completed_at,
      ...(last && ['submitted', 'top10', 'mini_interview'].includes(applicant.status)
        ? { status: 'final_interview' }
        : {})
    });

    if (last) {
      const recipients = [
        ...new Set([...(((branch && branch.manager_emails) || []) as string[]), job && job.contact_email].filter(Boolean))
      ].slice(0, 3) as string[];
      for (const to of recipients) {
        await sendEmail(base44, {
          to,
          subject: `Video interview completed — ${applicant.full_name}`,
          html: brandedEmail({
            heading: 'A candidate finished their video interview',
            brandColor: job ? job.brand_color : undefined,
            lines: [
              `<b>${applicant.full_name}</b> recorded all ${total} video answers for ${
                job ? job.title : 'your role'
              }.`,
              'Open the applicant in K-Workmate to watch the recordings and read the transcripts.'
            ],
            footer: `${company ? company.name : ''} · K-Workmate`
          })
        });
      }
    }

    return Response.json({ ok: true, completed: last, index });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}