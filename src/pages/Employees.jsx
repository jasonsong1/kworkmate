import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Pencil, Plus, Search, Send } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import EmployeeDialog from '@/components/EmployeeDialog';
import EmployeeDocumentsDialog from '@/components/EmployeeDocumentsDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { money } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

export default function Employees() {
  const { t } = useI18n();
  const { activeBranch } = useWorkspace();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [docsFor, setDocsFor] = useState(null);

  const load = useCallback(async () => {
    if (!activeBranch) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const query = { branch_id: activeBranch.id };
    if (search.trim()) query.full_name = { $regex: search.trim(), $options: 'i' };
    const list = await base44.entities.EmployeeProfile.filter(query, { sort: '-created_date', limit: 100 });
    setRows(list);
    setLoading(false);
  }, [activeBranch, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setDialogOpen(true);
  };

  return (
    <div>
      <PageHeader
        title={t('employees.title')}
        subtitle={activeBranch ? activeBranch.name : t('employees.subtitle')}
        actions={
          <Button onClick={openCreate} disabled={!activeBranch}>
            <Plus className="mr-2 h-4 w-4" /> {t('employees.add')}
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('common.search')}
              className="pl-9"
            />
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('common.none')}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.name')}</TableHead>
                    <TableHead>{t('employees.number')}</TableHead>
                    <TableHead>{t('common.position')}</TableHead>
                    <TableHead>{t('common.rate')}</TableHead>
                    <TableHead>{t('employees.onboarding')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="font-medium">{row.full_name}</p>
                        <p className="text-xs text-muted-foreground">{row.user_email}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.employee_number || '—'}</TableCell>
                      <TableCell>{row.position || '—'}</TableCell>
                      <TableCell>{row.hourly_rate ? money(row.hourly_rate) : '—'}</TableCell>
                      <TableCell>
                        {row.onboarding_status === 'completed' ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                            {t('employees.completed')}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{t('employees.pending')}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(row)} title={t('common.edit')}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDocsFor(row)}
                            title={t('employees.vault')}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span className="ml-1 text-xs">{(row.docs || []).length}</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title={t('employees.sendOnboarding')}
                            onClick={() => {
                              setEditing(row);
                              setDialogOpen(true);
                            }}
                          >
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EmployeeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        branch={activeBranch}
        employee={editing}
        onSaved={load}
      />
      <EmployeeDocumentsDialog
        open={Boolean(docsFor)}
        onOpenChange={(v) => !v && setDocsFor(null)}
        employee={docsFor}
      />
    </div>
  );
}