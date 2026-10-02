import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendEmail, brandedEmail } from '../../shared/email.ts';

const DEFAULT_QUESTIONS = [
  { id: 'q1', question: 'Tell us about your hospitality experience and where you last worked.', seconds: 60 },
  { id: 'q2', question: 'Describe a busy shift you handled and what you did.', seconds: 60 },
  { id: 'q3', question: 'How do you handle an unhappy customer?', seconds: 45 },
  { id: 'q4', question: 'Which days and shifts can you work each week?', seconds: 45 },
  { id: 'q5', question: 'When can you start, and how long do you plan to stay with us?', seconds: 45 }
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

    const found = await base44.asServiceRole.entities.Applicant.filter({ mini_interview_token: token });
    const applicant = found[0];
    if (!applicant) return Response.json({ error: 'Interview link not found' }, { status: 404 });
    if (applicant.mini_interview_status === 'completed') {
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
      company && Array.isArray(company.interview_questions) && company.interview_questions.length > 0
        ? company.interview_questions
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

    const responses = Array.isArray(applicant.mini_interview_responses)
      ? [...applicant.mini_interview_responses]
      : [];
    responses[index] = {
      question: body.question || (source[index] ? source[index].question : ''),
      file_uri: fileUri,
      transcript,
      answered_at: new Date().toISOString()
    };

    const last = index >= total - 1;
    await base44.asServiceRole.entities.Applicant.update(applicant.id, {
      mini_interview_responses: responses,
      mini_interview_status: last ? 'completed' : 'sent',
      mini_interview_completed_at: last ? new Date().toISOString() : applicant.mini_interview_completed_at,
      ...(last ? { status: 'mini_interview' } : {})
    });

    if (last) {
      const recipients = [
        ...new Set([...(((branch && branch.manager_emails) || []) as string[]), job && job.contact_email].filter(Boolean))
      ].slice(0, 3) as string[];
      for (const to of recipients) {
        await sendEmail(base44, {
          to,
          subject: `Voice interview completed — ${applicant.full_name}`,
          html: brandedEmail({
            heading: 'A candidate finished their voice interview',
            brandColor: job ? job.brand_color : undefined,
            lines: [
              `<b>${applicant.full_name}</b> answered all ${total} voice questions for ${
                job ? job.title : 'your role'
              }.`,
              'Open the applicant in K-Workmate to read the transcript and listen to the recording.'
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