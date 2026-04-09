# PocketRinggit AI Budget Webapp

Mobile-first finance tracking app focused on Malaysia use cases, including payment notification text and receipt screenshot ingestion.

## What this starter already does

- Uses multiple screens (Dashboard, Capture, Entries, Categories, iOS Automation) instead of a single long page.
- Parses text inputs (notifications or copied transaction text).
- Runs OCR on uploaded receipt/screenshots directly in the browser.
- Categorizes expenses into default categories (Food, Drinks, Transport, and more).
- Lets users add custom categories that become valid AI routing options at runtime.
- Supports multi-entry parsing from one receipt when line items are detectable.
- Saves transactions locally for fast iteration.

## Quick start

1. Install dependencies.
2. Run development server.

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Optional AI model setup (free-tier friendly)

Create a `.env` file from `.env.example` and add an OpenRouter key:

```bash
VITE_OPENROUTER_API_KEY=your_key_here
VITE_OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
```

If no key is configured, the app uses heuristic parsing as fallback.

## iOS automation reality check

### Can a webapp directly read iOS notifications (Touch 'n Go, etc.)?

No. iOS sandboxing prevents websites from reading another app's notifications.

### Lowest-friction workaround with Apple Shortcuts

Use Shortcuts to pass captured text into this webapp URL:

`https://your-domain.com/#/capture?capture=<url_encoded_notification_text>`

Suggested Shortcut flow:

1. Trigger: Personal automation (depending on iOS capabilities and your device settings).
2. Action: Extract notification text or use screenshot + `Extract Text from Image`.
3. Action: URL-encode the text.
4. Action: Open URL using the capture template above.
5. Optional: `Delete Photos` action to auto-clean screenshots.

This project auto-parses the `capture` query and then removes it from the URL.

### Can users "add shortcuts" directly from this webapp?

- Partially: the app can provide copyable URL templates and deep-link users into the Shortcuts app.
- Not fully: a webapp cannot donate native App Intents or one-tap install proprietary `.shortcut` bundles the same way a native iOS app can.
- If one-tap install is a requirement, add a lightweight native iOS companion app later.

## Recommended stack decisions

- Frontend webapp: React + TypeScript + Vite PWA.
- Agentic workflow: LangGraph (more reliable control flow than free-form agents for finance pipelines).
- AI model options with free tiers:
  - OpenRouter free models (easy drop-in).
  - Gemini Flash free-tier API (if you want direct Google stack).
  - Self-hosted local LLM for privacy (Ollama + structured extraction).

## Next implementation milestones

1. Move storage to a backend database (Supabase/Postgres).
2. Add authenticated user accounts and multi-device sync.
3. Build a webhook endpoint for Shortcuts so capture can run without opening Safari UI.
4. Add rule learning and correction feedback loop for category accuracy.
5. Add monthly budget targets and anomaly alerts.
