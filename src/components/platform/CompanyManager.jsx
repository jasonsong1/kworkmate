import React, { useEffect, useState } from 'react';
import { Building2, Loader2, Plus, Search, Trash2 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every company on the platform, for the app owner only: step into one, add a new one, or
// remove one. Adding and removing companies used to sit behind the company switcher.
export default function CompanyManager() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { company, switchCompany, reload } = useWorkspace();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busyId, setBusyId] = useState('');

  // Searching happens on the server, so this keeps working with any number of companies.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const term = query.trim();
      const filter = term ? { name: { $regex: escapeRegex(term), $options: 'i' } } : {};
      const page = await base44.entities.Company.filter(filter, { sort: 'name', limit: 50 });
      if (cancelled) return;
      setRows(page.items || []);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

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

  const remove = async (item) => {
    setBusyId(item.id);
    await base44.entities.Company.delete(item.id);
    setBusyId('');
    setConfirm(null);
    setRows((prev) => prev.filter((row) => row.id !== item.id));
    toast({ title: t('company.deleted') });
    // Removing the company the workspace is standing in leaves nothing to stand on.
    if (company && company.id === item.id) await reload();
  };

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
            <p className="py-10 text-center text-sm text-muted-foreground">{t('company.none')}</p>
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
                    <Button
                      size="sm"
                      variant="ghost"
                      title={t('common.delete')}
                      disabled={busyId === item.id}
                      onClick={() => setConfirm(item)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AddCompanyDialog open={addOpen} onOpenChange={setAddOpen} />

      <AlertDialog open={Boolean(confirm)} onOpenChange={(next) => !next && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('company.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('company.deleteHint').replace('{name}', (confirm && confirm.name) || '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove(confirm)} disabled={busyId === (confirm && confirm.id)}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}