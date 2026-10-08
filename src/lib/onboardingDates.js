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

// A complete answer in the chosen style, with a day and a month that exist.
export function validDate(value, format) {
  const parts = partsOf(format);
  const blocks = String(value || '').trim().split('-');
  if (blocks.length !== parts.length) return false;
  const seen = {};
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!new RegExp(`^\\d{${part.length}}$`).test(blocks[index])) return false;
    seen[part.type] = Number(blocks[index]);
  }
  if (seen.D !== undefined && (seen.D < 1 || seen.D > 31)) return false;
  if (seen.M !== undefined && (seen.M < 1 || seen.M > 12)) return false;
  return true;
}