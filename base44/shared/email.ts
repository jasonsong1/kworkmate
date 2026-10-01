export function brandedEmail({ heading, lines, ctaText, ctaUrl, brandColor, footer }) {
  const color = brandColor || '#4338ca';
  const body = (lines || [])
    .map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155">${l}</p>`)
    .join('');
  const cta =
    ctaText && ctaUrl
      ? `<a href="${ctaUrl}" style="display:inline-block;margin-top:10px;padding:12px 22px;border-radius:10px;background:${color};color:#ffffff;font-weight:600;text-decoration:none;font-size:15px">${ctaText}</a>`
      : '';
  return `<div style="font-family:Inter,Arial,sans-serif;background:#f1f5f9;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e2e8f0">
    <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;line-height:1.3">${heading}</h1>
    ${body}
    ${cta}
    <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0" />
    <p style="margin:0;font-size:12px;color:#94a3b8">${footer || 'Sent by kworkmate'}</p>
  </div>
</div>`;
}

export async function sendEmail(base44, { to, subject, html, attachments }) {
  try {
    const payload = { to, subject, html };
    if (Array.isArray(attachments) && attachments.length > 0) payload.attachments = attachments;
    await base44.asServiceRole.integrations.Core.SendEmail(payload);
    return true;
  } catch (error) {
    console.error('SendEmail failed:', error && error.message);
    return false;
  }
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