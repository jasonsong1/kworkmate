import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const token = body.token;
    if (!token) return Response.json({ error: 'token is required' }, { status: 400 });

    const found = await base44.asServiceRole.entities.Applicant.filter({ interview_token: token });
    if (found.length === 0) return Response.json({ ok: false, invalid: true });
    const applicant = found[0];

    const job = applicant.job_id
      ? await base44.asServiceRole.entities.Job.get(applicant.job_id).catch(() => null)
      : null;
    const branch = job && job.branch_id
      ? await base44.asServiceRole.entities.Branch.get(job.branch_id).catch(() => null)
      : null;
    const company = job && job.company_id
      ? await base44.asServiceRole.entities.Company.get(job.company_id).catch(() => null)
      : null;

    const openSlots = job
      ? await base44.asServiceRole.entities.InterviewSlot.filter({ job_id: job.id, status: 'open' })
      : [];

    let booked = null;
    if (applicant.interview_slot_id) {
      const s = await base44.asServiceRole.entities.InterviewSlot.get(applicant.interview_slot_id).catch(() => null);
      if (s) booked = { id: s.id, date: s.date, start_time: s.start_time, end_time: s.end_time, location: s.location || '' };
    }

    const location = branch
      ? [branch.address, branch.suburb, branch.state, branch.postcode].filter(Boolean).join(', ')
      : '';

    return Response.json({
      ok: true,
      applicant: { full_name: applicant.full_name, first_name: String(applicant.full_name || '').split(' ')[0] },
      job: job ? { title: job.title, position: job.position || '', hourly_rate: job.hourly_rate || 0 } : null,
      branch: branch ? { name: branch.name, logo_url: branch.logo_url || '', brand_color: branch.brand_color || '#4338ca', phone: branch.phone || '' } : null,
      company: company ? { name: company.name } : null,
      location,
      allow_reschedule: Boolean(company && company.allow_interview_reschedule),
      duration_min: openSlots.length > 0 ? Number(openSlots[0].duration_min) || 20 : 20,
      slots: openSlots
        .map((s) => ({ id: s.id, date: s.date, start_time: s.start_time, end_time: s.end_time, duration_min: Number(s.duration_min) || 20 }))
        .sort((a, b) => (a.date + a.start_time > b.date + b.start_time ? 1 : -1)),
      booked,
      invited_at: applicant.invited_at || null
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}