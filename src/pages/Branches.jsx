import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronRight, Plus, Power, UserCog, Users } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import PageHeader from '@/components/PageHeader';
import AddBranchDialog from '@/components/AddBranchDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

export default function Branches() {
  const { t } = useI18n();
  const { company, branches, role, activeBranch, selectBranch, reload, feature } = useWorkspace();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [stats, setStats] = useState({});
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!activeBranch) return;
    let cancelled = false;
    const load = async () => {
      const [staff, openJobs, applicants] = await Promise.all([
        base44.entities.EmployeeProfile.count({ branch_id: activeBranch.id }).catch(() => 0),
        base44.entities.Job.count({ branch_id: activeBranch.id, status: 'open' }).catch(() => 0),
        base44.entities.Applicant.count({ branch_id: activeBranch.id }).catch(() => 0)
      ]);
      if (!cancelled) setStats({ staff, openJobs, applicants });
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [activeBranch]);

  const isAdmin = role === 'company_admin';
  // A second store is part of the top package only, so the button is never offered without it.
  const canAddBranch = isAdmin && feature('multi_branch');
  // Staff and managers never see a deactivated branch, so this only ever hides anything for
  // the company admin who can bring it back.
  const visibleBranches = showInactive ? branches : branches.filter((branch) => branch.is_active !== false);

  const setBranchActive = async (next) => {
    if (!activeBranch) return;
    setSaving(true);
    await base44.entities.Branch.update(activeBranch.id, { is_active: next });
    await reload();
    setSaving(false);
    toast({ title: next ? t('branches.activated') : t('branches.deactivated') });
  };

  return (
    <div>
      <PageHeader
        title={t('branches.title')}
        subtitle={t('branches.subtitle')}
        actions={
          canAddBranch && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> {t('branches.add')}
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm font-semibold">
              <Building2 className="h-4 w-4" />
              {company ? company.name : t('common.company')}
            </div>
            <div className="mt-1 space-y-1 pl-3">
              {visibleBranches.length === 0 && (
                <p className="py-3 text-sm text-muted-foreground">{t('branches.noBranches')}</p>
              )}
              {visibleBranches.map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => selectBranch(branch.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    activeBranch && activeBranch.id === branch.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted'
                  } ${branch.is_active === false ? 'opacity-60' : ''}`}
                >
                  <span className="text-muted-foreground">└</span>
                  <span className="truncate font-medium">{branch.name}</span>
                  {branch.is_active === false && (
                    <Badge variant="secondary" className="text-[10px]">
                      {t('branches.inactive')}
                    </Badge>
                  )}
                  <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" />
                </button>
              ))}
            </div>
            {isAdmin && branches.some((branch) => branch.is_active === false) && (
              <label className="mt-3 flex cursor-pointer items-center gap-2 pl-3 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                {t('branches.showInactive')}
              </label>
            )}
          </CardContent>
        </Card>

        {activeBranch ? (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{activeBranch.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {[activeBranch.address, activeBranch.suburb, activeBranch.state, activeBranch.postcode]
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeBranch.is_active === false && (
                      <Badge variant="secondary">{t('branches.inactive')}</Badge>
                    )}
                    <Badge variant="secondary">{activeBranch.code}</Badge>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t('dashboard.staff')}</p>
                    <p className="text-xl font-semibold">{stats.staff ?? '—'}</p>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t('dashboard.openJobs')}</p>
                    <p className="text-xl font-semibold">{stats.openJobs ?? '—'}</p>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{t('dashboard.applicants')}</p>
                    <p className="text-xl font-semibold">{stats.applicants ?? '—'}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="outline" asChild>
                    <Link to={`/property?branch=${activeBranch.id}`}>
                      <UserCog className="mr-2 h-4 w-4" /> {t('branches.property')}
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/employees">
                      <Users className="mr-2 h-4 w-4" /> {t('employees.title')}
                    </Link>
                  </Button>
                  {isAdmin && activeBranch.is_active !== false && (
                    <Button variant="outline" onClick={() => setConfirmOpen(true)}>
                      <Power className="mr-2 h-4 w-4" /> {t('branches.deactivate')}
                    </Button>
                  )}
                  {isAdmin && activeBranch.is_active === false && (
                    <Button onClick={() => setBranchActive(true)} disabled={saving}>
                      <Power className="mr-2 h-4 w-4" /> {t('branches.activate')}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

          </div>
        ) : (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              {t('branches.noBranches')}
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('branches.deactivateTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('branches.deactivateHint')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                setBranchActive(false);
              }}
            >
              {t('branches.deactivate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddBranchDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}