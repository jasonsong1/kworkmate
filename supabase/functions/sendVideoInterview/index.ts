// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/sendVideoInterview/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';
import { sendApplicantEmail, cleanOrigin } from '../_shared/email.ts';
import { renderStageEmail } from '../_shared/emailStages.ts';

async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    // Either door the employer signed in through answers here, so the button works for a
    // manager holding the ID their employer issued as well as for a platform account.
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const applicantId = body.applicant_id;
    if (!applicantId) return Response.json({ error: 'applicant_id is required' }, { status: 400 });

    const applicant = await base44.asServiceRole.entities.Applicant.get(applicantId).catch(() => null);
    if (!applicant) return Response.json({ error: 'Applicant not found' }, { status: 404 });

    const allowed =
      me.role === 'admin' ||
      (me.company_id && me.company_id === applicant.company_id) ||
      (me.branch_ids || []).includes(applicant.branch_id);
    if (!allowed) return Response.json({ error: 'You cannot manage this applicant' }, { status: 403 });

    const job = applicant.job_id
      ? await base44.asServiceRole.entities.Job.get(applicant.job_id).catch(() => null)
      : null;
    const branch = applicant.branch_id
      ? await base44.asServiceRole.entities.Branch.get(applicant.branch_id).catch(() => null)
      : null;
    const company = applicant.company_id
      ? await base44.asServiceRole.entities.Company.get(applicant.company_id).catch(() => null)
      : null;

    const token = applicant.video_interview_token || crypto.randomUUID();
    const origin = cleanOrigin(body.origin || req.headers.get('origin') || '');
    const link = `${origin}/video-interview/${token}`;

    const mail = renderStageEmail(
      company,
      'video',
      { name: applicant.full_name, job_title: job ? job.title : 'the role', store: branch ? branch.name : 'our store' },
      {
        brandColor: (job && job.brand_color) || (branch && branch.brand_color) || (company && company.brand_color),
        ctaUrl: link
      }
    );
    const result = await sendApplicantEmail(base44, applicant, {
      type: 'video',
      subject: mail.subject,
      html: mail.html
    });
    const sent = result.ok;

    // A fresh link starts a fresh conversation, so the applicant is never dropped back into the
    // middle of the previous attempt.
    await base44.asServiceRole.entities.Applicant.update(applicant.id, {
      video_interview_token: token,
      video_interview_status: 'sent',
      video_interview_sent_at: new Date().toISOString(),
      video_interview_completed_at: '',
      video_interview_responses: []
    });

    return Response.json({ ok: true, sent, link });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
