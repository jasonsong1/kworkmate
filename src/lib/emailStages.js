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
    hasCta: false,
    vars: ['name', 'job_title', 'store', 'company', 'date', 'time', 'duration', 'location'],
    subject: 'Interview confirmed — {{date}} at {{time}}',
    heading: 'Your interview is confirmed',
    body: [
      'Hi {{name}},',
      'Your interview for **{{job_title}}** is confirmed for **{{date}} at {{time}}** ({{duration}} minutes).',
      'Location: {{location}}',
      'A calendar invitation is attached. If you need to change your time, reply to this email.'
    ].join('\n'),
    cta: ''
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

function layout({ heading, lines, ctaText, color, footer, logoUrl }) {
  const body = lines
    .map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155">${l}</p>`)
    .join('');
  const cta = ctaText
    ? `<a href="#" style="display:inline-block;margin-top:10px;padding:12px 22px;border-radius:10px;background:${color};color:#ffffff;font-weight:600;text-decoration:none;font-size:15px">${ctaText}</a>`
    : '';
  const logo = logoUrl
    ? `<img src="${logoUrl}" alt="" style="display:block;max-height:52px;max-width:200px;margin:0 0 18px" />`
    : '';
  return `<div style="font-family:Inter,Arial,sans-serif;background:#f1f5f9;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e2e8f0">
    ${logo}
    <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;line-height:1.3">${heading}</h1>
    ${body}
    ${cta}
    <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0" />
    <p style="margin:0;font-size:12px;color:#94a3b8">${footer}</p>
  </div>
</div>`;
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
      lines,
      ctaText: stage.hasCta ? fillHtml(values.cta || stage.cta, vars) : '',
      color: branding.color || '#4338ca',
      footer: branding.footer ? esc(branding.footer) : `${esc(name)} · K-Workmate`,
      logoUrl: branding.logo ? esc(branding.logo) : ''
    })
  };
}