import React, { useEffect, useState } from 'react';
import { Building2, Loader2, Pencil, Plus, Power, RotateCcw, Search } from 'lucide-react';
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
import AddCompanyDialog from '@/components/company/AddCompanyDialog';
import EditCompanyDialog from '@/components/platform/EditCompanyDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every company on the platform, for the app owner only. A company is never removed: it is
// closed down, which keeps all of its records and can be undone from the second tab.
export default function CompanyManager() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { company, switchCompany, reload } = useWorkspace();
  const [tab, setTab] = useState('active');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Searching happens on the server, so this keeps working with any number of companies.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const term = query.trim();
      const filter = tab === 'active' ? { deactivated: { $ne: true } } : { deactivated: true };
      if (term) filter.name = { $regex: escapeRegex(term), $options: 'i' };
      const page = await base44.entities.Company.filter(filter, { sort: 'name', limit: 50 });
      if (cancelled) return;
      setRows(page.items || []);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, tab, refreshIndex]);

  const enter = async (item) => {
    if (company && company.id === item.id) return;
    setBusyId(item.id);
    try {
      await switchCompany(item.id);
      toast({ title: t('company.switched').replace('{name}', item.name) });
    } catch (error) {
      toast({ title: error.message, variant: 'destructive' });
    } finally {
      setBusyId('');
    }
  };

  const setOpen = async (item, next) => {
    setBusyId(item.id);
    await base44.entities.Company.update(item.id, {
      deactivated: next === 'deactivated',
      deactivated_at: next === 'deactivated' ? new Date().toISOString() : ''
    });
    setBusyId('');
    setConfirm(null);
    setRows((prev) => prev.filter((row) => row.id !== item.id));
    toast({ title: next === 'deactivated' ? t('company.deactivated') : t('company.reactivated') });
    if (company && company.id === item.id) await reload();
  };

  // The corrected name and ABN show straight away, and the back office follows when the company
  // being edited is the one currently open.
  const saved = async (next) => {
    setRows((prev) => prev.map((row) => (row.id === next.id ? { ...row, name: next.name, abn: next.abn } : row)));
    if (company && company.id === next.id) await reload();
  };

  const closing = Boolean(confirm && !confirm.deactivated);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
            {t('company.manage')}
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> {t('company.new')}
            </Button>
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t('company.manageHint')}</p>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab} className="mb-4">
            <TabsList>
              <TabsTrigger value="active">{t('company.tabActive')}</TabsTrigger>
              <TabsTrigger value="deactivated">{t('company.tabInactive')}</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('company.search')}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {tab === 'active' ? t('company.none') : t('company.noneInactive')}
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{item.name}</span>
                      {company && company.id === item.id && (
                        <Badge variant="outline">{t('company.current')}</Badge>
                      )}
                      {item.deactivated && <Badge variant="secondary">{t('company.tabInactive')}</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{item.abn || item.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === item.id}
                      onClick={() => enter(item)}
                    >
                      {busyId === item.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      {t('company.open')}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === item.id} onClick={() => setEditRow(item)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> {t('company.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === item.id}
                      onClick={() => setConfirm(item)}
                    >
                      {item.deactivated ? (
                        <>
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> {t('company.reactivate')}
                        </>
                      ) : (
                        <>
                          <Power className="mr-1.5 h-3.5 w-3.5 text-destructive" /> {t('company.deactivate')}
                        </>
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddCompanyDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => setRefreshIndex((p) => p + 1)}
      />

      <EditCompanyDialog
        company={editRow}
        open={Boolean(editRow)}
        onOpenChange={(next) => !next && setEditRow(null)}
        onSaved={saved}
      />

      <AlertDialog open={Boolean(confirm)} onOpenChange={(next) => !next && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {closing ? t('company.deactivateTitle') : t('company.reactivateTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(closing ? 'company.deactivateHint' : 'company.reactivateHint').replace(
                '{name}',
                (confirm && confirm.name) || ''
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setOpen(confirm, closing ? 'deactivated' : 'active')}
              disabled={busyId === (confirm && confirm.id)}
            >
              {closing ? t('company.deactivate') : t('company.reactivate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}