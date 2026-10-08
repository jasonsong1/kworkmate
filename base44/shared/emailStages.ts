import { brandedEmail } from './email.ts';

// Applicant-facing emails the employer can restyle. The same stage list and default copy
// is mirrored in src/lib/emailStages.js for the designer preview — keep the two in sync.
export const EMAIL_STAGES = [
  {
    key: 'applied',
    hasCta: false,
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

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fillText(template, vars) {
  return String(template)
    .replace(PLACEHOLDER, (_, key) => String(vars[key] ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function fillHtml(template, vars) {
  return esc(template).replace(PLACEHOLDER, (_, key) => esc(vars[key]));
}

// A body line is dropped when it uses a known variable that has no value (e.g. no location).
function fillLine(line, vars) {
  let missing = false;
  const html = esc(line).replace(PLACEHOLDER, (_, key) => {
    if (key in vars && String(vars[key] ?? '').trim() === '') missing = true;
    return esc(vars[key]);
  });
  return missing ? '' : html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

export function renderStageEmail(company, stageKey, vars, options = {}) {
  const stage = EMAIL_STAGES.find((s) => s.key === stageKey);
  const saved = (company && company.email_templates && company.email_templates[stageKey]) || {};
  const pick = (field) =>
    typeof saved[field] === 'string' && saved[field].trim() ? saved[field] : stage[field];
  const companyName = company && company.name ? company.name : '';
  const allVars = { company: companyName, ...vars };

  const lines = pick('body')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => fillLine(line, allVars))
    .filter(Boolean);

  // Callers add a line or two of their own, e.g. the documents that would not fit on the email.
  (options.extraLines || []).map((line) => fillLine(line, allVars)).filter(Boolean).forEach((line) => lines.push(line));

  const html = brandedEmail({
    heading: fillHtml(pick('heading'), allVars),
    lines,
    ctaText: stage.hasCta && options.ctaUrl ? fillHtml(pick('cta'), allVars) : '',
    ctaUrl: options.ctaUrl,
    brandColor: (company && company.email_brand_color) || options.brandColor,
    footer: company && company.email_footer ? esc(company.email_footer) : `${esc(companyName)} · K-Workmate`,
    logoUrl: company && company.logo_url ? esc(company.logo_url) : ''
  });

  return { subject: fillText(pick('subject'), allVars), html };
}