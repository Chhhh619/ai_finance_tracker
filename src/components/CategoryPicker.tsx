import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import type { Category } from "../types";

interface CategoryPickerProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  selected: string;
  onSelect: (id: string) => void;
}

export default function CategoryPicker({ open, onClose, categories, selected, onSelect }: CategoryPickerProps) {
  // Sort: keep Others at the bottom
  const sorted = [...categories].sort((a, b) => {
    if (a.name.toLowerCase() === "others") return 1;
    if (b.name.toLowerCase() === "others") return -1;
    return 0;
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40" onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 bg-white rounded-t-3xl z-50 max-w-md mx-auto max-h-[70vh] flex flex-col"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
          >
            <div className="p-6 pb-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Category</h2>
                <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto px-6 pb-6 space-y-1.5">
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
