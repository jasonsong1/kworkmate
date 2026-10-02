import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronRight, Plus, Search, UserCog, Users, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import AddBranchDialog from '@/components/AddBranchDialog';
import RosterScheduleCard from '@/components/RosterScheduleCard';
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
  const [managers, setManagers] = useState([]);
  const [managerQuery, setManagerQuery] = useState('');
  const [branchStaff, setBranchStaff] = useState([]);
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

  useEffect(() => {
    const emails = (activeBranch && activeBranch.manager_emails) || [];
    if (emails.length === 0) {
      setManagers([]);
      return;
    }
    let cancelled = false;
    base44.entities.EmployeeProfile
      .filter({ user_email: { $in: emails } }, { limit: 20 })
      .then((page) => {
        if (!cancelled) setManagers(page.items || []);
      })
      .catch(() => {
        if (!cancelled) setManagers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBranch]);

  useEffect(() => {
    if (!activeBranch) {
      setBranchStaff([]);
      return;
    }
    let cancelled = false;
    base44.entities.EmployeeProfile
      .filter({ branch_id: activeBranch.id }, { sort: 'full_name', limit: 200 })
      .then((page) => {
        if (!cancelled) setBranchStaff(page.items || []);
      })
      .catch(() => {
        if (!cancelled) setBranchStaff([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBranch]);

  const assignManager = async (staff) => {
    if (!staff || !activeBranch || !staff.user_email) return;
    setSaving(true);
    const response = await base44.functions.invoke('manageEmployee', {
      action: 'assign_manager',
      branch_id: activeBranch.id,
      email: staff.user_email
    });
    setSaving(false);
    if (response.data?.error) {
      toast({ title: response.data.error, variant: 'destructive' });
      return;
    }
    setManagerQuery('');
    await reload();
    toast({ title: response.data?.invited ? 'Manager assigned and invited' : 'Manager assigned' });
  };

  const removeManager = async (email) => {
    if (!activeBranch || !window.confirm(t('employees.removeManagerConfirm'))) return;
    setSaving(true);
    const response = await base44.functions.invoke('manageEmployee', {
      action: 'remove_manager',
      branch_id: activeBranch.id,
      email
    });
    setSaving(false);
    if (response.data?.error) {
      toast({ title: response.data.error, variant: 'destructive' });
      return;
    }
    await reload();
    toast({ title: t('employees.managerRemoved') });
  };

  const managerMatches = (() => {
    const term = managerQuery.trim().toLowerCase();
    if (!term) return [];
    const current = activeBranch ? activeBranch.manager_emails || [] : [];
    return branchStaff
      .filter((staff) => staff.user_email && !current.includes(staff.user_email))
      .filter(
        (staff) =>
          String(staff.full_name || '').toLowerCase().includes(term) ||
          String(staff.employee_number || '').toLowerCase().includes(term)
      )
      .slice(0, 8);
  })();

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
                  {(activeBranch.manager_emails || []).map((email) => {
                    const profile = managers.find((m) => m.user_email === email);
                    const label = profile
                      ? `${profile.full_name}${profile.phone ? ` · ${profile.phone}` : ''}`
                      : email;
                    if (!isAdmin) return <Badge key={email} variant="outline">{label}</Badge>;
                    return (
                      <button
                        key={email}
                        type="button"
                        disabled={saving}
                        onClick={() => removeManager(email)}
                        title={t('employees.removeManagerConfirm')}
                        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors hover:border-destructive hover:text-destructive disabled:opacity-50"
                      >
                        {label}
                        <X className="h-3 w-3" />
                      </button>
                    );
                  })}
                </div>
                {isAdmin && (
                  <div className="mt-4 space-y-2">
                    <Label>{t('employees.assignManager')}</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={managerQuery}
                        onChange={(e) => setManagerQuery(e.target.value)}
                        placeholder={t('employees.managerSearch')}
                        className="pl-9"
                      />
                    </div>
                    {managerQuery.trim().length > 0 && (
                      <div className="max-h-56 divide-y overflow-y-auto rounded-lg border">
                        {managerMatches.length === 0 ? (
                          <p className="px-3 py-3 text-sm text-muted-foreground">{t('common.none')}</p>
                        ) : (
                          managerMatches.map((staff) => (
                            <button
                              key={staff.id}
                              onClick={() => assignManager(staff)}
                              disabled={saving}
                              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                            >
                              <span className="min-w-0">
                                <span className="font-medium">{staff.full_name}</span>
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {[staff.position, staff.phone].filter(Boolean).join(' · ')}
                                </span>
                              </span>
                              <Plus className="h-3.5 w-3.5 shrink-0" />
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <RosterScheduleCard branch={activeBranch} />
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