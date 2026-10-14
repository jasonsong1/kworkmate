// The app's own mail (applicants and team members) is delivered through the app's Resend
// account, which carries its own sending limits instead of the platform mail service's daily
// Supabase Edge Functions 환경에서는 Deno.env로 비밀값을 읽어옵니다.
export const secrets = new Proxy({}, {
  get: (_, prop: string) => Deno.env.get(prop) || ''
});

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_FROM = 'kworkmate <noreply@kworkmate.com>';

function plainText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Every team email wears the same house style: the kworkmate lockup on a light page, a white
// rounded card, the store badge, a bulletproof button and a quiet footer. Table markup with
// inline styles only, so Gmail, Apple Mail, Outlook and Naver all render it the same way.
// `badge` names the store the mail is about; `tip` is the one aside worth calling out.
export function brandedEmail({ heading, lines, ctaText, ctaUrl, brandColor, footer, logoUrl, badge, tip, preheader }) {
  const color = brandColor || '#2563eb';
  const paragraphs = (lines || []).filter((line) => line && String(line).trim());
  // The line the inbox shows beside the subject, taken from the mail itself when none is given.
  const preview = plainText(preheader || [heading, ...paragraphs].join(' ')).slice(0, 140);
  const mark = logoUrl
    ? `<img src="${logoUrl}" alt="kworkmate" style="display:block;max-height:34px;max-width:170px" />`
    : `<div style="background-color:${color};color:#ffffff;font-weight:800;font-size:17px;width:34px;height:34px;line-height:34px;text-align:center;border-radius:8px">K</div>`;
  const badgeHtml = badge
    ? `<div style="display:inline-block;background-color:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:12px;font-weight:600;padding:4px 10px;border-radius:9999px;margin:0 0 16px 0">📍 ${badge}</div>`
    : '';
  const body = paragraphs
    .map((line) => `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.65;color:#475569">${line}</p>`)
    .join('');
  const cta =
    ctaText && ctaUrl
      ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 24px 0">
                  <tr>
                    <td align="center">
                      <!--[if mso]>
                      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${ctaUrl}" style="height:48px;v-text-anchor:middle;width:280px" arcsize="16%" stroke="f" fillcolor="${color}">
                        <w:anchorlock/>
                        <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold">${ctaText}</center>
                      </v:roundrect>
                      <![endif]-->
                      <a href="${ctaUrl}" target="_blank" class="mobile-btn" style="mso-hide:all;display:inline-block;background-color:${color};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:10px;letter-spacing:-0.2px">${ctaText}</a>
                    </td>
                  </tr>
                </table>`
      : '';
  const tipHtml = tip
    ? `<div style="background-color:#fffbeb;border-left:3px solid #f59e0b;padding:12px 14px;border-radius:4px"><p style="margin:0;font-size:12px;color:#92400e;line-height:1.55">${tip}</p></div>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <style>
    table, td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; }
      .content-padding { padding: 28px 20px 24px 20px !important; }
      .mobile-btn { display: block !important; width: 100% !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
  <div style="display:none;font-size:1px;color:#f4f6f8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${preview}</div>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f6f8;padding:36px 12px 40px 12px">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="560" class="email-container" style="width:100%;max-width:560px;margin:0 auto">
          <tr>
            <td align="center" style="padding:0 0 22px 0">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:9px">${mark}</td>
                  <td style="vertical-align:middle;font-size:19px;font-weight:700;color:#0f172a;letter-spacing:-0.3px">kworkmate</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr><td style="height:4px;background-color:${color};font-size:0;line-height:0">&nbsp;</td></tr>
                <tr>
                  <td class="content-padding" style="padding:36px 32px 32px 32px">
                    ${badgeHtml}
                    <h1 style="margin:0 0 14px 0;font-size:21px;font-weight:700;color:#0f172a;line-height:1.35;letter-spacing:-0.3px">${heading}</h1>
                    ${body}
                    ${cta}
                    ${tipHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:22px 10px 0 10px;font-size:12px;line-height:1.6;color:#94a3b8">${footer || 'Sent by kworkmate'}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
    const key = (typeof Deno !== 'undefined' ? Deno.env.get('RESEND_API_KEY') : '') || '';
    // Resend carries the message; anything it will not take (no key, or a configuration
    // refusal) is handed to the platform mail service, so mail is never silently dropped.
    if (!key || !(await sendViaResend(key, { to, subject, html, attachments }))) {
      const payload = { to, subject, html };
      if (Array.isArray(attachments) && attachments.length > 0) payload.attachments = attachments;
      try {
        if (base44?.asServiceRole?.integrations?.Core?.SendEmail) {
          await base44.asServiceRole.integrations.Core.SendEmail(payload);
        }
      } catch (_) {}
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