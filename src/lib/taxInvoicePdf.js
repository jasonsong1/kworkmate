import { jsPDF } from 'jspdf';

// KWorkMate 플랫폼 공급자 공식 정보
export const KWORKMATE_ISSUER = {
  name: 'KWorkMate',
  abn: '96 804 937 141',
  rawAbn: '96804937141',
  email: 'billing@kworkmate.com',
  bsb: '062-006',
  accountNumber: '1128 9380',
  accountName: 'KWorkMate',
  gstRate: 0.1 // 호주 GST 10%
};

// 플랜별 기본 월 구독료 (AUD, GST 별도)
export const PLAN_PRICING = {
  payg: { name: 'PAYG', monthlyExGst: 49 },
  starter: { name: 'Starter', monthlyExGst: 99 },
  growth: { name: 'Growth', monthlyExGst: 199 },
  enterprise: { name: 'Enterprise', monthlyExGst: 399 }
};

// Xero 직접 연동 유료 애드온 월 요금 (AUD, GST 별도)
export const XERO_ADDON_PRICE = 20;

/**
 * 인보이스 번호 자동 채번
 * @param {string} companyId - 회사 ID 또는 코드
 * @param {string} dateIso - 기준 날짜 (YYYY-MM-DD)
 */
export function generateInvoiceNumber(companyId = '', dateIso = '') {
  const d = dateIso ? new Date(dateIso) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const code = (companyId || 'KWM').slice(-4).toUpperCase();
  return `INV-${year}${month}-${code}`;
}

/**
 * 호주 세법(ATO) 규격에 맞는 Tax Invoice PDF를 생성합니다.
 * @param {Object} params
 * @param {Object} params.company - 고객사 정보
 * @param {string} params.invoiceNumber - 인보이스 번호
 * @param {string} params.issueDate - 발행일 (YYYY-MM-DD)
 * @param {string} params.dueDate - 입금 기한 (YYYY-MM-DD)
 * @param {string} params.planKey - 플랜 키 (payg, starter, growth, enterprise)
 * @param {number} params.customAmount - 관리자가 직접 지정한 금액 (선택 사항)
 * @param {string} params.notes - 추가 메모
 * @returns {jsPDF} doc
 */
export function buildTaxInvoicePdf({
  company,
  invoiceNumber,
  issueDate,
  dueDate,
  planKey = 'starter',
  customAmount = null,
  notes = ''
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const d = issueDate ? new Date(issueDate) : new Date();
  const issueDateFormatted = d.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const dueD = dueDate ? new Date(dueDate) : new Date(d.getTime() + 14 * 24 * 60 * 60 * 1000);
  const dueDateFormatted = dueD.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const billingPeriod = d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  // 금액 계산 (Subtotal, GST 10%, Total AUD)
  const planInfo = PLAN_PRICING[planKey] || PLAN_PRICING.starter;
  const subtotal = Number(customAmount) > 0 ? Number(customAmount) : planInfo.monthlyExGst;
  const gst = Math.round(subtotal * KWORKMATE_ISSUER.gstRate * 100) / 100;
  const total = Math.round((subtotal + gst) * 100) / 100;

  const invNum = invoiceNumber || generateInvoiceNumber(company?.id, issueDate);

  // 디자인 팔레트 (신뢰감 있는 인디고 & 다크 슬레이트)
  const primaryColor = [67, 56, 202]; // #4338ca
  const darkTextColor = [30, 41, 59]; // slate-800
  const mutedTextColor = [100, 116, 139]; // slate-500
  const lightBgColor = [248, 250, 252]; // slate-50
  const borderColor = [226, 232, 240]; // slate-200

  // 1. 헤더 영역 (TAX INVOICE 타이틀 & 브랜드)
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, 210, 8, 'F'); // 상단 포인트 바

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...primaryColor);
  doc.text('TAX INVOICE', 15, 28);

  doc.setFontSize(10);
  doc.setTextColor(...mutedTextColor);
  doc.setFont('helvetica', 'normal');
  doc.text('Original Document · Australian GST Compliant', 15, 34);

  // 우측: 인보이스 기본 메타데이터
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...darkTextColor);
  doc.text('Invoice Number:', 130, 24);
  doc.setFont('helvetica', 'normal');
  doc.text(invNum, 165, 24);

  doc.setFont('helvetica', 'bold');
  doc.text('Date of Issue:', 130, 30);
  doc.setFont('helvetica', 'normal');
  doc.text(issueDateFormatted, 165, 30);

  doc.setFont('helvetica', 'bold');
  doc.text('Due Date:', 130, 36);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text(dueDateFormatted, 165, 36);

  // 구분선
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.5);
  doc.line(15, 42, 195, 42);

  // 2. 발행자(From) & 수신자(To) 영역
  const colY = 50;

  // 좌측: From (KWorkMate)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...mutedTextColor);
  doc.text('ISSUED BY', 15, colY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...darkTextColor);
  doc.text(KWORKMATE_ISSUER.name, 15, colY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...darkTextColor);
  doc.text(`ABN: ${KWORKMATE_ISSUER.abn}`, 15, colY + 12);
  doc.text(`Email: ${KWORKMATE_ISSUER.email}`, 15, colY + 17);
  doc.text('Australia', 15, colY + 22);

  // 우측: Bill To (고객사)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...mutedTextColor);
  doc.text('BILLED TO', 115, colY);

  const clientName = company?.name || 'Valued Client';
  const clientAbn = company?.abn ? `ABN: ${company.abn}` : 'ABN: Not Specified';
  const clientEmail = company?.invoice_email || company?.contact_email || 'accounts@client.com';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...darkTextColor);
  doc.text(clientName, 115, colY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(clientAbn, 115, colY + 12);
  doc.text(`Email: ${clientEmail}`, 115, colY + 17);
  if (company?.contact_phone) {
    doc.text(`Phone: ${company.contact_phone}`, 115, colY + 22);
  }

  // 3. 품목 테이블 헤더
  const tableY = 82;
  doc.setFillColor(...lightBgColor);
  doc.roundedRect(15, tableY, 180, 8, 1, 1, 'F');
  doc.setDrawColor(...borderColor);
  doc.roundedRect(15, tableY, 180, 8, 1, 1, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...darkTextColor);
  doc.text('Item & Description', 20, tableY + 5.5);
  doc.text('Qty', 125, tableY + 5.5);
  doc.text('Rate (AUD)', 145, tableY + 5.5);
  doc.text('Amount (AUD)', 170, tableY + 5.5);

  // 4. 품목 행
  const rowY = tableY + 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`KWorkMate Subscription - ${planInfo.name} Plan`, 20, rowY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...mutedTextColor);
  doc.text(`Billing period: ${billingPeriod} · Workforce management, automated roster & timesheet`, 20, rowY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...darkTextColor);
  doc.text('1', 128, rowY);
  doc.text(`$${subtotal.toFixed(2)}`, 147, rowY);
  doc.text(`$${subtotal.toFixed(2)}`, 172, rowY);

  doc.setDrawColor(...borderColor);
  doc.line(15, rowY + 11, 195, rowY + 11);

  // 5. 합계 계산 영역
  const summaryY = rowY + 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...mutedTextColor);
  doc.text('Subtotal (excl. GST):', 130, summaryY);
  doc.setTextColor(...darkTextColor);
  doc.text(`$${subtotal.toFixed(2)}`, 175, summaryY);

  doc.setTextColor(...mutedTextColor);
  doc.text('GST (10%):', 130, summaryY + 6);
  doc.setTextColor(...darkTextColor);
  doc.text(`$${gst.toFixed(2)}`, 175, summaryY + 6);

  // 총 합계 하이라이트 박스
  doc.setFillColor(...lightBgColor);
  doc.roundedRect(125, summaryY + 11, 70, 11, 1.5, 1.5, 'F');
  doc.setDrawColor(...primaryColor);
  doc.setLineWidth(0.6);
  doc.roundedRect(125, summaryY + 11, 70, 11, 1.5, 1.5, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...primaryColor);
  doc.text('Total (incl. GST):', 130, summaryY + 18);
  doc.setFontSize(11.5);
  doc.text(`$${total.toFixed(2)} AUD`, 164, summaryY + 18);

  // 6. 결제 계좌(Bank Details) 정보 카드
  const bankY = summaryY + 34;
  doc.setFillColor(...lightBgColor);
  doc.roundedRect(15, bankY, 180, 36, 2, 2, 'F');
  doc.setDrawColor(...borderColor);
  doc.setLineWidth(0.5);
  doc.roundedRect(15, bankY, 180, 36, 2, 2, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...primaryColor);
  doc.text('Payment Information (EFT / Direct Deposit)', 20, bankY + 7);

  doc.setFontSize(9);
  doc.setTextColor(...darkTextColor);
  doc.setFont('helvetica', 'bold');
  doc.text('Bank:', 20, bankY + 15);
  doc.setFont('helvetica', 'normal');
  doc.text('Commonwealth Bank of Australia (CBA)', 50, bankY + 15);

  doc.setFont('helvetica', 'bold');
  doc.text('BSB:', 20, bankY + 21);
  doc.setFont('helvetica', 'normal');
  doc.text(KWORKMATE_ISSUER.bsb, 50, bankY + 21);

  doc.setFont('helvetica', 'bold');
  doc.text('Account Number:', 20, bankY + 27);
  doc.setFont('helvetica', 'normal');
  doc.text(KWORKMATE_ISSUER.accountNumber, 50, bankY + 27);

  doc.setFont('helvetica', 'bold');
  doc.text('Account Name:', 100, bankY + 21);
  doc.setFont('helvetica', 'normal');
  doc.text(KWORKMATE_ISSUER.accountName, 130, bankY + 21);

  doc.setFont('helvetica', 'bold');
  doc.text('Payment Reference:', 100, bankY + 27);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text(invNum, 137, bankY + 27);

  // 7. 하단 푸터 및 감사 문구
  const footerY = 270;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...darkTextColor);
  doc.text('Thank you for choosing KWorkMate as your workforce management partner!', 105, footerY, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...mutedTextColor);
  doc.text('Questions? Contact us at billing@kworkmate.com or visit https://kworkmate.com', 105, footerY + 5, { align: 'center' });
  doc.text('KWorkMate Pty Ltd · ABN 96 804 937 141 · Australia', 105, footerY + 9, { align: 'center' });

  return doc;
}

/**
 * 인보이스 PDF를 브라우저에서 다운로드합니다.
 */
export function downloadTaxInvoicePdf(options) {
  const doc = buildTaxInvoicePdf(options);
  const fileName = `${options.invoiceNumber || 'Tax_Invoice'}_${(options.company?.name || 'Client').replace(/\s+/g, '_')}.pdf`;
  doc.save(fileName);
}

/**
 * 인보이스 PDF를 Blob URL로 생성하여 미리보기를 지원합니다.
 */
export function getTaxInvoicePdfBlobUrl(options) {
  const doc = buildTaxInvoicePdf(options);
  return doc.output('bloburl');
}
