import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "motion/react";

type Props = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export default function BottomSheet({ open, onClose, children }: Props) {
  const dragControls = useDragControls();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return createPortal(
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
            className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
          >
            <motion.div
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100 || info.velocity.y > 500) onClose();
              }}
              className="bg-white rounded-t-3xl w-full max-w-md pointer-events-auto overflow-hidden"
              style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
            >
              <div
                onPointerDown={(e) => dragControls.start(e)}
                className="px-6 pt-3 pb-4 cursor-grab active:cursor-grabbing touch-none select-none"
              >
                <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto" />
              </div>
              <div className="px-6 pb-4">
                {children}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
