import { Sparkles, ExternalLink } from "lucide-react";
import BottomSheet from "./BottomSheet";
import { SHORTCUT_ICLOUD_URL } from "../lib/constants";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function ShortcutOnboardingModal({ open, onClose }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex flex-col items-center text-center mb-5">
        <div className="w-12 h-12 rounded-2xl bg-[#4169e1]/10 flex items-center justify-center mb-3">
          <Sparkles size={22} className="text-[#4169e1]" />
        </div>
        <h2 className="text-lg font-semibold mb-1.5">Capture transactions instantly</h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          Add the iOS Shortcut so a single tap on the Action Button or Back Tap
          screenshots a payment notification and logs it automatically.
        </p>
      </div>

      <a
        href={SHORTCUT_ICLOUD_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClose}
        className="flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-[#4169e1] text-white text-sm font-semibold active:bg-[#3151c1] transition-colors mb-2"
      >
        Add to Shortcuts <ExternalLink size={16} />
      </a>
      <button
        onClick={onClose}
        className="w-full h-11 rounded-xl text-sm font-medium text-gray-500 active:bg-gray-50 transition-colors"
      >
        Maybe later
      </button>
    </BottomSheet>
  );
}
