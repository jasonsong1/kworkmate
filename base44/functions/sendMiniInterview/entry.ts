import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendEmail, brandedEmail, cleanOrigin } from '../../shared/email.ts';

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const applicantId = body.applicant_id;
    if (!applicantId) return Response.json({ error: 'applicant_id is required' }, { status: 400 });

    const applicant = await base44.asServiceRole.entities.Applicant.get(applicantId).catch(() => null);
    if (!applicant) return Response.json({ error: 'Applicant not found' }, { status: 404 });

    const allowed =
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

    const token = applicant.mini_interview_token || crypto.randomUUID();
    const origin = cleanOrigin(body.origin || req.headers.get('origin') || '');
    const link = `${origin}/mini-interview/${token}`;

    const sent = await sendEmail(base44, {
      to: applicant.email,
      subject: `Voice interview invitation — ${job ? job.title : 'your application'}`,
      html: brandedEmail({
        heading: 'Your voice interview is ready',
        brandColor: (job && job.brand_color) || (branch && branch.brand_color) || (company && company.brand_color),
        lines: [
          `Hi ${applicant.full_name},`,
          `You have been shortlisted for <b>${job ? job.title : 'the role'}</b>${
            branch ? ` at ${branch.name}` : ''
          }.`,
          'Please answer a few short questions using your voice. It takes about five minutes and you can do it from your phone.',
          'Open the link below when you are somewhere quiet.'
        ],
        ctaText: 'Start voice interview',
        ctaUrl: link,
        footer: `${company ? company.name : ''} · K-Workmate`
      })
    });

    await base44.asServiceRole.entities.Applicant.update(applicant.id, {
      mini_interview_token: token,
      mini_interview_status: 'sent',
      mini_interview_sent_at: new Date().toISOString(),
      mini_interview_responses: applicant.mini_interview_responses || []
    });

    return Response.json({ ok: true, sent, link });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}