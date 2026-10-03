import React, { useState } from 'react';
import { Pencil, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AvailabilityEditDialog from '@/components/roster/AvailabilityEditDialog';
import AvailabilityRequestDialog from '@/components/roster/AvailabilityRequestDialog';
import { useI18n } from '@/lib/i18n';
import { DAYS, isDayAvailable, normalizeAvailability } from '@/lib/bh';

// The availability the team submitted this week, laid out like the roster so a manager can
// line up who is free against the shifts they are about to place.
export default function AvailabilityBoard({ employees, submissions, days, branch, weekStart, canEdit, onSaved }) {
  const { t } = useI18n();
  const [editTarget, setEditTarget] = useState(null);
  const [requestOpen, setRequestOpen] = useState(false);

  const list = Array.isArray(employees) ? employees : [];
  const dayList = days && days.length > 0 ? days : DAYS.map((day) => ({ ...day, date: '' }));

  // Newest submission per person wins, so the list must already be newest first.
  const byEmail = {};
  (submissions || []).forEach((sub) => {
    if (sub.employee_email && !byEmail[sub.employee_email]) byEmail[sub.employee_email] = sub;
  });
  const submitted = list.filter((employee) => byEmail[employee.user_email]).length;

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t('roster.availabilityTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('roster.availabilityHint')}</p>
          </div>
          {canEdit ? (
            <Button variant="outline" onClick={() => setRequestOpen(true)} disabled={list.length === 0}>
              <Send className="mr-2 h-4 w-4" /> {t('roster.requestOne')}
            </Button>
          ) : null}
        </div>
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
                    {canEdit ? <th className="w-28 px-2 py-2" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {list.map((employee) => {
                    const record = byEmail[employee.user_email];
                    const matrix = record ? normalizeAvailability(record.availability) : null;
                    return (
                      <tr key={employee.id}>
                        <td className="sticky left-0 z-10 border-t bg-card px-3 py-2">
                          <p className="text-sm font-medium">{employee.full_name}</p>
                          <p className="flex items-center gap-2 text-xs text-muted-foreground">
                            {employee.position || '—'}
                            {record && record.manager_edited ? (
                              <Badge variant="secondary" className="text-[10px]">
                                {t('roster.managerEdited')}
                              </Badge>
                            ) : null}
                          </p>
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
                        {canEdit ? (
                          <td className="border-t px-2 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditTarget({ employee, record })}
                            >
                              <Pencil className="mr-1.5 h-3.5 w-3.5" />
                              {t('roster.availabilityEdit')}
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>

      <AvailabilityEditDialog
        open={Boolean(editTarget)}
        onOpenChange={(open) => !open && setEditTarget(null)}
        employee={editTarget ? editTarget.employee : null}
        submission={editTarget ? editTarget.record : null}
        branch={branch}
        weekStart={weekStart}
        onSaved={onSaved}
      />
      <AvailabilityRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        employees={list}
        branch={branch}
        onSent={onSaved}
      />
    </Card>
  );
}