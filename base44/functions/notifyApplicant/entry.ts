import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { randomToken } from '../../shared/util.ts';
import { sendEmail, brandedEmail, portalLink } from '../../shared/email.ts';

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
      const ok = await sendEmail(base44, {
        to: applicant.email,
        subject: `Your application for ${job ? job.title : 'the role'}`,
        html: brandedEmail({
          heading: 'Thank you for your time',
          brandColor: brand,
          lines: [
            `Hi ${applicant.full_name},`,
            `Thank you for applying for <b>${job ? job.title : 'the role'}</b> at ${branch ? branch.name : 'our store'} and for taking the time to speak with us.`,
            'We have decided to move forward with other candidates for this position. We truly appreciate your interest and wish you the very best.'
          ],
          footer: `${company ? company.name : ''} · BranchHire`
        })
      });
      await base44.asServiceRole.entities.Applicant.update(applicant.id, {
        status: 'rejected',
        rejection_sent_at: new Date().toISOString()
      });
      return Response.json({ ok: true, sent: ok });
    }

    const token = applicant.interview_token || randomToken(24);
    const link = portalLink(body.origin, `/interview/${token}`);
    const slots = await base44.asServiceRole.entities.InterviewSlot.filter({ job_id: applicant.job_id, status: 'open' });

    const ok = await sendEmail(base44, {
      to: applicant.email,
      subject: `You are invited to interview — ${job ? job.title : 'the role'}`,
      html: brandedEmail({
        heading: 'Congratulations — you are invited to interview',
        brandColor: brand,
        lines: [
          `Hi ${applicant.full_name},`,
          `We reviewed your application for <b>${job ? job.title : 'the role'}</b> at ${branch ? branch.name : 'our store'} and would love to meet you.`,
          slots.length > 0
            ? `Please pick the time that suits you best — ${slots.length} slot${slots.length > 1 ? 's are' : ' is'} currently open.`
            : 'Our team will contact you shortly to arrange a time.',
          'The interview is a short face-to-face conversation at the store.'
        ],
        ctaText: 'Choose your interview time',
        ctaUrl: link,
        footer: `${company ? company.name : ''} · BranchHire`
      })
    });

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