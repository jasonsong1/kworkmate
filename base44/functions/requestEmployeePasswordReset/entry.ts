import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { lower, randomHex } from '../../shared/kwAuth.ts';
import { sendEmail, brandedEmail, portalLink } from '../../shared/email.ts';

const MINUTES = 60;
// Asking twice inside this window does not send a second mail.
const QUIET_MINUTES = 2;

// Anyone may ask for a new password from the sign-in page. The answer is always the same, so the
// form can never be used to find out whether an address is registered.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const email = lower(body.email);
    if (!email) return Response.json({ error: 'Email is required' }, { status: 400 });

    const found = await base44.asServiceRole.entities.EmployeeProfile.filter({
      user_email: email,
      status: 'active'
    });
    const profile = found[0] || null;
    if (!profile) return Response.json({ ok: true });

    const recent = await base44.asServiceRole.entities.PasswordReset.filter(
      { profile_id: profile.id },
      { sort: '-created_date', limit: 1 }
    );
    const last = recent[0];
    const stillLive =
      last && !last.used_at && Date.parse(last.expires_at || '') > Date.now() &&
      Date.now() - Date.parse(last.created_date || '') < QUIET_MINUTES * 60 * 1000;
    if (stillLive) return Response.json({ ok: true });

    const token = randomHex(24);
    await base44.asServiceRole.entities.PasswordReset.create({
      company_id: profile.company_id || '',
      profile_id: profile.id,
      email,
      token,
      expires_at: new Date(Date.now() + MINUTES * 60 * 1000).toISOString()
    });

    const branch = profile.branch_id
      ? await base44.asServiceRole.entities.Branch.get(profile.branch_id).catch(() => null)
      : null;
    const link = portalLink(body.origin, `/password-reset?token=${token}`);
    await sendEmail(base44, {
      to: profile.user_email,
      subject: 'Set a new password for kworkmate',
      html: brandedEmail({
        heading: 'Set a new password',
        brandColor: (branch && branch.brand_color) || undefined,
        lines: [
          `Hi ${profile.full_name || 'there'},`,
          'Press the button below to choose a new password for your sign-in.',
          `The link works for ${MINUTES} minutes and can only be used once. If you did not ask for it, you can ignore this email.`
        ],
        ctaText: 'Choose a new password',
        ctaUrl: link
      })
    });

    return Response.json({ ok: true });
  } catch (error) {
    // Even a failure on this side answers the same way, so nothing leaks through the form.
    return Response.json({ ok: true });
  }
}