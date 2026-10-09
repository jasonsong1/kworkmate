import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveCaller } from '../../shared/kwAuth.ts';
import { formatEmployeeNumber, randomToken } from '../../shared/util.ts';
import { onboardingAttachments, sendApplicantEmail, portalLink } from '../../shared/email.ts';
import { renderStageEmail } from '../../shared/emailStages.ts';
import { sendAccountAccessEmail } from '../../shared/account.ts';
import { packageState, resolveLimit } from '../../shared/packages.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const applicant = await base44.asServiceRole.entities.Applicant.get(body.applicant_id).catch(() => null);
    if (!applicant) return Response.json({ error: 'Applicant not found' }, { status: 404 });
    if (!me.branch_ids || !me.branch_ids.includes(applicant.branch_id)) {
      return Response.json({ error: 'You cannot hire for this branch' }, { status: 403 });
    }
    if (applicant.status === 'hired') {
      return Response.json({ error: 'This applicant is already hired' }, { status: 400 });
    }

    const job = applicant.job_id
      ? await base44.asServiceRole.entities.Job.get(applicant.job_id).catch(() => null)
      : null;
    const branch = await base44.asServiceRole.entities.Branch.get(applicant.branch_id).catch(() => null);
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 });
    const company = await base44.asServiceRole.entities.Company.get(branch.company_id).catch(() => null);

    // How many people the company's package covers.
    const state = packageState(company);
    const employeeLimit = resolveLimit(company && company.employee_limit_override, state.employeeLimit);
    if (employeeLimit !== null) {
      const total = await base44.asServiceRole.entities.EmployeeProfile.count({
        company_id: branch.company_id,
        status: { $ne: 'inactive' }
      });
      if (total >= employeeLimit) {
        return Response.json(
          { error: `This package covers up to ${employeeLimit} employees. Move to a higher package to add more.` },
          { status: 400 }
        );
      }
    }

    const nextNumber = Number(branch.employee_next_number) || 1;
    const employeeNumber = formatEmployeeNumber(branch.employee_prefix, branch.employee_number_padding, nextNumber);
    const token = randomToken(24);

    const docs = [];
    if (applicant.resume_file_uri) {
      docs.push({
        name: applicant.resume_filename || 'Resume',
        type: 'resume',
        file_uri: applicant.resume_file_uri,
        created_at: new Date().toISOString()
      });
    }

    const profile = await base44.asServiceRole.entities.EmployeeProfile.create({
      company_id: branch.company_id,
      branch_id: branch.id,
      user_email: applicant.email,
      full_name: applicant.full_name,
      employee_number: employeeNumber,
      position: body.position || (job ? job.position : '') || '',
      visa_type: applicant.visa_type || '',
      hourly_rate: Number(body.hourly_rate) || (job ? Number(job.hourly_rate) || 0 : 0),
      employment_type: body.employment_type || (job ? job.employment_type : 'casual') || 'casual',
      status: 'active',
      start_date: body.start_date || new Date().toISOString().slice(0, 10),
      phone: applicant.phone || '',
      emergency_contact_name: applicant.emergency_contact_name || '',
      emergency_contact_phone: applicant.emergency_contact_phone || '',
      onboarding_status: 'pending',
      onboarding_token: token,
      language: 'ko',
      applicant_id: applicant.id,
      docs
    });

    await base44.asServiceRole.entities.Branch.update(branch.id, { employee_next_number: nextNumber + 1 });
    await base44.asServiceRole.entities.Applicant.update(applicant.id, {
      status: 'hired',
      hired_at: new Date().toISOString(),
      onboarding_token: token,
      onboarding_status: 'pending'
    });

    // The ad closes by itself once the store has hired everyone it asked for. Raising the number
    // of openings later is what opens it again.
    const openings = Number(job && job.openings) || 0;
    if (job && openings > 0 && job.status !== 'closed') {
      const hired = await base44.asServiceRole.entities.Applicant.count({ job_id: job.id, status: 'hired' });
      if (hired >= openings) {
        await base44.asServiceRole.entities.Job.update(job.id, { status: 'closed' });
      }
    }

    const link = portalLink(body.origin, `/onboarding/${token}`);

    // The company's onboarding documents ride along with the hired email.
    const { attachments, skipped: skippedDocs } = onboardingAttachments(company);

    const mail = renderStageEmail(
      company,
      'hired',
      {
        name: applicant.full_name,
        job_title: job ? job.title : 'the role',
        store: branch.name,
        employee_number: employeeNumber
      },
      {
        brandColor: branch.brand_color || '#4338ca',
        ctaUrl: link,
        extraLines:
          skippedDocs.length > 0
            ? [`Your remaining onboarding documents (${skippedDocs.join(', ')}) are on your onboarding page.`]
            : []
      }
    );
    const emailSent = await sendApplicantEmail(base44, applicant, {
      type: 'hired',
      subject: mail.subject,
      html: mail.html,
      attachments
    });
    // Hiring is what creates the account, so the app user is invited and handed a
    // password setup link straight away.
    const account = await sendAccountAccessEmail(base44, applicant.email);

    return Response.json({
      ok: true,
      employee: profile,
      onboarding_token: token,
      onboarding_link: link,
      email_sent: emailSent.ok,
      invited: account.invited,
      password_email_sent: account.password_email_sent
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}