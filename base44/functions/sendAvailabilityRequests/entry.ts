import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendEmail, brandedEmail, portalLink, cleanOrigin } from '../../shared/email.ts';

const STATE_TIMEZONES = {
  NSW: 'Australia/Sydney',
  ACT: 'Australia/Sydney',
  VIC: 'Australia/Melbourne',
  QLD: 'Australia/Brisbane',
  SA: 'Australia/Adelaide',
  WA: 'Australia/Perth',
  TAS: 'Australia/Hobart',
  NT: 'Australia/Darwin'
};

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function timezoneFor(branch) {
  return STATE_TIMEZONES[String(branch.state || '').trim().toUpperCase()] || 'Australia/Sydney';
}

// Weekday (0 = Sunday), hour and calendar date as the branch's own clock shows them right now.
function localClock(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = (type) => (parts.find((part) => part.type === type) || {}).value;
  return {
    day: WEEKDAYS[get('weekday')],
    hour: Number(get('hour')),
    date: `${get('year')}-${get('month')}-${get('day')}`
  };
}

function rowsOf(result) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    // Runs from the hourly schedule and takes no input. A signed-in caller must be the app admin.
    const me = await base44.auth.me().catch(() => null);
    if (me && me.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const branches = rowsOf(
      await base44.asServiceRole.entities.Branch.filter({ roster_email_enabled: true }, { limit: 500 })
    );

    const due = [];
    for (const branch of branches) {
      const clock = localClock(timezoneFor(branch));
      const day = Number(branch.roster_email_day ?? 0);
      const hour = Number(branch.roster_email_hour ?? 20);
      if (clock.day !== day || clock.hour !== hour) continue;
      // Once per branch per day, even if the schedule runs more than once in that hour.
      if (branch.roster_email_last_sent === clock.date) continue;
      if (!cleanOrigin(branch.roster_email_origin)) continue;

      await base44.asServiceRole.entities.Branch.update(branch.id, { roster_email_last_sent: clock.date });

      const company = branch.company_id
        ? await base44.asServiceRole.entities.Company.get(branch.company_id).catch(() => null)
        : null;
      const staff = rowsOf(
        await base44.asServiceRole.entities.EmployeeProfile.filter(
          { branch_id: branch.id, status: 'active' },
          { limit: 500 }
        )
      );
      const link = portalLink(branch.roster_email_origin, '/');

      let sent = 0;
      for (const person of staff) {
        if (!person.user_email) continue;
        const ok = await sendEmail(base44, {
          to: person.user_email,
          subject: `Update your availability — ${branch.name}`,
          html: brandedEmail({
            heading: `Hi ${person.full_name || 'there'}, please update your availability`,
            brandColor: branch.brand_color || (company && company.brand_color),
            lines: [
              `Let us know which days and hours you can work next week at <b>${branch.name}</b>.`,
              'It only takes a minute — your manager uses this to build the roster.'
            ],
            ctaText: 'Update my availability',
            ctaUrl: link,
            footer: `${company ? company.name : branch.name} · K-Workmate`
          })
        });
        if (ok) sent += 1;
      }
      due.push({ branch: branch.name, staff: staff.length, sent });
    }

    return Response.json({ ok: true, checked: branches.length, due });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}