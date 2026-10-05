import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const STATES: Record<string, string> = {
  NSW: 'New South Wales',
  VIC: 'Victoria',
  QLD: 'Queensland',
  SA: 'South Australia',
  WA: 'Western Australia',
  TAS: 'Tasmania',
  NT: 'Northern Territory',
  ACT: 'Australian Capital Territory'
};

// The government site that publishes each state's own schedule.
const OFFICIAL_SOURCE: Record<string, string> = {
  NSW: 'nsw.gov.au',
  VIC: 'business.vic.gov.au',
  QLD: 'qld.gov.au',
  SA: 'safework.sa.gov.au',
  WA: 'wa.gov.au',
  TAS: 'worksafe.tas.gov.au',
  NT: 'nt.gov.au',
  ACT: 'worksafe.act.gov.au'
};

// The dates come back as drafts, so nothing changes a payslip until the employer applies them.
const SCOPES = ['statewide', 'regional', 'one_off'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function clean(value: any, max: number) {
  return String(value === null || value === undefined ? '' : value).trim().slice(0, max);
}

function buildPrompt(state: string, year: number, region: string) {
  return [
    `Read the public holiday schedule the ${STATES[state]} state government publishes for ${year}.`,
    '',
    'Report ONLY the dates a fixed rule cannot work out — for example a show day, a grand final Friday, or a one-off holiday gazetted for that year.',
    "Do NOT report New Year's Day, Australia Day, Good Friday, Easter Saturday, Easter Sunday, Easter Monday, Anzac Day, King's Birthday, Labour Day, May Day, Christmas Day, Boxing Day or Proclamation Day: those are already handled.",
    region ? `The company has branches at: ${region}. Include holidays that apply there.` : '',
    '',
    'Rules:',
    `- Official sources only: ${OFFICIAL_SOURCE[state]} and the Fair Work Ombudsman public holiday list.`,
    `- Give the exact published date as YYYY-MM-DD for ${year}. Never guess a date and never reuse one from another year.`,
    '- scope: "statewide" when the whole state is off, "regional" when only part of the state observes it, "one_off" for a single-year gazetted holiday.',
    '- region: the area the date covers (Brisbane, Greater Melbourne, northern Tasmania). Leave it empty for a statewide date.',
    '- source_url: the exact page you read. source_label: the site name.',
    '- name_ko: a short Korean name for the holiday.',
    `- If no official date is published for ${year}, put the item in "unavailable" with a reason, and leave it out of "holidays". An empty holidays list is the correct answer when the state publishes no extra dates for ${year}.`
  ]
    .filter((line) => line !== '')
    .join('\n');
}

// The dates a state publishes itself change every year, so they are read from the official
// schedule: this function only reads it, and the app saves what comes back for review.
export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const state = clean(body.state, 3).toUpperCase();
    const year = Math.floor(Number(body.year));
    const region = clean(body.region, 80);

    if (!STATES[state]) return Response.json({ error: 'Unknown state' }, { status: 400 });
    if (!Number.isFinite(year) || year < 2020 || year > 2100) {
      return Response.json({ error: 'Year must be between 2020 and 2100' }, { status: 400 });
    }

    const companyId = clean(body.company_id, 40) || clean(me.company_id, 40);
    const company = companyId ? await base44.entities.Company.get(companyId).catch(() => null) : null;
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });

    const isMember = Array.isArray(company.member_emails) && company.member_emails.includes(me.email);
    if (me.role !== 'admin' && me.app_role !== 'company_admin' && !isMember) {
      return Response.json({ error: 'You cannot import holiday dates for this company' }, { status: 403 });
    }

    const answer: any = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: buildPrompt(state, year, region),
      add_context_from_internet: true,
      response_json_schema: {
        type: 'object',
        properties: {
          holidays: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string' },
                name: { type: 'string' },
                name_ko: { type: 'string' },
                region: { type: 'string' },
                scope: { type: 'string', enum: SCOPES },
                source_label: { type: 'string' },
                source_url: { type: 'string' },
                note: { type: 'string' }
              },
              required: ['date', 'name', 'scope']
            }
          },
          unavailable: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                region: { type: 'string' },
                reason: { type: 'string' },
                source_url: { type: 'string' }
              },
              required: ['reason']
            }
          }
        },
        required: ['holidays']
      }
    });

    const found = Array.isArray(answer && answer.holidays) ? answer.holidays.slice(0, 25) : [];
    const holidays = found
      .map((raw: any) => ({
        date: clean(raw.date, 10),
        name: clean(raw.name, 80),
        name_ko: clean(raw.name_ko, 80),
        region: clean(raw.region, 60),
        scope: SCOPES.includes(clean(raw.scope, 20)) ? clean(raw.scope, 20) : 'regional',
        source_label: clean(raw.source_label, 80),
        source_url: clean(raw.source_url, 300),
        note: clean(raw.note, 200)
      }))
      .filter((item: any) => ISO_DATE.test(item.date) && Number(item.date.slice(0, 4)) === year && item.name);

    const unavailable = Array.isArray(answer && answer.unavailable) ? answer.unavailable.slice(0, 10) : [];

    return Response.json({
      ok: true,
      state,
      year,
      holidays,
      dropped: found.length - holidays.length,
      unavailable: unavailable.map((item: any) => ({
        region: clean(item.region, 60),
        reason: clean(item.reason, 200),
        source_url: clean(item.source_url, 300)
      }))
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}