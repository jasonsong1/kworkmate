import { jsPDF } from 'jspdf';

function newDoc(title, subtitle) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(67, 56, 202);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(subtitle, 14, 19);

  doc.setTextColor(15, 23, 42);
  return doc;
}

function rows(doc, items, startY) {
  let y = startY;
  const pageHeight = doc.internal.pageSize.getHeight();
  items.forEach(([label, value]) => {
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 24;
    }
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(String(label), 14, y);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    const text = doc.splitTextToSize(String(value || '—'), 120);
    doc.text(text, 76, y);
    y += Math.max(8, text.length * 5.5);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, y - 4, pageWidthLine(doc), y - 4);
  });
  return y;
}

function pageWidthLine(doc) {
  return doc.internal.pageSize.getWidth() - 14;
}

function signatureBlock(doc, dataUrl, y, label) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const top = Math.min(y + 8, pageHeight - 60);
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(label || 'Employee signature', 14, top);
  if (dataUrl) {
    try {
      doc.addImage(dataUrl, 'PNG', 14, top + 3, 70, 26);
    } catch (error) {
      doc.text('(signature image attached separately)', 14, top + 8);
    }
  }
  doc.setDrawColor(148, 163, 184);
  doc.line(14, top + 32, 110, top + 32);
  doc.setFontSize(9);
  doc.text(`Signed ${new Date().toLocaleString()}`, 14, top + 38);
}

export function buildTfnPdf({ employee, company, form, signatureDataUrl }) {
  const doc = newDoc('Tax File Number Declaration', 'ATO NAT 3092 — K-Workmate generated record');
  let y = rows(
    doc,
    [
      ['Employer', `${company ? company.name : ''}${company && company.abn ? ` (ABN ${company.abn})` : ''}`],
      ['Employee', employee.full_name],
      ['Employee number', employee.employee_number],
      ['Tax file number', form.tfn_pending ? 'Not yet issued — declaration pending' : form.tfn_number],
      ['Residency status', form.residency_status],
      ['Tax-free threshold', form.tax_free_threshold ? 'Claimed' : 'Not claimed'],
      ['HECS / HELP debt', form.hecs_help ? 'Yes' : 'No'],
      ['Declaration', 'I declare that the information I have provided is true and correct.']
    ],
    40
  );
  signatureBlock(doc, signatureDataUrl, y);
  return doc.output('blob');
}

export function buildSuperPdf({ employee, company, form, signatureDataUrl }) {
  const doc = newDoc('Superannuation Standard Choice Form', 'ATO NAT 13087 — K-Workmate generated record');
  const isDefault = form.super_choice === 'default_fund';
  let y = rows(
    doc,
    [
      ['Employer', company ? company.name : ''],
      ['Employee', employee.full_name],
      ['Employee number', employee.employee_number],
      ['Choice', isDefault ? `Employer default fund — ${form.super_fund_name || ''}` : 'My own nominated fund'],
      ['Fund name', form.super_fund_name],
      ['USI', form.super_usi],
      ['Fund ABN', form.super_fund_abn],
      ['Member number', form.super_member_number || '—'],
      ['Declaration', 'I authorise my employer to pay my superannuation contributions as stated above.']
    ],
    40
  );
  signatureBlock(doc, signatureDataUrl, y);
  return doc.output('blob');
}

export function buildContractPdf({ employee, branch, company, form, signatureDataUrl }) {
  const doc = newDoc('Employment Contract Summary', 'K-Workmate generated record');
  const items = [
    ['Employer', company ? company.name : ''],
    ['Store', branch ? branch.name : ''],
    ['Employee', employee.full_name],
    ['Employee number', employee.employee_number],
    ['Position', employee.position || 'Team member'],
    ['Employment type', employee.employment_type || 'casual'],
    ['Commencement', employee.start_date || ''],
    ['Declaration', 'I accept the terms of employment and the information I have provided is accurate.']
  ];
  const y = rows(doc, items, 40);
  signatureBlock(doc, signatureDataUrl, y);
  return doc.output('blob');
}