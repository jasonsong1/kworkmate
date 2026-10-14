// The date styles an employer can pick for an onboarding question, in the order the settings
// screen lists them. An answer typed on the employee's phone is shaped and checked against the
// style that was chosen for that question.
export const DATE_FORMATS = ['YYYY-MM-DD', 'DD-MM-YYYY', 'DD-MM-YY', 'MM-DD-YYYY'];

const DEFAULT_FORMAT = DATE_FORMATS[0];

// The question's own setting, falling back to the standard year-month-day.
export function dateFormatOf(question) {
  const saved = question && question.validation && question.validation.format;
  return DATE_FORMATS.includes(saved) ? saved : DEFAULT_FORMAT;
}

// Each block of the pattern: YYYY/YY is the year, MM the month and DD the day.
function partsOf(format) {
  return dateFormatOf({ validation: { format } })
    .split('-')
    .map((token) => ({
      type: token.charAt(0).toUpperCase(),
      length: token.length
    }));
}

// Keeps the digits a person types and puts the separators back in, so the answer can only ever
// look like the style the employer chose.
export function maskDate(value, format) {
  const parts = partsOf(format);
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const digits = String(value || '').replace(/\D/g, '').slice(0, total);
  const blocks = [];
  let at = 0;
  for (const part of parts) {
    const block = digits.slice(at, at + part.length);
    if (!block) break;
    blocks.push(block);
    at += part.length;
  }
  return blocks.join('-');
}

// A complete answer in the chosen style, or standard ISO / Australian date format.
export function validDate(value, format) {
  if (!value || typeof value !== 'string') return false;
  const clean = value.trim();
  if (!clean) return false;

  // 1. HTML5 input[type=date] 기본 표준 포맷: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split('-').map(Number);
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > 31) return false;
    if (y < 1900 || y > 2100) return false;
    return true;
  }

  // 2. 호주/영국식 일반 표기: DD/MM/YYYY 또는 DD-MM-YYYY
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(clean)) {
    const parts = clean.split(/[\/\-]/).map(Number);
    const d = parts[0];
    const m = parts[1];
    const y = parts[2] < 100 ? (parts[2] > 30 ? 1900 + parts[2] : 2000 + parts[2]) : parts[2];
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > 31) return false;
    if (y < 1900 || y > 2100) return false;
    return true;
  }

  // 3. 기존 포맷 분할 매칭
  try {
    const parts = partsOf(format);
    const blocks = clean.split(/[\/\-]/);
    if (blocks.length === parts.length) {
      const seen = {};
      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        seen[part.type] = Number(blocks[index]);
      }
      if (seen.D !== undefined && (seen.D < 1 || seen.D > 31)) return false;
      if (seen.M !== undefined && (seen.M < 1 || seen.M > 12)) return false;
      return true;
    }
  } catch (_) {}

  // 4. 일반 Date 파싱 검사
  const parsed = Date.parse(clean);
  return !Number.isNaN(parsed);
}