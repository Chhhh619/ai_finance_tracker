// demo-video.jsx — Real video player (MP4 + WebM fallback) with poster,
// autoplay muted, looping, progress bar, tap to pause/play.

function DemoVideo({ paused: externalPaused, onTogglePaused }) {
  const videoRef = React.useRef(null);
  const [progress, setProgress] = React.useState(0);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (externalPaused) v.pause(); else v.play().catch(() => {});
  }, [externalPaused]);

  const onTime = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress(v.currentTime / v.duration);
  };

  return (
    <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 0, maxWidth: '100%' }}>
      {/* Phone-shaped bezel — sized by available height, width derived from aspect ratio */}
      <div style={{
        height: '100%', aspectRatio: '9 / 19.5', maxWidth: '100%',
        background: '#000', borderRadius: 26, padding: 5,
        boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)',
        position: 'relative', overflow: 'hidden', flexShrink: 1, minHeight: 0,
      }}>
        <div
          onClick={onTogglePaused}
          style={{
            width: '100%', height: '100%', borderRadius: 22, overflow: 'hidden',
            background: '#0B0D14', cursor: 'pointer', position: 'relative',
          }}
        >
          <video
            ref={videoRef}
            autoPlay muted loop playsInline
            poster="assets/shortcut-demo-poster.jpg"
            onLoadedData={() => setReady(true)}
            onTimeUpdate={onTime}
            style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              opacity: ready ? 1 : 0.0001, transition: 'opacity 260ms ease',
            }}
          >
            <source src="assets/shortcut-demo.mp4" type="video/mp4" />
            <source src="assets/shortcut-demo.webm" type="video/webm" />
          </video>

          {/* Poster fallback while loading */}
          {!ready && (
            <img
              src="assets/shortcut-demo-poster.jpg"
              alt=""
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover',
              }}
            />
          )}

          {/* Pause overlay */}
          {externalPaused && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.35)', pointerEvents: 'none',
              animation: 'coachFade 180ms ease both',
            }}>
              <div style={{
                width: 58, height: 58, borderRadius: '50%',
                background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid rgba(255,255,255,0.15)',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        marginTop: 12, height: 3, width: '100%', background: 'rgba(255,255,255,0.12)',
        borderRadius: 2, overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{
          width: `${progress * 100}%`, height: '100%',
          background: '#fff', borderRadius: 2,
          transition: 'width 120ms linear',
        }} />
      </div>
    </div>
  );
}

// ─── Full-screen video overlay (Step 3) ───────────────────────
function VideoOverlay({ step, total, onNext, onSkip }) {
  const [paused, setPaused] = React.useState(false);
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 60,
      background: '#fff',
      color: '#0B1220', display: 'flex', flexDirection: 'column',
      animation: 'coachFade 260ms ease both',
      overflow: 'hidden',
    }}>
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

      <div style={{ padding: '22px 20px 0' }}>
        <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em', color: '#0B1220' }}>
          Here's where to paste
        </div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 8, lineHeight: 1.5 }}>
          Open the <b style={{ color: '#0B1220' }}>Shortcuts</b> app, find <b style={{ color: '#0B1220' }}>PocketRinggit Capture</b>, and follow along.
        </div>
      </div>

      <div style={{ padding: '14px 20px 8px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, overflow: 'hidden' }}>
        <DemoVideo paused={paused} onTogglePaused={() => setPaused(p => !p)} />
      </div>

      <div style={{ padding: '0 20px 32px' }}>
        <button
          onClick={onNext}
          style={{
            width: '100%', background: '#3B5BDB', color: '#fff',
            border: 'none', borderRadius: 14, padding: '15px',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(59,91,219,0.3)',
          }}
        >Got it, show me the reference</button>
        <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: '#9AA0AB' }}>
          Tap the video to pause
        </div>
      </div>
    </div>
  );
}

// Keyframes (coachFade reused from coach.jsx if present)
if (!document.getElementById('demo-video-keyframes')) {
  const s = document.createElement('style');
  s.id = 'demo-video-keyframes';
  s.textContent = `@keyframes coachFade { from { opacity: 0 } to { opacity: 1 } }`;
  document.head.appendChild(s);
}

Object.assign(window, { DemoVideo, VideoOverlay });
