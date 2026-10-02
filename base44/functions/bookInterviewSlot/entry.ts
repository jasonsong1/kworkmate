import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildInterviewIcs } from '../../shared/ics.ts';
import { base64Encode, addMinutesToTime } from '../../shared/util.ts';
import { sendEmail, brandedEmail } from '../../shared/email.ts';
import { renderStageEmail } from '../../shared/emailStages.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const token = body.token;
    const slotId = body.slot_id;
    if (!token || !slotId) return Response.json({ error: 'token and slot_id are required' }, { status: 400 });

    const found = await base44.asServiceRole.entities.Applicant.filter({ interview_token: token });
    if (found.length === 0) return Response.json({ ok: false, invalid: true });
    const applicant = found[0];

    const slot = await base44.asServiceRole.entities.InterviewSlot.get(slotId).catch(() => null);
    if (!slot) return Response.json({ error: 'Slot not found' }, { status: 404 });
    if (slot.job_id !== applicant.job_id) return Response.json({ error: 'Slot does not belong to this job' }, { status: 400 });

    if (slot.status === 'booked') {
      if (slot.booked_by_applicant_id === applicant.id) {
        return Response.json({ ok: true, already: true, slot: { id: slot.id, date: slot.date, start_time: slot.start_time, end_time: slot.end_time } });
      }
      return Response.json({ ok: false, taken: true });
    }
    if (slot.status === 'cancelled') return Response.json({ ok: false, cancelled: true });

    const now = new Date().toISOString();
    await base44.asServiceRole.entities.InterviewSlot.updateMany(
      { id: slot.id, status: 'open' },
      {
        $set: {
          status: 'booked',
          booked_by_applicant_id: applicant.id,
          booked_by_name: applicant.full_name,
          booked_at: now
        }
      }
    );

    const claimed = await base44.asServiceRole.entities.InterviewSlot.get(slot.id);
    if (!claimed || claimed.booked_by_applicant_id !== applicant.id) {
      return Response.json({ ok: false, taken: true });
    }

    await base44.asServiceRole.entities.Applicant.update(applicant.id, {
      interview_slot_id: claimed.id,
      interview_confirmed_at: now,
      status: 'interview_scheduled'
    });

    const job = applicant.job_id ? await base44.asServiceRole.entities.Job.get(applicant.job_id).catch(() => null) : null;
    const branch = job && job.branch_id ? await base44.asServiceRole.entities.Branch.get(job.branch_id).catch(() => null) : null;
    const company = job && job.company_id ? await base44.asServiceRole.entities.Company.get(job.company_id).catch(() => null) : null;

    const duration = Number(claimed.duration_min) || 20;
    const end = addMinutesToTime(claimed.date, claimed.start_time, duration);
    const location = branch
      ? [branch.address, branch.suburb, branch.state, branch.postcode].filter(Boolean).join(', ')
      : '';
    const title = job ? `Interview — ${job.title}${branch ? ` (${branch.name})` : ''}` : 'Interview';

    const ics = buildInterviewIcs({
      uid: `bh-${claimed.id}@branchhire`,
      title,
      description: 'Face-to-face interview booked through K-Workmate. Please arrive 5 minutes early.',
      location,
      date: claimed.date,
      startTime: claimed.start_time,
      durationMin: duration,
      organizerEmail: (branch && branch.manager_emails && branch.manager_emails[0]) || (company && company.contact_email) || '',
      attendeeEmail: applicant.email,
      attendeeName: applicant.full_name
    });

    const attachments = [{ filename: 'interview.ics', content: base64Encode(ics) }];

    const mail = renderStageEmail(
      company,
      'booked',
      {
        name: applicant.full_name,
        job_title: job ? job.title : 'the role',
        store: branch ? branch.name : 'our store',
        date: claimed.date,
        time: claimed.start_time,
        duration: String(duration),
        location
      },
      { brandColor: (job && job.brand_color) || (branch && branch.brand_color) }
    );
    await sendEmail(base44, { to: applicant.email, subject: mail.subject, html: mail.html, attachments });

    const recipients = [
      ...new Set([...(branch && branch.manager_emails) || [], (job && job.contact_email) || ''].filter(Boolean))
    ].slice(0, 3);
    for (const to of recipients) {
      await sendEmail(base44, {
        to,
        subject: `Interview booked — ${applicant.full_name} on ${claimed.date} ${claimed.start_time}`,
        html: brandedEmail({
          heading: 'An applicant booked an interview slot',
          brandColor: (branch && branch.brand_color) || '#4338ca',
          lines: [
            `<b>${applicant.full_name}</b> (${applicant.email}) booked <b>${claimed.date} at ${claimed.start_time}</b> for ${job ? job.title : 'the role'}.`,
            applicant.phone ? `Phone: ${applicant.phone}` : ''
          ].filter(Boolean),
          footer: `${branch ? branch.name : ''} · K-Workmate`
        }),
        attachments
      });
    }

    return Response.json({
      ok: true,
      slot: { id: claimed.id, date: claimed.date, start_time: claimed.start_time, end_time: end.time }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}