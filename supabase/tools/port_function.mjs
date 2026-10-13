// ============================================================
// port_function.mjs
// 목적: Base44 서버 함수(base44/functions/<이름>/entry.ts)를
//       Supabase Edge Function(supabase/functions/<이름>/index.ts)으로 자동 변환합니다.
//
// 모든 공유 파일이 supabase/functions/_shared 에 모여 있으므로,
// Edge Functions 번들러가 단일 패키지로 안전하게 묶어 클라우드에 배포할 수 있습니다.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const functionsSrc = path.join(projectRoot, 'base44', 'functions');
const functionsDest = path.join(projectRoot, 'supabase', 'functions');

const names = process.argv.slice(2);
if (names.length === 0) {
  console.log('사용법: node supabase/tools/port_function.mjs <함수이름> [<함수이름> ...]');
  process.exit(1);
}

let failed = 0;
for (const name of names) {
  const source = path.join(functionsSrc, name, 'entry.ts');
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
    problems.push('Base44 SDK import를 찾지 못했습니다.');
  }

  // waitUntil 처리 (base44:runtime -> Supabase EdgeRuntime 호환)
  code = code.replace(
    /import\s*\{\s*waitUntil\s*\}\s*from\s*['"]base44:runtime['"];?/g,
    "const waitUntil = (p: Promise<any>) => { if (typeof (globalThis as any).EdgeRuntime !== 'undefined' && (globalThis as any).EdgeRuntime?.waitUntil) { (globalThis as any).EdgeRuntime.waitUntil(p); } else { p.catch?.((e: any) => console.error(e)); } };"
  );

  // 2. 클라이언트 생성 호출 교체
  code = code.replace(/createClientFromRequest\(\s*req\s*\)/g, 'createBase44Like()');

  // 3. 상대 경로 보정 (../../shared/ -> ../_shared/)
  code = code.replace(/(['"])\.\.\/\.\.\/shared\//g, '$1../_shared/');

  // 4. export default 함수를 Deno.serve(withCors(...)) 로 변환
  const entry = /export default async function\s*\(([^)]*)\)/;
  if (entry.test(code)) {
    code = code.replace(entry, 'async function handler($1)');
    code = `${code.trimEnd()}\n\nDeno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));\n`;
  } else {
    problems.push('export default async function (req) 형태를 찾지 못했습니다.');
  }

  // 남은 Base44 SDK 흔적 검사
  if (/@base44\/sdk|createClientFromRequest/.test(code)) problems.push('SDK 흔적이 남아 있습니다.');

  if (problems.length) {
    console.log(`✖ ${name}: ${problems.join(' / ')}`);
    failed += 1;
    continue;
  }

  const header =
    '// 자동 생성 파일입니다. 직접 수정하지 마세요.\n' +
    `// 원본: base44/functions/${name}/entry.ts (변환 도구: supabase/tools/port_function.mjs)\n\n`;
  const target = path.join(functionsDest, name, 'index.ts');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, header + code);
  console.log(`✔ ${name} → supabase/functions/${name}/index.ts`);
}
process.exit(failed ? 1 : 0);
