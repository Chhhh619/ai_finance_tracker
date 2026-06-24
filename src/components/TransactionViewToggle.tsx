import type { Transaction } from "../types";

type Props = {
  value: Transaction["direction"];
  onChange: (value: Transaction["direction"]) => void;
  className?: string;
};

const options: Array<{ value: Transaction["direction"]; label: string }> = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
];

export default function TransactionViewToggle({ value, onChange, className = "" }: Props) {
  return (
    <div className={`inline-flex w-full rounded-full bg-gray-100 p-1 ${className}`.trim()} role="tablist" aria-label="Transaction type filter">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`flex-1 h-9 rounded-full text-sm font-medium transition-all touch-manipulation ${active ? "bg-[#4169e1] text-white shadow-sm" : "text-gray-500 active:text-gray-700"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}