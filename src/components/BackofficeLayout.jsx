import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Menu, Languages } from 'lucide-react';
import AppSidebar from '@/components/AppSidebar';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useI18n } from '@/lib/i18n';
import { WorkspaceProvider, useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

function BackofficeShell() {
  const { t, toggle } = useI18n();
  const { me, company, branches, activeBranchId, selectBranch, role } = useWorkspace();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

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
            <p className="truncate text-sm font-semibold">{company ? company.name : t('app.name')}</p>
            

            
          </div>

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

          <Button variant="ghost" size="sm" onClick={toggle} className="gap-2">
            <Languages className="h-4 w-4" />
            <span className="hidden sm:inline">{t('top.language')}</span>
          </Button>

          <Button variant="ghost" size="icon" onClick={handleLogout} title={t('top.logout')}>
            <LogOut className="h-4 w-4" />
          </Button>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          <Outlet />
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