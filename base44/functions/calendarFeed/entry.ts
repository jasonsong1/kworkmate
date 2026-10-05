import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { timezoneForBranch } from '../../shared/kiosk.ts';

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function stamp() {
  return `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

function localStamp(dateIso: string, time: string) {
  return `${dateIso.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

function escapeText(value: any) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function chunk(line: string) {
  if (line.length <= 74) return line;
  const parts = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  return parts.join('\r\n');
}

// The roster as a calendar feed. A phone subscribes once to the private address and every
// later change to a shift or an approved leave is picked up on the next refresh.
export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const token = String(url.searchParams.get('token') || '');
    if (!token) return new Response('Missing token', { status: 400 });

    const subscription = rowsOf(
      await base44.asServiceRole.entities.CalendarSubscription.filter({ token, active: true }, { limit: 1 })
    )[0];
    if (!subscription) return new Response('Not found', { status: 404 });

    const email = subscription.user_email;
    const profile = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: email }, { limit: 1 })
    )[0];
    const branch = profile && profile.branch_id
      ? await base44.asServiceRole.entities.Branch.get(profile.branch_id).catch(() => null)
      : null;
    const timezone = timezoneForBranch(branch);

    const today = new Date().toISOString().slice(0, 10);
    const from = addDays(today, -56);
    const to = addDays(today, 180);

    const [shifts, leave] = await Promise.all([
      rowsOf(
        await base44.asServiceRole.entities.Shift.filter(
          { employee_email: email, status: 'published', date: { $gte: from, $lte: to } },
          { sort: 'date', limit: 500 }
        )
      ),
      rowsOf(
        await base44.asServiceRole.entities.LeaveRequest.filter(
          { employee_email: email, status: 'approved', end_date: { $gte: from } },
          { sort: 'start_date', limit: 100 }
        )
      )
    ]);

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//K-Workmate//Roster//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:K-Workmate roster',
      'X-PUBLISHED-TTL:PT30M'
    ];

    shifts
      .filter((shift: any) => shift.date >= from && shift.date <= to)
      .forEach((shift: any) => {
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:shift-${shift.id}@kworkmate`);
        lines.push(`DTSTAMP:${stamp()}`);
        lines.push(`DTSTART;TZID=${timezone}:${localStamp(shift.date, shift.start_time)}`);
        lines.push(`DTEND;TZID=${timezone}:${localStamp(shift.date, shift.end_time)}`);
        lines.push(chunk(`SUMMARY:${escapeText(`Shift · ${shift.position || 'Work'}`)}`));
        if (branch && branch.name) lines.push(chunk(`LOCATION:${escapeText(branch.name)}`));
        lines.push(chunk(`DESCRIPTION:${escapeText(`${shift.start_time}–${shift.end_time}${shift.notes ? ` · ${shift.notes}` : ''}`)}`));
        lines.push('END:VEVENT');
      });

    leave
      .filter((row: any) => row.start_date <= to)
      .forEach((row: any) => {
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:leave-${row.id}@kworkmate`);
        lines.push(`DTSTAMP:${stamp()}`);
        lines.push(`DTSTART;VALUE=DATE:${String(row.start_date).replace(/-/g, '')}`);
        lines.push(`DTEND;VALUE=DATE:${String(addDays(row.end_date || row.start_date, 1)).replace(/-/g, '')}`);
        lines.push(chunk(`SUMMARY:${escapeText(`${row.leave_type_name || 'Leave'} · On leave`)}`));
        lines.push('TRANSP:OPAQUE');
        lines.push('END:VEVENT');
      });

    lines.push('END:VCALENDAR');

    return new Response(lines.join('\r\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Cache-Control': 'no-cache, max-age=0'
      }
    });
  } catch (error: any) {
    return new Response(`Calendar feed failed: ${error.message}`, { status: 500 });
  }
}