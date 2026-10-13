// Supabase 연결 테스트 (키 값은 출력하지 않음)
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// .env.local 파일을 읽어 환경변수 객체로 만듭니다.
const env = {};
fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).forEach((line) => {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
});

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

// 키가 공개용(anon)인지 검사합니다. service_role 이면 위험하므로 중단합니다.
let role = 'JWT 형식 아님(sb_publishable 등 새 형식일 수 있음)';
try {
  role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
} catch {}
console.log('키 role:', role);
console.log('URL 형식:', /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url) ? '정상' : '확인 필요');

if (role === 'service_role') {
  console.log('경고: service_role 키입니다! .env.local 에서 즉시 제거하고 anon 키로 바꾸세요.');
  process.exit(1);
}

const supabase = createClient(url, key);
const r = await supabase.from('company').select('*', { count: 'exact', head: true });
console.log(r.error ? '오류: ' + r.error.message : '연결 성공, 익명으로 조회 가능한 행 수: ' + r.count);
