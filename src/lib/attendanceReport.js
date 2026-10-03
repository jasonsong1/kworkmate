import { jsPDF } from 'jspdf';

const APPROVAL_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

function dayPart(value) {
  return value ? String(value).slice(0, 10) : '';
}

function timePart(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function hours(minutes) {
  if (!minutes) return '';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function cell(value) {
  const text = String(value == null ? '' : value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function reportRows(entries) {
  return entries.map((row) => [
    dayPart(row.clock_in_at),
    row.employee_name || '',
    row.employee_number || '',
    timePart(row.clock_in_at),
    timePart(row.clock_out_at),
    hours(row.minutes),
    row.source === 'manual' ? 'Manual' : 'App / QR',
    row.geo_verified ? 'Verified' : '—',
    APPROVAL_LABEL[row.approval_status || 'approved']
  ]);
}

export const REPORT_HEADERS = [
  'Date',
  'Employee',
  'Employee no.',
  'Clock in',
  'Clock out',
  'Worked',
  'Source',
  'GPS',
  'Approval'
];

export function downloadCsv(entries, filename) {
  const lines = [REPORT_HEADERS.join(',')];
  reportRows(entries).forEach((row) => lines.push(row.map(cell).join(',')));
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

export function downloadPdf(entries, { branchName, from, to, filename }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const marginX = 32;
  const widths = [70, 130, 80, 60, 60, 60, 65, 55, 70];

  const header = () => {
    doc.setFontSize(14);
    doc.text('Attendance report', marginX, 40);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`${branchName || ''} · ${from} → ${to}`, marginX, 56);
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
  reportRows(entries).forEach((row) => {
    if (y > 560) {
      doc.addPage();
      y = header();
      doc.setFontSize(8);
    }
    let x = marginX;
    row.forEach((value, i) => {
      doc.text(String(value).slice(0, 26), x, y);
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