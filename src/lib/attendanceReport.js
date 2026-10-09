import { jsPDF } from 'jspdf';
import { dayTypeFor, localDate, stateLabel, timeZoneFor } from '@/lib/holidays';

const APPROVAL_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
const DAY_TYPE_LABEL = { weekday: 'Weekday', saturday: 'Saturday', sunday: 'Sunday' };

// The day a punch earns its rate for is the local day at the branch.
function dayPart(value, state) {
  return localDate(value, state);
}

// The punch time on the branch's own clock, the same way the screen above shows it.
function timePart(value, state) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    timeZone: timeZoneFor(state),
    hour: '2-digit',
    minute: '2-digit'
  });
}

function hours(minutes) {
  if (!minutes) return '';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function cell(value) {
  const text = String(value == null ? '' : value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function multiplierFor(key, multipliers) {
  const value = multipliers ? multipliers[key] : undefined;
  return value === undefined || value === '' ? 1 : Number(value) || 1;
}

// The date worked gives the weekday and the branch state gives the public holidays,
// so every punch carries the penalty rate it actually earned.
function payRow(row, options) {
  const date = dayPart(row.clock_in_at, options.state);
  const type = dayTypeFor(date, options.state, options.regional);
  const multiplier = multiplierFor(type.key, options.multipliers);
  const rate = options.rates[String(row.employee_email || '').toLowerCase()];
  const pay = row.minutes && rate ? (row.minutes / 60) * Number(rate) * multiplier : null;
  return {
    date,
    dayType:
      type.key === 'public_holiday'
        ? `Public holiday · ${(type.holiday && type.holiday.en) || ''}`
        : DAY_TYPE_LABEL[type.key] || DAY_TYPE_LABEL.weekday,
    rateText: `×${multiplier}`,
    pay
  };
}

export function reportRows(entries, options = {}) {
  const opts = { state: '', multipliers: null, rates: {}, regional: {}, ...options };
  return entries.map((row) => {
    const pay = payRow(row, opts);
    return [
      pay.date,
      row.employee_name || '',
      row.employee_number || '',
      timePart(row.clock_in_at, opts.state),
      timePart(row.clock_out_at, opts.state),
      hours(row.minutes),
      pay.dayType,
      pay.rateText,
      pay.pay === null ? '' : `$${pay.pay.toFixed(2)}`,
      row.source === 'manual' ? 'Manual' : 'App / QR',
      row.geo_verified ? 'Verified' : '—',
      APPROVAL_LABEL[row.approval_status || 'approved'],
      // What the manager wrote when the punch was turned down. Only a refused punch carries one.
      (row.approval_status || '') === 'rejected' ? row.rejection_reason || '' : ''
    ];
  });
}

// Rejected punches are not paid, so they stay out of the estimate.
export function estimatedPay(entries, options = {}) {
  const opts = { state: '', multipliers: null, rates: {}, regional: {}, ...options };
  return entries.reduce((total, row) => {
    if ((row.approval_status || 'approved') === 'rejected') return total;
    const pay = payRow(row, opts).pay;
    return pay === null ? total : total + pay;
  }, 0);
}

export const REPORT_HEADERS = [
  'Date',
  'Employee',
  'Employee no.',
  'Clock in',
  'Clock out',
  'Worked',
  'Day type',
  'Rate',
  'Est. pay',
  'Source',
  'GPS',
  'Approval',
  'Reason'
];

export function downloadCsv(entries, filename, options = {}) {
  const lines = [REPORT_HEADERS.join(',')];
  reportRows(entries, options).forEach((row) => lines.push(row.map(cell).join(',')));
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

export function downloadPdf(entries, { branchName, from, to, filename, ...options }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const marginX = 32;
  const widths = [50, 92, 48, 44, 44, 44, 96, 32, 50, 46, 34, 42, 132];

  const header = () => {
    const state = stateLabel(options.state, 'en');
    doc.setFontSize(14);
    doc.text('Attendance report', marginX, 40);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`${branchName || ''} · ${from} → ${to}${state ? ` · ${state}` : ''}`, marginX, 56);
    doc.setTextColor(0);
    let x = marginX;
    doc.setFontSize(8);
    REPORT_HEADERS.forEach((label, i) => {
      doc.text(label, x, 78);
      x += widths[i];
    });
    return 90;
  };

  let y = header();
  doc.setFontSize(8);
  reportRows(entries, options).forEach((row) => {
    if (y > 560) {
      doc.addPage();
      y = header();
      doc.setFontSize(8);
    }
    let x = marginX;
    row.forEach((value, i) => {
      doc.text(String(value).slice(0, 30), x, y);
      x += widths[i];
    });
    y += 14;
  });

  doc.save(filename);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}