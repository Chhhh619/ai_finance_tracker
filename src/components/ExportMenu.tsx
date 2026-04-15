import { useEffect, useRef } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onPickXLSX: () => void;
  onPickCSV: () => void;
  /** Where to anchor the popover. Defaults to "right". */
  align?: "left" | "right";
};

export default function ExportMenu({ open, onClose, onPickXLSX, onPickCSV, align = "right" }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (ref.current && t && !ref.current.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  const sideClass = align === "right" ? "right-0" : "left-0";

  return (
    <div
      ref={ref}
      className={`absolute ${sideClass} mt-2 w-44 rounded-xl bg-white shadow-lg border border-gray-100 z-50 overflow-hidden`}
    >
      <button
        onClick={() => { onPickXLSX(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
      >
        <FileSpreadsheet size={16} className="text-gray-500" />
        Export as XLSX
      </button>
      <button
        onClick={() => { onPickCSV(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 border-t border-gray-50"
      >
        <FileText size={16} className="text-gray-500" />
        Export as CSV
      </button>
    </div>
  );
}

export function ExportTrigger({ onClick, label = "Export" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="h-9 px-3 rounded-xl text-sm flex items-center gap-1.5 bg-gray-50 text-gray-600 active:bg-gray-100 transition-colors touch-manipulation"
    >
      <Download size={14} />
      {label}
    </button>
  );
}
