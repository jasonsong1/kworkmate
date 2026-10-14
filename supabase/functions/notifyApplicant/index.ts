// 지원자에게 단계별 알림 이메일(서류접수, 인터뷰 초대, 불합격, 채용 등)을 발송하는 Edge Function입니다.

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';
import { randomToken } from '../_shared/util.ts';
import { onboardingAttachments, sendApplicantEmail, portalLink } from '../_shared/email.ts';
import { renderStageEmail } from '../_shared/emailStages.ts';

async function handler(req) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const applicant = await base44.asServiceRole.entities.Applicant.get(body.applicant_id).catch(() => null);
    if (!applicant) return Response.json({ error: 'Applicant not found' }, { status: 404 });

    const allowed =
      (me.role === 'admin' || me.app_role === 'super_admin' || me.email === 'sym910403@gmail.com') ||
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
      const { attachments } = onboardingAttachments(company);
      const result = await sendApplicantEmail(base44, applicant, {
        type: 'hired',
        subject: mail.subject,
        html: mail.html,
        attachments
      });
      return Response.json({ ok: true, sent: result.ok, error: result.error });
    }

    if (type === 'interview_cancelled') {
      const token = applicant.interview_token || randomToken(24);
      const link = portalLink(body.origin, `/interview/${token}`);
      const mail = renderStageEmail(
        company,
        'cancelled',
        { ...vars, date: body.slot_date || '', time: body.slot_time || '' },
        { brandColor: brand, ctaUrl: link }
      );
      const result = await sendApplicantEmail(base44, applicant, {
        type: 'cancelled',
        subject: mail.subject,
        html: mail.html
      });
      await base44.asServiceRole.entities.Applicant.update(applicant.id, {
        interview_token: token,
        interview_slot_id: '',
        interview_confirmed_at: '',
        status: applicant.status === 'hired' ? 'hired' : 'final_interview'
      });
      return Response.json({ ok: true, sent: result.ok, error: result.error });
    }

    const token = applicant.interview_token || randomToken(24);
    const link = portalLink(body.origin, `/interview/${token}`);

    // 지점 공용 슬롯 기준으로 열려있는 슬롯 수를 카운트합니다.
    const branchId = applicant.branch_id || (job && job.branch_id);
    const slots = branchId
      ? await base44.asServiceRole.entities.InterviewSlot.filter({ branch_id: branchId, status: 'open' })
      : [];

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
    console.error('notifyApplicant error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
