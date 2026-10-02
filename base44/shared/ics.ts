import { icsLocalStamp, addMinutesToTime } from './util.ts';

function fold(line) {
  return line.replace(/(\r\n|\n|\r)/g, ' ').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export function buildInterviewIcs({ uid, title, description, location, date, startTime, durationMin, organizerEmail, attendeeEmail, attendeeName }) {
  const end = addMinutesToTime(date, startTime, durationMin || 20);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//K-Workmate//Interview//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsLocalStamp(new Date().toISOString().slice(0, 10), '00:00')}`,
    `DTSTART:${icsLocalStamp(date, startTime)}`,
    `DTEND:${icsLocalStamp(end.date, end.time)}`,
    `SUMMARY:${fold(title)}`,
    `DESCRIPTION:${fold(description)}`,
    `LOCATION:${fold(location)}`,
    organizerEmail ? `ORGANIZER;CN=K-Workmate:mailto:${organizerEmail}` : '',
    attendeeEmail ? `ATTENDEE;CN=${fold(attendeeName || 'Applicant')};ROLE=REQ-PARTICIPANT:mailto:${attendeeEmail}` : '',
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return lines.filter(Boolean).join('\r\n');
}