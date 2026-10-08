import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { greetingFor, plannedTopics, resumePoint, turnsOf } from '../../shared/interview.ts';

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const token = String(body.token || '').trim();
    if (!token) return Response.json({ error: 'token is required' }, { status: 400 });

    const found = await base44.asServiceRole.entities.Applicant.filter({ video_interview_token: token });
    const applicant = found[0];
    if (!applicant) return Response.json({ error: 'Interview link not found' }, { status: 404 });

    const company = applicant.company_id
      ? await base44.asServiceRole.entities.Company.get(applicant.company_id).catch(() => null)
      : null;
    const job = applicant.job_id
      ? await base44.asServiceRole.entities.Job.get(applicant.job_id).catch(() => null)
      : null;

    const topics = plannedTopics(company, 'video');
    const turns = turnsOf(applicant, 'video');
    const next = resumePoint(topics, turns);
    const completed = applicant.video_interview_status === 'completed' || !next;

    return Response.json({
      full_name: applicant.full_name,
      job_title: job ? job.title : '',
      company_name: company ? company.name : '',
      brand_color: (job && job.brand_color) || (company && company.brand_color) || '#4338ca',
      greeting: greetingFor(applicant.full_name, company ? company.name : '', job ? job.title : ''),
      total: topics.length,
      turns,
      next: completed ? null : next,
      completed
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}