import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { isDigits } from '../../shared/util.ts';
import { sendEmail, brandedEmail } from '../../shared/email.ts';
import { sendAccountAccessEmail } from '../../shared/account.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const token = body.token;
    if (!token) return Response.json({ error: 'token is required' }, { status: 400 });

    const found = await base44.asServiceRole.entities.EmployeeProfile.filter({ onboarding_token: token });
    if (found.length === 0) return Response.json({ ok: false, invalid: true });
    const employee = found[0];

    if (employee.onboarding_status === 'completed') {
      return Response.json({ ok: false, completed: true });
    }

    const tfn = body.tfn || {};
    const bank = body.bank || {};
    const superChoice = body.super || {};

    if (!tfn.pending && !isDigits(tfn.number, 9)) {
      return Response.json({ error: 'Tax file number must be exactly 9 digits' }, { status: 400 });
    }
    if (!isDigits(bank.bsb, 6)) {
      return Response.json({ error: 'BSB must be exactly 6 digits' }, { status: 400 });
    }
    if (!/^\d{5,10}$/.test(String(bank.account_number || '').trim())) {
      return Response.json({ error: 'Account number must be 5 to 10 digits' }, { status: 400 });
    }
    if (!bank.account_name || !String(bank.account_name).trim()) {
      return Response.json({ error: 'Account holder name is required' }, { status: 400 });
    }
    if (superChoice.choice === 'custom_fund' && !String(superChoice.usi || '').trim()) {
      return Response.json({ error: 'A USI is required for your own super fund' }, { status: 400 });
    }
    if (!superChoice.choice) {
      return Response.json({ error: 'Please choose a superannuation option' }, { status: 400 });
    }
    if (!body.signature_file_uri) {
      return Response.json({ error: 'A signature is required' }, { status: 400 });
    }
    if (body.declaration_accepted !== true) {
      return Response.json({ error: 'You must accept the declaration' }, { status: 400 });
    }

    const branch = employee.branch_id
      ? await base44.asServiceRole.entities.Branch.get(employee.branch_id).catch(() => null)
      : null;
    const company = employee.company_id
      ? await base44.asServiceRole.entities.Company.get(employee.company_id).catch(() => null)
      : null;

    const incomingDocs = Array.isArray(body.docs) ? body.docs.slice(0, 10) : [];
    const existingDocs = Array.isArray(employee.docs) ? employee.docs : [];
    const keep = existingDocs.filter((d) => d && d.type === 'resume');

    const signedAt = new Date().toISOString();

    await base44.asServiceRole.entities.EmployeeProfile.update(employee.id, {
      tfn_number: tfn.pending ? '' : String(tfn.number).trim(),
      tfn_pending: tfn.pending === true,
      residency_status: tfn.residency_status || '',
      tax_free_threshold: tfn.tax_free_threshold !== false,
      hecs_help: tfn.hecs_help === true,
      super_choice: superChoice.choice,
      super_fund_name: superChoice.choice === 'default_fund' ? (company ? company.default_super_fund_name : '') : (superChoice.fund_name || ''),
      super_usi: superChoice.choice === 'default_fund' ? (company ? company.default_super_fund_usi : '') : (superChoice.usi || ''),
      super_member_number: superChoice.member_number || '',
      super_fund_abn: superChoice.choice === 'default_fund' ? (company ? company.default_super_fund_abn : '') : (superChoice.fund_abn || ''),
      bank_bsb: String(bank.bsb).trim(),
      bank_account_number: String(bank.account_number).trim(),
      bank_account_name: String(bank.account_name).trim(),
      signature_file_uri: body.signature_file_uri,
      signed_at: signedAt,
      onboarding_status: 'completed',
      onboarding_submitted_at: signedAt,
      docs: [...keep, ...incomingDocs]
    });

    const emailSent = await sendEmail(base44, {
      to: employee.user_email,
      subject: 'Your onboarding documents are complete',
      html: brandedEmail({
        heading: 'Onboarding complete — thank you',
        brandColor: (branch && branch.brand_color) || '#4338ca',
        lines: [
          `Hi ${employee.full_name},`,
          `We have received and filed your TFN declaration, superannuation choice and bank details for <b>${branch ? branch.name : 'your store'}</b>.`,
          'Your signed documents are stored securely on your employee profile. Nothing else is needed from you.'
        ],
        footer: `${company ? company.name : ''} · K-Workmate`
      })
    });

    // Onboarding is done, so the employee can now be handed their account access.
    const account = await sendAccountAccessEmail(base44, employee.user_email);

    return Response.json({
      ok: true,
      email_sent: emailSent,
      invited: account.invited,
      password_email_sent: account.passwordEmail
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}