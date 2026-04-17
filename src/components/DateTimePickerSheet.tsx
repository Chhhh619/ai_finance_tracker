import { X } from "lucide-react";
import BottomSheet from "./BottomSheet";
import Calendar from "./Calendar";

type Props = {
  open: boolean;
  onClose: () => void;
  value: Date;
  onChange: (next: Date) => void;
};

export default function DateTimePickerSheet({ open, onClose, value, onChange }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Date & Time</h2>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
          <X size={18} />
        </button>
      </div>

      <Calendar
        selected={value}
        onSelect={(d) => {
          const next = new Date(value);
          next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
          onChange(next);
        }}
      />

      <div className="mt-4 flex items-center justify-between gap-3 px-1">
        <span className="text-sm font-medium text-gray-600">Time</span>
        <div className="flex items-center gap-2">
          <input
            type="number" min={0} max={23} inputMode="numeric"
            value={String(value.getHours()).padStart(2, "0")}
            onChange={(e) => {
              const h = Math.max(0, Math.min(23, parseInt(e.target.value || "0", 10)));
              const next = new Date(value);
              next.setHours(h);
              onChange(next);
            }}
            className="w-14 h-11 text-center bg-gray-50 rounded-lg text-base font-semibold outline-none focus:ring-2 focus:ring-[#4169e1]/20"
          />
          <span className="text-base font-semibold text-gray-400">:</span>
          <input
            type="number" min={0} max={59} inputMode="numeric"
            value={String(value.getMinutes()).padStart(2, "0")}
            onChange={(e) => {
              const m = Math.max(0, Math.min(59, parseInt(e.target.value || "0", 10)));
              const next = new Date(value);
              next.setMinutes(m);
              onChange(next);
            }}
            className="w-14 h-11 text-center bg-gray-50 rounded-lg text-base font-semibold outline-none focus:ring-2 focus:ring-[#4169e1]/20"
          />
        </div>
      </div>

      <button
        onClick={onClose}
        className="w-full mt-4 h-11 bg-[#4169e1] text-white rounded-xl text-sm font-medium active:bg-[#3151c1] transition-colors touch-manipulation"
      >
        Done
      </button>
    </BottomSheet>
  );
}
