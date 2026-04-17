// Period-range helpers that honor user-defined cycle start days.
// monthStartDay: 1..31 (cycles spanning short months clamp to the last day)
// weekStartDay:  0..6 (0 = Sunday, 6 = Saturday)

const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Returns the inclusive [start, end] of the current month cycle containing `now`.
export function getMonthRange(now: Date, monthStartDay: number): [Date, Date] {
  const clampStart = (year: number, month: number) => {
    const dim = daysInMonth(year, month);
    return new Date(year, month, Math.min(monthStartDay, dim));
  };

  const thisCycleStart = clampStart(now.getFullYear(), now.getMonth());
  let cycleStart: Date;
  if (now >= thisCycleStart) {
    cycleStart = thisCycleStart;
  } else {
    const prevMonth = now.getMonth() - 1;
    cycleStart = clampStart(now.getFullYear(), prevMonth);
  }

  const nextCycleStart = clampStart(cycleStart.getFullYear(), cycleStart.getMonth() + 1);
  const cycleEnd = endOfDay(new Date(nextCycleStart.getFullYear(), nextCycleStart.getMonth(), nextCycleStart.getDate() - 1));
  return [cycleStart, cycleEnd];
}

// Returns the inclusive [start, end] of the current week containing `now`.
export function getWeekRange(now: Date, weekStartDay: number): [Date, Date] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = (today.getDay() - weekStartDay + 7) % 7;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff);
  const end = endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));
  return [start, end];
}

export function getDayRange(now: Date): [Date, Date] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return [start, endOfDay(start)];
}
