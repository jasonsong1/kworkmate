// ============================================================
// generate_schema.mjs
// 역할: 바탕화면 DB 폴더의 Base44 CSV 파일들을 읽어서
//       Supabase 테이블 생성 SQL(001_create_tables.sql)을 자동으로 만들어 줍니다.
// 실행: node supabase/tools/generate_schema.mjs
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// CSV 파일이 들어있는 폴더 (바탕화면의 DB 폴더)
const CSV_DIR = process.env.CSV_DIR || 'C:/Users/Application User/OneDrive/Desktop/DB';
// 생성될 SQL 파일 위치 (규칙: supabase/migrations 폴더 + 000_ 순번)
const OUT_FILE = path.join(__dirname, '..', 'migrations', '001_create_tables.sql');

// ---------- 1) CSV 파서 (따옴표, 줄바꿈 포함 값을 올바르게 처리) ----------
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM 제거
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // "" -> "
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

// ---------- 2) 이름 변환 (PascalCase -> snake_case) ----------
const toSnake = s => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const q = s => '"' + s.replace(/"/g, '""') + '"'; // SQL 식별자 따옴표

// ---------- 3) 컬럼 타입 추론 ----------
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
function inferType(name, values) {
  if (name === 'id') return 'text primary key';
  const v = values.filter(x => x !== '');
  if (v.length === 0) return 'text';
  // 날짜/시간 컬럼
  if (['created_date', 'updated_date'].includes(name)) return 'timestamptz';
  if (v.every(x => ISO_TS.test(x)) && /_at$/.test(name)) return 'timestamptz';
  // 참/거짓
  if (v.every(x => x === 'true' || x === 'false')) return 'boolean';
  // JSON (배열/객체)
  if (v.every(x => /^[\[{]/.test(x.trim()))) {
    try { v.forEach(x => JSON.parse(x)); return 'jsonb'; } catch { /* 문자열로 처리 */ }
  }
  // 숫자 (앞자리 0 이 있는 번호, 전화번호, ID 류는 문자열로 유지)
  const textLike = /(_id|_number|phone|token|code|postcode|bsb|prefix|key|hash|salt|tfn)/.test(name);
  if (!textLike && v.every(x => /^-?\d+(\.\d+)?$/.test(x) && !/^0\d/.test(x))) return 'numeric';
  return 'text';
}

// ---------- 4) 빈 CSV 파일(데이터 없음)용 수동 정의 ----------
const EMPTY_TABLES = {
  PushSubscription: { company_id: 'text', branch_id: 'text', user_email: 'text', endpoint: 'text', p256dh: 'text', auth: 'text', device_label: 'text', platform: 'text', user_agent: 'text', locale: 'text', active: 'boolean', failure_count: 'numeric', last_error: 'text', last_success_at: 'timestamptz' },
  PushVapidKey: { key_id: 'text', public_key: 'text', private_key: 'text', subject: 'text' },
  RegionalHoliday: { company_id: 'text', state: 'text', year: 'numeric', date: 'text', name: 'text', name_ko: 'text', region: 'text', scope: 'text', source_label: 'text', source_url: 'text', note: 'text', status: 'text', imported_by_email: 'text', imported_at: 'timestamptz', applied_at: 'timestamptz' },
};
const BASE_COLS = { id: 'text primary key', created_date: 'timestamptz', updated_date: 'timestamptz', created_by_id: 'text', is_sample: 'boolean' };

// ---------- 5) SQL 생성 ----------
const out = ['-- 자동 생성됨: Base44 export CSV 기준 Supabase 테이블 (ID는 Base44 문자열 ID 그대로 사용)', ''];
const summary = [];
const files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('_export.csv')).sort();

for (const file of files) {
  const entity = file.replace('_export.csv', '');
  const table = toSnake(entity);
  const rows = parseCsv(fs.readFileSync(path.join(CSV_DIR, file), 'utf8'));
  let cols = []; // [이름, 타입]

  if (rows.length === 0) {
    const def = EMPTY_TABLES[entity];
    if (!def) { console.warn('건너뜀(빈 파일):', file); continue; }
    cols = [['id', BASE_COLS.id], ...Object.entries(def), ...['created_date', 'updated_date', 'created_by_id', 'is_sample'].map(k => [k, BASE_COLS[k]])];
  } else {
    const header = rows[0];
    header.forEach((name, i) => cols.push([name, inferType(name, rows.slice(1).map(r => r[i] ?? ''))]));
  }
  const rowCount = Math.max(rows.length - 1, 0);
  summary.push(`${table}: ${cols.length}컬럼 / ${rowCount}행`);
  out.push(`CREATE TABLE IF NOT EXISTS public.${q(table)} (`);
  out.push(cols.map(([n, t]) => `  ${q(n)} ${t}`).join(',\n'));
  out.push(');');
  // 보안: 행 단위 보안(RLS) 활성화. 정책이 없으면 anon 키로는 접근 불가 (service_role 만 가능)
  out.push(`ALTER TABLE public.${q(table)} ENABLE ROW LEVEL SECURITY;`, '');
}

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, out.join('\n'), 'utf8');
console.log('생성 완료:', OUT_FILE);
console.log(summary.join('\n'));
