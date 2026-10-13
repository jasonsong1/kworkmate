// ============================================================
// import_csv.mjs
// 역할: 바탕화면 DB 폴더의 CSV 22개를 Supabase 테이블에 업로드합니다.
// 실행(PowerShell):
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="service_role 키"
//   node supabase/tools/import_csv.mjs
// 보안: 비밀 키는 파일에 저장하지 않고 실행할 때만 환경변수로 전달합니다.
// 같은 id 는 덮어쓰기(upsert) 하므로 여러 번 실행해도 중복되지 않습니다.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './generate_schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_DIR = process.env.CSV_DIR || 'C:/Users/Application User/OneDrive/Desktop/DB';
const SQL_FILE = path.join(__dirname, '..', 'migrations', '001_create_tables.sql');
const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) { console.error('SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.'); process.exit(1); }

// 1) SQL 파일에서 테이블별 컬럼 타입을 읽어옵니다.
const schema = {};
for (const m of fs.readFileSync(SQL_FILE, 'utf8').matchAll(/CREATE TABLE IF NOT EXISTS public\."(\w+)" \(([\s\S]*?)\n\);/g)) {
  schema[m[1]] = {};
  for (const line of m[2].split('\n')) {
    const c = line.match(/^\s*"(\w+)" (\w+)/);
    if (c) schema[m[1]][c[1]] = c[2];
  }
}

// 2) CSV 문자열 값을 컬럼 타입에 맞게 변환합니다. (빈 문자열 -> null)
function convert(value, type) {
  if (value === '' || value === undefined) return null;
  if (type === 'boolean') return value === 'true';
  if (type === 'numeric') return Number(value);
  if (type === 'jsonb') return JSON.parse(value);
  return value;
}

const toSnake = s => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('_export.csv')).sort();
let failed = false;

for (const file of files) {
  const table = toSnake(file.replace('_export.csv', ''));
  const cols = schema[table];
  const rows = parseCsv(fs.readFileSync(path.join(CSV_DIR, file), 'utf8'));
  if (!cols || rows.length < 2) { console.log(`- ${table}: 데이터 없음 (건너뜀)`); continue; }
  const header = rows[0];
  const records = rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, convert(r[i], cols[h])])));

  // 3) 200행씩 나눠서 업로드
  let done = 0;
  for (let i = 0; i < records.length; i += 200) {
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?on_conflict=id`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(records.slice(i, i + 200)),
    });
    if (!res.ok) { console.error(`✗ ${table} 실패: ${res.status} ${await res.text()}`); failed = true; break; }
    done += Math.min(200, records.length - i);
  }
  if (done === records.length) console.log(`✓ ${table}: ${done}행 업로드 완료`);
}
console.log(failed ? '\n일부 실패가 있습니다.' : '\n전체 업로드 완료!');
