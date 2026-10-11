import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
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

    // The employer's own questions: what was asked of this employee has to be answered before
    // the form can be filed.
    const asked = ((company && company.onboarding_questions) || []).filter(
      (question) => question && question.visible !== false && String(question.label || '').trim()
    );
    const incomingAnswers = Array.isArray(body.extra_answers) ? body.extra_answers.slice(0, 30) : [];
    const onboardingAnswers = asked.map((question) => {
      const given = incomingAnswers.find((entry) => entry && entry.id === question.id) || {};
      const answer = String(given.answer || '').trim();
      const followUp = {};
      if (question.type === 'yes_no' && question.follow_up && question.follow_up.when === answer) {
        (question.follow_up.fields || []).forEach((field) => {
          followUp[field] = String((given.follow_up || {})[field] || '').trim();
        });
      }
      return { id: question.id, label: question.label, type: question.type || 'text', answer, follow_up: followUp };
    });

    for (const entry of onboardingAnswers) {
      const question = asked.find((item) => item.id === entry.id) || {};
      if (question.required !== false && !entry.answer) {
        return Response.json({ error: `Please answer: ${question.label}` }, { status: 400 });
      }
      if (question.type === 'yes_no' && question.follow_up && question.follow_up.when === entry.answer) {
        const missing = (question.follow_up.fields || []).find((field) => !entry.follow_up[field]);
        if (missing) return Response.json({ error: `Please complete: ${missing}` }, { status: 400 });
      }
    }

    const incomingDocs = Array.isArray(body.docs) ? body.docs.slice(0, 10) : [];
    const existingDocs = Array.isArray(employee.docs) ? employee.docs : [];
    const keep = existingDocs.filter((d) => d && (d.type === 'resume' || d.uploaded_by === 'self'));

    const signedAt = new Date().toISOString();

    // The payroll fields the record itself keeps. What the form answered is what gets written, so
    // a wage run reads the record rather than going looking through the answers list.
    const payroll: any = {};
    if (tfn.pending) payroll.tfn_pending = true;
    if (tfn.number) payroll.tfn_number = String(tfn.number).trim();
    if (tfn.residency_status) payroll.residency_status = tfn.residency_status;
    if (typeof tfn.tax_free_threshold === 'boolean') payroll.tax_free_threshold = tfn.tax_free_threshold;
    if (typeof tfn.hecs_help === 'boolean') payroll.hecs_help = tfn.hecs_help;
    if (superChoice.choice) payroll.super_choice = superChoice.choice;
    if (superChoice.member_number) payroll.super_member_number = superChoice.member_number;
    if (superChoice.choice === 'custom_fund') {
      if (superChoice.fund_name) payroll.super_fund_name = superChoice.fund_name;
      if (superChoice.usi) payroll.super_usi = superChoice.usi;
      if (superChoice.fund_abn) payroll.super_fund_abn = superChoice.fund_abn;
    }
    if (bank.bsb) payroll.bank_bsb = String(bank.bsb).trim();
    if (bank.account_number) payroll.bank_account_number = String(bank.account_number).trim();
    if (bank.account_name) payroll.bank_account_name = String(bank.account_name).trim();

    // The employer's own questions carry the very same details, so an answer given on the link is
    // written onto the record too. The standard form's questions are named, and each answer fills
    // the field it stands for.
    const answerTo = (id: string) => {
      const row = onboardingAnswers.find((entry) => entry.id === id);
      return row ? String(row.answer || '').trim() : '';
    };
    const followUpTo = (id: string, field: string) => {
      const row = onboardingAnswers.find((entry) => entry.id === id);
      return row && row.follow_up ? String(row.follow_up[field] || '').trim() : '';
    };
    const STANDARD_TEXT: Record<string, string> = {
      default_address: 'address',
      default_phone: 'phone',
      default_dob: 'date_of_birth',
      default_emergency_name: 'emergency_contact_name',
      default_emergency_phone: 'emergency_contact_phone',
      default_bank_bsb: 'bank_bsb',
      default_bank_account: 'bank_account_number',
      default_bank_holder: 'bank_account_name'
    };
    Object.entries(STANDARD_TEXT).forEach(([questionId, field]) => {
      const value = answerTo(questionId);
      if (value) payroll[field] = value;
    });
    const tfnHeld = answerTo('default_tfn_held');
    if (tfnHeld === 'yes') {
      const number = followUpTo('default_tfn_held', 'Tax File Number');
      if (number) payroll.tfn_number = number;
    }
    if (tfnHeld === 'no') payroll.tfn_pending = true;
    const taxFree = answerTo('default_tax_free');
    if (taxFree) payroll.tax_free_threshold = taxFree === 'yes';
    const hecs = answerTo('default_hecs');
    if (hecs) payroll.hecs_help = hecs === 'yes';
    const useDefaultFund = answerTo('default_super_default');
    if (useDefaultFund === 'yes') {
      payroll.super_choice = 'default_fund';
      payroll.super_fund_name = (company && company.default_super_fund_name) || '';
      payroll.super_usi = (company && company.default_super_fund_usi) || '';
      payroll.super_fund_abn = (company && company.default_super_fund_abn) || '';
    }
    if (useDefaultFund === 'no') {
      payroll.super_choice = 'custom_fund';
      const fund = followUpTo('default_super_default', 'Fund name');
      const usi = followUpTo('default_super_default', 'USI');
      const member = followUpTo('default_super_default', 'Member number');
      if (fund) payroll.super_fund_name = fund;
      if (usi) payroll.super_usi = usi;
      if (member) payroll.super_member_number = member;
    }

    await base44.asServiceRole.entities.EmployeeProfile.update(employee.id, {
      ...payroll,
      signature_file_uri: body.signature_file_uri,
      signed_at: signedAt,
      onboarding_status: 'completed',
      onboarding_submitted_at: signedAt,
      onboarding_answers: onboardingAnswers,
      docs: [...keep, ...incomingDocs]
    });

    const emailSent = await sendEmail(base44, {
      to: employee.user_email,
      subject: 'Your onboarding documents are complete',
      html: brandedEmail({
        heading: 'Onboarding complete, thank you',
        badge: branch ? branch.name : '',
        brandColor: (branch && branch.brand_color) || '#4338ca',
        lines: [
          `Hi ${employee.full_name},`,
          `We have received and filed your onboarding documents for <b>${branch ? branch.name : 'your store'}</b>.`,
          'Your signed documents are stored securely on your employee profile. Nothing else is needed from you.'
        ],
        footer: `${company ? company.name : ''} · kworkmate`
      })
    });

    // Onboarding is done, so the employee can now be handed their account access.
    const account = await sendAccountAccessEmail(base44, employee.user_email);

    return Response.json({
      ok: true,
      email_sent: emailSent,
      invited: account.invited,
      password_email_sent: account.password_email_sent
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}