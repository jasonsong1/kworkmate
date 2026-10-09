// Mirrors base44/shared/emailStages.ts (the renderer used for real emails) so the designer
// preview looks the same. Keep the stage copy and rendering rules in sync.
export const EMAIL_STAGES = [
  {
    key: 'applied',
    hasCta: false,
    vars: ['name', 'job_title', 'store', 'company'],
    subject: 'We received your application — {{job_title}}',
    heading: 'Your application has been received',
    body: [
      'Hi {{name}},',
      'Thanks for applying for **{{job_title}}** at {{store}}.',
      'Our hiring team reviews every application with AI-assisted screening. If your profile matches, you will receive an interview invitation with a booking link.'
    ].join('\n'),
    cta: ''
  },
  {
    key: 'mini',
    hasCta: true,
    vars: ['name', 'job_title', 'store', 'company'],
    subject: 'Voice interview invitation — {{job_title}}',
    heading: 'Your voice interview is ready',
    body: [
      'Hi {{name}},',
      'You have been shortlisted for **{{job_title}}** at {{store}}.',
      'Please answer a few short questions using your voice. It takes about five minutes and you can do it from your phone.',
      'Open the link below when you are somewhere quiet.'
    ].join('\n'),
    cta: 'Start voice interview'
  },
  {
    key: 'video',
    hasCta: true,
    vars: ['name', 'job_title', 'store', 'company'],
    subject: 'Video interview invitation — {{job_title}}',
    heading: 'Your video interview is ready',
    body: [
      'Hi {{name}},',
      'You have been shortlisted for **{{job_title}}** at {{store}}.',
      'Please record short video answers to a few questions. It takes about five minutes and you can do it from your phone or computer.',
      'Open the link below when you are somewhere quiet.'
    ].join('\n'),
    cta: 'Start video interview'
  },
  {
    key: 'invite',
    hasCta: true,
    vars: ['name', 'job_title', 'store', 'company', 'slot_info'],
    subject: 'You are invited to interview — {{job_title}}',
    heading: 'Congratulations — you are invited to interview',
    body: [
      'Hi {{name}},',
      'We reviewed your application for **{{job_title}}** at {{store}} and would love to meet you.',
      '{{slot_info}}',
      'The interview is a short face-to-face conversation at the store.'
    ].join('\n'),
    cta: 'Choose your interview time'
  },
  {
    key: 'booked',
    hasCta: true,
    vars: ['name', 'job_title', 'store', 'company', 'date', 'time', 'duration', 'location'],
    subject: 'Interview confirmed — {{date}} at {{time}}',
    heading: 'Your interview is confirmed',
    body: [
      'Hi {{name}},',
      'Your interview for **{{job_title}}** is confirmed for **{{date}} at {{time}}** ({{duration}} minutes).',
      'Location: {{location}}',
      'A calendar invitation is attached. Please arrive five minutes early.'
    ].join('\n'),
    cta: 'Change my interview time'
  },
  {
    key: 'rescheduled',
    hasCta: true,
    vars: ['name', 'job_title', 'store', 'company', 'date', 'time', 'duration', 'location'],
    subject: 'Interview time changed: {{job_title}}',
    heading: 'Your interview time was changed',
    body: [
      'Hi {{name}},',
      'Your interview for **{{job_title}}** at {{store}} has been moved to **{{date}} at {{time}}** ({{duration}} minutes).',
      'Location: {{location}}',
      'A calendar invitation is attached. If you need a different time, use the button below.'
    ].join('\n'),
    cta: 'Change my interview time'
  },
  {
    key: 'cancelled',
    hasCta: true,
    vars: ['name', 'job_title', 'store', 'company', 'date', 'time'],
    subject: 'Your interview has been cancelled — {{job_title}}',
    heading: 'Your interview was cancelled',
    body: [
      'Hi {{name}},',
      'We are sorry, but your interview for **{{job_title}}** at {{store}} on **{{date}} at {{time}}** has been cancelled.',
      'Please choose a new time using the link below and we will confirm it straight away.'
    ].join('\n'),
    cta: 'Choose a new time'
  },
  {
    key: 'hired',
    hasCta: true,
    vars: ['name', 'job_title', 'store', 'company', 'employee_number'],
    subject: 'Congratulations — you are hired at {{store}}',
    heading: 'Congratulations, you got the job!',
    body: [
      'Hi {{name}},',
      'Welcome to the team at **{{store}}**. Your employee number is **{{employee_number}}**.',
      'Before your first shift, please complete your tax file number declaration, superannuation choice and bank details. It takes about 3 minutes on your phone.'
    ].join('\n'),
    cta: 'Complete onboarding'
  },
  {
    key: 'rejected',
    hasCta: false,
    vars: ['name', 'job_title', 'store', 'company'],
    subject: 'Your application for {{job_title}}',
    heading: 'Thank you for your application',
    body: [
      'Hi {{name}},',
      'Thank you for your interest in **{{job_title}}** at {{store}}.',
      'After careful consideration we have decided to move forward with other candidates for this position. We keep your details on file and would be glad to consider you for future openings.'
    ].join('\n'),
    cta: ''
  }
];

const SAMPLE_VARS = {
  name: 'Alex Kim',
  job_title: 'Barista',
  store: 'Botany Store',
  company: 'Your company',
  slot_info: 'Please pick the time that suits you best — 3 slots are currently open.',
  date: '2026-10-12',
  time: '10:00',
  duration: '20',
  location: '123 Example Street, Botany NSW 2019',
  employee_number: 'BOT-001'
};

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fillText = (template, vars) =>
  String(template)
    .replace(PLACEHOLDER, (_, key) => String(vars[key] ?? ''))
    .replace(/\s+/g, ' ')
    .trim();

const fillHtml = (template, vars) => esc(template).replace(PLACEHOLDER, (_, key) => esc(vars[key]));

function fillLine(line, vars) {
  let missing = false;
  const html = esc(line).replace(PLACEHOLDER, (_, key) => {
    if (key in vars && String(vars[key] ?? '').trim() === '') missing = true;
    return esc(vars[key]);
  });
  return missing ? '' : html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

// Mirrors brandedEmail() in base44/shared/email.ts: the kworkmate lockup, a white card with the
// store badge, a bulletproof button and the tip box. Keep the two in step.
function layout({ heading, lines, ctaText, color, footer, logoUrl, badge, tip }) {
  const body = lines
    .map((l) => `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.65;color:#475569">${l}</p>`)
    .join('');
  const cta = ctaText
    ? `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 24px 0"><tr><td align="center"><a href="#" style="display:inline-block;background-color:${color};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:10px;letter-spacing:-0.2px">${ctaText}</a></td></tr></table>`
    : '';
  const mark = logoUrl
    ? `<img src="${logoUrl}" alt="kworkmate" style="display:block;max-height:34px;max-width:170px" />`
    : `<div style="background-color:${color};color:#ffffff;font-weight:800;font-size:17px;width:34px;height:34px;line-height:34px;text-align:center;border-radius:8px">K</div>`;
  const badgeHtml = badge
    ? `<div style="display:inline-block;background-color:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:12px;font-weight:600;padding:4px 10px;border-radius:9999px;margin:0 0 16px 0">📍 ${badge}</div>`
    : '';
  const tipHtml = tip
    ? `<div style="background-color:#fffbeb;border-left:3px solid #f59e0b;padding:12px 14px;border-radius:4px"><p style="margin:0;font-size:12px;color:#92400e;line-height:1.55">${tip}</p></div>`
    : '';
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f6f8;padding:36px 12px 40px 12px">
  <tr>
    <td align="center">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="560" style="width:100%;max-width:560px;margin:0 auto">
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
                <td style="padding:36px 32px 32px 32px">
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
          <td align="center" style="padding:22px 10px 0 10px;font-size:12px;line-height:1.6;color:#94a3b8">${footer}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

export function getStage(key) {
  return EMAIL_STAGES.find((s) => s.key === key);
}

export function mergeTemplates(saved) {
  const result = {};
  EMAIL_STAGES.forEach((stage) => {
    const custom = (saved && saved[stage.key]) || {};
    result[stage.key] = {
      subject: custom.subject || stage.subject,
      heading: custom.heading || stage.heading,
      body: custom.body || stage.body,
      cta: custom.cta || stage.cta
    };
  });
  return result;
}

// Only what differs from the defaults is stored, so untouched stages keep following the defaults.
export function diffTemplates(templates) {
  const result = {};
  EMAIL_STAGES.forEach((stage) => {
    const values = templates[stage.key] || {};
    const changed = {};
    ['subject', 'heading', 'body', 'cta'].forEach((field) => {
      const value = String(values[field] || '').trim();
      if (value && value !== stage[field]) changed[field] = value;
    });
    if (Object.keys(changed).length > 0) result[stage.key] = changed;
  });
  return result;
}

export function renderEmailPreview({ stageKey, values, branding, companyName }) {
  const stage = getStage(stageKey);
  const vars = { ...SAMPLE_VARS, company: companyName || SAMPLE_VARS.company };
  const name = companyName || '';
  const lines = String(values.body || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => fillLine(line, vars))
    .filter(Boolean);

  return {
    subject: fillText(values.subject || '', vars),
    html: layout({
      heading: fillHtml(values.heading || '', vars),
      badge: vars.store ? esc(vars.store) : '',
      lines,
      ctaText: stage.hasCta ? fillHtml(values.cta || stage.cta, vars) : '',
      color: branding.color || '#4338ca',
      footer: branding.footer ? esc(branding.footer) : `${esc(name)} · K-Workmate`,
      logoUrl: branding.logo ? esc(branding.logo) : ''
    })
  };
}