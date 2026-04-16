import { useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";
import CategoryAvatar from "./CategoryAvatar";
import { CATEGORY_ICON_KEYS, CATEGORY_ICONS, CATEGORY_COLORS } from "../lib/category-icons";
import { Check } from "lucide-react";

export type CategoryDraft = {
  name: string;
  color: string;
  icon: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  initial?: Partial<CategoryDraft>;
  title: string;
  submitLabel: string;
  onSubmit: (draft: CategoryDraft) => void | Promise<void>;
};

export default function CategoryEditorSheet({ open, onClose, initial, title, submitLabel, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[11]);
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setColor(initial?.color ?? CATEGORY_COLORS[11]);
    setIcon(initial?.icon ?? null);
  }, [open, initial?.name, initial?.color, initial?.icon]);

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSubmit({ name: trimmed, color, icon });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold mb-4">{title}</h2>

      <div className="flex items-center gap-3 mb-4">
        <CategoryAvatar category={{ name: name || "?", color, icon }} size={48} />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          className="flex-1 h-11 px-3 bg-gray-50 rounded-xl text-[15px] outline-none focus:ring-2 focus:ring-[#4169e1]/20"
          autoFocus
        />
      </div>

      <div className="mb-4">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Color</div>
        <div className="grid grid-cols-10 gap-2">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
              className="aspect-square rounded-full flex items-center justify-center transition-transform active:scale-95"
              style={{ backgroundColor: c }}
            >
              {color === c && <Check size={14} className="text-white" />}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Icon</div>
        <div className="grid grid-cols-6 gap-2 max-h-[40vh] overflow-y-auto pr-1">
          <button
            type="button"
            onClick={() => setIcon(null)}
            className={`aspect-square rounded-xl flex items-center justify-center text-xs font-medium transition-colors ${
              icon === null ? "bg-[#4169e1] text-white" : "bg-gray-50 text-gray-500 active:bg-gray-100"
            }`}
          >
            None
          </button>
          {CATEGORY_ICON_KEYS.map((key) => {
            const Icon = CATEGORY_ICONS[key];
            const active = icon === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                aria-label={key}
                className={`aspect-square rounded-xl flex items-center justify-center transition-colors ${
                  active ? "bg-[#4169e1]" : "bg-gray-50 active:bg-gray-100"
                }`}
              >
                <Icon size={20} weight="duotone" color={active ? "#ffffff" : "#374151"} />
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => void handleSubmit()}
        disabled={!name.trim() || busy}
        className="w-full h-12 rounded-xl bg-[#4169e1] text-white text-sm font-semibold active:bg-[#3151c1] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? "Saving..." : submitLabel}
      </button>
    </BottomSheet>
  );
}
