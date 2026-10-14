import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

// 최고 관리자(슈퍼어드민) 전용 휴가 잔액 조정 모달 다이얼로그:
// 회사에 소속된 직원들이 보유한 휴가 시간을 직접 입력하여 기존 잔액을 조정값으로 설정합니다.
export default function LeaveBalancesAdminDialog({ open, onOpenChange, companyId, companyName, onSaved }) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // 각 직원 및 휴가 유형별로 관리자가 수정한 목표 시간(target_hours)을 저장하는 상태
  const [edits, setEdits] = useState({});

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const response = await base44.functions.invoke('adminLeaveBalances', { company_id: companyId });
      const payload = response && response.data;
      if (payload && payload.error) {
        toast({ title: payload.error, variant: 'destructive' });
        setData(null);
      } else {
        setData(payload || null);
      }
    } catch (error) {
      toast({
        title: (error && error.message) || '휴가 잔액 정보를 불러오지 못했습니다.',
        variant: 'destructive'
      });
      setData(null);
    } finally {
      setEdits({});
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // 슈퍼어드민 본인은 제외된 회사 소속 일반 직원 목록
  const staff = (data && data.staff) || [];
  const types = (data && data.types) || [];
  const balances = (data && data.balances) || [];

  const currentFor = (email, key) => {
    const row = balances.find(
      (balance) =>
        String(balance.employee_email || '').toLowerCase() === String(email || '').toLowerCase() &&
        balance.leave_type_key === key
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

  // 테이블에 노출할 휴가 유형 열 목록 (어떤 직원이든 대상이 되거나, fallback으로 전체 types 표시)
  const matchingColumns = types.filter((type) => staff.some((person) => allowed(type, person)));
  const columns = matchingColumns.length > 0 ? matchingColumns : types;

  const rows = Object.entries(edits)
    .map(([cell, value]) => {
      const [email, leave_type_key] = cell.split('::');
      return { email, leave_type_key, target_hours: Number(value) };
    })
    .filter((row) => Number.isFinite(row.target_hours));

  const save = async () => {
    if (rows.length === 0) return;
    setSaving(true);
    try {
      const response = await base44.functions.invoke('adminLeaveBalances', {
        company_id: companyId,
        action: 'save',
        rows
      });
      const payload = response && response.data;
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
    } catch (error) {
      toast({
        title: (error && error.message) || t('leave.adminSaveFailed'),
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
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
            <div className="overflow-x-auto rounded-md border">
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
                        <div className="flex items-center gap-2">
                          <span>{person.name}</span>
                          {person.employee_number ? (
                            <Badge variant="outline" className="text-[11px] font-normal">
                              {person.employee_number}
                            </Badge>
                          ) : null}
                          {person.employment_type ? (
                            <span className="text-[11px] text-muted-foreground">
                              ({person.employment_type})
                            </span>
                          ) : null}
                        </div>
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

            <div className="flex justify-end gap-2 pt-2">
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