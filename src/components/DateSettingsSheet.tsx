import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import BottomSheet from "./BottomSheet";
import { Card, CardHeader, CardTitle, CardMeta, CardContent, CardSeparator, CardFootnote } from "./ui/card";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  monthStartDay: number;
  weekStartDay: number;
  onSave: (month: number, week: number) => void;
};

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const WEEK_DAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export default function DateSettingsSheet({ open, onClose, monthStartDay, weekStartDay, onSave }: Props) {
  const [draftMonth, setDraftMonth] = useState(monthStartDay);
  const [draftWeek, setDraftWeek] = useState(weekStartDay);

  useEffect(() => {
    if (open) {
      setDraftMonth(monthStartDay);
      setDraftWeek(weekStartDay);
    }
  }, [open, monthStartDay, weekStartDay]);

  const save = () => {
    onSave(draftMonth, draftWeek);
    onClose();
  };

  const dirty = draftMonth !== monthStartDay || draftWeek !== weekStartDay;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <h2 className="text-lg font-semibold mb-4">Date Settings</h2>

      <div className="space-y-4 max-h-[70vh] overflow-y-auto pb-1">
        {/* First Day of the Month */}
        <Card>
          <CardHeader>
            <CardTitle>First Day of the Month</CardTitle>
            <CardMeta>{ordinal(draftMonth)} of every month</CardMeta>
          </CardHeader>
          <CardSeparator />
          <CardContent className="pt-3">
            <div className="grid grid-cols-7 gap-1.5">
              {MONTH_DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDraftMonth(d)}
                  className={cn(
                    "aspect-square rounded-lg text-sm font-medium flex items-center justify-center transition-colors touch-manipulation",
                    draftMonth === d
                      ? "bg-[#4169e1] text-white"
                      : "bg-gray-50 text-gray-700 active:bg-gray-100",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </CardContent>
          <CardFootnote>
            Cycles that span short months end on the last day of that month.
          </CardFootnote>
        </Card>

        {/* First Day of the Week */}
        <Card>
          <CardHeader>
            <CardTitle>First Day of the Week</CardTitle>
            <CardMeta>{WEEK_DAYS[draftWeek]}</CardMeta>
          </CardHeader>
          <CardSeparator />
          <div className="py-1">
            {WEEK_DAYS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => setDraftWeek(i)}
                className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50 transition-colors touch-manipulation"
              >
                <span className="text-[15px] text-gray-800">{label}</span>
                {draftWeek === i && (
                  <span className="w-6 h-6 rounded-full bg-[#4169e1] text-white flex items-center justify-center">
                    <Check size={14} strokeWidth={3} />
                  </span>
                )}
              </button>
            ))}
          </div>
        </Card>
      </div>

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
