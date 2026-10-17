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
            {days.map((day) => {
              const isClosed = day.isOpen === false;
              return (
                <th
                  key={day.date}
                  className={`px-2 py-2 text-center text-xs font-medium text-muted-foreground transition-colors ${
                    isClosed ? 'bg-muted/30 dark:bg-muted/10 opacity-75' : ''
                  }`}
                >
                  <div className={isClosed ? 'text-muted-foreground/80' : ''}>{day.short}</div>
                  <div className="font-normal text-[11px]">{day.date.slice(5)}</div>
                  {isClosed ? (
                    <span className="mt-1 inline-block rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
                      {t('roster.closed') || '휴무'}
                    </span>
                  ) : (
                    (missingFor ? missingFor(day.date) : []).map((item) => (
                      <span
                        key={item.position}
                        className="mt-1 block rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive"
                      >
                        {item.position} {t('roster.unassigned')}{item.missing}
                      </span>
                    ))
                  )}
                </th>
              );
            })}
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
              {days.map((day) => {
                const isClosed = day.isOpen === false;
                const isLeave = leave(employee.user_email, day.date);
                const dayShifts = shiftsFor(employee.user_email, day.date);

                return (
                  <td
                    key={`${employee.id || employee.user_email}-${day.date}`}
                    className={`border-t p-1 transition-colors ${
                      isClosed
                        ? 'bg-muted/20 dark:bg-muted/5'
                        : isLeave
                        ? 'bg-amber-50/50 dark:bg-amber-950/20'
                        : ''
                    }`}
                    onDragOver={canManage ? (event) => event.preventDefault() : undefined}
                    onDrop={
                      canManage && onMoveShift
                        ? () => {
                            // A carried row is not a shift: that drop belongs to the row above.
                            if (dragRow) return;
                            onMoveShift(employee.user_email, day.date, dragId);
                            setDragId('');
                          }
                        : undefined
                    }
                  >
                    <div className="space-y-1">
                      {isLeave ? (
                        <div
                          className="flex items-center justify-center gap-1 rounded-md border border-amber-300 bg-amber-100/90 px-2 py-1.5 text-[11px] font-semibold text-amber-900 shadow-xs dark:border-amber-700/60 dark:bg-amber-950/70 dark:text-amber-200"
                          title={`${employee.full_name || '직원'} 님은 이 날짜에 승인된 휴가 중입니다.`}
                        >
                          <span>🏖️</span>
                          <span>{t('roster.onLeave') || '휴가 중'}</span>
                        </div>
                      ) : null}

                      {dayShifts.map((shift) => (
                        <div
                          key={shift.id}
                          draggable={Boolean(canManage)}
                          onDragStart={canManage ? () => setDragId(shift.id) : undefined}
                          onDragEnd={canManage ? () => setDragId('') : undefined}
                          onClick={canManage && onShiftClick ? () => onShiftClick(shift) : undefined}
                          title={
                            isLeave
                              ? '⚠️ 해당 직원은 이 날짜에 휴가 중입니다! 시프트를 취소하거나 다른 날로 이동하세요.'
                              : canManage
                              ? t('roster.dragHint')
                              : undefined
                          }
                          className={`group rounded-lg border px-2 py-1.5 text-xs ${
                            canManage ? 'cursor-grab' : 'cursor-default'
                          } ${
                            isLeave
                              ? 'border-destructive/60 bg-destructive/10 text-destructive dark:bg-destructive/20 font-medium'
                              : shift.status === 'published'
                              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100'
                              : shift.status === 'saved'
                              ? 'border-sky-200 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100'
                              : 'bg-muted/40 dark:bg-muted/20'
                          }`}
                        >
                          {isLeave && (
                            <div className="mb-0.5 text-[10px] font-bold text-destructive flex items-center gap-1">
                              <span>⚠️</span>
                              <span>휴가 중 배정됨</span>
                            </div>
                          )}
                          <span className="font-medium">
                            {shift.start_time}–{shift.end_time}
                          </span>
                          {shift.position ? (
                            <p className="truncate text-[11px] text-muted-foreground">{shift.position}</p>
                          ) : null}
                        </div>
                      ))}

                      {canManage && onAddShift && !isLeave && !isClosed ? (
                        <button
                          type="button"
                          onClick={() => onAddShift(employee, day.date)}
                          className="w-full rounded-lg border border-dashed px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                        >
                          +
                        </button>
                      ) : null}

                      {/* 휴가 중일 때는 + 버튼 대신 '배정 불가' 안내를 보여줌 */}
                      {canManage && isLeave ? (
                        <div
                          title={`${employee.full_name || '직원'} 님은 이 날짜에 승인된 휴가 기간입니다.`}
                          className="w-full select-none rounded-md border border-dashed border-amber-300/60 bg-amber-50/40 px-1 py-0.5 text-center text-[10px] text-amber-700/70 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-400/70"
                        >
                          배정 불가
                        </div>
                      ) : null}
                    </div>
                  </td>
                );
              })}
              <td className="border-t border-l px-3 py-3 text-right font-mono text-xs">
                {hoursFor(employee.user_email) > 0 ? hoursValue(hoursFor(employee.user_email)) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>);

}