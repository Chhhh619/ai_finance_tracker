import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface CalendarProps {
  selected?: Date | null;
  onSelect: (date: Date) => void;
  /** Dates that have transactions — shown with a dot indicator */
  activeDates?: Set<string>;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Calendar({ selected, onSelect, activeDates }: CalendarProps) {
  const today = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(selected ?? today);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1));
  const goToday = () => {
    setViewMonth(new Date());
    onSelect(new Date());
  };

  // Build grid: leading blanks + days
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="bg-white rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation">
          <ChevronLeft size={18} className="text-gray-500" />
        </button>
        <span className="text-[15px] font-semibold">{MONTHS[month]} {year}</span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation">
          <ChevronRight size={18} className="text-gray-500" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 px-2">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 px-2 pb-3">
        {cells.map((day, i) => {
          if (day === null) return <div key={`blank-${i}`} />;

          const cellDate = new Date(year, month, day);
          const isToday = isSameDay(cellDate, today);
          const isSelected = selected ? isSameDay(cellDate, selected) : false;
          const isFuture = cellDate > today;
          const hasActivity = activeDates?.has(toKey(cellDate));

          return (
            <button
              key={day}
              onClick={() => onSelect(cellDate)}
              disabled={isFuture}
              className={`relative flex flex-col items-center justify-center h-10 rounded-xl text-sm font-medium transition-all touch-manipulation ${
                isSelected
                  ? "bg-[#4169e1] text-white shadow-md shadow-[#4169e1]/20"
                  : isToday
                    ? "bg-[#4169e1]/10 text-[#4169e1]"
                    : isFuture
                      ? "text-gray-200"
                      : "text-gray-700 active:bg-gray-100"
              }`}
            >
              {day}
              {hasActivity && !isSelected && (
                <div className="absolute bottom-1 w-1 h-1 rounded-full bg-[#4169e1]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Go to today */}
      <div className="px-3 pb-3">
        <button
          onClick={goToday}
          className="w-full py-2.5 bg-gray-50 rounded-xl text-sm font-medium text-gray-600 active:bg-gray-100 transition-colors touch-manipulation"
        >
          Go to Today
        </button>
      </div>
    </div>
  );
}

export { toKey };
