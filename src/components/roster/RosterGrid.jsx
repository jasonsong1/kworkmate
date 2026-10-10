import React, { useState } from 'react';
import { GripVertical } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { hoursValue, shiftHours } from '@/lib/bh';

// The week at a glance: one row per person, one column per day, and the hours each person has
// been given for the week on the right, breaks already taken out. A manager's copy is the working
// one — a shift is dragged to move it, opened to change its hours, and added from the day's own
// plus, while the grip beside a name lifts that whole row onto another line — and the crew's copy
// is the same table to read.
export default function RosterGrid({
  days,
  employees,
  shifts,
  canManage,
  onShiftClick,
  onAddShift,
  onMoveShift,
  onReorder,
  onLeaveFor,
  missingFor
}) {
  const { t } = useI18n();
  const [dragId, setDragId] = useState('');
  // The row being carried. Kept apart from a dragged shift, so a drop on a day cell is never
  // mistaken for a row move and the other way round.
  const [dragRow, setDragRow] = useState('');

  const shiftsFor = (email, date) => (shifts || []).filter((shift) => shift.employee_email === email && shift.date === date);
  const hoursFor = (email) =>
    (shifts || []).filter((shift) => shift.employee_email === email).reduce((sum, shift) => sum + shiftHours(shift), 0);
  const leave = (email, date) => (onLeaveFor ? onLeaveFor(email, date) : false);
  const canReorder = Boolean(canManage && onReorder);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-44 bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
              {t('common.employee')}
            </th>
            {days.map((day) => (
              <th key={day.date} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                <div>{day.short}</div>
                <div className="font-normal text-[11px]">{day.date.slice(5)}</div>
                {/* What the last build could not fill, one line per position, so the day itself
                    says which seat is open and by how many. */}
                {(missingFor ? missingFor(day.date) : []).map((item) => (
                  <span
                    key={item.position}
                    className="mt-1 block rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive"
                  >
                    {item.position} {t('roster.unassigned')}{item.missing}
                  </span>
                ))}
              </th>
            ))}
            <th className="w-20 border-l px-2 py-2 text-right text-xs font-medium text-muted-foreground">
              {t('roster.totalHours')}
            </th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr
              key={employee.id || employee.user_email}
              className={`align-top ${dragRow === employee.user_email ? 'opacity-50' : ''}`}
              onDragOver={
                canReorder ?
                (event) => {
                  if (dragRow) event.preventDefault();
                } :
                undefined
              }
              onDrop={
                canReorder ?
                (event) => {
                  if (!dragRow) return;
                  event.preventDefault();
                  onReorder(dragRow, employee.user_email);
                  setDragRow('');
                } :
                undefined
              }
            >
              <td className="sticky left-0 z-10 border-t bg-card px-3 py-3">
                <div className="flex items-start gap-1.5">
                  {canReorder ? (
                    <button
                      type="button"
                      draggable
                      onDragStart={() => setDragRow(employee.user_email)}
                      onDragEnd={() => setDragRow('')}
                      title={t('roster.dragRowHint')}
                      aria-label={t('roster.dragRowHint')}
                      className="mt-0.5 cursor-grab text-muted-foreground"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  ) : null}
                  <div>
                    <p className="text-sm font-medium">{employee.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[employee.position, employee.secondary_position, ...(employee.extra_positions || [])].
                      filter(Boolean).
                      join(' · ') || '—'}
                    </p>
                  </div>
                </div>
              </td>
              {days.map((day) => (
                <td
                  key={`${employee.id || employee.user_email}-${day.date}`}
                  className="border-t p-1"
                  onDragOver={canManage ? (event) => event.preventDefault() : undefined}
                  onDrop={
                    canManage && onMoveShift ?
                    () => {
                      // A carried row is not a shift: that drop belongs to the row above.
                      if (dragRow) return;
                      onMoveShift(employee.user_email, day.date, dragId);
                      setDragId('');
                    } :
                    undefined
                  }
                >
                  <div className="space-y-1">
                    {leave(employee.user_email, day.date) ?
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                        {t('roster.onLeave')}
                      </div> :
                    null}
                    {shiftsFor(employee.user_email, day.date).map((shift) =>
                    <div
                      key={shift.id}
                      draggable={Boolean(canManage)}
                      onDragStart={canManage ? () => setDragId(shift.id) : undefined}
                      onDragEnd={canManage ? () => setDragId('') : undefined}
                      onClick={canManage && onShiftClick ? () => onShiftClick(shift) : undefined}
                      title={canManage ? t('roster.dragHint') : undefined}
                      className={`group rounded-lg border px-2 py-1.5 text-xs ${
                      canManage ? 'cursor-grab' : 'cursor-default'} ${
                      shift.status === 'published' ?
                      'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100' :
                      shift.status === 'saved' ?
                      'border-sky-200 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100' :
                      'bg-muted/40 dark:bg-muted/20'}`}>

                        <span className="font-medium">
                          {shift.start_time}–{shift.end_time}
                        </span>
                        {shift.position ?
                      <p className="truncate text-[11px] text-muted-foreground">{shift.position}</p> :
                      null}
                      </div>
                    )}
                    {canManage && onAddShift && !leave(employee.user_email, day.date) ?
                    <button
                      onClick={() => onAddShift(employee, day.date)}
                      className="w-full rounded-lg border border-dashed px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">

                        +
                      </button> :
                    null}
                  </div>
                </td>
              ))}
              <td className="border-t border-l px-3 py-3 text-right font-mono text-xs">
                {hoursFor(employee.user_email) > 0 ? hoursValue(hoursFor(employee.user_email)) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>);

}