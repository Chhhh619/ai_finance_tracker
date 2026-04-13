# PocketRinggit: Automated Transaction Capture System

**Date:** 2026-04-10
**Status:** Approved

## Problem

Manual expense tracking requires too much human intervention. Malaysian financial services (TnG, Maybank, Public Bank, RHB) have no public APIs for reading personal transaction history. Malaysia has no PSD2-equivalent regulation mandating open banking, and no mature Plaid equivalent exists for the region.

## Solution

A hybrid system that uses iOS Shortcuts with on-device Apple OCR to extract transaction text from notification screenshots and physical receipts, then sends the text to a Supabase Edge Function where Gemini Flash categorizes and stores it. The existing React PWA becomes the viewing/editing interface backed by Supabase Postgres.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                 iOS DEVICE (On-Device)                │
│                                                      │
│  Shortcut: "Quick Capture"    Shortcut: "Receipt"    │
│  1. Take Screenshot           1. Open Camera         │
│  2. Extract Text (Apple OCR)  2. Take Photo          │
│  3. POST text to /ingest      3. Extract Text        │
│  4. Show result notification  4. POST text to /ingest│
│                               5. Show result notif.  │
│                                                      │
│  Triggers: Back Tap, Action Button, Control Center   │
│                                                      │
│  Offline fallback:                                   │
│  - Save text+timestamp as JSON to                    │
│    iCloud Drive/Shortcuts/PocketRinggit/pending/     │
│  - Show "Saved offline, will sync later"             │
│  - Sync Shortcut: auto-runs on Wi-Fi connect or     │
│    manually, flushes pending files to /ingest        │
└──────────────────────┬───────────────────────────────┘
                       │ HTTPS POST (text only)
                       ▼
┌──────────────────────────────────────────────────────┐
│                  SUPABASE (Cloud)                     │
│                                                      │
│  Edge Function: /ingest                              │
│  1. Authenticate (API key)                           │
│  2. Fetch user's categories from Postgres            │
│  3. Send text + categories to Gemini Flash           │
│  4. Validate response (Zod)                          │
│  5. Apply duplicate handling rules                   │
│  6. INSERT into transactions table                   │
│  7. Return result with human-readable message        │
│                                                      │
│  Postgres Database (RLS enabled)                     │
│  - transactions                                      │
│  - categories                                        │
│  - user_settings                                     │
│                                                      │
│  Auth: Magic link signup + Passkey/Face ID           │
│  REST API: Auto-generated for PWA reads              │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│              PWA: PocketRinggit (React)               │
│                                                      │
│  - Dashboard (summary, charts, recent transactions)  │
│  - Transactions (timeline, filter, edit, review)     │
│  - Capture (manual text + photo upload fallback)     │
│  - Categories (manage custom categories)             │
│  - Settings (duplicate handling, AI model, Shortcut  │
│    setup guide, export)                              │
│                                                      │
│  Auth: Session persistence + Passkey/Face ID         │
│  Offline: Cached UI + queued manual captures         │
└──────────────────────────────────────────────────────┘
```

## Data Model

### transactions

| Column | Type | Description |
|--------|------|-------------|
| id | uuid, PK | Auto-generated |
| user_id | uuid, FK → auth.users | Owner |
| amount | decimal | Transaction amount (e.g., 100.00) |
| currency | text, default 'MYR' | Currency code |
| direction | enum: 'expense' \| 'income' | Money direction |
| merchant | text | Merchant or recipient name |
| description | text | Raw context from notification |
| category_id | uuid, FK → categories | Assigned category |
| source | enum: 'ewallet' \| 'bank' \| 'manual' \| 'receipt' | Generalized source type |
| confidence | float (0-1) | LLM confidence score |
| raw_text | text | Full OCR text sent to API |
| needs_review | boolean | True if confidence < 0.7 |
| created_at | timestamptz | When recorded in system |
| transaction_at | timestamptz | When transaction actually happened |

### categories

| Column | Type | Description |
|--------|------|-------------|
| id | uuid, PK | Auto-generated |
| user_id | uuid, FK → auth.users | Owner |
| name | text | Category name (e.g., "Food", "Transport") |
| icon | text | Optional emoji or icon key |
| is_default | boolean | Whether it's a system default |

### user_settings

| Column | Type | Description |
|--------|------|-------------|
| user_id | uuid, PK, FK → auth.users | Owner |
| duplicate_handling | enum: 'all' \| 'expenses_only' \| 'smart_merge' | How to handle duplicate transfers |
| default_currency | text, default 'MYR' | Default currency |
| ai_model | text | OpenRouter/Gemini model identifier |
| categories_order | jsonb | Custom sort order for categories |

### Row-Level Security

All tables enforce `user_id = auth.uid()` on SELECT, INSERT, UPDATE, DELETE. No user can access another user's data.

## Default Categories

Food, Drinks, Groceries, Transport, Bills, Shopping, Health, Transfer, Others

Users can add custom categories via the PWA. The LLM receives the current category list from the database on each `/ingest` call.

## Edge Function: /ingest

### Request

```
POST /functions/v1/ingest
Authorization: Bearer <user_api_key>

{
  "text": "DuitNow Transfer is successful! You have successfully transferred RM 100.00 to TAN CHENG HONG.",
  "source": "auto" | "receipt",
  "timestamp": "2026-04-10T15:03:00+08:00"
}
```

### Processing Pipeline

1. **Authenticate** — validate API key, get user_id
2. **Fetch categories** — `SELECT name FROM categories WHERE user_id = $1`
3. **Call Gemini Flash** with system prompt:
   - "You are a Malaysian financial transaction extractor."
   - "From the following text captured from an iPhone screen, extract ONLY financial transactions."
   - "Ignore all non-financial content (app names, status bar, widgets, unrelated notifications)."
   - "Assign ONE category from this list: [user's categories]"
   - "If none fit, use 'Others' and set confidence lower."
   - "Return JSON array only."
4. **Validate** — Zod schema check on LLM response
5. **Duplicate handling** — apply user's preference (all / expenses_only / smart_merge)
   - `smart_merge`: same amount ± 5 minute window + opposite direction = same transaction
6. **Insert** — write to Postgres, set `needs_review = true` if confidence < 0.7
7. **Return** — `{ status, entries, message }` where message is human-readable for the Shortcut notification

### Response

```json
{
  "status": "ok",
  "entries": [
    {
      "amount": 100.00,
      "merchant": "TAN CHENG HONG",
      "direction": "expense",
      "category": "Transfer",
      "source": "ewallet",
      "confidence": 0.95
    }
  ],
  "message": "Recorded RM 100.00 → TAN CHENG HONG"
}
```

### Error / Empty Cases

- No transaction found: `{ "status": "empty", "message": "No transaction detected" }`
- LLM validation failure: `{ "status": "error", "message": "Could not parse transaction" }`
- Auth failure: HTTP 401

## iOS Shortcuts

### Shortcut 1: Quick Capture

**Trigger:** Back Tap / Action Button / Control Center

```
1. Take Screenshot
2. Extract Text from Image (Apple on-device OCR)
3. Try: Get Contents of URL
   - URL: https://<project>.supabase.co/functions/v1/ingest
   - Method: POST
   - Headers: { Authorization: Bearer <key> }
   - Body: { text: [extracted], source: "auto", timestamp: [now ISO] }
4. If success → Show Notification: response.message
5. If fail (no internet) →
   a. Save JSON to iCloud Drive/Shortcuts/PocketRinggit/pending/<uuid>.json
   b. Show Notification: "Saved offline, will sync later"
```

### Shortcut 2: Receipt Capture

**Trigger:** Manual / Control Center

```
1. Open Camera → Take Photo
2. Extract Text from Image (Apple on-device OCR)
3. Same POST logic as Quick Capture with source: "receipt"
4. Same offline fallback
```

### Shortcut 3: Sync Offline

**Trigger:** iOS Automation "When I connect to Wi-Fi" / Manual

```
1. Get files from iCloud Drive/Shortcuts/PocketRinggit/pending/
2. If empty → exit
3. Loop each file:
   a. Read JSON (text + timestamp)
   b. POST to /ingest
   c. On success → delete file
   d. On fail → skip
4. Show Notification: "Synced N transactions" or "Nothing to sync"
```

### Screenshot Not Saved to Album

The Shortcuts use the screenshot/photo transiently for OCR extraction only. No "Save to Photo Album" action is included, so no cleanup needed.

## Authentication

### Flow

```
App opens
├── Valid session exists? → Dashboard (instant)
├── Session expired? → Auto-refresh via refresh token (silent)
├── Refresh token expired (~90 days)? →
│   ├── Passkey exists? → Face ID prompt → Dashboard
│   └── No passkey? → Magic link email → Dashboard
└── First time? → Magic link signup → Prompt to create Passkey → Dashboard
```

### Implementation

- **Supabase Auth** handles session management, token refresh, magic links
- **WebAuthn / Passkeys** for Face ID login — tied to domain, stored in iCloud Keychain, synced across Apple devices
- **Session persistence** — access_token + refresh_token stored by Supabase JS client. User rarely sees a login screen.
- **Shortcut auth** — uses a long-lived API key (generated per user in Settings) separate from the browser session

## PWA Pages

### Home / Dashboard
- Month summary: total spent, income, net balance
- Category breakdown chart
- Recent transactions (last 5-10)
- "Needs Review" badge count with tap to filter

### Transactions
- Full timeline with infinite scroll
- Filter by: category, source (ewallet/bank/manual/receipt), date range
- "Needs Review" toggle to show only low-confidence entries
- Tap to edit amount, merchant, category, or delete
- Search by merchant name

### Capture (Manual Fallback)
- Text input: paste notification text
- Photo upload: uses same /ingest endpoint
- Quick manual entry form: amount + merchant + category picker
- Works offline: queued in localStorage, synced when online

### Categories
- Default + custom categories
- Add, edit, reorder, delete
- Icon/emoji picker

### Settings
- Account: email, sign out, manage Passkey
- Duplicate handling: all / expenses only / smart merge
- AI model selection (Gemini Flash default)
- Shortcut setup guide: step-by-step with downloadable Shortcut links
- Export data as CSV

## Offline Behavior

| Method | Offline? | How |
|--------|----------|-----|
| iOS Shortcut (screenshot/receipt) | Queued | Saved to iCloud Drive, synced via Sync Shortcut |
| PWA manual text input | Queued | localStorage queue, auto-synced on reconnect |
| PWA photo upload | Queued | localStorage queue (base64), auto-synced on reconnect |
| PWA browsing | Read-only | Service worker caches UI + last-synced data |

## Supabase Setup Guide

1. Create Supabase account at supabase.com
2. Create new project (region: Singapore for lowest MY latency)
3. Run database migrations (SQL scripts provided in project)
   - Create tables: transactions, categories, user_settings
   - Enable Row-Level Security on all tables
   - Seed default categories
4. Deploy Edge Functions
   - Install Supabase CLI: `npm install -g supabase`
   - Login: `supabase login`
   - Link project: `supabase link --project-ref <ref>`
   - Deploy: `supabase functions deploy ingest`
   - Set secrets: `supabase secrets set GEMINI_API_KEY=<key>`
5. Configure Auth
   - Enable email provider in Supabase dashboard
   - Set site URL and redirect URLs to PWA domain
   - Enable WebAuthn for Passkey support
6. Get project credentials
   - Project URL: `https://<ref>.supabase.co`
   - Anon key: for PWA client
   - Service role key: for Edge Functions only (never expose to client)
7. Deploy PWA
   - Set environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
   - Deploy to Vercel / Netlify / Cloudflare Pages
8. Setup iOS Shortcuts
   - Download Shortcuts via shared iCloud links (provided in Settings page)
   - Enter API endpoint URL and user API key when prompted
   - Assign Quick Capture to Back Tap / Action Button
   - Set up Wi-Fi Sync automation

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| PWA | vite-plugin-pwa (service worker, manifest) |
| Backend | Supabase Edge Functions (Deno) |
| Database | Supabase Postgres with RLS |
| Auth | Supabase Auth (magic link + WebAuthn/Passkey) |
| AI | Gemini Flash via Google AI API |
| OCR | Apple Vision (on-device, via iOS Shortcuts) |
| iOS Automation | Apple Shortcuts |
| Hosting | Vercel / Netlify / Cloudflare Pages (static) |

## Migration from Current Architecture

| Current | New |
|---------|-----|
| localStorage for all data | Supabase Postgres (primary) + localStorage (offline cache) |
| Client-side OCR (Tesseract.js) | Removed — OCR on-device via iOS Shortcuts |
| OpenRouter called from browser | Gemini Flash called from Edge Function (server-side) |
| No auth | Supabase Auth (magic link + Passkey/Face ID) |
| 750 entry limit | Unlimited (Postgres) |
| Data on single device | Cloud-synced, accessible from any device |

## Security Considerations

- **No images leave the device** — Apple OCR runs on-device, only extracted text is transmitted
- **HTTPS only** — all communication to Supabase is encrypted in transit
- **Row-Level Security** — database-level access control, not just application-level
- **Passkeys** — phishing-resistant, no passwords to leak
- **API keys per user** — Shortcut auth is scoped to individual users
- **Service role key** — never exposed to client, only used in Edge Functions
- **Postgres encrypted at rest** — Supabase default
