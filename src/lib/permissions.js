// Every screen asks its question here. The answer is the one the server resolved out of the
// package, the position preset and the employer grant, so a screen never judges on its own.
import { useWorkspace } from '@/lib/WorkspaceContext';

export function usePermissions() {
  const { access, role, isPlatformAdmin, isCompanyAdmin } = useWorkspace();
  // 슈퍼어드민(sym910403@gmail.com)은 모든 모듈에서 항상 최고 권한(write / company 범위)입니다.
  // 일반 직책은 기존 로직(서버가 계산한 access)을 그대로 따릅니다.
  const level = (module) => (isPlatformAdmin ? 'write' : access && access[module] ? access[module].level : 'none');
  const scope = (module) => (isPlatformAdmin ? 'company' : access && access[module] ? access[module].scope : '');

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