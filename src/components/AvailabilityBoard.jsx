import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n';
import { DAYS, isDayAvailable, normalizeAvailability } from '@/lib/bh';

// The availability the team submitted this week, laid out like the roster so a manager can
// line up who is free against the shifts they are about to place.
export default function AvailabilityBoard({ employees, submissions, days }) {
  const { t } = useI18n();
  const list = Array.isArray(employees) ? employees : [];
  const dayList = days && days.length > 0 ? days : DAYS.map((day) => ({ ...day, date: '' }));

  // Newest submission per person wins, so the list must already be newest first.
  const byEmail = {};
  (submissions || []).forEach((sub) => {
    if (sub.employee_email && !byEmail[sub.employee_email]) {
      byEmail[sub.employee_email] = normalizeAvailability(sub.availability);
    }
  });
  const submitted = list.filter((employee) => byEmail[employee.user_email]).length;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">{t('roster.availabilityTitle')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('roster.availabilityHint')}</p>
      </CardHeader>
      <CardContent>
        {list.length === 0 || submitted === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {list.length === 0 ? t('common.none') : t('roster.availabilityNone')}
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              {t('roster.availabilityCount').replace('{done}', submitted).replace('{total}', list.length)}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 w-44 bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      {t('common.employee')}
                    </th>
                    {dayList.map((day) => (
                      <th key={day.key} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                        <div>{day.short}</div>
                        {day.date ? <div className="font-normal text-[11px]">{day.date.slice(5)}</div> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((employee) => {
                    const matrix = byEmail[employee.user_email];
                    return (
                      <tr key={employee.id}>
                        <td className="sticky left-0 z-10 border-t bg-card px-3 py-2">
                          <p className="text-sm font-medium">{employee.full_name}</p>
                          <p className="text-xs text-muted-foreground">{employee.position || '—'}</p>
                        </td>
                        {dayList.map((day) => {
                          const entry = matrix ? matrix[day.key] : null;
                          const ok = Boolean(matrix) && isDayAvailable(entry);
                          return (
                            <td key={day.key} className="border-t px-2 py-2 text-center text-xs">
                              {ok ? (
                                <span className="font-medium tabular-nums">
                                  {entry.from}–{entry.to}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/50">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}