// Every screen asks its question here. The answer is the one the server resolved out of the
// package, the position preset and the employer grant, so a screen never judges on its own.
import { useWorkspace } from '@/lib/WorkspaceContext';

export function usePermissions() {
  const { access, role, isPlatformAdmin, isCompanyAdmin } = useWorkspace();
  const level = (module) => (access && access[module] ? access[module].level : 'none');
  const scope = (module) => (access && access[module] ? access[module].scope : '');

  return {
    role,
    isPlatformAdmin,
    isCompanyAdmin,
    permissions: access || {},
    level,
    scope,
    canView: (module) => level(module) !== 'none',
    canEdit: (module) => ['update', 'write'].includes(level(module)),
    canWrite: (module) => level(module) === 'write'
  };
}