// Month view: a Monday-start `role="grid"` table. The selected day's button
// is the one tab stop (roving tabindex); arrows move by day/week, Home/End
// jump to the week's edges, PageUp/PageDown to the neighbouring month.
// Each cell lists up to MAX_CHIPS events as chips (click → detail sheet)
// and a muted "ride" line for synced activities.
import React, { useEffect, useRef } from 'react';
import { addDaysStr, monthMatrix, sameDayNextMonth, formatKm } from '@bikelab/shared/calendar';
import { eventColor } from './copy';
import styles from './MonthGrid.module.css';

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_CHIPS = 3;

const KEY_STEPS = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

export default function MonthGrid({ date, today, daysByDate, onSelectDate, onOpenEvent, onOpenActivity }) {
  const rows = monthMatrix(date);
  const buttonRefs = useRef(new Map());
  // Set by a keyboard move so focus follows the selection after the
  // re-render; a mouse click leaves focus where the browser put it.
  const pendingFocus = useRef(null);

  useEffect(() => {
    if (pendingFocus.current !== date) return;
    pendingFocus.current = null;
    buttonRefs.current.get(date)?.focus();
  }, [date]);

  const moveTo = (next) => {
    pendingFocus.current = next;
    onSelectDate(next);
  };

  const handleKeyDown = (e, cellDate) => {
    let next = null;
    if (e.key in KEY_STEPS) next = addDaysStr(cellDate, KEY_STEPS[e.key]);
    else if (e.key === 'Home') next = addDaysStr(cellDate, -((parseWeekday(cellDate) + 6) % 7));
    else if (e.key === 'End') next = addDaysStr(cellDate, 6 - ((parseWeekday(cellDate) + 6) % 7));
    else if (e.key === 'PageUp') next = sameDayNextMonth(cellDate, -1);
    else if (e.key === 'PageDown') next = sameDayNextMonth(cellDate, 1);
    if (!next) return;
    e.preventDefault();
    moveTo(next);
  };

  return (
    <table className={styles.grid} role="grid" aria-label="Month">
      <thead>
        <tr>
          {WEEKDAY_HEADERS.map((label) => (
            <th key={label} scope="col" className={styles.weekday}>
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[0].date}>
            {row.map((cell) => {
              const group = daysByDate.get(cell.date);
              const events = group?.events ?? [];
              const activities = group?.activities ?? [];
              const isSelected = cell.date === date;
              const isToday = cell.date === today;
              const overflow = events.length - MAX_CHIPS;
              return (
                <td
                  key={cell.date}
                  className={[
                    styles.cell,
                    cell.inMonth ? null : styles.outside,
                    isSelected ? styles.selected : null,
                    isToday ? styles.today : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-selected={isSelected}
                  data-testid={`calendar-day-${cell.date}`}
                >
                  <button
                    type="button"
                    ref={(node) => {
                      if (node) buttonRefs.current.set(cell.date, node);
                      else buttonRefs.current.delete(cell.date);
                    }}
                    className={styles.dayBtn}
                    tabIndex={isSelected ? 0 : -1}
                    aria-label={`${cell.date}${isToday ? ', today' : ''}`}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => onSelectDate(cell.date)}
                    onKeyDown={(e) => handleKeyDown(e, cell.date)}
                  >
                    {Number(cell.date.slice(8, 10))}
                  </button>
                  <div className={styles.items}>
                    {activities.map((act) => (
                      <button
                        key={`act-${act.id}`}
                        type="button"
                        className={styles.activity}
                        tabIndex={-1}
                        title={act.name}
                        onClick={() => onOpenActivity(act)}
                      >
                        <span className={styles.check} aria-hidden="true">
                          ✓
                        </span>
                        <span className={styles.chipText}>
                          {formatKm(act.distance)} km · {act.name}
                        </span>
                      </button>
                    ))}
                    {events.slice(0, MAX_CHIPS).map((ev) => (
                      <button
                        key={`ev-${ev.id}`}
                        type="button"
                        className={[styles.chip, ev.completed ? styles.chipDone : null].filter(Boolean).join(' ')}
                        style={{ '--chip-color': eventColor(ev.type) }}
                        tabIndex={-1}
                        title={ev.title}
                        onClick={() => onOpenEvent(ev)}
                      >
                        <span className={styles.chipText}>{ev.title}</span>
                      </button>
                    ))}
                    {overflow > 0 && (
                      <button
                        type="button"
                        className={styles.more}
                        tabIndex={-1}
                        onClick={() => onSelectDate(cell.date)}
                      >
                        +{overflow} more
                      </button>
                    )}
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 0 = Sunday .. 6 = Saturday, from a local date string.
function parseWeekday(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getDay();
}
