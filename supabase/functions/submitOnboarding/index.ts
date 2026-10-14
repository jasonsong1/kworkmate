// ==============================================================================
// KWorkMate 온보딩 제출 처리 엣지 펑션 (submitOnboarding)
// 기능: 직원 온보딩 결과 저장, TFN AES-256 암호화, 서류 보관함 등록, 확인 메일 발송
// ==============================================================================

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { sendEmail, brandedEmail } from '../_shared/email.ts';
import { sendAccountAccessEmail } from '../_shared/account.ts';
import { encryptSensitiveText } from '../_shared/crypto.ts';

async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const body = await req.json().catch(() => ({}));
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

    // 고용주가 등록한 추가 설문 문항 응답 수집
    const asked = ((company && company.onboarding_questions) || []).filter(
      (question: any) => question && question.visible !== false && String(question.label || '').trim()
    );
    const incomingAnswers = Array.isArray(body.extra_answers) ? body.extra_answers.slice(0, 30) : [];
    const onboardingAnswers = asked.map((question: any) => {
      const given = incomingAnswers.find((entry: any) => entry && entry.id === question.id) || {};
      const answer = String(given.answer || '').trim();
      const followUp: Record<string, string> = {};
      if (question.type === 'yes_no' && question.follow_up && question.follow_up.when === answer) {
        (question.follow_up.fields || []).forEach((field: string) => {
          followUp[field] = String((given.follow_up || {})[field] || '').trim();
        });
      }
      return { id: question.id, label: question.label, type: question.type || 'text', answer, follow_up: followUp };
    });

    for (const entry of onboardingAnswers) {
      const question = asked.find((item: any) => item.id === entry.id) || {};
      if (question.required !== false && !entry.answer) {
        return Response.json({ error: `Please answer: ${question.label}` }, { status: 400 });
      }
      if (question.type === 'yes_no' && question.follow_up && question.follow_up.when === entry.answer) {
        const missing = (question.follow_up.fields || []).find((field: string) => !entry.follow_up[field]);
        if (missing) return Response.json({ error: `Please complete: ${missing}` }, { status: 400 });
      }
    }

    const incomingDocs = Array.isArray(body.docs) ? body.docs.slice(0, 15) : [];
    const existingDocs = Array.isArray(employee.docs) ? employee.docs : [];
    const keep = existingDocs.filter((d: any) => d && (d.type === 'resume' || d.uploaded_by === 'self'));

    const signedAt = new Date().toISOString();

    // 급여/세무/연금 필드 조합
    const payroll: Record<string, any> = {};
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

    const answerTo = (id: string) => {
      const row = onboardingAnswers.find((entry: any) => entry.id === id);
      return row ? String(row.answer || '').trim() : '';
    };
    const followUpTo = (id: string, field: string) => {
      const row = onboardingAnswers.find((entry: any) => entry.id === id);
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

    // [보안 암호화]: 호주 개인정보보호법 및 규칙 8번에 따라 TFN 번호를 AES-256으로 암호화하여 DB에 보관
    if (payroll.tfn_number) {
      payroll.tfn_number = await encryptSensitiveText(payroll.tfn_number);
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

    // ==============================================================================
    // [요구사항 3, 9] tfn_declarations 및 tfn_documents 감사 테이블 기록 (멱등성 보장)
    // ==============================================================================
    try {
      const tfnDoc = incomingDocs.find(
        (d: any) => d && (d.type === 'tfn_declaration' || String(d.name || '').includes('NAT 3092') || String(d.name || '').includes('TFN'))
      );
      const storageUri = tfnDoc ? (tfnDoc.file_uri || tfnDoc.url || '') : '';

      // 기존에 제출된 선언서가 있는지 확인 (중복 생성 방지 / 멱등성)
      const existingDecls = await base44.asServiceRole.entities.TfnDeclaration.filter({
        employee_id: employee.id,
        form_version: 'NAT 3092-06.2019'
      }).catch(() => []);

      let declarationId = existingDecls[0]?.id;

      if (!declarationId) {
        const newDecl = await base44.asServiceRole.entities.TfnDeclaration.create({
          company_id: employee.company_id,
          employee_id: employee.id,
          form_version: 'NAT 3092-06.2019',
          status: 'submitted',
          submitted_at: signedAt,
          declaration_data: {
            answers: tfn,
            basis_of_payment: tfn.basis_of_payment || 'casual',
            residency_status: tfn.residency_status || 'australian_resident',
            tax_free_threshold: tfn.tax_free_threshold ?? true,
            has_loan_debt: tfn.hecs_help ?? false,
            exemption_type: tfn.exemption_type || null
          }
        });
        declarationId = newDecl?.id;
      }

      if (declarationId && storageUri) {
        await base44.asServiceRole.entities.TfnDocument.create({
          declaration_id: declarationId,
          storage_path: storageUri,
          document_version: 1,
          pdf_uploaded_at: signedAt
        }).catch((docErr: any) => {
          console.warn('[submitOnboarding] TfnDocument create warning:', docErr?.message);
        });
      }
    } catch (auditErr: any) {
      // 메인 온보딩 완료를 방해하지 않도록 안전하게 예외 격리
      console.warn('[submitOnboarding] Tfn audit logging skipped:', auditErr?.message);
    }

    const emailSent = await sendEmail(base44, {
      to: employee.user_email,
      subject: 'Your onboarding documents are complete',
      html: brandedEmail({
        heading: 'Onboarding complete, thank you',
        badge: branch ? branch.name : '',
        brandColor: (branch && branch.brand_color) || '#4338ca',
        lines: [
          `Hi ${employee.full_name},`,
          `We have received and filed your onboarding documents (including official ATO NAT 3092 & NAT 13080 forms) for <b>${branch ? branch.name : 'your store'}</b>.`,
          'Your signed documents are stored securely on your employee profile. Nothing else is needed from you.'
        ],
        footer: `${company ? company.name : ''} · kworkmate`
      })
    });

    // 온보딩 완료 후 계정 접근 권한 안내 이메일 발송
    const account = await sendAccountAccessEmail(base44, employee.user_email);

    return Response.json({
      ok: true,
      email_sent: emailSent,
      invited: account.invited,
      password_email_sent: account.password_email_sent
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
