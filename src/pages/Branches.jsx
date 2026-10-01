import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronRight, Plus, UserCog, Users } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AddBranchDialog from '@/components/AddBranchDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

export default function Branches() {
  const { t } = useI18n();
  const { company, branches, role, activeBranch, selectBranch, reload } = useWorkspace();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [stats, setStats] = useState({});
  const [managerEmail, setManagerEmail] = useState('');
  const [saving, setSaving] = useState(false);

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

  const assignManager = async () => {
    if (!managerEmail.trim() || !activeBranch) return;
    setSaving(true);
    const response = await base44.functions.invoke('manageEmployee', {
      action: 'assign_manager',
      branch_id: activeBranch.id,
      email: managerEmail.trim().toLowerCase()
    });
    setSaving(false);
    if (response.data?.error) {
      toast({ title: response.data.error, variant: 'destructive' });
      return;
    }
    setManagerEmail('');
    await reload();
    toast({ title: response.data?.invited ? 'Manager assigned and invited' : 'Manager assigned' });
  };

  const isAdmin = role === 'company_admin';

  return (
    <div>
      <PageHeader
        title={t('branches.title')}
        subtitle={t('branches.subtitle')}
        actions={
          isAdmin && (
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
              {branches.length === 0 && <p className="py-3 text-sm text-muted-foreground">{t('branches.noBranches')}</p>}
              {branches.map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => selectBranch(branch.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    activeBranch && activeBranch.id === branch.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <span className="text-muted-foreground">└</span>
                  <span className="truncate font-medium">{branch.name}</span>
                  <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" />
                </button>
              ))}
            </div>
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
                  <Badge variant="secondary">{activeBranch.code}</Badge>
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
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <p className="text-sm font-semibold">{t('employees.managers')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(activeBranch.manager_emails || []).length === 0 && (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                  {(activeBranch.manager_emails || []).map((email) => (
                    <Badge key={email} variant="outline">
                      {email}
                    </Badge>
                  ))}
                </div>
                {isAdmin && (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <div className="flex-1">
                      <Label className="sr-only">{t('employees.assignManager')}</Label>
                      <Input
                        value={managerEmail}
                        onChange={(e) => setManagerEmail(e.target.value)}
                        placeholder="manager@company.com.au"
                      />
                    </div>
                    <Button onClick={assignManager} disabled={saving || !managerEmail.trim()}>
                      {t('employees.assignManager')}
                    </Button>
                  </div>
                )}
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

      <AddBranchDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}