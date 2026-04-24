// app.jsx — Main app: iPhone frame, screens, onboarding flow, tweaks panel

const { useState, useRef, useEffect, useLayoutEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "autoStart": true,
  "showRestart": true
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Screen state
  const [screen, setScreen] = useState('home'); // 'home' | 'settings'
  const [copied, setCopied] = useState(false);

  // Onboarding state — step 0 means inactive; 1..3 are the three new popups
  const [step, setStep] = useState(tweaks.autoStart ? 1 : 0);

  // Measure target rects
  const settingsTabRef = useRef(null);
  const copyBtnRef = useRef(null);
  const frameRef = useRef(null);
  const contentRef = useRef(null);
  const [settingsRect, setSettingsRect] = useState(null);
  const [copyRect, setCopyRect] = useState(null);

  const measure = (el) => {
    if (!el || !frameRef.current) return null;
    const f = frameRef.current.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - f.left, y: r.top - f.top, width: r.width, height: r.height };
  };

  useLayoutEffect(() => {
    const update = () => {
      setSettingsRect(measure(settingsTabRef.current));
      setCopyRect(measure(copyBtnRef.current));
    };
    update();
    const ro = new ResizeObserver(update);
    if (frameRef.current) ro.observe(frameRef.current);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [screen]);

  // Re-measure on scroll within content
  useEffect(() => {
    const c = contentRef.current;
    if (!c) return;
    const onScroll = () => setCopyRect(measure(copyBtnRef.current));
    c.addEventListener('scroll', onScroll);
    return () => c.removeEventListener('scroll', onScroll);
  }, [screen]);

  // When advancing to step 2, auto-navigate to Settings if user didn't tap the tab
  // Step flow:
  //  1 = spotlight Settings tab (on Home)
  //  2 = spotlight Copy button (on Settings)
  //  3 = demo video overlay
  //  4 = full-screen reference diagram overlay
  const TOTAL_STEPS = 4;
  const handleNavTab = (id) => {
    setScreen(id);
    if (id === 'settings' && step === 1) {
      // small delay for Settings render before measuring
      setTimeout(() => setStep(2), 220);
    }
  };

  const handleCopy = () => {
    if (copied) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
    // Always advance to the video step after copy — whether tour is active or
    // a returning user clicked the button directly.
    setTimeout(() => setStep(3), 550);
  };

  const skipTour = () => setStep(0);
  const restartTour = () => { setScreen('home'); setCopied(false); setStep(1); };

  // Expose a subtle helper for Step 1: tapping the bubble CTA navigates to Settings
  const step1Next = () => {
    setScreen('settings');
    setTimeout(() => setStep(2), 220);
  };

  const FRAME_W = 390;
  const FRAME_H = 780;

  return (
    <>
      <IOSDevice width={FRAME_W} height={FRAME_H}>
        <div
          ref={frameRef}
          style={{ position: 'relative', width: '100%', height: '100%', background: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
        >
          <div ref={contentRef} style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {screen === 'home' && <HomeScreen />}
            {screen === 'settings' && (
              <SettingsScreen copyBtnRef={copyBtnRef} copied={copied} onCopy={handleCopy} />
            )}
          </div>

          <TabBar active={screen} onNav={handleNavTab} settingsTabRef={settingsTabRef} />

          {/* Step 1 — spotlight Settings tab */}
          {step === 1 && settingsRect && (
            <Spotlight
              id="s1"
              targetRect={settingsRect}
              padding={6}
              radius={10}
              caption="Now head to Settings"
              subcaption="Your unique key lives there. Tap the Settings tab to grab it."
              cta="Go to Settings"
              onNext={step1Next}
              onSkip={skipTour}
              step={1} total={TOTAL_STEPS}
              placement="above"
              frameSize={{ w: FRAME_W, h: FRAME_H }}
            />
          )}

          {/* Step 2 — spotlight Copy button */}
          {step === 2 && copyRect && (
            <Spotlight
              id="s2"
              targetRect={copyRect}
              padding={8}
              radius={14}
              caption="Copy your unique key"
              subcaption="Tap the button to copy your key to the clipboard. You'll paste it into the Shortcut in a moment."
              cta={null}
              onSkip={skipTour}
              step={2} total={TOTAL_STEPS}
              placement="above"
              frameSize={{ w: FRAME_W, h: FRAME_H }}
            />
          )}

          {/* Step 3 — demo video */}
          {step === 3 && (
            <VideoOverlay
              step={3} total={TOTAL_STEPS}
              onNext={() => setStep(4)}
              onSkip={skipTour}
            />
          )}

          {/* Step 4 — full-screen Shortcuts diagram reference */}
          {step === 4 && (
            <ShortcutsDiagramOverlay
              step={4} total={TOTAL_STEPS}
              onDone={() => setStep(0)}
              onSkip={skipTour}
            />
          )}

          {/* Restart tour floating chip */}
          {tweaks.showRestart && step === 0 && (
            <button
              onClick={restartTour}
              style={{
                position: 'absolute', right: 12, bottom: 96, zIndex: 40,
                background: '#0B1220', color: '#fff', border: 'none',
                borderRadius: 999, padding: '8px 14px',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              title="Restart onboarding tour"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
              Restart tour
            </button>
          )}
        </div>
      </IOSDevice>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Tour" />
        <TweakToggle label="Auto-start tour on load" value={tweaks.autoStart} onChange={(v) => setTweak('autoStart', v)} />
        <TweakToggle label="Show 'Restart tour' chip" value={tweaks.showRestart} onChange={(v) => setTweak('showRestart', v)} />
        <TweakButton label="Restart tour now" onClick={restartTour} />
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
