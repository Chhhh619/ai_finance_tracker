// screens.jsx — Home (bar chart + recent) and Settings mocks
// Matches the provided screenshots: navy-accent titles, blue primary (#3B5BDB)

const PRIMARY = '#3B5BDB';
const NAVY = '#0F1E5B';
const MUTED = '#6B7280';
const SURFACE = '#F3F4F6';
const BORDER = '#E5E7EB';

// ─── Bottom Tab Bar ────────────────────────────────────────────
function TabBar({ active, onNav, settingsTabRef }) {
  const tabs = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'tx', label: 'Transactions', icon: 'list' },
    { id: 'cat', label: 'Categories', icon: 'grid' },
    { id: 'settings', label: 'Settings', icon: 'gear' },
  ];
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-around',
      padding: '10px 8px 28px',
      borderTop: `1px solid ${BORDER}`,
      background: '#fff',
    }}>
      {tabs.map(t => (
        <button
          key={t.id}
          ref={t.id === 'settings' ? settingsTabRef : null}
          onClick={() => onNav(t.id)}
          data-tab={t.id}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: active === t.id ? PRIMARY : MUTED,
            padding: '4px 0',
            fontSize: 11, fontWeight: 500,
          }}
        >
          <TabIcon name={t.icon} />
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function TabIcon({ name }) {
  const s = { width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'home') return <svg {...s} viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
  if (name === 'list') return <svg {...s} viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>;
  if (name === 'grid') return <svg {...s} viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === 'gear') return <svg {...s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>;
  return null;
}

// ─── Home Screen ───────────────────────────────────────────────
function HomeScreen() {
  const bars = [
    { label: 'Food', value: 720, color: '#E76F2B' },
    { label: 'Shopping', value: 180, color: '#B85BC6' },
    { label: 'Bills', value: 140, color: '#E0A93A' },
    { label: 'Transport', value: 150, color: '#3B5BDB' },
    { label: 'Drinks', value: 110, color: '#2AA8A6' },
    { label: 'Transfer', value: 90, color: '#2E4A8B' },
  ];
  const max = 800;
  return (
    <div style={{ padding: '58px 20px 12px', background: '#fff' }}>
      <h1 style={{
        fontSize: 28, fontWeight: 700, lineHeight: 1.2, margin: '8px 0 20px',
        letterSpacing: '-0.01em',
      }}>
        <span style={{ color: PRIMARY }}>Cheng Hong</span>
        <span style={{ color: '#0B1220' }}>, You have spent </span>
        <span style={{ color: PRIMARY }}>RM1,210.02 </span>
        <span style={{ color: '#0B1220', textDecoration: 'underline', textDecorationColor: PRIMARY }}>this month</span>
        <span style={{ color: '#0B1220' }}>.</span>
      </h1>

      <div style={{ fontSize: 11, color: MUTED, letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>BREAKDOWN</div>
      <div style={{
        background: SURFACE, borderRadius: 14, padding: '18px 14px 10px',
        display: 'flex', alignItems: 'flex-end', gap: 10, height: 190,
      }}>
        {/* Y-axis */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 150, fontSize: 9, color: MUTED, textAlign: 'right', paddingBottom: 16 }}>
          <span>800</span><span>600</span><span>400</span><span>200</span><span>0</span>
        </div>
        {bars.map((b, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <div style={{
              width: '100%', maxWidth: 22, height: `${(b.value / max) * 140}px`,
              background: b.color, borderRadius: '4px 4px 2px 2px',
            }} />
            <div style={{ fontSize: 9, color: MUTED, marginTop: 6, transform: 'rotate(-18deg)', transformOrigin: 'left top', whiteSpace: 'nowrap' }}>{b.label}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: MUTED, letterSpacing: '0.08em', fontWeight: 600, margin: '24px 0 8px' }}>RECENT</div>

      <Txn date="22 Apr" total="-RM26.30" items={[
        { icon: 'F', color: '#E76F2B', name: 'Face To Face Noodle House', cat: 'Food', amt: '-RM26.30', time: '02:25 am' },
      ]} />
      <Txn date="21 Apr" total="-RM55.20" items={[
        { icon: 'T', color: PRIMARY, name: 'FONG E WERN', cat: 'Transfer', amt: '-RM9.70', time: '09:22 pm' },
        { icon: 'T', color: PRIMARY, name: 'SEAH MENG FOONG', cat: 'Transfer', amt: '-RM11.70', time: '08:10 pm' },
      ]} />
    </div>
  );
}

function Txn({ date, total, items }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: '#0B1220', fontWeight: 500 }}>{date}</span>
        <span style={{ color: PRIMARY, fontWeight: 500 }}>{total}</span>
      </div>
      {items.map((t, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: `1px solid ${BORDER}` }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8, background: t.color,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 14, flexShrink: 0,
          }}>{t.icon}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
            <div style={{ fontSize: 11, color: MUTED }}>{t.cat}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t.amt}</div>
            <div style={{ fontSize: 10, color: MUTED }}>{t.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Settings Screen ───────────────────────────────────────────
function SettingsScreen({ copyBtnRef, copied, onCopy }) {
  return (
    <div style={{ padding: '58px 20px 12px', background: '#fff' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '8px 0 18px' }}>Settings</h1>

      <SectionLabel>ACCOUNT</SectionLabel>
      <Row>
        <span style={{ fontSize: 13 }}>tanchenghong619@gmail.com</span>
      </Row>
      <Row>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
          <FaceIcon /> Enable Face ID
        </span>
        <Chev />
      </Row>
      <Row>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#DC2626' }}>
          <SignOutIcon /> Sign Out
        </span>
      </Row>

      <SectionLabel>DUPLICATE HANDLING</SectionLabel>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 8, lineHeight: 1.4 }}>
        How to handle transfer notifications from both sender and receiver.
      </div>
      <Row>
        <span style={{ fontSize: 13 }}>Smart merge</span>
        <Chev />
      </Row>

      <SectionLabel>DATE CYCLE</SectionLabel>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 8, lineHeight: 1.4 }}>
        When your monthly and weekly cycles start.
      </div>
      <Row>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CalIcon />
          <span>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Date Settings</div>
            <div style={{ fontSize: 10, color: MUTED }}>Starts 1st of every month · Sunday</div>
          </span>
        </span>
        <Chev />
      </Row>

      <SectionLabel>YOUR UNIQUE KEY</SectionLabel>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 10, lineHeight: 1.4 }}>
        Paste this into your iOS Shortcut when it asks for the key.
      </div>
      <button
        ref={copyBtnRef}
        data-el="copy-key"
        onClick={onCopy}
        style={{
          width: '100%',
          background: copied ? '#DFF5E3' : PRIMARY,
          color: copied ? '#1F8A3B' : '#fff',
          border: 'none', borderRadius: 12,
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          transition: 'background 200ms ease, color 200ms ease',
          boxShadow: copied ? 'none' : '0 2px 8px rgba(59,91,219,0.25)',
        }}
      >
        {copied ? <><CheckIcon color="#1F8A3B" /> Copied!</> : <><CopyIcon /> Copy your unique key</>}
      </button>

      <SectionLabel>IOS SHORTCUT</SectionLabel>
      <div style={{
        background: SURFACE, borderRadius: 12, padding: '14px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9, background: '#EAEFFD',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={PRIMARY}><path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.3 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8L12 2z"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Add PocketRinggit Capture</div>
          <div style={{ fontSize: 11, color: MUTED }}>Open in Shortcuts, then paste your API key</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2"><path d="M7 17L17 7M7 7h10v10"/></svg>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, color: MUTED, letterSpacing: '0.08em', fontWeight: 600, margin: '22px 0 8px' }}>{children}</div>;
}
function Row({ children }) {
  return (
    <div style={{
      background: SURFACE, borderRadius: 10, padding: '12px 14px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 6,
    }}>{children}</div>
  );
}
function Chev() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18"/></svg>;
}
function FaceIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B1220" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7V5a1 1 0 0 1 1-1h2M20 7V5a1 1 0 0 0-1-1h-2M4 17v2a1 1 0 0 0 1 1h2M20 17v2a1 1 0 0 1-1 1h-2M9 10v1M15 10v1M12 9v4h-1M9 15s1 1 3 1 3-1 3-1"/></svg>; }
function SignOutIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>; }
function CalIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B1220" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function CopyIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>; }
function CheckIcon({ color = '#fff' }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 12 10 17 20 7"/></svg>; }

Object.assign(window, { HomeScreen, SettingsScreen, TabBar, PRIMARY, NAVY, MUTED, SURFACE, BORDER });
