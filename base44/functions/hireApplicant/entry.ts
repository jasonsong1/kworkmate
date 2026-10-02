import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { formatEmployeeNumber, randomToken } from '../../shared/util.ts';
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
      hourly_rate: Number(body.hourly_rate) || (job ? Number(job.hourly_rate) || 0 : 0),
      employment_type: body.employment_type || (job ? job.employment_type : 'casual') || 'casual',
      status: 'active',
      start_date: body.start_date || new Date().toISOString().slice(0, 10),
      phone: applicant.phone || '',
      emergency_contact_name: applicant.emergency_contact_name || '',
      emergency_contact_phone: applicant.emergency_contact_phone || '',
      onboarding_status: 'pending',
      onboarding_token: token,
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

    const link = portalLink(body.origin, `/onboarding/${token}`);
    const mail = renderStageEmail(
      company,
      'hired',
      {
        name: applicant.full_name,
        job_title: job ? job.title : 'the role',
        store: branch.name,
        employee_number: employeeNumber
      },
      { brandColor: branch.brand_color || '#4338ca', ctaUrl: link }
    );
    const emailSent = await sendEmail(base44, { to: applicant.email, subject: mail.subject, html: mail.html });

    return Response.json({ ok: true, employee: profile, onboarding_token: token, onboarding_link: link, email_sent: emailSent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}