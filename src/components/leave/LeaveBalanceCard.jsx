import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import { EMPLOYMENT_KEYS, hoursLabel, typeName } from '@/lib/leave';

// One leave type as the person holding it sees it: what is left to book, and what is waiting,
// already used or still accruing behind it.
export default function LeaveBalanceCard({ balance }) {
  const { t, lang } = useI18n();
  const type = balance.type || {};
  const name = typeName({ name: balance.leave_type_name, name_ko: type.name_ko, key: balance.leave_type_key }, lang);
  const earning = type.accrual_method === 'ordinary_hours';

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {type.emoji ? `${type.emoji} ` : ''}
              {name}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t(type.paid === false ? 'leave.unpaid' : 'leave.paid')} ·{' '}
              {t(EMPLOYMENT_KEYS[type.employment_types?.[0]] || 'leave.emp.casual')}
              {type.grant_enabled ? ` · ${t('leave.allowance')}` : ''}
              {!earning && !type.grant_enabled ? ` · ${t('leave.accrualNone')}` : ''}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-heading text-2xl font-semibold leading-none">{hoursLabel(balance.available_hours)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{t('leave.available')}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-muted/40 py-2.5 text-center text-[11px]">
          <div>
            <p className="text-muted-foreground">{earning ? t('leave.accrued') : t('leave.granted')}</p>
            <p className="font-medium">{hoursLabel(earning ? balance.accrued_hours : balance.granted_hours)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('leave.pending')}</p>
            <p className="font-medium">{hoursLabel(balance.pending_hours)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('leave.used')}</p>
            <p className="font-medium">{hoursLabel(balance.used_hours)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}