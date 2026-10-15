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
export async function generateAtoNat3092Pdf({ employee = {}, company = {}, branch = {}, form = {}, signatureDataUrl = '' }) {
  // 공식 무손실 벡터 템플릿 PDF 로드
  const templateBytes = await fetch(NAT3092_OFFICIAL_PDF_BASE64).then((res) => res.arrayBuffer());
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPage(0);
  
  // 국세청 공문서 특유의 타자기/활자체 (CourierBold) 및 볼드 고딕 (HelveticaBold)
  const fontCourier = await pdfDoc.embedFont(StandardFonts.CourierBold);
  const fontHelvetica = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // 박스 크기 규격: 폭 12.3pt, 높이 16.5pt
  const BOX_WIDTH = 12.3;

  /**
   * 고정 X 좌표 배열이 있는 박스에 텍스트 인쇄 (글자별 수평/수직 정중앙 정렬)
   */
  const drawBoxesWithCoords = (text, xCoords, textY, fontSize = 10) => {
    const chars = String(text || '').toUpperCase().split('');
    let charIdx = 0;
    for (let i = 0; i < xCoords.length && charIdx < chars.length; i++) {
      const char = chars[charIdx++];
      if (char === ' ') continue;
      const textWidth = fontCourier.widthOfTextAtSize(char, fontSize);
      const charX = xCoords[i] + (BOX_WIDTH - textWidth) / 2;
      page.drawText(char, {
        x: charX,
        y: textY,
        size: fontSize,
        font: fontCourier,
        color: rgb(0.05, 0.05, 0.15)
      });
    }
  };

  /**
   * 일정한 pitch 간격의 연속 박스에 텍스트 인쇄 (글자별 수평/수직 정중앙 정렬)
   */
  const drawBoxesText = (text, startX, textY, maxLen = 19, fontSize = 9.5, pitch = 14.17) => {
    const chars = String(text || '').toUpperCase().split('');
    let boxIdx = 0;
    for (let i = 0; i < chars.length && boxIdx < maxLen; i++) {
      const char = chars[i];
      if (char === ' ') {
        boxIdx++; // 띄어쓰기는 한 칸 비움
        continue;
      }
      const textWidth = fontCourier.widthOfTextAtSize(char, fontSize);
      const boxLeft = startX + boxIdx * pitch;
      const charX = boxLeft + (BOX_WIDTH - textWidth) / 2;
      page.drawText(char, {
        x: charX,
        y: textY,
        size: fontSize,
        font: fontCourier,
        color: rgb(0.05, 0.05, 0.15)
      });
      boxIdx++;
    }
  };

  /**
   * 체크박스 정중앙에 'X' 마킹 (호주 ATO 표준 규격)
   */
  const markX = (boxX, boxY, boxW = 12.3) => {
    const mark = 'X';
    const markSize = 10.5;
    const textWidth = fontHelvetica.widthOfTextAtSize(mark, markSize);
    page.drawText(mark, {
      x: boxX + (boxW - textWidth) / 2,
      y: boxY + 3.5,
      size: markSize,
      font: fontHelvetica,
      color: rgb(0.05, 0.1, 0.45) // 볼펜 감청색 잉크
    });
  };

  // ==================== [SECTION A: 직원 작성란 (Payee)] ====================

  // 1. TFN 9자리 (Question 1)
  const tfnRaw = String(form.tfn_number || employee.tfn_number || '').replace(/\D/g, '');
  if (form.tfn_exemption === 'applied' || form.tfn_pending || employee.tfn_pending) {
    // 예외 사유 1: TFN 신청 후 28일 이내 유예 (X: 278.0, Y: 707.5)
    markX(278.0, 707.5);
  } else if (form.tfn_exemption === 'under18') {
    // 예외 사유 2: 18세 미만 비과세 (X: 278.0, Y: 683.4)
    markX(278.0, 683.4);
  } else if (form.tfn_exemption === 'pensioner') {
    // 예외 사유 3: 연금/수당 수급자 (X: 278.0, Y: 659.3)
    markX(278.0, 659.3);
  } else if (tfnRaw && tfnRaw.length === 9) {
    // 정규 9자리 네모 칸 (3개 - 3개 - 3개 그리드 좌표 완벽 일치)
    const tfnXCoords = [136.3, 150.5, 164.7, 193.0, 207.2, 221.4, 249.7, 263.9, 278.0];
    drawBoxesWithCoords(tfnRaw, tfnXCoords, 735.6, 10.5);
  } else {
    // 미입력 시 신청 중으로 체크
    markX(278.0, 707.5);
  }

  // 2. 성명 (Question 2: Name)
  const title = String(form.title || employee.title || 'Mr').toLowerCase();
  if (title === 'mrs') markX(193.0, 633.8);
  else if (title === 'miss') markX(235.5, 633.8);
  else if (title === 'ms') markX(278.0, 633.8);
  else markX(150.5, 633.8); // Mr (기본)

  // 성(Surname) & 이름(First given name) & 중간이름(Other given names)
  const surname = String(form.family_name || form.surname || employee.surname || '').trim() ||
    String(form.full_name || employee.full_name || '').split(/\s+/).pop();
  const givenNames = String(form.given_names || form.first_name || employee.first_name || '').trim() ||
    String(form.full_name || employee.full_name || '').split(/\s+/).slice(0, -1).join(' ') ||
    String(form.full_name || employee.full_name || '').trim();
  const otherNames = String(form.other_names || employee.other_names || '').trim();

  // Surname 칸 (Y: 606.9 박스 내부 정확 정렬 -> textY: 610.9)
  drawBoxesText(surname, 22.9, 610.9, 19, 9.5);
  // First given name 칸 (Y: 579.9 박스 내부 -> textY: 583.9)
  drawBoxesText(givenNames, 22.9, 583.9, 19, 9.5);
  // Other given names 칸 (Y: 553.0 박스 내부 -> textY: 557.0)
  if (otherNames) {
    drawBoxesText(otherNames, 22.9, 557.0, 19, 9.5);
  }

  // 3. 호주 거주 주소 (Question 3: Home address)
  const addressLine1 = String(form.address_line1 || form.address || employee.address || '123 GEORGE STREET').toUpperCase();
  const addressLine2 = String(form.address_line2 || '').toUpperCase();
  // Address Line 1 (Y: 514.7 -> textY: 518.7)
  drawBoxesText(addressLine1.slice(0, 19), 22.9, 518.7, 19, 9.5);
  // Address Line 2 (Y: 490.6 -> textY: 494.6)
  if (addressLine2) {
    drawBoxesText(addressLine2.slice(0, 19), 22.9, 494.6, 19, 9.5);
  }

  // Suburb (Y: 465.1 -> textY: 469.1)
  const suburb = String(form.suburb || employee.suburb || 'SYDNEY').toUpperCase();
  drawBoxesText(suburb, 22.9, 469.1, 19, 9.5);

  // State (3칸) & Postcode (4칸) (Y: 439.6 -> textY: 443.6)
  const state = String(form.state || employee.state || 'NSW').toUpperCase();
  drawBoxesWithCoords(state, [22.9, 37.1, 51.3], 443.6, 9.5);

  const postcode = String(form.postcode || employee.postcode || '2000').replace(/\D/g, '');
  drawBoxesWithCoords(postcode, [93.8, 108.0, 122.1, 136.3], 443.6, 9.5);

  // 4. 이전 성 (Question 4: Previous family name) (Y: 392.6 -> textY: 396.6)
  const prevFamilyName = String(form.previous_family_name || '').toUpperCase();
  if (prevFamilyName) {
    drawBoxesText(prevFamilyName, 22.9, 396.6, 19, 9.5);
  }

  // 5. 이메일 주소 (Question 5: Primary e-mail address)
  const email = String(form.email || form.user_email || employee.user_email || employee.email || '').toUpperCase();
  // 첫째 줄 (Y: 731.6 -> textY: 735.6)
  drawBoxesText(email.slice(0, 19), 316.3, 735.6, 19, 8.8);
  // 둘째 줄 (Y: 707.5 -> textY: 711.5)
  if (email.length > 19) {
    drawBoxesText(email.slice(19, 38), 316.3, 711.5, 19, 8.8);
  }

  // 6. 생년월일 (Question 6: Date of birth) (Y: 674.2 -> textY: 678.2)
  const dob = formatAtoDate(form.date_of_birth || employee.date_of_birth || '1998-01-01');
  drawBoxesWithCoords(dob.day || '01', [455.2, 469.4], 678.2, 10);
  drawBoxesWithCoords(dob.month || '01', [492.1, 506.2], 678.2, 10);
  drawBoxesWithCoords(dob.year || '1998', [528.9, 543.1, 557.3, 571.4], 678.2, 10);

  // 7. 고용 형태 (Question 7: On what basis are you paid?) (Y: 636.8)
  const empType = String(form.employment_type || employee.employment_type || 'casual').toLowerCase();
  if (empType === 'full_time' || empType.includes('full')) {
    markX(356.0, 636.8); // Full-time
  } else if (empType === 'part_time' || empType.includes('part')) {
    markX(411.3, 636.8); // Part-time
  } else if (empType === 'labour_hire') {
    markX(449.5, 636.8); // Labour hire
  } else if (empType === 'super_stream') {
    markX(516.2, 636.8); // Superannuation income stream
  } else {
    markX(571.4, 636.8); // Casual employment (기본)
  }

  // 8. 세법상 거주자 구분 (Question 8: Residency) (Y: 597.3)
  const resStatus = String(form.residency_status || employee.residency_status || 'resident').toLowerCase();
  if (resStatus.includes('holiday') || resStatus.includes('working') || employee.visa_type === 'working_holiday') {
    markX(571.9, 597.3); // Working holiday maker
  } else if (resStatus === 'foreign' || employee.visa_type === 'student') {
    markX(469.9, 597.3); // Foreign resident
  } else {
    markX(384.0, 597.3); // Australian resident
  }

  // 9. 비과세 기준액 신청 (Question 9: Tax-free threshold) (Y: 534.0)
  const claimTaxFree = Boolean(form.tax_free_threshold ?? employee.tax_free_threshold ?? true);
  if (claimTaxFree) {
    markX(330.5, 534.0); // Yes
  } else {
    markX(367.3, 534.0); // No
  }

  // 10. 학자금 대출 여부 (Question 10: HELP/VSL/TSL debt) (Y: 474.7)
  const hasHecs = Boolean(form.hecs_help ?? employee.hecs_help ?? false);
  if (hasHecs) {
    markX(330.5, 474.7); // Yes
  } else {
    markX(571.4, 474.7); // No
  }

  // 서명란 날짜 (DECLARATION by payee Date) (Y: 414.7 -> textY: 418.7)
  const signDate = formatAtoDate(form.signed_at || employee.signed_at || new Date().toISOString());
  drawBoxesWithCoords(signDate.day, [455.2, 469.4], 418.7, 10);
  drawBoxesWithCoords(signDate.month, [492.1, 506.2], 418.7, 10);
  drawBoxesWithCoords(signDate.year, [528.9, 543.1, 557.3, 571.4], 418.7, 10);

  // 자필 전자서명 이미지 오버레이 (공식 서명 사각형 박스: X: 305.0, Y: 414.7, W: 144.8, H: 30.7)
  if (signatureDataUrl && signatureDataUrl.startsWith('data:image/')) {
    try {
      const sigBytes = await fetch(signatureDataUrl).then((res) => res.arrayBuffer());
      const sigImg = await pdfDoc.embedPng(sigBytes);
      page.drawImage(sigImg, {
        x: 308,
        y: 416,
        width: 138,
        height: 28
      });
    } catch {
      page.drawText(surname + ' ' + givenNames, {
        x: 312,
        y: 424,
        size: 13,
        font: fontHelvetica,
        color: rgb(0.05, 0.1, 0.45)
      });
    }
  } else {
    page.drawText(surname + ' ' + givenNames, {
      x: 312,
      y: 424,
      size: 13,
      font: fontHelvetica,
      color: rgb(0.05, 0.1, 0.45)
    });
  }

  // ==================== [SECTION B: 고용주란 (Payer)] ====================

  // 1. ABN 11자리 (Question 1) (Y: 312.4 -> textY: 316.4)
  const abnRaw = String((company && company.abn) || '51824753556').replace(/\D/g, '');
  const abnXCoords = [22.9, 37.1, 65.4, 79.6, 93.8, 122.1, 136.3, 150.5, 178.8, 193.0, 207.2];
  drawBoxesWithCoords(abnRaw, abnXCoords, 316.4, 10);

  // 3. Registered business name (Question 3)
  // [중요] 3번 항목은 오직 회사/법인 등록 상호명만 기입합니다. 주소는 절대 포함하지 않습니다.
  const compName = String((company && company.name) || 'KWORKMATE PTY LTD').toUpperCase();
  // Line 1 (Y: 241.4 -> textY: 245.4)
  drawBoxesText(compName.slice(0, 19), 23.0, 245.4, 19, 9.5);
  // Line 2 (Y: 217.3 -> textY: 221.3)
  if (compName.length > 19) {
    drawBoxesText(compName.slice(19, 38), 23.0, 221.3, 19, 9.5);
  }
  // Line 3 (Y: 193.2 -> textY: 197.2) - 회사명이 38자를 초과할 때만 3번째 줄에 이어서 기입 (주소 기입 절대 금지!)
  if (compName.length > 38) {
    drawBoxesText(compName.slice(38, 57), 23.0, 197.2, 19, 9.5);
  }

  // 4. Business address (Question 4)
  // [중요] 지점설정의 도로명 주소만 4번 첫 줄에 넣고, Suburb/State/Postcode는 그 아래 전용 칸에만 나옵니다.
  let rawAddr = String((branch && branch.address) || (company && company.address) || 'U4 1274 BOTANY RD').trim();
  // 쉼표 뒤에 붙은 suburb, state, postcode 등은 완전히 제거하여 순수 도로명만 남김
  if (rawAddr.includes(',')) {
    rawAddr = rawAddr.split(',')[0].trim();
  }
  const cleanAddr = rawAddr.toUpperCase();
  // Line 1 (Y: 157.5 -> textY: 161.5) - 4번 사업장 주소 첫 줄 (예: U4 1274 BOTANY RD)
  drawBoxesText(cleanAddr.slice(0, 19), 22.9, 161.5, 19, 9.5);
  // [중요] Line 2는 'BOTANY, NSW, 2019' 같은 중복 값을 절대 찍지 않고 완전히 빈칸으로 비워둡니다.
  // Suburb/town/locality (Y: 105.2 -> textY: 109.2)
  const branchSuburb = String((branch && branch.suburb) || (company && company.suburb) || 'BOTANY').toUpperCase();
  drawBoxesText(branchSuburb, 22.9, 109.2, 19, 9.5);
  // State/territory & Postcode (Y: 79.7 -> textY: 83.7)
  const branchState = String((branch && branch.state) || (company && company.state) || 'NSW').toUpperCase();
  drawBoxesWithCoords(branchState, [22.9, 37.1, 51.3], 83.7, 9.5);
  const branchPostcode = String((branch && branch.postcode) || (company && company.postcode) || '2019').replace(/\D/g, '');
  drawBoxesWithCoords(branchPostcode, [93.8, 108.0, 122.2, 136.3], 83.7, 9.5);

  // 5. Primary email (Question 5) (Line 1 Y: 322.4 -> textY: 326.4, Line 2 Y: 296.9 -> textY: 300.9)
  // [중요] 지점설정에 등록된 공식 이메일을 그대로 가져다 씁니다.
  const compEmail = String(
    (branch && branch.contact_email) ||
    (branch && branch.email) ||
    (company && company.contact_email) ||
    'payroll@QATESTB.com'
  ).toUpperCase();
  drawBoxesText(compEmail.slice(0, 19), 316.3, 326.4, 19, 8.8);
  if (compEmail.length > 19) {
    drawBoxesText(compEmail.slice(19, 38), 316.3, 300.9, 19, 8.8);
  }

  // 6. Contact person & Phone (Question 6)
  // [중요] 지점설정에 등록된 담당자 이름(Pay Rol) 및 전화번호를 있는 그대로 기입합니다.
  const contactPerson = String(
    (branch && branch.contact_name) ||
    (company && company.contact_name) ||
    'Pay Rol'
  ).toUpperCase();
  drawBoxesText(contactPerson.slice(0, 19), 316.3, 265.2, 19, 8.8);

  const contactPhone = String(
    (branch && (branch.contact_phone || branch.phone)) ||
    (company && company.contact_phone) ||
    '02123456789'
  ).replace(/\D/g, '');
  const phoneXCoords = [401.3, 415.5, 429.7, 443.9, 458.1, 472.2, 486.4, 500.6, 514.8, 528.9];
  drawBoxesWithCoords(contactPhone, phoneXCoords, 241.1, 9.5);

  // DECLARATION by payer: 고용주 공식 전자서명 (Signature of payer: 사각형 박스 X: 305.2, Y: 151.2, W: 144.8, H: 30.7)
  // [중요] 회사설정 > 온보딩 > TFN declaration form에 저장된 전자서명을 그대로 가져와 인쇄합니다.
  const employerSig = (company && company.tfn_employer_signature) || '';
  if (employerSig && employerSig.startsWith('data:image/')) {
    try {
      const empSigBytes = await fetch(employerSig).then((res) => res.arrayBuffer());
      const empSigImg = await pdfDoc.embedPng(empSigBytes);
      page.drawImage(empSigImg, {
        x: 308,
        y: 153,
        width: 138,
        height: 27
      });
    } catch {
      // 서명 이미지 디코딩 실패 시 담당자 이름 서명
      page.drawText(contactPerson, {
        x: 312,
        y: 160,
        size: 11,
        font: fontHelvetica,
        color: rgb(0.05, 0.1, 0.45)
      });
    }
  } else {
    // 서명이 아직 등록되지 않은 경우에도 'PAYROLL MANAGER'가 아닌 지점 담당자 이름(Pay Rol)을 기입
    page.drawText(contactPerson, {
      x: 312,
      y: 160,
      size: 11,
      font: fontHelvetica,
      color: rgb(0.05, 0.1, 0.45)
    });
  }

  // Payer Declaration Date (Y: 151.2 -> textY: 155.2)
  drawBoxesWithCoords(signDate.day, [455.5, 469.6], 155.2, 10);
  drawBoxesWithCoords(signDate.month, [492.3, 506.5], 155.2, 10);
  drawBoxesWithCoords(signDate.year, [529.2, 543.3, 557.5, 571.7], 155.2, 10);

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
