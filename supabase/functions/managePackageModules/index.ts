// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/managePackageModules/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { ALL_MODULES, PACKAGES, normalizePackage, rowsOf } from '../_shared/packages.ts';

// Module access is a platform-wide decision per package: a super admin can take a module out of
// a package or put one back in, and the change reaches every company on that package.
async function handler(req) {
  try {
    const base44 = createBase44Like();
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (me.role !== 'admin') {
      return Response.json({ error: 'Only a super admin can change package modules' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'read');
    const stored = rowsOf(await base44.asServiceRole.entities.PackageModule.list({ limit: 50 }).catch(() => []));
    const rowFor = (key) => stored.find((row) => normalizePackage(row && row.package) === key);
    const modulesIn = (row) => (Array.isArray(row && row.modules) ? row.modules : []);
    const cleanModules = (value) =>
      ALL_MODULES.filter((module) => (Array.isArray(value) ? value : []).includes(module));

    if (action === 'save') {
      const key = normalizePackage(body.package);
      if (!key) return Response.json({ error: 'Choose a package' }, { status: 400 });
      const modules = cleanModules(body.modules);
      const existing = rowFor(key);
      if (existing) await base44.asServiceRole.entities.PackageModule.update(existing.id, { package: key, modules });
      else await base44.asServiceRole.entities.PackageModule.create({ package: key, modules });
      return Response.json({ ok: true, package: key, modules });
    }

    // Back to the package's own table: the platform's edit is removed, not copied.
    if (action === 'reset') {
      const key = normalizePackage(body.package);
      const existing = rowFor(key);
      if (existing) await base44.asServiceRole.entities.PackageModule.delete(existing.id);
      return Response.json({ ok: true, package: key, modules: key ? PACKAGES[key].modules : [] });
    }

    const packages = {};
    Object.keys(PACKAGES).forEach((key) => {
      const override = rowFor(key);
      packages[key] = {
        modules: override ? cleanModules(modulesIn(override)) : PACKAGES[key].modules,
        changed: Boolean(override)
      };
    });

    return Response.json({ ok: true, all_modules: ALL_MODULES, packages });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
