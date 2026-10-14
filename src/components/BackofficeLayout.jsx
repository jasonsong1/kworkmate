import React, { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Languages, Loader2, LogOut, Menu, Moon, RefreshCw, Sun } from 'lucide-react';
import AccessDenied from '@/components/AccessDenied';
import AppSidebar from '@/components/AppSidebar';
import CompanySwitcher from '@/components/company/CompanySwitcher';
import NotificationBell from '@/components/NotificationBell';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useI18n } from '@/lib/i18n';
import { WorkspaceProvider, useWorkspace } from '@/lib/WorkspaceContext';
import { moduleForPath } from '@/lib/packages';
import AccessExpired from '@/components/package/AccessExpired';
import { Card, CardContent } from '@/components/ui/card';
import { applyTheme, readTheme, resetTheme, saveTheme } from '@/lib/theme';
import { base44 } from '@/api/base44Client';

function BackofficeShell() {
  const { t, toggle } = useI18n();
  const {
    company,
    branches,
    activeBranchId,
    selectBranch,
    isPlatformAdmin,
    me,
    loading,
    pkg,
    hasModule,
    accessError,
    reloadPackage
  } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() => readTheme());
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const requiredModule = moduleForPath(pathname);
  // 슈퍼어드민은 모든 페이지/경로에 100% 접근 가능하며, 일반 사용자는 기존 권한 검사를 따릅니다.
  const allowed = isPlatformAdmin || !requiredModule || hasModule(requiredModule);
  // A super admin is never locked out — they are the one who reactivates the company.
  const expired = Boolean(pkg && pkg.expired) && !isPlatformAdmin;
  const activeBranchOptions = branches.filter((b) => b.is_active !== false);

  useEffect(() => {
    applyTheme(theme);
    // Sign-in and the applicant pages are light, so the dark look is dropped on the way out.
    return () => resetTheme();
  }, [theme]);

  // The look travels with the account, so it comes back on the next sign-in anywhere.
  useEffect(() => {
    const saved = me && me.ui_theme;
    if (saved !== 'dark' && saved !== 'light') return;
    saveTheme(saved);
    setTheme(saved);
  }, [me]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    saveTheme(next);
    setTheme(next);
    base44.auth.updateMe({ ui_theme: next }).catch(() => {});
  };

  const handleLogout = async () => {
    await base44.auth.logout();
    navigate('/login', { replace: true });
  };

  // Nothing is decided until the workspace has answered, and then only an account the platform
  // has on file for a company gets in. The platform admin is staff, so they always pass.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>);
  }
  if (!me) return <Navigate to="/login" replace />;
  if (!company && !isPlatformAdmin) return <AccessDenied />;

  return (
    <div className="flex min-h-screen bg-background">
      {!expired && (
        <aside className="hidden w-64 shrink-0 border-r bg-card lg:block">
          <AppSidebar />
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur lg:px-6">
          {!expired && (
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="lg:hidden">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <AppSidebar onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
          )}

          <div className="min-w-0 flex-1">
            {!isPlatformAdmin && (
              <p className="truncate text-sm font-semibold">{company ? company.name : t('app.name')}</p>
            )}
          </div>

          {isPlatformAdmin && <CompanySwitcher />}

          {activeBranchOptions.length > 0 &&
          <Select value={activeBranchId} onValueChange={selectBranch}>
              <SelectTrigger className="hidden w-56 sm:flex">
                <SelectValue placeholder={t('top.branch')} />
              </SelectTrigger>
              <SelectContent>
                {activeBranchOptions.map((b) =>
              <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
              )}
              </SelectContent>
            </Select>
          }

          <NotificationBell />

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={theme === 'dark' ? t('top.themeLight') : t('top.themeDark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          <Button variant="ghost" size="sm" onClick={toggle} className="gap-2">
            <Languages className="h-4 w-4" />
            <span className="hidden sm:inline">{t('top.language')}</span>
          </Button>

          <Button variant="ghost" size="icon" onClick={handleLogout} title={t('top.logout')}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          {!expired && accessError && (
            <Card className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-sm text-amber-800 dark:text-amber-200">{t('access.failed')}</p>
                <Button variant="outline" size="sm" onClick={() => reloadPackage()}>
                  <RefreshCw className="mr-2 h-4 w-4" /> {t('access.retry')}
                </Button>
              </CardContent>
            </Card>
          )}

          {expired ? <AccessExpired /> : !allowed ? <Navigate to="/" replace /> : <Outlet />}
        </main>
      </div>
    </div>);

}

export default function BackofficeLayout() {
  return (
    <WorkspaceProvider>
      <BackofficeShell />
    </WorkspaceProvider>);

}