// coach.jsx — Coach-mark system: spotlight overlay, caption bubble, progress bar,
// plus full-screen instructional overlay for step 4.

// ─── Spotlight overlay ────────────────────────────────────────
// Renders a dim scrim with a rounded-rect cutout around a target element,
// plus an anchored caption bubble with progress bar and skip link.
function Spotlight({
  targetRect, // {x, y, width, height} relative to the frame
  padding = 8,
  radius = 12,
  caption,
  subcaption,
  cta = 'Next',
  onNext,
  onSkip,
  step,
  total,
  placement = 'above', // 'above' | 'below'
  frameSize, // {w, h}
  id,
}) {
  if (!targetRect) return null;
  const r = {
    x: targetRect.x - padding,
    y: targetRect.y - padding,
    w: targetRect.width + padding * 2,
    h: targetRect.height + padding * 2,
  };

  // SVG mask cutout approach — reliable on all renderers
  const maskId = `mask-${id}`;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      pointerEvents: 'none', // children opt in; the cutout passes clicks through to the target
      animation: 'coachFade 260ms ease both',
    }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block', pointerEvents: 'none' }}>
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={r.x} y={r.y} width={r.w} height={r.h}
              rx={radius} ry={radius}
              fill="black"
            />
          </mask>
        </defs>
        {/* Scrim catches clicks outside the cutout; inside the cutout it's transparent so clicks reach the target */}
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(10,15,30,0.62)" mask={`url(#${maskId})`} style={{ pointerEvents: 'auto' }} onClick={onSkip} />
        {/* Accent ring around cutout */}
        <rect
          x={r.x} y={r.y} width={r.w} height={r.h}
          rx={radius} ry={radius}
          fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2"
          style={{ filter: 'drop-shadow(0 0 8px rgba(59,91,219,0.6))', pointerEvents: 'none' }}
        />
        {/* Animated pulse ring */}
        <rect
          x={r.x} y={r.y} width={r.w} height={r.h}
          rx={radius} ry={radius}
          fill="none" stroke="#3B5BDB" strokeWidth="2"
          style={{ transformOrigin: `${r.x + r.w / 2}px ${r.y + r.h / 2}px`, animation: 'coachPulse 1.8s ease-out infinite', pointerEvents: 'none' }}
        />
      </svg>

      <CaptionBubble
        targetRect={r}
        frameSize={frameSize}
        placement={placement}
        caption={caption}
        subcaption={subcaption}
        cta={cta}
        onNext={onNext}
        onSkip={onSkip}
        step={step}
        total={total}
      />
    </div>
  );
}

function CaptionBubble({ targetRect, frameSize, placement, caption, subcaption, cta, onNext, onSkip, step, total }) {
  const bubbleWidth = Math.min(frameSize.w - 32, 320);
  const margin = 16;
  const gap = 14;

  // horizontal: center on target but clamp to frame
  const targetCenterX = targetRect.x + targetRect.w / 2;
  let left = targetCenterX - bubbleWidth / 2;
  left = Math.max(margin, Math.min(left, frameSize.w - margin - bubbleWidth));

  // vertical placement
  const bubbleRef = React.useRef(null);
  const [bubbleH, setBubbleH] = React.useState(160);
  React.useLayoutEffect(() => {
    if (bubbleRef.current) setBubbleH(bubbleRef.current.offsetHeight);
  }, [caption, subcaption]);

  let top;
  let arrowSide;
  if (placement === 'above') {
    top = targetRect.y - gap - bubbleH;
    arrowSide = 'bottom';
    if (top < margin + 20) {
      top = targetRect.y + targetRect.h + gap;
      arrowSide = 'top';
    }
  } else {
    top = targetRect.y + targetRect.h + gap;
    arrowSide = 'top';
    if (top + bubbleH > frameSize.h - margin) {
      top = targetRect.y - gap - bubbleH;
      arrowSide = 'bottom';
    }
  }

  // arrow x (relative to bubble)
  const arrowX = Math.max(20, Math.min(bubbleWidth - 20, targetCenterX - left));

  return (
    <div
      ref={bubbleRef}
      style={{
        position: 'absolute',
        left, top, width: bubbleWidth,
        background: '#fff', borderRadius: 16,
        padding: '16px 16px 12px',
        boxShadow: '0 12px 40px rgba(10,15,30,0.35), 0 2px 8px rgba(0,0,0,0.15)',
        animation: 'coachBubbleIn 320ms cubic-bezier(.2,.9,.3,1.2) both',
        fontFamily: 'Inter, sans-serif',
        pointerEvents: 'auto',
      }}
    >
      {/* Arrow */}
      <div style={{
        position: 'absolute',
        left: arrowX - 8,
        [arrowSide === 'top' ? 'top' : 'bottom']: -7,
        width: 16, height: 16, background: '#fff',
        transform: 'rotate(45deg)',
        borderRadius: 2,
        boxShadow: arrowSide === 'top'
          ? '-1px -1px 2px rgba(0,0,0,0.05)'
          : '1px 1px 2px rgba(0,0,0,0.05)',
      }} />

      {/* Progress bar */}
      <div style={{
        height: 3, background: '#EEF0F4', borderRadius: 2, overflow: 'hidden',
        marginBottom: 12,
      }}>
        <div style={{
          width: `${(step / total) * 100}%`, height: '100%',
          background: '#3B5BDB', borderRadius: 2,
          transition: 'width 400ms cubic-bezier(.2,.7,.2,1)',
        }} />
      </div>

      <div style={{ fontSize: 15, fontWeight: 600, color: '#0B1220', marginBottom: 6, lineHeight: 1.35 }}>
        {caption}
      </div>
      {subcaption && (
        <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5, marginBottom: 14 }}>
          {subcaption}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <button
          onClick={onSkip}
          style={{
            background: 'transparent', border: 'none', color: '#6B7280',
            fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: '8px 4px',
          }}
        >Skip tour</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: '#9AA0AB', fontWeight: 500, letterSpacing: '0.04em' }}>
            {step} / {total}
          </span>
          {cta && (
            <button
              onClick={onNext}
              style={{
                background: '#3B5BDB', color: '#fff', border: 'none', borderRadius: 10,
                padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(59,91,219,0.3)',
              }}
            >{cta}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Full-screen instructional overlay (Step 4) ───────────────
function ShortcutsDiagramOverlay({ step, total, onDone, onSkip }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 60,
      background: '#fff',
      color: '#0B1220', display: 'flex', flexDirection: 'column',
      animation: 'coachFade 260ms ease both',
      overflow: 'auto',
    }}>
      {/* Top bar */}
      <div style={{ padding: '54px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, color: '#6B7280', letterSpacing: '0.12em', fontWeight: 600 }}>
          STEP {step} OF {total}
        </div>
        <button onClick={onSkip} style={{
          background: 'transparent', border: 'none', color: '#6B7280',
          fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}>Skip tour</button>
      </div>

      <div style={{
        height: 3, background: '#EEF0F4', borderRadius: 2, overflow: 'hidden',
        margin: '12px 20px 0',
      }}>
        <div style={{
          width: `${(step / total) * 100}%`, height: '100%',
          background: '#3B5BDB', borderRadius: 2,
          transition: 'width 400ms cubic-bezier(.2,.7,.2,1)',
        }} />
      </div>

      {/* Headline */}
      <div style={{ padding: '28px 20px 0' }}>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em', color: '#0B1220' }}>
          Paste your key into<br/>the Shortcuts app
        </div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 10, lineHeight: 1.5 }}>
          Open Shortcuts, find <b style={{ color: '#0B1220' }}>PocketRinggit Capture</b>, then locate the
          <b style={{ color: '#0B1220' }}> Headers</b> dictionary and replace the value after <span style={{ background: '#F3F4F6', color: '#0B1220', padding: '1px 6px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>Bearer</span> with your key.
        </div>
      </div>

      {/* Diagram — iOS Shortcuts dictionary row */}
      <div style={{ padding: '22px 20px 16px', flex: 1 }}>
        <ShortcutsDictionaryMock />
      </div>

      {/* Bottom CTA */}
      <div style={{ padding: '0 20px 40px' }}>
        <button
          onClick={onDone}
          style={{
            width: '100%', background: '#3B5BDB', color: '#fff',
            border: 'none', borderRadius: 14, padding: '16px',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(59,91,219,0.3)',
          }}
        >Got it</button>
        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: '#9AA0AB' }}>
          You can revisit this anytime from Settings
        </div>
      </div>
    </div>
  );
}

function ShortcutsDictionaryMock() {
  // Mimic the iOS Shortcuts app styling: rounded card, action header, dictionary rows.
  // Light theme to match the webapp.
  return (
    <div style={{ position: 'relative' }}>
      {/* Shortcuts card */}
      <div style={{
        background: '#fff', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 8px 28px rgba(15,30,91,0.08)',
        border: '1px solid #E5E7EB',
      }}>
        {/* Action header */}
        <div style={{
          background: '#F3F4F6', padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '1px solid #E5E7EB',
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: 5, background: '#3B5BDB',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </div>
          <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#0B1220' }}>
            Get Contents of URL
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#6B7280" opacity="0.8"><path d="M6 9l6 6 6-6z"/></svg>
        </div>

        {/* URL row */}
        <DictRow
          label="URL"
          value={<span style={{ color: '#3B5BDB' }}>https://api.pocketringgit.app/v1/capture</span>}
        />

        {/* Method */}
        <DictRow
          label="Method"
          value={<span style={{ background: '#0B1220', color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>POST</span>}
        />

        {/* Headers dictionary */}
        <div style={{ borderTop: '1px solid #E5E7EB', padding: '10px 12px 4px', background: '#FAFBFC' }}>
          <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, marginBottom: 6, letterSpacing: '0.02em' }}>
            Headers
          </div>

          {/* Authorization row — highlighted */}
          <div style={{
            background: 'rgba(59,91,219,0.06)', borderRadius: 8,
            padding: '10px 10px', marginBottom: 6,
            border: '1.5px solid rgba(59,91,219,0.55)',
            animation: 'coachHeaderGlow 2.6s ease-in-out infinite',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: '#6B7280', fontWeight: 600, letterSpacing: '0.06em', width: 40 }}>KEY</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#0B1220' }}>Authorization</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: 10, color: '#6B7280', fontWeight: 600, letterSpacing: '0.06em', width: 40, paddingTop: 2 }}>VALUE</span>
              <div style={{
                flex: 1, background: '#fff', borderRadius: 6,
                padding: '6px 8px', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5,
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4,
                minHeight: 28, border: '1px solid #E5E7EB',
              }}>
                <span style={{ color: '#D97706', fontWeight: 600 }}>Bearer</span>
                <span style={{
                  background: 'rgba(217,119,6,0.1)',
                  color: '#92400E',
                  padding: '1px 6px', borderRadius: 4,
                  border: '1px dashed rgba(217,119,6,0.5)',
                }}>paste&nbsp;your&nbsp;key&nbsp;here</span>
              </div>
            </div>
          </div>

          {/* Other header row, dimmed */}
          <div style={{ padding: '8px 10px', color: '#9AA0AB', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
            Content-Type: application/json
          </div>
        </div>
      </div>

      {/* Callout pointing at the VALUE field */}
      <div style={{
        marginTop: 18, display: 'flex', gap: 12, alignItems: 'flex-start',
        background: '#F3F4F6', border: '1px solid #E5E7EB',
        borderRadius: 12, padding: '12px 14px',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: 'rgba(59,91,219,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          color: '#3B5BDB', fontWeight: 700, fontSize: 14,
        }}>!</div>
        <div style={{ fontSize: 12, lineHeight: 1.5, color: '#374151' }}>
          Keep the word <b style={{ color: '#D97706' }}>Bearer</b> and the space.
          Replace only the placeholder text with your copied key.
        </div>
      </div>
    </div>
  );
}

function DictRow({ label, value }) {
  return (
    <div style={{
      padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12,
      borderTop: '1px solid #E5E7EB',
    }}>
      <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, width: 48 }}>{label}</span>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#0B1220', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

// ─── Keyframes (injected once) ────────────────────────────────
if (!document.getElementById('coach-keyframes')) {
  const s = document.createElement('style');
  s.id = 'coach-keyframes';
  s.textContent = `
    @keyframes coachFade { from { opacity: 0 } to { opacity: 1 } }
    @keyframes coachBubbleIn {
      from { opacity: 0; transform: translateY(6px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes coachPulse {
      0% { transform: scale(1); opacity: 0.9; }
      100% { transform: scale(1.08); opacity: 0; }
    }
    @keyframes coachHeaderGlow {
      0%, 100% { box-shadow: 0 0 0 0 rgba(59,91,219,0.0); }
      50% { box-shadow: 0 0 0 6px rgba(59,91,219,0.18); }
    }
  `;
  document.head.appendChild(s);
}

Object.assign(window, { Spotlight, ShortcutsDiagramOverlay });
