import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { typeName } from '@/lib/leave';
import { base44 } from '@/api/base44Client';

// Taking over a store that already keeps leave: the hours each person holds are typed in once,
// and the difference is stored as an adjustment so nothing already accrued or used is disturbed.
// Only the platform owner reaches this screen.
export default function LeaveBalancesAdminDialog({ open, onOpenChange, companyId, companyName, onSaved }) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Whatever the store types, kept by person and leave type until it is saved.
  const [edits, setEdits] = useState({});

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const response = await base44.functions
      .invoke('adminLeaveBalances', { company_id: companyId })
      .catch(() => null);
    const payload = response && response.data && !response.data.error ? response.data : null;
    setData(payload);
    setEdits({});
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const staff = (data && data.staff) || [];
  const types = (data && data.types) || [];
  const balances = (data && data.balances) || [];

  const currentFor = (email, key) => {
    const row = balances.find(
      (balance) => balance.employee_email === email && balance.leave_type_key === key
    );
    return row ? Number(row.available_hours) || 0 : 0;
  };
  const valueFor = (email, key) => {
    const cell = `${email}::${key}`;
    return cell in edits ? edits[cell] : String(currentFor(email, key));
  };
  const setValue = (email, key, value) =>
    setEdits((prev) => ({ ...prev, [`${email}::${key}`]: value }));

  const allowed = (type, person) => {
    const list = type.employment_types || [];
    return list.length === 0 || list.includes(person.employment_type);
  };
  const columns = types.filter((type) => staff.some((person) => allowed(type, person)));
  const rows = Object.entries(edits)
    .map(([cell, value]) => {
      const [email, leave_type_key] = cell.split('::');
      return { email, leave_type_key, target_hours: Number(value) };
    })
    .filter((row) => Number.isFinite(row.target_hours));

  const save = async () => {
    if (rows.length === 0) return;
    setSaving(true);
    const response = await base44.functions
      .invoke('adminLeaveBalances', { company_id: companyId, action: 'save', rows })
      .catch(() => null);
    const payload = response && response.data;
    setSaving(false);
    if (!payload || payload.error) {
      toast({
        title: (payload && payload.error) || t('leave.adminSaveFailed'),
        variant: 'destructive'
      });
      return;
    }
    toast({ title: t('leave.adminSaved').replace('{count}', String(rows.length)) });
    await load();
    if (onSaved) onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('leave.adminTitle')}</DialogTitle>
          <DialogDescription>
            {t('leave.adminHint').replace('{company}', companyName || '')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            {t('common.loading')}
          </p>
        ) : staff.length === 0 || columns.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('leave.adminEmpty')}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{t('leave.adminNote')}</p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.employee')}</TableHead>
                    {columns.map((type) => (
                      <TableHead key={type.key} className="text-right">
                        {type.emoji ? `${type.emoji} ` : ''}
                        {typeName(type, lang)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((person) => (
                    <TableRow key={person.email}>
                      <TableCell className="font-medium">
                        {person.name}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {person.email}
                        </span>
                      </TableCell>
                      {columns.map((type) => (
                        <TableCell key={type.key} className="text-right">
                          {allowed(type, person) ? (
                            <Input
                              type="number"
                              step="0.5"
                              className="ml-auto w-24 text-right"
                              value={valueFor(person.email, type.key)}
                              disabled={saving}
                              onChange={(e) => setValue(person.email, type.key, e.target.value)}
                            />
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                {t('common.close')}
              </Button>
              <Button onClick={save} disabled={saving || rows.length === 0}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {t('leave.adminSave')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}