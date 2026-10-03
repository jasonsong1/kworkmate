import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { randomToken } from '../../shared/util.ts';
import { sendApplicantEmail, portalLink } from '../../shared/email.ts';
import { renderStageEmail } from '../../shared/emailStages.ts';

// Sends the emails a hiring team triggers by hand. The same endpoint re-sends the last
// message when the first one did not arrive.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const applicant = await base44.asServiceRole.entities.Applicant.get(body.applicant_id).catch(() => null);
    if (!applicant) return Response.json({ error: 'Applicant not found' }, { status: 404 });

    const allowed =
      me.role === 'admin' ||
      (me.company_id && me.company_id === applicant.company_id) ||
      (me.branch_ids || []).includes(applicant.branch_id);
    if (!allowed) return Response.json({ error: 'You cannot manage this applicant' }, { status: 403 });

    const job = applicant.job_id
      ? await base44.asServiceRole.entities.Job.get(applicant.job_id).catch(() => null)
      : null;
    const branch = await base44.asServiceRole.entities.Branch.get(applicant.branch_id).catch(() => null);
    const company = branch ? await base44.asServiceRole.entities.Company.get(branch.company_id).catch(() => null) : null;
    const brand = (job && job.brand_color) || (branch && branch.brand_color) || '#4338ca';
    const vars = {
      name: applicant.full_name,
      job_title: job ? job.title : 'the role',
      store: branch ? branch.name : 'our store'
    };
    const type = body.type || 'interview_invite';

    if (type === 'rejection') {
      const mail = renderStageEmail(company, 'rejected', vars, { brandColor: brand });
      const result = await sendApplicantEmail(base44, applicant, {
        type: 'rejection',
        subject: mail.subject,
        html: mail.html
      });
      await base44.asServiceRole.entities.Applicant.update(applicant.id, {
        status: 'rejected',
        rejection_sent_at: new Date().toISOString()
      });
      return Response.json({ ok: true, sent: result.ok, error: result.error });
    }

    if (type === 'application_received') {
      const mail = renderStageEmail(company, 'applied', vars, { brandColor: brand });
      const result = await sendApplicantEmail(base44, applicant, {
        type: 'applied',
        subject: mail.subject,
        html: mail.html
      });
      return Response.json({ ok: true, sent: result.ok, error: result.error });
    }

    if (type === 'hired') {
      if (!applicant.onboarding_token) {
        return Response.json({ error: 'This applicant has no onboarding link yet' }, { status: 400 });
      }
      const found = await base44.asServiceRole.entities.EmployeeProfile.filter({ applicant_id: applicant.id });
      const profiles = Array.isArray(found) ? found : (found && found.items) || [];
      const link = portalLink(body.origin, `/onboarding/${applicant.onboarding_token}`);
      const mail = renderStageEmail(
        company,
        'hired',
        { ...vars, employee_number: profiles.length > 0 ? profiles[0].employee_number : '' },
        { brandColor: brand, ctaUrl: link }
      );
      const result = await sendApplicantEmail(base44, applicant, {
        type: 'hired',
        subject: mail.subject,
        html: mail.html
      });
      return Response.json({ ok: true, sent: result.ok, error: result.error });
    }

    const token = applicant.interview_token || randomToken(24);
    const link = portalLink(body.origin, `/interview/${token}`);
    const slots = await base44.asServiceRole.entities.InterviewSlot.filter({ job_id: applicant.job_id, status: 'open' });

    const slotInfo =
      slots.length > 0
        ? `Please pick the time that suits you best — ${slots.length} slot${slots.length > 1 ? 's are' : ' is'} currently open.`
        : 'Our team will contact you shortly to arrange a time.';
    const mail = renderStageEmail(company, 'invite', { ...vars, slot_info: slotInfo }, { brandColor: brand, ctaUrl: link });
    const result = await sendApplicantEmail(base44, applicant, {
      type: 'invite',
      subject: mail.subject,
      html: mail.html
    });

    await base44.asServiceRole.entities.Applicant.update(applicant.id, {
      interview_token: token,
      invited_at: new Date().toISOString(),
      status: ['mini_interview', 'final_interview', 'interview_scheduled'].includes(applicant.status)
        ? applicant.status
        : 'final_interview'
    });

    return Response.json({ ok: true, sent: result.ok, error: result.error, interview_link: link });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}