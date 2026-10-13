// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/requestEmployeePasswordReset/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { lower, randomHex } from '../_shared/kwAuth.ts';
import { sendEmail, brandedEmail, portalLink } from '../_shared/email.ts';

const MINUTES = 60;
// Asking twice inside this window does not send a second mail.
const QUIET_MINUTES = 2;

// Anyone may ask for a new password from the sign-in page. The answer is always the same, so the
// form can never be used to find out whether an address is registered.
async function handler(req) {
  try {
    const base44 = createBase44Like();
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
        badge: branch ? branch.name : '',
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

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
