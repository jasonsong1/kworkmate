// ============================================================
// port_function.mjs
// 목적: 원본 Base44 서버 함수(base44/functions/<이름>/entry.ts)를 읽어서
//       Supabase Edge Function(base44/supabase/functions/<이름>/index.ts)으로 "자동 변환"합니다.
//       원본 파일은 수정하지 않으며, 생성 파일은 직접 고치지 말고 이 도구로 다시 만드세요.
//
// 사용법:  node base44/supabase/tools/port_function.mjs kwData kwLogin kwSession
//
// 변환 내용 (4가지뿐):
//   1. Base44 SDK import  →  호환 객체 import
//   2. createClientFromRequest(req)  →  createBase44Like()
//   3. ../../shared/ 경로  →  ../../../shared/ (폴더 깊이가 달라서)
//   4. export default 함수  →  Deno.serve(withCors(handler))
// ============================================================
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');           // base44/
const names = process.argv.slice(2);
if (names.length === 0) {
  console.log('사용법: node base44/supabase/tools/port_function.mjs <함수이름> [<함수이름> ...]');
  process.exit(1);
}

let failed = 0;
for (const name of names) {
  const source = path.join(root, 'functions', name, 'entry.ts');
  if (!fs.existsSync(source)) {
    console.log(`✖ ${name}: 원본(${source})이 없습니다.`);
    failed += 1;
    continue;
  }
  let code = fs.readFileSync(source, 'utf8');
  const problems = [];

  // 1. SDK import 교체
  const sdkImport = /import\s*\{\s*createClientFromRequest\s*\}\s*from\s*['"]npm:@base44\/sdk@[^'"]+['"];?/;
  if (sdkImport.test(code)) {
    code = code.replace(
      sdkImport,
      "import { createBase44Like } from '../_shared/server.ts';\nimport { withCors } from '../_shared/http.mjs';"
    );
  } else {
    problems.push('Base44 SDK import 를 찾지 못했습니다');
  }

  // 2. 클라이언트 생성 호출 교체
  code = code.replace(/createClientFromRequest\(\s*req\s*\)/g, 'createBase44Like()');

  // 3. 상대 경로 보정
  code = code.replace(/(['"])\.\.\/\.\.\/shared\//g, '$1../../../shared/');

  // 4. 기본 export 함수를 handler 로 바꾸고 마지막에 서버 시작 코드 추가
  const entry = /export default async function\s*\(([^)]*)\)/;
  if (entry.test(code)) {
    code = code.replace(entry, 'async function handler($1)');
    code = `${code.trimEnd()}\n\nDeno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));\n`;
  } else {
    problems.push('export default async function (req) 형태를 찾지 못했습니다');
  }

  // 변환 후에도 남은 Base44 SDK 흔적 검사
  if (/@base44\/sdk|createClientFromRequest/.test(code)) problems.push('SDK 흔적이 남아 있습니다');

  if (problems.length) {
    console.log(`✖ ${name}: ${problems.join(' / ')} → 수동 확인이 필요합니다.`);
    failed += 1;
    continue;
  }

  const header =
    '// 자동 생성 파일입니다. 직접 수정하지 마세요.\n' +
    `// 원본: base44/functions/${name}/entry.ts  (변환 도구: base44/supabase/tools/port_function.mjs)\n\n`;
  const target = path.join(root, 'supabase', 'functions', name, 'index.ts');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, header + code);
  console.log(`✔ ${name} → supabase/functions/${name}/index.ts`);
}
process.exit(failed ? 1 : 0);
