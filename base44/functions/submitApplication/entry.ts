import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { waitUntil } from 'base44:runtime';
import { normalizePhone } from '../../shared/util.ts';
import { sendEmail } from '../../shared/email.ts';
import { renderStageEmail } from '../../shared/emailStages.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const jobId = body.job_id;
    const email = String(body.email || '').trim().toLowerCase();
    const phone = normalizePhone(body.phone);
    const fullName = String(body.full_name || '').trim();

    if (!jobId) return Response.json({ error: 'job_id is required' }, { status: 400 });
    if (!fullName || !email || !phone) {
      return Response.json({ error: 'Name, email and phone are required' }, { status: 400 });
    }
    const job = await base44.asServiceRole.entities.Job.get(jobId).catch(() => null);
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

    // Questions the employer switched off are not required, so a missing answer never blocks the applicant.
    const askedKeys = (Array.isArray(job.required_questions) ? job.required_questions : [])
      .filter((q) => q && q.enabled !== false)
      .map((q) => q.key);
    const isAsked = (key) => askedKeys.length === 0 || askedKeys.includes(key);

    if (!body.resume_file_uri && isAsked('resume')) {
      return Response.json({ error: 'A resume file is required' }, { status: 400 });
    }
    if (!body.visa_expiry && isAsked('visa_expiry')) {
      return Response.json({ error: 'Visa expiry date is required' }, { status: 400 });
    }
    if (job.status !== 'open') return Response.json({ ok: false, closed: true });

    const branch = job.branch_id
      ? await base44.asServiceRole.entities.Branch.get(job.branch_id).catch(() => null)
      : null;
    const company = job.company_id
      ? await base44.asServiceRole.entities.Company.get(job.company_id).catch(() => null)
      : null;

    const byEmail = await base44.asServiceRole.entities.Applicant.filter({ job_id: jobId, email });
    const byPhone = phone
      ? await base44.asServiceRole.entities.Applicant.filter({ job_id: jobId, phone })
      : [];
    if (byEmail.length > 0 || byPhone.length > 0) {
      return Response.json({ ok: false, duplicate: true });
    }

    const applicant = await base44.asServiceRole.entities.Applicant.create({
      company_id: job.company_id,
      branch_id: job.branch_id,
      job_id: jobId,
      full_name: fullName,
      email,
      phone,
      visa_type: body.visa_type || '',
      visa_expiry: body.visa_expiry,
      availability: body.availability || {},
      available_immediately: body.available_immediately !== false,
      notice_period: body.notice_period || '',
      emergency_contact_name: body.emergency_contact_name || '',
      emergency_contact_phone: body.emergency_contact_phone || '',
      answers: body.answers || [],
      resume_file_uri: body.resume_file_uri,
      resume_filename: body.resume_filename || 'resume',
      resume_size: Number(body.resume_size) || 0,
      analysis_status: 'pending',
      status: 'submitted'
    });

    const place = branch ? `${branch.name}${branch.suburb ? ` (${branch.suburb})` : ''}` : 'our store';
    const mail = renderStageEmail(
      company,
      'applied',
      { name: fullName, job_title: job.title, store: place },
      { brandColor: job.brand_color || (branch && branch.brand_color) }
    );
    const emailSent = await sendEmail(base44, { to: email, subject: mail.subject, html: mail.html });

    waitUntil(
      base44.functions.invoke('analyzeApplicants', {
        job_id: jobId,
        applicant_id: applicant.id
      })
    );

    return Response.json({ ok: true, applicant_id: applicant.id, email_sent: emailSent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}