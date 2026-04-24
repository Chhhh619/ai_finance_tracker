import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useLocation, useNavigate } from "react-router-dom";
import { Play } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Rect = { x: number; y: number; width: number; height: number };

const PRIMARY = "#4169e1";
const TOTAL_STEPS = 4;

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const KEYFRAMES = `
  @keyframes shortcut-tour-pulse {
    0% { transform: scale(1); opacity: 0.9; }
    100% { transform: scale(1.08); opacity: 0; }
  }
  @keyframes shortcut-tour-header-glow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(65,105,225,0); }
    50%      { box-shadow: 0 0 0 6px rgba(65,105,225,0.18); }
  }
`;

function ensureKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById("shortcut-tour-keyframes")) return;
  const s = document.createElement("style");
  s.id = "shortcut-tour-keyframes";
  s.textContent = KEYFRAMES;
  document.head.appendChild(s);
}

function useTargetRect(selector: string | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!selector) { setRect(null); return; }

    const measure = () => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      setRect({ x: r.left, y: r.top, width: r.width, height: r.height });
      return true;
    };

    if (!measure()) {
      // Target not mounted yet (e.g. navigating into Settings). Poll briefly.
      let tries = 0;
      const id = window.setInterval(() => {
        if (measure() || ++tries > 40) window.clearInterval(id);
      }, 40);
      return () => window.clearInterval(id);
    }
  }, [selector]);

  // Reactive: reposition on scroll/resize while active.
  useEffect(() => {
    if (!selector) return;
    const reMeasure = () => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ x: r.left, y: r.top, width: r.width, height: r.height });
    };
    window.addEventListener("resize", reMeasure);
    window.addEventListener("scroll", reMeasure, true);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(reMeasure);
      ro.observe(document.body);
    }
    return () => {
      window.removeEventListener("resize", reMeasure);
      window.removeEventListener("scroll", reMeasure, true);
      ro?.disconnect();
    };
  }, [selector]);

  return rect;
}

export default function ShortcutOnboardingTour({ open, onClose }: Props) {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const location = useLocation();

  ensureKeyframes();

  useEffect(() => {
    if (open) setStep(location.pathname === "/settings" ? 2 : 1);
  }, [open, location.pathname]);

  const selector =
    step === 1 ? '[data-tour-target="settings-tab"]' :
    step === 2 ? '[data-tour-target="copy-key"]' :
    null;
  const targetRect = useTargetRect(open ? selector : null);

  // Auto-advance Step 2 -> Step 3 when the real Copy button fires its event.
  useEffect(() => {
    if (!open || step !== 2) return;
    const handler = () => window.setTimeout(() => setStep(3), 550);
    window.addEventListener("pocketringgit:key-copied", handler);
    return () => window.removeEventListener("pocketringgit:key-copied", handler);
  }, [open, step]);

  const goToSettings = useCallback(() => {
    if (location.pathname !== "/settings") navigate("/settings");
    window.setTimeout(() => setStep(2), 240);
  }, [navigate, location.pathname]);

  if (!open) return null;

  return createPortal(
    <AnimatePresence mode="wait">
      {step === 1 && targetRect && (
        <Spotlight
          key="s1"
          rect={targetRect}
          padding={6}
          radius={12}
          caption="Now head to Settings"
          subcaption="Your unique key lives there. Tap the Settings tab to grab it."
          cta="Go to Settings"
          onNext={goToSettings}
          onSkip={onClose}
          step={1}
          placement="above"
        />
      )}
      {step === 2 && targetRect && (
        <Spotlight
          key="s2"
          rect={targetRect}
          padding={8}
          radius={18}
          caption="Copy your unique key"
          subcaption="Tap the button to copy your key to the clipboard. You'll paste it into the Shortcut in a moment."
          onSkip={onClose}
          step={2}
          placement="above"
        />
      )}
      {step === 3 && (
        <VideoOverlay key="s3" onNext={() => setStep(4)} onSkip={onClose} />
      )}
      {step === 4 && (
        <DiagramOverlay key="s4" onDone={onClose} onSkip={onClose} />
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Spotlight overlay ────────────────────────────────────────────────

function Spotlight({
  rect, padding, radius,
  caption, subcaption, cta,
  onNext, onSkip, step, placement,
}: {
  rect: Rect;
  padding: number;
  radius: number;
  caption: string;
  subcaption: string;
  cta?: string;
  onNext?: () => void;
  onSkip: () => void;
  step: number;
  placement: "above" | "below";
}) {
  const vw = typeof window !== "undefined" ? window.innerWidth : 390;
  const vh = typeof window !== "undefined" ? window.innerHeight : 780;

  const r = {
    x: rect.x - padding,
    y: rect.y - padding,
    w: rect.width + padding * 2,
    h: rect.height + padding * 2,
  };

  const maskId = `shortcut-tour-mask-${step}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.26 }}
      className="fixed inset-0 z-[60]"
      style={{ pointerEvents: "none" }}
    >
      {/* SVG: visuals only (rounded scrim cutout + accent + pulse rings). Never catches events. */}
      <svg
        width="100%"
        height="100%"
        className="absolute inset-0 block"
        style={{ pointerEvents: "none" }}
      >
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={radius} ry={radius} fill="black" />
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(10,15,30,0.62)"
          mask={`url(#${maskId})`}
        />
        <rect
          x={r.x} y={r.y} width={r.w} height={r.h} rx={radius} ry={radius}
          fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2"
          style={{ filter: "drop-shadow(0 0 8px rgba(65,105,225,0.6))" }}
        />
        <rect
          x={r.x} y={r.y} width={r.w} height={r.h} rx={radius} ry={radius}
          fill="none" stroke={PRIMARY} strokeWidth="2"
          style={{
            transformOrigin: `${r.x + r.w / 2}px ${r.y + r.h / 2}px`,
            animation: "shortcut-tour-pulse 1.8s ease-out infinite",
          }}
        />
      </svg>

      {/* Four transparent scrim panels framing the target. Clicks in the hole fall through to
          the real element (copy button, settings tab, etc). Panels catch clicks outside and skip. */}
      <div
        onClick={onSkip}
        style={{
          position: "absolute", left: 0, top: 0, right: 0,
          height: Math.max(0, r.y),
          pointerEvents: "auto",
        }}
      />
      <div
        onClick={onSkip}
        style={{
          position: "absolute", left: 0, top: Math.max(0, r.y),
          width: Math.max(0, r.x), height: r.h,
          pointerEvents: "auto",
        }}
      />
      <div
        onClick={onSkip}
        style={{
          position: "absolute", left: r.x + r.w, top: Math.max(0, r.y),
          right: 0, height: r.h,
          pointerEvents: "auto",
        }}
      />
      <div
        onClick={onSkip}
        style={{
          position: "absolute", left: 0, top: r.y + r.h,
          right: 0, bottom: 0,
          pointerEvents: "auto",
        }}
      />

      <CaptionBubble
        rect={r} vw={vw} vh={vh} placement={placement}
        caption={caption} subcaption={subcaption} cta={cta}
        onNext={onNext} onSkip={onSkip} step={step}
      />
    </motion.div>
  );
}

function CaptionBubble({
  rect, vw, vh, placement,
  caption, subcaption, cta,
  onNext, onSkip, step,
}: {
  rect: { x: number; y: number; w: number; h: number };
  vw: number;
  vh: number;
  placement: "above" | "below";
  caption: string;
  subcaption: string;
  cta?: string;
  onNext?: () => void;
  onSkip: () => void;
  step: number;
}) {
  const bubbleWidth = Math.min(vw - 32, 320);
  const margin = 16;
  const gap = 14;

  const targetCenterX = rect.x + rect.w / 2;
  let left = targetCenterX - bubbleWidth / 2;
  left = Math.max(margin, Math.min(left, vw - margin - bubbleWidth));

  const ref = useRef<HTMLDivElement>(null);
  const [bubbleH, setBubbleH] = useState(180);
  useLayoutEffect(() => {
    if (ref.current) setBubbleH(ref.current.offsetHeight);
  }, [caption, subcaption]);

  let top: number;
  let arrowSide: "top" | "bottom";
  if (placement === "above") {
    top = rect.y - gap - bubbleH;
    arrowSide = "bottom";
    if (top < margin + 20) {
      top = rect.y + rect.h + gap;
      arrowSide = "top";
    }
  } else {
    top = rect.y + rect.h + gap;
    arrowSide = "top";
    if (top + bubbleH > vh - margin) {
      top = rect.y - gap - bubbleH;
      arrowSide = "bottom";
    }
  }

  const arrowX = Math.max(20, Math.min(bubbleWidth - 20, targetCenterX - left));

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.2, 0.9, 0.3, 1.2] }}
      className="fixed bg-white rounded-2xl pointer-events-auto"
      style={{
        left, top, width: bubbleWidth,
        padding: "16px 16px 12px",
        boxShadow: "0 12px 40px rgba(10,15,30,0.35), 0 2px 8px rgba(0,0,0,0.15)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: arrowX - 8,
          [arrowSide === "top" ? "top" : "bottom"]: -7,
          width: 16, height: 16, background: "#fff",
          transform: "rotate(45deg)",
          borderRadius: 2,
          boxShadow: arrowSide === "top"
            ? "-1px -1px 2px rgba(0,0,0,0.05)"
            : "1px 1px 2px rgba(0,0,0,0.05)",
        }}
      />

      <div className="h-[3px] bg-gray-100 rounded-[2px] overflow-hidden mb-3">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
          className="h-full rounded-[2px]"
          style={{ background: PRIMARY }}
        />
      </div>

      <div className="text-[15px] font-semibold text-[#0B1220] mb-1.5 leading-snug">
        {caption}
      </div>
      {subcaption && (
        <div className="text-[13px] text-gray-500 leading-relaxed mb-3.5">
          {subcaption}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onSkip}
          className="text-[13px] font-medium text-gray-500 py-2 px-1"
        >
          Skip tour
        </button>
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-medium text-gray-400 tracking-wider tabular-nums">
            {step} / {TOTAL_STEPS}
          </span>
          {cta && onNext && (
            <button
              onClick={onNext}
              className="rounded-[10px] px-4 py-[9px] text-[13px] font-semibold text-white transition-colors active:brightness-90"
              style={{
                background: PRIMARY,
                boxShadow: "0 2px 8px rgba(65,105,225,0.3)",
              }}
            >
              {cta}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Step header (shared by Steps 3 & 4) ─────────────────────────────

function StepHeader({ step, onSkip }: { step: number; onSkip: () => void }) {
  return (
    <>
      <div
        className="flex items-center justify-between px-5"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 54px)" }}
      >
        <div className="text-[11px] font-semibold tracking-[0.12em] text-gray-500">
          STEP {step} OF {TOTAL_STEPS}
        </div>
        <button onClick={onSkip} className="text-[13px] font-medium text-gray-500">
          Skip tour
        </button>
      </div>
      <div className="h-[3px] bg-gray-100 rounded-[2px] overflow-hidden mx-5 mt-3">
        <motion.div
          initial={{ width: `${((step - 1) / TOTAL_STEPS) * 100}%` }}
          animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
          className="h-full rounded-[2px]"
          style={{ background: PRIMARY }}
        />
      </div>
    </>
  );
}

// ─── Step 3: Video overlay ────────────────────────────────────────────

function VideoOverlay({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => {});
  }, [paused]);

  const onTime = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress(v.currentTime / v.duration);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.26 }}
      className="fixed inset-0 z-[70] bg-white text-[#0B1220] flex flex-col overflow-y-auto overflow-x-hidden"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <StepHeader step={3} onSkip={onSkip} />

      <div className="px-5 pt-6">
        <div
          className="text-[22px] font-bold leading-tight"
          style={{ letterSpacing: "-0.01em", fontFamily: '"Sora", "Outfit", sans-serif' }}
        >
          Here's where to paste
        </div>
        <div className="text-[13px] text-gray-500 mt-2 leading-relaxed">
          Open the <b className="text-[#0B1220]">Shortcuts</b> app, find{" "}
          <b className="text-[#0B1220]">PocketRinggit Capture</b>, and follow along.
        </div>
      </div>

      <div className="flex-1 min-h-[420px] px-5 pt-4 pb-2 flex flex-col items-center justify-start">
        <div
          onClick={() => setPaused(p => !p)}
          className="relative cursor-pointer overflow-hidden"
          style={{
            width: "100%",
            maxHeight: "100%",
            aspectRatio: "9 / 10.4",
            borderRadius: 10,
            flexShrink: 1,
            minHeight: 0,
          }}
        >
          <video
            ref={videoRef}
            autoPlay muted loop playsInline
            poster="/pocketringgitdemo-poster.jpeg"
            onLoadedData={() => setReady(true)}
            onTimeUpdate={onTime}
            style={{
              width: "100%", height: "100%", objectFit: "cover", display: "block",
              objectPosition: "center top",
              boxSizing: "border-box",
              paddingTop: "max(env(safe-area-inset-top, 0px), 54px)",
              opacity: ready ? 1 : 0.0001, transition: "opacity 260ms ease",
            }}
          >
            <source src="/pocketringgitdemo.mp4" type="video/mp4" />
            <source src="/pocketringgitdemo.webm" type="video/webm" />
          </video>

          {!ready && (
            <img
              src="/pocketringgitdemo-poster.jpeg"
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                objectPosition: "center top",
                boxSizing: "border-box",
                paddingTop: "max(env(safe-area-inset-top, 0px), 54px)",
              }}
            />
          )}

          <AnimatePresence>
            {paused && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 flex items-center justify-center bg-black/35 pointer-events-none"
              >
                <div
                  className="w-[58px] h-[58px] rounded-full flex items-center justify-center"
                  style={{
                    background: "rgba(0,0,0,0.55)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                >
                  <Play size={22} fill="#fff" stroke="none" style={{ marginLeft: 2 }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-3 h-[3px] w-full bg-black/5 rounded-[2px] overflow-hidden flex-shrink-0">
          <div
            className="h-full rounded-[2px]"
            style={{
              width: `${progress * 100}%`,
              background: PRIMARY,
              transition: "width 120ms linear",
            }}
          />
        </div>
      </div>

      <div
        className="px-5 pt-2"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 24px)" }}
      >
        <button
          onClick={onNext}
          className="w-full rounded-2xl py-[15px] text-[15px] font-bold text-white transition-colors active:brightness-90"
          style={{
            background: PRIMARY,
            boxShadow: "0 8px 24px rgba(65,105,225,0.3)",
          }}
        >
          Got it, show me the reference
        </button>
        <div className="text-center mt-2.5 text-[11px] text-gray-400">
          Tap the video to pause
        </div>
      </div>
    </motion.div>
  );
}

// ─── Step 4: Shortcuts dictionary diagram ─────────────────────────────

function DiagramOverlay({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.26 }}
      className="fixed inset-0 z-[70] bg-white text-[#0B1220] flex flex-col overflow-auto"
    >
      <StepHeader step={4} onSkip={onSkip} />

      <div className="px-5 pt-7">
        <div
          className="text-[22px] font-bold leading-tight"
          style={{ letterSpacing: "-0.01em", fontFamily: '"Sora", "Outfit", sans-serif' }}
        >
          Paste your key into<br />the Shortcuts app
        </div>
        <div className="text-[13px] text-gray-500 mt-2.5 leading-relaxed">
          Open Shortcuts, find <b className="text-[#0B1220]">PocketRinggit Capture</b>, then locate the{" "}
          <b className="text-[#0B1220]">Headers</b> dictionary and replace the value after{" "}
          <span
            className="text-[#0B1220] text-xs"
            style={{
              background: "#F3F4F6",
              padding: "1px 6px",
              borderRadius: 4,
              fontFamily: MONO,
            }}
          >
            Bearer
          </span>{" "}
          with your key.
        </div>
      </div>

      <div className="px-5 pt-6 pb-4 flex-1">
        <ShortcutsDictionaryMock />
      </div>

      <div
        className="px-5 pt-2"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 40px)" }}
      >
        <button
          onClick={onDone}
          className="w-full rounded-2xl py-4 text-[15px] font-bold text-white transition-colors active:brightness-90"
          style={{
            background: PRIMARY,
            boxShadow: "0 8px 24px rgba(65,105,225,0.3)",
          }}
        >
          Got it
        </button>
        <div className="text-center mt-3 text-xs text-gray-400">
          You can revisit this anytime from Settings
        </div>
      </div>
    </motion.div>
  );
}

function ShortcutsDictionaryMock() {
  return (
    <div className="relative">
      <div
        className="bg-white overflow-hidden"
        style={{
          borderRadius: 14,
          boxShadow: "0 8px 28px rgba(15,30,91,0.08)",
          border: "1px solid #E5E7EB",
        }}
      >
        <div
          className="flex items-center gap-2.5 px-3 py-2.5"
          style={{ background: "#F3F4F6", borderBottom: "1px solid #E5E7EB" }}
        >
          <div
            className="flex items-center justify-center"
            style={{ width: 22, height: 22, borderRadius: 5, background: PRIMARY }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <div className="flex-1 text-xs font-semibold text-[#0B1220]">Get Contents of URL</div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#6B7280" opacity="0.8">
            <path d="M6 9l6 6 6-6z" />
          </svg>
        </div>

        <DictRow
          label="URL"
          value={<span style={{ color: PRIMARY }}>https://api.pocketringgit.app/v1/capture</span>}
        />

        <DictRow
          label="Method"
          value={
            <span
              className="text-white text-[11px] font-semibold"
              style={{ background: "#0B1220", padding: "2px 8px", borderRadius: 4 }}
            >
              POST
            </span>
          }
        />

        <div
          className="px-3 pt-2.5 pb-1"
          style={{ borderTop: "1px solid #E5E7EB", background: "#FAFBFC" }}
        >
          <div
            className="text-[11px] text-gray-500 font-semibold mb-1.5"
            style={{ letterSpacing: "0.02em" }}
          >
            Headers
          </div>

          <div
            className="rounded-lg mb-1.5"
            style={{
              background: "rgba(65,105,225,0.06)",
              border: "1.5px solid rgba(65,105,225,0.55)",
              padding: "10px",
              animation: "shortcut-tour-header-glow 2.6s ease-in-out infinite",
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="text-[10px] text-gray-500 font-semibold"
                style={{ letterSpacing: "0.06em", width: 40 }}
              >
                KEY
              </span>
              <span className="text-xs text-[#0B1220]" style={{ fontFamily: MONO }}>
                Authorization
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span
                className="text-[10px] text-gray-500 font-semibold"
                style={{ letterSpacing: "0.06em", width: 40, paddingTop: 2 }}
              >
                VALUE
              </span>
              <div
                className="flex-1 bg-white flex items-center flex-wrap gap-1"
                style={{
                  borderRadius: 6,
                  padding: "6px 8px",
                  fontFamily: MONO,
                  fontSize: 11.5,
                  minHeight: 28,
                  border: "1px solid #E5E7EB",
                }}
              >
                <span className="font-semibold" style={{ color: "#D97706" }}>Bearer</span>
                <span
                  style={{
                    background: "rgba(217,119,6,0.1)",
                    color: "#92400E",
                    padding: "1px 6px",
                    borderRadius: 4,
                    border: "1px dashed rgba(217,119,6,0.5)",
                  }}
                >
                  paste&nbsp;your&nbsp;key&nbsp;here
                </span>
              </div>
            </div>
          </div>

          <div
            className="text-gray-400 text-[11px]"
            style={{ padding: "8px 10px", fontFamily: MONO }}
          >
            Content-Type: application/json
          </div>
        </div>
      </div>

      <div
        className="mt-4 flex gap-3 items-start"
        style={{
          background: "#F3F4F6",
          border: "1px solid #E5E7EB",
          borderRadius: 12,
          padding: "12px 14px",
        }}
      >
        <div
          className="flex items-center justify-center flex-shrink-0 font-bold text-sm"
          style={{
            width: 28, height: 28, borderRadius: 8,
            background: "rgba(65,105,225,0.12)",
            color: PRIMARY,
          }}
        >
          !
        </div>
        <div className="text-xs leading-relaxed text-gray-700">
          Keep the word <b style={{ color: "#D97706" }}>Bearer</b> and the space.
          Replace only the placeholder text with your copied key.
        </div>
      </div>
    </div>
  );
}

function DictRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5"
      style={{ borderTop: "1px solid #E5E7EB" }}
    >
      <span className="text-[11px] text-gray-500 font-semibold" style={{ width: 48 }}>
        {label}
      </span>
      <span
        className="text-xs text-[#0B1220] flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
        style={{ fontFamily: MONO }}
      >
        {value}
      </span>
    </div>
  );
}
