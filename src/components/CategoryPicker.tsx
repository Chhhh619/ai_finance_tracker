import { X } from "lucide-react";
import BottomSheet from "./BottomSheet";
import type { Category } from "../types";

interface CategoryPickerProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  selected: string;
  onSelect: (id: string) => void;
}

export default function CategoryPicker({ open, onClose, categories, selected, onSelect }: CategoryPickerProps) {
  const sorted = [...categories].sort((a, b) => {
    if (a.name.toLowerCase() === "others") return 1;
    if (b.name.toLowerCase() === "others") return -1;
    return 0;
  });

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Category</h2>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
          <X size={18} />
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto space-y-1.5">
        {sorted.map((c) => (
          <button
            key={c.id}
            onClick={() => { onSelect(c.id); onClose(); }}
            className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all touch-manipulation ${
              selected === c.id
                ? "bg-[#4169e1] text-white"
                : "bg-gray-50 text-gray-700 active:bg-gray-100"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                selected === c.id ? "bg-white/20 text-white" : "text-white"
              }`}
              style={{ backgroundColor: selected === c.id ? undefined : c.color }}
            >
              {c.name[0]}
            </div>
            <span className="text-[15px] font-medium">{c.name}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
