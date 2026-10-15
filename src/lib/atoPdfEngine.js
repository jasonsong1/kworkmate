import { NAT3092_OFFICIAL_PDF_BASE64 } from '@/assets/templates/nat3092_pdf_base64';
// ==============================================================================
// KWorkMate ATO 공식 서류 자동 완성 엔진 (호주 국세청 공식 양식 규격 준수)
// 1) NAT 3092: Tax File Number Declaration (TFN 신고서)
// 2) NAT 13080: Superannuation Standard Choice Form (표준 연금 선택서)
// 기술: pdf-lib (벡터 드로잉, 텍스트 배치, 체크박스 마킹, Canvas 전자서명 임베딩)
// ==============================================================================

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// 호주 국세청(ATO) 공식 테마 컬러 팔레트
const COLOR_ATO_GREEN = rgb(0.04, 0.38, 0.27);      // ATO 딥 그린 (#0a6145)
const COLOR_SECTION_BG = rgb(0.92, 0.96, 0.94);     // 연한 섹션 배경
const COLOR_TEXT_BLACK = rgb(0.1, 0.1, 0.1);        // 본문 텍스트
const COLOR_TEXT_MUTED = rgb(0.4, 0.45, 0.5);       // 설명문 텍스트
const COLOR_BORDER_GRAY = rgb(0.7, 0.75, 0.8);      // 박스 테두리선
const COLOR_BOX_FILL = rgb(0.97, 0.98, 0.99);       // 입력 칸 배경
const COLOR_HIGHLIGHT = rgb(0.85, 0.15, 0.15);      // 경고/체크 마크

/**
 * 날짜 문자열을 호주 표준 형식(DD / MM / YYYY)으로 변환
 */
function formatAtoDate(dateStr) {
  if (!dateStr) return { day: '', month: '', year: '' };
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      const parts = String(dateStr).split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return { day: parts[2].padStart(2, '0'), month: parts[1].padStart(2, '0'), year: parts[0] };
        }
        return { day: parts[0].padStart(2, '0'), month: parts[1].padStart(2, '0'), year: parts[2] };
      }
      return { day: '', month: '', year: '' };
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear());
    return { day, month, year };
  } catch {
    return { day: '', month: '', year: '' };
  }
}

/**
 * 텍스트를 개별 문자 박스(Digit Box) 배열로 그리는 헬퍼 함수
 */
function drawDigitBoxes(page, { x, y, width = 16, height = 20, count = 9, value = '', font, fontSize = 11 }) {
  const chars = String(value || '').replace(/\s/g, '').split('');
  for (let i = 0; i < count; i++) {
    const boxX = x + i * (width + 3);
    // 박스 배경 및 테두리
    page.drawRectangle({
      x: boxX,
      y: y,
      width: width,
      height: height,
      color: COLOR_BOX_FILL,
      borderColor: COLOR_BORDER_GRAY,
      borderWidth: 1
    });

    const char = chars[i] || '';
    if (char) {
      const textWidth = font.widthOfTextAtSize(char, fontSize);
      page.drawText(char, {
        x: boxX + (width - textWidth) / 2,
        y: y + 5,
        size: fontSize,
        font: font,
        color: COLOR_TEXT_BLACK
      });
    }
  }
}

/**
 * 체크박스 및 선택 표시(X 마크)를 그리는 헬퍼 함수
 */
function drawCheckbox(page, { x, y, size = 12, checked = false, font }) {
  page.drawRectangle({
    x,
    y,
    width: size,
    height: size,
    color: rgb(1, 1, 1),
    borderColor: COLOR_BORDER_GRAY,
    borderWidth: 1.2
  });

  if (checked) {
    const mark = 'X';
    const markSize = 10;
    const textWidth = font.widthOfTextAtSize(mark, markSize);
    page.drawText(mark, {
      x: x + (size - textWidth) / 2,
      y: y + 2,
      size: markSize,
      font: font,
      color: COLOR_HIGHLIGHT
    });
  }
}

/**
 * ==============================================================================
 * 1. NAT 3092: Tax File Number Declaration (ATO 공식 규격 TFN 신고서 PDF 생성)
 * ==============================================================================
 */
/**
 * ==============================================================================
 * 1. NAT 3092: Tax File Number Declaration (ATO 공식 원본 서식 100% 매핑 엔진)
 * 호주 국세청(ATO) 공식 NAT 3092-06.2019 [DE-6078] 원본 템플릿 배경 위에
 * 직원의 TFN, 영문 성명, 호주 주소, 체크박스(X), 전자서명을 정확한 좌표에 인쇄합니다.
 * ==============================================================================
 */
/**
 * ==============================================================================
 * 1. NAT 3092: Tax File Number Declaration (ATO 공식 원본 벡터 서식 100% 매핑 엔진)
 * 호주 국세청(ATO) 공식 NAT 3092-06.2019 [DE-6078] 무손실 벡터 원본 서식 위에
 * 직원의 TFN, 영문 성명, 호주 주소, 체크박스(X), 자필 전자서명을 정확한 좌표에 인쇄합니다.
 * ==============================================================================
 */
export async function generateAtoNat3092Pdf({ employee = {}, company = {}, form = {}, signatureDataUrl = '' }) {
  // 공식 무손실 벡터 템플릿 PDF 로드
  const templateBytes = await fetch(NAT3092_OFFICIAL_PDF_BASE64).then((res) => res.arrayBuffer());
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPage(0);
  
  // 국세청 공문서 특유의 타자기/활자체 (CourierBold) 및 볼드 고딕 (HelveticaBold)
  const fontCourier = await pdfDoc.embedFont(StandardFonts.CourierBold);
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // 네모 칸 글자 인쇄 헬퍼 (호주 관공서 서식 규격)
  const drawBoxesText = (text, startX, y, pitch, maxLen = 30, fontSize = 9.5) => {
    const chars = String(text || '').toUpperCase().split('');
    for (let i = 0; i < Math.min(chars.length, maxLen); i++) {
      const char = chars[i];
      if (char === ' ') continue;
      page.drawText(char, {
        x: startX + i * pitch + 1,
        y: y + 1,
        size: fontSize,
        font: fontCourier,
        color: rgb(0.05, 0.05, 0.15) // 선명한 잉크 다크블루/블랙
      });
    }
  };

  // 체크박스 'X' 마킹 헬퍼 (볼펜 수기 마킹)
  const markX = (x, y) => {
    page.drawText('X', {
      x,
      y,
      size: 11,
      font: fontHelvetica,
      color: rgb(0.05, 0.1, 0.45)
    });
  };

  // ==================== [SECTION A: 직원 작성란 (Payee)] ====================

  // 1. TFN 9자리 (Question 1)
  const tfnRaw = String(form.tfn_number || employee.tfn_number || '').replace(/\D/g, '');
  if (form.tfn_exemption === 'applied' || form.tfn_pending || employee.tfn_pending) {
    // 예외 사유 1: TFN 신청 후 28일 이내 유예 (X: 377, Y: 721)
    markX(377, 721);
  } else if (form.tfn_exemption === 'under18') {
    // 예외 사유 2: 18세 미만 비과세 (X: 377, Y: 698)
    markX(377, 698);
  } else if (form.tfn_exemption === 'pensioner') {
    // 예외 사유 3: 연금/수당 수급자 (X: 377, Y: 675)
    markX(377, 675);
  } else if (tfnRaw && tfnRaw.length === 9) {
    // 정규 9자리 네모 칸 (Y: 726으로 박스 내부 정확 안착)
    drawBoxesText(tfnRaw, 144, 726, 14.6, 9, 10.5);
  } else {
    // 미입력 시 신청 중으로 체크
    markX(377, 721);
  }

  // 2. 성명 (Question 2: Name)
  const title = String(form.title || employee.title || 'Mr').toLowerCase();
  if (title === 'mrs') markX(200, 633);
  else if (title === 'miss') markX(238, 633);
  else if (title === 'ms') markX(275, 633);
  else markX(162, 633); // Mr (기본)

  // 성(Surname) & 이름(First given name) & 중간이름(Other given names)
  const surname = String(form.family_name || form.surname || employee.surname || '').trim() ||
    String(form.full_name || employee.full_name || '').split(/\s+/).pop();
  const givenNames = String(form.given_names || form.first_name || employee.first_name || '').trim() ||
    String(form.full_name || employee.full_name || '').split(/\s+/).slice(0, -1).join(' ') ||
    String(form.full_name || employee.full_name || '').trim();
  const otherNames = String(form.other_names || employee.other_names || '').trim();

  // Surname 칸 (Y: 606으로 라벨 아래 박스 내부 정확 정렬)
  drawBoxesText(surname, 27, 606, 11.4, 25, 9.5);
  // First given name 칸 (Y: 578)
  drawBoxesText(givenNames, 27, 578, 11.4, 25, 9.5);
  // Other given names 칸 (Y: 550)
  if (otherNames) {
    drawBoxesText(otherNames, 27, 550, 11.4, 25, 9.5);
  }

  // 3. 호주 거주 주소 (Question 3: Home address)
  const addressLine1 = String(form.address_line1 || form.address || employee.address || '123 GEORGE STREET').toUpperCase();
  const addressLine2 = String(form.address_line2 || '').toUpperCase();
  drawBoxesText(addressLine1.slice(0, 25), 27, 515, 11.4, 25, 9.5);
  if (addressLine2) {
    drawBoxesText(addressLine2.slice(0, 25), 27, 489, 11.4, 25, 9.5);
  }

  const suburb = String(form.suburb || employee.suburb || 'SYDNEY').toUpperCase();
  drawBoxesText(suburb, 27, 463, 11.4, 25, 9.5);

  const state = String(form.state || employee.state || 'NSW').toUpperCase();
  page.drawText(state, { x: 37, y: 437, size: 9.5, font: fontCourier, color: rgb(0.05, 0.05, 0.15) });

  const postcode = String(form.postcode || employee.postcode || '2000').replace(/\D/g, '');
  drawBoxesText(postcode, 96, 437, 11.4, 4, 9.5);

  // 4. 이전 성 (Question 4: Previous family name)
  const prevFamilyName = String(form.previous_family_name || '').toUpperCase();
  if (prevFamilyName) {
    drawBoxesText(prevFamilyName, 27, 391, 11.4, 25, 9.5);
  }

  // 5. 이메일 주소 (Question 5: Primary e-mail address)
  const email = String(form.user_email || employee.user_email || '').toUpperCase();
  drawBoxesText(email.slice(0, 25), 321, 726, 10.8, 25, 9);
  if (email.length > 25) {
    drawBoxesText(email.slice(25, 50), 321, 700, 10.8, 25, 9);
  }

  // 6. 생년월일 (Question 6: Date of birth)
  const dob = formatAtoDate(form.date_of_birth || employee.date_of_birth || '1998-01-01');
  drawBoxesText(dob.day || '01', 469, 673, 11.4, 2);
  drawBoxesText(dob.month || '01', 503, 673, 11.4, 2);
  drawBoxesText(dob.year || '1998', 537, 673, 11.4, 4);

  // 7. 고용 형태 (Question 7: On what basis are you paid?)
  const empType = String(form.employment_type || employee.employment_type || 'casual').toLowerCase();
  if (empType === 'full_time' || empType.includes('full')) {
    markX(356, 633); // Full-time
  } else if (empType === 'part_time' || empType.includes('part')) {
    markX(408, 633); // Part-time
  } else if (empType === 'labour_hire') {
    markX(460, 633); // Labour hire
  } else if (empType === 'super_stream') {
    markX(520, 633); // Superannuation income stream
  } else {
    markX(576, 633); // Casual employment (기본)
  }

  // 8. 세법상 거주자 구분 (Question 8: Residency)
  const resStatus = String(form.residency_status || employee.residency_status || 'resident').toLowerCase();
  if (resStatus.includes('holiday') || resStatus.includes('working') || employee.visa_type === 'working_holiday') {
    markX(576, 601); // Working holiday maker
  } else if (resStatus === 'foreign' || employee.visa_type === 'student') {
    markX(472, 601); // Foreign resident
  } else {
    markX(382, 601); // Australian resident
  }

  // 9. 비과세 기준액 신청 (Question 9: Tax-free threshold)
  const claimTaxFree = Boolean(form.tax_free_threshold ?? employee.tax_free_threshold ?? true);
  if (claimTaxFree) {
    markX(342, 535); // Yes
  } else {
    markX(378, 535); // No
  }

  // 10. 학자금 대출 여부 (Question 10: HELP/VSL/TSL debt)
  const hasHecs = Boolean(form.hecs_help ?? employee.hecs_help ?? false);
  if (hasHecs) {
    markX(342, 477); // Yes
  } else {
    markX(576, 477); // No
  }

  // 서명란 (DECLARATION by payee)
  const signDate = formatAtoDate(form.signed_at || employee.signed_at || new Date().toISOString());
  drawBoxesText(signDate.day, 470, 419, 11.4, 2);
  drawBoxesText(signDate.month, 504, 419, 11.4, 2);
  drawBoxesText(signDate.year, 538, 419, 11.4, 4);

  // 자필 전자서명 이미지 오버레이 (Signature 사각형 칸: X: 310~450, Y: 418~458)
  if (signatureDataUrl && signatureDataUrl.startsWith('data:image/')) {
    try {
      const sigBytes = await fetch(signatureDataUrl).then((res) => res.arrayBuffer());
      const sigImg = await pdfDoc.embedPng(sigBytes);
      page.drawImage(sigImg, {
        x: 315,
        y: 418,
        width: 135,
        height: 40
      });
    } catch {
      page.drawText(surname + ' ' + givenNames, {
        x: 325,
        y: 430,
        size: 13,
        font: fontHelvetica,
        color: rgb(0.05, 0.1, 0.45)
      });
    }
  } else {
    page.drawText(surname + ' ' + givenNames, {
      x: 325,
      y: 430,
      size: 13,
      font: fontHelvetica,
      color: rgb(0.05, 0.1, 0.45)
    });
  }

  // ==================== [SECTION B: 고용주란 (Payer)] ====================
  // 1. ABN (Question 1)
  const abnRaw = String((company && company.abn) || '51824753556').replace(/\D/g, '');
  drawBoxesText(abnRaw, 128, 318, 14.0, 11, 10);

  // 3. Registered business name (Question 3)
  const compName = String((company && company.name) || 'KWORKMATE PTY LTD').toUpperCase();
  drawBoxesText(compName, 27, 269, 11.4, 30, 9.5);

  // 4. Business address (Question 4)
  const compAddr = String((company && company.address) || '100 PITT STREET').toUpperCase();
  drawBoxesText(compAddr, 27, 213, 11.4, 30, 9.5);
  drawBoxesText('SYDNEY', 27, 165, 11.4, 25, 9.5);
  page.drawText('NSW', { x: 37, y: 140, size: 9.5, font: fontCourier, color: rgb(0.05, 0.05, 0.15) });
  drawBoxesText('2000', 96, 140, 11.4, 4, 9.5);

  // 5. Primary email (Question 5)
  const compEmail = String((company && company.contact_email) || 'PAYROLL@KWORKMATE.COM').toUpperCase();
  drawBoxesText(compEmail, 321, 324, 10.8, 25, 9);

  // 6. Contact person & Phone (Question 6)
  const contactPerson = String((company && company.contact_name) || 'PAYROLL MANAGER').toUpperCase();
  drawBoxesText(contactPerson, 321, 270, 10.8, 25, 9);
  const contactPhone = String((company && company.contact_phone) || '0412345678').replace(/\D/g, '');
  drawBoxesText(contactPhone, 436, 244, 10.8, 12, 9);

  // Payer Declaration Date
  drawBoxesText(signDate.day, 470, 173, 11.4, 2);
  drawBoxesText(signDate.month, 504, 173, 11.4, 2);
  drawBoxesText(signDate.year, 538, 173, 11.4, 4);

  return await pdfDoc.save();
}

/**
 * ==============================================================================
 * 2. NAT 13080: Superannuation Standard Choice Form (ATO 공식 연금 선택서 PDF 생성)
 * ==============================================================================
 */
export async function generateAtoNat13080Pdf({ employee, company, form, signatureDataUrl }) {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 36;
  const contentWidth = width - margin * 2;

  // ---------- [1] 헤더 영역 ----------
  page.drawRectangle({
    x: margin,
    y: height - 70,
    width: contentWidth,
    height: 48,
    color: COLOR_ATO_GREEN
  });

  page.drawText('Australian Taxation Office', {
    x: margin + 14,
    y: height - 42,
    size: 10,
    font: fontRegular,
    color: rgb(1, 1, 1)
  });

  page.drawText('Superannuation standard choice form', {
    x: margin + 14,
    y: height - 58,
    size: 15,
    font: fontBold,
    color: rgb(1, 1, 1)
  });

  page.drawText('NAT 13080', {
    x: width - margin - 80,
    y: height - 50,
    size: 13,
    font: fontBold,
    color: rgb(1, 1, 1)
  });

  let curY = height - 85;

  page.drawText('For use by employees to provide their choice of super fund to their employer.', {
    x: margin,
    y: curY,
    size: 8,
    font: fontRegular,
    color: COLOR_TEXT_MUTED
  });

  curY -= 20;

  // ---------- [2] Section A: Employee details ----------
  page.drawRectangle({
    x: margin,
    y: curY - 14,
    width: contentWidth,
    height: 18,
    color: COLOR_SECTION_BG,
    borderColor: COLOR_ATO_GREEN,
    borderWidth: 0.8
  });

  page.drawText('Section A: Employee to complete', {
    x: margin + 8,
    y: curY - 10,
    size: 10,
    font: fontBold,
    color: COLOR_ATO_GREEN
  });

  curY -= 32;

  // 1. Employee Name & ID
  page.drawText('1  Employee name:', { x: margin, y: curY, size: 9, font: fontBold, color: COLOR_TEXT_BLACK });
  const fullName = String(employee.full_name || form.full_name || '').trim();
  page.drawRectangle({ x: margin + 110, y: curY - 4, width: 220, height: 16, borderColor: COLOR_BORDER_GRAY, borderWidth: 1, color: COLOR_BOX_FILL });
  page.drawText(fullName, { x: margin + 115, y: curY, size: 9, font: fontBold, color: COLOR_TEXT_BLACK });

  page.drawText('Employee number:', { x: margin + 345, y: curY, size: 8.5, font: fontRegular, color: COLOR_TEXT_MUTED });
  page.drawRectangle({ x: margin + 430, y: curY - 4, width: 85, height: 16, borderColor: COLOR_BORDER_GRAY, borderWidth: 1, color: COLOR_BOX_FILL });
  page.drawText(String(employee.employee_number || '—'), { x: margin + 435, y: curY, size: 9, font: fontBold, color: COLOR_TEXT_BLACK });

  curY -= 26;

  // 2. Tax File Number (TFN)
  page.drawText('2  Tax file number (TFN):', { x: margin, y: curY, size: 9, font: fontBold, color: COLOR_TEXT_BLACK });
  const tfnRaw = form.tfn_pending ? '' : String(form.tfn_number || employee.tfn_number || '').replace(/\D/g, '');
  drawDigitBoxes(page, {
    x: margin + 150,
    y: curY - 6,
    count: 9,
    value: tfnRaw,
    font: fontBold
  });

  curY -= 32;

  // 3. Super Fund Choice
  page.drawText('3  My choice of superannuation fund is:', { x: margin, y: curY, size: 9.5, font: fontBold, color: COLOR_TEXT_BLACK });
  curY -= 18;

  const isDefault = form.super_choice === 'default_fund' || employee.super_choice === 'default_fund';
  const isCustom = !isDefault;

  // Option A: Employer default fund
  drawCheckbox(page, { x: margin + 14, y: curY - 2, checked: isDefault, font: fontBold });
  page.drawText('The employer nominated super fund (default fund)', {
    x: margin + 32,
    y: curY,
    size: 9,
    font: fontBold,
    color: COLOR_TEXT_BLACK
  });

  curY -= 20;

  // Option B: My own nominated fund (APRA / SMSF)
  drawCheckbox(page, { x: margin + 14, y: curY - 2, checked: isCustom, font: fontBold });
  page.drawText('My own chosen super fund (APRA regulated or SMSF)', {
    x: margin + 32,
    y: curY,
    size: 9,
    font: fontBold,
    color: COLOR_TEXT_BLACK
  });

  curY -= 24;

  // Nominated fund details
  page.drawRectangle({
    x: margin + 20,
    y: curY - 95,
    width: contentWidth - 20,
    height: 100,
    borderColor: COLOR_BORDER_GRAY,
    borderWidth: 1,
    color: isCustom ? rgb(1, 1, 1) : COLOR_BOX_FILL
  });

  let boxY = curY - 14;

  const fundName = isDefault ? String((company && company.default_super_fund_name) || form.super_fund_name || 'Hostplus') : String(form.super_fund_name || employee.super_fund_name || '—');
  page.drawText('Fund name:', { x: margin + 30, y: boxY, size: 8.5, font: fontRegular, color: COLOR_TEXT_MUTED });
  page.drawText(fundName.slice(0, 45), { x: margin + 100, y: boxY, size: 9, font: fontBold, color: COLOR_TEXT_BLACK });

  boxY -= 22;
  const fundAbn = isDefault ? String((company && company.default_super_fund_abn) || form.super_fund_abn || '') : String(form.super_fund_abn || employee.super_fund_abn || '');
  page.drawText('Fund ABN:', { x: margin + 30, y: boxY, size: 8.5, font: fontRegular, color: COLOR_TEXT_MUTED });
  drawDigitBoxes(page, { x: margin + 100, y: boxY - 5, count: 11, width: 14, height: 17, value: fundAbn.replace(/\D/g, ''), font: fontBold, fontSize: 9 });

  boxY -= 24;
  const fundUsi = isDefault ? String((company && company.default_super_fund_usi) || form.super_usi || '') : String(form.super_usi || employee.super_usi || '');
  page.drawText('USI:', { x: margin + 30, y: boxY, size: 8.5, font: fontRegular, color: COLOR_TEXT_MUTED });
  page.drawText(fundUsi || '—', { x: margin + 100, y: boxY, size: 9, font: fontBold, color: COLOR_TEXT_BLACK });

  const memberNo = isDefault ? '(Employer will assign)' : String(form.super_member_number || employee.super_member_number || '—');
  page.drawText('Member number:', { x: margin + 270, y: boxY, size: 8.5, font: fontRegular, color: COLOR_TEXT_MUTED });
  page.drawText(memberNo, { x: margin + 360, y: boxY, size: 9, font: fontBold, color: COLOR_TEXT_BLACK });

  curY -= 115;

  // ---------- [3] Employee Declaration & Signature 서명란 ----------
  page.drawRectangle({
    x: margin,
    y: curY - 65,
    width: contentWidth,
    height: 70,
    borderColor: COLOR_BORDER_GRAY,
    borderWidth: 1,
    color: rgb(0.99, 0.99, 0.99)
  });

  page.drawText('Declaration: I authorise my employer to pay my superannuation contributions to my chosen fund.', {
    x: margin + 8,
    y: curY - 12,
    size: 7.5,
    font: fontBold,
    color: COLOR_TEXT_BLACK
  });

  page.drawText('Signature:', {
    x: margin + 8,
    y: curY - 30,
    size: 8,
    font: fontRegular,
    color: COLOR_TEXT_MUTED
  });

  if (signatureDataUrl && signatureDataUrl.startsWith('data:image/')) {
    try {
      const sigImageBytes = await fetch(signatureDataUrl).then((res) => res.arrayBuffer());
      const sigImage = await pdfDoc.embedPng(sigImageBytes);
      page.drawImage(sigImage, {
        x: margin + 65,
        y: curY - 60,
        width: 120,
        height: 38
      });
    } catch {
      page.drawText('[Digitally Signed]', { x: margin + 65, y: curY - 45, size: 10, font: fontBold, color: COLOR_ATO_GREEN });
    }
  } else {
    page.drawText('[Digitally Signed Online]', { x: margin + 65, y: curY - 45, size: 10, font: fontBold, color: COLOR_ATO_GREEN });
  }

  const signDate = formatAtoDate(form.signed_at || employee.signed_at || new Date().toISOString());
  page.drawText('Date signed:', { x: margin + 300, y: curY - 30, size: 8, font: fontRegular, color: COLOR_TEXT_MUTED });
  page.drawText('Day', { x: margin + 355, y: curY - 18, size: 7, font: fontRegular, color: COLOR_TEXT_MUTED });
  drawDigitBoxes(page, { x: margin + 355, y: curY - 46, count: 2, value: signDate.day, font: fontBold });

  page.drawText('Month', { x: margin + 401, y: curY - 18, size: 7, font: fontRegular, color: COLOR_TEXT_MUTED });
  drawDigitBoxes(page, { x: margin + 401, y: curY - 46, count: 2, value: signDate.month, font: fontBold });

  page.drawText('Year', { x: margin + 447, y: curY - 18, size: 7, font: fontRegular, color: COLOR_TEXT_MUTED });
  drawDigitBoxes(page, { x: margin + 447, y: curY - 46, count: 4, value: signDate.year, font: fontBold });

  curY -= 82;

  // ---------- [4] Section B: Employer details ----------
  page.drawRectangle({
    x: margin,
    y: curY - 14,
    width: contentWidth,
    height: 18,
    color: COLOR_SECTION_BG,
    borderColor: COLOR_ATO_GREEN,
    borderWidth: 0.8
  });

  page.drawText('Section B: Employer to complete', {
    x: margin + 8,
    y: curY - 10,
    size: 10,
    font: fontBold,
    color: COLOR_ATO_GREEN
  });

  curY -= 30;

  const employerName = String((company && company.name) || 'KWorkMate Verified Employer');
  page.drawText('Employer name:', { x: margin, y: curY, size: 8.5, font: fontRegular, color: COLOR_TEXT_MUTED });
  page.drawRectangle({ x: margin + 95, y: curY - 4, width: 200, height: 16, borderColor: COLOR_BORDER_GRAY, borderWidth: 1, color: COLOR_BOX_FILL });
  page.drawText(employerName.slice(0, 45), { x: margin + 100, y: curY, size: 8.5, font: fontBold, color: COLOR_TEXT_BLACK });

  const employerAbn = String((company && company.abn) || '').replace(/\D/g, '');
  page.drawText('Employer ABN:', { x: margin + 305, y: curY, size: 8.5, font: fontRegular, color: COLOR_TEXT_MUTED });
  drawDigitBoxes(page, { x: margin + 380, y: curY - 5, count: 11, width: 12, height: 16, value: employerAbn, font: fontBold, fontSize: 8.5 });

  curY -= 26;

  page.drawText('Employer record copy retained under Superannuation Guarantee (Administration) Act 1992.', {
    x: margin,
    y: curY,
    size: 7.5,
    font: fontRegular,
    color: COLOR_TEXT_MUTED
  });

  page.drawText('Filed electronically via KWorkMate Platform', {
    x: width - margin - 180,
    y: curY,
    size: 8,
    font: fontBold,
    color: COLOR_ATO_GREEN
  });

  return await pdfDoc.save();
}
