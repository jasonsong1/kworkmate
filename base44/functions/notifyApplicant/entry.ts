import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { randomToken } from '../../shared/util.ts';
import { sendEmail, portalLink } from '../../shared/email.ts';
import { renderStageEmail } from '../../shared/emailStages.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const applicant = await base44.asServiceRole.entities.Applicant.get(body.applicant_id).catch(() => null);
    if (!applicant) return Response.json({ error: 'Applicant not found' }, { status: 404 });
    if (!me.branch_ids || !me.branch_ids.includes(applicant.branch_id)) {
      return Response.json({ error: 'You cannot manage this applicant' }, { status: 403 });
    }

    const job = applicant.job_id
      ? await base44.asServiceRole.entities.Job.get(applicant.job_id).catch(() => null)
      : null;
    const branch = await base44.asServiceRole.entities.Branch.get(applicant.branch_id).catch(() => null);
    const company = branch ? await base44.asServiceRole.entities.Company.get(branch.company_id).catch(() => null) : null;
    const brand = (job && job.brand_color) || (branch && branch.brand_color) || '#4338ca';

    if (body.type === 'rejection') {
      const mail = renderStageEmail(
        company,
        'rejected',
        { name: applicant.full_name, job_title: job ? job.title : 'the role', store: branch ? branch.name : 'our store' },
        { brandColor: brand }
      );
      const ok = await sendEmail(base44, { to: applicant.email, subject: mail.subject, html: mail.html });
      await base44.asServiceRole.entities.Applicant.update(applicant.id, {
        status: 'rejected',
        rejection_sent_at: new Date().toISOString()
      });
      return Response.json({ ok: true, sent: ok });
    }

    const token = applicant.interview_token || randomToken(24);
    const link = portalLink(body.origin, `/interview/${token}`);
    const slots = await base44.asServiceRole.entities.InterviewSlot.filter({ job_id: applicant.job_id, status: 'open' });

    const slotInfo =
      slots.length > 0
        ? `Please pick the time that suits you best — ${slots.length} slot${slots.length > 1 ? 's are' : ' is'} currently open.`
        : 'Our team will contact you shortly to arrange a time.';
    const mail = renderStageEmail(
      company,
      'invite',
      {
        name: applicant.full_name,
        job_title: job ? job.title : 'the role',
        store: branch ? branch.name : 'our store',
        slot_info: slotInfo
      },
      { brandColor: brand, ctaUrl: link }
    );
    const ok = await sendEmail(base44, { to: applicant.email, subject: mail.subject, html: mail.html });

    await base44.asServiceRole.entities.Applicant.update(applicant.id, {
      interview_token: token,
      invited_at: new Date().toISOString(),
      status: ['mini_interview', 'final_interview', 'interview_scheduled'].includes(applicant.status)
        ? applicant.status
        : 'final_interview'
    });

    return Response.json({ ok: true, sent: ok, interview_link: link });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}