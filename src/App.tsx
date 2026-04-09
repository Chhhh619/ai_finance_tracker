import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { recognize } from "tesseract.js";
import { defaultCategories, findCategoryByName, makeCustomCategory, normalizeCategoryName } from "./lib/categories";
import { parseTransactions } from "./lib/parser";
import { loadFromStorage, saveToStorage } from "./lib/storage";
import type { CategoryOption, EntrySource, ExpenseEntry } from "./types";

const CATEGORY_STORAGE_KEY = "pocketringgit.categories.v1";
const ENTRY_STORAGE_KEY = "pocketringgit.entries.v1";

const moneyFormatter = new Intl.NumberFormat("en-MY", {
  style: "currency",
  currency: "MYR"
});

const dateFormatter = new Intl.DateTimeFormat("en-MY", {
  dateStyle: "medium",
  timeStyle: "short"
});

function makeEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resolveCategory(categories: CategoryOption[], categoryName?: string): CategoryOption {
  if (categoryName) {
    const fromModel = findCategoryByName(categories, categoryName);
    if (fromModel) {
      return fromModel;
    }
  }

  return findCategoryByName(categories, "Others") ?? categories[categories.length - 1];
}

function sourceLabel(source: EntrySource): string {
  switch (source) {
    case "notification":
      return "Notification";
    case "receipt":
      return "Receipt OCR";
    case "shortcut":
      return "iOS Shortcut";
    default:
      return "Manual";
  }
}

function openShortcutsApp(): void {
  window.location.href = "shortcuts://";
}

async function copyTextToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

interface SpendSlice {
  category: CategoryOption;
  total: number;
}

interface SharedPageProps {
  entries: ExpenseEntry[];
  categories: CategoryOption[];
  spendByCategory: SpendSlice[];
  thisMonthTotal: number;
  todayTotal: number;
  totalCaptured: number;
  maxCategoryTotal: number;
}

interface CapturePageProps {
  inputText: string;
  setInputText: (value: string) => void;
  isProcessing: boolean;
  ocrProgress: number;
  status: string;
  onAnalyzeInput: () => Promise<void>;
  onScanReceipts: (fileList: FileList | null) => Promise<void>;
}

interface CategoriesPageProps {
  categories: CategoryOption[];
  onAddCategory: (value: string) => void;
  status: string;
}

interface AutomationPageProps {
  shortcutTemplate: string;
  webhookTemplate: string;
  onCopy: (value: string, successMessage: string) => Promise<void>;
  status: string;
}

function DashboardPage(props: SharedPageProps) {
  const { thisMonthTotal, todayTotal, totalCaptured, spendByCategory, maxCategoryTotal, entries, categories } = props;

  return (
    <>
      <header className="hero-card">
        <p className="hero-kicker">PocketRinggit AI</p>
        <h1>Budget Autopilot</h1>
        <p className="hero-subtitle">Malaysia-focused finance tracking with AI extraction and iOS-friendly flows.</p>

        <div className="hero-metrics">
          <div className="metric-card">
            <span>This month</span>
            <strong>{moneyFormatter.format(thisMonthTotal)}</strong>
          </div>
          <div className="metric-card">
            <span>Today</span>
            <strong>{moneyFormatter.format(todayTotal)}</strong>
          </div>
          <div className="metric-card">
            <span>Total tracked</span>
            <strong>{moneyFormatter.format(totalCaptured)}</strong>
          </div>
        </div>
      </header>

      <section className="panel">
        <div className="panel-heading">
          <h2>Top Categories</h2>
          <span className="tag">This month</span>
        </div>
        {spendByCategory.length === 0 ? (
          <p className="empty-state">No transactions yet. Go to Capture to ingest your first expense.</p>
        ) : (
          <div className="bar-list">
            {spendByCategory.map(({ category, total }) => (
              <div key={category.id} className="bar-row">
                <div className="bar-label-row">
                  <span>{category.name}</span>
                  <strong>{moneyFormatter.format(total)}</strong>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.max((total / maxCategoryTotal) * 100, 8)}%`,
                      backgroundColor: category.color
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Latest Entries</h2>
          <span className="tag">{entries.length} tracked</span>
        </div>
        {entries.length === 0 ? (
          <p className="empty-state">Your transaction timeline appears in the Entries tab.</p>
        ) : (
          <ul className="entry-list">
            {entries.slice(0, 6).map((entry) => {
              const category = categories.find((item) => item.id === entry.categoryId);

              return (
                <li key={entry.id} className="entry-item">
                  <div className="entry-main">
                    <p className="entry-merchant">{entry.merchant}</p>
                    <p className="entry-description">{entry.description}</p>
                    <p className="entry-meta">
                      {dateFormatter.format(new Date(entry.timestamp))} | {sourceLabel(entry.source)}
                    </p>
                  </div>
                  <div className="entry-side">
                    <span className="entry-category" style={{ backgroundColor: category?.color ?? "#9fa6b4" }}>
                      {entry.categoryName}
                    </span>
                    <strong className="entry-amount">-{moneyFormatter.format(entry.amount)}</strong>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function CapturePage(props: CapturePageProps) {
  const { inputText, setInputText, isProcessing, ocrProgress, status, onAnalyzeInput, onScanReceipts } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="panel panel-full">
      <div className="panel-heading">
        <h2>Capture Transactions</h2>
        <span className="tag">Fast intake</span>
      </div>

      <textarea
        className="text-input"
        rows={8}
        value={inputText}
        onChange={(event) => setInputText(event.target.value)}
        placeholder="Paste Touch 'n Go notification text, receipt OCR text, or bank transaction message."
      />

      <div className="button-row">
        <button className="button button-primary" onClick={() => void onAnalyzeInput()} disabled={isProcessing}>
          Analyze Text
        </button>
        <button
          className="button button-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
        >
          Scan Screenshots / Receipts
        </button>
      </div>

      <input
        ref={fileInputRef}
        className="hidden-input"
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        onChange={(event) => {
          void onScanReceipts(event.currentTarget.files);
        }}
      />

      {isProcessing && <p className="status-line">Processing... {ocrProgress > 0 ? `${ocrProgress}%` : ""}</p>}
      <p className="status-line">{status}</p>
    </section>
  );
}

function EntriesPage({ entries, categories }: Pick<SharedPageProps, "entries" | "categories">) {
  return (
    <section className="panel panel-full">
      <div className="panel-heading">
        <h2>All Entries</h2>
        <span className="tag">{entries.length} total</span>
      </div>

      {entries.length === 0 ? (
        <p className="empty-state">No transactions yet. Capture from the Capture tab.</p>
      ) : (
        <ul className="entry-list">
          {entries.map((entry) => {
            const category = categories.find((item) => item.id === entry.categoryId);

            return (
              <li key={entry.id} className="entry-item">
                <div className="entry-main">
                  <p className="entry-merchant">{entry.merchant}</p>
                  <p className="entry-description">{entry.description}</p>
                  <p className="entry-meta">
                    {dateFormatter.format(new Date(entry.timestamp))} | {sourceLabel(entry.source)} | Confidence{" "}
                    {Math.round(entry.confidence * 100)}%
                  </p>
                </div>
                <div className="entry-side">
                  <span className="entry-category" style={{ backgroundColor: category?.color ?? "#9fa6b4" }}>
                    {entry.categoryName}
                  </span>
                  <strong className="entry-amount">-{moneyFormatter.format(entry.amount)}</strong>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CategoriesPage({ categories, onAddCategory, status }: CategoriesPageProps) {
  const [newCategoryName, setNewCategoryName] = useState("");

  return (
    <section className="panel panel-full">
      <div className="panel-heading">
        <h2>Categories</h2>
        <span className="tag">AI options</span>
      </div>

      <div className="category-grid">
        {categories.map((item) => (
          <span className="category-chip" key={item.id} style={{ backgroundColor: item.color }}>
            {item.name}
          </span>
        ))}
      </div>

      <form
        className="category-form"
        onSubmit={(event) => {
          event.preventDefault();
          onAddCategory(newCategoryName);
          setNewCategoryName("");
        }}
      >
        <input
          type="text"
          value={newCategoryName}
          onChange={(event) => setNewCategoryName(event.target.value)}
          placeholder="Add custom category (example: Pets)"
        />
        <button className="button button-secondary" type="submit">
          Add Category
        </button>
      </form>

      <p className="status-line">{status}</p>
    </section>
  );
}

function AutomationPage({ shortcutTemplate, webhookTemplate, onCopy, status }: AutomationPageProps) {
  const testText = "Payment - ZUS Coffee RM14.84 08/04/2026 19:47";
  const encodedTestText = encodeURIComponent(testText);
  const sampleCaptureLink = `${shortcutTemplate.replace("<notification_text>", encodedTestText)}`;

  return (
    <section className="panel panel-full panel-notes">
      <div className="panel-heading">
        <h2>iOS Shortcut Setup</h2>
        <span className="tag">Automation</span>
      </div>

      <div className="automation-grid">
        <div className="automation-card warning">
          <h3>Not possible in web-only</h3>
          <p>
            A webapp cannot directly read Touch 'n Go notifications or auto-install App Intents in Shortcuts. iOS
            sandboxing blocks that.
          </p>
        </div>

        <div className="automation-card success">
          <h3>Possible today</h3>
          <p>
            You can use Shortcuts to transform notification text or screenshot OCR into a URL payload, then pass it into
            this app with near-zero manual typing.
          </p>
        </div>
      </div>

      <ol className="steps-list">
        <li>Open Shortcuts and create a new shortcut named PocketRinggit Capture.</li>
        <li>Add action: Get text input (or Extract Text from Image if using screenshots).</li>
        <li>Add action: URL Encode the text.</li>
        <li>Add action: Open URLs using the capture template below.</li>
        <li>Optional: add Delete Photos if your flow creates screenshots.</li>
      </ol>

      <div className="button-row">
        <button className="button button-primary" onClick={openShortcutsApp}>
          Open Shortcuts App
        </button>
        <button className="button button-secondary" onClick={() => void onCopy(shortcutTemplate, "Capture template copied")}> 
          Copy Capture Template
        </button>
        <button className="button button-secondary" onClick={() => void onCopy(webhookTemplate, "Webhook template copied")}> 
          Copy Webhook Template
        </button>
      </div>

      <p>
        Capture URL template: <code>{shortcutTemplate}</code>
      </p>
      <p>
        Future webhook template: <code>{webhookTemplate}</code>
      </p>
      <p>
        Test link: <a href={sampleCaptureLink}>Run sample capture into this app</a>
      </p>
      <p className="status-line">{status}</p>
    </section>
  );
}

function Shell() {
  const [categories, setCategories] = useState<CategoryOption[]>(() => loadFromStorage(CATEGORY_STORAGE_KEY, defaultCategories));
  const [entries, setEntries] = useState<ExpenseEntry[]>(() => loadFromStorage(ENTRY_STORAGE_KEY, []));
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [status, setStatus] = useState("Ready. Open Capture to ingest transactions.");

  const location = useLocation();
  const navigate = useNavigate();
  const shortcutHandledRef = useRef<string | null>(null);

  useEffect(() => {
    saveToStorage(CATEGORY_STORAGE_KEY, categories);
  }, [categories]);

  useEffect(() => {
    saveToStorage(ENTRY_STORAGE_KEY, entries);
  }, [entries]);

  const addParsedEntries = useCallback(
    async (rawText: string, source: EntrySource): Promise<number> => {
      const parsed = await parseTransactions(rawText, categories, source);
      if (parsed.length === 0) {
        return 0;
      }

      const newEntries = parsed.map((item) => {
        const category = resolveCategory(categories, item.categoryName);

        return {
          id: makeEntryId(),
          source,
          merchant: item.merchant,
          description: item.description,
          amount: item.amount,
          currency: "MYR",
          categoryId: category.id,
          categoryName: category.name,
          timestamp: item.timestamp ?? new Date().toISOString(),
          rawText,
          confidence: item.confidence ?? 0.55
        } satisfies ExpenseEntry;
      });

      setEntries((previous) =>
        [...newEntries, ...previous].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 750)
      );

      return newEntries.length;
    },
    [categories]
  );

  const ingestText = useCallback(
    async (rawText: string, source: EntrySource): Promise<void> => {
      const normalized = rawText.trim();
      if (!normalized) {
        setStatus("Input is empty. Paste receipt text or notification details first.");
        return;
      }

      setIsProcessing(true);
      setStatus("Analyzing text with AI and fallback parser...");

      try {
        const count = await addParsedEntries(normalized, source);
        if (count === 0) {
          setStatus("No amount detected. Try a clearer screenshot or include the payment amount.");
        } else {
          setStatus(`Captured ${count} transaction${count > 1 ? "s" : ""}.`);
        }
      } catch {
        setStatus("Parsing failed unexpectedly. Please retry or check your API key.");
      } finally {
        setIsProcessing(false);
      }
    },
    [addParsedEntries]
  );

  useEffect(() => {
    if (location.pathname !== "/capture") {
      return;
    }

    const params = new URLSearchParams(location.search);
    const capture = params.get("capture");
    if (!capture) {
      return;
    }

    const fingerprint = `${location.pathname}${location.search}`;
    if (shortcutHandledRef.current === fingerprint) {
      return;
    }

    shortcutHandledRef.current = fingerprint;
    setInputText(capture);
    void ingestText(capture, "shortcut");

    params.delete("capture");
    navigate(
      {
        pathname: "/capture",
        search: params.toString() ? `?${params.toString()}` : ""
      },
      { replace: true }
    );
  }, [ingestText, location.pathname, location.search, navigate]);

  const onAnalyzeInput = async (): Promise<void> => {
    await ingestText(inputText, "manual");
  };

  const onScanReceipts = async (fileList: FileList | null): Promise<void> => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    setIsProcessing(true);
    setStatus(`Running OCR for ${fileList.length} image${fileList.length > 1 ? "s" : ""}...`);

    let captured = 0;

    try {
      for (let index = 0; index < fileList.length; index += 1) {
        const file = fileList.item(index);
        if (!file) {
          continue;
        }

        setStatus(`OCR ${index + 1}/${fileList.length}: ${file.name}`);

        const result = await recognize(file, "eng", {
          logger: (message) => {
            if (message.status === "recognizing text" && typeof message.progress === "number") {
              setOcrProgress(Math.round(message.progress * 100));
            }
          }
        });

        const text = result.data.text?.trim();
        if (!text) {
          continue;
        }

        captured += await addParsedEntries(text, "receipt");
      }

      if (captured === 0) {
        setStatus("OCR completed but no transactions were parsed.");
      } else {
        setStatus(`OCR completed. Captured ${captured} transaction${captured > 1 ? "s" : ""}.`);
      }
    } catch {
      setStatus("OCR failed. Please retry with clearer images.");
    } finally {
      setIsProcessing(false);
      setOcrProgress(0);
    }
  };

  const onAddCategory = (value: string): void => {
    const normalized = normalizeCategoryName(value);
    if (!normalized) {
      return;
    }

    if (findCategoryByName(categories, normalized)) {
      setStatus(`Category \"${normalized}\" already exists.`);
      return;
    }

    setCategories((previous) => [...previous, makeCustomCategory(normalized)]);
    setStatus(`Added custom category: ${normalized}`);
  };

  const onCopy = async (value: string, successMessage: string): Promise<void> => {
    const didCopy = await copyTextToClipboard(value);
    setStatus(didCopy ? successMessage : "Clipboard access denied by browser settings.");
  };

  const thisMonthTotal = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    return entries.reduce((total, entry) => {
      const date = new Date(entry.timestamp);
      if (date.getMonth() === month && date.getFullYear() === year) {
        return total + entry.amount;
      }

      return total;
    }, 0);
  }, [entries]);

  const todayTotal = useMemo(() => {
    const today = new Date().toDateString();

    return entries.reduce((total, entry) => {
      if (new Date(entry.timestamp).toDateString() === today) {
        return total + entry.amount;
      }

      return total;
    }, 0);
  }, [entries]);

  const spendByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const entry of entries) {
      totals.set(entry.categoryId, (totals.get(entry.categoryId) ?? 0) + entry.amount);
    }

    return categories
      .map((category) => ({ category, total: totals.get(category.id) ?? 0 }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [categories, entries]);

  const totalCaptured = useMemo(() => entries.reduce((sum, item) => sum + item.amount, 0), [entries]);
  const maxCategoryTotal = spendByCategory[0]?.total ?? 1;
  const shortcutTemplate = `${window.location.origin}${window.location.pathname}#/capture?capture=<notification_text>`;
  const webhookTemplate = `${window.location.origin}/api/shortcut-ingest`;

  const pageTitle = useMemo(() => {
    if (location.pathname === "/capture") {
      return "Capture";
    }

    if (location.pathname === "/entries") {
      return "Entries";
    }

    if (location.pathname === "/categories") {
      return "Categories";
    }

    if (location.pathname === "/automation") {
      return "Automation";
    }

    return "Dashboard";
  }, [location.pathname]);

  return (
    <div className="app-frame">
      <header className="app-header">
        <p className="app-brand">PocketRinggit AI</p>
        <h1>{pageTitle}</h1>
      </header>

      <main className="app-content">
        <Routes>
          <Route
            path="/"
            element={
              <DashboardPage
                categories={categories}
                entries={entries}
                spendByCategory={spendByCategory}
                thisMonthTotal={thisMonthTotal}
                todayTotal={todayTotal}
                totalCaptured={totalCaptured}
                maxCategoryTotal={maxCategoryTotal}
              />
            }
          />
          <Route
            path="/capture"
            element={
              <CapturePage
                inputText={inputText}
                setInputText={setInputText}
                isProcessing={isProcessing}
                ocrProgress={ocrProgress}
                status={status}
                onAnalyzeInput={onAnalyzeInput}
                onScanReceipts={onScanReceipts}
              />
            }
          />
          <Route path="/entries" element={<EntriesPage entries={entries} categories={categories} />} />
          <Route path="/categories" element={<CategoriesPage categories={categories} onAddCategory={onAddCategory} status={status} />} />
          <Route
            path="/automation"
            element={
              <AutomationPage
                shortcutTemplate={shortcutTemplate}
                webhookTemplate={webhookTemplate}
                onCopy={onCopy}
                status={status}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav className="app-nav" aria-label="Primary">
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Dashboard
        </NavLink>
        <NavLink to="/capture" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Capture
        </NavLink>
        <NavLink to="/entries" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Entries
        </NavLink>
        <NavLink to="/categories" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Categories
        </NavLink>
        <NavLink to="/automation" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          iOS
        </NavLink>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
