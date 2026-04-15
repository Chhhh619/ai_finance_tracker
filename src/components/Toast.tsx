import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

type Props = {
  message: string | null;
  onDone: () => void;
  durationMs?: number;
};

export default function Toast({ message, onDone, durationMs = 3000 }: Props) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, durationMs);
    return () => clearTimeout(id);
  }, [message, durationMs, onDone]);

  return createPortal(
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}
          className="fixed top-4 inset-x-0 z-[60] flex justify-center pointer-events-none"
        >
          <div className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm shadow-lg max-w-xs text-center">
            {message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
