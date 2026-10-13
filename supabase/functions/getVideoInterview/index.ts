// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/getVideoInterview/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { greetingFor, plannedTopics, resumePoint, turnsOf } from '../_shared/interview.ts';

async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
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

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
