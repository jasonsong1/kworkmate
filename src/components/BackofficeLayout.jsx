import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Languages, LogOut, Menu, Moon, Sun } from 'lucide-react';
import AppSidebar from '@/components/AppSidebar';
import CompanySwitcher from '@/components/company/CompanySwitcher';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useI18n } from '@/lib/i18n';
import { WorkspaceProvider, useWorkspace } from '@/lib/WorkspaceContext';
import { areaForPath, usePermissions } from '@/lib/permissions';
import { Card, CardContent } from '@/components/ui/card';
import { applyTheme, readTheme, saveTheme } from '@/lib/theme';
import { base44 } from '@/api/base44Client';

function BackofficeShell() {
  const { t, toggle } = useI18n();
  const { company, branches, activeBranchId, selectBranch, isPlatformAdmin, me } = useWorkspace();
  const { canView } = usePermissions();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() => readTheme());
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const requiredArea = areaForPath(pathname);
  const allowed = !requiredArea || canView(requiredArea);

  useEffect(() => {
    applyTheme(theme);
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

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="hidden w-64 shrink-0 border-r bg-background lg:block">
        <AppSidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur lg:px-6">
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

          <div className="min-w-0 flex-1">
            {!isPlatformAdmin && (
              <p className="truncate text-sm font-semibold">{company ? company.name : t('app.name')}</p>
            )}
          </div>

          {isPlatformAdmin && <CompanySwitcher />}

          {branches.length > 0 &&
          <Select value={activeBranchId} onValueChange={selectBranch}>
              <SelectTrigger className="hidden w-56 sm:flex">
                <SelectValue placeholder={t('top.branch')} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) =>
              <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
              )}
              </SelectContent>
            </Select>
          }

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
          {allowed ? (
            <Outlet />
          ) : (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                {t('perm.noAccess')}
              </CardContent>
            </Card>
          )}
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