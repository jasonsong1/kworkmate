// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/sendAvailabilityRequests/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { sendEmail, brandedEmail, portalLink, cleanOrigin } from '../_shared/email.ts';
import { availabilityMail, employeeLanguage } from '../_shared/employeeMail.ts';

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

async function handler(req) {
  try {
    const base44 = createBase44Like();
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
      // The crew signs in with their own ID, then lands on their own space to enter their hours.
      const link = portalLink(branch.roster_email_origin, '/login?returnTo=/my-space');

      let sent = 0;
      for (const person of staff) {
        if (!person.user_email) continue;
        // Written in the language set on this person's staff profile.
        const copy = availabilityMail(employeeLanguage(person.language), {
          name: person.full_name || 'there',
          branchName: branch.name
        });
        const ok = await sendEmail(base44, {
          to: person.user_email,
          subject: copy.subject,
          html: brandedEmail({
            heading: copy.heading,
            badge: branch.name,
            brandColor: branch.brand_color || (company && company.brand_color),
            lines: copy.lines,
            tip: copy.tip,
            ctaText: copy.cta,
            ctaUrl: link,
            footer: `${company ? company.name : branch.name} · kworkmate`
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

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
