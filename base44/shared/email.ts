export function brandedEmail({ heading, lines, ctaText, ctaUrl, brandColor, footer, logoUrl }) {
  const color = brandColor || '#4338ca';
  const logo = logoUrl
    ? `<img src="${logoUrl}" alt="" style="display:block;max-height:52px;max-width:200px;margin:0 0 18px" />`
    : '';
  const body = (lines || [])
    .map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155">${l}</p>`)
    .join('');
  const cta =
    ctaText && ctaUrl
      ? `<a href="${ctaUrl}" style="display:inline-block;margin-top:10px;padding:12px 22px;border-radius:10px;background:${color};color:#ffffff;font-weight:600;text-decoration:none;font-size:15px">${ctaText}</a>`
      : '';
  return `<div style="font-family:Inter,Arial,sans-serif;background:#f1f5f9;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e2e8f0">
    ${logo}
    <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;line-height:1.3">${heading}</h1>
    ${body}
    ${cta}
    <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0" />
    <p style="margin:0;font-size:12px;color:#94a3b8">${footer || 'Sent by K-Workmate'}</p>
  </div>
</div>`;
}

// Returns the outcome instead of only a true/false, so the caller can record why a
// message did not arrive.
export async function sendEmailDetailed(base44, { to, subject, html, attachments }) {
  try {
    const payload = { to, subject, html };
    if (Array.isArray(attachments) && attachments.length > 0) payload.attachments = attachments;
    await base44.asServiceRole.integrations.Core.SendEmail(payload);
    return { ok: true, error: '' };
  } catch (error) {
    console.error('SendEmail failed:', error && error.message);
    return { ok: false, error: (error && error.message) || 'The email service refused the message.' };
  }
}

export async function sendEmail(base44, mail) {
  const result = await sendEmailDetailed(base44, mail);
  return result.ok;
}

// Applicant emails are written back onto the applicant, so the hiring team can see
// whether the message actually went out and send it again when it did not.
export async function sendApplicantEmail(base44, applicant, { type, subject, html, attachments }) {
  const attemptedAt = new Date().toISOString();
  const result = await sendEmailDetailed(base44, { to: applicant.email, subject, html, attachments });
  await base44.asServiceRole.entities.Applicant.update(applicant.id, {
    email_status: result.ok ? 'sent' : 'failed',
    email_type: type,
    email_sent_at: result.ok ? attemptedAt : '',
    email_attempted_at: attemptedAt,
    email_error: result.ok ? '' : result.error
  }).catch(() => null);
  return result;
}

export function cleanOrigin(origin) {
  const value = String(origin || '').trim();
  if (!/^https?:\/\//.test(value)) return '';
  return value.replace(/\/+$/, '');
}

export function portalLink(origin, path) {
  const base = cleanOrigin(origin);
  return base ? `${base}${path}` : path;
}