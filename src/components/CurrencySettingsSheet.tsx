import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import BottomSheet from "./BottomSheet";
import { Card, CardHeader, CardTitle, CardMeta, CardSeparator, CardFootnote } from "./ui/card";
import { Button } from "./ui/button";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";

type Props = {
  open: boolean;
  onClose: () => void;
  currency: string;
  hasTransactions: boolean;
  onSave: (code: string) => void;
};

export default function CurrencySettingsSheet({ open, onClose, currency, hasTransactions, onSave }: Props) {
  const [draft, setDraft] = useState(currency);

  useEffect(() => {
    if (open) setDraft(currency);
  }, [open, currency]);

  const dirty = draft !== currency;

  const save = () => {
    onSave(draft);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold mb-4">Account Currency</h2>

      <Card>
        <CardHeader>
          <CardTitle>Currency</CardTitle>
          <CardMeta>{draft}</CardMeta>
        </CardHeader>
        <CardSeparator />
        <div className="py-1 max-h-[50vh] overflow-y-auto">
          {SUPPORTED_CURRENCIES.map(({ code, name }) => (
            <button
              key={code}
              type="button"
              onClick={() => setDraft(code)}
              className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50 transition-colors touch-manipulation"
            >
              <span className="text-[15px] text-gray-800">
                <span className="font-medium">{code}</span>
                <span className="text-gray-400"> · {name}</span>
              </span>
              {draft === code && (
                <span className="w-6 h-6 rounded-full bg-[#4169e1] text-white flex items-center justify-center shrink-0">
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
            </button>
          ))}
        </div>
        {dirty && hasTransactions && (
          <CardFootnote>
            Past transactions stay in their original currency and are excluded from your totals.
          </CardFootnote>
        )}
      </Card>

      <div className="flex gap-2 mt-4">
        <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button size="lg" className="flex-1" onClick={save} disabled={!dirty}>
          Save
        </Button>
      </div>
    </BottomSheet>
  );
}
