// The app's own mail (applicants and team members) is delivered through the app's Resend
// account, which carries its own sending limits instead of the platform mail service's daily
// recipient cap.
import { secrets } from 'base44:runtime';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_FROM = 'kworkmate <noreply@kworkmate.com>';

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
    <p style="margin:0;font-size:12px;color:#94a3b8">${footer || 'Sent by kworkmate'}</p>
  </div>
</div>`;
}

function base64FromBytes(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Resend takes attachments as base64 content, so a stored file URL is fetched and encoded.
async function resendAttachment(attachment) {
  if (!attachment || !attachment.filename) return null;
  if (attachment.content) return { filename: attachment.filename, content: attachment.content };
  if (!attachment.file_url) return null;
  const res = await fetch(attachment.file_url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    console.error('Attachment fetch failed:', attachment.file_url, res.status);
    return null;
  }
  return { filename: attachment.filename, content: base64FromBytes(new Uint8Array(await res.arrayBuffer())) };
}

async function sendViaResend(key, { to, subject, html, attachments }) {
  const files = [];
  for (const attachment of attachments || []) {
    const file = await resendAttachment(attachment);
    if (file) files.push(file);
  }
  const body = { from: RESEND_FROM, to: [to], subject, html };
  if (files.length > 0) body.attachments = files;
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error('Resend refused the message:', res.status, detail.slice(0, 200));
    // A 4xx is a configuration refusal (unverified domain, revoked key): report it, so the
    // message goes out through the platform mail service instead of being lost.
    if (res.status >= 400 && res.status < 500) return false;
    throw new Error(`Resend refused the message (${res.status})`);
  }
  return true;
}

// Returns the outcome instead of only a true/false, so the caller can record why a
// message did not arrive.
export async function sendEmailDetailed(base44, { to, subject, html, attachments }) {
  try {
    const key = secrets.get('RESEND_API_KEY');
    // Resend carries the message; anything it will not take (no key, or a configuration
    // refusal) is handed to the platform mail service, so mail is never silently dropped.
    if (!key || !(await sendViaResend(key, { to, subject, html, attachments }))) {
      const payload = { to, subject, html };
      if (Array.isArray(attachments) && attachments.length > 0) payload.attachments = attachments;
      await base44.asServiceRole.integrations.Core.SendEmail(payload);
    }
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

// The company's onboarding documents ride along with the onboarding email. One email can carry
// five files and 10MB in total, so anything past that is named in the body instead.
export function onboardingAttachments(company) {
  const docs = (company && company.onboarding_docs) || [];
  const attachments = [];
  const skipped = [];
  let bytes = 0;
  for (const doc of docs) {
    const size = Number(doc.size) || 0;
    if (!doc.file_url || attachments.length >= 5 || bytes + size > 10 * 1024 * 1024) {
      skipped.push(doc.name || 'document');
      continue;
    }
    attachments.push({ filename: doc.name || 'document', file_url: doc.file_url });
    bytes += size;
  }
  return { attachments, skipped };
}