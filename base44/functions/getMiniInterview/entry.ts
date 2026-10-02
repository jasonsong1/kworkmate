import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

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
    if (!token) return Response.json({ error: 'token is required' }, { status: 400 });

    const found = await base44.asServiceRole.entities.Applicant.filter({ mini_interview_token: token });
    const applicant = found[0];
    if (!applicant) return Response.json({ error: 'Interview link not found' }, { status: 404 });

    const company = applicant.company_id
      ? await base44.asServiceRole.entities.Company.get(applicant.company_id).catch(() => null)
      : null;
    const job = applicant.job_id
      ? await base44.asServiceRole.entities.Job.get(applicant.job_id).catch(() => null)
      : null;

    const source =
      company && Array.isArray(company.interview_questions) && company.interview_questions.length > 0
        ? company.interview_questions
        : DEFAULT_QUESTIONS;

    const questions = source
      .filter((q: any) => q && q.question)
      .map((q: any) => ({ id: q.id, question: q.question, seconds: Number(q.seconds) || 60 }));

    return Response.json({
      full_name: applicant.full_name,
      job_title: job ? job.title : '',
      company_name: company ? company.name : '',
      brand_color: (job && job.brand_color) || (company && company.brand_color) || '#4338ca',
      questions,
      completed: applicant.mini_interview_status === 'completed'
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}